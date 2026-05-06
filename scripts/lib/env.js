// Shared helpers for reading/writing dotenv-style files.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function parseEnvFile(content) {
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

export function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return parseEnvFile(readFileSync(path, "utf8"));
}

export function setEnvVar(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  }
  return `${content.replace(/\s+$/, "")}\n${key}=${value}\n`;
}

export function writeEnvVars(path, updates) {
  let content = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    content = setEnvVar(content, key, value);
  }
  writeFileSync(path, content);
}
