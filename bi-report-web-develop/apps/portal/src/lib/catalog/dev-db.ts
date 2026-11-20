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
function isPostgresUri(value: string): boolean {
  return /^postgres(ql)?:\/\//i.test(value.trim());
}

function loadRawConnectionValue(): string {
  const fromAmplify = process.env.SQL_CONNECTION_STRING?.trim();
  if (fromAmplify) {
    return fromAmplify;
  }

  const fromConnection = process.env.BI_REPORT_DB_CONNECTION?.trim();
  if (fromConnection) {
    return fromConnection;
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
    connectionString: uri.trim(),
    ...POOL_OPTIONS,
  };
}

export function metaFromPostgresUri(uri: string): {
  host: string;
  port: number;
  database: string;
  user: string;
} {
  const parsed = new URL(uri.trim());
  const database = parsed.pathname.replace(/^\//, "");
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    database,
    user: decodeURIComponent(parsed.username),
  };
}

/** Resolves pool config from env (exported for tests). */
export function resolvePoolConfig(): PoolConfig {
  const raw = loadRawConnectionValue();
  if (raw && isPostgresUri(raw)) {
    return poolConfigFromPostgresUri(raw);
  }
  return parseNpgsql(raw);
}

let pool: Pool | null = null;
let poolSignature: string | null = null;

function poolSignatureFrom(cfg: PoolConfig): string {
  if (cfg.connectionString && isPostgresUri(cfg.connectionString)) {
    const meta = metaFromPostgresUri(cfg.connectionString);
    return `${meta.host}:${meta.port}/${meta.database}:${meta.user}`;
  }
  return `${cfg.host}:${cfg.port}/${cfg.database}:${cfg.user}`;
}

export function getDevDbPool(): Pool {
  const cfg = resolvePoolConfig();
  const signature = poolSignatureFrom(cfg);

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