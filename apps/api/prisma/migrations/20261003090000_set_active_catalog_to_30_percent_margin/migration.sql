-- Set every sellable ACTIVE catalog item to a true 30% gross margin where a
-- supplier landed cost is available. Amounts are stored in paise, so
-- CEIL(cost * 100 / 70) is the smallest whole-paise price with a 30% margin.
-- Drafts, archived products, and products without a usable landed cost remain
-- untouched because their margin cannot be calculated safely.

UPDATE "products"
SET "basePrice" = CEIL("cost" * 100.0 / 70.0)::INTEGER
WHERE "status" = 'ACTIVE'
  AND "cost" IS NOT NULL
  AND "cost" > 0;

-- Product variants are customer-selectable sell prices. The schema stores a
-- product-level landed cost, so the same 30% price rule applies to each active
-- variant belonging to an active product with a usable cost.
UPDATE "product_variants" AS variant
SET "price" = CEIL(product."cost" * 100.0 / 70.0)::INTEGER
FROM "products" AS product
WHERE variant."productId" = product."id"
  AND variant."isActive" = TRUE
  AND product."status" = 'ACTIVE'
  AND product."cost" IS NOT NULL
  AND product."cost" > 0;
