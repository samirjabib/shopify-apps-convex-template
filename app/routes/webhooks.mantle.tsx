// Mantle webhook receiver. Mantle posts subscription events here so we
// can keep `shops.plan` in Convex in sync with billing state.
//
// Security: verify the webhook signature header against MANTLE_API_KEY
// before trusting the payload. See https://heymantle.com/docs/webhooks
import type { ActionFunctionArgs } from "react-router";
import { internal } from "../../convex/_generated/api";
import { runMutation } from "../convex.server";

interface MantleWebhookEvent {
  type: string;
  data: {
    customer?: {
      myshopifyDomain?: string;
      platformId?: string;
    };
    subscription?: {
      plan?: { name?: string };
      status?: string;
    };
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (process.env.BILLING_PROVIDER !== "mantle") {
    return new Response("Billing disabled", { status: 200 });
  }

  // TODO: verify Mantle webhook signature once docs/keys confirmed.
  // const sig = request.headers.get("x-mantle-signature");
  // if (!verifyMantleSignature(sig, body, process.env.MANTLE_API_KEY)) {
  //   return new Response("Invalid signature", { status: 401 });
  // }

  let event: MantleWebhookEvent;
  try {
    event = (await request.json()) as MantleWebhookEvent;
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  const shop = event.data?.customer?.myshopifyDomain;
  if (!shop) return new Response("Missing shop", { status: 400 });

  console.log(
    `Mantle webhook ${event.type} for shop=${shop} plan=${event.data?.subscription?.plan?.name}`,
  );

  try {
    await runMutation(internal.shops.setBillingInternal, {
      shop,
      plan: event.data?.subscription?.plan?.name,
    });
  } catch (err) {
    console.error("Mantle webhook setBillingInternal failed", err);
    return new Response("Persist failed", { status: 500 });
  }

  return new Response();
};
