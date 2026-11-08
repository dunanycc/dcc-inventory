ALTER TABLE "Product" ADD COLUMN "vendorId" UUID;
ALTER TABLE "Product" ADD CONSTRAINT "Product_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Product_vendorId_idx" ON "Product"("vendorId");

-- Create the initial Vendors without changing existing Vendor records.
INSERT INTO "Vendor" ("id", "name", "nameNormalized", "displayOrder", "updatedAt")
SELECT gen_random_uuid(), names.name, lower(names.name),
  COALESCE((SELECT MAX("displayOrder") FROM "Vendor"), -1) + names.position, CURRENT_TIMESTAMP
FROM (VALUES ('SAQ', 1), ('Beer', 2), ('Groceries', 3)) AS names(name, position)
ON CONFLICT ("nameNormalized") DO NOTHING;

-- One-time assignment for existing Products, including inactive Products.
UPDATE "Product" AS product
SET "vendorId" = vendor.id, "updatedAt" = CURRENT_TIMESTAMP
FROM "Category" AS category, "Vendor" AS vendor
WHERE product."categoryId" = category.id AND product."vendorId" IS NULL
AND vendor."nameNormalized" = CASE
  WHEN category."nameNormalized" IN ('wine', 'hard liquor', 'mixed drinks') THEN 'saq'
  WHEN category."nameNormalized" IN ('beer', 'beer kegs', 'non-alcohol beer', 'non alcohol beer') THEN 'beer'
  WHEN category."nameNormalized" = 'mixers & misc' THEN 'groceries'
END;
