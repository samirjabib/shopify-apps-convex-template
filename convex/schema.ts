// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
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
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_shop", ["shop"])
    .index("by_expires", ["expires"]),

  shops: defineTable({
    shop: v.string(),
    installedAt: v.number(),
    scope: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    uninstalledAt: v.optional(v.number()),
  }).index("by_shop", ["shop"]),

  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key", ["key"]),
});
