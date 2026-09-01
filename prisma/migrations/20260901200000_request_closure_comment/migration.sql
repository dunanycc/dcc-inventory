ALTER TABLE "StockRequest" ADD COLUMN "closureComment" TEXT;

UPDATE "StockRequest"
SET "closureComment" = 'Closed before comments were required.'
WHERE "status" IN ('CLOSED', 'CANCELLED');

ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_closure_comment_check" CHECK (
  ("status" IN ('CLOSED', 'CANCELLED') AND "closureComment" IS NOT NULL AND btrim("closureComment") <> '') OR
  ("status" NOT IN ('CLOSED', 'CANCELLED') AND "closureComment" IS NULL)
);
