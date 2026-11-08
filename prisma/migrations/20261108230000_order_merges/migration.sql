-- Preserve source records and IDs while a combined order is shown in active history.
ALTER TABLE "PurchaseOrder" ADD COLUMN "mergedIntoId" UUID;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_merge_not_self" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> id);
CREATE INDEX "PurchaseOrder_mergedIntoId_idx" ON "PurchaseOrder"("mergedIntoId");
