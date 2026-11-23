import { verifyBridgeSignature } from "./bridge-hmac.mjs";
import { handleExec } from "./exec.mjs";
import { getPool } from "./db.mjs";
import { jsonResponse, readHttpRequest } from "./http.mjs";

function requireAuth(headers, body) {
  const secret = process.env.LAMBDA_DB_BRIDGE_SECRET?.trim();
  if (!secret) {
    return { ok: false, status: 500, message: "Bridge secret is not configured" };
  }
  const timestamp = headers["x-bridge-timestamp"] ?? null;
  const auth = headers.authorization ?? null;
  if (!verifyBridgeSignature(secret, timestamp, auth, body)) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  return { ok: true };
}

export async function handler(event) {
  try {
    const { path, method, body, headers } = readHttpRequest(event);

    if (method === "GET" && (path === "/health" || path === "/")) {
      await getPool().query("SELECT 1");
      return jsonResponse(200, { status: "ok" });
    }

    if (method === "POST" && path === "/v1/exec") {
      const auth = requireAuth(headers, body);
      if (!auth.ok) {
        return jsonResponse(auth.status, { message: auth.message });
      }
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        return jsonResponse(400, { message: "Invalid JSON body" });
      }
      const result = await handleExec(payload);
      return jsonResponse(200, result);
    }

    return jsonResponse(404, { message: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[db-bridge]", message);
    return jsonResponse(500, { message });
  }
}