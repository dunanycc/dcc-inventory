ALTER TABLE "StockRequest" DROP CONSTRAINT "StockRequest_completion_shape_check";

ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_completion_shape_check" CHECK (
  ("status" IN ('SUBMITTED', 'PARTIALLY_GIVEN') AND "completedAt" IS NULL) OR
  ("status" IN ('GIVEN', 'CLOSED', 'CANCELLED') AND "completedAt" IS NOT NULL)
);
