-- Requestor notifications now go to the request's own requestedBy user
-- (see StockRequest.requestedById) instead of a shared Settings address.
ALTER TABLE "StockRequestNotificationSettings" DROP COLUMN "requestorEmail";
