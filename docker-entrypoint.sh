#!/bin/sh
set -e

echo "[Entrypoint] Syncing database schema..."
npx drizzle-kit push --force

echo "[Entrypoint] Starting application..."
exec node dist/server/entry.mjs
