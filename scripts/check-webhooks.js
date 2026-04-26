#!/usr/bin/env node
// Verify every webhook URI in shopify.app.toml has a matching route file in
// app/routes/, and that no orphan webhook route files exist. Exits non-zero
// on mismatch so it can gate CI.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TOML = "shopify.app.toml";
const ROUTES_DIR = join("app", "routes");

function uriToRouteFile(uri) {
  // /webhooks/customers/data_request → webhooks.customers.data_request.tsx
  const trimmed = uri.replace(/^\/+/, "").replace(/\/+$/, "");
  return `${trimmed.split("/").join(".")}.tsx`;
}

function extractWebhookUris(toml) {
  const uris = [];
  const re = /uri\s*=\s*"([^"]+)"/g;
  for (const match of toml.matchAll(re)) {
    if (match[1].startsWith("/webhooks/")) uris.push(match[1]);
  }
  return uris;
}

const toml = readFileSync(TOML, "utf8");
const uris = extractWebhookUris(toml);
const routeFiles = new Set(
  readdirSync(ROUTES_DIR).filter(
    (f) => f.startsWith("webhooks.") && f.endsWith(".tsx"),
  ),
);

const errors = [];
const expected = new Set();

for (const uri of uris) {
  const file = uriToRouteFile(uri);
  expected.add(file);
  if (!routeFiles.has(file)) {
    errors.push(`Missing handler: ${uri} → expected app/routes/${file}`);
  }
}

// Allow these without a TOML entry (mounted by URL but not subscribed via toml).
const allowedExtras = new Set(["webhooks.mantle.tsx"]);
for (const file of routeFiles) {
  if (!expected.has(file) && !allowedExtras.has(file)) {
    errors.push(
      `Orphan route: app/routes/${file} has no matching uri in ${TOML}`,
    );
  }
}

if (errors.length > 0) {
  console.error("Webhook consistency check failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✔ ${uris.length} webhook URIs match route files.`);
