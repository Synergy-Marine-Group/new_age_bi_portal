import { NextRequest, NextResponse } from "next/server";
import {
  isOrchestratorConfigured,
  orchestratorBase,
  orchestratorConfigDiagnostics,
  orchestratorPointsToPortalHost,
  semantiqUnreachableMessage,
  smartFetch,
  smartStatusConfigMessage,
  smartUnreachableMessage,
} from "@/lib/server/smart-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight check: is the portal wired to SMART and is the orchestrator up? */
export async function GET(request: NextRequest) {
  const portalHost = request.headers.get("host");
  const diagnostics = orchestratorConfigDiagnostics(portalHost);
  const configured = isOrchestratorConfigured();
  const wrongPortalUrl = orchestratorPointsToPortalHost(portalHost);

  if (!configured) {
    // #region agent log
    fetch("http://127.0.0.1:7552/ingest/b0f4f508-7ce8-434e-b94d-0fd5fb6cd268", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c6513d" },
      body: JSON.stringify({
        sessionId: "c6513d",
        runId: "pre-fix",
        hypothesisId: "H1-H11",
        location: "api/smart/status/route.ts:not_configured",
        message: "status_not_configured",
        data: {
          ...diagnostics,
          portalHost,
          nodeEnv: process.env.NODE_ENV,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json({
      configured: false,
      orchestratorReachable: false,
      ready: false,
      diagnostics,
      message: smartStatusConfigMessage(portalHost),
    });
  }

  if (wrongPortalUrl) {
    return NextResponse.json({
      configured: true,
      orchestratorReachable: false,
      ready: false,
      diagnostics,
      message: smartStatusConfigMessage(portalHost),
    });
  }

  let orchestratorReachable = false;
  let ready = false;
  let checks: Record<string, unknown> | undefined;
  let semantiqReachable = false;
  let semantiqReady = false;

  try {
    const response = await smartFetch("/health/ready", { signal: AbortSignal.timeout(5000) });
    orchestratorReachable = response.ok || response.status === 503;
    if (response.ok || response.status === 503) {
      const body = (await response.json()) as { status?: string; checks?: Record<string, unknown> };
      ready = body.status === "ready";
      checks = body.checks;
    }
  } catch {
    orchestratorReachable = false;
  }

  const base = orchestratorBase();
  try {
    const semUrl = `${base}/mcp/semantiq/health/ready`;
    const sem = await fetch(semUrl, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    semantiqReachable = sem.ok || sem.status === 503;
    if (sem.ok || sem.status === 503) {
      const body = (await sem.json()) as { status?: string };
      semantiqReady = body.status === "ready";
    }
  } catch {
    semantiqReachable = false;
  }

  return NextResponse.json({
    configured: true,
    orchestratorReachable,
    ready,
    semantiqReachable,
    semantiqReady,
    checks,
    diagnostics,
    message: !orchestratorReachable
      ? smartUnreachableMessage()
      : !semantiqReachable
        ? semantiqUnreachableMessage()
        : !ready
          ? "Orchestrator is up but not ready (check LLM key, MCP agents, and SemantIQ Power BI credentials on the Python SMART host)."
          : !semantiqReady
            ? "SemantIQ is up but Power BI credentials failed (SMART_PBI_CLIENT_ID / SMART_PBI_CLIENT_SECRET / tenant)."
            : "SMART is connected and ready.",
  });
}