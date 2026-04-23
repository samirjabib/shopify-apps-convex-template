// convex/shops.ts
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireShopifyAuth } from "./lib/auth";

export const get = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { shop } = await requireShopifyAuth(sessionToken);
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
