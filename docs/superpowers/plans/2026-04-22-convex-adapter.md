# Convex Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Prisma + SQLite with Convex Cloud as the session store and app data backend for the Shopify React Router v7 boilerplate, end-to-end: schema, internal session functions, JWT-gated public functions, RR7 server + client wiring, webhook updates, and manual verification. Ships alongside a modernized toolchain (Biome, Renovate, GitHub Actions CI) installed as pre-Convex baseline.

**Architecture:** Dual-path Convex integration. Server path: `ConvexHttpClient` singleton with admin deploy key calls `internal.*` functions (session CRUD + webhook-driven mutations). Client path: `ConvexReactClient` with `useQuery` calls public functions that verify Shopify App Bridge JWT (HS256, `SHOPIFY_API_SECRET`) and derive `shop` from `dest` claim — never from caller args. Prisma fully removed; no dual system.

**Tech Stack:** React Router v7, `@shopify/shopify-app-react-router`, `@shopify/app-bridge-react`, Convex (`convex`, `ConvexHttpClient`, `ConvexReactClient`), Web Crypto API (HMAC-SHA256), TypeScript strict, Biome 2.x (formatter + linter), Renovate (automated dep updates), GitHub Actions CI.

**Pre-existing baseline (done before Task 1, committed in Task 0):** Biome replaces ESLint + Prettier (single binary, ~100× faster, single `biome.json`), Renovate configured with grouped PRs + patch auto-merge + Convex post-upgrade codegen hook, GitHub Actions CI runs `typecheck + biome ci` on every PR.

**Note on testing:** Boilerplate has zero automated test infrastructure and the spec explicitly keeps testing out of scope. This plan substitutes TDD steps with **smoke-verify steps** — small, concrete checks (typecheck, `biome ci`, `convex dev` deploy, dashboard inspection, browser dev-console call) executed after each task. The final task is the spec's full manual checklist.

---

## File Structure

**Pre-Convex baseline (already written, committed in Task 0):**
- `biome.json` — Biome config (formatter + linter + import sort). 2-space, double quote, semi, trailing comma, a11y on but Polaris web-component rules (`noStaticElementInteractions`, `useKeyWithClickEvents`) off since `s-button`/`s-link` are custom elements
- `renovate.json` — grouped PRs (shopify, react-router, convex, types), patch+minor auto-merge, CVE instant auto-merge, Convex `postUpgradeTasks` regenerates `_generated/` on bump, `p-map` disabled (respects `overrides`), majors gated behind dashboard
- `.github/workflows/ci.yml` — Node 22, `npm ci` → `npm run typecheck` → `npm run ci:check` (Biome CI mode)
- `app/entry.server.tsx` — Biome auto-fix: `node:stream` protocol

**Baseline deletions:** `.eslintrc.cjs`, `.eslintignore`, `.prettierignore`
**Baseline devDep removals:** `eslint`, `eslint-import-resolver-typescript`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `prettier`, `@types/eslint`
**Baseline devDep additions:** `@biomejs/biome@2.4.12` (pinned exact)
**Baseline script changes:** `lint` (now `biome lint .`), `format` (new, `biome format --write .`), `check` (new, `biome check --write .`), `ci:check` (new, `biome ci .`)

**Convex work — created:**
- `convex/schema.ts` — `sessions` + `shops` tables, indexes
- `convex/sessions.ts` — session storage internal functions
- `convex/shops.ts` — shops public query + internal upsert
- `convex/lib/auth.ts` — `requireShopifyAuth` JWT verifier
- `convex/_generated/*` — committed after first `convex dev`
- `app/convex.server.ts` — `ConvexHttpClient` singleton (admin)
- `app/convex.client.ts` — `ConvexReactClient` singleton (browser)
- `app/lib/session-storage.server.ts` — `ConvexSessionStorage` adapter
- `app/lib/session-token.client.ts` — `useShopifySessionToken` hook

**Convex work — modified:**
- `app/shopify.server.ts` — swap `PrismaSessionStorage` → `ConvexSessionStorage`
- `app/root.tsx` — wrap `<Outlet/>` in `<ConvexProvider>`
- `app/routes/webhooks.app.uninstalled.tsx` — Convex internal mutation
- `app/routes/webhooks.app.scopes_update.tsx` — Convex internal mutation
- `app/routes/app._index.tsx` — doc link Prisma → Convex
- `package.json` — deps + scripts
- `.gitignore` — add `!.env.example` override; keep `convex/_generated/` tracked

**Convex work — deleted:**
- `prisma/` (folder + migrations)
- `app/db.server.ts`
- `prisma/dev.sqlite` (if present)

**Polish (final Task 16):**
- `.nvmrc` — pin Node version
- `.env.example` — covered in Task 14
- `.vscode/settings.json` — Biome default formatter + format on save
- `.github/pull_request_template.md` — Summary + Test plan
- `README.md` — Convex setup + Biome commands + Renovate note; drop Prisma refs

