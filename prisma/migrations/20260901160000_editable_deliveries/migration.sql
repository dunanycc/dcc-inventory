ALTER TABLE "Delivery" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DeliveryLine" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "DeliveryLine_deliveryId_active_idx" ON "DeliveryLine"("deliveryId", "active");
