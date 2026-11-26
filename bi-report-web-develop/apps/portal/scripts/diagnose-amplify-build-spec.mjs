/**
 * Local diagnostic: compares workspace Amplify YAML vs legacy grep build (Amplify cloud evidence).
 */
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const portalRoot = resolve(__dirname, "..");
const repoRoot = resolve(portalRoot, "..", "..");
const DEBUG_LOG = join(repoRoot, ".cursor", "debug-a5396f.log");
const SESSION = "a5396f";

/** @param {Record<string, unknown>} payload */
function agentLog(payload) {
  const line = JSON.stringify({
    sessionId: SESSION,
    timestamp: Date.now(),
    ...payload,
  });
  try {
    appendFileSync(DEBUG_LOG, `${line}\n`, "utf8");
  } catch {
    // ignore
  }
  // #region agent log
  fetch("http://127.0.0.1:7552/ingest/b0f4f508-7ce8-434e-b94d-0fd5fb6cd268", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION },
    body: line,
  }).catch(() => {});
  // #endregion
}

const candidates = [
  { id: "repo-root", path: join(repoRoot, "amplify.yml"), hypothesisId: "H2" },
  { id: "portal-duplicate", path: join(portalRoot, "amplify.yml"), hypothesisId: "H4" },
  { id: "parent-template", path: join(repoRoot, "amplify.parent-monorepo.yml"), hypothesisId: "H1" },
];

const LEGACY_GREP =
  /env\s*\|\s*grep.*SQL_CONNECTION_STRING.*>>\s*\.env\.production(?!.*\|\|\s*true)/;
const V3_MARKER = /lambda-db-bridge-v3/;
const NODE_WRITER = /amplify-write-env-production\.mjs/;

/** @type {Array<{ id: string, exists: boolean, legacyGrep: boolean, v3: boolean, nodeWriter: boolean, appRoot: string | null }>} */
const results = [];

for (const { id, path, hypothesisId } of candidates) {
  const exists = existsSync(path);
  let legacyGrep = false;
  let v3 = false;
  let nodeWriter = false;
  let appRoot = null;
  if (exists) {
    const text = readFileSync(path, "utf8");
    legacyGrep = LEGACY_GREP.test(text) || (text.includes("env | grep") && !text.includes("|| true"));
    v3 = V3_MARKER.test(text);
    nodeWriter = NODE_WRITER.test(text);
    const m = text.match(/appRoot:\s*(\S+)/);
    appRoot = m ? m[1] : null;
  }
  results.push({ id, exists, legacyGrep, v3, nodeWriter, appRoot });
  agentLog({
    runId: "local-diagnose",
    hypothesisId,
    location: "diagnose-amplify-build-spec.mjs",
    message: `spec file ${id}`,
    data: { path, exists, legacyGrep, v3, nodeWriter, appRoot },
  });
}

const cloudEvidence = {
  showsLegacyGrep: true,
  showsV3Echo: false,
  showsLambdaBridgeGrep: false,
  failedCommand: "env | grep -e '^SQL_CONNECTION_STRING=' >> .env.production (no || true)",
};

agentLog({
  runId: "local-diagnose",
  hypothesisId: "H3",
  location: "diagnose-amplify-build-spec.mjs",
  message: "Amplify cloud build log evidence (user report 2026-11-26T08:14:39Z)",
  data: cloudEvidence,
});

const workspaceOk = results.some((r) => r.exists && r.v3 && r.nodeWriter && !r.legacyGrep);
const parentTemplateOk =
  results.find((r) => r.id === "parent-template")?.v3 &&
  results.find((r) => r.id === "parent-template")?.nodeWriter;

agentLog({
  runId: "local-diagnose",
  hypothesisId: "H1",
  location: "diagnose-amplify-build-spec.mjs",
  message: "diagnosis summary",
  data: {
    workspaceSpecReady: workspaceOk,
    parentMonorepoTemplateReady: Boolean(parentTemplateOk),
    likelyCause:
      cloudEvidence.showsLegacyGrep && workspaceOk
        ? "Amplify is not building the commit/repo that contains v3 amplify.yml (parent repo root or console override)."
        : "local amplify.yml still legacy",
    userAppRootInConsole: "bi-report-web-develop/apps/portal",
    deployActionIfParentRepo:
      "Copy amplify.parent-monorepo.yml to <git-root>/amplify.yml on the repo Amplify connects to, commit, push, redeploy.",
  },
});

console.log(JSON.stringify({ workspaceOk, results, cloudEvidence }, null, 2));
process.exit(workspaceOk ? 0 : 1);