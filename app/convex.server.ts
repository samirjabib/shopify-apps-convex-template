// app/convex.server.ts
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
const deployKey = process.env.CONVEX_DEPLOY_KEY;

if (!url) throw new Error("CONVEX_URL not set");
if (!deployKey) throw new Error("CONVEX_DEPLOY_KEY not set");

const client = new ConvexHttpClient(url);
// setAdminAuth exists at runtime but is not exposed in the TypeScript types
(client as unknown as { setAdminAuth(token: string): void }).setAdminAuth(
  deployKey,
);

export default client;
