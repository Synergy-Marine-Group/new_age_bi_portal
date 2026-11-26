#!/usr/bin/env bash
# Amplify Hosting: writes .env.production then runs next build. Missing env vars do not fail the build.
set +e
echo "AMPLIFY_BUILD_SPEC=bi-portal-bridge-v4"
: > .env.production
for pattern in \
  '^MICROSOFT_TENANT_ID=' \
  '^MICROSOFT_CLIENT_ID=' \
  '^MICROSOFT_CLIENT_SECRET=' \
  '^MICROSOFT_REDIRECT_URI=' \
  '^JWT_SECRET=' \
  '^LAMBDA_DB_BRIDGE_URL=' \
  '^LAMBDA_DB_BRIDGE_SECRET=' \
  '^SQL_CONNECTION_STRING='
do
  env | grep -e "$pattern" >> .env.production
done
env | grep -e '^NEXT_PUBLIC_' >> .env.production
set -e
exec npm run build