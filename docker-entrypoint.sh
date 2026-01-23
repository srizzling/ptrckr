#!/bin/sh

echo "[Entrypoint] Starting..."
echo "[Entrypoint] Syncing database schema..."

if npx drizzle-kit push --force 2>&1; then
  echo "[Entrypoint] Schema sync complete"
else
  echo "[Entrypoint] Schema sync failed, continuing anyway..."
fi

echo "[Entrypoint] Starting application..."
exec node dist/server/entry.mjs
