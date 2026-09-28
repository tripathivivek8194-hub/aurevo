# syntax=docker/dockerfile:1

# ============================================================================
# AUREVO Web — production multi-stage build
#
# Build from the repo ROOT (it is a Turborepo monorepo):
#   docker build -f apps/web/Dockerfile -t aurevo-web .
#
# Compiles the Vite SPA in a node stage, then serves the static output from
# nginx (alpine) with SPA fallback and immutable asset caching. TLS termination
# and reverse proxying to the API happen in the edge nginx (docker-compose.prod),
# so this container only serves static files.
# ============================================================================

# ---------------------------------------------------------------------------
# Stage 1 — build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Workspace manifests first so dependency layers cache across builds.
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/design-system/package.json packages/design-system/
COPY packages/shared/package.json packages/shared/

RUN npm ci

# Source for the web app and its workspace dependencies.
COPY apps/web/ apps/web/
COPY packages/design-system/ packages/design-system/
COPY packages/shared/ packages/shared/

# Vite inlines env vars at build time; they are baked in on purpose for the
# static bundle — pass them as --build-arg. The web client calls the API
# same-origin (baseURL '/api' via the edge nginx), so there is no VITE_API_URL;
# SITE_URL feeds canonical/og URLs (omitted until a domain is set, see useSeo)
# and the Razorpay key powers the checkout widget.
ARG VITE_SITE_URL
ARG VITE_RAZORPAY_KEY_ID
ARG VITE_GOOGLE_CLIENT_ID

ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
# Compile shared + design-system then the web app (turbo orders by ^build).
RUN npx turbo run build --filter=@aurevo/web

# ---------------------------------------------------------------------------
# Stage 2 — nginx runtime
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Our nginx config: SPA fallback + immutable asset caching (see apps/web/nginx.conf).
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Built static site.
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# nginx:alpine ships busybox wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
