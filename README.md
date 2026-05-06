# Shopify + React Router 7 + Convex Template

Opinionated boilerplate for embedded Shopify admin apps. RR7 SSR, App Bridge session tokens, Convex Cloud for sessions + app data, Polaris web components, Vercel-ready deploy, GDPR-compliant webhook scaffolding, react-i18next with 5 locales, Vitest, Biome, Renovate.

## Stack

- **Framework:** React Router 7 (`@shopify/shopify-app-react-router`)
- **UI:** Polaris web components + App Bridge React
- **Backend:** Convex Cloud (sessions + app queries/mutations)
- **Auth:** Shopify OAuth (server) + session token HS256 JWT (client → Convex)
- **i18n:** react-i18next, 5 locales (en, es, de, fr, pt-BR), easy to extend
- **Tests:** Vitest 4 + `convex-test` (edge-runtime)
- **Toolchain:** Biome 2, TypeScript strict, Vite 6
- **Deploy target:** Vercel (default, via `@vercel/react-router`); Fly.io / Cloudflare Workers also supported
- **Deps:** Renovate (grouped PRs, patch auto-merge, Convex post-upgrade codegen)
- **CI:** GitHub Actions (`typecheck` + `biome ci`)

## Quick start

**Recommended — GitHub Template button:**

