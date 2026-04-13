# we-invited-api

Bun + Elysia API server with Prisma ORM (PostgreSQL).

## Run

```bash
bun run src/index.ts
```

Server runs on port 3000. Swagger UI at `/swagger`.

## Test

```bash
bun test
```

**Requires PostgreSQL Docker running** (`docker compose up -d`).

## Database

Prisma v7 with PostgreSQL. Schema in `prisma/schema.prisma`.

```bash
bunx prisma migrate dev  # Apply migrations
bunx prisma generate   # Generate client
```

## Mobile Client

Flutter app: **we-invited-v2** connects to this API.