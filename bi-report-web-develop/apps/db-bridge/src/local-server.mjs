import { createServer } from "node:http";
import { handler } from "./handler.mjs";

const port = Number(process.env.PORT || 8787);

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const event = {
    rawPath: req.url?.split("?")[0] ?? "/",
    headers: req.headers,
    body,
    isBase64Encoded: false,
    requestContext: { http: { method: req.method, path: req.url?.split("?")[0] } },
  };
  const out = await handler(event);
  res.writeHead(out.statusCode, out.headers);
  res.end(out.body);
}).listen(port, () => {
  console.log(`db-bridge listening on http://127.0.0.1:${port}`);
});