import { existsSync, readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference, OptionalRestArgs } from "convex/server";

// Fallback dotenv loader for runtimes that don't auto-load .env.local
// (e.g. Convex CLI subprocesses, plain `node` invocations). Vite/RR7 dev and
// production builds usually populate process.env already; this is defensive.
function loadEnvFileFallback(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (process.env[key]) continue;
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFileFallback(".env");
loadEnvFileFallback(".env.local");

const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
const deployKey = process.env.CONVEX_DEPLOY_KEY;

const setupHint =
  "Run `npm run setup` to bootstrap, or `npm run convex:key` to refresh from a local Convex backend.";

if (!url) {
  throw new Error(
    `CONVEX_URL not set. ${setupHint}\nIf you previously ran a cloud Convex deployment, see \`npm run convex:reset-to-local\`.`,
  );
}
if (!deployKey) {
  throw new Error(
    `CONVEX_DEPLOY_KEY not set. ${setupHint}\nFor cloud deployments, generate one at https://dashboard.convex.dev → Settings → Deploy Keys.`,
  );
}

const client = new ConvexHttpClient(url);
(client as unknown as { setAdminAuth(token: string): void }).setAdminAuth(
  deployKey,
);

type AnyQueryRef = FunctionReference<"query", "public" | "internal">;
type AnyMutationRef = FunctionReference<"mutation", "public" | "internal">;

export function runQuery<Ref extends AnyQueryRef>(
  ref: Ref,
  ...args: OptionalRestArgs<Ref>
): Promise<Ref["_returnType"]> {
  return client.query(
    ref as unknown as FunctionReference<"query", "public">,
    ...(args as OptionalRestArgs<FunctionReference<"query", "public">>),
  ) as Promise<Ref["_returnType"]>;
}

export function runMutation<Ref extends AnyMutationRef>(
  ref: Ref,
  ...args: OptionalRestArgs<Ref>
): Promise<Ref["_returnType"]> {
  return client.mutation(
    ref as unknown as FunctionReference<"mutation", "public">,
    ...(args as OptionalRestArgs<FunctionReference<"mutation", "public">>),
  ) as Promise<Ref["_returnType"]>;
}

export default client;
