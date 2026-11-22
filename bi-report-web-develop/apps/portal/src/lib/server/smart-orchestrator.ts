import "server-only";
import { SignJWT } from "jose";

export const SMART_ORCHESTRATOR_TOKEN_TTL_SECONDS = 120;
export const SMART_DOWN =
  "SMART is currently down, raise an issue to bisupport@synergyship.com";

function trimUrl(raw: string | undefined): string | null {
  const url = raw?.trim().replace(/\/+$/, "");
  return url || null;
}

function isLoopbackHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

/** Base URL for the Python SMART combined app (orchestrator + mounted MCP). */
export function orchestratorBase(): string | null {
  const url = trimUrl(process.env.SMART_ORCHESTRATOR_URL);
  if (!url) return null;
  if (process.env.NODE_ENV === "production" && isLoopbackHost(url)) {
    return null;
  }
  return url;
}

export function orchestratorSecret(): string | null {
  const secret = process.env.SMART_ORCHESTRATOR_SECRET?.trim();
  return secret || null;
}

export function isOrchestratorConfigured(): boolean {
  return Boolean(orchestratorBase() && orchestratorSecret());
}

/** SemantIQ HTTP admin routes (sync/status), not the MCP JSON-RPC endpoint. */
export function semantiqHttpBase(): string | null {
  const direct = trimUrl(process.env.SEMANTIQ_HTTP_URL);
  if (direct) return direct;
  const base = orchestratorBase();
  if (base) return `${base}/mcp/semantiq`;
  return null;
}

export function mcpSharedAuthHeaders(): HeadersInit {
  const secret = orchestratorSecret() || process.env.MCP_SHARED_SECRET?.trim();
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export async function signOrchestratorToken(email: string): Promise<string | null> {
  const secret = orchestratorSecret();
  if (!secret) return null;
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("bi-portal")
    .setAudience("smart-orchestrator")
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${SMART_ORCHESTRATOR_TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function smartFetch(
  path: string,
  init?: RequestInit & { bearerToken?: string | null }
): Promise<Response> {
  const base = orchestratorBase();
  if (!base) {
    throw new OrchestratorConfigError("SMART_ORCHESTRATOR_URL is not configured");
  }
  const headers = new Headers(init?.headers);
  if (init?.bearerToken) {
    headers.set("Authorization", `Bearer ${init.bearerToken}`);
  }
  const { bearerToken: _bearer, ...rest } = init ?? {};
  return fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    cache: "no-store",
    ...rest,
    headers,
  });
}

export class OrchestratorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestratorConfigError";
  }
}

export function smartStatusConfigMessage(): string {
  if (!trimUrl(process.env.SMART_ORCHESTRATOR_URL) || !orchestratorSecret()) {
    return "Set SMART_ORCHESTRATOR_URL and SMART_ORCHESTRATOR_SECRET (Amplify env vars in production).";
  }
  const url = trimUrl(process.env.SMART_ORCHESTRATOR_URL);
  if (url && process.env.NODE_ENV === "production" && isLoopbackHost(url)) {
    return "SMART_ORCHESTRATOR_URL must not point to localhost in production. Set the HTTPS URL of the Python SMART service.";
  }
  return "Set SMART_ORCHESTRATOR_URL and SMART_ORCHESTRATOR_SECRET in .env.local, then restart npm run dev.";
}

export function smartUnreachableMessage(): string {
  if (process.env.NODE_ENV === "production") {
    return "SMART orchestrator is not reachable. Check SMART_ORCHESTRATOR_URL in Amplify and that the Python SMART service is running.";
  }
  return "SMART orchestrator is not running. Restart npm run dev (agents auto-start) or run npm run smart:agents.";
}

export function semantiqUnreachableMessage(): string {
  if (process.env.NODE_ENV === "production") {
    return "SemantIQ is not reachable on the SMART stack at SMART_ORCHESTRATOR_URL.";
  }
  return "SemantIQ is not reachable on the unified SMART stack. Check the dev terminal for [SMART] errors.";
}