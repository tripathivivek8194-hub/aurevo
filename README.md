# AUREVO

**Discover Better. Live Beautifully.**

A premium, production-oriented ecommerce platform built with modern architecture.

## Architecture Overview

- **Monorepo**: npm workspaces + Turborepo
- **Backend**: NestJS + TypeScript + Prisma + PostgreSQL
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + TanStack Query + Zustand
- **Shared**: Types, validators, constants, design tokens
- **Payments**: Razorpay (test mode, webhook-verified)
- **Suppliers**: AliExpress Open Platform, IndiaMART (pluggable adapters)
- **Auth**: JWT access/refresh tokens, HttpOnly cookies, role-based access
- **Admin**: Custom React dashboard (single store owner via ADMIN_EMAIL)

## Project Structure

```
AUREVO/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # React frontend
├── packages/
│   ├── shared/       # Shared types, validators, constants
│   └── design-system/# Design tokens, theme, UI primitives
├── turbo.json
├── package.json
├── docker-compose.yml
├── .env.example
├── TASKS.md
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+ (or npm 10+)
- Docker + Docker Compose (for PostgreSQL, Redis)

### Installation

```bash
# Install dependencies
npm install

# Start databases
docker-compose up -d

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
cd apps/api && npx prisma migrate dev

# Start development servers
npm run dev
```

### Available Scripts

```bash
# From root
npm run dev          # Start all apps in development
npm run build        # Build all packages and apps
npm run lint         # Lint all packages
npm run test         # Run all tests
npm run test:e2e     # Run E2E tests
npm run db:studio    # Open Prisma Studio
npm run db:reset     # Reset database and re-run migrations

# From apps/api
npm run start:dev    # Start API in watch mode
npm run start:prod   # Start API in production mode

# From apps/web
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
```

## Environment Variables

See `.env.example` for all required variables. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` | Secret for access tokens (32+ chars) |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens (32+ chars) |
| `ADMIN_EMAIL` | Email of the single store owner |
| `RAZORPAY_KEY_ID` | Razorpay key ID (test mode) |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook secret |
| `ALIEXPRESS_APP_KEY` | AliExpress Open Platform app key |
| `ALIEXPRESS_APP_SECRET` | AliExpress Open Platform app secret |
| `ALIEXPRESS_ACCESS_TOKEN` | Legacy static access token (recommended path is OAuth below) |
| `ALIEXPRESS_CALLBACK_URL` | Stable HTTPS OAuth callback URL (required for Connect flow) |
| `INDIAMART_CRM_ID` | IndiaMART CRM ID |
| `INDIAMART_API_KEY` | IndiaMART API key |
| `EMAIL_API_KEY` | Transactional email provider API key |

## Database

PostgreSQL with Prisma ORM. Key models:
- User, Address, Category, Product, ProductVariant, ProductImage
- Inventory, Supplier, SupplierProduct
- Cart, CartItem, Order, OrderItem, Payment, Shipment, TrackingEvent
- Review, Wishlist, WishlistItem, Coupon, AuditLog

## Authentication

- **Access Token**: 15 min, RS256, in memory
- **Refresh Token**: 30 days, HttpOnly Secure cookie, rotating, revocable
- **Roles**: CUSTOMER, ADMIN (single owner via ADMIN_EMAIL)
- **Password Reset**: Email with signed JWT (1hr expiry)

## Supplier Integration

Pluggable `SupplierAdapter` interface with two implementations:
- **AliExpressAdapter**: Open Platform API (catalog, orders, tracking)
- **IndiaMARTAdapter**: Lead Management / Catalog API (per actual capabilities)

Suppliers configured per-product. Admin controls import, sync, fulfillment.

### AliExpress (Phase 8) — OAuth seller authorization

The modern path is OAuth seller authorization rather than a static env token. The access/refresh token is stored **encrypted** in the database column `Supplier.apiConfig` (AES-256-GCM under `ENCRYPTION_KEY`) and is never returned to the frontend or logged.

**Runtime credential configuration** (recommended):
1. In **Admin → Suppliers**, click **Configure AliExpress** (automatically shown when not configured)
2. Enter your AliExpress **App Key**, **App Secret**, and **Callback URL**
   - Callback URL must be a stable HTTPS URL ending in `/api/suppliers/aliexpress/callback` (no http, no localhost)
   - Register the **exact same URL** as the app's callback in the AliExpress Open Platform console
3. The App Secret is stored encrypted server-side and is never shown again or returned to the frontend

**OAuth flow:**
1. Once credentials are configured, click **Authorize with AliExpress** (opens OAuth authorize page) → authorize the seller
2. The browser redirects back through `/api/suppliers/aliexpress/callback`, which validates the OAuth `state`, exchanges the code server-side, and stores the token encrypted
3. Click **Verify against API** to confirm the connection with a real AliExpress API call

**Connection states** (honest — no fabrication):
- **Not configured**: credentials missing → configure via the admin UI
- **Configured · not authorized**: credentials present, no token → run OAuth flow
- **Configured · unverified**: authorized, not yet verified → click Verify
- **Connected · verified**: verified against real API → capabilities confirmed

The admin UI shows distinct states (`NOT_CONFIGURED` / `DISCONNECTED` / `READY` / `CONNECTED` / `ERROR`) and only reports capabilities as `SUPPORTED` after a genuine API call succeeds.

> **Note:** the adapter's default API base URL and signing scheme are from the original skeleton and must be confirmed against the current official AliExpress Open Platform docs during live verification — capabilities are reported as `UNVERIFIED` until a real call succeeds. Real-API verification is **blocked** until a usable callback URL and authorized seller token are available.

**Endpoints (admin):**
- `POST /suppliers/aliexpress/config` — save credentials (App Key, Secret, Callback URL)
- `GET /suppliers/aliexpress/connect` — get OAuth authorize URL
- `GET /suppliers/aliexpress/status` — connection status + masked key + capabilities
- `POST /suppliers/aliexpress/verify` — verify with real API call
- `POST /suppliers/aliexpress/disconnect` — revoke stored token (keeps credentials)
- `GET /suppliers/aliexpress/callback` — public OAuth callback

## Payments

Razorpay integration with server-side verification:
1. Backend creates Razorpay Order
2. Frontend opens Razorpay Checkout
3. Razorpay posts to webhook endpoint
4. Backend verifies HMAC signature, updates order status
5. **Never trusts frontend payment success**

## Admin Dashboard

Protected routes at `/admin/*`:
- Dashboard (real KPIs)
- Products (CRUD, variants, images, supplier linking)
- Orders (lifecycle, fulfillment)
- Customers, Suppliers, Reviews, Categories, Analytics, Settings

## Development Principles

- **No fake data**: Empty states instead of demo content
- **Security first**: All authorization server-side, secrets never in frontend
- **Real integrations**: Adapter pattern for suppliers/payments, test-mode keys
- **Type safety**: Shared types between frontend/backend via `packages/shared`
- **Design system**: Consistent, accessible UI via `packages/design-system`

## License

Private — All rights reserved.