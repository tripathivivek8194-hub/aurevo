# AUREVO free-cloud deployment

This document prepares a parallel cloud deployment. It does not replace the
existing Docker deployment and it must not be used to overwrite the current
production database.

## Architecture

| Component | Service | Configuration |
| --- | --- | --- |
| Storefront | Cloudflare Pages | Repository root: `apps/web`; build command: `npm run build`; output: `dist` |
| API | Render Free Web Service | Create from `render.yaml`; Docker context is the repository root |
| Database | Neon PostgreSQL | Create a new project and provide its pooled connection string as `DATABASE_URL` |

Use `https://aurevo.buzz` for the storefront and `https://api.aurevo.buzz`
for the API. The Pages build must set `VITE_API_URL` to
`https://api.aurevo.buzz/api`; it is a public browser URL, not a secret.

## Required Cloudflare Pages variables

Set these in the production environment before deploying Pages:

```text
VITE_API_URL=https://api.aurevo.buzz/api
VITE_SITE_URL=https://aurevo.buzz
VITE_RAZORPAY_KEY_ID=<public Razorpay key id>
VITE_GOOGLE_CLIENT_ID=<public Google OAuth web client id>
NODE_VERSION=22
```

`VITE_` values are included in the browser bundle. Never put a secret in one.

## Required Render variables

`render.yaml` generates the JWT and encryption secrets. Enter the remaining
values only in Render's secret-entry screen, never in Git:

```text
DATABASE_URL=<new Neon pooled PostgreSQL connection string>
WEB_URL=https://aurevo.buzz
ADMIN_EMAIL=<store owner email>
RAZORPAY_KEY_ID=<live key id>
RAZORPAY_KEY_SECRET=<live secret>
RAZORPAY_WEBHOOK_SECRET=<new webhook signing secret>
GOOGLE_CLIENT_ID=<Google OAuth web client id>
EMAIL_API_KEY=<transactional email API key>
EMAIL_FROM=<verified sender address>
EMAIL_FROM_NAME=AUREVO
```

Add supplier-provider credentials only if those integrations are enabled.

## Database safety gate

The cloud API runs `prisma migrate deploy`, which applies only committed
migrations. It never runs `prisma db push` against production.

Do not point the new Render service at the existing Docker PostgreSQL database.
Before moving any orders, customers, products, or payment records, take a
verified backup and restore it into a separate Neon database. Validate record
counts and a checkout test against the cloud copy before changing DNS or
Razorpay webhooks.

## DNS and cutover order

1. Deploy the Render API and confirm `/api/health/ready` is healthy.
2. Add `api.aurevo.buzz` as a Render custom domain and create the DNS record
   Render supplies in Cloudflare.
3. Deploy Pages, test it on its Pages URL with the cloud API, then add
   `aurevo.buzz` and `www.aurevo.buzz` as custom domains.
4. Run login, refresh-token, checkout, email, webhook, and admin tests.
5. Only after the tests pass, update the Razorpay webhook URL to the cloud API.
6. Keep the Docker deployment and its database unchanged until the cloud site
   has been stable and its backups have been verified.

## Free-tier limitations

Render's Free web service sleeps after 15 minutes idle and can take about a
minute to wake. It has an ephemeral filesystem and a finite monthly usage
allowance. This is suitable for a low-traffic launch or a staging deployment,
not a reliable production order system. Neon data must be backed up separately.
