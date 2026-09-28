-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_product_import_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feedName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "perRunLimit" INTEGER NOT NULL DEFAULT 25,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "enrich" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'update',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nextPage" INTEGER NOT NULL DEFAULT 1,
    "isFeedFinished" BOOLEAN NOT NULL DEFAULT false,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "enrichedVariantCount" INTEGER NOT NULL DEFAULT 0,
    "enrichFailedCount" INTEGER NOT NULL DEFAULT 0,
    "failedIds" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME
);
INSERT INTO "new_product_import_jobs" ("cancelledAt", "categoryId", "completedAt", "country", "createdAt", "currency", "enrich", "errorCount", "errorMessage", "failedIds", "feedName", "id", "importedCount", "isFeedFinished", "mode", "nextPage", "perRunLimit", "processedCount", "skippedCount", "startedAt", "status", "updatedAt", "updatedCount") SELECT "cancelledAt", "categoryId", "completedAt", "country", "createdAt", "currency", "enrich", "errorCount", "errorMessage", "failedIds", "feedName", "id", "importedCount", "isFeedFinished", "mode", "nextPage", "perRunLimit", "processedCount", "skippedCount", "startedAt", "status", "updatedAt", "updatedCount" FROM "product_import_jobs";
DROP TABLE "product_import_jobs";
ALTER TABLE "new_product_import_jobs" RENAME TO "product_import_jobs";
CREATE INDEX "product_import_jobs_status_idx" ON "product_import_jobs"("status");
CREATE INDEX "product_import_jobs_feedName_country_categoryId_idx" ON "product_import_jobs"("feedName", "country", "categoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
