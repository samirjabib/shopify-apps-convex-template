#!/usr/bin/env node
// Updates CONVEX_DEPLOY_KEY, CONVEX_URL, VITE_CONVEX_URL in .env from local
// Convex backend state. For cloud dev/prod deployments, the Convex CLI cannot
// generate a deploy key — print recovery instructions instead.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readEnvFile, writeEnvVars } from "./lib/env.js";

const projectRoot = process.cwd();
const envLocalPath = join(projectRoot, ".env.local");
const configPath = join(
  projectRoot,
  ".convex",
  "local",
  "default",
  "config.json",
);
const envPath = join(projectRoot, ".env");

const envLocal = readEnvFile(envLocalPath);
const deployment = envLocal.CONVEX_DEPLOYMENT ?? "";

// Cloud dev deployments look like `dev:<name>` or `prod:<name>`.
// Local deployments are written as `local:<name>` (or absent).
const isCloud = /^(dev|prod):/.test(deployment);

if (isCloud) {
  console.error(
    `Cloud Convex deployment detected (CONVEX_DEPLOYMENT=${deployment}).`,
  );
  console.error(
    "convex:key cannot generate a deploy key for cloud deployments.",
  );
  console.error("");
  console.error("Two ways to fix:");
  console.error(
    "  1. Switch to a local backend (recommended for first-time setup):",
  );
  console.error("       npm run convex:reset-to-local");
  console.error("");
  console.error(
    "  2. Generate a key from the Convex dashboard and paste into .env:",
  );
  console.error("       https://dashboard.convex.dev → Settings → Deploy Keys");
  console.error("       CONVEX_DEPLOY_KEY=<paste here>");
  console.error("       CONVEX_URL=<deployment URL from dashboard>");
  console.error("       VITE_CONVEX_URL=<same as CONVEX_URL>");
  process.exit(1);
}

if (!existsSync(configPath)) {
  console.error("No local Convex backend config found at", configPath);
  console.error("Run `npm run convex:dev -- --once` to initialize it.");
  process.exit(1);
}

const { adminKey, ports } = JSON.parse(readFileSync(configPath, "utf8"));
const convexUrl = `http://127.0.0.1:${ports.cloud}`;

writeEnvVars(envPath, {
  CONVEX_DEPLOY_KEY: adminKey,
  CONVEX_URL: convexUrl,
  VITE_CONVEX_URL: convexUrl,
});

console.log("Updated .env:");
console.log(`  CONVEX_DEPLOY_KEY=${adminKey.substring(0, 30)}...`);
console.log(`  CONVEX_URL=${convexUrl}`);
console.log(`  VITE_CONVEX_URL=${convexUrl}`);
