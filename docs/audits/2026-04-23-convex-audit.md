# Convex Audit — Shopify Template Boilerplate

- **Date:** 2026-04-23
- **Branch:** `feat/replace-prisma-with-convex`
- **Stack:** Shopify React Router v7 + Convex (`convex@^1.36.0`)
- **Backend reviewed:** local (`anonymous-stuttgart`, `http://127.0.0.1:3210`)
- **MCP signals:** `mcp__convex__insights` / `tables` / `functionSpec` rejected local backend with `Not Authorized` — runtime perf signals unavailable. Audit is code-only. Re-run against a cloud preview/prod deployment to capture OCC + read-amp telemetry.

Severity scale: **Critical** = security/correctness/data loss · **High** = perf/scale wall or fragile prod path · **Medium** = idiom drift, future foot-gun · **Low** = polish.

---

## Critical

### C1 — JWT verifier accepts tokens without `exp` / `nbf` (auth bypass)
- **File:** `convex/lib/auth.ts:53-54`
- **Bug:** `if (payload.exp < now)` — when `exp` is `undefined`, `undefined < now === false`, so the check passes. Same for `payload.nbf > now`. A token whose payload omits `exp` is accepted forever. Same for missing `nbf` (less severe).
- **Fix:**
  ```ts
  if (typeof payload.exp !== "number" || payload.exp < now) {
    throw new ConvexError("Token expired");
  }
  if (typeof payload.nbf === "number" && payload.nbf > now) {
    throw new ConvexError("Token not yet valid");
  }
  ```

### C2 — JWT header `alg` not validated (algorithm confusion)
- **File:** `convex/lib/auth.ts:33-46`
- **Bug:** Verifier never decodes the header and never checks `alg === "HS256"`. Today HMAC always recomputed, so `alg: "none"` would still fail signature compare — but if the verifier is ever extended (e.g. RS256 fallback), this becomes an algorithm-confusion vector. Defense in depth is cheap.
- **Fix:** Decode header, assert `header.typ === "JWT"` and `header.alg === "HS256"` before HMAC compare.

### C3 — `dest` host not validated against `*.myshopify.com`
- **File:** `convex/lib/auth.ts:62`
- **Bug:** `shop = new URL(payload.dest).hostname` — attacker-supplied (but signed) token from a compromised Shopify partner key could carry `dest=https://evil.example/admin`. Compounds with C2/C5. Shopify session tokens always issue against `*.myshopify.com`; enforce it.
- **Fix:**
  ```ts
  const shop = new URL(payload.dest).hostname;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new ConvexError("Invalid shop host");
  }
  ```
  Also assert `new URL(payload.iss).hostname === shop` (currently only suffix `/admin` is checked).

### C4 — `CONVEX_DEPLOY_KEY` overloaded as runtime admin key (prod break + privilege bleed)
- **Files:** `app/convex.server.ts:4-14`, `scripts/convex-key.js`, `.env`, `app/shopify.server.ts:18`, `app/lib/session-storage.server.ts:25-82`
- **Bug:**
  - `CONVEX_DEPLOY_KEY` is the CLI deploy key (used by `npx convex deploy`). Passing it to `setAdminAuth` happens to work locally because the script writes the **local admin key** into `CONVEX_DEPLOY_KEY`. In Convex Cloud, the project deploy key from the dashboard is **not** the deployment admin key — runtime calls will fail or silently fall back to "no auth," which means every `internal.*` call from the React Router server will be rejected with `Could not find public function`.
  - `setAdminAuth` is undocumented/internal API surface (hence the `as unknown as { setAdminAuth }` cast). It elevates the entire HTTP client to admin privileges — any compromise of the React Router server === full Convex DB compromise.
- **Fix (recommended path):** stop calling `internal.*` from the React Router server.
  1. Expose **public** mutations/queries (`mutation`, `query`) for the SessionStorage adapter and webhook handlers, gated by Convex Auth + Shopify-issued JWT.
  2. Configure `convex/auth.config.ts` with Shopify as a custom JWT provider (issuer = `https://{shop}/admin`, audience = `SHOPIFY_API_KEY`, jwks via shared secret).
  3. From the server: `client.setAuth(shopifySessionToken)` per request instead of `setAdminAuth` once at boot.
  4. Drop `CONVEX_DEPLOY_KEY` from app runtime; keep it CI-only.
- **Fix (band-aid if you must keep current shape):** rename env var to `CONVEX_ADMIN_KEY`, document it as "deployment admin key (Settings → Deploy keys → Admin)", and never reuse the deploy key.

---

## High

