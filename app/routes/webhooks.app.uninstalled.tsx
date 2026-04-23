import type { ActionFunctionArgs } from "react-router";
import { internal } from "../../convex/_generated/api";
import { runMutation } from "../convex.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    try {
      await runMutation(internal.sessions.deleteByShopInternal, { shop });
    } catch (err) {
      console.error("deleteByShopInternal failed", err);
    }
    try {
      await runMutation(internal.shops.markUninstalledInternal, { shop });
    } catch (err) {
      console.error("markUninstalledInternal failed", err);
    }
  }

  return new Response();
};
