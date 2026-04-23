import type { ActionFunctionArgs } from "react-router";
import { internal } from "../../convex/_generated/api";
import { runMutation } from "../convex.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const current = payload.current as string[];
  if (session) {
    try {
      await runMutation(internal.sessions.updateScopeInternal, {
        sessionId: session.id,
        scope: current.toString(),
      });
    } catch (err) {
      console.error("updateScopeInternal failed", err);
    }
  }

  return new Response();
};