---

## Task 0: Commit pre-Convex toolchain baseline

All baseline files already written in working tree — this task commits them as one atomic baseline before Convex work begins. Verify state, smoke-check, commit.

**Files (all already authored — verify, don't rewrite):**
- New: `biome.json`, `renovate.json`, `.github/workflows/ci.yml`
- Modify: `package.json` (ESLint/Prettier devDeps removed, `@biomejs/biome@2.4.12` added pinned, `lint`/`format`/`check`/`ci:check` scripts), `app/entry.server.tsx` (`"stream"` → `"node:stream"`)
- Delete: `.eslintrc.cjs`, `.eslintignore`, `.prettierignore`

- [ ] **Step 1: Verify files exist**

Run:

```bash
ls biome.json renovate.json .github/workflows/ci.yml
ls .eslintrc.cjs .eslintignore .prettierignore 2>&1 | grep -c "No such"
```

Expected: first `ls` lists three files; second `ls` reports 3 "No such file" matches (all deleted).

- [ ] **Step 2: Confirm package.json state**

Grep `package.json` for leftover ESLint/Prettier:

```bash
grep -E '"(eslint|prettier|@typescript-eslint)' package.json
```

Expected: zero matches. If any hit, remove the key before continuing.

Grep for Biome pin (exact, no caret):

```bash
grep -E '"@biomejs/biome": "2\.4\.12"' package.json
```

Expected: one match. Caret = regression.

- [ ] **Step 3: Validate renovate.json**

```bash
npx --yes --package=renovate -- renovate-config-validator
```

Expected: "Validation successful" for `renovate.json`.

- [ ] **Step 4: Typecheck passes**

```bash
npm run typecheck
```

Expected: zero errors. Boilerplate at baseline is green.

- [ ] **Step 5: Biome CI passes**

```bash
npm run ci:check
```

Expected: zero errors. Warnings allowed (boilerplate has ~6 warn-level issues in Shopify-generated code — not blocking).

- [ ] **Step 6: Commit baseline as single chore**

```bash
git add biome.json renovate.json .github/workflows/ci.yml package.json package-lock.json app/entry.server.tsx
git rm .eslintrc.cjs .eslintignore .prettierignore
git commit -m "chore: replace ESLint+Prettier with Biome, add Renovate and CI"
```

---

## Task 1: Strip Prisma from package manifest, scripts, and repo

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Delete: `prisma/` (whole directory), `app/db.server.ts`

- [ ] **Step 1: Remove Prisma-related dependencies**

Edit `package.json` `dependencies` block — remove these three keys:

```
"@prisma/client": "^6.16.3",
"prisma": "^6.16.3",
"@shopify/shopify-app-session-storage-prisma": "^8.0.0",
```

Leave every other dep untouched.

- [ ] **Step 2: Add Convex dependency**

In `package.json` `dependencies`, add (keep alphabetical):

```
"convex": "^1.36.0",
```

Version confirmed against `npm view convex version` at plan authoring (1.36.0). If newer available during execution, use that.

- [ ] **Step 3: Replace npm scripts**

In `package.json` `scripts`, delete these entries:

```
"docker-start": "npm run setup && npm run start",
"setup": "prisma generate && prisma migrate deploy",
"prisma": "prisma",
```

Add these entries:

```
"docker-start": "npm run start",
"convex": "convex",
"convex:dev": "convex dev",
"convex:deploy": "convex deploy"
```

- [ ] **Step 4: Update .gitignore**

Current `.gitignore` already ignores `.env.local` via the `.env.*` glob — no new line needed. But that same glob also ignores `.env.example`, which Task 14 needs tracked. Add an un-ignore override directly below the `.env.*` line:

```
.env
.env.*
!.env.example
```

Confirm `convex/_generated/` is **not** ignored (no entry present — leave it that way).

Remove these two lines (Prisma SQLite artifacts):

```
/prisma/dev.sqlite
/prisma/dev.sqlite-journal
```

- [ ] **Step 5: Delete Prisma files**

Run:

```bash
rm -rf prisma app/db.server.ts
```

- [ ] **Step 6: Install dependencies**

Run:

```bash
npm install
```

Expected: lockfile regenerates, `@prisma/*` gone from `node_modules`, `convex/` present.

- [ ] **Step 7: Commit**

Note: typecheck will fail until Task 2 generates Convex types and Tasks 7–9 wire the new client. That's expected.

```bash
git add package.json package-lock.json .gitignore
git rm -r prisma
git rm app/db.server.ts
git commit -m "chore: remove Prisma, add convex dependency"
```

---

## Task 2: Initialize Convex project and commit generated code

**Files:**
- Create (by generator): `convex/_generated/*`
- Create: `convex/.gitignore` (auto-written by `convex dev`, leave as-is)

- [ ] **Step 1: Create empty convex directory so `convex dev` has a root**

```bash
mkdir -p convex
```

- [ ] **Step 2: Run first-time `convex dev` login + project creation**

Run:

```bash
npx convex dev --once
```

Expected: CLI prompts login (browser), prompts project selection (create new, name `shopify-template-convex`), writes `CONVEX_URL=...` to `.env.local`, generates `convex/_generated/{api.d.ts,api.js,server.d.ts,server.js,dataModel.d.ts}`.

If it prompts for a team or project name non-interactively-blocking, run without `--once` to interact:

```bash
npx convex dev
```

Let it finish one deploy cycle (will show "0 functions" since no `.ts` files yet), then `Ctrl-C`.

- [ ] **Step 3: Verify generated files committed, ignored files ignored**

Run:

```bash
ls convex/_generated
cat convex/.gitignore
```

Expected: `_generated/` listed; `convex/.gitignore` does NOT contain `_generated/`. If it does, remove that line (spec requires `_generated/` tracked).

- [ ] **Step 4: Commit generated scaffolding**

```bash
git add convex/ .env.local.example 2>/dev/null || git add convex/
git commit -m "chore: initialize convex project"
```

Do not commit `.env.local` — it is now gitignored.

---

## Task 3: Define Convex schema (sessions + shops)

**Files:**
- Create: `convex/schema.ts`

- [ ] **Step 1: Write schema**

```ts
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
    .index("by_shop", ["shop"]),

  shops: defineTable({
    shop: v.string(),
    installedAt: v.number(),
    scope: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    uninstalledAt: v.optional(v.number()),
  }).index("by_shop", ["shop"]),
});
```

- [ ] **Step 2: Deploy schema via convex dev**

Run:

```bash
npx convex dev --once
```

Expected: "Schema validation succeeded", two tables created.

- [ ] **Step 3: Smoke-check in Convex dashboard**

Open dashboard (URL printed by `convex dev`) → Data tab → confirm `sessions` and `shops` tables listed with indexes `by_sessionId`, `by_shop`.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated/
git commit -m "feat(convex): add sessions and shops schema"
```

---

## Task 4: Implement `requireShopifyAuth` JWT verifier

**Files:**
- Create: `convex/lib/auth.ts`

- [ ] **Step 1: Write auth helper**

```ts
// convex/lib/auth.ts
import { ConvexError } from "convex/values";

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4;
  const b64 = (s + "===".slice(0, pad ? 4 - pad : 0))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function requireShopifyAuth(
  token: string,
): Promise<{ shop: string; userId?: string }> {
  const secret = process.env.SHOPIFY_API_SECRET;
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!secret || !apiKey) throw new ConvexError("Server misconfigured");

  const parts = token.split(".");
  if (parts.length !== 3) throw new ConvexError("Malformed token");
  const [headerB64, payloadB64, sigB64] = parts;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!timingSafeEqual(new Uint8Array(signed), base64UrlDecode(sigB64))) {
    throw new ConvexError("Invalid token signature");
  }

  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(payloadB64)),
  );
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new ConvexError("Token expired");
  if (payload.nbf > now) throw new ConvexError("Token not yet valid");
  if (payload.aud !== apiKey) throw new ConvexError("Wrong audience");
  if (!payload.dest) throw new ConvexError("Missing dest");

  const shop = new URL(payload.dest).hostname;
  return { shop, userId: payload.sub };
}
```

- [ ] **Step 2: Set Convex env vars**

Run (substitute real values from root `.env`):

```bash
npx convex env set SHOPIFY_API_SECRET "$(grep -E '^SHOPIFY_API_SECRET=' .env | cut -d= -f2-)"
npx convex env set SHOPIFY_API_KEY "$(grep -E '^SHOPIFY_API_KEY=' .env | cut -d= -f2-)"
```

Verify:

```bash
npx convex env list
```

Expected: both vars listed. Values not echoed.

- [ ] **Step 3: Deploy and confirm no lint/type errors**

```bash
npx convex dev --once
```

Expected: deploy succeeds. `auth.ts` not a function module (no exports counted as functions), that's fine.

- [ ] **Step 4: Commit**

```bash
git add convex/lib/auth.ts
git commit -m "feat(convex): add Shopify session-token JWT verifier"
```

---

## Task 5: Implement session storage internal functions

**Files:**
- Create: `convex/sessions.ts`

- [ ] **Step 1: Write all seven internal functions**

```ts
// convex/sessions.ts
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

