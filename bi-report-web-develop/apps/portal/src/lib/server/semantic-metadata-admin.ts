import "server-only";
import { mcpSharedAuthHeaders, semantiqHttpBase } from "@/lib/server/smart-orchestrator";

export async function callSemanticMetadataSync(mode: "full" | "incremental") {
  const base = semantiqHttpBase();
  if (!base) {
    return { status: "error", message: "Set SEMANTIQ_HTTP_URL or SMART_ORCHESTRATOR_URL" };
  }
  const response = await fetch(`${base}/admin/semantic-metadata/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...mcpSharedAuthHeaders() },
    body: JSON.stringify({ mode }),
    cache: "no-store",
    signal: AbortSignal.timeout(600_000),
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { httpStatus: response.status, ...body };
}

export async function fetchSemanticMetadataStatus() {
  const base = semantiqHttpBase();
  if (!base) {
    return { status: "error", message: "Set SEMANTIQ_HTTP_URL or SMART_ORCHESTRATOR_URL" };
  }
  const response = await fetch(`${base}/admin/semantic-metadata/status`, {
    method: "GET",
    headers: mcpSharedAuthHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { httpStatus: response.status, ...body };
}