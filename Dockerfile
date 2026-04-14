FROM oven/bun:1

WORKDIR /app

# Install dependencies first (better caching)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy Prisma schema and generate client
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN bunx prisma generate

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Expose port
EXPOSE 3000

# Start the server
CMD ["bun", "run", "src/index.ts"]
