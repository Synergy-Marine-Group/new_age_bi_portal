/**
 * Writes apps/portal/.env.production from Amplify branch env (no grep — missing vars are OK).
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _debugLog = resolve(_scriptDir, "..", "..", "..", ".cursor", "debug-a5396f.log");

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
const summary = {
  lineCount: lines.length,
  bridge: Boolean(process.env.LAMBDA_DB_BRIDGE_URL),
  keysWritten: lines.map((l) => l.split("=")[0]),
};
console.log(
  `amplify-write-env-production: wrote ${summary.lineCount} var(s) (bridge=${summary.bridge})`,
);
// #region agent log
try {
  appendFileSync(
    _debugLog,
    `${JSON.stringify({
      sessionId: "a5396f",
      runId: "amplify-env-writer",
      hypothesisId: "H5",
      location: "amplify-write-env-production.mjs",
      message: "wrote .env.production",
      data: summary,
      timestamp: Date.now(),
    })}\n`,
  );
} catch {
  /* amplify build */
}
fetch("http://127.0.0.1:7552/ingest/b0f4f508-7ce8-434e-b94d-0fd5fb6cd268", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a5396f" },
  body: JSON.stringify({
    sessionId: "a5396f",
    runId: "amplify-env-writer",
    hypothesisId: "H5",
    location: "amplify-write-env-production.mjs",
    message: "wrote .env.production",
    data: summary,
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion