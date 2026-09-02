-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'ACCEPTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "countDate" DATE NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedById" UUID,
    "acceptedAt" TIMESTAMP(3),
    "sourceSystem" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" UUID NOT NULL,
    "inventoryCountId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "expectedQuantity" DECIMAL(18,6) NOT NULL,
    "countedQuantity" DECIMAL(18,6),
    "difference" DECIMAL(18,6),

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryCount_locationId_countDate_idx" ON "InventoryCount"("locationId", "countDate");

-- CreateIndex
CREATE INDEX "InventoryCount_locationId_status_idx" ON "InventoryCount"("locationId", "status");

-- CreateIndex
CREATE INDEX "InventoryCount_status_countDate_idx" ON "InventoryCount"("status", "countDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_sourceSystem_sourceId_key" ON "InventoryCount"("sourceSystem", "sourceId");

-- CreateIndex
CREATE INDEX "InventoryCountLine_inventoryCountId_idx" ON "InventoryCountLine"("inventoryCountId");

-- CreateIndex
CREATE INDEX "InventoryCountLine_productId_idx" ON "InventoryCountLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLine_inventoryCountId_productId_key" ON "InventoryCountLine"("inventoryCountId", "productId");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_countLineId_fkey" FOREIGN KEY ("countLineId") REFERENCES "InventoryCountLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_inventoryCountId_fkey" FOREIGN KEY ("inventoryCountId") REFERENCES "InventoryCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
