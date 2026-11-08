-- Orders retain their UUID/source identity when distinct purchases share a workbook column.
-- Automatic allocation remains serialized in orderTransaction; manual placement may share a number.
DROP INDEX "PurchaseOrder_vendorId_year_number_key";
CREATE INDEX "PurchaseOrder_vendorId_year_number_idx" ON "PurchaseOrder"("vendorId", "year", "number");
