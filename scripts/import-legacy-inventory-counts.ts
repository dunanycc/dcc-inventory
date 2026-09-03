import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import path from "node:path";
import XLSX from "xlsx";
import pg from "pg";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new pg.Pool({ connectionString, max: 4 });
const EXECUTE = process.argv.includes("--execute");
const SOURCE_SYSTEM = "legacy-2025-workbook";
const WORKBOOK = path.join(
  process.cwd(),
  "Import Files",
  "2025 Orders and Consumptions.xlsx",
);

// The workbook uses a handful of verbose/legacy product descriptions that
// don't match the catalog's current short names. Reviewed by hand against
// the Beer / Beer Kegs / Non-alcohol Beer / Mixed Drinks product lists —
// each is an unambiguous same-brand, same-package rename.
const NAME_ALIASES: Record<string, string> = {
  "sapporo cans": "sapporo",
  "sleemans original cans": "sleemans original",
  "sleemans clear 2.0 cans": "sleemans clear 2.0",
  "harp cans 6x4": "harp",
  "smithwicks cans 6x4": "smithwicks",
  "hipl cans 6x4": "hipl 6x4",
  "guinness cans 6x4": "guinness",
  "kilkenny 6x4": "kilkenny",
  "sapporo 30l kegs": "sapporo draft",
  "sleemans original 30l kegs": "sleemans original draft",
  "smirnoff ice cans bottles": "smirnoff ice encore original 4x6x355ml",
  "guinness 0.05% 6x4x440ml can csp": "guinness 0.05%",
  "kronenbourg 1664 blanc 0.0% 4x6x330ml btl": "kronenbourg 1664 blanc 0.0%",
  "sapporo canada 0.0% 4x6x355ml csp can": "sapporo canada 0.0%",
  "carlsberg 0% 4x6x330ml slim can csp": "carlsberg 0%",
  "bitburger 0.0 6x330ml": "bitburger 0.0",
};

function norm(value: unknown) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type WorkbookProduct = {
  rowCategory: string | null;
  name: string;
  starting: number | null;
  leftOver: number | null;
  consumed: number | null;
};

function readWorkbookProducts(): WorkbookProduct[] {
  const wb = XLSX.readFile(WORKBOOK);
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Sheet1"], {
    header: 1,
    defval: "",
  });
  const products: WorkbookProduct[] = [];
  let category: string | null = null;
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[0] ?? "").trim();
    if (!name) continue;
    if (/^total/i.test(name)) continue;
    const isNumericRow =
      typeof r[14] === "number" ||
      typeof r[16] === "number" ||
      typeof r[17] === "number" ||
      typeof r[18] === "number";
    if (!isNumericRow) {
      category = name;
      continue;
    }
    products.push({
      rowCategory: category,
      name,
      starting: typeof r[16] === "number" ? r[16] : null,
      leftOver: typeof r[17] === "number" ? r[17] : null,
      consumed: typeof r[18] === "number" ? r[18] : null,
    });
  }
  return products;
}

