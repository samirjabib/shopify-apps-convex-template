import type { ActionFunctionArgs } from "react-router";
import { internal } from "../../convex/_generated/api";
import convex from "../convex.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    try {
      await convex.mutation(internal.sessions.deleteByShopInternal, { shop });
    } catch (err) {
      console.error("deleteByShopInternal failed", err);
    }
    try {
      // @ts-expect-error ConvexHttpClient types don't accept internal FunctionReferences
      await convex.mutation(internal.shops.markUninstalledInternal, { shop });
    } catch (err) {
      console.error("markUninstalledInternal failed", err);
    }
  }

  return new Response();
};
