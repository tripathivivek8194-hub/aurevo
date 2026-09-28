-- DropIndex
DROP INDEX "inventory_productId_key";

-- CreateIndex
CREATE INDEX "inventory_productId_idx" ON "inventory"("productId");