### H1 — Single-doc rate limiter = OCC contention + unbounded growth
- **Files:** `convex/shops.ts:29-52`, `convex/lib/rateLimit.ts`
- **Bug:** `rateLimits` keyed by `shops.get:${shop}` → one row per shop. Every `shops.get` call patches `count` inside an `internalMutation`. Concurrent calls from the same shop (every page load triggers `useEffect` → `getShop`, plus a 30s `idToken` refresh on the client) serialize on that row → OCC retries under load. No row is ever deleted → table grows linearly with installed shops.
- **Fix:**
  - Replace with the official `@convex-dev/rate-limiter` component (sliding window, sharded, no hot doc):
    ```bash
    npm i @convex-dev/rate-limiter
    ```
    ```ts
    // convex/convex.config.ts
    import { defineApp } from "convex/server";
    import rateLimiter from "@convex-dev/rate-limiter/convex.config";
    const app = defineApp();
    app.use(rateLimiter);
    export default app;
    ```
    ```ts
    // convex/shops.ts
    import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
    import { components } from "./_generated/api";
    const rl = new RateLimiter(components.rateLimiter, {
      shopsGet: { kind: "fixed window", rate: 30, period: MINUTE },
    });
    // inside action handler:
    await rl.limit(ctx, "shopsGet", { key: shop, throws: true });
    ```
  - Drop the `rateLimits` table + `convex/lib/rateLimit.ts` once migrated.

### H2 — `findByShopInternal` does unbounded `.collect()`
- **File:** `convex/sessions.ts:74-82`
- **Bug:** `findSessionsByShop` (Shopify SessionStorage contract) is called by `unauthenticated.admin(shop)` and during scope updates. `.collect()` returns every session ever stored for a shop. Online sessions accumulate one-per-user-per-browser; with no cleanup, this is a bytes-read time bomb on a single index seek.
- **Fix:**
  - Filter expired in storage:
    ```ts
    return await ctx.db
      .query("sessions")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .take(50);
    ```
  - Add a daily cron to purge `expires < now()` rows:
    ```ts
    // convex/crons.ts
    import { cronJobs } from "convex/server";
    import { internal } from "./_generated/api";
    const crons = cronJobs();
    crons.daily("purge expired sessions", { hourUTC: 3, minuteUTC: 0 },
      internal.sessions.purgeExpiredInternal);
    export default crons;
    ```

### H3 — `deleteManyInternal` does N indexed lookups in one transaction
- **File:** `convex/sessions.ts:61-72`
- **Bug:** Loops `for (const id of sessionIds) ... withIndex(...).unique()` then `delete`. With Shopify's `deleteSessions(ids)` called on uninstall/scope-change, ids list can be large → hits Convex per-mutation read/write doc cap (~4096 docs, 8MB) and lengthens transaction window → OCC conflicts with concurrent `storeSession`.
- **Fix:** scan once by index range, build a `Set<sessionId>`, delete matches:
  ```ts
  const wanted = new Set(sessionIds);
  // If all ids belong to one shop, prefer by_shop scan; otherwise iterate
  // by_sessionId equality on each id is fine for small N; chunk for large N:
  for (const chunk of chunks(sessionIds, 100)) {
    await Promise.all(chunk.map(async (id) => {
      const row = await ctx.db.query("sessions")
        .withIndex("by_sessionId", q => q.eq("sessionId", id)).unique();
      if (row) await ctx.db.delete(row._id);
    }));
  }
  ```
  For >500 ids, schedule a self-recursive `internalMutation` cursor.

### H4 — Adapter swallows errors, returns `false` → silent auth loops
- **File:** `app/lib/session-storage.server.ts:22-87`
- **Bug:** Every method `try { ... } catch { console.error; return false }`. Shopify's auth middleware interprets `storeSession → false` as "session not persisted" and triggers a re-OAuth roundtrip. A transient Convex 500 → infinite OAuth loop with no surfaced error. Same for `loadSession` → `undefined` triggers re-auth.
- **Fix:**
  - Distinguish transient (network/5xx → throw or retry) from logical (not found → undefined). Convex SDK already throws on network failure; let `storeSession` throw upstream so Shopify surfaces the 500 instead of looping. At minimum, log with `level: "error"` plus the deployment URL + function name + Shopify shop, and add a circuit breaker.
  - If you keep the `return false` contract, emit an alert (Sentry/console.error with structured fields) + a `shopify-error: convex-down` response header so ops sees it.

### H5 — `setAdminAuth` cast ⇒ entire React Router server runs as Convex admin
- **File:** `app/convex.server.ts:10-14`
- **Bug:** Same root cause as **C4**, separate impact: even if you rotate the value, a single SSR-side bug (path traversal, prototype pollution, RR loader vulnerability) lets an attacker run arbitrary mutations on any table — there is no per-request privilege scoping.
- **Fix:** see C4 — move to per-request `setAuth(jwt)` and public functions gated by `ctx.auth`.

