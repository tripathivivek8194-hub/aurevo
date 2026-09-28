# syntax=docker/dockerfile:1

# ============================================================================
# AUREVO API — production multi-stage build
#
# Build from the repo ROOT (it is a Turborepo monorepo):
#   docker build -f apps/api/Dockerfile -t aurevo-api .
#
# The runtime stage never receives .env, dev.db, or test fixtures — only the
# compiled dist and production dependencies — and runs as a non-root user.
# Prisma migrations are copied and applied at container startup (before serve).
# ============================================================================

# ---------------------------------------------------------------------------
# Stage 1 — build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

# bcrypt is a native module; alpine has no build toolchain by default, so
# install one here in the build stage only (it is not needed at runtime —
# bcrypt ships musl prebuilds, and we install prod-only deps separately).
RUN apk add --no-cache python3 make g++ openssl

WORKDIR /app

# Workspace manifests first so dependency layers cache across builds.
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Full install (dev + prod) needed to compile.
RUN npm ci

# Source for the API and the workspace package it imports.
COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/

# Generate the Prisma client, then compile shared -> api (turbo honours the
# ^build dependency ordering). shared must be built first — api imports its
# compiled types (dist/index.d.ts); without this, TS2307 errors flood the build.
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
    && npx turbo run build --filter=@aurevo/shared \
    && npx turbo run build --filter=@aurevo/api

# ---------------------------------------------------------------------------
# Stage 2 — runtime (small, non-root)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# tini reaps zombies / forwards signals; curl powers the healthcheck.
# openssl is needed at runtime for Prisma's query engine.
RUN apk add --no-cache tini curl openssl \
    && addgroup -S aurevo && adduser -S aurevo -G aurevo

WORKDIR /app

# Recreate just enough of the workspace tree for a prod-only install.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Production dependencies only. No build tools required at runtime.
RUN npm ci --omit=dev && npm cache clean --force

# Compiled application code (no source, no .env, no tests).
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist

# Prisma schema + generated client + MIGRATIONS (for db migrate deploy at startup).
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
COPY apps/api/prisma/migrations apps/api/prisma/migrations
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client node_modules/@prisma/client
# Prisma CLI is a devDependency, but we need it for `db push` at startup.
COPY --from=build /app/node_modules/prisma node_modules/prisma
COPY --from=build /app/node_modules/.bin/prisma node_modules/.bin/prisma
# Pre-copy Prisma engine binaries so it doesn't try to download them at runtime.
COPY --from=build /app/node_modules/@prisma/engines node_modules/@prisma/engines

ENV NODE_ENV=production
ENV PORT=4000

# Ensure non-root user can read node_modules and write to engine cache.
RUN chown -R aurevo:aurevo /app

USER aurevo

EXPOSE 4000

# Healthcheck against the API's own health endpoint (global prefix /api).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/api/health || exit 1

# Apply only committed Prisma migrations before serving traffic. `db push` is
# intentionally not used in production because it can introduce unreviewed
# schema changes and is unsuitable for protecting live order data.
# --skip-generate: Prisma client already built at image build time.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main"]
