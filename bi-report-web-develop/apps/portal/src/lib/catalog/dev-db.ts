import { Pool, type PoolConfig } from "pg";

const REQUIRED_DB_VARS = [
  "BI_REPORT_DB_HOST",
  "BI_REPORT_DB_PORT",
  "BI_REPORT_DB_NAME",
  "BI_REPORT_DB_USER",
  "BI_REPORT_DB_PASSWORD",
] as const;

const POOL_OPTIONS = {
  ssl: { rejectUnauthorized: false } as const,
  max: 6,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 30000,
};

// Config comes only from env vars (set in .env.local locally, Amplify env vars when deployed).
// No file reads: the .NET API's appsettings is not available on the Amplify Linux runtime.
function normalizeConnectionInput(raw: string): string {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function isPostgresUri(value: string): boolean {
  return /^postgres(ql)?:\/\//i.test(normalizeConnectionInput(value));
}

function loadRawConnectionValue(): string {
  const fromAmplify = process.env.SQL_CONNECTION_STRING?.trim();
  if (fromAmplify) {
    return normalizeConnectionInput(fromAmplify);
  }

  const fromConnection = process.env.BI_REPORT_DB_CONNECTION?.trim();
  if (fromConnection) {
    return normalizeConnectionInput(fromConnection);
  }

  if (process.env.BI_REPORT_DB_HOST?.trim()) {
    return "";
  }

  throw new Error(
    `Portal catalog DB is not configured. Set SQL_CONNECTION_STRING, BI_REPORT_DB_CONNECTION, or ${REQUIRED_DB_VARS.join(", ")}.`,
  );
}

function parseNpgsql(connectionString: string): PoolConfig {
  const map: Record<string, string> = {};
  for (const part of connectionString.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    map[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
  }

  const database =
    process.env.BI_REPORT_DB_NAME?.trim() ||
    process.env.BI_REPORT_DATABASE?.trim() ||
    map.database;

  return {
    host: process.env.BI_REPORT_DB_HOST?.trim() || map.host,
    port: Number(process.env.BI_REPORT_DB_PORT?.trim() || map.port || 5432),
    database,
    user: process.env.BI_REPORT_DB_USER?.trim() || map.username || map.user,
    password: process.env.BI_REPORT_DB_PASSWORD?.trim() || map.password,
    ...POOL_OPTIONS,
  };
}

function poolConfigFromPostgresUri(uri: string): PoolConfig {
  return {
    connectionString: normalizeConnectionInput(uri),
    ...POOL_OPTIONS,
  };
}

/** Parse postgres URI without WHATWG URL (handles encoded passwords and avoids ERR_INVALID_URL). */
const POSTGRES_URI_META_RE =
  /^postgres(?:ql)?:\/\/(?:([^:/]+)(?::([^@]*))?@)?([^:@/]+)(?::(\d+))?\/([^?#\s]*)/i;

export function metaFromPostgresUri(uri: string): {
  host: string;
  port: number;
  database: string;
  user: string;
} {
  const trimmed = normalizeConnectionInput(uri);
  const match = trimmed.match(POSTGRES_URI_META_RE);
  if (!match) {
    throw new Error("Invalid postgres connection URI");
  }
  const [, userPart, , host, portPart, database] = match;
  let user = userPart ?? "";
  try {
    user = decodeURIComponent(user);
  } catch {
    // keep raw user if percent-encoding is incomplete
  }
  return {
    host,
    port: Number(portPart || 5432),
    database,
    user,
  };
}

/** Resolves pool config from env (exported for tests). */
export function resolvePoolConfig(): PoolConfig {
  const raw = loadRawConnectionValue();
  // #region agent log
  fetch("http://127.0.0.1:7552/ingest/b0f4f508-7ce8-434e-b94d-0fd5fb6cd268", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a5396f" },
    body: JSON.stringify({
      sessionId: "a5396f",
      runId: "pre-fix",
      hypothesisId: "A-B",
      location: "dev-db.ts:resolvePoolConfig",
      message: "db env resolution",
      data: {
        source: process.env.SQL_CONNECTION_STRING?.trim()
          ? "SQL_CONNECTION_STRING"
          : process.env.BI_REPORT_DB_CONNECTION?.trim()
            ? "BI_REPORT_DB_CONNECTION"
            : process.env.BI_REPORT_DB_HOST?.trim()
              ? "BI_REPORT_DB_DISCRETE"
              : "none",
        isUri: Boolean(raw && isPostgresUri(raw)),
        hadWrappingQuotes:
          Boolean(process.env.SQL_CONNECTION_STRING?.trim()) &&
          /^["']/.test(process.env.SQL_CONNECTION_STRING!.trim()),
        rawLength: raw.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (raw && isPostgresUri(raw)) {
    return poolConfigFromPostgresUri(raw);
  }
  return parseNpgsql(raw);
}

let pool: Pool | null = null;
let poolSignature: string | null = null;

function poolSignatureFrom(cfg: PoolConfig): string {
  if (cfg.connectionString && isPostgresUri(cfg.connectionString)) {
    return `uri:${normalizeConnectionInput(cfg.connectionString)}`;
  }
  return `${cfg.host}:${cfg.port}/${cfg.database}:${cfg.user}`;
}

export function getDevDbPool(): Pool {
  const cfg = resolvePoolConfig();
  let signature: string;
  try {
    signature = poolSignatureFrom(cfg);
    // #region agent log
    fetch("http://127.0.0.1:7552/ingest/b0f4f508-7ce8-434e-b94d-0fd5fb6cd268", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a5396f" },
      body: JSON.stringify({
        sessionId: "a5396f",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "dev-db.ts:getDevDbPool",
        message: "pool signature ok",
        data: { usesUri: Boolean(cfg.connectionString), signatureKind: cfg.connectionString ? "uri" : "fields" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  } catch (err) {
    const e = err as Error & { code?: string };
    // #region agent log
    fetch("http://127.0.0.1:7552/ingest/b0f4f508-7ce8-434e-b94d-0fd5fb6cd268", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a5396f" },
      body: JSON.stringify({
        sessionId: "a5396f",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "dev-db.ts:getDevDbPool",
        message: "pool signature failed",
        data: { code: e.code ?? e.name, errMessage: e.message },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw err;
  }

  if (!pool || poolSignature !== signature) {
    if (pool) {
      pool.end().catch(() => {});
    }
    pool = new Pool(cfg);
    poolSignature = signature;
    pool.on("error", () => {
      pool?.end().catch(() => {});
      pool = null;
      poolSignature = null;
    });
  }

  return pool;
}

export function getDevDbMeta() {
  const cfg = resolvePoolConfig();
  if (cfg.connectionString && isPostgresUri(cfg.connectionString)) {
    return metaFromPostgresUri(cfg.connectionString);
  }
  return { host: cfg.host, database: cfg.database, port: cfg.port, user: cfg.user };
}