Click [Use this template](https://github.com/samirjabib/shopify-apps-convex-template/generate) on the repo. GitHub creates a clean copy in your account with a single squashed commit and **no fork relationship**.

> If you forked instead of using the template button, your repo will stay attached to the upstream fork network (PRs default to upstream, "fork" badge in the UI). Detach it via **GitHub Settings → Danger Zone → Leave fork network** before pushing work.

**Alternative — Shopify CLI:**

```bash
shopify app init --template https://github.com/samirjabib/shopify-apps-convex-template
```

Shopify CLI clones the template, runs `npm install`, prompts you to sign in, connect/create the Shopify app, and pick a dev store. When done, `shopify.app.toml` has `client_id` + URLs filled.

**Alternative — Manual clone:**

```bash
git clone https://github.com/samirjabib/shopify-apps-convex-template.git my-app
cd my-app && nvm use && npm install
```

If you cloned manually and want to discard the template's commit history before pushing:

```bash
git checkout --orphan fresh-start
git commit -m "chore: initial commit"
git update-ref refs/heads/main HEAD
git checkout main
git push --force origin main
```

> Need to re-link or switch apps later? `npm run dev -- --reset`.

## First run — bootstrap

After clone or `shopify app init`, run a single command:

```bash
npm run setup
```

That command:

1. Copies `.env.example` → `.env` (if missing)
2. Links the Shopify app (`shopify app config link` — interactive if not linked yet)
3. Pulls API keys from the Partner Dashboard into `.env` (`shopify app env pull`)
4. Registers a **local Convex backend** (`npx convex deployment create local --select`)
5. Boots Convex once to write `.env.local` and populate `CONVEX_URL`, `VITE_CONVEX_URL`, `CONVEX_DEPLOY_KEY` in `.env`
6. Syncs Shopify auth vars from `.env` into the Convex runtime

Result: a fresh clone reaches `npm run dev:all` with **zero manual `.env` edits**.

> Why `setup` matters: `app/convex.server.ts` throws at module load if `CONVEX_DEPLOY_KEY` is missing, and the JWT validator inside Convex needs `SHOPIFY_API_SECRET`. The script handles every prerequisite in one shot.

### Dev workflow

Single terminal (recommended):

```bash
npm run dev:all
```

Runs RR7 (`shopify app dev`) and the Convex local backend together via `concurrently`. Either side failing kills the other.

Two terminals (if you want logs separated):

```bash
# terminal 1 — Convex local backend (must stay running)
npm run convex:dev

# terminal 2 — Shopify dev (RR7 + tunnel)
npm run dev
```

> Forgot the Convex side? `app/convex.server.ts` throws a friendly error at boot pointing you to `npm run convex:dev`.

## Deploy to Vercel

This template ships with the official `@vercel/react-router` preset wired in `react-router.config.ts`. Push your repo to GitHub and import in Vercel.

### Prerequisites

1. **Provision Convex production deployment**
   ```bash
   npx convex deploy        # creates prod deployment, prints CONVEX_URL
   ```
   Generate a deploy key from the Convex dashboard (Settings → Deploy Keys).

2. **Update Shopify Partner Dashboard**
   - Set `App URL` = `https://<your-app>.vercel.app`
   - Add `https://<your-app>.vercel.app/auth/callback` to `Allowed redirection URLs`

### Vercel project env vars

Add these in Vercel project settings (Production + Preview):

| Variable | Value |
|---|---|
| `SHOPIFY_API_KEY` | From Partner Dashboard |
| `SHOPIFY_API_SECRET` | From Partner Dashboard |
| `SHOPIFY_APP_URL` | `https://<your-app>.vercel.app` |
| `SCOPES` | Comma-separated, must match `shopify.app.toml` |
| `SHOP_CUSTOM_DOMAIN` | Optional — only if using a custom shop domain |
| `CONVEX_URL` | Convex production URL |
| `VITE_CONVEX_URL` | Same as `CONVEX_URL` |
| `CONVEX_DEPLOY_KEY` | Convex production deploy key (admin) |

`vercel.json` defines `framework: "react-router"` and runs `npm run convex:deploy && npm run build` so Convex schema changes ship in lockstep with each Vercel build.

### Other deploy targets

- **Fly.io** — Use `fly launch` with a Dockerfile + `react-router-serve`. Better when you need persistent compute or custom WebSocket layers.
- **Cloudflare Workers** — Replace the Vercel preset with `@react-router/cloudflare`. Constraints: bundle size + non-Node runtime.
- **Self-hosted Node** — `npm run build && npm start` works anywhere.

## Architecture pattern

Hybrid by design:

- **Shopify server** handles platform concerns: OAuth, Admin API, webhooks, install lifecycle, and anything needing Shopify credentials or offline sessions.
- **Convex** handles app business logic: reactive dashboards, analytics, derived state, background workflows, browser subscriptions.

Mental model:

- Shopify = source of truth for platform data
- Convex = reactive source of truth for your app's business state

Recommended flow:

1. Browser reads business state directly from Convex for reactive UI.
2. Shopify server performs platform operations via Admin API.
3. Server writes projections, state transitions, workflow updates into Convex.
4. Convex pushes changes back to the browser in real time.

Use `browser → Convex` for app data with realtime needs. Use `browser → server → Shopify` for platform actions (products, orders, inventory, install, webhooks).

## Convex security model

- **Internal functions** (`*Internal` suffix) callable only with admin deploy key from the RR7 server.
- **Public functions** verify Shopify session tokens (HS256 + `SHOPIFY_API_SECRET`) and derive `shop` from the `dest` claim — never trust client args.
- Verification runs inside Convex, so `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` must exist in the Convex runtime as well as in the app server runtime. `npm run convex:env:sync` handles this.
- ±30s clock-skew tolerance applied to JWT `exp`/`nbf` to absorb minor drift.
- See `convex/lib/auth.ts` for `requireShopifyAuth`.

## GDPR webhooks (App Store requirement)

Three handlers are wired and registered in `shopify.app.toml`:

- `customers/data_request` → `app/routes/webhooks.app.customers_data_request.tsx`
- `customers/redact` → `app/routes/webhooks.app.customers_redact.tsx`
- `shop/redact` → `app/routes/webhooks.app.shop_redact.tsx` (purges sessions + shop record from Convex)

The `data_request` and `customers/redact` handlers acknowledge by default — customize them when your app stores customer-scoped data.

`npm run check:webhooks` lints `shopify.app.toml` against the route files in `app/routes/` and exits 1 if any subscription URI lacks a handler. Wire it into CI to catch drift before deploy.

## Billing (opt-in)

The template ships with a billing facade and a [Mantle](https://heymantle.com) adapter. Both are **off by default** (`BILLING_PROVIDER=none` in `.env`). Switch on when you're ready to monetize.

### Why Mantle

Native [Shopify Billing API](https://shopify.dev/docs/api/usage/billing-api) works fine for one app. Mantle adds value once you build a portfolio:

- A/B price testing across plans
- Churn / LTV / health-score analytics
- Multi-app dashboard (single source of truth across your portfolio)
- Plan migration tooling
- Mantle Core is **$0/mo for apps under $5K MTR** — only pay once an app crosses the threshold

If you only need a single $X/mo subscription on one app, the native Shopify Billing API is simpler and zero-deps. Swap by editing `app/lib/billing/`.

### Enable Mantle

1. **Sign up** at [heymantle.com](https://heymantle.com) (Core plan, free under $5K MTR).
2. From the Mantle dashboard → Settings → Apps, install your Shopify app and copy:
   - `MANTLE_APP_ID`
   - `MANTLE_API_KEY`
3. Add to your `.env`:
   ```
   BILLING_PROVIDER=mantle
   MANTLE_APP_ID=<your app id>
   MANTLE_API_KEY=<your api key>
   ```
4. Add the same three vars in Vercel project settings (Production + Preview).
5. Restart `npm run dev`. On the next install, `afterAuth` calls `mantle.identify()` and stores the per-shop `apiToken` in Convex `shops.mantleApiToken`.
6. Configure plans in the [Mantle dashboard](https://app.heymantle.com) → Plans.
7. Visit `/app/billing` in the embedded admin to see the plan picker.

### Mantle webhook

Mantle posts subscription events to `/webhooks/mantle`. Handler is wired at `app/routes/webhooks.mantle.tsx`. Configure the webhook URL in your Mantle dashboard:
```
https://<your-app>.vercel.app/webhooks/mantle
```
Stub today: TODO comment marks where to add HMAC signature verification once Mantle's signature scheme is in your dashboard. Don't ship to App Store without verification.

### How to test billing locally

> Mantle requires HTTPS for webhooks. Use `npm run dev` (Shopify CLI provides a public tunnel) or `cloudflared tunnel`.

1. **Set env vars** as above.
2. **Reinstall the app** so `afterAuth` fires:
   ```bash
   # In Shopify Partner dashboard → Apps → your app → "Test on store" → uninstall, then reinstall.
   # Or trigger via CLI:
   npm run dev
   # then click the install URL printed by Shopify CLI in a fresh dev store
   ```
3. **Verify the apiToken landed in Convex:**
   ```bash
   npx convex data shops --env-file .env.local | grep mantleApiToken
   ```
4. **Open `/app/billing`** in the embedded admin. You should see the plans defined in your Mantle dashboard. Subscribing redirects to Shopify's billing approval page.
5. **Approve the test charge** in the Shopify confirmation screen (test stores skip real billing).
6. **Verify Mantle webhook received** by checking server logs:
   ```
   Mantle webhook subscription.created for shop=... plan=Pro
   ```
7. **Verify plan synced to Convex:**
   ```bash
   npx convex data shops --env-file .env.local | grep plan
   ```

### Disable billing

Set `BILLING_PROVIDER=none` (or unset). The `/app/billing` route renders a "Billing disabled" placeholder; `afterAuth` skips Mantle identify; webhook handler returns 200 without persisting.

### Swap to Shopify Billing API native

Edit `app/lib/billing/index.ts` and add a `shopify` branch in `identifyShop` that calls `billingApi.require()` from `@shopify/shopify-app-react-router`. The `BillingProvider` type and call sites stay the same.

## i18n

`react-i18next` with 5 default locales: English, Spanish, German, French, Brazilian Portuguese. Locale resolves from the Shopify session `locale` claim or `?locale=` query param.

Add a locale:
1. Drop `app/i18n/locales/<code>.json` mirroring `en.json` keys.
2. Register it in `app/i18n/config.ts` (import + `SUPPORTED_LOCALES` + `resources`).
3. Optional: add a prefix alias in `resolveLocale` (e.g. `it → it-IT`).

Missing keys fall back to `en` automatically.

## Scripts

| Command | Purpose |
|---|---|
| `npm run setup` | One-shot post-clone bootstrap (link app, env pull, Convex local, env sync) |
| `npm run dev` | Shopify CLI dev with embedded app tunnel |
| `npm run dev:all` | `dev` + `convex:dev` together (single terminal, via `concurrently`) |
| `npm run dev -- --reset` | Re-link to a Shopify app (existing or new) |
| `npm run convex:dev` | Convex dev server + codegen watcher + local `.env` sync |
| `npm run convex:env:sync` | Sync Shopify auth vars from `.env` (or `process.env`) into the local Convex deployment |
| `npm run convex:deploy` | Deploy Convex schema + functions to production |
| `npm run convex:key` | Re-sync `CONVEX_DEPLOY_KEY`/`CONVEX_URL` from local backend config |
| `npm run convex:reset-to-local` | Recover from a stuck cloud-dev deployment (rebuild local backend, repopulate `.env`) |
| `npm run check:webhooks` | Lint `shopify.app.toml` URIs against `app/routes/webhooks.*` files |
| `npm run typecheck` | `react-router typegen` + `tsc --noEmit` |
| `npm run test` | Vitest watch |
| `npm run test:run` | Vitest single-run |
| `npm run ci:check` | Biome CI (read-only) |
| `npm run check` | Biome check + auto-fix |
| `npm run format` | Biome format in place |
| `npm run lint` | Biome lint only |
| `npm run build` | Production build (Vite + RR7) |
| `npm run deploy` | `shopify app deploy` (push toml + extensions) |

## Project layout

```
app/
├── convex-client.ts                 browser Convex React client
├── convex.server.ts                 admin Convex HTTP client (RR7 server)
├── shopify.server.ts                shopifyApp() configuration
├── i18n/                            react-i18next config + locale JSON
├── lib/
│   ├── session-storage.server.ts    ConvexSessionStorage adapter
│   └── session-token.ts             App Bridge session token hook
└── routes/
    ├── app.tsx                      embedded app shell + I18nextProvider
    ├── app._index.tsx               dashboard (single stack card)
    ├── app.additional.tsx           secondary page example
    ├── auth.$.tsx                   OAuth catch-all
    ├── auth.login/                  login form
    └── webhooks.app.*               webhook handlers (incl GDPR)
convex/
├── _generated/                      codegen + AI guidelines (committed)
├── lib/
│   ├── auth.ts                      requireShopifyAuth (HS256 JWT verifier)
│   └── rateLimit.ts                 simple per-key rate limiter
├── crons.ts                         scheduled cleanup
├── schema.ts                        sessions, shops, rateLimits tables
├── sessions.ts                      session CRUD (internal)
└── shops.ts                         shop CRUD + public get action
extensions/                          Shopify extensions workspace (optional)
react-router.config.ts               Vercel preset + SSR enabled
shopify.app.toml                     Shopify app config (filled by --reset)
vercel.json                          Vercel framework + build hint
```

## Env vars

| Variable | Where | Purpose |
|---|---|---|
| `SHOPIFY_API_KEY` | `.env`, Vercel, Convex | Public key — App Bridge audience claim |
| `SHOPIFY_API_SECRET` | `.env`, Vercel, Convex | Secret — JWT HS256 signing key |
| `SHOPIFY_APP_URL` | `.env`, Vercel | Public app URL (Vercel domain in prod) |
| `SCOPES` | `.env`, Vercel | OAuth scopes — keep in sync with `shopify.app.toml` |
| `SHOP_CUSTOM_DOMAIN` | optional | Custom shop hostname (otherwise only `*.myshopify.com`) |
| `CONVEX_URL` | `.env`, Vercel | Convex deployment URL (server-side) |
| `VITE_CONVEX_URL` | `.env`, Vercel | Same URL exposed to client bundle |
| `CONVEX_DEPLOY_KEY` | `.env`, Vercel | Admin auth for `ConvexHttpClient.setAdminAuth` |
| `BILLING_PROVIDER` | `.env`, Vercel | `none` (default) \| `mantle` |
| `MANTLE_APP_ID` | `.env`, Vercel | Mantle dashboard → Settings → Apps |
| `MANTLE_API_KEY` | `.env`, Vercel | Mantle dashboard → Settings → Apps |

## Local Convex notes

`shopify.app.toml` and `.env` keep the Shopify-side server config; Convex CLI project selection lives in `.env.local`.

`npm run convex:dev` wraps the CLI:

- runs `convex dev --env-file .env.local`
- avoids the `InvalidDeploymentName` error from the CLI reading the local admin key from `.env`
- watches `.convex/local/default/config.json` and refreshes `.env` on change

If you previously linked a Convex Cloud dev deployment (`CONVEX_DEPLOYMENT=dev:...` in `.env.local`) and want to switch back to local:

```bash
npm run convex:reset-to-local
```

That backs up `.env.local` to `.env.local.cloud.bak`, recreates the local backend, repopulates `.env`, and re-syncs Shopify keys. Restore the cloud config any time with `mv .env.local.cloud.bak .env.local`.

If you'd rather stay on cloud dev, generate a deploy key from the [Convex dashboard](https://dashboard.convex.dev) → Settings → Deploy Keys and paste it into `.env` as `CONVEX_DEPLOY_KEY`. The Convex CLI cannot generate this for you.

## Convex AI files

The repo includes `npx convex ai-files install` artifacts so Claude Code (and any compatible AI assistant) can read Convex usage guidelines:

- `convex/_generated/ai/guidelines.md` — committed
- `.claude/skills/` — Convex agent skills installed locally
- `convex.json` — pins `aiFiles.skills.agents = ["claude-code"]` so refresh skips Codex

To refresh: `npx convex ai-files install`.

## Dependency updates

Renovate opens grouped PRs weekly. Patch, minor (Biome only), `@types/*`, and security fixes auto-merge after CI green. Majors gated via the Dependency Dashboard. Convex upgrades trigger `npx convex codegen` post-install to keep `_generated/` in sync.

## Worktrees & Conductor

This template assumes a single working tree. If you use [Conductor](https://conductor.build) (or any `git worktree` setup), each worktree gets its own gitignored `.env` and `.env.local`. Setting up env in one workspace **does not** propagate to peer worktrees — copy them by hand:

```bash
# from a peer worktree
cp ../<peer-name>/.env .
cp ../<peer-name>/.env.local .
npm run convex:env:sync   # re-bind keys to this worktree's local Convex
```

If you run inside Conductor, set the workspace **Run Script** to `npm run convex:dev`. Claude can then read backend logs live via the `mcp__conductor__GetTerminalOutput` MCP tool while debugging — no copy-paste required. Other useful Conductor MCP tools while iterating on this template: `GetWorkspaceDiff`, `AskUserQuestion`, `DiffComment`.

## Package manager

This template ships with **npm** (committed `package-lock.json`, `npm exec` in `shopify.web.toml`, `workspaces` field in `package.json`). Stick with npm unless you have a specific reason to switch.

To migrate to pnpm:

1. Create `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - "extensions/*"

   onlyBuiltDependencies:
     - "@parcel/watcher"
     - esbuild
   ```
2. Edit `shopify.web.toml`: `dev = "npm exec react-router dev"` → `dev = "pnpm exec react-router dev"`
3. Delete `node_modules` and `package-lock.json`, then `pnpm install`
4. Optionally remove the `workspaces` field from `package.json` (now redundant)

> Editing `pnpm-workspace.yaml` by hand is required — `pnpm config set --location project onlyBuiltDependencies '...'` corrupts the YAML in pnpm 10.33.

## License

MIT.
