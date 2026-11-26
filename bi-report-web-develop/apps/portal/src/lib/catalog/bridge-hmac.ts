import { createHmac, timingSafeEqual } from "crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

export function signBridgeBody(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}\n${body}`).digest("hex");
}

export function bridgeAuthHeaders(secret: string, body: string): Record<string, string> {
  const timestamp = String(Date.now());
  const signature = signBridgeBody(secret, timestamp, body);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${signature}`,
    "X-Bridge-Timestamp": timestamp,
  };
}

export function verifyBridgeSignature(
  secret: string,
  timestampHeader: string | null,
  signature: string | null,
  body: string,
): boolean {
  if (!secret || !timestampHeader || !signature) return false;
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return false;
  const expected = signBridgeBody(secret, timestampHeader, body);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}