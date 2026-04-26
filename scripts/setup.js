#!/usr/bin/env node
// Post-clone bootstrap. Run once after `shopify app init --template ...`
// or `git clone` to:
//   1. Copy .env.example → .env (if missing)
//   2. Link Shopify app + pull SHOPIFY_API_KEY/SECRET via Shopify CLI
//   3. Create local Convex backend (idempotent)
//   4. Boot Convex once to populate .env with CONVEX_* keys
//   5. Sync Shopify auth vars into the Convex runtime
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";

function step(label, fn) {
  console.log(`\n▶ ${label}`);
  return fn();
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  return r.status ?? 0;
}

function tomlIsLinked() {
  if (!existsSync("shopify.app.toml")) return false;
  const toml = readFileSync("shopify.app.toml", "utf8");
  const match = toml.match(/^\s*client_id\s*=\s*"([^"]*)"/m);
  return Boolean(match && match[1]);
}

step("Bootstrap .env", () => {
  if (!existsSync(".env")) {
    copyFileSync(".env.example", ".env");
    console.log("  .env created from .env.example");
  } else {
    console.log("  .env already exists — skipped");
  }
});

step("Link Shopify app", () => {
  if (tomlIsLinked()) {
    console.log("  shopify.app.toml already has client_id — skipped");
    return;
  }
  console.log("  Running `shopify app config link` (interactive)...");
  run("npx", ["shopify", "app", "config", "link"]);
});

step(
  "Pull Shopify env vars (SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SCOPES)",
  () => {
    if (!tomlIsLinked()) {
      console.log(
        "  Skipped — app not linked. Run `npx shopify app env pull` later.",
      );
      return;
    }
    run("npx", ["shopify", "app", "env", "pull"]);
  },
);

step("Create local Convex backend", () => {
  // Idempotent: ignore exit code (errors when backend already exists)
  run("npx", ["convex", "deployment", "create", "local", "--select"]);
});

step("Boot Convex once (fills CONVEX_* vars in .env)", () => {
  run("npm", ["run", "convex:dev", "--", "--once"]);
});

step("Sync Shopify auth vars into Convex", () => {
  // Reads .env *and* falls back to process.env, so works even if pull was skipped.
  run("npm", ["run", "convex:env:sync"]);
});

console.log("\n✔ Setup complete.\n");
console.log("Next steps:");
console.log("  Two terminals: `npm run dev` + `npm run convex:dev`");
console.log("  Re-link or switch apps later: `npm run dev -- --reset`");
