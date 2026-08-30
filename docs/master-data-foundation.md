# Master-data foundation contracts

## Starter Shack requests versus stocked Locations

`Product.starterShackRequestEligible` controls whether an active Product may appear on the future Bar-to-Starter-Shack transfer list. The flag is deliberately independent of ProductLocation: an eligible Product may have no Starter Shack ProductLocation yet.

Changing tracked stock at a Location requires an active Product, an active Location, an existing active ProductLocation, and `reviewRequired = false`. The reusable `inventoryPostingEligibility` domain rule is the authority future opening quantities, receipts, transfers, and counts must call.

## Product units

All inventory quantities use the Product stock unit. `stockUnit`, `stockUnitLabel`, `allowFractionalStock`, and `quantityScale` determine how tracked quantities are interpreted. The stock-history phase must query for existing Product movements inside the Product update transaction and call `accountingUnitChangeAllowed`; once a movement exists, those fields cannot change. Purchase-unit conversions remain editable because Orders will preserve the conversion used and stock movements will use stock units.

## Migration source identity

Category, Product, and ProductLocation each store an optional `(sourceSystem, sourceId)` pair protected by a composite unique constraint. Both values are required together. Migration tooling must call the existing domain create/configure functions with `source`, so normalization, unit validation, authorization, review state, and auditing remain in force. Mutable names are never source identity. Product retains `legacyProductId` for compatibility, but new repeatable migration work should use the common source pair.

## Category ordering

Database order is authoritative: `displayOrder`, then stable Category `id`. Screens must use `CATEGORY_ORDER_BY` and must not introduce name/collation-dependent sorting. Administrators should assign explicit display orders when meaningful placement is required.

## PostgreSQL rehearsal

`npm run test:postgres` destructively rebuilds only a disposable database supplied as `TEST_DATABASE_URL`. As a safety guard, the database name must contain `test`, `ci`, `disposable`, or `temporary`, and it must not equal `DATABASE_URL` or `DATABASE_URL_UNPOOLED`.

The harness applies every migration in order, inserts Phase 1-shaped data before the pending migrations, and verifies upgrade preservation, CHECK constraints, normalized uniqueness, source/composite uniqueness, and the Starter Shack value-preserving rename. Never point it at production.
