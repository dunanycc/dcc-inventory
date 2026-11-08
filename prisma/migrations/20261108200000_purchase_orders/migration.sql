CREATE TABLE "PurchaseOrder" (
  "id" UUID NOT NULL PRIMARY KEY,
  "vendorId" UUID NOT NULL REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "vendorName" TEXT NOT NULL,
  "year" INTEGER NOT NULL CHECK ("year" BETWEEN 1900 AND 9999),
  "number" INTEGER NOT NULL CHECK ("number" > 0),
  "orderDate" DATE,
  "receivedDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','RECEIVED','CANCELLED')),
  "notes" TEXT,
  "taxIncluded" BOOLEAN NOT NULL DEFAULT true,
  "gst" DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK ("gst" >= 0),
  "pst" DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK ("pst" >= 0),
  "historical" BOOLEAN NOT NULL DEFAULT false,
  "sourceSystem" TEXT,
  "sourceId" TEXT,
  "legacyData" JSONB,
  "createdById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  CONSTRAINT "PurchaseOrder_source_pair" CHECK (("sourceSystem" IS NULL) = ("sourceId" IS NULL)),
  CONSTRAINT "PurchaseOrder_date_year" CHECK ("orderDate" IS NULL OR EXTRACT(YEAR FROM "orderDate") = "year"),
  CONSTRAINT "PurchaseOrder_tax_included" CHECK (NOT "taxIncluded" OR ("gst" = 0 AND "pst" = 0))
);
CREATE UNIQUE INDEX "PurchaseOrder_vendorId_year_number_key" ON "PurchaseOrder"("vendorId","year","number");
CREATE UNIQUE INDEX "PurchaseOrder_sourceSystem_sourceId_key" ON "PurchaseOrder"("sourceSystem","sourceId");
CREATE INDEX "PurchaseOrder_year_status_idx" ON "PurchaseOrder"("year","status");
CREATE TABLE "PurchaseOrderLine" (
  "id" UUID NOT NULL PRIMARY KEY,
  "orderId" UUID NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "productId" UUID REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "productName" TEXT NOT NULL,
  "categoryName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "unitsPerEntry" DECIMAL(12,3) NOT NULL DEFAULT 1 CHECK ("unitsPerEntry" > 0),
  "orderedQuantity" DECIMAL(18,6) NOT NULL CHECK ("orderedQuantity" >= 0),
  "receivedQuantity" DECIMAL(18,6) CHECK ("receivedQuantity" >= 0),
  "unitPrice" DECIMAL(12,2) CHECK ("unitPrice" >= 0),
  "sourceProductId" TEXT,
  "deliveryLineId" UUID REFERENCES "DeliveryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseOrderLine_deliveryLineId_key" ON "PurchaseOrderLine"("deliveryLineId");
CREATE INDEX "PurchaseOrderLine_orderId_idx" ON "PurchaseOrderLine"("orderId");
CREATE INDEX "PurchaseOrderLine_productId_idx" ON "PurchaseOrderLine"("productId");
CREATE TABLE "OrderReceipt" (
  "id" UUID NOT NULL PRIMARY KEY,
  "orderId" UUID NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL CHECK ("mimeType" IN ('image/jpeg','image/png','image/webp','application/pdf','image/heic','image/heif')),
  "data" BYTEA NOT NULL CHECK (octet_length("data") BETWEEN 1 AND 3145728),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OrderReceipt_orderId_idx" ON "OrderReceipt"("orderId");
