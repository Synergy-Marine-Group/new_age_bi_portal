export function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

export function readHttpRequest(event) {
  const path =
    event.rawPath ??
    event.path ??
    event.requestContext?.http?.path ??
    event.requestContext?.resourcePath ??
    "/";
  const method = (
    event.requestContext?.http?.method ??
    event.httpMethod ??
    "GET"
  ).toUpperCase();
  let body = event.body ?? "";
  if (event.isBase64Encoded && body) {
    body = Buffer.from(body, "base64").toString("utf8");
  }
  const headers = Object.fromEntries(
    Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
  );
  return { path, method, body, headers };
}