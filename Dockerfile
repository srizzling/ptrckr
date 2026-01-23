# Build stage
FROM node:20-slim AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies (including native module compilation)
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Prune dev dependencies for smaller production image
RUN pnpm prune --prod

# Production stage - slim image (no browser needed, uses Firecrawl API)
FROM node:20-slim AS runner

# Only install wget for healthcheck
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create data directory for SQLite
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy only what's needed for production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
# Include schema and config for drizzle-kit push (run at startup)
COPY --from=builder /app/src/lib/db/schema.ts ./src/lib/db/schema.ts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Use non-root user for security
USER node

# Set environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=/app/data/ptrckr.db

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the application (schema sync happens in Node process)
CMD ["node", "dist/server/entry.mjs"]
