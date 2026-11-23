import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "SQL_CONNECTION_STRING",
  "BI_REPORT_DB_CONNECTION",
  "BI_REPORT_DB_HOST",
  "BI_REPORT_DB_PORT",
  "BI_REPORT_DB_NAME",
  "BI_REPORT_DB_USER",
  "BI_REPORT_DB_PASSWORD",
  "LAMBDA_DB_BRIDGE_URL",
  "LAMBDA_DB_BRIDGE_SECRET",
] as const;

function clearDbEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("resolvePoolConfig", () => {
  afterEach(() => {
    clearDbEnv();
    vi.resetModules();
  });

  it("uses postgres URI from SQL_CONNECTION_STRING with connectionString", async () => {
    process.env.SQL_CONNECTION_STRING =
      "postgres://BI_USER:pa%3Fss@biportaldev.example.com:5432/synergy_bi_reports";
    const { resolvePoolConfig, metaFromPostgresUri } = await import("./dev-db");
    const cfg = resolvePoolConfig();
    expect(cfg.connectionString).toBe(process.env.SQL_CONNECTION_STRING);
    expect(cfg.host).toBeUndefined();
    const meta = metaFromPostgresUri(cfg.connectionString!);
    expect(meta.user).toBe("BI_USER");
    expect(meta.host).toBe("biportaldev.example.com");
    expect(meta.database).toBe("synergy_bi_reports");
    expect(meta.port).toBe(5432);
  });

  it("prefers SQL_CONNECTION_STRING over BI_REPORT_DB_CONNECTION and discrete host", async () => {
    process.env.SQL_CONNECTION_STRING = "postgresql://u:p@uri-host:5432/db_from_uri";
    process.env.BI_REPORT_DB_CONNECTION = "Host=wrong;Port=5432;Database=wrong;Username=wrong;Password=x";
    process.env.BI_REPORT_DB_HOST = "should-not-be-used";
    const { resolvePoolConfig } = await import("./dev-db");
    const cfg = resolvePoolConfig();
    expect(cfg.connectionString).toContain("uri-host");
  });

  it("parses Npgsql BI_REPORT_DB_CONNECTION", async () => {
    process.env.BI_REPORT_DB_CONNECTION =
      "Host=npgsql-host;Port=5433;Database=npgsql_db;Username=npgsql_user;Password=secret";
    const { resolvePoolConfig } = await import("./dev-db");
    const cfg = resolvePoolConfig();
    expect(cfg.connectionString).toBeUndefined();
    expect(cfg.host).toBe("npgsql-host");
    expect(cfg.port).toBe(5433);
    expect(cfg.database).toBe("npgsql_db");
    expect(cfg.user).toBe("npgsql_user");
    expect(cfg.password).toBe("secret");
  });

  it("builds config from discrete BI_REPORT_DB_* when host is set", async () => {
    process.env.BI_REPORT_DB_HOST = "discrete-host";
    process.env.BI_REPORT_DB_PORT = "5432";
    process.env.BI_REPORT_DB_NAME = "synergy_bi_reports";
    process.env.BI_REPORT_DB_USER = "discrete_user";
    process.env.BI_REPORT_DB_PASSWORD = "discrete_pass";
    const { resolvePoolConfig } = await import("./dev-db");
    const cfg = resolvePoolConfig();
    expect(cfg.host).toBe("discrete-host");
    expect(cfg.database).toBe("synergy_bi_reports");
    expect(cfg.user).toBe("discrete_user");
    expect(cfg.password).toBe("discrete_pass");
  });

  it("decodes URL-encoded characters in URI password via metaFromPostgresUri user only", async () => {
    process.env.SQL_CONNECTION_STRING = "postgres://user:pass%40word@h:5432/db";
    const { metaFromPostgresUri } = await import("./dev-db");
    expect(metaFromPostgresUri(process.env.SQL_CONNECTION_STRING).user).toBe("user");
  });

  it("throws when no DB env is configured", async () => {
    const { resolvePoolConfig } = await import("./dev-db");
    expect(() => resolvePoolConfig()).toThrow(/SQL_CONNECTION_STRING/);
  });

  it("strips wrapping quotes from SQL_CONNECTION_STRING", async () => {
    process.env.SQL_CONNECTION_STRING =
      '"postgres://quoted_user:secret@quote-host:5432/quoted_db"';
    const { resolvePoolConfig, metaFromPostgresUri } = await import("./dev-db");
    const cfg = resolvePoolConfig();
    expect(cfg.connectionString).toBe("postgres://quoted_user:secret@quote-host:5432/quoted_db");
    const meta = metaFromPostgresUri(cfg.connectionString!);
    expect(meta.host).toBe("quote-host");
    expect(meta.user).toBe("quoted_user");
  });

  it("parses URI meta when password contains unencoded question mark", async () => {
    process.env.SQL_CONNECTION_STRING = "postgres://u:pass?mark@h:5432/db";
    const { metaFromPostgresUri, resolvePoolConfig } = await import("./dev-db");
    expect(() => metaFromPostgresUri(process.env.SQL_CONNECTION_STRING)).not.toThrow();
    expect(resolvePoolConfig().connectionString).toContain("pass?mark");
  });
});