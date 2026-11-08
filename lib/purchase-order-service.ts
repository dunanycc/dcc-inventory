import { wholeQuantity, validateReceivedQuantity } from "./quantity-policy";
import { Prisma } from "@/app/generated/prisma/client";
import { hasPermission } from "./authorization";
import { prisma } from "./prisma";
import {
  money,
  privateOrderLines,
  type ManualOrderLine,
  orderDate,
  quantity,
  receiptTotals,
  reordered,
} from "./purchase-order";
import { normalizeStockQuantity } from "./inventory-movement";
import { createMovementTransaction } from "./prisma-movement-repository";
import { createValidatedMovement } from "./inventory-movement";

type Tx = Prisma.TransactionClient;
export async function orderTransaction<T>(
  actorId: string,
  work: (tx: Tx) => Promise<T>,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const actor = await tx.user.findUnique({ where: { id: actorId } });
          if (
            !actor ||
            actor.status !== "ACTIVE" ||
            !hasPermission(actor.role, "operations:post")
          )
            throw new Error("You do not have permission to manage orders.");
          return work(tx);
        },
        { isolationLevel: "Serializable", timeout: 30000 },
      );
    } catch (error) {
      if (
        attempt < 4 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code)
      )
        continue;
      throw error;
    }
  }
}
export async function nextNumber(tx: Tx, vendorId: string, year: number) {
  const last = await tx.purchaseOrder.aggregate({
    where: { vendorId, year },
    _max: { number: true },
  });
  return (last._max.number ?? 0) + 1;
}
export async function auditOrder(
  tx: Tx,
  actorId: string,
  id: string,
  action: string,
  details: Prisma.InputJsonValue,
) {
  await tx.auditEvent.create({
    data: {
      actorId,
      entityType: "PurchaseOrder",
      entityId: id,
      action,
      after: details,
    },
  });
}
export async function createPurchaseOrder(
  actorId: string,
  input: {
    vendorId: string;
    date: string;
    notes: string;
    items: { productId: string; quantity: string }[];
    isPrivate?: boolean;
    manualItems?: ManualOrderLine[];
  },
) {
  const date = orderDate(input.date);
  const isPrivate = input.isPrivate === true;
  if (input.notes.length > 1000 || !Array.isArray(input.items))
    throw new Error("Review the order items and notes.");
  const manualLines = isPrivate
    ? privateOrderLines(input.manualItems ?? [], true)
    : [];
  if (
    isPrivate
      ? input.items.length > 0
      : !input.items.length ||
        input.items.length > 200 ||
        new Set(input.items.map((x) => x.productId)).size !==
          input.items.length ||
        (input.manualItems?.length ?? 0) > 0
  )
    throw new Error(
      "Private orders use manual products; inventory orders use catalog products.",
    );
  return orderTransaction(actorId, async (tx) => {
    const vendor = await tx.vendor.findUnique({
      where: { id: input.vendorId },
    });
    if (!vendor?.active) throw new Error("Choose an active vendor.");
    const products = await tx.product.findMany({
      where: {
        id: { in: input.items.map((x) => x.productId) },
        vendorId: vendor.id,
        active: true,
        category: { active: true },
      },
    });
    if (products.length !== input.items.length)
      throw new Error("Every product must belong to the selected vendor.");
    const categories = await tx.category.findMany({
      where: { id: { in: products.map((p) => p.categoryId) } },
    });
    const lines = isPrivate
      ? manualLines
      : input.items.map((item) => {
          const product = products.find((p) => p.id === item.productId)!;
          wholeQuantity(item.quantity);
          if (quantity(item.quantity) <= 0n)
            throw new Error("Order quantities must be greater than zero.");
          const factor =
            product.purchaseUnit && product.unitsPerPurchaseUnit
              ? product.unitsPerPurchaseUnit.toString()
              : "1";
          normalizeStockQuantity(
            new Prisma.Decimal(item.quantity).mul(factor).toString(),
            product,
          );
          return {
            productId: product.id,
            productName: product.name,
            categoryName: categories.find((c) => c.id === product.categoryId)!
              .name,
            unit:
              product.purchaseUnit && product.unitsPerPurchaseUnit
                ? product.purchaseUnit
                : product.stockUnitLabel || product.stockUnit,
            unitsPerEntry: factor,
            orderedQuantity: item.quantity,
          };
        });
    const order = await tx.purchaseOrder.create({
      data: {
        vendorId: vendor.id,
        vendorName: vendor.name,
        isPrivate,
        year: date.getUTCFullYear(),
        number: await nextNumber(tx, vendor.id, date.getUTCFullYear()),
        orderDate: date,
        notes: input.notes || null,
        createdById: actorId,
        lines: { create: lines },
      },
    });
    await auditOrder(tx, actorId, order.id, "ORDER_CREATED", {
      vendorId: vendor.id,
      number: order.number,
      year: order.year,
      isPrivate,
    });
    return order.id;
  });
}
export async function finalizePurchaseOrder(
  actorId: string,
  input: {
    id: string;
    receivedDate: string;
    taxIncluded: boolean;
    gst: string;
    pst: string;
    lines: { id: string; quantity: string; price: string | null }[];
  },
) {
  const date = orderDate(input.receivedDate);
  const totals = receiptTotals(
    input.lines,
    input.taxIncluded,
    input.gst,
    input.pst,
  );
  if (totals.total === null)
    throw new Error("Enter a price for each received product.");
  return orderTransaction(actorId, async (tx) => {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: input.id },
      include: { lines: true },
    });
    if (!order || order.status !== "PENDING" || order.historical)
      throw new Error("Only pending orders can be finalized, once.");
    if (
      input.lines.length !== order.lines.length ||
      new Set(input.lines.map((l) => l.id)).size !== input.lines.length ||
      order.lines.some((l) => !input.lines.some((x) => x.id === l.id))
    )
      throw new Error("The order changed. Reload before receiving it.");
    for (const received of input.lines)
      validateReceivedQuantity(
        received.quantity,
        order.lines.find((line) => line.id === received.id)!,
        order.isPrivate,
      );
    const bar = order.isPrivate
      ? null
      : await tx.location.findUnique({ where: { code: "BAR" } });
    if (!order.isPrivate && !bar?.active)
      throw new Error("Bar location is unavailable.");
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    const positive = input.lines.filter((l) => quantity(l.quantity) > 0n);
    const delivery =
      !order.isPrivate && positive.length
        ? await tx.delivery.create({
            data: {
              vendorId: order.vendorId,
              deliveryDate: date,
              recordedById: actorId,
              notes: `Order ${order.vendorName} ${order.year} #${order.number}`,
            },
          })
        : null;
    for (const received of input.lines) {
      const line = order.lines.find((l) => l.id === received.id)!;
      let deliveryLineId: string | null = null;
      if (!order.isPrivate && quantity(received.quantity) > 0n) {
        if (!line.productId) throw new Error("A received product is missing.");
        const stockQuantity = new Prisma.Decimal(received.quantity)
          .mul(line.unitsPerEntry)
          .toString();
        const dl = await tx.deliveryLine.create({
          data: {
            deliveryId: delivery!.id,
            productId: line.productId,
            entryQuantity: received.quantity,
            quantity: stockQuantity,
            purchaseUnit: line.unit,
            unitsPerPurchaseUnit: line.unitsPerEntry,
          },
        });
        deliveryLineId = dl.id;
        const movement = await createValidatedMovement(
          createMovementTransaction(tx),
          actor,
          {
            type: "RECEIPT",
            productId: line.productId,
            quantity: stockQuantity,
            destinationLocationId: bar!.id,
            occurredAt: date,
            notes: `Order ${order.vendorName} ${order.year} #${order.number}`,
          },
        );
        await tx.inventoryMovement.update({
          where: { id: movement.id },
          data: { deliveryLineId: dl.id },
        });
      }
      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: {
          receivedQuantity: received.quantity,
          unitPrice: received.price || null,
          deliveryLineId,
        },
      });
    }
    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: "RECEIVED",
        receivedDate: date,
        finalizedAt: new Date(),
        taxIncluded: input.taxIncluded,
        gst: totals.gst,
        pst: totals.pst,
      },
    });
    await auditOrder(tx, actorId, order.id, "ORDER_FINALIZED", {
      receivedDate: input.receivedDate,
      isPrivate: order.isPrivate,
      stockPosted: !order.isPrivate && positive.length > 0,
      total: totals.total,
      lines: input.lines,
      taxIncluded: input.taxIncluded,
      gst: totals.gst,
      pst: totals.pst,
    });
  });
}
export async function reorderPurchaseOrders(
  actorId: string,
  id: string,
  targetId: string,
) {
  return orderTransaction(actorId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    const group = await tx.purchaseOrder.findMany({
      where: { vendorId: order.vendorId, year: order.year },
      orderBy: { number: "asc" },
    });
    const ids = reordered(
      group.map((o) => o.id),
      id,
      targetId,
    );
    // Vacate all occupied numbers before assigning the contiguous sequence.
    const offset = Math.max(...group.map((o) => o.number)) + group.length + 1;
    for (let i = 0; i < ids.length; i++)
      await tx.purchaseOrder.update({
        where: { id: ids[i] },
        data: { number: offset + i },
      });
    for (let i = 0; i < ids.length; i++)
      await tx.purchaseOrder.update({
        where: { id: ids[i] },
        data: { number: i + 1 },
      });
    await auditOrder(tx, actorId, id, "ORDER_REORDERED", {
      before: group.map((o) => ({ id: o.id, number: o.number })),
      after: ids,
      targetId,
    });
  });
}
/** Move to an explicit column, retaining gaps and shifting occupied slots right. */
export async function positionPurchaseOrder(
  actorId: string,
  id: string,
  position: number,
) {
  if (!Number.isSafeInteger(position) || position < 1 || position > 1000)
    throw new Error("Choose an order column from 1 to 1000.");
  return orderTransaction(actorId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (order.number === position) return;
    const group = await tx.purchaseOrder.findMany({
      where: { vendorId: order.vendorId, year: order.year, id: { not: id } },
      orderBy: { number: "asc" },
    });
    const occupied = new Map(group.map((o) => [o.number, o]));
    let free = position;
    while (occupied.has(free)) free++;
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        number: Math.max(free, order.number, ...group.map((o) => o.number)) + 1,
      },
    });
    for (let n = free - 1; n >= position; n--)
      await tx.purchaseOrder.update({
        where: { id: occupied.get(n)!.id },
        data: { number: n + 1 },
      });
    await tx.purchaseOrder.update({
      where: { id },
      data: { number: position },
    });
    await auditOrder(tx, actorId, id, "ORDER_REORDERED", {
      before: order.number,
      after: position,
      shifted: group
        .filter((o) => o.number >= position && o.number < free)
        .map((o) => ({ id: o.id, before: o.number, after: o.number + 1 })),
    });
  });
}
export async function editPurchaseOrder(
  actorId: string,
  input: {
    id: string;
    vendorId: string;
    date: string;
    year: number;
    notes: string;
    reason: string;
    isPrivate?: boolean;
    lines: {
      id: string;
      ordered: string;
      received: string | null;
      price: string | null;
      name?: string;
      unit?: string;
    }[];
  },
) {
  const date = input.date ? orderDate(input.date) : null;
  const year = date?.getUTCFullYear() ?? input.year;
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 9999 ||
    input.notes.length > 1000 ||
    !input.reason.trim() ||
    input.reason.length > 500
  )
    throw new Error("Review the date, notes, and correction reason.");
  return orderTransaction(actorId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: input.id },
      include: { lines: true },
    });
    const isPrivate = order.historical
      ? (input.isPrivate ?? order.isPrivate)
      : order.isPrivate;
    const vendor = await tx.vendor.findUniqueOrThrow({
      where: { id: input.vendorId },
    });
    if (!order.historical && order.status !== "PENDING")
      throw new Error(
        "Received order details are locked. Use the delivery correction workflow for stock corrections.",
      );
    if (!order.historical && vendor.id !== order.vendorId)
      throw new Error(
        "A pending order's vendor cannot change; create a new order for that vendor.",
      );
    if (
      input.lines.length !== order.lines.length ||
      new Set(input.lines.map((l) => l.id)).size !== input.lines.length ||
      order.lines.some((l) => !input.lines.some((x) => x.id === l.id))
    )
      throw new Error("Order lines changed. Reload and try again.");
    if (!order.historical && !date) throw new Error("Choose an order date.");
    for (const line of input.lines) {
      if (!order.historical) wholeQuantity(line.ordered);
      quantity(line.ordered);
      if (order.historical && line.received !== null) quantity(line.received);
      if (line.price) money(line.price);
      const original = order.lines.find((l) => l.id === line.id)!;
      if (
        order.historical &&
        line.ordered !== original.orderedQuantity.toString()
      )
        wholeQuantity(line.ordered);
      if (
        order.historical &&
        line.received !== null &&
        line.received !== original.receivedQuantity?.toString()
      )
        validateReceivedQuantity(line.received, original, isPrivate);
      if (!order.historical && !isPrivate && original.productId) {
        const product = await tx.product.findUniqueOrThrow({
          where: { id: original.productId },
        });
        normalizeStockQuantity(
          new Prisma.Decimal(line.ordered)
            .mul(original.unitsPerEntry)
            .toString(),
          product,
        );
      }
      const manual = isPrivate
        ? privateOrderLines([
            {
              name: line.name ?? original.productName,
              unit: line.unit ?? original.unit,
              quantity: line.ordered,
            },
          ])[0]
        : null;
      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: {
          ...(manual
            ? {
                productId: null,
                productName: manual.productName,
                unit: manual.unit,
                unitsPerEntry: "1",
                deliveryLineId: null,
              }
            : {}),
          orderedQuantity: line.ordered,
          ...(order.historical
            ? {
                receivedQuantity: line.received,
                unitPrice: line.price || null,
                deliveryLineId:
                  isPrivate ||
                  line.received !== original.receivedQuantity?.toString()
                    ? null
                    : original.deliveryLineId,
              }
            : {}),
        },
      });
    }
    if (
      !order.historical &&
      !input.lines.some((l) => quantity(l.ordered) > BigInt(0))
    )
      throw new Error("Keep at least one positive order quantity.");
    const moved = vendor.id !== order.vendorId || year !== order.year;
    const updated = await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        vendorId: vendor.id,
        vendorName: vendor.name,
        isPrivate,
        orderDate: date,
        year,
        notes: input.notes || null,
        number: moved ? await nextNumber(tx, vendor.id, year) : order.number,
      },
    });
    await auditOrder(tx, actorId, order.id, "ORDER_CORRECTED", {
      before: {
        isPrivate: order.isPrivate,
        vendorId: order.vendorId,
        date: order.orderDate?.toISOString() ?? null,
        year: order.year,
        number: order.number,
      },
      after: {
        isPrivate: updated.isPrivate,
        vendorId: updated.vendorId,
        date: updated.orderDate?.toISOString() ?? null,
        year: updated.year,
        number: updated.number,
      },
      reason: input.reason,
      beforeLines: order.lines.map((l) => ({
        id: l.id,
        ordered: l.orderedQuantity.toString(),
        received: l.receivedQuantity?.toString() ?? null,
        price: l.unitPrice?.toString() ?? null,
      })),
      afterLines: input.lines,
      stockPosted: false,
    });
  });
}
