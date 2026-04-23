import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { requireShopifyAuth } from "./lib/auth";

const shopDocValidator = v.object({
  _id: v.id("shops"),
  _creationTime: v.number(),
  shop: v.string(),
  installedAt: v.number(),
  scope: v.optional(v.string()),
  ownerEmail: v.optional(v.string()),
  uninstalledAt: v.optional(v.number()),
});

export const get = action({
  args: { sessionToken: v.string() },
  returns: v.union(shopDocValidator, v.null()),
  handler: async (ctx, { sessionToken }): Promise<Doc<"shops"> | null> => {
    const { shop } = await requireShopifyAuth(sessionToken);
    await ctx.runMutation(internal.lib.rateLimit.checkRateLimitInternal, {
      key: `shops.get:${shop}`,
    });
    return await ctx.runQuery(internal.shops.getByShopInternal, { shop });
  },
});

export const getByShopInternal = internalQuery({
  args: { shop: v.string() },
  returns: v.union(shopDocValidator, v.null()),
  handler: async (ctx, { shop }) => {
    return await ctx.db
      .query("shops")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .unique();
  },
});

export const upsertInternal = internalMutation({
  args: {
    shop: v.string(),
    scope: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
  },
  returns: v.null(),
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
    return null;
  },
});

export const markUninstalledInternal = internalMutation({
  args: { shop: v.string() },
  returns: v.null(),
  handler: async (ctx, { shop }) => {
    const existing = await ctx.db
      .query("shops")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { uninstalledAt: Date.now() });
    }
    return null;
  },
});
