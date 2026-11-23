import { bridgeAuthHeaders } from "./bridge-hmac";

export type BridgeOp = "query" | "begin" | "commit" | "rollback" | "release";

export type BridgeExecRequest = {
  op: BridgeOp;
  sql?: string;
  params?: unknown[];
  sessionId?: string;
};

import type { DevDbPool, DevDbQueryResult } from "./dev-db-types";

export type BridgeQueryResult<T = Record<string, unknown>> = DevDbQueryResult<T>;
export type BridgePool = DevDbPool;

function bridgeBaseUrl(): string {
  const raw = process.env.LAMBDA_DB_BRIDGE_URL?.trim();
  if (!raw) {
    throw new Error("LAMBDA_DB_BRIDGE_URL is not set");
  }
  return raw.replace(/\/+$/, "");
}

function bridgeSecret(): string {
  const secret = process.env.LAMBDA_DB_BRIDGE_SECRET?.trim();
  if (!secret) {
    throw new Error("LAMBDA_DB_BRIDGE_SECRET is not set");
  }
  return secret;
}

async function bridgeExec<T = Record<string, unknown>>(
  payload: BridgeExecRequest,
): Promise<BridgeQueryResult<T>> {
  const body = JSON.stringify(payload);
  const headers = bridgeAuthHeaders(bridgeSecret(), body);
  const res = await fetch(`${bridgeBaseUrl()}/v1/exec`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* keep text */
    }
    const err = new Error(message) as Error & { code?: string };
    err.code = res.status === 401 ? "BRIDGE_UNAUTHORIZED" : "BRIDGE_HTTP";
    throw err;
  }
  return JSON.parse(text) as BridgeQueryResult<T>;
}

export function isBridgeMode(): boolean {
  return Boolean(process.env.LAMBDA_DB_BRIDGE_URL?.trim());
}

export function createBridgePool(): BridgePool {
  const errorListeners: Array<(err: Error) => void> = [];

  const pool: DevDbPool = {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      return bridgeExec<T>({ op: "query", sql, params });
    },
    async connect() {
      const body = JSON.stringify({ op: "begin" } satisfies BridgeExecRequest);
      const headers = bridgeAuthHeaders(bridgeSecret(), body);
      const res = await fetch(`${bridgeBaseUrl()}/v1/exec`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Bridge begin failed: ${text.slice(0, 200)}`);
      }
      const parsed = JSON.parse(text) as { sessionId?: string };
      const sessionId = parsed.sessionId;
      if (!sessionId) {
        throw new Error("Bridge did not return sessionId");
      }
      return {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
          const trimmed = sql.trim().toUpperCase();
          if (trimmed === "BEGIN") {
            await bridgeExec({ op: "query", sql: "BEGIN", sessionId });
            return { rows: [], rowCount: 0 };
          }
          if (trimmed === "COMMIT") {
            await bridgeExec({ op: "commit", sessionId });
            return { rows: [], rowCount: 0 };
          }
          if (trimmed === "ROLLBACK") {
            await bridgeExec({ op: "rollback", sessionId });
            return { rows: [], rowCount: 0 };
          }
          return bridgeExec<T>({ op: "query", sql, params, sessionId });
        },
        async release() {
          await bridgeExec({ op: "release", sessionId });
        },
      };
    },
    on(event, listener) {
      if (event === "error") errorListeners.push(listener);
      return pool;
    },
    async end() {
      /* no persistent local connections */
    },
  };

  return pool;
}