import { prisma } from "./prisma";
import {
  combineAcceptedSnapshots,
  resolveSeasonBoundaries,
} from "./seasonal-consumption";
import { decimalToMicros, microsToDecimal } from "./decimal-quantity";
import { combineMovementSums } from "./inventory-balances";
import type { ExecutiveProduct, ExecutiveStock } from "./executive-report";
import { CATEGORY_ORDER_BY } from "./category-management";
import { PRODUCT_ORDER_BY } from "./product-order";

export async function executiveSources(year: number, currentYear: number) {
  const [categories, counts, incoming, outgoing, openings, receipts] =
    await Promise.all([
      prisma.category.findMany({
        orderBy: CATEGORY_ORDER_BY,
        include: { products: { orderBy: PRODUCT_ORDER_BY } },
      }),
      prisma.inventoryCountLine.findMany({
        where: {
          countedQuantity: { not: null },
          inventoryCount: {
            status: "ACCEPTED",
            countDate: {
              gte: new Date(`${year - 1}-01-01T00:00:00Z`),
              lt: new Date(`${year + 1}-01-01T00:00:00Z`),
            },
          },
        },
        select: {
          productId: true,
          countedQuantity: true,
          inventoryCount: {
            select: { id: true, locationId: true, countDate: true },
          },
        },
      }),
      prisma.inventoryMovement.groupBy({
        by: ["productId"],
        where: {
          destinationLocationId: { not: null },
          occurredAt: { lt: new Date(`${year + 1}-01-01T00:00:00Z`) },
        },
        _sum: { quantity: true },
      }),
      prisma.inventoryMovement.groupBy({
        by: ["productId"],
        where: {
          sourceLocationId: { not: null },
          occurredAt: { lt: new Date(`${year + 1}-01-01T00:00:00Z`) },
        },
        _sum: { quantity: true },
      }),
      prisma.inventoryMovement.groupBy({
        by: ["productId"],
        where: {
          type: "OPENING",
          occurredAt: {
            gte: new Date(`${year}-01-01T00:00:00Z`),
            lt: new Date(`${year + 1}-01-01T00:00:00Z`),
          },
        },
        _sum: { quantity: true },
      }),
      prisma.purchaseOrderLine.findMany({
        where: {
          productId: { not: null },
          receivedQuantity: { not: null },
          order: {
            isPrivate: false,
            mergedIntoId: null,
            status: "RECEIVED",
            OR: [
              {
                receivedDate: {
                  gte: new Date(`${year}-01-01T00:00:00Z`),
                  lt: new Date(`${year + 1}-01-01T00:00:00Z`),
                },
              },
              { receivedDate: null, year },
            ],
          },
        },
        select: {
          productId: true,
          receivedQuantity: true,
          unitsPerEntry: true,
        },
      }),
    ]);
  const receivedByProduct = new Map<string, bigint>();
  for (const receipt of receipts) {
    const id = receipt.productId!;
    receivedByProduct.set(
      id,
      (receivedByProduct.get(id) || 0n) +
        (decimalToMicros(receipt.receivedQuantity!.toString()) *
          decimalToMicros(receipt.unitsPerEntry.toString())) /
          1_000_000n,
    );
  }
  const balances = combineMovementSums(
    incoming.map((r) => ({
      productId: r.productId,
      quantity: r._sum.quantity!.toString(),
    })),
    outgoing.map((r) => ({
      productId: r.productId,
      quantity: r._sum.quantity!.toString(),
    })),
  );
  const fallback = new Map(
    openings.map((r) => [r.productId, r._sum.quantity!.toString()]),
  );
  const products: ExecutiveProduct[] = categories.flatMap((c, rank) =>
    c.products.map((p) => ({
      id: p.id,
      name: p.name,
      vendorId: p.vendorId,
      categoryName: c.name,
      unit: p.stockUnitLabel || p.stockUnit,
      active: p.active,
      historyCategoryOrder: rank,
      historyProductOrder: p.displayOrder,
    })),
  );
  const grouped = new Map<string, typeof counts>();
  for (const line of counts) {
    if (!grouped.has(line.productId)) grouped.set(line.productId, []);
    grouped.get(line.productId)!.push(line);
  }
  const stocks: ExecutiveStock[] = products.map((p) => {
    const buckets = combineAcceptedSnapshots(
      (grouped.get(p.id) || []).map((l) => ({
        countId: l.inventoryCount.id,
        locationId: l.inventoryCount.locationId,
        countDate: l.inventoryCount.countDate,
        countedQuantity: l.countedQuantity!.toString(),
      })),
    );
    const boundary = resolveSeasonBoundaries(buckets, year);
    return {
      productId: p.id,
      receivedForConsumption: microsToDecimal(
        receivedByProduct.get(p.id) || 0n,
      ),
      opening: boundary.starting.quantity ?? fallback.get(p.id) ?? null,
      remaining:
        year === currentYear
          ? (balances.get(p.id) ?? "0")
          : boundary.ending.quantity,
    };
  });
  return { products, stocks };
}
