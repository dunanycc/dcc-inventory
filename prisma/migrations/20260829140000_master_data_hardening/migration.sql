-- Preserve the existing request-eligibility values while making their meaning explicit.
ALTER TABLE "Product"
RENAME COLUMN "starterShackEligible" TO "starterShackRequestEligible";

-- Canonical business keys. Application writes these values, while CHECK constraints
-- ensure direct clients use exactly the same trim/case/whitespace normalization.
ALTER TABLE "User" ADD COLUMN "emailNormalized" TEXT;
UPDATE "User" SET "emailNormalized" = lower(btrim("email", E' \t\r\n\f\v'));
ALTER TABLE "User" ALTER COLUMN "emailNormalized" SET NOT NULL;

ALTER TABLE "Category"
ADD COLUMN "nameNormalized" TEXT,
ADD COLUMN "sourceSystem" TEXT,
ADD COLUMN "sourceId" TEXT;
UPDATE "Category"
SET "nameNormalized" = lower(regexp_replace(btrim(translate("name", E'\t\r\n\f\v', '     ')), ' +', ' ', 'g'));
ALTER TABLE "Category" ALTER COLUMN "nameNormalized" SET NOT NULL;

ALTER TABLE "Product"
ADD COLUMN "sourceSystem" TEXT,
ADD COLUMN "sourceId" TEXT;

ALTER TABLE "ProductLocation"
ADD COLUMN "sourceSystem" TEXT,
ADD COLUMN "sourceId" TEXT;

CREATE UNIQUE INDEX "User_emailNormalized_key" ON "User"("emailNormalized");
CREATE UNIQUE INDEX "Category_nameNormalized_key" ON "Category"("nameNormalized");
CREATE UNIQUE INDEX "Category_sourceSystem_sourceId_key" ON "Category"("sourceSystem", "sourceId");
CREATE UNIQUE INDEX "Product_sourceSystem_sourceId_key" ON "Product"("sourceSystem", "sourceId");
CREATE UNIQUE INDEX "ProductLocation_sourceSystem_sourceId_key" ON "ProductLocation"("sourceSystem", "sourceId");

ALTER TABLE "User"
ADD CONSTRAINT "User_email_canonical_check"
CHECK ("email" = "emailNormalized" AND "emailNormalized" = lower(btrim("emailNormalized", E' \t\r\n\f\v')));

ALTER TABLE "Category"
ADD CONSTRAINT "Category_name_normalized_check"
CHECK ("nameNormalized" = lower(regexp_replace(btrim(translate("name", E'\t\r\n\f\v', '     ')), ' +', ' ', 'g'))),
ADD CONSTRAINT "Category_display_order_nonnegative_check"
CHECK ("displayOrder" >= 0),
ADD CONSTRAINT "Category_source_identity_pair_check"
CHECK (("sourceSystem" IS NULL AND "sourceId" IS NULL) OR
       (btrim("sourceSystem") <> '' AND btrim("sourceId") <> ''));

ALTER TABLE "Product"
ADD CONSTRAINT "Product_quantity_scale_range_check"
CHECK ("quantityScale" BETWEEN 0 AND 6),
ADD CONSTRAINT "Product_fractional_scale_check"
CHECK (("allowFractionalStock" AND "quantityScale" >= 1) OR
       (NOT "allowFractionalStock" AND "quantityScale" = 0)),
ADD CONSTRAINT "Product_purchase_conversion_pair_check"
CHECK (("purchaseUnit" IS NULL AND "unitsPerPurchaseUnit" IS NULL) OR
       ("purchaseUnit" IS NOT NULL AND "unitsPerPurchaseUnit" IS NOT NULL)),
ADD CONSTRAINT "Product_purchase_conversion_positive_check"
CHECK ("unitsPerPurchaseUnit" IS NULL OR "unitsPerPurchaseUnit" > 0),
ADD CONSTRAINT "Product_stock_unit_label_check"
CHECK (("stockUnit" = 'OTHER' AND "stockUnitLabel" IS NOT NULL AND btrim("stockUnitLabel") <> '') OR
       ("stockUnit" <> 'OTHER' AND "stockUnitLabel" IS NULL)),
ADD CONSTRAINT "Product_source_identity_pair_check"
CHECK (("sourceSystem" IS NULL AND "sourceId" IS NULL) OR
       (btrim("sourceSystem") <> '' AND btrim("sourceId") <> ''));

ALTER TABLE "ProductLocation"
ADD CONSTRAINT "ProductLocation_low_stock_threshold_nonnegative_check"
CHECK ("lowStockThreshold" IS NULL OR "lowStockThreshold" >= 0),
ADD CONSTRAINT "ProductLocation_source_identity_pair_check"
CHECK (("sourceSystem" IS NULL AND "sourceId" IS NULL) OR
       (btrim("sourceSystem") <> '' AND btrim("sourceId") <> ''));
