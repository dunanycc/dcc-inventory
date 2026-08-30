-- Additive review state for uncertain Product-to-Location assignments.
ALTER TABLE "ProductLocation"
ADD COLUMN "reviewRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ProductLocation_reviewRequired_active_idx"
ON "ProductLocation"("reviewRequired", "active");
