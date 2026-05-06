#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readEnvFile } from "./lib/env.js";

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

// Merge: .env file values override process.env (file is source of truth when present),
// but process.env fills gaps when .env is missing or partially empty.
// This lets `shopify app dev` runtime injection feed the sync transparently.
const fileEnv = readEnvFile(envPath);
const env = { ...process.env, ...fileEnv };

const requiredKeys = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"];
const missingKeys = requiredKeys.filter((key) => !env[key]);

if (missingKeys.length > 0) {
  console.error(
    `Missing required Shopify variables: ${missingKeys.join(", ")}`,
  );
  console.error(
    "Populate them in .env (or export in shell), then rerun `npm run convex:env:sync`.",
  );
  console.error(
    "Tip: `shopify app env pull` writes them into .env automatically once the app is linked.",
  );
  process.exit(1);
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
