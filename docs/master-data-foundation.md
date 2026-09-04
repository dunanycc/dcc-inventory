# Master-data foundation contracts

## Starter Shack requests versus stocked Locations

`Product.starterShackRequestEligible` controls whether an active Product may be requested by Starter Shack staff. Routine Product create/edit keeps the underlying relationships simple: every Product is active at Bar by default, and selecting Starter Shack availability activates the Starter Shack relationship in the same transaction. The Product screen exposes only that request choice, not the internal ProductLocation records.

Changing tracked stock at a Location requires an active Product, an active Location, an existing active ProductLocation, and `reviewRequired = false`. The reusable `inventoryPostingEligibility` domain rule is the authority future opening quantities, receipts, transfers, and counts must call.

## Product units

All inventory quantities use the Product stock unit. `stockUnit`, `stockUnitLabel`, `allowFractionalStock`, and `quantityScale` determine how tracked quantities are interpreted. Product updates query for existing movements or Starter Shack request lines inside the transaction and call `accountingUnitChangeAllowed`; once either exists, those fields cannot change. Purchase-unit conversions remain editable because Orders will preserve the conversion used and stock movements use stock units.

## Stock history and balances

`InventoryMovement` is the internal history of tracked stock changes, not an accounting ledger. It supports only OPENING, RECEIPT, TRANSFER, and COUNT_ADJUSTMENT. Quantities are stored in the Product's counted-as unit. Current stock is calculated as movements into a Location minus movements out; Product and ProductLocation never store a mutable current quantity.

Opening quantities can be set once per Product and Location by an Administrator or Inventory Manager. Later corrections belong to an accepted physical count rather than replacing history. Every movement records its poster and occurrence time and has restrictive Product, Location, and User foreign keys.

Confidently reconstructed legacy movements may provide a unique `(sourceSystem, sourceId)` pair for repeatable 2026 migration. These fields are optional: historical or reference-only records that cannot be reconstructed confidently are not forced into InventoryMovement. Migration tooling must use the same posting service so Product units and ProductLocation eligibility are enforced.

## Starter Shack requests

`StockRequest` and `StockRequestLine` preserve requested and given quantities without changing stock when a request is submitted. Confirmed quantities create completed, request-linked `Transfer` and `TransferLine` records plus immutable Bar-to-Starter-Shack `TRANSFER` movements in one Serializable transaction. Requests and request lines support paired `(sourceSystem, sourceId)` provenance for a future idempotent legacy import; uncertain historical records are not forced into movements.

## Migration source identity

Category, Product, and ProductLocation each store an optional `(sourceSystem, sourceId)` pair protected by a composite unique constraint. Both values are required together. Migration tooling must call the existing domain create/configure functions with `source`, so normalization, unit validation, authorization, review state, and auditing remain in force. Mutable names are never source identity. Product retains `legacyProductId` for compatibility, but new repeatable migration work should use the common source pair.

The Admin Product CSV import uses `DCC_PRODUCT_CSV` with the required `source_id` column. A repeated Product identity is skipped rather than updated, protecting reviewed master data and any later stock history. The import creates only Categories, Products, and requested ProductLocation relationships; opening quantities remain a separate, explicit operation.

## Category ordering

Database order is authoritative: `displayOrder`, then stable Category `id`. Screens must use `CATEGORY_ORDER_BY` and must not introduce name/collation-dependent sorting. Administrators should assign explicit display orders when meaningful placement is required.

## PostgreSQL rehearsal

`npm run test:postgres` destructively rebuilds only a disposable database supplied as `TEST_DATABASE_URL`. As a safety guard, the database name must contain `test`, `ci`, `disposable`, or `temporary`, and it must not equal `DATABASE_URL` or `DATABASE_URL_UNPOOLED`.

The harness applies every migration in order, inserts Phase 1-shaped data before the pending migrations, and verifies upgrade preservation, CHECK constraints, normalized uniqueness, source/composite uniqueness, and the Starter Shack value-preserving rename. Never point it at production.

## Approved migration workflow

This project has no separate staging database - `DATABASE_URL` is production in every environment, including local development. Schema work must never run a Prisma command that can write to it outside an explicit, authorized deploy step:

1. Edit `prisma/schema.prisma`.
2. Hand-author the migration under `prisma/migrations/<timestamp>_<name>/migration.sql` rather than generating it interactively.
3. `npx prisma validate`.
4. `npx prisma generate`.
5. Rehearse against a disposable database with `npm run test:postgres` (a separately named `TEST_DATABASE_URL`, per the guard above).
6. Apply to production only as an explicit, separately authorized deployment step with `npx prisma migrate deploy`.

Never run `prisma migrate dev` or `prisma migrate reset` against this project. `db:migrate` is deliberately wired to a guard script (`scripts/guard-no-dev-migrate.ts`) that refuses and prints this workflow instead of invoking `prisma migrate dev`.

### Migration workflow incident (2026-09-03)

While hand-authoring an unrelated additive migration, `prisma migrate dev --create-only` was run to generate the new migration file. Unexpectedly, `prisma migrate dev` first applies every already-pending migration before creating anything new - even with `--create-only` - and a previous migration (`20260903190000_remove_stock_request_requestor_email`, dropping `StockRequestNotificationSettings.requestorEmail`) had been hand-authored and intentionally left unapplied pending a separate deploy step. That pending migration was applied to production as an unintended side effect.

Verification afterward (read-only: `_prisma_migrations` inspection, `prisma migrate diff` against the live database, and direct information_schema/pg_catalog queries) confirmed the drop applied exactly once, cleanly, with no other unintended schema drift. The application code matching that schema change was already written, tested, and committed, but had not yet been deployed - so production briefly ran deployed code that still referenced the now-dropped column until that code was deployed.

Lesson: `prisma migrate dev` is unsafe to run at all against a project with no separate staging database, regardless of flags. Use the approved workflow above instead.
