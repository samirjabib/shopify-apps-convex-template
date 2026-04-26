#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const envPath = join(projectRoot, ".env");
const envFilePath = join(projectRoot, ".env.local");
const convexBin = process.platform === "win32" ? "npx.cmd" : "npx";

if (!existsSync(envFilePath)) {
  console.error("Missing .env.local file.");
  console.error(
    "Run `npm run convex:dev -- --once` first to initialize the local Convex deployment.",
  );
  process.exit(1);
}

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function setConvexEnvVar(key, value) {
  const result = spawnSync(
    convexBin,
    ["convex", "env", "set", key, value, "--env-file", ".env.local"],
    {
      cwd: projectRoot,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Read .env when present, but always fall back to process.env. Shopify CLI
// (`shopify app dev`) injects SHOPIFY_API_KEY/SECRET at runtime, so a missing
// or empty .env is fine when invoked from a CLI sub-step.
const fileEnv = existsSync(envPath)
  ? parseEnvFile(readFileSync(envPath, "utf8"))
  : {};
const env = new Proxy(
  {},
  { get: (_, key) => fileEnv[key] || process.env[key] || "" },
);

const requiredKeys = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"];
const missingKeys = requiredKeys.filter((key) => !env[key]);

if (missingKeys.length > 0) {
  console.error(
    `Missing required Shopify variables: ${missingKeys.join(", ")}`,
  );
  console.error(
    "Populate them in .env (or run `shopify app env pull`), then rerun `npm run convex:env:sync`.",
  );
  process.exit(1);
}

const keysToSync = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOP_CUSTOM_DOMAIN",
].filter((key) => env[key]);

for (const key of keysToSync) {
  console.log(`Syncing ${key} to Convex...`);
  setConvexEnvVar(key, env[key]);
}

console.log("Convex env sync complete.");
