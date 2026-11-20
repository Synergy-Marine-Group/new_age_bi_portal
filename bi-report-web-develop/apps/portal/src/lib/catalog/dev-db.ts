import { Pool, type PoolConfig } from "pg";

const REQUIRED_DB_VARS = [
  "BI_REPORT_DB_HOST",
  "BI_REPORT_DB_PORT",
  "BI_REPORT_DB_NAME",
  "BI_REPORT_DB_USER",
  "BI_REPORT_DB_PASSWORD",
] as const;

// Config comes only from env vars (set in .env.local locally, Amplify env vars when deployed).
// No file reads: the .NET API's appsettings is not available on the Amplify Linux runtime.
function loadConnectionString(): string {
  if (process.env.BI_REPORT_DB_CONNECTION?.trim()) {
    return process.env.BI_REPORT_DB_CONNECTION.trim();
  }

  if (process.env.BI_REPORT_DB_HOST?.trim()) {
    return "";
  }

  throw new Error(
    `Portal catalog DB is not configured. Set BI_REPORT_DB_CONNECTION or ${REQUIRED_DB_VARS.join(", ")}.`,
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
    ssl: { rejectUnauthorized: false },
    max: 6,
    connectionTimeoutMillis: 20000,
    idleTimeoutMillis: 30000,
  };
}

let pool: Pool | null = null;
let poolSignature: string | null = null;

function poolSignatureFrom(cfg: PoolConfig): string {
  return `${cfg.host}:${cfg.port}/${cfg.database}:${cfg.user}`;
}

export function getDevDbPool(): Pool {
  const cfg = parseNpgsql(loadConnectionString());
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
  const cfg = parseNpgsql(loadConnectionString());
  return { host: cfg.host, database: cfg.database, port: cfg.port, user: cfg.user };
}
