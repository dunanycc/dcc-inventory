import { orderTransaction } from "./purchase-order-service";
export async function deleteOrderReceipt(
  actorId: string,
  orderId: string,
  receiptId: string,
) {
  return orderTransaction(actorId, async (tx) => {
    const receipt = await tx.orderReceipt.findFirst({
      where: { id: receiptId, orderId },
      select: { id: true, name: true, mimeType: true },
    });
    if (!receipt) return false;
    await tx.orderReceipt.delete({ where: { id: receipt.id } });
    await tx.auditEvent.create({
      data: {
        actorId,
        action: "ORDER_RECEIPT_DELETED",
        entityType: "PurchaseOrder",
        entityId: orderId,
        before: {
          receiptId: receipt.id,
          name: receipt.name,
          mimeType: receipt.mimeType,
        },
      },
    });
    return true;
  });
}
