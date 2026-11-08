import { caseHistoryCategory } from "./purchase-order-history";
import { inventoryQuantityScale } from "./quantity-policy";
import { prisma } from "./prisma";
export async function orderRows(
  where: { vendorId?: string; year?: number; id?: string } = {},
) {
  const orders = await prisma.purchaseOrder.findMany({
    where: { ...where, ...(where.id ? {} : { mergedIntoId: null }) },
    orderBy: [
      { year: "desc" },
      { vendor: { displayOrder: "asc" } },
      { number: "asc" },
    ],
    include: {
      lines: {
        orderBy: { id: "asc" },
        include: {
          product: {
            select: {
              name: true,
              purchaseUnit: true,
              unitsPerPurchaseUnit: true,
              allowFractionalStock: true,
              quantityScale: true,
              category: { select: { name: true } },
            },
          },
        },
      },
      receipts: { select: { id: true, name: true, mimeType: true } },
    },
  });
  return orders.map((o) => ({
    ...o,
    orderDate: o.orderDate?.toISOString().slice(0, 10) ?? null,
    receivedDate: o.receivedDate?.toISOString().slice(0, 10) ?? null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    finalizedAt: o.finalizedAt?.toISOString() ?? null,
    gst: o.gst.toString(),
    pst: o.pst.toString(),
    legacyData: undefined,
    lines: o.lines.map((l) => ({
      ...l,
      historyName:
        l.product && caseHistoryCategory(l.categoryName)
          ? l.product.name
          : l.productName,
      historyCaseSize:
        l.product &&
        caseHistoryCategory(l.categoryName) &&
        l.product.purchaseUnit?.toLowerCase() === "case"
          ? (l.product.unitsPerPurchaseUnit?.toString() ?? null)
          : null,
      product: undefined,
      quantityScale: l.product ? inventoryQuantityScale(l.product) : 0,
      unitsPerEntry: l.unitsPerEntry.toString(),
      orderedQuantity: l.orderedQuantity.toString(),
      receivedQuantity: l.receivedQuantity?.toString() ?? null,
      unitPrice: l.unitPrice?.toString() ?? null,
    })),
  }));
}
export type OrderRow = Awaited<ReturnType<typeof orderRows>>[number];
