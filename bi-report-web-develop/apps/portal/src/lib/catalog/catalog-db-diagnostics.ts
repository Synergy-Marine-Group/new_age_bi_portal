import { isBridgeMode } from "./db-bridge";

const SQL_PLACEHOLDER = /^(unused|placeholder|disabled|null|none)$/i;

export function isUsableSqlConnectionString(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  const n = raw.trim();
  if (SQL_PLACEHOLDER.test(n)) return false;
  if (/^postgres(ql)?:\/\//i.test(n)) return true;
  return /(^|;)\s*host\s*=/i.test(n);
}

export function getCatalogDbDiagnostics() {
  const lambdaUrl = process.env.LAMBDA_DB_BRIDGE_URL?.trim() ?? "";
  const lambdaSecret = Boolean(process.env.LAMBDA_DB_BRIDGE_SECRET?.trim());
  const sqlRaw = process.env.SQL_CONNECTION_STRING?.trim() ?? "";
  const sqlUsable = isUsableSqlConnectionString(sqlRaw);

  let mode: "bridge" | "direct" | "unconfigured" = "unconfigured";
  if (isBridgeMode()) {
    mode = "bridge";
  } else if (sqlUsable || process.env.BI_REPORT_DB_HOST?.trim()) {
    mode = "direct";
  }

  return {
    mode,
    hasLambdaUrl: Boolean(lambdaUrl),
    hasLambdaSecret: lambdaSecret,
    sqlEnvPresent: Boolean(sqlRaw),
    sqlUsable,
    sqlIsBuildPlaceholder: Boolean(sqlRaw) && !sqlUsable,
    lambdaHost: (() => {
      try {
        return lambdaUrl ? new URL(lambdaUrl).host : null;
      } catch {
        return "invalid-url";
      }
    })(),
  };
}