export const storeInternal = internalMutation({
  args: { session: v.object(sessionFields) },
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
  },
});

export const loadBySessionIdInternal = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
  },
});

export const deleteBySessionIdInternal = internalMutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

export const deleteManyInternal = internalMutation({
  args: { sessionIds: v.array(v.string()) },
  handler: async (ctx, { sessionIds }) => {
    for (const id of sessionIds) {
      const row = await ctx.db
        .query("sessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", id))
        .unique();
      if (row) await ctx.db.delete(row._id);
    }
  },
});

export const findByShopInternal = internalQuery({
  args: { shop: v.string() },
  handler: async (ctx, { shop }) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .collect();
  },
});

export const deleteByShopInternal = internalMutation({
  args: { shop: v.string() },
  handler: async (ctx, { shop }) => {
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_shop", (q) => q.eq("shop", shop))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
  },
});

export const updateScopeInternal = internalMutation({
  args: { sessionId: v.string(), scope: v.string() },
  handler: async (ctx, { sessionId, scope }) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (row) await ctx.db.patch(row._id, { scope });
  },
});
```

- [ ] **Step 2: Deploy and regenerate API types**

```bash
npx convex dev --once
```

Expected: 7 functions listed under `internal.sessions.*`. Check generated `convex/_generated/api.d.ts` contains `sessions.storeInternal`, etc.

- [ ] **Step 3: Smoke-check in dashboard**

Dashboard → Functions → confirm `sessions.storeInternal`, `sessions.loadBySessionIdInternal`, `sessions.deleteBySessionIdInternal`, `sessions.deleteManyInternal`, `sessions.findByShopInternal`, `sessions.deleteByShopInternal`, `sessions.updateScopeInternal` all flagged Internal (not public).

- [ ] **Step 4: Commit**

```bash
git add convex/sessions.ts convex/_generated/
git commit -m "feat(convex): add internal session storage functions"
```

---

## Task 6: Implement shops functions (public + internal)

**Files:**
- Create: `convex/shops.ts`

- [ ] **Step 1: Write public `get` + internal `upsertInternal`**

```ts
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
```

- [ ] **Step 2: Deploy**

```bash
npx convex dev --once
```

Expected: `shops.get` listed as Public query, `shops.upsertInternal` as Internal mutation.

**Wiring note:** Spec §6 says `shops.upsertInternal` "called during auth" but does not specify the call site, and spec §4 lists no modification to an auth hook for this. This plan intentionally leaves `upsertInternal` defined but uncalled. A follow-up (out of this plan's scope) can hook it into `shopifyApp({ hooks: { afterAuth } })` once the team confirms the desired trigger. `shops.get` returns `null` for shops without a row — acceptable for the starter.

- [ ] **Step 3: Smoke-check auth rejection**

Dashboard → Functions → `shops.get` → Run with `sessionToken: "invalid"`. Expected: `ConvexError: Malformed token`.

- [ ] **Step 4: Commit**

```bash
git add convex/shops.ts convex/_generated/
git commit -m "feat(convex): add shops public query and internal upsert"
```

---

## Task 7: Server-side Convex HTTP client singleton

**Files:**
- Create: `app/convex.server.ts`
- Modify: `.env` (local dev only, not committed)

- [ ] **Step 1: Populate required env vars**

`convex.server.ts` throws at module load if `CONVEX_URL` or `CONVEX_DEPLOY_KEY` are unset. Set up both (and `VITE_CONVEX_URL` for Task 10) before first RR7 dev boot.

`CONVEX_URL` is already in `.env.local` from Task 2. Copy its value and append to `.env`:

```
CONVEX_URL=<same value as in .env.local>
VITE_CONVEX_URL=<same value>
```

Generate a deploy key: Convex dashboard → your project → Settings → Deploy Keys → "Generate development deploy key". Append to `.env`:

```
CONVEX_DEPLOY_KEY=<generated key>
```

`.env` is gitignored. Never commit deploy keys.

- [ ] **Step 2: Write singleton**

```ts
// app/convex.server.ts
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL;
const deployKey = process.env.CONVEX_DEPLOY_KEY;

