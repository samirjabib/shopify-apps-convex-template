// app/convex.server.ts
//
// ConvexHttpClient for server-side calls. `convex/browser` is the correct
// module path — the name is historical, it works in Node/edge runtimes.
//
// CONVEX_ADMIN_KEY must be a *deployment admin key* from the Convex
// dashboard (Settings → Deploy keys → Admin). Do NOT reuse the project
// deploy key used by `npx convex deploy` — they are distinct. On local
// dev the key is auto-populated by `scripts/convex-key.js` from the
// anonymous backend config.
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";

const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
const adminKey = process.env.CONVEX_ADMIN_KEY ?? process.env.CONVEX_DEPLOY_KEY;

if (!url) throw new Error("CONVEX_URL not set");
if (!adminKey) throw new Error("CONVEX_ADMIN_KEY not set");

const client = new ConvexHttpClient(url);
// setAdminAuth exists at runtime but is not exposed in the TypeScript types.
(client as unknown as { setAdminAuth(token: string): void }).setAdminAuth(
  adminKey,
);

// Typed wrapper that accepts internal FunctionReferences. ConvexHttpClient's
// public types only allow `"public"` refs; at runtime admin-auth permits
// internal refs. This cast replaces six @ts-expect-error lines across the
// adapter and route handlers.
//
// Args are typed as Record<string, unknown> rather than the FunctionReference
// generic chain because the Convex codegen reference types are recursive and
// recreating them here would defeat the purpose of the wrapper.
type AnyArgs = Record<string, unknown>;
type AnyMutation = FunctionReference<
  "mutation",
  "public" | "internal",
  AnyArgs,
  unknown
>;
type AnyQuery = FunctionReference<
  "query",
  "public" | "internal",
  AnyArgs,
  unknown
>;
type AnyAction = FunctionReference<
  "action",
  "public" | "internal",
  AnyArgs,
  unknown
>;

export type AdminConvexClient = {
  mutation<R = unknown>(ref: AnyMutation, args?: AnyArgs): Promise<R>;
  query<R = unknown>(ref: AnyQuery, args?: AnyArgs): Promise<R>;
  action<R = unknown>(ref: AnyAction, args?: AnyArgs): Promise<R>;
};

export default client as unknown as AdminConvexClient;
