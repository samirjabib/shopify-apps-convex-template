import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference, OptionalRestArgs } from "convex/server";

const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
const deployKey = process.env.CONVEX_DEPLOY_KEY;

if (!url) throw new Error("CONVEX_URL not set");
if (!deployKey) throw new Error("CONVEX_DEPLOY_KEY not set");

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
