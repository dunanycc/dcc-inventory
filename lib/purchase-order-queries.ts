import { prisma } from "./prisma";
export async function orderRows(
  where: { vendorId?: string; year?: number; id?: string } = {},
) {
  const orders = await prisma.purchaseOrder.findMany({
    where,
    orderBy: [
      { year: "desc" },
      { vendor: { displayOrder: "asc" } },
      { number: "asc" },
    ],
    include: {
      lines: { orderBy: { id: "asc" } },
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
      unitsPerEntry: l.unitsPerEntry.toString(),
      orderedQuantity: l.orderedQuantity.toString(),
      receivedQuantity: l.receivedQuantity?.toString() ?? null,
      unitPrice: l.unitPrice?.toString() ?? null,
    })),
  }));
}
export type OrderRow = Awaited<ReturnType<typeof orderRows>>[number];
