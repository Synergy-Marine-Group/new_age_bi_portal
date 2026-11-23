import { describe, expect, it } from "vitest";
import { bridgeAuthHeaders, signBridgeBody, verifyBridgeSignature } from "./bridge-hmac";

describe("bridge-hmac", () => {
  it("signs and verifies payload", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ op: "query", sql: "SELECT 1", params: [] });
    const headers = bridgeAuthHeaders(secret, body);
    const signature = headers.Authorization?.replace(/^Bearer\s+/i, "") ?? "";
    expect(
      verifyBridgeSignature(secret, headers["X-Bridge-Timestamp"], signature, body),
    ).toBe(true);
  });

  it("rejects tampered body", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ op: "query", sql: "SELECT 1", params: [] });
    const headers = bridgeAuthHeaders(secret, body);
    const signature = headers.Authorization?.replace(/^Bearer\s+/i, "") ?? "";
    expect(
      verifyBridgeSignature(secret, headers["X-Bridge-Timestamp"], signature, body + "x"),
    ).toBe(false);
  });

  it("uses timestamp in signature input", () => {
    const secret = "k";
    const ts = "1700000000000";
    const body = "{}";
    const a = signBridgeBody(secret, ts, body);
    const b = signBridgeBody(secret, String(Number(ts) + 1), body);
    expect(a).not.toBe(b);
  });
});