### H6 — `afterAuth` upsert is fire-and-forget with no retry
- **File:** `app/shopify.server.ts:27-36`
- **Bug:** Detached promise (`convex.mutation(...).catch(console.error)`) on the OAuth completion path. If Convex is briefly down during install, `shops` row never lands → `app._index` shows "No shop record yet" forever and there's no scheduled retry. Recent commit `a4acc5f` made this fire-and-forget intentionally to unblock OAuth latency, but lost durability.
- **Fix:** keep OAuth fast, but enqueue durable retry:
  - Schedule a server-side retry queue (BullMQ / Cloudflare Queues / `convex.scheduler.runAfter`).
  - Or call a Convex `httpAction` that internally `runAfter(0, internal.shops.upsertInternal, ...)` so Convex's scheduler owns the retry.

---

## Medium

### M1 — `ConvexHttpClient` is correct for SSR but `convex/browser` import is misleading
- **File:** `app/convex.server.ts:2`
- **Note:** `import { ConvexHttpClient } from "convex/browser"` works in Node but the module name implies browser-only. Use the documented `import { ConvexHttpClient } from "convex/browser"` (current code) **with** an explicit comment, or migrate to `client.action()`/`client.query()` via the typed `Functions` API exposed by codegen. Lint/grep teams will trip on this.
- **Fix:** add a one-line comment; long-term, prefer Convex Components or `httpAction` for cross-service calls.

### M2 — `@ts-expect-error` ×6 on internal function calls
- **Files:** `app/lib/session-storage.server.ts:24,38,51,64,78`, `app/shopify.server.ts:30`, `app/routes/webhooks.app.uninstalled.tsx:13,18`, `app/routes/webhooks.app.scopes_update.tsx:14`
- **Bug:** Each `internal.*` reference is silenced. If Convex codegen ever changes the type of `FunctionReference<"internal">`, all six suppressions decay to silence real bugs.
- **Fix:** wrap once in a typed adapter:
  ```ts
  // app/convex.server.ts
  import type { FunctionReference } from "convex/server";
  type AnyMutation = FunctionReference<"mutation", any, any, any>;
  type AnyQuery = FunctionReference<"query", any, any, any>;
  type AdminClient = {
    mutation<R = unknown>(ref: AnyMutation, args: any): Promise<R>;
    query<R = unknown>(ref: AnyQuery, args: any): Promise<R>;
  };
  export default client as unknown as AdminClient;
  ```
  Removes all six `@ts-expect-error` lines.
  Better: migrate to public functions per C4 → no cast needed at all.

### M3 — `storeInternal` patches all fields every call, no diff
- **File:** `convex/sessions.ts:25-38`
- **Bug:** `ctx.db.patch(existing._id, session)` rewrites every field. Convex auto-no-ops unchanged values, but the patch still extends the transaction's write set and fires reactive invalidations (none today, but if you ever add a `useQuery("sessions/byShop")`, every heartbeat invalidates it).
- **Fix:** diff before patch; for hot fields (`expires`, `accessToken`), split into a `sessionsAuth` digest table (see hot-path rule §4). For now, OK at boilerplate scale.

### M4 — No TTL/cleanup on `rateLimits` or expired `sessions`
- **Files:** `convex/schema.ts:36-40`, `convex/sessions.ts`
- **Fix:** `convex/crons.ts` — purge `rateLimits` where `windowStart < Date.now() - 5*MINUTE_MS` and `sessions` where `expires < Date.now()`.

### M5 — `useAction` for `shops.get` blocks the reactive model
- **File:** `app/routes/app._index.tsx:148-158`
- **Bug:** `useAction` is one-shot, hence the `useState`+`useEffect` dance with the `// useAction doesn't support "skip"` comment. The whole reason to use Convex is reactive `useQuery`. Today this is needed because the action carries the JWT verify; with C4 fixed (Convex Auth + setAuth), `shops.get` becomes a reactive `query`:
  ```ts
  const shopData = useQuery(api.shops.get, sessionToken ? {} : "skip");
  ```
- **Fix:** ride the C4 migration; eliminate the bespoke state + interval token refresh.

### M6 — `ConvexProvider` mounted at root but only one consumer
- **File:** `app/root.tsx:22`
- **Note:** Wraps `/auth/*`, webhook routes, etc. — they don't use Convex hooks. No correctness issue, but moves the WS connection startup to every route. Consider mounting in `app.tsx` (the embedded-admin layout route) only.

### M7 — Missing `convex-helpers` adoption
- **Note:** The codebase rolls its own field-list duplication (`sessionFields` in `sessions.ts:5-23` vs the schema `defineTable` shape in `schema.ts:6-23`). Two sources of truth → drift risk.
- **Fix:** use `convex-helpers/validators`:
  ```ts
  import { partial } from "convex-helpers/validators";
  import schema from "./schema";
  const sessionFields = schema.tables.sessions.validator.fields;
  ```
  Single source of truth.

