// convex/sessions.ts
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { sessionFields } from "./schema";

const sessionDoc = v.object({
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
  returns: v.union(v.null(), sessionDoc),
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

const DELETE_CHUNK = 100;

export const deleteManyInternal = internalMutation({
  args: { sessionIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { sessionIds }) => {
    const ids = sessionIds.slice(0, DELETE_CHUNK);
    const rest = sessionIds.slice(DELETE_CHUNK);

    const rows = await Promise.all(
      ids.map((id) =>
        ctx.db
          .query("sessions")
          .withIndex("by_sessionId", (q) => q.eq("sessionId", id))
          .unique(),
      ),
    );
    for (const row of rows) {
      if (row) await ctx.db.delete(row._id);
    }

    if (rest.length > 0) {
      await ctx.scheduler.runAfter(0, internal.sessions.deleteManyInternal, {
        sessionIds: rest,
      });
    }
    return null;
  },
});

export const findByShopInternal = internalQuery({
  args: {
    shop: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(sessionDoc),
  handler: async (ctx, { shop, limit }) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .take(limit ?? 50);
  },
});

export const deleteByShopInternal = internalMutation({
  args: { shop: v.string() },
  returns: v.null(),
  handler: async (ctx, { shop }) => {
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .take(DELETE_CHUNK);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length === DELETE_CHUNK) {
      await ctx.scheduler.runAfter(0, internal.sessions.deleteByShopInternal, {
        shop,
      });
    }
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
    if (row && row.scope !== scope) await ctx.db.patch(row._id, { scope });
    return null;
  },
});

const PURGE_CHUNK = 200;

export const purgeExpiredInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now();
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_expires", (q) => q.lt("expires", cutoff))
      .take(PURGE_CHUNK);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length === PURGE_CHUNK) {
      await ctx.scheduler.runAfter(
        0,
        internal.sessions.purgeExpiredInternal,
        {},
      );
    }
    return null;
  },
});

// Webhook entry — combines delete-sessions-by-shop + mark-uninstalled
// atomically so OAuth-path callers only need one round trip.
export const handleUninstallInternal = internalMutation({
  args: { shop: v.string() },
  returns: v.null(),
  handler: async (ctx, { shop }) => {
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .take(DELETE_CHUNK);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length === DELETE_CHUNK) {
      await ctx.scheduler.runAfter(0, internal.sessions.deleteByShopInternal, {
        shop,
      });
    }

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
