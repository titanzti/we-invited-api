#!/bin/sh
set -e

# Wait for database to be ready
echo "⏳ Waiting for database..."
MAX_RETRIES=30
RETRY_COUNT=0
until nc -z db 5432; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "❌ Database not available after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "  Attempt $RETRY_COUNT/$MAX_RETRIES..."
  sleep 1
done
echo "✅ Database is ready!"

# Apply database schema
echo "🔄 Applying database schema..."
bunx prisma migrate deploy

# Start the server
echo "🚀 Starting API server..."
exec bun run src/index.ts
