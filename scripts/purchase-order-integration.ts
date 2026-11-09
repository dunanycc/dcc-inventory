import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import XLSX from "xlsx";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { OrderEditInput } from "../lib/order-editor";
import { receiptTotals } from "../lib/purchase-order";

const testURL = process.env.TEST_DATABASE_URL;
if (
  !testURL ||
  !/(test|ci|disposable|temporary)/i.test(new URL(testURL).pathname) ||
  testURL !== process.env.DATABASE_URL
)
  throw new Error(
    "Use a disposable TEST_DATABASE_URL and set DATABASE_URL to that same test URL for this isolated order harness.",
  );
if (
  process.env.DATABASE_URL_UNPOOLED &&
  process.env.DATABASE_URL_UNPOOLED !== testURL
)
  throw new Error(
    "Refusing a separate application database in this test process.",
  );
const pool = new pg.Pool({ connectionString: testURL });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testURL, max: 4 }),
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
async function main() {
  const {
    createPurchaseOrder,
    finalizePurchaseOrder,
    reorderPurchaseOrders,
    positionPurchaseOrder,
    editPurchaseOrder,
  } = await import("../lib/purchase-order-service");
  const { importLegacyPurchases, legacyPurchasePreview } =
    await import("../lib/legacy-purchase-import");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  for (const name of (await readdir("prisma/migrations"))
    .filter((x) => /^\d/.test(x))
    .sort())
    await pool.query(
      await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
    );
  await pool.end();
  const admin = await prisma.user.create({
    data: {
      email: "orders-test@example.com",
      emailNormalized: "orders-test@example.com",
      role: "ADMINISTRATOR",
      name: "Order Test",
    },
  });
  const disabled = await prisma.user.create({
    data: {
      email: "disabled-orders@example.com",
      emailNormalized: "disabled-orders@example.com",
      role: "ADMINISTRATOR",
      status: "DISABLED",
    },
  });
  const reader = await prisma.user.create({
    data: {
      email: "reader-orders@example.com",
      emailNormalized: "reader-orders@example.com",
      role: "READ_ONLY",
    },
  });
  const bar = await prisma.location.create({
    data: { code: "BAR", name: "Bar" },
  });
  const cat = await prisma.category.create({
    data: { name: "Wine", nameNormalized: "wine" },
  });
  const vendor = await prisma.vendor.findUniqueOrThrow({
    where: { nameNormalized: "saq" },
  });
  const beer = await prisma.vendor.findUniqueOrThrow({
    where: { nameNormalized: "beer" },
  });
  const product = await prisma.product.create({
    data: {
      name: "Test wine",
      categoryId: cat.id,
      vendorId: vendor.id,
      stockUnit: "BOTTLE",
      purchaseUnit: "CASE",
      unitsPerPurchaseUnit: 12,
      sourceSystem: "DCC_PRODUCT_CSV",
      sourceId: "legacy-wine",
      productLocations: {
        create: { locationId: bar.id, reviewRequired: false },
      },
    },
  });
  const newOrder = (
    actor = admin.id,
    vendorId = vendor.id,
    date = "2026-11-08",
  ) =>
    createPurchaseOrder(actor, {
      vendorId,
      date,
      notes: "Test order",
      items: [{ productId: product.id, quantity: "2" }],
    });
  await assert.rejects(newOrder(disabled.id));
  await assert.rejects(newOrder(reader.id));
  await assert.rejects(newOrder(admin.id, beer.id));
  assert.equal(await prisma.purchaseOrder.count(), 0);
  const id = await newOrder();
  const id2 = await newOrder();
  await newOrder(admin.id, vendor.id, "2025-08-01");
  assert.equal(
    (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } })).number,
    1,
  );
  assert.equal(await prisma.inventoryMovement.count(), 0);
  await prisma.product.update({
    where: { id: product.id },
    data: { unitsPerPurchaseUnit: 24 },
  });
  const line = await prisma.purchaseOrderLine.findFirstOrThrow({
    where: { orderId: id },
  });
  const receive = {
    id,
    receivedDate: "2026-11-08",
    taxIncluded: false,
    gst: "1.00",
    pst: "2.00",
    lines: [{ id: line.id, quantity: "1", price: "20.00" }],
  };
  await assert.rejects(
    finalizePurchaseOrder(admin.id, {
      ...receive,
      lines: [{ id: line.id, quantity: "-1", price: "20" }],
    }),
  );
  const simultaneous = await Promise.allSettled([
    finalizePurchaseOrder(admin.id, receive),
    finalizePurchaseOrder(admin.id, receive),
  ]);
  assert.equal(
    simultaneous.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    simultaneous.filter((result) => result.status === "rejected").length,
    1,
  );
  const received = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: { lines: true },
  });
  assert.equal(received.status, "RECEIVED");
  assert.equal(received.lines[0].receivedQuantity?.toString(), "1");
  assert.equal(
    (await prisma.inventoryMovement.findFirstOrThrow()).quantity.toString(),
    "12",
  );
  assert.equal(
    (await prisma.deliveryLine.findFirstOrThrow()).entryQuantity.toString(),
    "1",
  );
  assert.equal(
    receiptTotals(
      [{ quantity: "1", price: "20.00" }],
      received.taxIncluded,
      received.gst.toString(),
      received.pst.toString(),
    ).total,
    "23.00",
  );
  await assert.rejects(finalizePurchaseOrder(admin.id, receive));
  assert.equal(await prisma.inventoryMovement.count(), 1);
  await reorderPurchaseOrders(admin.id, id2, id);
  assert.equal(
    (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: id2 } }))
      .number,
    1,
  );
  assert.equal(
    (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } })).number,
    2,
  );
  const unrelated = await prisma.purchaseOrder.findFirstOrThrow({
    where: { year: 2025 },
  });
  await assert.rejects(reorderPurchaseOrders(admin.id, id, unrelated.id));
  // Every line quantity is validated inside a transaction; failure must roll back.
  const pendingLine = await prisma.purchaseOrderLine.findFirstOrThrow({
    where: { orderId: id2 },
  });
  await assert.rejects(
    finalizePurchaseOrder(admin.id, {
      ...receive,
      id: id2,
      lines: [{ id: pendingLine.id, quantity: "1", price: null }],
    }),
  );
  assert.equal(await prisma.delivery.count(), 1);
  // Synthetic source proves split, cancellation exclusion, and import idempotence.
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      [
        "Orderd",
        "Order GUID",
        "Order Date",
        "Product GUID",
        "Catgegory",
        "Name",
        "Ordered",
        "Recieved",
        "Status",
        "Column 1",
      ],
      [
        "2026-20",
        "legacy-order",
        "2026-07-01",
        "legacy-wine",
        "Wine",
        "Test wine",
        12,
        10,
        "Received",
        "Original note",
      ],
      [
        "2026-20",
        "legacy-order",
        "2026-07-01",
        "retired-mixed",
        "Mixed Drinks",
        "Retired mixed drink",
        24,
        24,
        "Received",
        "Original note",
      ],
      [
        "2026-21",
        "cancelled",
        "2026-07-02",
        "legacy-wine",
        "Wine",
        "Test wine",
        12,
        0,
        "Cancelled",
        "",
      ],
    ]),
    "Orders",
  );
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["ID", "Unit Format"],
      ["legacy-wine", "BOTTLE"],
      ["retired-mixed", "CAN"],
    ]),
    "Products",
  );
  const bytes = new Uint8Array(
    XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
  );
  const preview = await legacyPurchasePreview(bytes);
  assert.equal(preview.orders.length, 2);
  assert.equal(preview.cancelledOrders, 1);
  const imported = await importLegacyPurchases(
    admin.id,
    bytes,
    preview.fileHash,
    [preview.orders.find((o) => o.vendorName === "Beer")!.sourceId],
  );
  assert.equal(imported.created, 2);
  assert.equal(
    (await importLegacyPurchases(admin.id, bytes, preview.fileHash)).skipped,
    2,
  );
  assert.equal(await prisma.inventoryMovement.count(), 1);
  const historical = await prisma.purchaseOrder.findFirstOrThrow({
    where: { historical: true, vendorId: beer.id },
    include: { lines: true },
  });
  assert.equal(historical.number, 1);
  assert.equal(historical.isPrivate, true);
  assert.equal(historical.lines[0].productId, null);
  assert.equal(historical.lines[0].unitPrice, null);
  await editPurchaseOrder(admin.id, {
    id: historical.id,
    vendorId: vendor.id,
    date: "2026-07-04",
    year: 2026,
    notes: "Corrected",
    reason: "Supplier correction",
    lines: historical.lines.map((l) => ({
      id: l.id,
      ordered: l.orderedQuantity.toString(),
      received: "23",
      price: null,
    })),
  });
  assert.equal(await prisma.inventoryMovement.count(), 1);
  assert.equal(
    (
      await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: historical.id },
      })
    ).vendorId,
    vendor.id,
  );
  await assert.rejects(prisma.vendor.delete({ where: { id: vendor.id } }));
  assert.equal(
    (await importLegacyPurchases(admin.id, bytes, preview.fileHash)).skipped,
    2,
  );
  assert.equal(
    (
      await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: historical.id },
      })
    ).vendorId,
    vendor.id,
  );
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () => newOrder()),
  );
  assert.equal(new Set(concurrent).size, 5);
  const numbered = await prisma.purchaseOrder.findMany({
    where: { vendorId: vendor.id, year: 2026 },
    orderBy: { number: "asc" },
  });
  assert.deepEqual(
    numbered.map((order) => order.number),
    numbered.map((_, i) => i + 1),
  );
  const productsBefore = await prisma.product.count();
  const deliveriesBefore = await prisma.delivery.count();
  const movementsBefore = await prisma.inventoryMovement.count();
  const privateId = await createPurchaseOrder(admin.id, {
    vendorId: vendor.id,
    date: "2026-11-08",
    notes: "Private test",
    isPrivate: true,
    items: [],
    manualItems: [
      { name: "Outside-catalog bottle", unit: "BOTTLE", quantity: "2" },
    ],
  });
  const privateOrder = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: privateId },
    include: { lines: true },
  });
  assert.equal(privateOrder.isPrivate, true);
  assert.equal(privateOrder.vendorId, vendor.id);
  assert.equal(privateOrder.lines[0].productId, null);
  await assert.rejects(
    createPurchaseOrder(admin.id, {
      vendorId: vendor.id,
      date: "2026-11-08",
      notes: "",
      isPrivate: true,
      items: [{ productId: product.id, quantity: "1" }],
      manualItems: [{ name: "Manual", unit: "BOTTLE", quantity: "1" }],
    }),
  );
  await prisma.location.update({
    where: { id: bar.id },
    data: { active: false },
  });
  await finalizePurchaseOrder(admin.id, {
    id: privateId,
    receivedDate: "2026-11-08",
    taxIncluded: false,
    gst: "1",
    pst: "2",
    lines: [{ id: privateOrder.lines[0].id, quantity: "3", price: "10" }],
  });
  assert.equal(
    (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: privateId } }))
      .status,
    "RECEIVED",
  );
  assert.equal(await prisma.product.count(), productsBefore);
  assert.equal(await prisma.delivery.count(), deliveriesBefore);
  assert.equal(await prisma.inventoryMovement.count(), movementsBefore);
  await prisma.location.update({
    where: { id: bar.id },
    data: { active: true },
  });
  await prisma.orderReceipt.create({
    data: {
      orderId: id,
      name: "Test.pdf",
      mimeType: "application/pdf",
      data: new TextEncoder().encode("%PDF-1.7"),
    },
  });
  await prisma.verificationToken.create({
    data: {
      identifier: admin.email,
      tokenHash: createHash("sha256")
        .update("local-orders-review-only")
        .digest("hex"),
      expires: new Date(Date.now() + 3600000),
    },
  });
  const liquorCategory = await prisma.category.create({
    data: { name: "Hard Liquor", nameNormalized: "hard liquor" },
  });
  const liquor = await prisma.product.create({
    data: {
      name: "Test liquor",
      categoryId: liquorCategory.id,
      vendorId: vendor.id,
      stockUnit: "BOTTLE",
      allowFractionalStock: true,
      quantityScale: 2,
      productLocations: {
        create: { locationId: bar.id, reviewRequired: false },
      },
    },
  });
  await assert.rejects(
    createPurchaseOrder(admin.id, {
      vendorId: vendor.id,
      date: "2026-11-08",
      notes: "",
      items: [{ productId: liquor.id, quantity: "1.5" }],
    }),
  );
  const liquorOrder = await createPurchaseOrder(admin.id, {
    vendorId: vendor.id,
    date: "2026-11-08",
    notes: "",
    items: [{ productId: liquor.id, quantity: "1" }],
  });
  const liquorLine = await prisma.purchaseOrderLine.findFirstOrThrow({
    where: { orderId: liquorOrder },
  });
  await assert.rejects(
    finalizePurchaseOrder(admin.id, {
      id: liquorOrder,
      receivedDate: "2026-11-08",
      taxIncluded: true,
      gst: "0",
      pst: "0",
      lines: [{ id: liquorLine.id, quantity: "0.251", price: "20" }],
    }),
  );
  await finalizePurchaseOrder(admin.id, {
    id: liquorOrder,
    receivedDate: "2026-11-08",
    taxIncluded: true,
    gst: "0",
    pst: "0",
    lines: [{ id: liquorLine.id, quantity: "0.25", price: "20" }],
  });
  assert.equal(
    (
      await prisma.inventoryMovement.findFirstOrThrow({
        where: { productId: liquor.id },
      })
    ).quantity.toString(),
    "0.25",
  );
  // Explicit columns retain gaps and allow distinct orders to share a column.
  await positionPurchaseOrder(admin.id, liquorOrder, 50);
  assert.equal(
    (
      await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: liquorOrder },
      })
    ).number,
    50,
  );
  const positionedOrder = await createPurchaseOrder(admin.id, {
    vendorId: vendor.id,
    date: "2026-11-08",
    notes: "",
    items: [{ productId: liquor.id, quantity: "1" }],
  });
  await positionPurchaseOrder(admin.id, positionedOrder, 50);
  assert.equal(
    (
      await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: positionedOrder },
      })
    ).number,
    50,
  );
  assert.equal(
    (
      await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: liquorOrder },
      })
    ).number,
    50,
  );
  await positionPurchaseOrder(admin.id, positionedOrder, 60);
  assert.equal(
    await prisma.purchaseOrder.count({
      where: { vendorId: vendor.id, year: 2026, number: 50 },
    }),
    1,
  );
  assert.equal(
    (
      await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: liquorOrder },
      })
    ).number,
    50,
  );
  await assert.rejects(positionPurchaseOrder(admin.id, positionedOrder, 0));
  await assert.rejects(positionPurchaseOrder(admin.id, positionedOrder, 1.5));
  await assert.rejects(
    positionPurchaseOrder("missing-user", positionedOrder, 5),
  );
  await prisma.purchaseOrder.update({
    where: { id: positionedOrder },
    data: { mergedIntoId: liquorOrder },
  });
  const { orderRows } = await import("../lib/purchase-order-queries");
  assert(
    !(await orderRows({ year: 2026 })).some((o) => o.id === positionedOrder),
  );
  assert.equal(
    (await orderRows({ id: positionedOrder }))[0].mergedIntoId,
    liquorOrder,
  );
  await assert.rejects(positionPurchaseOrder(admin.id, positionedOrder, 5));
  await assert.rejects(
    prisma.purchaseOrder.update({
      where: { id: liquorOrder },
      data: { mergedIntoId: liquorOrder },
    }),
  );
  const { saveOrderEditor } = await import("../lib/order-editor");
  async function editorInput(orderId: string): Promise<OrderEditInput> {
    const o = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { lines: true },
    });
    return {
      id: o.id,
      updatedAt: o.updatedAt.toISOString(),
      vendorId: o.vendorId,
      number: o.number,
      year: o.year,
      date: o.orderDate?.toISOString().slice(0, 10) || "",
      receivedDate: o.receivedDate?.toISOString().slice(0, 10) || "",
      notes: o.notes || "",
      isPrivate: o.isPrivate,
      taxIncluded: o.taxIncluded,
      gst: o.gst.toString(),
      pst: o.pst.toString(),
      lines: o.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        name: l.productName,
        unit: l.unit,
        factor: l.unitsPerEntry.toString(),
        ordered: l.orderedQuantity.toString(),
        received: l.receivedQuantity?.toString() ?? null,
        price: l.unitPrice?.toString() ?? null,
      })),
    };
  }
  const editReceived = await editorInput(id);
  editReceived.number = 7;
  editReceived.lines[0].received = "2";
  editReceived.lines.push({
    productId: liquor.id,
    name: liquor.name,
    unit: "BOTTLE",
    factor: "1",
    ordered: "2",
    received: "2",
    price: "10",
  });
  const beforeEditMovements = await prisma.inventoryMovement.count();
  await saveOrderEditor(admin.id, editReceived);
  assert.equal(await prisma.inventoryMovement.count(), beforeEditMovements + 2);
  const edited = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: { lines: true },
  });
  assert.equal(edited.number, 7);
  assert.equal(edited.lines.length, 2);
  assert.equal(
    edited.lines
      .find((l) => l.productId === product.id)!
      .receivedQuantity?.toString(),
    "2",
  );
  assert.equal(
    (
      await prisma.deliveryLine.findUniqueOrThrow({
        where: {
          id: edited.lines.find((l) => l.productId === product.id)!
            .deliveryLineId!,
        },
      })
    ).quantity.toString(),
    "24",
  );
  await assert.rejects(saveOrderEditor(admin.id, editReceived)); // stale replay cannot post stock twice
  assert.equal(await prisma.inventoryMovement.count(), beforeEditMovements + 2);
  const removeReceived = await editorInput(id);
  removeReceived.lines = removeReceived.lines.filter(
    (l) => l.productId === liquor.id,
  );
  await saveOrderEditor(admin.id, removeReceived);
  assert.equal(await prisma.inventoryMovement.count(), beforeEditMovements + 3);
  const quantityCorrection = await prisma.inventoryMovement.findFirstOrThrow({
    where: {
      productId: product.id,
      type: "COUNT_ADJUSTMENT",
      sourceLocationId: bar.id,
    },
  });
  assert.equal(quantityCorrection.quantity.toString(), "24");
  const priceOnly = await editorInput(id);
  priceOnly.lines[0].price = "12.50";
  priceOnly.gst = "1.00";
  priceOnly.pst = "2.00";
  priceOnly.taxIncluded = false;
  await saveOrderEditor(admin.id, priceOnly);
  assert.equal(await prisma.inventoryMovement.count(), beforeEditMovements + 3);
  const historicalEdit = await editorInput(historical.id),
    historicalMovements = await prisma.inventoryMovement.count();
  historicalEdit.number = 8;
  historicalEdit.lines[0].received = "5";
  historicalEdit.lines[0].price = "2";
  await saveOrderEditor(admin.id, historicalEdit);
  assert.equal(await prisma.inventoryMovement.count(), historicalMovements);
  const privateEdit = await editorInput(privateId),
    privateMovements = await prisma.inventoryMovement.count(),
    privateProducts = await prisma.product.count();
  privateEdit.lines[0].received = "3";
  privateEdit.lines[0].price = "4";
  await saveOrderEditor(admin.id, privateEdit);
  assert.equal(await prisma.inventoryMovement.count(), privateMovements);
  assert.equal(await prisma.product.count(), privateProducts);
  const invalidEdit = await editorInput(id);
  invalidEdit.vendorId = beer.id;
  await assert.rejects(saveOrderEditor(admin.id, invalidEdit));
  await assert.rejects(saveOrderEditor(reader.id, await editorInput(id)));
  const fractionalEdit = await editorInput(id);
  fractionalEdit.lines[0].ordered = "1.5";
  await assert.rejects(saveOrderEditor(admin.id, fractionalEdit));
  assert.equal(await prisma.inventoryMovement.count(), privateMovements);
  const pendingEdit = await editorInput(id2);
  pendingEdit.number = 9;
  pendingEdit.lines[0].ordered = "3";
  pendingEdit.lines[0].price = "20";
  await saveOrderEditor(admin.id, pendingEdit);
  assert.equal(await prisma.inventoryMovement.count(), privateMovements);
  assert.equal(
    (
      await prisma.purchaseOrderLine.findFirstOrThrow({
        where: { orderId: id2 },
      })
    ).orderedQuantity.toString(),
    "3",
  );
  const unstocked = await prisma.product.create({
    data: {
      name: "Unstocked edit product",
      categoryId: cat.id,
      vendorId: vendor.id,
      stockUnit: "BOTTLE",
    },
  });
  const lateFailure = await editorInput(id);
  lateFailure.lines[0].received = "3";
  lateFailure.lines.push({
    productId: unstocked.id,
    name: unstocked.name,
    unit: "BOTTLE",
    factor: "1",
    ordered: "1",
    received: "1",
    price: "1",
  });
  const stockBeforeFailure = await prisma.inventoryMovement.count();
  await assert.rejects(saveOrderEditor(admin.id, lateFailure));
  assert.equal(await prisma.inventoryMovement.count(), stockBeforeFailure);
  assert.equal((await editorInput(id)).lines[0].received, "2");
  const makePrivate = await editorInput(id);
  makePrivate.isPrivate = true;
  await saveOrderEditor(admin.id, makePrivate);
  assert.equal(await prisma.inventoryMovement.count(), stockBeforeFailure + 1);
  assert.equal((await editorInput(id)).lines[0].productId, null);
  const restoreInventory = await editorInput(id);
  restoreInventory.isPrivate = false;
  restoreInventory.lines[0].productId = liquor.id;
  await saveOrderEditor(admin.id, restoreInventory);
  assert.equal(await prisma.inventoryMovement.count(), stockBeforeFailure + 2);
  assert.equal((await editorInput(id)).lines[0].productId, liquor.id);
  const historicalVendorEdit = await editorInput(historical.id);
  historicalVendorEdit.vendorId = beer.id;
  historicalVendorEdit.isPrivate = false;
  historicalVendorEdit.lines[0] = {
    ...historicalVendorEdit.lines[0],
    productId: product.id,
    name: product.name,
    unit: "CASE",
    factor: "24",
    ordered: "2",
    received: "1",
    price: "20",
  };
  const historicalStockBefore = await prisma.inventoryMovement.count();
  await saveOrderEditor(admin.id, historicalVendorEdit);
  assert.equal((await editorInput(historical.id)).vendorId, beer.id);
  assert.equal(await prisma.inventoryMovement.count(), historicalStockBefore);
  const { cancelPurchaseOrder } = await import("../lib/order-cancellation");
  const cancelPendingId = await newOrder();
  const pendingVersion = (await editorInput(cancelPendingId)).updatedAt;
  const cancellation = {
    id: cancelPendingId,
    updatedAt: pendingVersion,
    reason: "Duplicate order",
  };
  await assert.rejects(
    cancelPurchaseOrder(admin.id, { ...cancellation, reason: "  " }),
  );
  await assert.rejects(cancelPurchaseOrder(reader.id, cancellation));
  await assert.rejects(
    cancelPurchaseOrder(admin.id, { ...cancellation, updatedAt: "stale" }),
  );
  const beforePendingCancel = await prisma.inventoryMovement.count();
  await cancelPurchaseOrder(admin.id, cancellation);
  assert.equal(await prisma.inventoryMovement.count(), beforePendingCancel);
  assert.equal(
    (
      await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: cancelPendingId },
      })
    ).status,
    "CANCELLED",
  );
  await assert.rejects(cancelPurchaseOrder(admin.id, cancellation));
  const cancelReceivedId = await newOrder();
  const cancelLine = await prisma.purchaseOrderLine.findFirstOrThrow({
    where: { orderId: cancelReceivedId },
  });
  await finalizePurchaseOrder(admin.id, {
    id: cancelReceivedId,
    receivedDate: "2026-11-08",
    taxIncluded: true,
    gst: "0",
    pst: "0",
    lines: [{ id: cancelLine.id, quantity: "1", price: "20" }],
  });
  const receivedVersion = (await editorInput(cancelReceivedId)).updatedAt;
  const receivedDeliveryLine = await prisma.purchaseOrderLine.findUniqueOrThrow(
    { where: { id: cancelLine.id } },
  );
  const beforeReceivedCancel = await prisma.inventoryMovement.count();
  await cancelPurchaseOrder(admin.id, {
    id: cancelReceivedId,
    updatedAt: receivedVersion,
    reason: "Returned entire order",
  });
  assert.equal(
    await prisma.inventoryMovement.count(),
    beforeReceivedCancel + 1,
  );
  const reversedLine = await prisma.deliveryLine.findUniqueOrThrow({
    where: { id: receivedDeliveryLine.deliveryLineId! },
    include: { delivery: true },
  });
  assert.equal(reversedLine.active, false);
  assert.ok(reversedLine.delivery.voidedAt);
  const reversal = await prisma.inventoryMovement.findFirstOrThrow({
    where: { notes: { contains: "Returned entire order" } },
  });
  assert.equal(
    reversal.quantity.toString(),
    cancelLine.unitsPerEntry.toString(),
  );
  assert.equal(reversal.sourceLocationId, bar.id);
  assert.equal(reversal.destinationLocationId, null);
  const beforeArchiveCancel = await prisma.inventoryMovement.count();
  for (const cancelId of [historical.id, privateId]) {
    await cancelPurchaseOrder(admin.id, {
      id: cancelId,
      updatedAt: (await editorInput(cancelId)).updatedAt,
      reason: "Archive correction",
    });
  }
  assert.equal(await prisma.inventoryMovement.count(), beforeArchiveCancel);
  assert.equal(
    await prisma.auditEvent.count({ where: { action: "ORDER_CANCELLED" } }),
    4,
  );
  const { setInventory } = await import("../lib/set-inventory");
  const setInput = {
    locationId: bar.id,
    entries: [{ productId: product.id, quantity: "0" }],
    notes: "Zero stock test",
  };
  await assert.rejects(setInventory(reader.id, setInput));
  await assert.rejects(
    setInventory(admin.id, {
      ...setInput,
      entries: [{ productId: product.id, quantity: "-1" }],
    }),
  );
  await setInventory(admin.id, {
    ...setInput,
    entries: [{ productId: product.id, quantity: "7" }],
  });
  await setInventory(admin.id, setInput);
  const { inventoryBalancesForLocation } =
    await import("../lib/inventory-balances");
  assert.equal(
    (await inventoryBalancesForLocation(bar.id)).get(product.id),
    "0",
  );
  const zeroMovements = await prisma.inventoryMovement.count();
  await setInventory(admin.id, setInput);
  assert.equal(await prisma.inventoryMovement.count(), zeroMovements);
  const { executiveSources } = await import("../lib/executive-report-query");
  for (const [date, quantity] of [
    ["2025-05-01", "9"],
    ["2025-10-01", "7"],
    ["2026-05-01", "5"],
    ["2026-10-01", "4"],
  ]) {
    await prisma.inventoryCount.create({
      data: {
        locationId: bar.id,
        countDate: new Date(`${date}T00:00:00Z`),
        status: "ACCEPTED",
        createdById: admin.id,
        acceptedById: admin.id,
        acceptedAt: new Date(),
        lines: {
          create: {
            productId: product.id,
            expectedQuantity: quantity,
            countedQuantity: quantity,
          },
        },
      },
    });
  }
  const priorExecutive = await executiveSources(2025, 2026);
  assert.deepEqual(
    (({ productId, opening, remaining }) => ({
      productId,
      opening,
      remaining,
    }))(priorExecutive.stocks.find((row) => row.productId === product.id)!),
    { productId: product.id, opening: "9", remaining: "7" },
  );
  const currentExecutive = await executiveSources(2026, 2026);
  assert.deepEqual(
    (({ productId, opening, remaining }) => ({
      productId,
      opening,
      remaining,
    }))(currentExecutive.stocks.find((row) => row.productId === product.id)!),
    { productId: product.id, opening: "5", remaining: "0" },
  );
  const crossYearOrder = await newOrder(admin.id, vendor.id, "2025-12-20");
  const crossYearLine = await prisma.purchaseOrderLine.findFirstOrThrow({
    where: { orderId: crossYearOrder },
  });
  await finalizePurchaseOrder(admin.id, {
    id: crossYearOrder,
    receivedDate: "2026-01-05",
    taxIncluded: true,
    gst: "0",
    pst: "0",
    lines: [{ id: crossYearLine.id, quantity: "1", price: "24" }],
  });
  const crossYearSources = await executiveSources(2026, 2026);
  assert.equal(
    Number(
      crossYearSources.stocks.find((row) => row.productId === product.id)!
        .receivedForConsumption,
    ) -
      Number(
        currentExecutive.stocks.find((row) => row.productId === product.id)!
          .receivedForConsumption,
      ),
    Number(crossYearLine.unitsPerEntry),
  );
  const { correctCountHistory, countHistoryRevision } =
    await import("../lib/count-history-correction");
  const historicalCount = await prisma.inventoryCount.findFirstOrThrow({
    where: { locationId: bar.id, countDate: new Date("2025-10-01T00:00:00Z") },
    include: { lines: true },
  });
  const historicalCorrection = {
    countId: historicalCount.id,
    revision: countHistoryRevision(historicalCount.lines),
    reason: "Historical count correction test",
    entries: [{ productId: product.id, quantity: "0" }],
  };
  const correctionsStockBefore = JSON.stringify(
    await prisma.inventoryMovement.findMany({ orderBy: { id: "asc" } }),
  );
  await assert.rejects(correctCountHistory(reader.id, historicalCorrection));
  await assert.rejects(
    correctCountHistory(admin.id, { ...historicalCorrection, reason: " " }),
  );
  await assert.rejects(
    correctCountHistory(admin.id, {
      ...historicalCorrection,
      entries: [{ productId: product.id, quantity: "0.25" }],
    }),
  );
  await correctCountHistory(admin.id, historicalCorrection);
  await assert.rejects(correctCountHistory(admin.id, historicalCorrection));
  const correctedCount = await prisma.inventoryCount.findUniqueOrThrow({
    where: { id: historicalCount.id },
    include: { lines: true },
  });
  assert.equal(correctedCount.lines[0].countedQuantity!.toString(), "0");
  await correctCountHistory(admin.id, {
    ...historicalCorrection,
    revision: countHistoryRevision(correctedCount.lines),
    entries: [{ productId: liquor.id, quantity: "1.25" }],
  });
  const missingAdded = await prisma.inventoryCountLine.findUniqueOrThrow({
    where: {
      inventoryCountId_productId: {
        inventoryCountId: historicalCount.id,
        productId: liquor.id,
      },
    },
  });
  assert.equal(missingAdded.countedQuantity!.toString(), "1.25");
  assert.equal(
    JSON.stringify(
      await prisma.inventoryMovement.findMany({ orderBy: { id: "asc" } }),
    ),
    correctionsStockBefore,
  );
  assert.equal(
    await prisma.auditEvent.count({
      where: { action: "COUNT_HISTORY_CORRECTED" },
    }),
    2,
  );
  const correctedSources = await executiveSources(2025, 2026);
  assert.equal(
    correctedSources.stocks.find((row) => row.productId === product.id)!
      .remaining,
    "0",
  );
  const { deleteOrderReceipt } = await import("../lib/delete-order-receipt");
  const receiptToDelete = await prisma.orderReceipt.create({
    data: {
      orderId: id2,
      name: "Incorrect receipt.pdf",
      mimeType: "application/pdf",
      data: new TextEncoder().encode("%PDF-1.7"),
    },
  });
  await assert.rejects(deleteOrderReceipt(reader.id, id2, receiptToDelete.id));
  assert.equal(
    await deleteOrderReceipt(admin.id, id, receiptToDelete.id),
    false,
  );
  assert.equal(
    await prisma.orderReceipt.count({ where: { id: receiptToDelete.id } }),
    1,
  );
  assert.equal(
    await deleteOrderReceipt(admin.id, id2, receiptToDelete.id),
    true,
  );
  assert.equal(
    await deleteOrderReceipt(admin.id, id2, receiptToDelete.id),
    false,
  );
  assert.equal(
    await prisma.auditEvent.count({
      where: { action: "ORDER_RECEIPT_DELETED", entityId: id2 },
    }),
    1,
  );
  console.log(
    "Order integration passed: all migrations, authorization, vendor restriction, numbering, unit snapshots, partial receipt, exact totals, duplicate finalization, whole-order moves, rollback, split/import idempotence, historical correction, private receipt storage.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
