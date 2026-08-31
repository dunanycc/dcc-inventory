ALTER TABLE "Product" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY name, id) - 1 AS position
  FROM "Product"
)
UPDATE "Product"
SET "displayOrder" = ranked.position
FROM ranked
WHERE "Product".id = ranked.id;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_displayOrder_nonnegative" CHECK ("displayOrder" >= 0);

DROP INDEX IF EXISTS "Product_categoryId_active_name_idx";
CREATE INDEX "Product_categoryId_active_displayOrder_idx" ON "Product"("categoryId", "active", "displayOrder");
