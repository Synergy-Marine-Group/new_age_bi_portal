import { randomUUID } from "node:crypto";

const SESSION_IDLE_MS = 30_000;
/** @type {Map<string, { client: import("pg").PoolClient, lastUsed: number }>} */
const sessions = new Map();

export function createSession(client) {
  const sessionId = randomUUID();
  sessions.set(sessionId, { client, lastUsed: Date.now() });
  return sessionId;
}

export function getSession(sessionId) {
  const row = sessions.get(sessionId);
  if (!row) return null;
  row.lastUsed = Date.now();
  return row.client;
}

export async function releaseSession(sessionId) {
  const row = sessions.get(sessionId);
  if (!row) return;
  sessions.delete(sessionId);
  try {
    await row.client.release();
  } catch {
    /* ignore */
  }
}

export async function sweepIdleSessions() {
  const now = Date.now();
  for (const [id, row] of sessions) {
    if (now - row.lastUsed > SESSION_IDLE_MS) {
      await releaseSession(id);
    }
  }
}