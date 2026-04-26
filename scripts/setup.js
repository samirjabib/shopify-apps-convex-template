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

// Detect the active package manager from npm_config_user_agent (set by every
// modern PM). Falls back to lockfile sniffing, then to npm.
function detectPM() {
  const ua = process.env.npm_config_user_agent || "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  if (ua.startsWith("npm")) return "npm";
  if (existsSync("pnpm-lock.yaml")) return "pnpm";
  if (existsSync("yarn.lock")) return "yarn";
  if (existsSync("bun.lockb") || existsSync("bun.lock")) return "bun";
  return "npm";
}

const PM = detectPM();

// `pnpm/yarn/bun run X --flag` passes flags directly. `npm run X` needs `--`
// to forward extra args. Normalize here.
function runScript(script, scriptArgs = []) {
  const args = ["run", script];
  if (scriptArgs.length > 0) {
    if (PM === "npm") args.push("--", ...scriptArgs);
    else args.push(...scriptArgs);
  }
  return run(PM, args);
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
  runScript("convex:dev", ["--once"]);
});

step("Sync Shopify auth vars into Convex", () => {
  // Reads .env *and* falls back to process.env, so works even if pull was skipped.
  runScript("convex:env:sync");
});

console.log("\n✔ Setup complete.\n");
console.log(`Detected package manager: ${PM}`);
console.log("Next steps:");
console.log(`  Two terminals: \`${PM} run dev\` + \`${PM} run convex:dev\``);
console.log(
  `  Re-link or switch apps later: \`${PM} run dev ${PM === "npm" ? "-- " : ""}--reset\``,
);
