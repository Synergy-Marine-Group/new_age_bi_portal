/**
 * Runs on `npm ci` postinstall during Amplify preBuild.
 * Writes .env.production when branch env is present so legacy grep-only build specs still get LAMBDA_DB_BRIDGE_*.
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

function onAmplifyBuild() {
  return Boolean(process.env.AWS_APP_ID || process.env.AWS_BRANCH);
}

function formatLine(key, value) {
  if (/[\n\r]/.test(value) || /[\s#"'\\]/.test(value) || value.includes("=")) {
    return `${key}=${JSON.stringify(value)}`;
  }
  return `${key}=${value}`;
}

if (!onAmplifyBuild()) {
  console.log("AMPLIFY_ENV_SYNC=skipped-not-amplify");
  process.exit(0);
}

const lines = [];
for (const key of EXACT_KEYS) {
  const value = process.env[key];
  if (value === undefined || value === "") continue;
  lines.push(formatLine(key, value));
}
for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith("NEXT_PUBLIC_")) continue;
  if (value === undefined || value === "") continue;
  lines.push(formatLine(key, value));
}

writeFileSync(".env.production", `${lines.join("\n")}\n`);
console.log(
  `AMPLIFY_ENV_SYNC=postinstall-v1 lines=${lines.length} bridge=${Boolean(process.env.LAMBDA_DB_BRIDGE_URL)}`,
);