if (!url) throw new Error("CONVEX_URL not set");
if (!deployKey) throw new Error("CONVEX_DEPLOY_KEY not set");

const client = new ConvexHttpClient(url);
client.setAdminAuth(deployKey);

export default client;
```

- [ ] **Step 3: Verification item — confirm `setAdminAuth` API**

Open `node_modules/convex/dist/types/browser/http_client.d.ts`. Confirm `setAdminAuth(adminKey: string): void` exists on `ConvexHttpClient`. If the name differs (e.g. `setAuth`), update Step 2 accordingly and note the deviation below:

```
<deviation log — leave blank if API matches spec>
```

If method is missing entirely, stop and escalate — fallback is to expose session storage as an `httpAction` gated by shared secret (spec §12 item 1).

- [ ] **Step 4: Type-check**

Run:

```bash
npm run typecheck
```

Expected: passes for `app/convex.server.ts`. Other files may still fail until Tasks 8–9. Those failures acceptable mid-plan.

- [ ] **Step 5: Commit**

```bash
git add app/convex.server.ts
git commit -m "feat(app): add server Convex HTTP client"
```

---

## Task 8: Build `ConvexSessionStorage` adapter

**Files:**
- Create: `app/lib/session-storage.server.ts`

- [ ] **Step 1: Write adapter with serialize/deserialize helpers**

```ts
// app/lib/session-storage.server.ts
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { Session } from "@shopify/shopify-api";
import type { ConvexHttpClient } from "convex/browser";
import { internal } from "../../convex/_generated/api";

export class ConvexSessionStorage implements SessionStorage {
  constructor(private client: ConvexHttpClient) {}

  async storeSession(session: Session): Promise<boolean> {
    await this.client.mutation(internal.sessions.storeInternal, {
      session: serialize(session),
    });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const row = await this.client.query(
      internal.sessions.loadBySessionIdInternal,
      { sessionId: id },
    );
    return row ? deserialize(row) : undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.client.mutation(internal.sessions.deleteBySessionIdInternal, {
      sessionId: id,
    });
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    await this.client.mutation(internal.sessions.deleteManyInternal, {
      sessionIds: ids,
    });
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const rows = await this.client.query(
      internal.sessions.findByShopInternal,
      { shop },
    );
    return rows.map(deserialize);
  }
}

function serialize(s: Session) {
  return {
    sessionId: s.id,
    shop: s.shop,
    state: s.state,
    isOnline: s.isOnline,
    scope: s.scope ?? undefined,
    expires: s.expires ? s.expires.getTime() : undefined,
    accessToken: s.accessToken ?? "",
    userId: s.onlineAccessInfo?.associated_user?.id
      ? String(s.onlineAccessInfo.associated_user.id)
      : undefined,
    firstName: s.onlineAccessInfo?.associated_user?.first_name ?? undefined,
    lastName: s.onlineAccessInfo?.associated_user?.last_name ?? undefined,
    email: s.onlineAccessInfo?.associated_user?.email ?? undefined,
    accountOwner:
      s.onlineAccessInfo?.associated_user?.account_owner ?? false,
    locale: s.onlineAccessInfo?.associated_user?.locale ?? undefined,
    collaborator:
      s.onlineAccessInfo?.associated_user?.collaborator ?? undefined,
    emailVerified:
      s.onlineAccessInfo?.associated_user?.email_verified ?? undefined,
  };
}

function deserialize(row: any): Session {
  const s = new Session({
    id: row.sessionId,
    shop: row.shop,
    state: row.state,
    isOnline: row.isOnline,
  });
  s.scope = row.scope;
  s.expires = row.expires ? new Date(row.expires) : undefined;
  s.accessToken = row.accessToken;
  if (row.userId) {
    s.onlineAccessInfo = {
      associated_user: {
        id: Number(row.userId),
        first_name: row.firstName,
        last_name: row.lastName,
        email: row.email,
        account_owner: row.accountOwner,
        locale: row.locale,
        collaborator: row.collaborator,
        email_verified: row.emailVerified,
      },
    } as any;
  }
  return s;
}
```

- [ ] **Step 2: Verification item — confirm `Session.onlineAccessInfo` shape**

Open `node_modules/@shopify/shopify-api/dist/ts/lib/session/session.d.ts`. Confirm `onlineAccessInfo` is an assignable property (not a computed getter) and that `associated_user` fields match the keys used above. If library uses different casing (e.g. `accountOwner` instead of `account_owner`), update `serialize`/`deserialize` to match. Log deviations:

```
<deviation log — leave blank if shape matches>
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```

Expected: `session-storage.server.ts` passes; `shopify.server.ts` still errors (wired up next task).

- [ ] **Step 4: Commit**

```bash
git add app/lib/session-storage.server.ts
git commit -m "feat(app): add ConvexSessionStorage adapter"
```

---

## Task 9: Wire `ConvexSessionStorage` into `shopify.server.ts`

**Files:**
- Modify: `app/shopify.server.ts`

- [ ] **Step 1: Replace Prisma wiring with Convex wiring**

Current file:

```ts
import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  // ...
});
```

Replace the first block and the `sessionStorage` line so the file reads:

```ts
import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import convex from "./convex.server";
import { ConvexSessionStorage } from "./lib/session-storage.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new ConvexSessionStorage(convex),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: `shopify.server.ts` passes. Webhook files still error until Task 12.

- [ ] **Step 3: Commit**

```bash
git add app/shopify.server.ts
git commit -m "feat(app): use ConvexSessionStorage in shopifyApp config"
```

---

## Task 10: Browser `ConvexReactClient` and session-token hook

**Files:**
- Create: `app/convex.client.ts`
- Create: `app/lib/session-token.client.ts`

- [ ] **Step 1: Write client singleton**

```ts
// app/convex.client.ts
import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) throw new Error("VITE_CONVEX_URL not set");

export const convexClient = new ConvexReactClient(url);
```

