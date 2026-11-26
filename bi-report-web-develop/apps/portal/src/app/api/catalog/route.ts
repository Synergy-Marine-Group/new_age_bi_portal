import { NextRequest, NextResponse } from "next/server";
import {
  agentLogCatalogDb,
  getCatalogDbDiagnostics,
} from "@/lib/catalog/catalog-db-diagnostics";
import { emailFromBearer } from "@/lib/catalog/entra-user";
import { loadCatalogForEmail } from "@/lib/catalog/reports-catalog";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const email = await emailFromBearer(authorization);
    if (!email || !authorization) {
      return NextResponse.json({ message: "Sign in required" }, { status: 401 });
    }

    const catalog = await loadCatalogForEmail(email);

    return NextResponse.json(
      { userInfo: catalog.userInfo, reports: catalog.reports },
      { headers: { "X-Catalog-Source": "database" } },
    );
  } catch (error) {
    const err = error as Error & { code?: string };
    const dbDiag = getCatalogDbDiagnostics();
    agentLogCatalogDb(
      { ...dbDiag, errCode: err.code, errName: err.name },
      "H2",
      "catalog load failed",
    );
    console.error(
      `[catalog] load failed mode=${dbDiag.mode} ${err.code ?? err.name}: ${err.message}`,
    );

    const misconfigured =
      dbDiag.mode === "unconfigured" ||
      (dbDiag.sqlIsBuildPlaceholder && !dbDiag.hasLambdaUrl);
    const isNetwork =
      err.code === "ECONNREFUSED" ||
      err.code === "ETIMEDOUT" ||
      err.message?.toLowerCase().includes("timeout") ||
      err.message?.toLowerCase().includes("connect");

    let message = "Could not load reports from the database.";
    if (misconfigured) {
      message =
        "Catalog database is not configured on the server. Set LAMBDA_DB_BRIDGE_URL and LAMBDA_DB_BRIDGE_SECRET on Amplify (and remove SQL_CONNECTION_STRING=unused).";
    } else if (isNetwork) {
      message =
        dbDiag.mode === "bridge"
          ? "Could not reach the Lambda DB bridge. Check LAMBDA_DB_BRIDGE_URL and that the function is reachable."
          : "Could not reach the BI database. Check VPN and network access.";
    }

    return NextResponse.json(
      {
        message,
        detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        code: err.code,
        dbMode: dbDiag.mode,
      },
      { status: 500 },
    );
  }
}