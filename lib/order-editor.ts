import { Prisma } from "@/app/generated/prisma/client";
import { orderTransaction, auditOrder } from "./purchase-order-service";
import {
  money,
  orderDate,
  quantity,
  PRIVATE_ORDER_UNITS,
} from "./purchase-order";
import {
  wholeQuantity,
  validateReceivedQuantity,
  inventoryQuantityScale,
} from "./quantity-policy";

export type OrderEditInput = {
  id: string;
  updatedAt: string;
  vendorId: string;
  number: number;
  year: number;
  date: string;
  receivedDate: string;
  notes: string;
  isPrivate: boolean;
  taxIncluded: boolean;
  gst: string;
  pst: string;
  lines: {
    id?: string;
    productId: string | null;
    name: string;
    unit: string;
    factor: string;
    ordered: string;
    received: string | null;
    price: string | null;
  }[];
};

export async function saveOrderEditor(actorId: string, input: OrderEditInput) {
  const date = input.date ? orderDate(input.date) : null;
  const receivedDate = input.receivedDate
    ? orderDate(input.receivedDate)
    : null;
  const year = date?.getUTCFullYear() ?? input.year;
  if (
    !Number.isInteger(input.number) ||
    input.number < 1 ||
    input.number > 1000 ||
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 9999 ||
    input.notes.length > 4000 ||
    !Array.isArray(input.lines) ||
    !input.lines.length ||
    input.lines.length > 200
  )
    throw new Error("Review the order number, dates, notes, and products.");
  const gst = input.taxIncluded ? "0" : input.gst || "0";
  const pst = input.taxIncluded ? "0" : input.pst || "0";
  money(gst);
  money(pst);
  return orderTransaction(actorId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: input.id },
      include: { lines: true },
    });
    if (order.mergedIntoId || !["PENDING", "RECEIVED"].includes(order.status))
      throw new Error("This order cannot be edited.");
    if (order.updatedAt.toISOString() !== input.updatedAt)
      throw new Error("This order changed. Reload it before editing.");
    if (!date && !order.historical) throw new Error("Choose an order date.");
    if (order.status === "RECEIVED" && !receivedDate && !order.historical)
      throw new Error("Choose a received date.");
    const vendor = await tx.vendor.findUniqueOrThrow({
      where: { id: input.vendorId },
    });
    if (!vendor.active && vendor.id !== order.vendorId)
      throw new Error("Choose an active vendor.");
    const ids = input.lines.flatMap((l) => (l.id ? [l.id] : []));
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !order.lines.some((l) => l.id === id))
    )
      throw new Error("The order's product list changed. Reload it.");
    const productIds = [
      ...new Set([
        ...input.lines.flatMap((l) => (l.productId ? [l.productId] : [])),
        ...order.lines.flatMap((l) => (l.productId ? [l.productId] : [])),
      ]),
    ];
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      include: { category: true },
    });
    const pending = order.status === "PENDING";
    const rows = input.lines.map((line) => {
      const old = order.lines.find((l) => l.id === line.id);
      const product = products.find((p) => p.id === line.productId);
      const same = !!old && old.productId === line.productId;
      wholeQuantity(line.ordered);
      if (line.price) money(line.price);
      let name = line.name.trim(),
        unit = line.unit,
        factor = "1",
        category = "Private";
      if (input.isPrivate) {
        if (
          !name ||
          name.length > 160 ||
          (!PRIVATE_ORDER_UNITS.some((u) => u === unit) && unit !== old?.unit)
        )
          throw new Error("Enter a private product name and unit.");
      } else if (product) {
        if (
          (!same || (!order.historical && vendor.id !== order.vendorId)) &&
          (!product.active ||
            !product.category.active ||
            (!order.historical && product.vendorId !== vendor.id))
        )
          throw new Error("Added products must belong to the selected vendor.");
        const catalogUnit =
          product.purchaseUnit || product.stockUnitLabel || product.stockUnit;
        const catalogFactor = product.unitsPerPurchaseUnit?.toString() || "1";
        if (
          same &&
          unit === old!.unit &&
          Number(line.factor) === Number(old!.unitsPerEntry)
        )
          factor = old!.unitsPerEntry.toString();
        else if (
          unit === catalogUnit &&
          Number(line.factor) === Number(catalogFactor)
        )
          factor = catalogFactor;
        else
          throw new Error(
            "A product's purchasing unit changed. Select it again.",
          );
        name =
          same && order.historical ? name || old!.productName : product.name;
        category = same ? old!.categoryName : product.category.name;
      } else if (old && order.historical && !old.productId) {
        if (!name || name.length > 160)
          throw new Error("Enter a product name.");
        unit = old.unit;
        factor = old.unitsPerEntry.toString();
        category = old.categoryName;
      } else
        throw new Error("Select a catalog product or mark the order Private.");
      if (!name || name.length > 160)
        throw new Error("Enter a product name up to 160 characters.");
      const received = pending ? null : line.received;
      if (!pending && received === null)
        throw new Error("Enter each received quantity.");
      if (received !== null)
        validateReceivedQuantity(
          received,
          {
            categoryName: category,
            unitsPerEntry: factor,
            quantityScale: product
              ? inventoryQuantityScale(product)
              : undefined,
          },
          input.isPrivate,
        );
      if (!order.historical && !pending && Number(received) > 0 && !line.price)
        throw new Error("Enter a price for each received product.");
      return {
        ...(old ? { id: old.id } : {}),
        productId: input.isPrivate ? null : (product?.id ?? null),
        productName: name,
        categoryName: category,
        unit,
        unitsPerEntry: factor,
        orderedQuantity: line.ordered,
        receivedQuantity: received,
        unitPrice: line.price || null,
        deliveryLineId:
          same && !input.isPrivate ? (old?.deliveryLineId ?? null) : null,
      };
    });
    if (!rows.some((l) => quantity(l.orderedQuantity) > 0n))
      throw new Error("Keep at least one positive ordered quantity.");
    if (
      !order.historical &&
      !input.isPrivate &&
      new Set(rows.map((l) => l.productId)).size !== rows.length
    )
      throw new Error("Each inventory product can appear only once.");

    // Live received-order corrections change stock only by the net difference.
    // Historical records are snapshots and never repost old receipts.
    const stockChanges: { productId: string; difference: string }[] = [];
    if (!order.historical && !pending) {
      const bar = await tx.location.findUnique({ where: { code: "BAR" } });
      const oldStock = new Map<string, Prisma.Decimal>(),
        newStock = new Map<string, Prisma.Decimal>();
      if (!order.isPrivate)
        for (const l of order.lines)
          if (l.productId)
            oldStock.set(
              l.productId,
              (oldStock.get(l.productId) ?? new Prisma.Decimal(0)).add(
                new Prisma.Decimal(l.receivedQuantity ?? 0).mul(
                  l.unitsPerEntry,
                ),
              ),
            );
      if (!input.isPrivate)
        for (const l of rows)
          if (l.productId)
            newStock.set(
              l.productId,
              new Prisma.Decimal(l.receivedQuantity ?? 0).mul(l.unitsPerEntry),
            );
      const linked = await tx.deliveryLine.findMany({
        where: {
          id: {
            in: order.lines.flatMap((l) =>
              l.deliveryLineId ? [l.deliveryLineId] : [],
            ),
          },
        },
        include: { delivery: true },
      });
      if (linked.some((l) => !l.active || l.delivery.voidedAt))
        throw new Error(
          "A linked delivery was corrected separately. Review it before editing this order.",
        );
      if (
        [...oldStock].some(
          ([id, amount]) =>
            amount.isPositive() &&
            !linked.some(
              (l) => l.productId === id && l.quantity.equals(amount),
            ),
        )
      )
        throw new Error(
          "A linked delivery changed separately. Review the delivery before editing this order.",
        );
      let deliveryId = linked[0]?.deliveryId;
      if (newStock.size && !deliveryId)
        deliveryId = (
          await tx.delivery.create({
            data: {
              vendorId: vendor.id,
              deliveryDate: receivedDate!,
              recordedById: actorId,
              notes: `Order ${vendor.name} ${year} #${input.number}`,
            },
          })
        ).id;
      for (const productId of new Set([
        ...oldStock.keys(),
        ...newStock.keys(),
      ])) {
        const next = newStock.get(productId) ?? new Prisma.Decimal(0),
          previous = oldStock.get(productId) ?? new Prisma.Decimal(0);
        const difference = next.sub(previous),
          oldLine = linked.find((l) => l.productId === productId);
        if (!difference.isZero()) {
          if (!bar?.active) throw new Error("Bar location is unavailable.");
          if (difference.isPositive() && !oldStock.has(productId)) {
            const eligible = await tx.productLocation.findUnique({
              where: {
                productId_locationId: { productId, locationId: bar.id },
              },
            });
            if (!eligible?.active || eligible.reviewRequired)
              throw new Error("The added product is not stocked at the Bar.");
          }
          await tx.inventoryMovement.create({
            data: {
              type: "COUNT_ADJUSTMENT",
              productId,
              quantity: difference.abs(),
              sourceLocationId: difference.isNegative() ? bar.id : null,
              destinationLocationId: difference.isPositive() ? bar.id : null,
              occurredAt: new Date(),
              postedById: actorId,
              notes: `Order ${vendor.name} ${year} #${input.number} edited`,
            },
          });
          stockChanges.push({ productId, difference: difference.toString() });
        }
        const row = rows.find((l) => l.productId === productId);
        if (oldLine && next.isZero())
          await tx.deliveryLine.update({
            where: { id: oldLine.id },
            data: { active: false },
          });
        if (row && next.isPositive()) {
          const data = {
            quantity: next,
            entryQuantity: new Prisma.Decimal(row.receivedQuantity!),
            purchaseUnit: row.unit,
            unitsPerPurchaseUnit: new Prisma.Decimal(row.unitsPerEntry),
            active: true,
          };
          const dl = oldLine
            ? await tx.deliveryLine.update({ where: { id: oldLine.id }, data })
            : await tx.deliveryLine.upsert({
                where: {
                  deliveryId_productId: { deliveryId: deliveryId!, productId },
                },
                create: { ...data, deliveryId: deliveryId!, productId },
                update: data,
              });
          row.deliveryLineId = dl.id;
        } else if (row) row.deliveryLineId = null;
      }
      for (const id of new Set(
        linked.map((l) => l.deliveryId).concat(deliveryId ? [deliveryId] : []),
      ))
        await tx.delivery.update({
          where: { id },
          data: { vendorId: vendor.id, deliveryDate: receivedDate! },
        });
    }
    // Detach receipt references first so replacing a product cannot collide with a removed line.
    await tx.purchaseOrderLine.updateMany({
      where: { orderId: order.id },
      data: { deliveryLineId: null },
    });
    await tx.purchaseOrderLine.deleteMany({
      where: { orderId: order.id, id: { notIn: ids } },
    });
    for (const row of rows) {
      if (row.id)
        await tx.purchaseOrderLine.update({ where: { id: row.id }, data: row });
      else
        await tx.purchaseOrderLine.create({
          data: { ...row, orderId: order.id },
        });
    }
    const updated = await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        vendorId: vendor.id,
        vendorName: vendor.name,
        number: input.number,
        year,
        orderDate: date,
        receivedDate: pending ? null : receivedDate,
        notes: input.notes || null,
        isPrivate: input.isPrivate,
        taxIncluded: input.taxIncluded,
        gst,
        pst,
      },
    });
    await auditOrder(tx, actorId, order.id, "ORDER_EDITED", {
      before: {
        order: JSON.parse(JSON.stringify(order)),
        lines: JSON.parse(JSON.stringify(order.lines)),
      },
      after: { order: JSON.parse(JSON.stringify(updated)), lines: rows },
      stockChanges,
      historical: order.historical,
    });
    return order.id;
  });
}
