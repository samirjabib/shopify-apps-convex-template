#!/usr/bin/env node
// Lint: every URI in shopify.app.toml [[webhooks.subscriptions]] must map to
// a route file under app/routes/. flatRoutes converts dots to "/", so URI
// /webhooks/app/customers_data_request expects webhooks.app.customers_data_request.tsx.
// Exits 1 on drift so CI catches misconfigured webhooks before deploy.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const tomlPath = join(projectRoot, "shopify.app.toml");
const routesDir = join(projectRoot, "app", "routes");

if (!existsSync(tomlPath)) {
  console.error("shopify.app.toml not found.");
  process.exit(1);
}

if (!existsSync(routesDir)) {
  console.error("app/routes/ not found.");
  process.exit(1);
}

const toml = readFileSync(tomlPath, "utf8");

// Collect every `uri = "..."` value within a [[webhooks.subscriptions]] block.
// Split the file on `[[webhooks.subscriptions]]`, then for each chunk read up
// to the next TOML table header (single or double brackets at any indent).
const uris = [];
const chunks = toml.split(/\[\[webhooks\.subscriptions\]\]/).slice(1);
for (const chunk of chunks) {
  const nextHeader = chunk.search(/^\s*\[/m);
  const body = nextHeader === -1 ? chunk : chunk.slice(0, nextHeader);
  const uriMatch = body.match(/^\s*uri\s*=\s*"([^"]+)"/m);
  if (uriMatch) uris.push(uriMatch[1]);
}

const routeFiles = new Set(
  readdirSync(routesDir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")),
);

function uriToRouteFilename(uri) {
  // "/webhooks/app/customers_data_request" → "webhooks.app.customers_data_request"
  return uri.replace(/^\//, "").replace(/\//g, ".");
}

const missing = [];
for (const uri of uris) {
  const base = uriToRouteFilename(uri);
  if (!routeFiles.has(`${base}.tsx`) && !routeFiles.has(`${base}.ts`)) {
    missing.push({ uri, expected: `${base}.tsx` });
  }
}

if (missing.length > 0) {
  console.error(
    "Webhook URIs in shopify.app.toml have no matching route file:",
  );
  for (const m of missing) {
    console.error(`  ${m.uri}  →  app/routes/${m.expected} (missing)`);
  }
  console.error(
    "\nFix: add the route file, OR remove the subscription from shopify.app.toml.",
  );
  process.exit(1);
}

console.log(`✔ ${uris.length} webhook subscription(s) match route files.`);
