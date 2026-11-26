import { NextResponse } from "next/server";
import { getCatalogDbDiagnostics } from "@/lib/catalog/catalog-db-diagnostics";
import { getDevDbMeta } from "@/lib/catalog/dev-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Safe SSR env snapshot (no secrets) for Amplify/Lambda bridge troubleshooting. */
export async function GET() {
  const diagnostics = getCatalogDbDiagnostics();
  let target: ReturnType<typeof getDevDbMeta> | null = null;
  try {
    if (diagnostics.mode !== "unconfigured") {
      target = getDevDbMeta();
    }
  } catch {
    target = null;
  }
  return NextResponse.json({ ...diagnostics, target });
}