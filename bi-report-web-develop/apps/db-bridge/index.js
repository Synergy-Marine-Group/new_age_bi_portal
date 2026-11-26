import { createServer } from "node:http";
import { handler } from "./src/handler.mjs";

// Lambda Web Function / Web Adapter contract: the server must listen on all
// interfaces (0.0.0.0), NOT 127.0.0.1, on the port the platform expects.
// Port resolution order: PORT -> AWS_LWA_PORT -> 8080 (Lambda Web Adapter default).
// Lambda Web Functions provide the address to listen on as "host:port".
const endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT || "0.0.0.0:8080";
const lastColon = endpoint.lastIndexOf(":");
const host = endpoint.slice(0, lastColon) || "0.0.0.0";
const port = Number(endpoint.slice(lastColon + 1)) || 8080;

// Read the DB connection string from the environment. Never log its value.
const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING?.trim();
if (!SQL_CONNECTION_STRING) {
  console.error("[index] SQL_CONNECTION_STRING is NOT set; DB queries will fail");
} else {
  console.log("[index] SQL_CONNECTION_STRING is set");
}

// Diagnostic: show what the platform provides (no secrets logged).
console.log("AWS_LAMBDA_HTTP_ENDPOINT =", process.env.AWS_LAMBDA_HTTP_ENDPOINT);
console.log("PORT =", process.env.PORT, "AWS_LWA_PORT =", process.env.AWS_LWA_PORT, "listening on", `${host}:${port}`);

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const path = (req.url || "/").split("?")[0];
    const method = req.method || "GET";
    const body = method === "GET" || method === "HEAD" ? "" : await readRequestBody(req);
    const out = await handler({
      rawPath: path,
      path,
      headers: req.headers,
      body,
      isBase64Encoded: false,
      requestContext: { http: { method, path } },
    });
    res.writeHead(out.statusCode, out.headers || {});
    res.end(out.body ?? "");
  } catch (err) {
    console.error("[index]", err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({ message: "Internal error" }));
  }
});

server.keepAliveTimeout = 65_000;
server.listen(port, host, () => {
  console.log(`db-bridge listening on ${host}:${port}`);
});

// Never let a stray DB error kill the process (a dead server => 502).
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));
