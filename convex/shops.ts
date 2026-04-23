// convex/shops.ts
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { requireShopifyAuth } from "./lib/auth";
import { shopFields } from "./schema";

const rl = new RateLimiter(components.rateLimiter, {
  shopsGet: { kind: "fixed window", rate: 30, period: MINUTE },
});

const shopDoc = v.object({
  _id: v.id("shops"),
  _creationTime: v.number(),
  ...shopFields,
});

export const get = action({
  args: { sessionToken: v.string() },
  returns: v.union(v.null(), shopDoc),
  handler: async (ctx, { sessionToken }): Promise<Doc<"shops"> | null> => {
    const { shop } = await requireShopifyAuth(sessionToken);
    await rl.limit(ctx, "shopsGet", { key: shop, throws: true });
    return await ctx.runQuery(internal.shops.getByShopInternal, { shop });
  },
});

export const getByShopInternal = internalQuery({
  args: { shop: v.string() },
  returns: v.union(v.null(), shopDoc),
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
      await ctx.db.insert("shops", { shop, scope, ownerEmail });
    }
    return null;
  },
});

// Durable install handler: quick mutation that schedules the actual upsert.
// Guarantees enqueue atomically so the caller can fire-and-await safely;
// scheduler handles retries on system failures.
export const enqueueInstallInternal = internalMutation({
  args: {
    shop: v.string(),
    scope: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.shops.upsertInternal, args);
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
