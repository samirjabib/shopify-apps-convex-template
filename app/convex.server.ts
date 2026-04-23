// app/convex.server.ts
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
const deployKey = process.env.CONVEX_DEPLOY_KEY ?? "Convex is cool";

if (!url) throw new Error("CONVEX_URL not set");

const client = new ConvexHttpClient(url);
// setAdminAuth exists at runtime but is not exposed in the TypeScript types
(client as unknown as { setAdminAuth(token: string): void }).setAdminAuth(deployKey);

export default client;
