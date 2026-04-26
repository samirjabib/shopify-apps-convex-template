#!/usr/bin/env node
// Post-clone bootstrap. Run once after `shopify app init --template ...`
// or `git clone` to:
//   1. Copy .env.example → .env (if missing)
//   2. Create local Convex backend (idempotent)
//   3. Boot Convex once to populate .env with CONVEX_* keys
//   4. Sync Shopify auth vars from .env into the Convex runtime
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

function step(label, fn) {
  console.log(`\n▶ ${label}`);
  fn();
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  return r.status ?? 0;
}

step("Bootstrap .env", () => {
  if (!existsSync(".env")) {
    copyFileSync(".env.example", ".env");
    console.log("  .env created from .env.example");
  } else {
    console.log("  .env already exists — skipped");
  }
});

step("Create local Convex backend", () => {
  // Idempotent: ignore exit code (errors when backend already exists)
  run("npx", ["convex", "deployment", "create", "local", "--select"]);
});

step("Boot Convex once (fills CONVEX_* vars in .env)", () => {
  run("npm", ["run", "convex:dev", "--", "--once"]);
});

step("Sync Shopify auth vars into Convex", () => {
  if (!existsSync(".env")) return;
  // Best-effort — works once user has filled SHOPIFY_API_KEY/SECRET in .env.
  run("npm", ["run", "convex:env:sync"]);
});

console.log("\n✔ Setup complete.\n");
console.log("Next steps:");
console.log("  1. Edit .env — fill SHOPIFY_API_KEY, SHOPIFY_API_SECRET (Partner Dashboard)");
console.log("  2. Run `npm run convex:env:sync` again after editing .env");
console.log("  3. Two terminals: `npm run dev` + `npm run convex:dev`");
console.log("  4. First time? `npm run dev -- --reset` to link to a Shopify app");
