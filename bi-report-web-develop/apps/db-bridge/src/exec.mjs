import { getPool } from "./db.mjs";
import { assertSqlAllowed, isTransactionControl } from "./sql-guard.mjs";
import { createSession, getSession, releaseSession, sweepIdleSessions } from "./sessions.mjs";

export async function handleExec(payload) {
  await sweepIdleSessions();

  const op = payload?.op;
  if (!op) {
    throw new Error("op is required");
  }

  if (op === "begin") {
    const client = await getPool().connect();
    const sessionId = createSession(client);
    return { sessionId, rows: [], rowCount: 0 };
  }

  if (op === "release") {
    const sessionId = payload.sessionId;
    if (!sessionId) throw new Error("sessionId is required");
    await releaseSession(sessionId);
    return { rows: [], rowCount: 0 };
  }

  const sessionId = payload.sessionId;
  const runner = sessionId ? getSession(sessionId) : null;
  if (sessionId && !runner) {
    throw new Error("unknown or expired sessionId");
  }

  if (op === "commit") {
    if (!runner) throw new Error("sessionId is required");
    await runner.query("COMMIT");
    return { rows: [], rowCount: 0 };
  }

  if (op === "rollback") {
    if (!runner) throw new Error("sessionId is required");
    await runner.query("ROLLBACK");
    return { rows: [], rowCount: 0 };
  }

  if (op !== "query") {
    throw new Error(`unsupported op: ${op}`);
  }

  const sql = payload.sql;
  assertSqlAllowed(sql);
  const params = Array.isArray(payload.params) ? payload.params : [];

  if (isTransactionControl(sql) && runner) {
    await runner.query(sql);
    return { rows: [], rowCount: 0 };
  }

  const result = runner ? await runner.query(sql, params) : await getPool().query(sql, params);
  return { rows: result.rows ?? [], rowCount: result.rowCount ?? 0 };
}