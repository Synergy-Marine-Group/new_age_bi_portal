import { NextRequest, NextResponse } from "next/server";
import { emailFromBearer } from "@/lib/catalog/entra-user";
import { loadReportsForUser } from "@/lib/catalog/fetch-reports";
import {
  SMART_DOWN,
  isOrchestratorConfigured,
  signOrchestratorToken,
  smartFetch,
} from "@/lib/server/smart-orchestrator";
import type { PortalReport } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Must stay above the orchestrator's request_timeout_s (120 s) so the orchestrator, not this route,
// decides when a long answer is too slow. The old 90 s cut streamed answers mid-way.
const UPSTREAM_TIMEOUT_MS = 180_000;

interface ChatRequestBody {
  message?: unknown;
  conversationId?: unknown;
  reportId?: unknown;
  outputMode?: unknown;
  memory?: unknown;
}

function json(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function memoryTurns(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const item of raw.slice(-12)) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = content.trim().slice(0, 800);
    if (text) turns.push({ role, content: text });
  }
  return turns;
}

function catalogEntry(report: PortalReport) {
  const workspaceId = report.workspaceId ?? report.powerWorkSpaceId;
  return {
    portal_id: report.id,
    title: report.title,
    category_name: report.categoryName ?? undefined,
    menu_path: report.categoryPath?.map((p) => p.name).join(" > ") || report.categoryName || undefined,
    workspace_id: workspaceId,
    report_id: report.powerBiReportId,
    dataset_id: report.datasetId,
  };
}

export async function POST(request: NextRequest) {
  // #region agent log
  {
    const rawUrl = process.env.SMART_ORCHESTRATOR_URL?.trim() ?? "";
    fetch("http://127.0.0.1:7552/ingest/b0f4f508-7ce8-434e-b94d-0fd5fb6cd268", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c6513d" },
      body: JSON.stringify({
        sessionId: "c6513d",
        runId: "pre-fix",
        hypothesisId: "H1-H4",
        location: "api/smart/chat/route.ts:POST:entry",
        message: "smart_chat_entry",
        data: {
          nodeEnv: process.env.NODE_ENV,
          configured: isOrchestratorConfigured(),
          hasSecret: Boolean(process.env.SMART_ORCHESTRATOR_SECRET?.trim()),
          hasRawUrl: Boolean(rawUrl),
          rawUrlHost: rawUrl ? (() => { try { return new URL(rawUrl).hostname; } catch { return "invalid"; } })() : "",
          hasAzureOpenAiEndpoint: Boolean(process.env.AZURE_OPENAI_ENDPOINT?.trim()),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  if (!isOrchestratorConfigured()) {
  // #region agent log
    fetch("http://127.0.0.1:7552/ingest/b0f4f508-7ce8-434e-b94d-0fd5fb6cd268", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c6513d" },
      body: JSON.stringify({
        sessionId: "c6513d",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "api/smart/chat/route.ts:POST:not_configured",
        message: "orchestrator_not_configured_503",
        data: {},
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  // #endregion
    return json(SMART_DOWN, 503);
  }

  const authorization = request.headers.get("authorization");
  let email: string | null = null;
  try {
    email = await emailFromBearer(authorization);
  } catch {
    email = null;
  }
  if (!email || !authorization) return json("Sign in required", 401);

  const body = (await request.json().catch(() => ({}))) as ChatRequestBody;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const conversationId =
    typeof body.conversationId === "string" && /^[\w-]{1,100}$/.test(body.conversationId)
      ? body.conversationId
      : "default";
  if (!message || message.length > 2000) return json("Message must be 1-2000 characters", 400);

  let reports: PortalReport[] = [];
  let catalogUnavailable = false;
  try {
    ({ reports } = await loadReportsForUser(authorization, email));
  } catch {
    catalogUnavailable = true;
    reports = [];
  }

  const context: Record<string, unknown> = {
    catalog: reports
      .filter((r) => r.workspaceId ?? r.powerWorkSpaceId)
      .map(catalogEntry)
      .slice(0, 250),
    catalog_unavailable: catalogUnavailable,
    memory: memoryTurns(body.memory),
    output_mode: body.outputMode === "stream" ? "stream" : "batch",
  };

  if (typeof body.reportId === "string" && body.reportId && !catalogUnavailable) {
    const wanted = body.reportId.toLowerCase();
    const report = reports.find(
      (r) => r.id.toLowerCase() === wanted || r.powerBiReportId?.toLowerCase() === wanted
    );
    if (!report) return json("You do not have access to this report", 403);
    const workspaceId = report.workspaceId ?? report.powerWorkSpaceId;
    if (workspaceId) context.workspace_id = workspaceId;
    if (report.powerBiReportId) context.report_id = report.powerBiReportId;
    if (report.datasetId) context.dataset_id = report.datasetId;
    context.report_name = report.title;
  }

  const token = await signOrchestratorToken(email);
  if (!token) return json(SMART_DOWN, 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  request.signal.addEventListener("abort", () => controller.abort());

  let upstream: Response;
  try {
    upstream = await smartFetch("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      bearerToken: token,
      body: JSON.stringify({ message, conversation_id: conversationId, context }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // #region agent log
    fetch("http://127.0.0.1:7552/ingest/b0f4f508-7ce8-434e-b94d-0fd5fb6cd268", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c6513d" },
      body: JSON.stringify({
        sessionId: "c6513d",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "api/smart/chat/route.ts:POST:upstream_fetch_failed",
        message: "upstream_fetch_failed",
        data: { errorName: err instanceof Error ? err.name : "unknown" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return json(SMART_DOWN, 503);
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    // #region agent log
    fetch("http://127.0.0.1:7552/ingest/b0f4f508-7ce8-434e-b94d-0fd5fb6cd268", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c6513d" },
      body: JSON.stringify({
        sessionId: "c6513d",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "api/smart/chat/route.ts:POST:upstream_bad_status",
        message: "upstream_bad_status",
        data: { status: upstream.status },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const status = upstream.status === 429 ? 429 : 502;
    return json(status === 429 ? "Too many requests, please wait a moment" : SMART_DOWN, status);
  }

  const passthrough = new TransformStream<Uint8Array, Uint8Array>({
    flush() {
      clearTimeout(timer);
    },
  });
  void upstream.body.pipeTo(passthrough.writable).catch(() => clearTimeout(timer));

  return new Response(passthrough.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}