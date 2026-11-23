import { Pool, type PoolConfig } from "pg";
import { createBridgePool, isBridgeMode, type BridgePool } from "./db-bridge";

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

export type DevDbPool = Pool | BridgePool;

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

export function resolvePoolConfig(): PoolConfig {
  const raw = loadRawConnectionValue();
  if (raw && isPostgresUri(raw)) {
    return poolConfigFromPostgresUri(raw);
  }
  return parseNpgsql(raw);
}

let pgPool: Pool | null = null;
let pgPoolSignature: string | null = null;
let bridgePool: BridgePool | null = null;

function poolSignatureFrom(cfg: PoolConfig): string {
  if (cfg.connectionString && isPostgresUri(cfg.connectionString)) {
    return `uri:${normalizeConnectionInput(cfg.connectionString)}`;
  }
  return `${cfg.host}:${cfg.port}/${cfg.database}:${cfg.user}`;
}

export function getDevDbPool(): DevDbPool {
  if (isBridgeMode()) {
    if (!bridgePool) {
      bridgePool = createBridgePool();
    }
    return bridgePool;
  }

  const cfg = resolvePoolConfig();
  const signature = poolSignatureFrom(cfg);

  if (!pgPool || pgPoolSignature !== signature) {
    if (pgPool) {
      pgPool.end().catch(() => {});
    }
    pgPool = new Pool(cfg);
    pgPoolSignature = signature;
    pgPool.on("error", () => {
      pgPool?.end().catch(() => {});
      pgPool = null;
      pgPoolSignature = null;
    });
  }

  return pgPool;
}

export function getDevDbMeta() {
  if (isBridgeMode()) {
    return {
      host: "lambda-db-bridge",
      database: "(remote)",
      port: 443,
      user: "bridge",
    };
  }
  const cfg = resolvePoolConfig();
  if (cfg.connectionString && isPostgresUri(cfg.connectionString)) {
    return metaFromPostgresUri(cfg.connectionString);
  }
  return { host: cfg.host, database: cfg.database, port: cfg.port, user: cfg.user };
}