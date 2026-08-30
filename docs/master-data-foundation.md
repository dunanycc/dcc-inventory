# Master-data foundation contracts

## Starter Shack requests versus stocked Locations

`Product.starterShackRequestEligible` controls whether an active Product may appear on the future Bar-to-Starter-Shack transfer list. The flag is deliberately independent of ProductLocation: an eligible Product may have no Starter Shack ProductLocation yet.

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
