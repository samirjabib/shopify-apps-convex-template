import type { ActionFunctionArgs } from "react-router";
import { internal } from "../../convex/_generated/api";
import convex from "../convex.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    try {
      await convex.mutation(internal.sessions.handleUninstallInternal, {
        shop,
      });
    } catch (err) {
      console.error("handleUninstallInternal failed", err);
    }
  }

  return new Response();
};
