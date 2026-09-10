import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new pg.Pool({ connectionString, max: 4 });
const EXECUTE = process.argv.includes("--execute");

const IMPORT_DIR = path.join(process.cwd(), "Import Files");
const ORDERS_CSV = path.join(IMPORT_DIR, "orderhistory.csv");
const PRODUCTS_CSV = path.join(IMPORT_DIR, "products.csv");
const SOURCE_SYSTEM = "legacy-orders";

// Legacy "Bubbly" (Wine, Bottle 750ml) doesn't match any current product by
// name — it was recategorized/renamed to "Sparkling Wine" in the catalog.
// Map its legacy Product GUID straight to the new product id.
const LEGACY_GUID_OVERRIDES: Record<string, string> = {
  "6cbacff2-1fcf-4a1e-aa7f-020590b629c15":
    "0bb22e74-fae0-410b-aac2-1d01aaff2893",
};

// --- CSV parsing --------------------------------------------------------

function parseCsv(filePath: string): string[][] {
  const text = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split(","));
}

function norm(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// --- Date reconstruction -------------------------------------------------
// "Order Date" in the CSV is a data-entry timestamp, not the real order
// date (many unrelated orders share the exact same value). The real date
// comes from the "Orderd" label (Mon-YY early on, yyyy-nn later) plus, for
// yyyy-nn orders, free text in "Column 1" like "Aug 10th order".

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseMonYY(label: string) {
  const match = /^([A-Za-z]{3})-(\d{2})$/.exec(label.trim());
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) return null;
  const year = 2000 + Number(match[2]);
  return { year, date: new Date(Date.UTC(year, month, 1)) };
}

function parseYyyyNn(label: string) {
  const match = /^(\d{4})-(\d+)$/.exec(label.trim());
  if (!match) return null;
  return { year: Number(match[1]) };
}

function parseFreeTextDate(text: string, year: number) {
  if (!text) return null;
  const match = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?/i.exec(text);
  if (!match) return null;
  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const day = Number(match[2]);
  if (day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month, day));
}

