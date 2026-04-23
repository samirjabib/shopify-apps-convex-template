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
3. `npm run convex:dev -- --once` — initializes the local Convex deployment and writes local Convex connection values into `.env`
4. Create `.env` from `.env.example`, fill:
   - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`
   - `CONVEX_URL` (same as `.env.local`), `VITE_CONVEX_URL` (same), `CONVEX_DEPLOY_KEY`
5. `npm run convex:env:sync` — copies `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, and optional `SHOP_CUSTOM_DOMAIN` from `.env` into the local Convex deployment
6. Two terminals: `npm run dev` + `npm run convex:dev`

### Local Convex note

This repo keeps the app server settings in `.env`, but Convex CLI project selection lives in `.env.local`.

Use `npm run convex:dev` for local development. The wrapper script:

- runs `convex dev --env-file .env.local`
- avoids the `InvalidDeploymentName` error caused by the CLI reading the local admin key from `.env`
- updates `.env` from `.convex/local/default/config.json` whenever the local backend changes

If you need to invoke the CLI directly, use `npx convex dev --env-file .env.local`.

### Convex env sync

This template uses direct `browser -> Convex` calls for app business logic. Because Convex verifies the Shopify session token itself, the local Convex runtime also needs Shopify credentials.

Use `npm run convex:env:sync` after updating `.env` or rotating Shopify credentials. It syncs:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOP_CUSTOM_DOMAIN` when present

Without that sync, public Convex functions that verify Shopify session tokens will fail with `Server misconfigured`.

## Architecture pattern

This template is intentionally hybrid:

- Shopify server handles platform concerns: OAuth, Admin API, webhooks, installation lifecycle, and any operation that needs Shopify credentials or offline sessions.
- Convex handles app business logic: reactive dashboards, analytics, derived state, background workflows, and subscriptions consumed directly by the browser.

Think about it as:

- Shopify = source of truth for platform data
- Convex = reactive source of truth for your app's business state

Recommended flow:

1. The browser reads business state directly from Convex for reactive UI.
2. The Shopify server performs platform operations against Shopify Admin API.
3. The server writes projections, state transitions, and workflow updates into Convex.
4. Convex pushes those changes back to the browser in real time.

Use direct `browser -> Convex` access when the data belongs to your app and benefits from realtime updates. Keep `browser -> server -> Shopify` for platform actions like products, orders, inventory, customers, installation, and webhook handling.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Shopify CLI dev with embedded app tunnel |
| `npm run convex:dev` | Convex dev server + codegen watcher + local `.env` sync |
| `npm run convex:env:sync` | Sync Shopify auth vars from `.env` into the local Convex deployment |
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
- That verification runs inside Convex, so `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` must exist in the Convex runtime as well as in the app server runtime
- See `convex/lib/auth.ts` for `requireShopifyAuth`

## Dependency updates

Renovate opens grouped PRs weekly. Patch, minor (Biome only), `@types/*`, and security fixes auto-merge after CI green. Majors gated via the Dependency Dashboard. Convex upgrades run `npx convex codegen` post-install to keep `_generated/` in sync.

## License

MIT.
