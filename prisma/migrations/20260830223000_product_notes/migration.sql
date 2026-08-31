CREATE TABLE "ProductNote" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductNote_productId_createdAt_idx" ON "ProductNote"("productId", "createdAt" DESC);
CREATE INDEX "ProductNote_authorId_createdAt_idx" ON "ProductNote"("authorId", "createdAt");

ALTER TABLE "ProductNote" ADD CONSTRAINT "ProductNote_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductNote" ADD CONSTRAINT "ProductNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
