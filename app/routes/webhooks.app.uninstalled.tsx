// app/routes/webhooks.app.uninstalled.tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import convex from "../convex.server";
import { internal } from "../../convex/_generated/api";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    try {
      // @ts-expect-error
      await convex.mutation(internal.sessions.deleteByShopInternal, { shop });
    } catch (err) {
      console.error("deleteByShopInternal failed", err);
    }
  }

  return new Response();
};