- [ ] **Step 2: Write session-token hook**

```ts
// app/lib/session-token.client.ts
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export function useShopifySessionToken(): string | null {
  const app = useAppBridge();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const t = await app.idToken();
      if (!cancelled) setToken(t);
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [app]);

  return token;
}
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```

Expected: both files pass.

- [ ] **Step 4: Commit**

```bash
git add app/convex.client.ts app/lib/session-token.client.ts
git commit -m "feat(app): add browser Convex client and session-token hook"
```

---

## Task 11: Wrap root in `ConvexProvider`

**Files:**
- Modify: `app/root.tsx`

- [ ] **Step 1: Replace full file contents**

```tsx
// app/root.tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { ConvexProvider } from "convex/react";
import { convexClient } from "./convex.client";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <ConvexProvider client={convexClient}>
          <Outlet />
        </ConvexProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: passes. `convex.client.ts` is client-only (guarded by `import.meta.env`); RR7 SSR handles initial render — `ConvexProvider` tolerates server render without a live connection.

- [ ] **Step 3: Commit**

```bash
git add app/root.tsx
git commit -m "feat(app): wrap router outlet in ConvexProvider"
```

---

## Task 12: Migrate webhook handlers to Convex

**Files:**
- Modify: `app/routes/webhooks.app.uninstalled.tsx`
- Modify: `app/routes/webhooks.app.scopes_update.tsx`

- [ ] **Step 1: Rewrite `webhooks.app.uninstalled.tsx`**

```tsx
// app/routes/webhooks.app.uninstalled.tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import convex from "../convex.server";
import { internal } from "../../convex/_generated/api";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    try {
      await convex.mutation(internal.sessions.deleteByShopInternal, { shop });
    } catch (err) {
      console.error("deleteByShopInternal failed", err);
    }
  }

  return new Response();
};
```

- [ ] **Step 2: Rewrite `webhooks.app.scopes_update.tsx`**

```tsx
// app/routes/webhooks.app.scopes_update.tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import convex from "../convex.server";
import { internal } from "../../convex/_generated/api";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const current = payload.current as string[];
  if (session) {
    try {
      await convex.mutation(internal.sessions.updateScopeInternal, {
        sessionId: session.id,
        scope: current.toString(),
      });
    } catch (err) {
      console.error("updateScopeInternal failed", err);
    }
  }

  return new Response();
};
```

Try/catch + `return new Response()` = always `200`, per spec §10 (avoid Shopify retry storms on transient Convex blips).

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```

Expected: all files pass.

- [ ] **Step 4: Commit**

```bash
git add app/routes/webhooks.app.uninstalled.tsx app/routes/webhooks.app.scopes_update.tsx
git commit -m "feat(app): migrate webhooks to Convex internal mutations"
```

---

## Task 13: Swap doc link in app index

**Files:**
- Modify: `app/routes/app._index.tsx`

- [ ] **Step 1: Replace Prisma link block**

Locate the "Database:" `s-paragraph` block (~lines 310–314, inside the "App template specs" aside). Match the exact current text:

```tsx
<s-paragraph>
  <s-text>Database: </s-text>
  <s-link href="https://www.prisma.io/" target="_blank">
    Prisma
  </s-link>
</s-paragraph>
```

With:

```tsx
<s-paragraph>
  <s-text>Database: </s-text>
  <s-link href="https://www.convex.dev/" target="_blank">
    Convex
  </s-link>
</s-paragraph>
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/routes/app._index.tsx
git commit -m "docs(app): update database link to Convex"
```

---

## Task 14: Documentation + env examples

**Files:**
- Create: `.env.example`
- Modify: `README.md` (setup section only)

- [ ] **Step 1: Write `.env.example`**

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=write_products

# Convex (filled during `npx convex dev`)
CONVEX_URL=
VITE_CONVEX_URL=
CONVEX_DEPLOY_KEY=
```

- [ ] **Step 2: Add setup section to `README.md`**

Find the existing setup/installation section. Replace Prisma-specific steps with:

```markdown
## Convex setup

1. `npm install`
2. `npx convex dev` — logs in, creates project, writes `CONVEX_URL` to `.env.local`
3. `npx convex env set SHOPIFY_API_SECRET <value>`
4. `npx convex env set SHOPIFY_API_KEY <value>`
5. Convex dashboard → Settings → Deploy Keys → create a deploy key
6. Fill `.env`:
   - `CONVEX_DEPLOY_KEY=<deploy key>`
   - `VITE_CONVEX_URL=<same as CONVEX_URL>`
