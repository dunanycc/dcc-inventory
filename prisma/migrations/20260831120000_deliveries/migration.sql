CREATE TABLE "Vendor" (
    "id" UUID NOT NULL, "name" TEXT NOT NULL, "nameNormalized" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true, "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Vendor_nameNormalized_key" ON "Vendor"("nameNormalized");
CREATE INDEX "Vendor_active_name_idx" ON "Vendor"("active", "name");

CREATE TABLE "Delivery" (
    "id" UUID NOT NULL, "vendorId" UUID NOT NULL, "deliveryDate" DATE NOT NULL,
    "notes" TEXT, "recordedById" UUID NOT NULL, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceSystem" TEXT, "sourceId" TEXT, CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Delivery_sourceSystem_sourceId_key" ON "Delivery"("sourceSystem", "sourceId");
CREATE INDEX "Delivery_deliveryDate_id_idx" ON "Delivery"("deliveryDate" DESC, "id");
CREATE INDEX "Delivery_vendorId_deliveryDate_idx" ON "Delivery"("vendorId", "deliveryDate");

CREATE TABLE "DeliveryLine" (
    "id" UUID NOT NULL, "deliveryId" UUID NOT NULL, "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL, "entryQuantity" DECIMAL(18,6) NOT NULL,
    "purchaseUnit" TEXT, "unitsPerPurchaseUnit" DECIMAL(12,3), CONSTRAINT "DeliveryLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeliveryLine_deliveryId_productId_key" ON "DeliveryLine"("deliveryId", "productId");
CREATE INDEX "DeliveryLine_productId_idx" ON "DeliveryLine"("productId");

ALTER TABLE "InventoryMovement" ADD COLUMN "deliveryLineId" UUID;
CREATE UNIQUE INDEX "InventoryMovement_deliveryLineId_key" ON "InventoryMovement"("deliveryLineId");
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_deliveryLineId_fkey" FOREIGN KEY ("deliveryLineId") REFERENCES "DeliveryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_name_not_blank" CHECK (length(btrim("name")) > 0 AND length(btrim("nameNormalized")) > 0);
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_source_pair" CHECK (("sourceSystem" IS NULL) = ("sourceId" IS NULL));
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_positive_quantities" CHECK ("quantity" > 0 AND "entryQuantity" > 0);
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_purchase_pair" CHECK (("purchaseUnit" IS NULL) = ("unitsPerPurchaseUnit" IS NULL));