// Evenly space dateless orders between May 1 and Sep 30 of their year (the
// club only operates in summer), in the order they appear in the file.
function spacedSummerDates(year: number, count: number) {
  const start = Date.UTC(year, 4, 1);
  const end = Date.UTC(year, 8, 30);
  const totalDays = Math.round((end - start) / 86_400_000);
  if (count === 1)
    return [new Date(start + Math.round(totalDays / 2) * 86_400_000)];
  return Array.from({ length: count }, (_, i) => {
    const offset = Math.round((totalDays * i) / (count - 1));
    return new Date(start + offset * 86_400_000);
  });
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

// --- Order grouping -------------------------------------------------------

type Row = {
  orderd: string;
  guid: string;
  productGuid: string;
  category: string;
  name: string;
  ordered: string;
  received: string;
  status: string;
  col1: string;
};

type Order = {
  guid: string;
  orderd: string;
  rows: Row[];
  date: Date;
  dateEstimated: boolean;
};

function loadOrders(): Order[] {
  const rows = parseCsv(ORDERS_CSV)
    .slice(1)
    .map((r): Row => ({
      orderd: r[0],
      guid: r[1],
      productGuid: r[3],
      category: r[4],
      name: r[5],
      ordered: r[6],
      received: r[7],
      status: r[8],
      col1: r[9] ?? "",
    }));

  const byGuid = new Map<string, Row[]>();
  const orderOfGuid: string[] = [];
  for (const row of rows) {
    if (!byGuid.has(row.guid)) {
      byGuid.set(row.guid, []);
      orderOfGuid.push(row.guid);
    }
    byGuid.get(row.guid)!.push(row);
  }

  const resolved: Order[] = [];
  const datelessByYear = new Map<number, Order[]>();

  for (const guid of orderOfGuid) {
    const orderRows = byGuid.get(guid)!;
    const orderd = orderRows[0].orderd;
    const col1 = orderRows.find((r) => r.col1)?.col1 ?? "";

    const monYY = parseMonYY(orderd);
    if (monYY) {
      resolved.push({
        guid,
        orderd,
        rows: orderRows,
        date: monYY.date,
        dateEstimated: false,
      });
      continue;
    }

    const yyyyNn = parseYyyyNn(orderd);
    if (!yyyyNn)
      throw new Error(`Could not parse order label "${orderd}" for ${guid}`);
    const freeTextDate = parseFreeTextDate(col1, yyyyNn.year);
    const order: Order = {
      guid,
      orderd,
      rows: orderRows,
      date: freeTextDate ?? new Date(0),
      dateEstimated: !freeTextDate,
    };
    if (freeTextDate) {
      resolved.push(order);
    } else {
      if (!datelessByYear.has(yyyyNn.year)) datelessByYear.set(yyyyNn.year, []);
      datelessByYear.get(yyyyNn.year)!.push(order);
    }
  }

  for (const [year, orders] of datelessByYear) {
    const dates = spacedSummerDates(year, orders.length);
    orders.forEach((order, i) => {
      order.date = dates[i];
    });
    resolved.push(...orders);
  }

  return resolved;
}

// --- Main ------------------------------------------------------------------

async function main() {
  const productRows = parseCsv(PRODUCTS_CSV).slice(1);
  const legacyProductByGuid = new Map(
    productRows.map((r) => [r[0], { category: r[1], description: r[2] }]),
  );

  const orders = loadOrders();

  const [
    { rows: dbProducts },
    { rows: existingSourceIds },
    { rows: adminRows },
    { rows: barRows },
  ] = await Promise.all([
    pool.query(
      `SELECT p.id, p.name, c.name AS category, p."purchaseUnit", p."unitsPerPurchaseUnit"
       FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"`,
    ),
    pool.query(`SELECT "sourceId" FROM "Delivery" WHERE "sourceSystem" = $1`, [
      SOURCE_SYSTEM,
    ]),
    pool.query(
      `SELECT id FROM "User" WHERE email = ANY($1) AND status = 'ACTIVE' LIMIT 1`,
      [
        (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean),
      ],
    ),
    pool.query(`SELECT id FROM "Location" WHERE code = 'BAR' AND active`),
  ]);

  const adminId: string | undefined =
    adminRows[0]?.id ??
    (
      await pool.query(
        `SELECT id FROM "User" WHERE role = 'ADMINISTRATOR' AND status = 'ACTIVE' ORDER BY "createdAt" LIMIT 1`,
      )
    ).rows[0]?.id;
  if (!adminId)
    throw new Error(
      "No active administrator found to attribute the import to.",
    );
  const barId: string | undefined = barRows[0]?.id;
  if (!barId) throw new Error("Active BAR location not found.");

  const byId = new Map(dbProducts.map((p) => [p.id, p]));
  const byNameCategory = new Map(
    dbProducts.map((p) => [`${norm(p.category)}|${norm(p.name)}`, p]),
  );
  const byNameOnly = new Map<string, typeof dbProducts>();
  for (const p of dbProducts) {
    const key = norm(p.name);
    if (!byNameOnly.has(key)) byNameOnly.set(key, []);
    byNameOnly.get(key)!.push(p);
  }
  function resolveProduct(productGuid: string) {
    const override = LEGACY_GUID_OVERRIDES[productGuid];
    if (override) return byId.get(override) ?? null;
    const legacy = legacyProductByGuid.get(productGuid);
    if (!legacy) return null;
    const exact = byNameCategory.get(
      `${norm(legacy.category)}|${norm(legacy.description)}`,
    );
    if (exact) return exact;
    const candidates = byNameOnly.get(norm(legacy.description));
    if (candidates?.length === 1) return candidates[0];
    return null;
  }

  const alreadyImported = new Set(existingSourceIds.map((r) => r.sourceId));
  const toImport = orders.filter((o) => !alreadyImported.has(o.guid));

  const unmatchedByProduct = new Map<
    string,
    { legacyCategory: string; description: string; orders: string[] }
  >();
  const fullyCancelledOrders: string[] = [];
  const fullyUnmatchedOrders: string[] = [];
  const plan = toImport
    .map((order) => {
      const receivable = order.rows.filter(
        (r) => r.status !== "Cancelled" && Number(r.received) > 0,
      );
      const lines = receivable
        .map((r) => {
          const product = resolveProduct(r.productGuid);
          if (!product) {
            const legacy = legacyProductByGuid.get(r.productGuid);
            const key = r.productGuid;
            if (!unmatchedByProduct.has(key))
              unmatchedByProduct.set(key, {
                legacyCategory: legacy?.category ?? "?",
                description: legacy?.description ?? r.name,
                orders: [],
              });
            unmatchedByProduct.get(key)!.orders.push(order.orderd);
            return null;
          }
          const quantity = Number(r.received);
          const usesCase = product.purchaseUnit && product.unitsPerPurchaseUnit;
          const entryQuantity = usesCase
            ? quantity / Number(product.unitsPerPurchaseUnit)
            : quantity;
          return {
            productId: product.id,
            productName: product.name,
            quantity,
            entryQuantity,
            purchaseUnit: usesCase ? product.purchaseUnit : null,
            unitsPerPurchaseUnit: usesCase
              ? product.unitsPerPurchaseUnit
              : null,
          };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null);
      if (lines.length === 0) {
        if (receivable.length === 0) fullyCancelledOrders.push(order.orderd);
        else fullyUnmatchedOrders.push(order.orderd);
        return null;
      }
      const notesParts = [`Legacy order ${order.orderd}`];
      const freeText = order.rows.find((r) => r.col1)?.col1;
      if (freeText) notesParts.push(freeText);
      if (order.dateEstimated)
        notesParts.push("Date estimated — please verify");
      return {
        order,
        lines,
        deliveryDate: toDateString(order.date),
        notes: notesParts.join(" — "),
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  console.log(`Orders in file: ${orders.length}`);
  console.log(
    `Already imported (skipping): ${orders.length - toImport.length}`,
  );
  console.log(
    `Skipped orders — nothing received (fully cancelled): ${fullyCancelledOrders.length}${fullyCancelledOrders.length ? ` (${fullyCancelledOrders.join(", ")})` : ""}`,
  );
  console.log(
    `Skipped orders — every line unmatched to a Product: ${fullyUnmatchedOrders.length}${fullyUnmatchedOrders.length ? ` (${fullyUnmatchedOrders.join(", ")})` : ""}`,
  );
  if (unmatchedByProduct.size) {
    console.log("\nProducts that could not be matched (lines were dropped):");
    for (const [, info] of unmatchedByProduct)
      console.log(
        `  "${info.description}" (legacy category: ${info.legacyCategory}) — affects orders: ${info.orders.join(", ")}`,
      );
  }
  console.log(`\nDeliveries to create: ${plan.length}`);
  console.log(
    `Delivery lines to create: ${plan.reduce((sum, o) => sum + o.lines.length, 0)}`,
  );
  const estimated = plan.filter((o) => o.order.dateEstimated);
  console.log(
    `\nDates estimated (no day/month in the source file), spaced evenly between May 1 and Sep 30 of their year — edit these via Edit Delivery once imported:`,
  );
  for (const o of estimated)
    console.log(`  ${o.order.orderd} -> ${o.deliveryDate}`);

  if (!EXECUTE) {
    console.log("\nDry run only — nothing was written.");
    console.log("Re-run with --execute to actually import this data.");
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const { order, lines, deliveryDate, notes } of plan) {
      const deliveryId = randomUUID();
      await client.query(
        `INSERT INTO "Delivery"
           (id, "vendorId", "deliveryDate", notes, "recordedById", "sourceSystem", "sourceId", "updatedAt")
         VALUES ($1, NULL, $2, $3, $4, $5, $6, now())`,
        [deliveryId, deliveryDate, notes, adminId, SOURCE_SYSTEM, order.guid],
      );
      const occurredAt = `${deliveryDate}T12:00:00.000Z`;
      for (const line of lines) {
        const lineId = randomUUID();
        await client.query(
          `INSERT INTO "DeliveryLine"
             (id, "deliveryId", "productId", quantity, "entryQuantity", "purchaseUnit", "unitsPerPurchaseUnit", active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [
            lineId,
            deliveryId,
            line.productId,
            line.quantity,
            line.entryQuantity,
            line.purchaseUnit,
            line.unitsPerPurchaseUnit,
          ],
        );
        await client.query(
          `INSERT INTO "InventoryMovement"
             (id, type, "productId", quantity, "sourceLocationId", "destinationLocationId", "occurredAt", "postedById", notes, "deliveryLineId")
           VALUES ($1, 'RECEIPT', $2, $3, NULL, $4, $5, $6, $7, $8)`,
          [
            randomUUID(),
            line.productId,
            line.quantity,
            barId,
            occurredAt,
            adminId,
            `Legacy import: order ${order.orderd}`,
            lineId,
          ],
        );
      }
    }
    await client.query("COMMIT");
    console.log(`\nDone. Imported ${plan.length} Deliveries.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
