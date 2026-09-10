import { loadEnvConfig } from "@next/env";
import pg from "pg";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new pg.Pool({ connectionString, max: 4 });
const EXECUTE = process.argv.includes("--execute");

// Deletes every Delivery and Stock Request (and everything they created:
// Transfers, and the RECEIPT / TRANSFER / COUNT_ADJUSTMENT inventory
// movements they posted) so the database is clean before a legacy import.
// OPENING inventory movements, Products, Categories, Vendors, and Users are
// left untouched. Deletion order respects the schema's onDelete: Restrict
// foreign keys (movements and lines before their parent records).
async function main() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*) FROM "InventoryMovement" WHERE type IN ('RECEIPT','TRANSFER','COUNT_ADJUSTMENT')) AS movements,
      (SELECT count(*) FROM "TransferLine") AS transfer_lines,
      (SELECT count(*) FROM "Transfer") AS transfers,
      (SELECT count(*) FROM "StockRequestLine") AS request_lines,
      (SELECT count(*) FROM "StockRequest") AS requests,
      (SELECT count(*) FROM "DeliveryLine") AS delivery_lines,
      (SELECT count(*) FROM "Delivery") AS deliveries
  `);
  const counts = rows[0] as Record<string, string>;
  console.log("This will permanently delete:");
  console.log(
    `  ${counts.deliveries} Deliveries (${counts.delivery_lines} lines)`,
  );
  console.log(
    `  ${counts.requests} Stock Requests (${counts.request_lines} lines)`,
  );
  console.log(
    `  ${counts.transfers} Transfers (${counts.transfer_lines} lines)`,
  );
  console.log(
    `  ${counts.movements} Inventory Movements (RECEIPT / TRANSFER / COUNT_ADJUSTMENT)`,
  );
  console.log(
    "OPENING inventory movements, Products, Categories, Vendors, and Users are left untouched.",
  );

  if (!EXECUTE) {
    console.log("\nDry run only — nothing was deleted.");
    console.log("Re-run with --execute to actually delete this data.");
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM "InventoryMovement" WHERE type IN ('RECEIPT','TRANSFER','COUNT_ADJUSTMENT')`,
    );
    await client.query(`DELETE FROM "TransferLine"`);
    await client.query(`DELETE FROM "Transfer"`);
    await client.query(`DELETE FROM "StockRequestLine"`);
    await client.query(`DELETE FROM "StockRequest"`);
    await client.query(`DELETE FROM "DeliveryLine"`);
    await client.query(`DELETE FROM "Delivery"`);
    await client.query("COMMIT");
    console.log(
      "\nDone. Starter Shack requests and Deliveries have been removed.",
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
