import { ConvexError, v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

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

export const checkRateLimitInternal = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    await checkRateLimit(ctx, key);
    return null;
  },
});

export const sweepRateLimitsInternal = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - WINDOW_MS * 2;
    const stale = await ctx.db
      .query("rateLimits")
      .filter((q) => q.lt(q.field("windowStart"), cutoff))
      .collect();
    for (const row of stale) await ctx.db.delete(row._id);
    return stale.length;
  },
});