### M8 — No `returns` validator on any function
- **Files:** all of `convex/sessions.ts`, `convex/shops.ts`
- **Bug:** Convex 1.17+ supports `returns:` validator; without it, runtime drift between handler return and client expectation goes undetected. `shops.get` declares `Promise<Doc<"shops"> | null>` in TS but no Convex-level guard.
- **Fix:**
  ```ts
  export const get = action({
    args: { sessionToken: v.string() },
    returns: v.union(v.null(), v.object({ /* shop fields */ })),
    handler: ...
  });
  ```

### M9 — `shops.get` does query+mutation in an action — read isolation lost
- **File:** `convex/shops.ts:8-17`
- **Bug:** Action runs `runMutation(checkRateLimit)` then `runQuery(getByShop)` — two separate transactions. Between them, another `upsertInternal` could change the shop row. Not catastrophic for read-mostly data, but the rate-limit decision and the read aren't atomic with each other or with concurrent installs.
- **Fix:** when migrating to `@convex-dev/rate-limiter` (H1), call `rl.limit()` + `ctx.db.query(...)` inside a single mutation/query — collapse the action.

---

## Low

### L1 — Schema duplication between `convex/schema.ts` and `convex/sessions.ts`
- **Files:** `convex/schema.ts:6-26`, `convex/sessions.ts:5-23`
- See M7 fix (use `schema.tables.sessions.validator.fields`).

### L2 — `_creationTime` not used in any index — fine, but `installedAt` is redundant on `shops`
- **File:** `convex/schema.ts:28-34`
- **Note:** Convex auto-stamps `_creationTime` per row. `shops.installedAt: v.number()` duplicates it. Drop and read `_creationTime` instead unless you need to backdate.

### L3 — `sessions.by_sessionId` index not strictly required
- **File:** `convex/schema.ts:25`
- **Note:** Could store `sessionId` as the document `_id`-keyed table by switching to a custom id, but the index is fine and makes lookups O(log n). Keep.

### L4 — `convex.client.ts` throws synchronously at module eval
- **File:** `app/convex.client.ts:5`
- **Note:** If `VITE_CONVEX_URL` is missing in the browser bundle, the whole client-side React tree fails to mount with a cryptic `throw`. Convert to a soft error + visible message during dev.

### L5 — Webhook handlers do two sequential network calls
- **File:** `app/routes/webhooks.app.uninstalled.tsx:11-23`
- **Note:** `deleteByShopInternal` then `markUninstalledInternal` — could be one Convex mutation that does both, halving round-trip + atomic.
- **Fix:** add `internal.shops.handleUninstallInternal({ shop })` that does both in one transaction.

### L6 — `.env.example` doesn't document the `CONVEX_DEPLOY_KEY` semantic confusion
- **File:** `.env.example:7-9`
- **Fix:** add a comment noting deploy key vs admin key (after C4 fix, this becomes obsolete).

---

## Summary by Severity

| Sev | Count | Theme |
|---|---|---|
| Critical | 4 | JWT verifier holes (C1–C3) + admin-key abuse (C4) |
| High | 6 | Rate-limit OCC (H1), unbounded reads (H2–H3), error swallowing (H4), admin scope (H5), durability (H6) |
| Medium | 9 | Reactivity loss (M5), helper adoption (M7–M8), TTL (M4), schema drift (M3, M7) |
| Low | 6 | Polish + docs |

---

## Recommended Fix Order

1. **C1 → C2 → C3** (one PR, ~30 min) — close the auth holes immediately.
2. **C4 + H5 + M5 + M2** (one larger PR) — install Convex Auth, drop `setAdminAuth`, convert SessionStorage adapter + `shops.get` to public functions, delete six `@ts-expect-error`s.
3. **H1** — install `@convex-dev/rate-limiter` component, drop `rateLimits` table.
4. **H2 + H3 + M4** — pagination + cron purges in one PR.
5. **H4 + H6** — error surfacing + durable install retry.
6. **M-series cleanup** — schema dedup (M7), `returns` validators (M8), provider scoping (M6).
7. **L-series** — when touching adjacent code.

## What Was *Not* Found

- No N+1 in route loaders (the only Convex consumer is `app._index`, single call).
- No write contention beyond H1 (low traffic, single-tenant per shop).
- No subscription-cost issues — server uses `ConvexHttpClient` (correct for SSR), client uses `useAction` (no long-lived subscriptions yet).
- No transaction-budget issues at current scale (relevant once H2/H3 hit prod traffic).
- Indexes match query patterns; no full-table scans hidden behind `.filter()`.

## Re-run With Cloud Deployment

After deploying to a Convex Cloud preview, re-run:
```bash
npx convex insights --details --preview-name <name>
```
plus this audit's `mcp__convex__insights` against the cloud deployment selector. The local backend can't surface OCC/read-amp telemetry.
