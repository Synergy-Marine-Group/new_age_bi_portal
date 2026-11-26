import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createBridgePool", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.LAMBDA_DB_BRIDGE_URL = "https://bridge.example.com";
    process.env.LAMBDA_DB_BRIDGE_SECRET = "bridge-secret";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.LAMBDA_DB_BRIDGE_URL;
    delete process.env.LAMBDA_DB_BRIDGE_SECRET;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("query posts to /v1/exec and returns rows", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ rows: [{ ok: 1 }], rowCount: 1 }),
    });
    const { createBridgePool } = await import("./db-bridge");
    const pool = createBridgePool();
    const result = await pool.query("SELECT 1 AS ok");
    expect(result.rows).toEqual([{ ok: 1 }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.com/v1/exec",
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: expect.stringMatching(/^Bearer /),
      "X-Bridge-Timestamp": expect.any(String),
    });
  });

  it("connect uses begin session and runs commit via session", async () => {
    const ok = () => ({
      ok: true,
      text: async () => JSON.stringify({ rows: [], rowCount: 0 }),
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ sessionId: "sess-1", rows: [], rowCount: 0 }),
      })
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());
    const { createBridgePool } = await import("./db-bridge");
    const pool = createBridgePool();
    const client = await pool.connect();
    await client.query("BEGIN");
    await client.query("COMMIT");
    await client.release();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    expect(bodies[0].op).toBe("begin");
    expect(bodies[1].op).toBe("query");
    expect(bodies[1].sql).toBe("BEGIN");
    expect(bodies[1].sessionId).toBe("sess-1");
    expect(bodies[2].op).toBe("commit");
    expect(bodies[3].op).toBe("release");
  });
});

describe("isBridgeMode / getDevDbPool", () => {
  afterEach(() => {
    delete process.env.LAMBDA_DB_BRIDGE_URL;
    delete process.env.LAMBDA_DB_BRIDGE_SECRET;
    delete process.env.SQL_CONNECTION_STRING;
    vi.resetModules();
  });

  it("uses bridge pool when LAMBDA_DB_BRIDGE_URL is set", async () => {
    process.env.LAMBDA_DB_BRIDGE_URL = "https://bridge.example.com";
    process.env.LAMBDA_DB_BRIDGE_SECRET = "s";
    const { isBridgeMode } = await import("./db-bridge");
    const { getDevDbMeta } = await import("./dev-db");
    expect(isBridgeMode()).toBe(true);
    expect(getDevDbMeta().host).toBe("lambda-db-bridge");
  });
});