7. Two terminals: `npm run dev` and `npm run convex:dev`
```

If the README lacks a corresponding Prisma section, append the block above under a new `## Convex setup` heading.

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document Convex setup"
```

---

## Task 15: Full manual verification (spec §11)

No code changes. Gate the feature on seven concrete checks.

- [ ] **Step 1: Clean install**

```bash
rm -rf node_modules
npm install
```

Expected: no Prisma artifacts. `convex` installed.

- [ ] **Step 2: Convex deploy cycle**

```bash
npx convex dev --once
```

Expected: schema + 9 functions (7 session internal, 1 shops internal, 1 shops public) deploy cleanly.

- [ ] **Step 3: OAuth install creates session row**

Run `npm run dev` + `npm run convex:dev` in two terminals. Install app on development store. In Convex dashboard → Data → `sessions`, confirm one row with this shop's `shop` field.

- [ ] **Step 4: Session persistence across restart**

Restart `npm run dev` (Ctrl-C, run again). Refresh admin app page. Expected: no re-auth prompt — session loaded from Convex.

- [ ] **Step 5: Scope update webhook**

Trigger scope change (edit `SCOPES` in `.env`, restart, reinstall scopes). Confirm `scopes_update` console log line, then verify `sessions` row `scope` column updated in dashboard.

- [ ] **Step 6: Uninstall webhook**

Uninstall app from dev store. Confirm `app/uninstalled` console log, then verify zero `sessions` rows remain for that shop in dashboard.

- [ ] **Step 7: Public function rejects missing token**

In embedded app, open browser dev console. Run:

```js
await window.fetch(`${import.meta.env.VITE_CONVEX_URL}/api/query`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    path: "shops:get",
    args: { sessionToken: "not-a-jwt" },
    format: "json",
  }),
});
```

Expected: response body contains `ConvexError: Malformed token`.

- [ ] **Step 8: Public function rejects expired token**

Grab a real session token (`await shopify.idToken()` in dev console), wait 70 seconds, repeat the call above with it. Expected: `ConvexError: Token expired`.

- [ ] **Step 9: Final commit of any docs/notes tweaks**

If any deviations from spec were logged in Task 7 Step 2 or Task 8 Step 2, commit those now:

```bash
git add -A
git commit -m "docs: record Convex adapter verification deviations"
```

If no deviations: skip.

---

## Task 16: Final polish (DX, docs, PR hygiene)

Template-finishing touches that aren't Convex-specific but ship with this PR so the boilerplate is complete.

**Files:**
- Create: `.nvmrc`, `.vscode/settings.json`, `.vscode/extensions.json`, `.github/pull_request_template.md`
- Modify: `README.md` (full rewrite — Shopify + Convex + Biome + Renovate + CI)

- [ ] **Step 1: Pin Node version**

```bash
echo "22.12" > .nvmrc
```

Rationale: `package.json` `engines` is `>=20.19 <22 || >=22.12`. `22.12` is in range; matches CI Node 22.

- [ ] **Step 2: VS Code workspace settings**

Create `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  },
  "[typescript]": { "editor.defaultFormatter": "biomejs.biome" },
  "[typescriptreact]": { "editor.defaultFormatter": "biomejs.biome" },
  "[javascript]": { "editor.defaultFormatter": "biomejs.biome" },
  "[javascriptreact]": { "editor.defaultFormatter": "biomejs.biome" },
  "[json]": { "editor.defaultFormatter": "biomejs.biome" },
  "[jsonc]": { "editor.defaultFormatter": "biomejs.biome" }
}
```

Create `.vscode/extensions.json`:

```json
{
  "recommendations": ["biomejs.biome"]
}
```

- [ ] **Step 3: PR template**

Create `.github/pull_request_template.md`:

```markdown
## Summary

<!-- 1–3 bullets: what changed and why -->

## Test plan

- [ ] `npm run typecheck` passes
- [ ] `npm run ci:check` passes
- [ ] Manual smoke-test in dev store (if user-facing)
- [ ] Convex schema deploy succeeds (if `convex/` touched)

## Screenshots / recordings

<!-- If UI changed -->
```

- [ ] **Step 4: Rewrite README**

Replace `README.md` top-to-bottom with:

```markdown
# Shopify + React Router v7 + Convex Template

Opinionated boilerplate for embedded Shopify admin apps. RR7 server-side rendering, App Bridge session tokens, Convex Cloud for sessions + app data, Biome for lint/format, Renovate for auto-updates.

## Stack

- **Framework:** React Router v7 (`@shopify/shopify-app-react-router`)
- **UI:** Polaris web components + App Bridge React
- **Backend:** Convex Cloud (session storage + app queries/mutations)
- **Auth:** Shopify OAuth (server) + session token HS256 JWT (client → Convex)
- **Toolchain:** Biome 2.x, TypeScript strict, Vite 6
- **CI:** GitHub Actions (`typecheck` + `biome ci`)
- **Deps:** Renovate (grouped PRs, patch auto-merge, Convex post-upgrade codegen)

## Setup

