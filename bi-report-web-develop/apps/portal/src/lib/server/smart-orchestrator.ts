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

/** Same fallbacks as agents/scripts/bootstrap_local_env.py for portal JWT → orchestrator. */
export function orchestratorSecret(): string | null {
  const secret =
    process.env.SMART_ORCHESTRATOR_SECRET?.trim() ||
    process.env.PORTAL_JWT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim();
  return secret || null;
}

export function orchestratorUrlHostname(): string | null {
  const url = trimUrl(process.env.SMART_ORCHESTRATOR_URL);
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when SMART_ORCHESTRATOR_URL is the portal itself (Next.js), not the Python stack. */
export function orchestratorPointsToPortalHost(portalHost: string | null | undefined): boolean {
  const orchHost = orchestratorUrlHostname();
  if (!orchHost || !portalHost) return false;
  const normalized = portalHost.toLowerCase().split(":")[0];
  return orchHost === normalized;
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

export type SmartEnvKeyPresence = {
  SMART_ORCHESTRATOR_URL: boolean;
  SMART_ORCHESTRATOR_SECRET: boolean;
  PORTAL_JWT_SECRET: boolean;
  JWT_SECRET: boolean;
  AZURE_OPENAI_ENDPOINT: boolean;
  AZURE_OPENAI_API_KEY: boolean;
  SMART_AUTO_START_AGENTS: boolean;
};

export function smartEnvKeyPresence(): SmartEnvKeyPresence {
  return {
    SMART_ORCHESTRATOR_URL: Boolean(process.env.SMART_ORCHESTRATOR_URL?.trim()),
    SMART_ORCHESTRATOR_SECRET: Boolean(process.env.SMART_ORCHESTRATOR_SECRET?.trim()),
    PORTAL_JWT_SECRET: Boolean(process.env.PORTAL_JWT_SECRET?.trim()),
    JWT_SECRET: Boolean(process.env.JWT_SECRET?.trim()),
    AZURE_OPENAI_ENDPOINT: Boolean(process.env.AZURE_OPENAI_ENDPOINT?.trim()),
    AZURE_OPENAI_API_KEY: Boolean(process.env.AZURE_OPENAI_API_KEY?.trim()),
    SMART_AUTO_START_AGENTS: Boolean(process.env.SMART_AUTO_START_AGENTS?.trim()),
  };
}

export function orchestratorConfigDiagnostics(portalHost?: string | null): {
  hasSmartOrchestratorUrl: boolean;
  hasSmartOrchestratorSecret: boolean;
  effectiveSecretFromAlias: boolean;
  localhostUrlRejected: boolean;
  orchestratorHostname: string | null;
  pointsToPortalHost: boolean;
  envKeysPresent: SmartEnvKeyPresence;
} {
  const rawUrl = trimUrl(process.env.SMART_ORCHESTRATOR_URL);
  const hasExplicitSecret = Boolean(process.env.SMART_ORCHESTRATOR_SECRET?.trim());
  const hasSecret = Boolean(orchestratorSecret());
  const localhostBlocked = Boolean(
    rawUrl && process.env.NODE_ENV === "production" && isLoopbackHost(rawUrl)
  );
  const envKeysPresent = smartEnvKeyPresence();
  return {
    hasSmartOrchestratorUrl: Boolean(rawUrl),
    hasSmartOrchestratorSecret: hasSecret,
    effectiveSecretFromAlias: hasSecret && !hasExplicitSecret,
    localhostUrlRejected: localhostBlocked,
    orchestratorHostname: orchestratorUrlHostname(),
    pointsToPortalHost: orchestratorPointsToPortalHost(portalHost),
    envKeysPresent,
  };
}

export function smartStatusConfigMessage(portalHost?: string | null): string {
  const diag = orchestratorConfigDiagnostics(portalHost);
  const {
    hasSmartOrchestratorUrl,
    hasSmartOrchestratorSecret,
    localhostUrlRejected,
    pointsToPortalHost,
    envKeysPresent,
  } = diag;
  if (pointsToPortalHost) {
    return "SMART_ORCHESTRATOR_URL must be the Python SMART backend (App Runner, EC2, etc.), not this Next.js Amplify app URL. AZURE_OPENAI_* on the portal does not run SMART.";
  }
  if (localhostUrlRejected) {
    return "SMART_ORCHESTRATOR_URL must not point to localhost in production. Set the HTTPS URL of the Python SMART service.";
  }
  if (
    !envKeysPresent.SMART_ORCHESTRATOR_URL &&
    !envKeysPresent.SMART_ORCHESTRATOR_SECRET &&
    !envKeysPresent.PORTAL_JWT_SECRET &&
    !envKeysPresent.JWT_SECRET
  ) {
    return "No SMART env vars are visible at runtime on Amplify. Add them under Hosting → Environment variables (not only Backend), then redeploy.";
  }
  if (!hasSmartOrchestratorUrl && !hasSmartOrchestratorSecret) {
    return "Set SMART_ORCHESTRATOR_URL and SMART_ORCHESTRATOR_SECRET (Amplify env vars in production). AZURE_OPENAI_* alone does not enable SMART.";
  }
  if (!hasSmartOrchestratorUrl) {
    return "SMART_ORCHESTRATOR_URL is missing in Amplify. Set it to the HTTPS base URL of your Python SMART service.";
  }
  if (!hasSmartOrchestratorSecret) {
    return "Set SMART_ORCHESTRATOR_SECRET (or PORTAL_JWT_SECRET / JWT_SECRET) in Amplify Hosting env vars. It must match PORTAL_JWT_SECRET on the Python SMART service.";
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