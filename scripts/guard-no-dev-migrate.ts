console.error(`
Refusing to run "prisma migrate dev".

This project has no separate staging database - DATABASE_URL is the
production database in every environment, local development included.
"prisma migrate dev" always applies every already-pending migration
before doing anything else (even with --create-only), which can
silently apply an unreviewed migration straight to production. This
happened once - see docs/master-data-foundation.md, "Migration
workflow incident (2026-09-03)".

The same reasoning applies to "prisma migrate reset": never run it
against this project's DATABASE_URL.

Approved workflow instead:
  1. Edit prisma/schema.prisma.
  2. Hand-author prisma/migrations/<timestamp>_<name>/migration.sql.
  3. npx prisma validate
  4. npx prisma generate
  5. Rehearse against a disposable database: npm run test:postgres
     (requires a separately named TEST_DATABASE_URL - see that script).
  6. Apply to production only as an explicit, separately authorized
     deployment step: npx prisma migrate deploy
`);
process.exitCode = 1;
