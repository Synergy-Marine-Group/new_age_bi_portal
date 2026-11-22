import { NextResponse } from "next/server";
import {
  isOrchestratorConfigured,
  orchestratorBase,
  semantiqUnreachableMessage,
  smartFetch,
  smartStatusConfigMessage,
  smartUnreachableMessage,
} from "@/lib/server/smart-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight check: is the portal wired to SMART and is the orchestrator up? */
export async function GET() {
  const configured = isOrchestratorConfigured();

  if (!configured) {
    return NextResponse.json({
      configured: false,
      orchestratorReachable: false,
      ready: false,
      message: smartStatusConfigMessage(),
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
    message: !orchestratorReachable
      ? smartUnreachableMessage()
      : !semantiqReachable
        ? semantiqUnreachableMessage()
        : !ready
          ? "Orchestrator is up but not ready (check LLM key, MCP agents, and SemantIQ Power BI credentials in .env.local)."
          : !semantiqReady
            ? "SemantIQ is up but Power BI credentials failed (SMART_PBI_CLIENT_ID / SMART_PBI_CLIENT_SECRET / tenant)."
            : "SMART is connected and ready.",
  });
}