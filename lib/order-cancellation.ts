import { orderTransaction } from "./purchase-order-service";

export async function cancelPurchaseOrder(
  actorId: string,
  input: {
    id: string;
    updatedAt: string;
    reason: string;
  },
) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000)
    throw new Error(
      "Enter a reason for cancelling this order (up to 1,000 characters).",
    );
  return orderTransaction(actorId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: input.id },
      include: { lines: true },
    });
    if (order.mergedIntoId || !["PENDING", "RECEIVED"].includes(order.status))
      throw new Error("This order is already cancelled or merged.");
    if (order.updatedAt.toISOString() !== input.updatedAt)
      throw new Error("This order changed. Reload it before cancelling.");
    const now = new Date(),
      reversals: { productId: string; quantity: string }[] = [];
    if (order.status === "RECEIVED" && !order.historical && !order.isPrivate) {
      const links = await tx.deliveryLine.findMany({
        where: {
          id: {
            in: order.lines.flatMap((l) =>
              l.deliveryLineId ? [l.deliveryLineId] : [],
            ),
          },
        },
        include: { delivery: true },
      });
      const active = links.filter((l) => l.active && !l.delivery.voidedAt);
      const bar = active.length
        ? await tx.location.findUnique({ where: { code: "BAR" } })
        : null;
      if (active.length && !bar?.active)
        throw new Error("Bar location is unavailable.");
      for (const line of active) {
        if (line.quantity.isPositive()) {
          await tx.inventoryMovement.create({
            data: {
              type: "COUNT_ADJUSTMENT",
              productId: line.productId,
              quantity: line.quantity,
              sourceLocationId: bar!.id,
              destinationLocationId: null,
              occurredAt: now,
              postedById: actorId,
              notes: `Cancelled ${order.vendorName} ${order.year}-${order.number}: ${reason}`,
            },
          });
          reversals.push({
            productId: line.productId,
            quantity: line.quantity.toString(),
          });
        }
        await tx.deliveryLine.update({
          where: { id: line.id },
          data: { active: false },
        });
      }
      for (const id of new Set(active.map((l) => l.deliveryId))) {
        if (
          !(await tx.deliveryLine.count({
            where: { deliveryId: id, active: true },
          }))
        )
          await tx.delivery.update({
            where: { id },
            data: { voidedAt: now, voidedById: actorId, voidComment: reason },
          });
      }
    }
    const previous =
      order.legacyData &&
      typeof order.legacyData === "object" &&
      !Array.isArray(order.legacyData)
        ? order.legacyData
        : {};
    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        legacyData: {
          ...previous,
          cancellation: {
            reason,
            at: now.toISOString(),
            actorId,
            previousStatus: order.status,
          },
        },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId,
        action: "ORDER_CANCELLED",
        entityType: "PurchaseOrder",
        entityId: order.id,
        reason,
        before: { status: order.status },
        after: {
          status: "CANCELLED",
          reason,
          reversals,
          historical: order.historical,
          isPrivate: order.isPrivate,
        },
      },
    });
    return order.id;
  });
}

export function cancellationReason(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("cancellation" in data))
    return null;
  const cancellation = data.cancellation;
  return cancellation &&
    typeof cancellation === "object" &&
    "reason" in cancellation &&
    typeof cancellation.reason === "string"
    ? cancellation.reason
    : null;
}
