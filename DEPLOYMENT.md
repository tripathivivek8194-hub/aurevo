# AUREVO Production Deployment — VPS (Aurevo.buzz)

## Prerequisites

- VPS running Ubuntu 22.04+ (4GB RAM minimum for Postgres + Redis + NestJS + Vite)
- Domain `Aurevo.buzz` pointing to VPS IP (GoDaddy DNS A records)
- Docker + Docker Compose v2 installed on VPS
- SSH access to VPS as root (or sudo-capable user)
- Razorpay live/test key pair ready

---

## Step 1 — VPS Setup

```bash
# SSH into VPS
ssh root@<VPS_IP>

# Install Docker (official convenience script)
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Install Docker Compose v2 plugin (if not bundled)
apt-get update && apt-get install -y docker-compose-plugin

# Verify
docker compose version
```

---

## Step 2 — DNS (GoDaddy)

Set these DNS records **before** deploying (they need time to propagate):

| Type  | Host | Value          | TTL   |
|-------|------|----------------|-------|
| A     | @    | `<VPS_IP>`     | 600s  |
| A     | www  | `<VPS_IP>`     | 600s  |
| CNAME | api  | `Aurevo.buzz`  | 600s  |

> The `api` CNAME is optional — the reverse proxy serves `/api/*` from the same origin.

---

## Step 3 — Transfer Project to VPS

**Option A — rsync (fastest):**
```bash
# From your local machine:
rsync -avz --exclude node_modules --exclude .git --exclude dist --exclude dev.db \
  ./ root@<VPS_IP>:/opt/aurevo
```

**Option B — git clone:**
```bash
# On the VPS:
mkdir -p /opt/aurevo && cd /opt/aurevo
git clone <your-repo-url> .
```

---

## Step 4 — Create Production `.env`

A reference template with the correct variable names is committed at **`.env.production`**. Copy it and fill real values:

```bash
cd /opt/aurevo
cp .env.production .env
nano .env   # paste the generated secrets below
```

```bash
# Generate secrets on the VPS:
openssl rand -hex 24      # POSTGRES_PASSWORD
openssl rand -hex 24      # REDIS_PASSWORD
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY
```

| Required var | Source |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `REDIS_PASSWORD` | `openssl rand -hex 24` |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay dashboard (live key pair) |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay → Settings → Webhooks |
| `ADMIN_EMAIL` | Your first admin address |
| `SITE_URL` | `https://Aurevo.buzz` |

> **Do NOT set `DATABASE_URL` or `REDIS_URL` manually** — the compose file derives both from `POSTGRES_PASSWORD` / `REDIS_PASSWORD` and injects them into the API container. Values you set in `.env` for these are ignored.

---

## Step 5 — SSL Certificates (Let's Encrypt)

```bash
# Install certbot
apt-get install -y certbot

# Stop nginx on the host if running (port 80 must be free for the challenge)
systemctl stop nginx 2>/dev/null; systemctl disable nginx 2>/dev/null

# Get certificates (standalone mode — temporarily binds port 80)
certbot certonly --standalone \
  -d Aurevo.buzz -d www.Aurevo.buzz \
  --non-interactive --agree-tos \
  --email admin@Aurevo.buzz

# Certs written to:
#   /etc/letsencrypt/live/Aurevo.buzz/fullchain.pem
#   /etc/letsencrypt/live/Aurevo.buzz/privkey.pem
```

Copy certs into the project for the edge nginx container:

```bash
mkdir -p /opt/aurevo/certs
cp /etc/letsencrypt/live/Aurevo.buzz/fullchain.pem /opt/aurevo/certs/
cp /etc/letsencrypt/live/Aurevo.buzz/privkey.pem /opt/aurevo/certs/
chmod 600 /opt/aurevo/certs/privkey.pem
```

---

## Step 6 — Deploy

```bash
cd /opt/aurevo

# Build and start all 5 services (nginx, web, api, postgres, redis)
docker compose -f docker-compose.prod.yml up -d --build
```

> **First deploy:** The API container runs `prisma migrate deploy` automatically at startup (inside the entrypoint). No manual migration step is needed. The database is created by Postgres on first boot; tables are applied by the API container.

Watch logs until all services are healthy:

```bash
docker compose -f docker-compose.prod.yml logs -f api
# Wait for: "Nest application successfully started"
# Ctrl+C to stop following

# Verify all containers are running
docker compose -f docker-compose.prod.yml ps
```

Expected output — all 5 services `Up (healthy)`:

```
NAME                 STATUS
aurevo-prod-api-1    Up (healthy)
aurevo-prod-postgres-1 Up (healthy)
aurevo-prod-redis-1  Up (healthy)
aurevo-prod-web-1    Up
aurevo-prod-nginx-1  Up
```

---

## Step 7 — Verify the Live Site

```bash
# Health check (should return {"status":"ok"})
curl -s https://Aurevo.buzz/api/health

# Homepage (should return HTML)
curl -sI https://Aurevo.buzz/

# API products (should return JSON)
curl -s https://Aurevo.buzz/api/products?limit=1 | head -c 200

# HTTP → HTTPS redirect (should 301)
curl -sI http://Aurevo.buzz/

# Security headers (should show HSTS, CSP, X-Frame-Options)
curl -sI https://Aurevo.buzz/api/health | grep -E "strict-transport|content-security|x-frame"
```

### Bootstrap the Admin Account

There is no seed script — the first person to **register** with the email matching `ADMIN_EMAIL` automatically receives the `ADMIN` role:

1. Open `https://Aurevo.buzz/register` in a browser
2. Register with email `admin@Aurevo.buzz` and a strong password
3. You are now the admin — access the dashboard at `https://Aurevo.buzz/admin`

