/**
 * Writes apps/portal/.env.production from Amplify branch env (no grep — missing vars are OK).
 */
import { writeFileSync } from "node:fs";

const EXACT_KEYS = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_REDIRECT_URI",
  "JWT_SECRET",
  "LAMBDA_DB_BRIDGE_URL",
  "LAMBDA_DB_BRIDGE_SECRET",
  "SQL_CONNECTION_STRING",
];

/** @param {string} value */
function formatEnvLine(key, value) {
  if (/[\n\r]/.test(value)) {
    return `${key}=${JSON.stringify(value)}`;
  }
  if (/[\s#"'\\]/.test(value) || value.includes("=")) {
    return `${key}=${JSON.stringify(value)}`;
  }
  return `${key}=${value}`;
}

const lines = [];
const seen = new Set();

for (const key of EXACT_KEYS) {
  const value = process.env[key];
  if (value === undefined || value === "") continue;
  lines.push(formatEnvLine(key, value));
  seen.add(key);
}

for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith("NEXT_PUBLIC_")) continue;
  if (value === undefined || value === "") continue;
  lines.push(formatEnvLine(key, value));
}

writeFileSync(".env.production", `${lines.join("\n")}\n`);
console.log(
  `amplify-write-env-production: wrote ${lines.length} var(s) (bridge=${Boolean(process.env.LAMBDA_DB_BRIDGE_URL)})`,
);