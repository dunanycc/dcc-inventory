ALTER TYPE "StockRequestStatus" ADD VALUE 'CLOSED';

CREATE TABLE "StockRequestNotificationSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "orderNotificationEmail" TEXT,
  "requestorEmail" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockRequestNotificationSettings_pkey" PRIMARY KEY ("id")
);
