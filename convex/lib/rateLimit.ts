// convex/lib/rateLimit.ts
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30; // per window per key

export async function checkRateLimit(
  ctx: MutationCtx,
  key: string,
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!existing) {
    await ctx.db.insert("rateLimits", { key, count: 1, windowStart: now });
    return;
  }

  if (now - existing.windowStart > WINDOW_MS) {
    await ctx.db.patch(existing._id, { count: 1, windowStart: now });
    return;
  }

  if (existing.count >= MAX_REQUESTS) {
    throw new ConvexError("Rate limit exceeded");
  }

  await ctx.db.patch(existing._id, { count: existing.count + 1 });
}