> **Email verification:** If `RESEND_API_KEY` is set, a verification email is sent. If not set, the token is generated but not delivered — you can still log in, but `emailVerified` stays `false` until configured.

### Configure Razorpay Webhook

After the site is live, set the webhook in the Razorpay dashboard:

1. Go to [Razorpay Dashboard → Settings → Webhooks](https://dashboard.razorpay.com/app/settings/webhooks)
2. Add webhook URL: `https://Aurevo.buzz/api/payments/webhook`
3. Select events: `payment.captured`, `payment.failed`, `payment.refunded`
4. Copy the webhook secret and update `RAZORPAY_WEBHOOK_SECRET` in `.env` if it differs from what you set earlier
5. Redeploy if you changed the secret: `docker compose -f docker-compose.prod.yml up -d api`

---

## Step 8 — Auto-Renewal Cron (Certbot)

Let's Encrypt certs expire after 90 days. Set up automatic renewal:

```bash
# Add a cron job to renew and copy certs into the project
cat > /etc/cron.d/certbot-renew << 'EOF'
# Attempt renewal twice daily; copy new certs and reload nginx if successful.
0 3,15 * * * root certbot renew --quiet \
  --deploy-hook "cp /etc/letsencrypt/live/Aurevo.buzz/fullchain.pem /opt/aurevo/certs/ && cp /etc/letsencrypt/live/Aurevo.buzz/privkey.pem /opt/aurevo/certs/ && chmod 600 /opt/aurevo/certs/privkey.pem && docker compose -f /opt/aurevo/docker-compose.prod.yml exec -T nginx nginx -s reload" \
  >> /var/log/certbot-renew.log 2>&1
EOF

chmod 644 /etc/cron.d/certbot-renew
```

Test the renewal flow:

```bash
certbot renew --dry-run
```

---

## Step 9 — (Optional) CI/CD with GitHub Actions

A pre-configured workflow exists at `.github/workflows/ci.yml`. To enable auto-deploy on push to `main`:

```bash
# On the VPS: generate a deploy key
ssh-keygen -t ed25519 -f /opt/aurevo/.github-deploy-key -N ""

# Add the PUBLIC key as a Deploy Key in GitHub repo settings (read access)
cat /opt/aurevo/.github-deploy-key.pub

# Add the PRIVATE key as a repository secret: DEPLOY_KEY
# Add VPS_HOST as a repository secret: <VPS_IP>
# Add VPS_USER as a repository secret: root
```

The CI workflow runs lint + build + tests on every push. Manual deployment is recommended until you've validated the deploy key flow.

---

## Troubleshooting

### API container exits immediately

```bash
docker compose -f docker-compose.prod.yml logs api
```

Common causes:
- Missing `.env` variables — the `${VAR:?}` guard prints the variable name in the error
- PostgreSQL not ready yet — the API retries via `depends_on: condition: service_healthy`
- Port 4000 conflict — nothing else should bind to 4000 on the host (the API is only exposed inside the Docker network)

### 502 Bad Gateway from nginx

```bash
docker compose -f docker-compose.prod.yml ps
```

If `api` or `web` shows `Restarting` or `Exit`, check its logs. The nginx edge proxy only forwards to healthy upstreams.

### Database is empty after deploy

The API runs `prisma migrate deploy` at container startup. If the database was created fresh, migrations are applied automatically. If you see empty tables:

```bash
# Check migration status
docker compose -f docker-compose.prod.yml exec api npx prisma migrate status --schema apps/api/prisma/schema.prisma
```

### CORS errors in browser

Ensure `SITE_URL=https://Aurevo.buzz` is set in `.env`. The API's CORS allowlist is built from `WEB_URL` (which maps to `SITE_URL` in the compose file). Redeploy after changing:

```bash
docker compose -f docker-compose.prod.yml up -d api
```

---

## Service Architecture

```
Internet → :443 (nginx edge)
              ├─ /api/* → api:4000 (NestJS)
              └─ /*     → web:80  (Vite SPA via nginx)

Internal:
  api:4000  → postgres:5432 (Prisma)
  api:4000  → redis:6379    (sessions/cache)
```

- **No host ports** exposed for PostgreSQL or Redis — they are internal to the Docker network only
- **Prisma migrations** run automatically at API container startup (no manual step)
- **Health checks** on API (`/api/health`) and Postgres (`pg_isready`) gate service readiness

---

## Quick Reference — All Docker Commands

```bash
# Deploy / rebuild
docker compose -f docker-compose.prod.yml up -d --build

# View logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f nginx

# Restart a single service
docker compose -f docker-compose.prod.yml restart api

# Stop everything
docker compose -f docker-compose.prod.yml down

# Stop + delete database volume (DANGER — wipes data)
docker compose -f docker-compose.prod.yml down -v

# Run a Prisma command inside the API container
docker compose -f docker-compose.prod.yml exec api npx prisma migrate status --schema apps/api/prisma/schema.prisma
docker compose -f docker-compose.prod.yml exec api npx prisma db push --schema apps/api/prisma/schema.prisma
```

---

## Checklist

- [ ] VPS provisioned, Docker installed
- [ ] DNS A records set for `@` and `www`
- [ ] Project transferred to `/opt/aurevo`
- [ ] `.env` created with all required secrets
- [ ] SSL certs obtained via certbot
- [ ] `docker compose -f docker-compose.prod.yml up -d --build` succeeds
- [ ] `curl https://Aurevo.buzz/api/health` returns `{"status":"ok"}`
- [ ] Admin registered at `https://Aurevo.buzz/register` with `ADMIN_EMAIL`
- [ ] Razorpay webhook configured to `https://Aurevo.buzz/api/payments/webhook`
- [ ] Certbot auto-renewal cron installed and tested
