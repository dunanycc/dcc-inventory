ALTER TABLE "StockRequest" ALTER COLUMN "requestedById" DROP NOT NULL;
ALTER TABLE "StockRequest" ADD COLUMN "publicSessionId" UUID;
CREATE INDEX "StockRequest_publicSessionId_requestedAt_idx" ON "StockRequest"("publicSessionId", "requestedAt");
