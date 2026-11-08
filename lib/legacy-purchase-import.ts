import { createHash } from "node:crypto";
import XLSX from "xlsx";
import { prisma } from "./prisma";
import { planLegacyOrders } from "./legacy-purchase-orders";
import {
  orderTransaction,
  nextNumber,
  auditOrder,
} from "./purchase-order-service";
export const LEGACY_ORDER_SOURCE = "DCC_LEGACY_PURCHASE_ORDERS";
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export async function legacyPurchasePreview(bytes: Uint8Array) {
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: false,
    sheetRows: 10001,
  });
  if (!workbook.Sheets.Orders || !workbook.Sheets.Products)
    throw new Error("Choose a workbook containing Orders and Products sheets.");
  const plan = planLegacyOrders(
    XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Orders, {
      header: 1,
      defval: "",
    }),
    XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Products, {
      header: 1,
      defval: "",
    }),
  );
  const [vendors, products, existing, deliveries] = await Promise.all([
    prisma.vendor.findMany({
      select: { id: true, name: true, nameNormalized: true },
    }),
    prisma.product.findMany({
      include: { category: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { sourceSystem: LEGACY_ORDER_SOURCE },
      select: { sourceId: true },
    }),
    prisma.delivery.findMany({
      where: { sourceSystem: "legacy-orders" },
      include: { lines: { where: { active: true } } },
    }),
  ]);
  const orders = plan.orders.map((order) => {
    const vendor = vendors.find(
      (v) => v.nameNormalized === norm(order.vendorName),
    );
    const warnings = [...order.warnings];
    if (!vendor)
      plan.errors.push(`Create vendor ${order.vendorName} before importing.`);
    const lines = order.lines.map((line) => {
      let matches = products.filter(
        (p) =>
          p.legacyProductId === line.sourceProductId ||
          p.sourceId === line.sourceProductId,
      );
      if (!matches.length)
        matches = products.filter(
          (p) =>
            norm(p.name) === norm(line.productName) &&
            norm(p.category.name) === norm(line.categoryName),
        );
      const product = matches.length === 1 ? matches[0] : null;
      if (!product)
        warnings.push(
          `${line.productName}: preserved as an archived product label; no unique current Product match.`,
        );
      const delivery = deliveries.find(
        (d) => d.sourceId === order.originalId && !d.voidedAt,
      );
      const possible =
        delivery?.lines.filter(
          (l) =>
            l.productId === product?.id &&
            l.quantity.equals(line.receivedQuantity),
        ) ?? [];
      return {
        ...line,
        productId: product?.id ?? null,
        existingDeliveryLineId: possible.length === 1 ? possible[0].id : null,
      };
    });
    return {
      ...order,
      vendorId: vendor?.id ?? null,
      warnings,
      alreadyImported: existing.some((e) => e.sourceId === order.sourceId),
      lines,
    };
  });
  // Preserve one-to-one receipt links across all vendor splits without choosing
  // an arbitrary winner when multiple source lines map to the same receipt.
  const linkCounts = new Map<string, number>();
  for (const order of orders)
    for (const line of order.lines)
      if (line.existingDeliveryLineId)
        linkCounts.set(
          line.existingDeliveryLineId,
          (linkCounts.get(line.existingDeliveryLineId) ?? 0) + 1,
        );
  for (const order of orders)
    for (const line of order.lines)
      if (
        line.existingDeliveryLineId &&
        (linkCounts.get(line.existingDeliveryLineId) ?? 0) > 1
      )
        line.existingDeliveryLineId = null;
  return {
    fileHash: createHash("sha256").update(bytes).digest("hex"),
    orders,
    errors: plan.errors,
    cancelledOrders: plan.cancelledOrders,
    originalOrders: plan.originalOrders,
  };
}
export async function importLegacyPurchases(
  actorId: string,
  bytes: Uint8Array,
  expectedHash: string,
  privateSourceIds: string[] = [],
) {
  const preview = await legacyPurchasePreview(bytes);
  if (preview.fileHash !== expectedHash || preview.errors.length)
    throw new Error(
      "The preview changed or contains errors. Preview the workbook again.",
    );
  if (
    !Array.isArray(privateSourceIds) ||
    privateSourceIds.some(
      (id) =>
        typeof id !== "string" ||
        !preview.orders.some((order) => order.sourceId === id),
    ) ||
    new Set(privateSourceIds).size !== privateSourceIds.length
  )
    throw new Error("Review the private order selections.");
  const privateIds = new Set(privateSourceIds);
  return orderTransaction(actorId, async (tx) => {
    let created = 0,
      skipped = 0;
    for (const order of preview.orders) {
      if (
        await tx.purchaseOrder.findUnique({
          where: {
            sourceSystem_sourceId: {
              sourceSystem: LEGACY_ORDER_SOURCE,
              sourceId: order.sourceId,
            },
          },
        })
      ) {
        skipped++;
        continue;
      }
      const record = await tx.purchaseOrder.create({
        data: {
          vendorId: order.vendorId!,
          vendorName: order.vendorName,
          year: order.year,
          number: await nextNumber(tx, order.vendorId!, order.year),
          orderDate: order.date ? new Date(`${order.date}T12:00:00Z`) : null,
          status: "RECEIVED",
          historical: true,
          isPrivate: privateIds.has(order.sourceId),
          sourceSystem: LEGACY_ORDER_SOURCE,
          sourceId: order.sourceId,
          createdById: actorId,
          notes: [
            `Legacy order ${order.originalLabel}`,
            order.notes,
            ...order.warnings,
          ]
            .filter(Boolean)
            .join("\n"),
          legacyData: {
            originalId: order.originalId,
            originalLabel: order.originalLabel,
            originalDate: order.originalDate,
            fileHash: preview.fileHash,
          },
          lines: {
            create: await Promise.all(
              order.lines.map(async (line) => {
                const linked = line.existingDeliveryLineId
                  ? await tx.purchaseOrderLine.findUnique({
                      where: { deliveryLineId: line.existingDeliveryLineId },
                    })
                  : null;
                return {
                  productId: privateIds.has(order.sourceId)
                    ? null
                    : line.productId,
                  productName: line.productName,
                  categoryName: line.categoryName,
                  unit: line.unit,
                  unitsPerEntry: "1",
                  orderedQuantity: line.orderedQuantity,
                  receivedQuantity: line.receivedQuantity,
                  unitPrice: null,
                  sourceProductId: line.sourceProductId,
                  deliveryLineId:
                    privateIds.has(order.sourceId) || linked
                      ? null
                      : line.existingDeliveryLineId,
                };
              }),
            ),
          },
        },
      });
      await auditOrder(tx, actorId, record.id, "ORDER_HISTORY_IMPORTED", {
        sourceId: order.sourceId,
        fileHash: preview.fileHash,
        stockPosted: false,
        isPrivate: privateIds.has(order.sourceId),
      });
      created++;
    }
    return { created, skipped };
  });
}
export type LegacyPurchasePreview = Awaited<
  ReturnType<typeof legacyPurchasePreview>
>;
