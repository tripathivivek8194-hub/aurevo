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
CREATE INDEX "analytics_events_visitorId_createdAt_idx"
  ON "analytics_events"("visitorId", "createdAt");
CREATE INDEX "analytics_events_productId_createdAt_idx"
  ON "analytics_events"("productId", "createdAt");
