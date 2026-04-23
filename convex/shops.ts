// convex/shops.ts
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { requireShopifyAuth } from "./lib/auth";

export const get = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }): Promise<Doc<"shops"> | null> => {
    const { shop } = await requireShopifyAuth(sessionToken);
    await ctx.runMutation(internal.shops.checkRateLimitInternal, {
      key: `shops.get:${shop}`,
    });
    return await ctx.runQuery(internal.shops.getByShopInternal, { shop });
  },
});

export const getByShopInternal = internalQuery({
  args: { shop: v.string() },
  handler: async (ctx, { shop }) => {
    return await ctx.db
      .query("shops")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .unique();
  },
});

export const checkRateLimitInternal = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const now = Date.now();
    const WINDOW_MS = 60_000;
    const MAX_REQUESTS = 30;
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
  },
});

export const upsertInternal = internalMutation({
  args: {
    shop: v.string(),
    scope: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
  },
  handler: async (ctx, { shop, scope, ownerEmail }) => {
    const existing = await ctx.db
      .query("shops")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        scope: scope ?? existing.scope,
        ownerEmail: ownerEmail ?? existing.ownerEmail,
        uninstalledAt: undefined,
      });
    } else {
      await ctx.db.insert("shops", {
        shop,
        installedAt: Date.now(),
        scope,
        ownerEmail,
      });
    }
  },
});

export const markUninstalledInternal = internalMutation({
  args: { shop: v.string() },
  handler: async (ctx, { shop }) => {
    const existing = await ctx.db
      .query("shops")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { uninstalledAt: Date.now() });
    }
  },
});
