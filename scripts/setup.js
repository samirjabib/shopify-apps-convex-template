#!/usr/bin/env node
// Post-clone bootstrap. Run once after `shopify app init --template ...`
// or `git clone` to:
//   1. Copy .env.example → .env (if missing)
//   2. Link the Shopify app (skipped if already linked) and pull API keys via
//      `shopify app env pull` so the user does not need to copy/paste from the
//      Partner Dashboard manually.
//   3. Create a local Convex backend (idempotent)
//   4. Boot Convex once to write .env.local + populate CONVEX_* keys in .env
//   5. Sync Shopify auth vars from .env into the Convex runtime
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

function appIsLinked() {
  // shopify.app.toml ships with `client_id = ""`; once linked the CLI fills it.
  if (!existsSync("shopify.app.toml")) return false;
  const toml = readFileSync("shopify.app.toml", "utf8");
  const m = toml.match(/^client_id\s*=\s*"([^"]*)"/m);
  return Boolean(m && m[1]);
}

step("Bootstrap .env", () => {
  if (!existsSync(".env")) {
    copyFileSync(".env.example", ".env");
    console.log("  .env created from .env.example");
  } else {
    console.log("  .env already exists — skipped");
  }
});

step("Link Shopify app (interactive if not linked)", () => {
  if (appIsLinked()) {
    console.log("  shopify.app.toml already has client_id — skipped");
    return;
  }
  // Interactive: prompts user to pick existing app or create new one.
  if (run("npx", ["shopify", "app", "config", "link"]) !== 0) {
    console.error(
      "  shopify app config link failed. Re-run setup once you finish the prompts.",
    );
    process.exit(1);
  }
});

step("Pull Shopify API keys into .env (`shopify app env pull`)", () => {
  if (run("npx", ["shopify", "app", "env", "pull"]) !== 0) {
    console.warn(
      "  shopify app env pull failed — fill SHOPIFY_API_KEY/SECRET in .env manually before re-running.",
    );
  }
});

step("Create local Convex backend", () => {
  // Idempotent: ignore exit code (errors when backend already exists)
  run("npx", ["convex", "deployment", "create", "local", "--select"]);
});

step("Boot Convex once (writes .env.local, fills CONVEX_* in .env)", () => {
  run("npm", ["run", "convex:dev", "--", "--once"]);
});

step("Mirror CONVEX_* keys into .env (defensive)", () => {
  // The convex:dev wrapper runs convex-key.js via a config-mtime watcher, but
  // running it explicitly here removes any race window when --once exits fast.
  run(process.execPath, ["scripts/convex-key.js"]);
});

step("Sync Shopify auth vars into Convex", () => {
  if (!existsSync(".env")) return;
  run("npm", ["run", "convex:env:sync"]);
});

console.log("\n✔ Setup complete.\n");
console.log("Next steps:");
console.log(
  "  1. `npm run dev:all` — runs RR7 + Convex local backend together",
);
console.log("     OR two terminals: `npm run dev` + `npm run convex:dev`");
console.log(
  "  2. Stuck on a cloud Convex deployment? `npm run convex:reset-to-local`",
);
