import type { ActionFunctionArgs } from "react-router";
import { internal } from "../../convex/_generated/api";
import { runMutation } from "../convex.server";
import { authenticate } from "../shopify.server";

// GDPR: 48 hours after app uninstall, Shopify sends shop/redact.
// Permanently delete all shop data we hold. Required by Shopify App Store.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} for shop=${shop}`);

  try {
    await runMutation(internal.sessions.deleteByShopInternal, { shop });
  } catch (err) {
    console.error("shop/redact: deleteByShopInternal failed", err);
  }
  try {
    await runMutation(internal.shops.purgeByShopInternal, { shop });
  } catch (err) {
    console.error("shop/redact: purgeByShopInternal failed", err);
  }

  return new Response();
};
