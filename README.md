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

**Recommended — Shopify CLI:**

```bash
shopify app init --template https://github.com/samirjabib/shopify-apps-convex-template
```

Shopify CLI clones the template, runs `npm install`, prompts you to:

1. Sign in to your Shopify Partner account
2. **Connect to existing app** (use one already in Partner Dashboard) **or** **Create a new app** (CLI provisions it)
3. Pick a **dev store** for installation

When done, `shopify.app.toml` has `client_id` + URLs filled in.

**Alternatives:**

- **GitHub Template** → click [Use this template](https://github.com/samirjabib/shopify-apps-convex-template/generate) on the repo. **Prefer this over Fork** — Fork inherits the upstream PR target and the "forked-from" badge. If you already forked, detach via _Settings → Danger Zone → "Leave fork network"_ before pushing work.
- **Manual clone:**
  ```bash
  git clone https://github.com/samirjabib/shopify-apps-convex-template.git my-app
  cd my-app && nvm use
  npm install     # or: pnpm install / yarn / bun install
  npm run dev -- --reset    # pnpm/yarn/bun: drop the `--`
  ```

> Need to re-link or switch apps later? `npm run dev -- --reset` (or `pnpm dev --reset`).

### Package manager

Both **npm** (default lockfile) and **pnpm** are first-class. Yarn and Bun should work too. `setup.js` detects the active PM via `npm_config_user_agent` and routes script invocations through it. `.npmrc` pins `shamefully-hoist=true` so the Convex CLI (which walks `node_modules` for codegen) works under pnpm without surprises.

Pick one and stick with it — don't commit two lockfiles.

### Squashing template git history (optional)

`Use this template` already gives you a single root commit. If you cloned/forked instead and want a clean history:

```bash
git checkout --orphan fresh-start
git commit -m "chore: initial commit"
git update-ref refs/heads/main HEAD
git push --force origin main
```

## First run — bootstrap

After Shopify CLI / GitHub Template / clone is in place, run:

```bash
npm run setup
```

That single command:

1. Copies `.env.example` → `.env` (if missing)
2. Runs `shopify app config link` (if `client_id` not yet in `shopify.app.toml`) to link your Partner-Dashboard app
3. Runs `shopify app env pull` to populate `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES` in `.env`
4. Registers a **local Convex backend** (`npx convex deployment create local --select`)
5. Boots Convex once to populate `CONVEX_URL`, `VITE_CONVEX_URL`, `CONVEX_DEPLOY_KEY` in `.env`
6. Syncs Shopify auth vars into the Convex runtime (reads `.env` _and_ falls back to `process.env`)

> Why `setup` matters: `app/convex.server.ts` throws at module load if `CONVEX_DEPLOY_KEY` is missing, and the JWT validator inside Convex needs `SHOPIFY_API_SECRET`. The script handles both prerequisites in one shot.

If you ever need to refresh Shopify creds after rotation:

```bash
npx shopify app env pull && npm run convex:env:sync
```

Two-terminal dev workflow:

```bash
# terminal 1
npm run dev

# terminal 2
npm run convex:dev
```

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

- `customers/data_request` → `app/routes/webhooks.customers.data_request.tsx`
- `customers/redact` → `app/routes/webhooks.customers.redact.tsx`
- `shop/redact` → `app/routes/webhooks.shop.redact.tsx` (purges sessions + shop record from Convex)

The `data_request` and `customers/redact` handlers acknowledge by default — customize them when your app stores customer-scoped data.

> `npm run check:webhooks` diffs `shopify.app.toml` URIs against route files. Wire it into CI to catch drift.

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
| `npm run setup` | One-shot post-clone bootstrap (Convex local + .env scaffold) |
| `npm run dev` | Shopify CLI dev with embedded app tunnel |
| `npm run dev -- --reset` | Re-link to a Shopify app (existing or new) |
| `npm run convex:dev` | Convex dev server + codegen watcher + local `.env` sync |
| `npm run convex:env:sync` | Sync Shopify auth vars from `.env` (or `process.env`) into the local Convex deployment |
| `npm run check:webhooks` | Verify webhook URIs in `shopify.app.toml` match route files in `app/routes/` |
| `npm run convex:deploy` | Deploy Convex schema + functions to production |
| `npm run convex:key` | Re-sync `CONVEX_DEPLOY_KEY` from local backend config |
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

If you previously linked a Convex Cloud dev deployment (`CONVEX_DEPLOYMENT=dev:...` in `.env.local`) and want to switch to local, back it up first: `cp .env.local .env.local.cloud.bak`. Restore is one `mv` away.

### Working with git worktrees (Conductor)

Conductor uses git worktrees, so each workspace has its own working tree at `~/conductor/workspaces/<repo>/<workspace>/` and the root tree at `~/conductor/repos/<repo>/`. `.env` and `.env.local` are gitignored and **per-worktree** — they do not propagate. After running `npm run setup` in one worktree, copy them across when you need a peer worktree to run:

```bash
cp .env .env.local /path/to/peer/worktree/
```

Or rerun `npm run setup` in the new worktree (it's idempotent).

## Convex AI files

The repo includes `npx convex ai-files install` artifacts so Claude Code (and any compatible AI assistant) can read Convex usage guidelines:

- `convex/_generated/ai/guidelines.md` — committed
- `.claude/skills/` — Convex agent skills installed locally
- `convex.json` — pins `aiFiles.skills.agents = ["claude-code"]` so refresh skips Codex

To refresh: `npx convex ai-files install`.

## Dependency updates

Renovate opens grouped PRs weekly. Patch, minor (Biome only), `@types/*`, and security fixes auto-merge after CI green. Majors gated via the Dependency Dashboard. Convex upgrades trigger `npx convex codegen` post-install to keep `_generated/` in sync.

## License

MIT.
