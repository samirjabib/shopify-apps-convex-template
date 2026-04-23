import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const sessionFields = {
  sessionId: v.string(),
  shop: v.string(),
  state: v.string(),
  isOnline: v.boolean(),
  scope: v.optional(v.string()),
  expires: v.optional(v.number()),
  accessToken: v.string(),
  userId: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  email: v.optional(v.string()),
  accountOwner: v.boolean(),
  locale: v.optional(v.string()),
  collaborator: v.optional(v.boolean()),
  emailVerified: v.optional(v.boolean()),
  refreshToken: v.optional(v.string()),
  refreshTokenExpires: v.optional(v.number()),
};

const sessionDocValidator = v.object({
  _id: v.id("sessions"),
  _creationTime: v.number(),
  ...sessionFields,
});

export const storeInternal = internalMutation({
  args: { session: v.object(sessionFields) },
  returns: v.null(),
  handler: async (ctx, { session }) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session.sessionId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, session);
    } else {
      await ctx.db.insert("sessions", session);
    }
    return null;
  },
});

export const loadBySessionIdInternal = internalQuery({
  args: { sessionId: v.string() },
  returns: v.union(sessionDocValidator, v.null()),
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
  },
});

export const deleteBySessionIdInternal = internalMutation({
  args: { sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

export const deleteManyInternal = internalMutation({
  args: { sessionIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { sessionIds }) => {
    for (const id of sessionIds) {
      const row = await ctx.db
        .query("sessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", id))
        .unique();
      if (row) await ctx.db.delete(row._id);
    }
    return null;
  },
});

export const findByShopInternal = internalQuery({
  args: { shop: v.string() },
  returns: v.array(sessionDocValidator),
  handler: async (ctx, { shop }) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .collect();
  },
});

export const deleteByShopInternal = internalMutation({
  args: { shop: v.string() },
  returns: v.null(),
  handler: async (ctx, { shop }) => {
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return null;
  },
});

export const updateScopeInternal = internalMutation({
  args: { sessionId: v.string(), scope: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionId, scope }) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (row) await ctx.db.patch(row._id, { scope });
    return null;
  },
});

export const deleteExpiredInternal = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_expires", (q) => q.lt("expires", now))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return rows.length;
  },
});
