import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

export function signBridgeBody(secret, timestamp, body) {
  return createHmac("sha256", secret).update(`${timestamp}\n${body}`).digest("hex");
}

export function verifyBridgeSignature(secret, timestampHeader, signature, body) {
  if (!secret || !timestampHeader || !signature) return false;
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return false;
  const expected = signBridgeBody(secret, timestampHeader, body);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature.replace(/^Bearer\s+/i, "").trim(), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}