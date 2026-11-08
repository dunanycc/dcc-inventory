import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import XLSX from "xlsx";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
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
