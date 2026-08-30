import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import pg from "pg";

loadEnvConfig(process.cwd());

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required. Use a disposable PostgreSQL database whose name contains test, ci, disposable, or temporary.");
if (connectionString === process.env.DATABASE_URL || connectionString === process.env.DATABASE_URL_UNPOOLED) throw new Error("TEST_DATABASE_URL must not equal an application database URL.");
const databaseName = new URL(connectionString).pathname.slice(1).toLowerCase();
if (!/(test|ci|disposable|temporary)/.test(databaseName)) throw new Error(`Refusing destructive rehearsal against database '${databaseName}'.`);

const pool = new pg.Pool({ connectionString, max: 4 });
const migrationsDirectory = path.join(process.cwd(), "prisma", "migrations");

async function expectConstraint(sql: string, values: unknown[] = []) {
  try {
    await pool.query(sql, values);
    throw new Error("Expected PostgreSQL to reject invalid data");
  } catch (error) {
    if (error instanceof Error && error.message === "Expected PostgreSQL to reject invalid data") throw error;
  }
}

async function main() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  const migrations = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    const sql = await readFile(path.join(migrationsDirectory, migration, "migration.sql"), "utf8");
    await pool.query(sql);
    if (migration === "20260827214958_phase1_foundation") {
      await pool.query(`
        INSERT INTO "User" (id,email,name,status,role,"updatedAt") VALUES ('00000000-0000-0000-0000-000000000001','admin@example.com','Admin','ACTIVE','ADMINISTRATOR',now());
        INSERT INTO "Category" (id,name,"displayOrder","updatedAt") VALUES ('00000000-0000-0000-0000-000000000002',' Beer  Cans ',1,now());
        INSERT INTO "Product" (id,name,"categoryId","stockUnit","allowFractionalStock","quantityScale","starterShackEligible","updatedAt") VALUES ('00000000-0000-0000-0000-000000000003','Lager','00000000-0000-0000-0000-000000000002','CAN',false,0,true,now());
        INSERT INTO "Location" (id,code,name,"updatedAt") VALUES ('00000000-0000-0000-0000-000000000004','BAR','Bar',now());
        INSERT INTO "ProductLocation" ("productId","locationId",active,"updatedAt") VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',true,now());
      `);
    }
  }

  const preserved = await pool.query('SELECT "starterShackRequestEligible" FROM "Product" WHERE id = $1', ['00000000-0000-0000-0000-000000000003']);
  if (preserved.rows[0]?.starterShackRequestEligible !== true) throw new Error("Starter Shack request eligibility was not preserved");
  const reviewedRelationship = await pool.query('SELECT "reviewRequired" FROM "ProductLocation" WHERE "productId" = $1 AND "locationId" = $2', ['00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004']);
  if (reviewedRelationship.rows[0]?.reviewRequired !== false) throw new Error("Existing Phase 1 ProductLocation did not receive the reviewRequired default");

  await expectConstraint(`INSERT INTO "Category" (id,name,"nameNormalized","displayOrder","updatedAt") VALUES (gen_random_uuid(),' beer   cans ','beer cans',2,now())`);
  await expectConstraint(`INSERT INTO "Category" (id,name,"nameNormalized","displayOrder","updatedAt") VALUES (gen_random_uuid(),'Wine','wine',-1,now())`);
  await expectConstraint(`INSERT INTO "User" (id,email,"emailNormalized",status,role,"updatedAt") VALUES (gen_random_uuid(),'ADMIN@EXAMPLE.COM','admin@example.com','ACTIVE','READ_ONLY',now())`);
  await expectConstraint(`INSERT INTO "Product" (id,name,"categoryId","stockUnit","allowFractionalStock","quantityScale","starterShackRequestEligible","updatedAt") VALUES (gen_random_uuid(),'Invalid scale','00000000-0000-0000-0000-000000000002','EACH',false,2,false,now())`);
  await expectConstraint(`INSERT INTO "Product" (id,name,"categoryId","stockUnit","allowFractionalStock","quantityScale","purchaseUnit","starterShackRequestEligible","updatedAt") VALUES (gen_random_uuid(),'Missing conversion','00000000-0000-0000-0000-000000000002','EACH',false,0,'CASE',false,now())`);
  await expectConstraint(`UPDATE "ProductLocation" SET "lowStockThreshold" = -1`);
  await expectConstraint(`INSERT INTO "ProductLocation" ("productId","locationId",active,"reviewRequired","updatedAt") VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',true,false,now())`);
  await expectConstraint(`INSERT INTO "Category" (id,name,"nameNormalized","displayOrder","sourceSystem","updatedAt") VALUES (gen_random_uuid(),'Partial source','partial source',3,'legacy-2026',now())`);

  await pool.query(`INSERT INTO "InventoryMovement" (id,type,"productId",quantity,"destinationLocationId","occurredAt","postedById","sourceSystem","sourceId") VALUES (gen_random_uuid(),'OPENING','00000000-0000-0000-0000-000000000003',24,'00000000-0000-0000-0000-000000000004',now(),'00000000-0000-0000-0000-000000000001','legacy-2026','bar-lager-opening')`);
  await expectConstraint(`INSERT INTO "InventoryMovement" (id,type,"productId",quantity,"destinationLocationId","occurredAt","postedById") VALUES (gen_random_uuid(),'OPENING','00000000-0000-0000-0000-000000000003',1,'00000000-0000-0000-0000-000000000004',now(),'00000000-0000-0000-0000-000000000001')`);
  await expectConstraint(`INSERT INTO "InventoryMovement" (id,type,"productId",quantity,"destinationLocationId","occurredAt","postedById") VALUES (gen_random_uuid(),'RECEIPT','00000000-0000-0000-0000-000000000003',0,'00000000-0000-0000-0000-000000000004',now(),'00000000-0000-0000-0000-000000000001')`);
  await expectConstraint(`INSERT INTO "InventoryMovement" (id,type,"productId",quantity,"sourceLocationId","destinationLocationId","occurredAt","postedById") VALUES (gen_random_uuid(),'TRANSFER','00000000-0000-0000-0000-000000000003',1,'00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004',now(),'00000000-0000-0000-0000-000000000001')`);
  await expectConstraint(`INSERT INTO "InventoryMovement" (id,type,"productId",quantity,"destinationLocationId","occurredAt","postedById","sourceSystem") VALUES (gen_random_uuid(),'RECEIPT','00000000-0000-0000-0000-000000000003',1,'00000000-0000-0000-0000-000000000004',now(),'00000000-0000-0000-0000-000000000001','legacy-2026')`);
  await expectConstraint(`INSERT INTO "InventoryMovement" (id,type,"productId",quantity,"destinationLocationId","occurredAt","postedById","sourceSystem","sourceId") VALUES (gen_random_uuid(),'RECEIPT','00000000-0000-0000-0000-000000000003',1,'00000000-0000-0000-0000-000000000004',now(),'00000000-0000-0000-0000-000000000001','legacy-2026','bar-lager-opening')`);

  const duplicateResults = await Promise.allSettled([
    pool.query(`INSERT INTO "Category" (id,name,"nameNormalized","displayOrder","updatedAt") VALUES (gen_random_uuid(),'Concurrent','concurrent',3,now())`),
    pool.query(`INSERT INTO "Category" (id,name,"nameNormalized","displayOrder","updatedAt") VALUES (gen_random_uuid(),' concurrent ','concurrent',4,now())`),
  ]);
  if (duplicateResults.filter((result) => result.status === "fulfilled").length !== 1) throw new Error("Concurrent normalized duplicate protection was not enforced");

  await pool.query(`UPDATE "Location" SET active = false WHERE code = 'BAR'`);
  await pool.query(`INSERT INTO "Location" (id,code,name,active,"updatedAt") VALUES (gen_random_uuid(),'BAR','Bar',true,now()) ON CONFLICT DO NOTHING`);
  const seededLocation = await pool.query(`SELECT active FROM "Location" WHERE code = 'BAR'`);
  if (seededLocation.rows[0]?.active !== false) throw new Error("Create-if-missing seed semantics reactivated an existing Location");

  await pool.query(`INSERT INTO "User" (id,email,"emailNormalized",name,status,role,"updatedAt") VALUES ('00000000-0000-0000-0000-000000000005','admin2@example.com','admin2@example.com','Admin 2','ACTIVE','ADMINISTRATOR',now())`);
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    await first.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await second.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await first.query(`SELECT count(*) FROM "User" WHERE status = 'ACTIVE' AND role = 'ADMINISTRATOR'`);
    await second.query(`SELECT count(*) FROM "User" WHERE status = 'ACTIVE' AND role = 'ADMINISTRATOR'`);
    await first.query(`UPDATE "User" SET status = 'DISABLED', "updatedAt" = now() WHERE id = '00000000-0000-0000-0000-000000000001'`);
    await second.query(`UPDATE "User" SET status = 'DISABLED', "updatedAt" = now() WHERE id = '00000000-0000-0000-0000-000000000005'`);
    const commits = await Promise.allSettled([first.query("COMMIT"), second.query("COMMIT")]);
    if (commits.filter((result) => result.status === "rejected").length !== 1) throw new Error("Expected PostgreSQL Serializable isolation to abort one write-skew transaction");
  } finally {
    await first.query("ROLLBACK").catch(() => undefined);
    await second.query("ROLLBACK").catch(() => undefined);
    first.release();
    second.release();
  }

  console.log(`PostgreSQL rehearsal passed (${migrations.length} migrations, Phase 1 upgrade data preserved).`);
}

main().finally(() => pool.end()).catch((error) => { console.error(error); process.exitCode = 1; });
