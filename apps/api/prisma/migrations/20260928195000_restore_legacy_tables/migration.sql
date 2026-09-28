-- Preserve legacy production data that predates the Prisma schema baseline.
-- These tables are intentionally managed by this SQL migration even though
-- they have no current Prisma models.

CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "source" TEXT,
    "path" TEXT,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analytics_events_event_createdAt_idx"
    ON "analytics_events"("event", "createdAt");
CREATE INDEX "analytics_events_productId_createdAt_idx"
    ON "analytics_events"("productId", "createdAt");
CREATE INDEX "analytics_events_visitorId_createdAt_idx"
    ON "analytics_events"("visitorId", "createdAt");

CREATE TABLE "support_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "orderNumber" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_requests_email_idx" ON "support_requests"("email");
CREATE INDEX "support_requests_status_createdAt_idx"
    ON "support_requests"("status", "createdAt");
