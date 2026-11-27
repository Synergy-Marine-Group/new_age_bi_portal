/**
 * Runs on `npm ci` postinstall during Amplify preBuild.
 * Writes .env.production when branch env is present so legacy grep-only build specs still get LAMBDA_DB_BRIDGE_*.
 */
import { writeFileSync } from "node:fs";

// Server-side variables read at runtime by src/lib/** and src/app/api/**.
// Keep this list in sync with the code; only set values are written.
const EXACT_KEYS = [
  // Auth / SSO
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_REDIRECT_URI",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "SSO_SESSION_TIMEOUT_HOURS",
  // Lambda DB bridge (Amplify SSR -> Lambda -> RDS)
  "LAMBDA_DB_BRIDGE_URL",
  "LAMBDA_DB_BRIDGE_SECRET",
  "SQL_CONNECTION_STRING",
  // Azure Function + Power BI embed token
  "AZURE_FUNCTION_BASE",
  "AZURE_FUNCTION_CODE",
  "AZURE_EMBED_FUNCTION_PATH",
  "PBI_TENANT_ID",
  "PBI_CLIENT_ID",
  "PBI_CLIENT_SECRET",
  "PBI_EMBED_SP_CLIENT_ID",
  "PBI_WORKSPACE_IDENTITY_DATASET_IDS",
  "PBI_METADATA_ROOT",
  "SMART_PBI_TENANT_ID",
  "SMART_PBI_CLIENT_ID",
  "SMART_PBI_CLIENT_SECRET",
  // Smart orchestrator / Azure OpenAI
  "SMART_ORCHESTRATOR_URL",
  "SMART_ORCHESTRATOR_SECRET",
  "SMART_AUTO_START_AGENTS",
  "PORTAL_JWT_SECRET",
  "MCP_SHARED_SECRET",
  "SEMANTIQ_HTTP_URL",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT",
  "BI_API_BASE",
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