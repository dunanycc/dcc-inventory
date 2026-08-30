CREATE TYPE "StockRequestStatus" AS ENUM ('SUBMITTED', 'PARTIALLY_GIVEN', 'GIVEN', 'CANCELLED');
CREATE TYPE "TransferStatus" AS ENUM ('COMPLETED');

CREATE TABLE "StockRequest" (
  "id" UUID NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "StockRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "notes" TEXT,
  "requestedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "sourceSystem" TEXT,
  "sourceId" TEXT,
  CONSTRAINT "StockRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockRequest_completion_shape_check" CHECK (
    ("status" IN ('SUBMITTED', 'PARTIALLY_GIVEN') AND "completedAt" IS NULL) OR
    ("status" IN ('GIVEN', 'CANCELLED') AND "completedAt" IS NOT NULL)
  ),
  CONSTRAINT "StockRequest_source_identity_pair_check" CHECK (
    ("sourceSystem" IS NULL AND "sourceId" IS NULL) OR
    ("sourceSystem" IS NOT NULL AND "sourceId" IS NOT NULL AND btrim("sourceSystem") <> '' AND btrim("sourceId") <> '')
  )
);

CREATE TABLE "StockRequestLine" (
  "id" UUID NOT NULL,
  "stockRequestId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "requestedQuantity" DECIMAL(18,6) NOT NULL,
  "quantityGiven" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "sourceSystem" TEXT,
  "sourceId" TEXT,
  CONSTRAINT "StockRequestLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockRequestLine_quantity_check" CHECK ("requestedQuantity" > 0 AND "quantityGiven" >= 0 AND "quantityGiven" <= "requestedQuantity"),
  CONSTRAINT "StockRequestLine_source_identity_pair_check" CHECK (
    ("sourceSystem" IS NULL AND "sourceId" IS NULL) OR
    ("sourceSystem" IS NOT NULL AND "sourceId" IS NOT NULL AND btrim("sourceSystem") <> '' AND btrim("sourceId") <> '')
  )
);

CREATE TABLE "Transfer" (
  "id" UUID NOT NULL,
  "stockRequestId" UUID NOT NULL,
  "sourceLocationId" UUID NOT NULL,
  "destinationLocationId" UUID NOT NULL,
  "status" "TransferStatus" NOT NULL DEFAULT 'COMPLETED',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "postedById" UUID NOT NULL,
  "notes" TEXT,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Transfer_locations_differ_check" CHECK ("sourceLocationId" <> "destinationLocationId")
);

CREATE TABLE "TransferLine" (
  "id" UUID NOT NULL,
  "transferId" UUID NOT NULL,
  "stockRequestLineId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  CONSTRAINT "TransferLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransferLine_quantity_positive_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "StockRequest_sourceSystem_sourceId_key" ON "StockRequest"("sourceSystem", "sourceId");
CREATE INDEX "StockRequest_requestedById_requestedAt_idx" ON "StockRequest"("requestedById", "requestedAt");
CREATE INDEX "StockRequest_status_requestedAt_idx" ON "StockRequest"("status", "requestedAt");
CREATE UNIQUE INDEX "StockRequestLine_stockRequestId_productId_key" ON "StockRequestLine"("stockRequestId", "productId");
CREATE UNIQUE INDEX "StockRequestLine_sourceSystem_sourceId_key" ON "StockRequestLine"("sourceSystem", "sourceId");
CREATE INDEX "StockRequestLine_productId_idx" ON "StockRequestLine"("productId");
CREATE INDEX "Transfer_stockRequestId_occurredAt_idx" ON "Transfer"("stockRequestId", "occurredAt");
CREATE INDEX "Transfer_sourceLocationId_destinationLocationId_occurredAt_idx" ON "Transfer"("sourceLocationId", "destinationLocationId", "occurredAt");
CREATE INDEX "Transfer_postedById_occurredAt_idx" ON "Transfer"("postedById", "occurredAt");
CREATE UNIQUE INDEX "TransferLine_transferId_stockRequestLineId_key" ON "TransferLine"("transferId", "stockRequestLineId");
CREATE INDEX "TransferLine_stockRequestLineId_idx" ON "TransferLine"("stockRequestLineId");
CREATE INDEX "TransferLine_productId_idx" ON "TransferLine"("productId");

ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockRequestLine" ADD CONSTRAINT "StockRequestLine_stockRequestId_fkey" FOREIGN KEY ("stockRequestId") REFERENCES "StockRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockRequestLine" ADD CONSTRAINT "StockRequestLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_stockRequestId_fkey" FOREIGN KEY ("stockRequestId") REFERENCES "StockRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_stockRequestLineId_fkey" FOREIGN KEY ("stockRequestLineId") REFERENCES "StockRequestLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_transferLineId_fkey" FOREIGN KEY ("transferLineId") REFERENCES "TransferLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
