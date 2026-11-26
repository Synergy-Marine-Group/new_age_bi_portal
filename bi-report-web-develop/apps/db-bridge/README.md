# BI Portal DB bridge (Lambda Web Function)

Deploy this package as the application for **BiPortal-AmplifyDev-Function**. It is the only runtime that opens PostgreSQL using `SQL_CONNECTION_STRING`.

## Environment (Lambda)

- `SQL_CONNECTION_STRING` — `postgres://...` with URL-encoded password
- `LAMBDA_DB_BRIDGE_SECRET` — shared HMAC secret (must match Amplify SSR)

## Endpoints

- `GET /health` — `SELECT 1` (no HMAC)
- `POST /v1/exec` — HMAC-signed JSON `{ op, sql?, params?, sessionId? }`

## Local smoke test

```bash
cd apps/db-bridge
npm install
SQL_CONNECTION_STRING=... LAMBDA_DB_BRIDGE_SECRET=dev npm start
```