async function main() {
  const workbookProducts = readWorkbookProducts();

  const { rows: dbProducts } = await pool.query<{
    id: string;
    name: string;
    category: string;
  }>(
    `SELECT p.id, p.name, c.name AS category FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"`,
  );
  const byNormalizedName = new Map(dbProducts.map((p) => [norm(p.name), p]));

  function resolve(name: string) {
    const key = norm(name);
    return byNormalizedName.get(NAME_ALIASES[key] ?? key) ?? null;
  }

  const { rows: existing } = await pool.query<{ sourceId: string }>(
    `SELECT "sourceId" FROM "InventoryCount" WHERE "sourceSystem" = $1`,
    [SOURCE_SYSTEM],
  );
  const alreadyImported = new Set(existing.map((r) => r.sourceId));

  const { rows: barRows } = await pool.query<{ id: string }>(
    `SELECT id FROM "Location" WHERE code = 'BAR' AND active`,
  );
  const barId = barRows[0]?.id;
  if (!barId) throw new Error("Active BAR location not found.");

  const { rows: adminRows } = await pool.query<{ id: string }>(
    `SELECT id FROM "User" WHERE role = 'ADMINISTRATOR' AND status = 'ACTIVE' ORDER BY "createdAt" LIMIT 1`,
  );
  const adminId = adminRows[0]?.id;
  if (!adminId)
    throw new Error(
      "No active administrator found to attribute the import to.",
    );

  const unmatched: WorkbookProduct[] = [];
  const startingLines: Array<{
    productId: string;
    name: string;
    quantity: number;
  }> = [];
  const endingLines: Array<{
    productId: string;
    name: string;
    quantity: number;
  }> = [];
  const missingStarting: string[] = [];
  const missingEnding: string[] = [];

  for (const wp of workbookProducts) {
    const product = resolve(wp.name);
    if (!product) {
      unmatched.push(wp);
      continue;
    }
    if (wp.starting === null) missingStarting.push(wp.name);
    else
      startingLines.push({
        productId: product.id,
        name: product.name,
        quantity: wp.starting,
      });
    if (wp.leftOver === null) missingEnding.push(wp.name);
    else
      endingLines.push({
        productId: product.id,
        name: product.name,
        quantity: wp.leftOver,
      });
  }

  const startingSourceId = "2025-starting";
  const endingSourceId = "2025-ending";
  const startingAlready = alreadyImported.has(startingSourceId);
  const endingAlready = alreadyImported.has(endingSourceId);

  console.log(`Workbook product rows: ${workbookProducts.length}`);
  console.log(
    `Matched to a catalog Product: ${startingLines.length + missingStarting.length}`,
  );
  console.log(
    `Unmatched (no confident catalog Product found): ${unmatched.length}`,
  );
  unmatched.forEach((wp) =>
    console.log(`  UNMATCHED: ${wp.rowCategory} / ${wp.name}`),
  );
  console.log(
    `\n2025 starting count: ${startingAlready ? "already imported, will skip" : `${startingLines.length} lines ready, ${missingStarting.length} missing a starting value`}`,
  );
  missingStarting.forEach((name) => console.log(`  missing starting: ${name}`));
  console.log(
    `2025 ending count: ${endingAlready ? "already imported, will skip" : `${endingLines.length} lines ready, ${missingEnding.length} missing a leftover value`}`,
  );
  missingEnding.forEach((name) => console.log(`  missing ending: ${name}`));
  console.log(
    "\nUnmatched and missing-value Products will simply have no legacy count line — they will show as incomplete in the Consumption report rather than being guessed.",
  );

  if (!EXECUTE) {
    console.log("\nDry run only — nothing was written.");
    console.log("Re-run with --execute to actually import this data.");
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = new Date();
    if (!startingAlready && startingLines.length) {
      const countId = randomUUID();
      await client.query(
        `INSERT INTO "InventoryCount" (id,"locationId","countDate",status,notes,"createdById","acceptedById","acceptedAt","sourceSystem","sourceId")
         VALUES ($1,$2,'2025-05-01','ACCEPTED',$3,$4,$4,$5,$6,$7)`,
        [
          countId,
          barId,
          "Legacy import: 2025 season starting inventory from '2025 Orders and Consumptions.xlsx'",
          adminId,
          now,
          SOURCE_SYSTEM,
          startingSourceId,
        ],
      );
      for (const line of startingLines) {
        await client.query(
          `INSERT INTO "InventoryCountLine" (id,"inventoryCountId","productId","expectedQuantity","countedQuantity",difference)
           VALUES ($1,$2,$3,$4,$4,0)`,
          [randomUUID(), countId, line.productId, line.quantity],
        );
      }
    }
    if (!endingAlready && endingLines.length) {
      const countId = randomUUID();
      await client.query(
        `INSERT INTO "InventoryCount" (id,"locationId","countDate",status,notes,"createdById","acceptedById","acceptedAt","sourceSystem","sourceId")
         VALUES ($1,$2,'2025-10-15','ACCEPTED',$3,$4,$4,$5,$6,$7)`,
        [
          countId,
          barId,
          "Legacy import: 2025 season ending (leftover) inventory from '2025 Orders and Consumptions.xlsx'",
          adminId,
          now,
          SOURCE_SYSTEM,
          endingSourceId,
        ],
      );
      for (const line of endingLines) {
        await client.query(
          `INSERT INTO "InventoryCountLine" (id,"inventoryCountId","productId","expectedQuantity","countedQuantity",difference)
           VALUES ($1,$2,$3,$4,$4,0)`,
          [randomUUID(), countId, line.productId, line.quantity],
        );
      }
    }
    await client.query("COMMIT");
    console.log(
      "\nDone. Legacy 2025 starting/ending counts have been imported.",
    );
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
