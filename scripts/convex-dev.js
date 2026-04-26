#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const configPath = join(
  projectRoot,
  ".convex",
  "local",
  "default",
  "config.json",
);
const convexBin = process.platform === "win32" ? "npx.cmd" : "npx";

let lastConfigMtimeMs = 0;
let syncInFlight = false;

const convexProcess = spawn(
  convexBin,
  ["convex", "dev", "--env-file", ".env.local", ...process.argv.slice(2)],
  {
    cwd: projectRoot,
    stdio: "inherit",
  },
);

async function syncLocalEnv() {
  if (syncInFlight) {
    return;
  }
  syncInFlight = true;

  const syncProcess = spawn(process.execPath, ["scripts/convex-key.js"], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  await new Promise((resolve) => {
    syncProcess.on("exit", resolve);
    syncProcess.on("error", resolve);
  });

  syncInFlight = false;
}

const syncTimer = setInterval(() => {
  if (!existsSync(configPath)) {
    return;
  }

  const nextMtimeMs = statSync(configPath).mtimeMs;
  if (nextMtimeMs <= lastConfigMtimeMs) {
    return;
  }

  lastConfigMtimeMs = nextMtimeMs;
  void syncLocalEnv();
}, 1000);

function cleanupAndExit(code) {
  clearInterval(syncTimer);
  process.exit(code ?? 0);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearInterval(syncTimer);
    if (!convexProcess.killed) {
      convexProcess.kill(signal);
      return;
    }
    process.exit(0);
  });
}

convexProcess.on("exit", (code, signal) => {
  clearInterval(syncTimer);
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  cleanupAndExit(code);
});

convexProcess.on("error", () => {
  cleanupAndExit(1);
});
