import pg from "pg";

const { Pool } = pg;

function normalizeConnectionInput(raw) {
  let s = String(raw ?? "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function isPostgresUri(value) {
  return /^postgres(ql)?:\/\//i.test(normalizeConnectionInput(value));
}

function resolvePoolConfig() {
  const raw = process.env.SQL_CONNECTION_STRING?.trim();
  if (!raw) {
    throw new Error("SQL_CONNECTION_STRING is not configured");
  }
  const normalized = normalizeConnectionInput(raw);
  if (isPostgresUri(normalized)) {
    return {
      connectionString: normalized,
      ssl: { rejectUnauthorized: false },
      max: 4,
      connectionTimeoutMillis: 20000,
      idleTimeoutMillis: 30000,
    };
  }
  throw new Error("SQL_CONNECTION_STRING must be a postgres:// or postgresql:// URI");
}

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool(resolvePoolConfig());
    pool.on("error", () => {
      pool?.end().catch(() => {});
      pool = null;
    });
  }
  return pool;
}