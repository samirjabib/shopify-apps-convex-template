// app/routes/webhooks.app.scopes_update.tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import convex from "../convex.server";
import { internal } from "../../convex/_generated/api";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const current = payload.current as string[];
  if (session) {
    try {
      // @ts-expect-error
      await convex.mutation(internal.sessions.updateScopeInternal, {
        sessionId: session.id,
        scope: current.toString(),
      });
    } catch (err) {
      console.error("updateScopeInternal failed", err);
    }
  }

  return new Response();
};
