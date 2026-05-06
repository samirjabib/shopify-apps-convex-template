#!/usr/bin/env node
import { spawnSync } from "node:child_process";
// Recovery: switch a stuck cloud-dev Convex setup back to a local backend.
// Backs up .env.local first, then re-creates a local deployment, populates
// CONVEX_* keys in .env, and re-syncs Shopify auth vars to the local runtime.
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const envLocalPath = join(projectRoot, ".env.local");
const backupPath = join(projectRoot, ".env.local.cloud.bak");

function step(label, fn) {
  console.log(`\n▶ ${label}`);
  return fn();
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  return r.status ?? 0;
}

step("Back up .env.local", () => {
  if (existsSync(envLocalPath)) {
    copyFileSync(envLocalPath, backupPath);
    console.log(`  saved to ${backupPath}`);
  } else {
    console.log("  no .env.local — skipping");
  }
});

step("Create local Convex backend", () => {
  // Idempotent: ignore exit code (errors when backend already exists)
  run("npx", ["convex", "deployment", "create", "local", "--select"]);
});

step("Boot Convex once to fill .env.local", () => {
  if (run("npm", ["run", "convex:dev", "--", "--once"]) !== 0) {
    console.error("convex:dev --once failed.");
    process.exit(1);
  }
});

step("Populate CONVEX_* in .env", () => {
  if (run(process.execPath, ["scripts/convex-key.js"]) !== 0) {
    process.exit(1);
  }
});

step("Re-sync Shopify auth vars to local Convex", () => {
  if (run("npm", ["run", "convex:env:sync"]) !== 0) {
    process.exit(1);
  }
});

console.log("\n✔ Reset to local complete.");
console.log("Restore the cloud config any time with:");
console.log(`  mv ${backupPath} ${envLocalPath}`);
