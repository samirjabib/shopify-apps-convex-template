#!/usr/bin/env node
// Updates CONVEX_ADMIN_KEY in .env from local Convex backend state.
// Only needed for local development — cloud deployments must use a real
// deployment admin key from the Convex dashboard (NOT the CLI deploy key).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(
  process.cwd(),
  ".convex",
  "local",
  "default",
  "config.json",
);

if (!existsSync(configPath)) {
  console.error("No local Convex backend config found at", configPath);
  console.error("Run `npx convex dev` first.");
  process.exit(1);
}

const { adminKey, ports } = JSON.parse(readFileSync(configPath, "utf8"));
const convexUrl = `http://127.0.0.1:${ports.cloud}`;

const envPath = join(process.cwd(), ".env");
let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

function setVar(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  }
  return `${content}\n${key}=${value}`;
}

env = setVar(env, "CONVEX_ADMIN_KEY", adminKey);
env = setVar(env, "CONVEX_URL", convexUrl);
env = setVar(env, "VITE_CONVEX_URL", convexUrl);

writeFileSync(envPath, env);
console.log("Updated .env:");
console.log(`  CONVEX_ADMIN_KEY=${adminKey.substring(0, 30)}...`);
console.log(`  CONVEX_URL=${convexUrl}`);
console.log(`  VITE_CONVEX_URL=${convexUrl}`);
