#!/bin/sh
set -e

# Wait for database to be ready
echo "⏳ Waiting for database..."
until nc -z db 5432; do
  sleep 1
done
echo "✅ Database is ready!"

# Apply database schema
echo "🔄 Applying database schema..."
bunx prisma db push

# Start the server
echo "🚀 Starting API server..."
exec bun run src/index.ts
