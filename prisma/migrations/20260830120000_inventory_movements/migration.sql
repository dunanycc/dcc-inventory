-- A narrow, append-only stock history. No mutable balance is stored.
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING', 'RECEIPT', 'TRANSFER', 'COUNT_ADJUSTMENT');

CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "sourceLocationId" UUID,
    "destinationLocationId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "postedById" UUID NOT NULL,
    "notes" TEXT,
    "receiptLineId" UUID,
    "transferLineId" UUID,
    "countLineId" UUID,
    "sourceSystem" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryMovement_quantity_positive_check" CHECK ("quantity" > 0),
    CONSTRAINT "InventoryMovement_location_shape_check" CHECK (
      ("type" IN ('OPENING', 'RECEIPT') AND "sourceLocationId" IS NULL AND "destinationLocationId" IS NOT NULL) OR
      ("type" = 'TRANSFER' AND "sourceLocationId" IS NOT NULL AND "destinationLocationId" IS NOT NULL AND "sourceLocationId" <> "destinationLocationId") OR
      ("type" = 'COUNT_ADJUSTMENT' AND (("sourceLocationId" IS NULL) <> ("destinationLocationId" IS NULL)))
    ),
    CONSTRAINT "InventoryMovement_reference_shape_check" CHECK (
      ("type" = 'OPENING' AND "receiptLineId" IS NULL AND "transferLineId" IS NULL AND "countLineId" IS NULL) OR
      ("type" = 'RECEIPT' AND "transferLineId" IS NULL AND "countLineId" IS NULL) OR
      ("type" = 'TRANSFER' AND "receiptLineId" IS NULL AND "countLineId" IS NULL) OR
      ("type" = 'COUNT_ADJUSTMENT' AND "receiptLineId" IS NULL AND "transferLineId" IS NULL)
    ),
    CONSTRAINT "InventoryMovement_source_identity_pair_check" CHECK (
      ("sourceSystem" IS NULL AND "sourceId" IS NULL) OR
      ("sourceSystem" IS NOT NULL AND "sourceId" IS NOT NULL AND btrim("sourceSystem") <> '' AND btrim("sourceId") <> '')
    )
);

CREATE UNIQUE INDEX "InventoryMovement_receiptLineId_key" ON "InventoryMovement"("receiptLineId");
CREATE UNIQUE INDEX "InventoryMovement_transferLineId_key" ON "InventoryMovement"("transferLineId");
CREATE UNIQUE INDEX "InventoryMovement_countLineId_key" ON "InventoryMovement"("countLineId");
CREATE UNIQUE INDEX "InventoryMovement_sourceSystem_sourceId_key" ON "InventoryMovement"("sourceSystem", "sourceId");
CREATE UNIQUE INDEX "InventoryMovement_opening_product_location_key"
ON "InventoryMovement"("productId", "destinationLocationId") WHERE "type" = 'OPENING';
CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");
CREATE INDEX "InventoryMovement_destinationLocationId_productId_idx" ON "InventoryMovement"("destinationLocationId", "productId");
CREATE INDEX "InventoryMovement_sourceLocationId_productId_idx" ON "InventoryMovement"("sourceLocationId", "productId");
CREATE INDEX "InventoryMovement_occurredAt_id_idx" ON "InventoryMovement"("occurredAt", "id");
CREATE INDEX "InventoryMovement_postedById_occurredAt_idx" ON "InventoryMovement"("postedById", "occurredAt");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Harden the already-deployed optional master-data source pairs. PostgreSQL
-- CHECK constraints accept NULL expressions, so each present branch must state
-- both columns are non-NULL explicitly.
ALTER TABLE "Category" DROP CONSTRAINT "Category_source_identity_pair_check";
ALTER TABLE "Category" ADD CONSTRAINT "Category_source_identity_pair_check" CHECK (
  ("sourceSystem" IS NULL AND "sourceId" IS NULL) OR
  ("sourceSystem" IS NOT NULL AND "sourceId" IS NOT NULL AND btrim("sourceSystem") <> '' AND btrim("sourceId") <> '')
);
ALTER TABLE "Product" DROP CONSTRAINT "Product_source_identity_pair_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_source_identity_pair_check" CHECK (
  ("sourceSystem" IS NULL AND "sourceId" IS NULL) OR
  ("sourceSystem" IS NOT NULL AND "sourceId" IS NOT NULL AND btrim("sourceSystem") <> '' AND btrim("sourceId") <> '')
);
ALTER TABLE "ProductLocation" DROP CONSTRAINT "ProductLocation_source_identity_pair_check";
ALTER TABLE "ProductLocation" ADD CONSTRAINT "ProductLocation_source_identity_pair_check" CHECK (
  ("sourceSystem" IS NULL AND "sourceId" IS NULL) OR
  ("sourceSystem" IS NOT NULL AND "sourceId" IS NOT NULL AND btrim("sourceSystem") <> '' AND btrim("sourceId") <> '')
);
