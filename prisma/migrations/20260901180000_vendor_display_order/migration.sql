ALTER TABLE "Vendor" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name, id) - 1 AS position
  FROM "Vendor"
)
UPDATE "Vendor"
SET "displayOrder" = ranked.position
FROM ranked
WHERE "Vendor".id = ranked.id;

ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_displayOrder_nonnegative" CHECK ("displayOrder" >= 0);
DROP INDEX IF EXISTS "Vendor_active_name_idx";
CREATE INDEX "Vendor_active_displayOrder_idx" ON "Vendor"("active", "displayOrder");