1. `nvm use` (reads `.nvmrc`)
2. `npm install`
3. `npx convex dev` — logs in, creates project, writes `CONVEX_URL` to `.env.local`
4. Convex dashboard → Settings → Deploy Keys → generate dev deploy key
5. Create `.env` from `.env.example`, fill:
   - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`
   - `CONVEX_URL` (same as `.env.local`), `VITE_CONVEX_URL` (same), `CONVEX_DEPLOY_KEY`
6. Push secrets to Convex: `npx convex env set SHOPIFY_API_KEY <v>` and same for `SHOPIFY_API_SECRET`
7. Two terminals: `npm run dev` + `npm run convex:dev`

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Shopify CLI dev with embedded app tunnel |
| `npm run convex:dev` | Convex dev server + codegen watcher |
| `npm run typecheck` | `react-router typegen` + `tsc --noEmit` |
| `npm run ci:check` | Biome CI (format + lint + imports, read-only) |
| `npm run check` | Biome check + auto-fix |
| `npm run format` | Biome format in place |
| `npm run lint` | Biome lint only |
| `npm run build` | Production build |
| `npm run deploy` | `shopify app deploy` |

## Project layout

- `app/` — RR7 routes, loaders, server code
- `app/convex.server.ts` — admin Convex HTTP client (internal functions)
- `app/convex.client.ts` — browser Convex React client (public functions)
- `app/lib/session-storage.server.ts` — `ConvexSessionStorage` adapter
- `convex/` — schema + functions (internal = server-only, public = JWT-gated)
- `convex/_generated/` — codegen, committed
- `extensions/` — Shopify extensions workspace

## Convex security model

- Internal functions (`*Internal` suffix) only callable with admin deploy key from the RR7 server
- Public functions verify Shopify session tokens (HS256 + `SHOPIFY_API_SECRET`) and derive `shop` from `dest` claim — never trust client args
- See `convex/lib/auth.ts` for `requireShopifyAuth`

## Dependency updates

Renovate opens grouped PRs weekly. Patch, minor (Biome only), `@types/*`, and security fixes auto-merge after CI green. Majors gated via the Dependency Dashboard. Convex upgrades run `npx convex codegen` post-install to keep `_generated/` in sync.

## License

MIT.
```

- [ ] **Step 5: Smoke-check**

```bash
npm run typecheck && npm run ci:check
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add .nvmrc .vscode/ .github/pull_request_template.md README.md
git commit -m "chore: polish template (nvmrc, vscode, PR template, README)"
```

---

## Self-Review Checklist

Run mentally before handoff:

- [x] Every spec §4 created/modified/deleted file maps to a task (1, 3–13)
- [x] Spec §5 data model → Task 3
- [x] Spec §6 security (internal vs public, `requireShopifyAuth`, env vars, admin key) → Tasks 4, 5, 6, 7
- [x] Spec §7 adapter → Task 8
- [x] Spec §8 dev workflow → Task 14 README
- [x] Spec §9 webhooks → Task 12
- [x] Spec §10 error handling (try/catch, always 200) → Task 12
- [x] Spec §11 manual verification → Task 15
- [x] Spec §12 open verification items (`setAdminAuth` API, `onlineAccessInfo` shape) → Task 7 Step 3, Task 8 Step 2
- [x] No placeholders — every code step is complete code
- [x] Type/name consistency: `internal.sessions.*` names match across Tasks 5, 8, 12
- [x] Imports resolve: `convex/_generated/api` generated by Task 2; consumed starting Task 8
- [x] Env prerequisites (`CONVEX_URL`, `CONVEX_DEPLOY_KEY`, `VITE_CONVEX_URL`) set in Task 7 Step 1 before first use in Tasks 7–11
- [x] `.gitignore` `.env.*` override for `.env.example` added in Task 1 Step 4
- [x] Convex version pin (`^1.36.0`) matches npm registry at plan authoring
- [x] Known gap: `shops.upsertInternal` defined but not wired into any auth hook — flagged in Task 6 Step 2 as intentional deferral
- [x] Pre-Convex toolchain baseline (Biome, Renovate, CI) committed as Task 0 before any Convex work
- [x] Task 0 verifies: baseline files exist, ESLint/Prettier devDeps fully purged from `package.json`, Biome pinned exact (no caret), `renovate.json` validates, typecheck + `ci:check` green
- [x] Task 16 polish covers `.nvmrc` (Node 22.12), `.vscode/` (Biome default formatter + format-on-save + import organize), `.github/pull_request_template.md`, README full rewrite
- [x] README documents Biome scripts (`lint`/`format`/`check`/`ci:check`), Renovate behavior, Convex security model
- [x] CI runs `npm run typecheck` + `npm run ci:check` — matches scripts added in Task 0
- [x] No task references `npm run lint` as a gate (CI uses `ci:check` — Biome strict read-only); `lint` is dev convenience only
