# DCC Inventory

Standalone stock-tracking application for Dunany Country Club volunteers. It is focused on Products, vendor receiving, Bar-to-Starter-Shack transfers, physical counts, and a clear history of stock changes.

## Technology

- Next.js App Router, TypeScript, React, and Tailwind CSS
- PostgreSQL on a dedicated Neon project
- Prisma ORM with the PostgreSQL driver adapter
- Auth.js with independently configured Google and/or Yahoo OAuth, plus an SMTP-based email magic-link option for approved Users on neither provider
- Vitest and Testing Library

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and replace placeholders locally. Never commit `.env.local`.
3. Generate the Prisma client with `npm run db:generate`.
4. Apply migrations with `npm run db:deploy`. This project has no separate staging database, so `prisma migrate dev`/`reset` must never be run against it - `npm run db:migrate` is a guard that refuses and explains the approved hand-author-and-rehearse workflow (see `docs/master-data-foundation.md`).
5. Seed structural locations with `npm run db:seed`.
6. Start the application with `npm run dev`. DCC Inventory runs at `http://localhost:3016`.

## Environment variables

- `DATABASE_URL`: pooled PostgreSQL connection used by the application.
- `DATABASE_URL_UNPOOLED`: direct PostgreSQL connection used for migrations when available.
- `AUTH_SECRET`: a unique Auth.js signing secret for this standalone application.
- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`: Google OAuth application credentials.
- `AUTH_YAHOO_ID` and `AUTH_YAHOO_SECRET`: Yahoo OAuth application credentials.
- `BOOTSTRAP_ADMIN_EMAILS`: comma-separated emails allowed to create their own initial Administrator row after verified OAuth or email-link sign-in. Matching is exact after trimming and lowercasing. Existing users are never modified by bootstrap.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM`: shared SMTP configuration (defaults assume Gmail) used both for Starter Shack request notifications and for the email magic-link sign-in provider. Email-link sign-in is only offered when `SMTP_USER`/`SMTP_PASSWORD` are set.
- `APP_URL`: base URL used to build absolute links in outgoing emails, including sign-in links.

Configure the same variables in `.env.local` for local development and in the appropriate Vercel environments. Never commit their values. Register these local OAuth callbacks:

- Google: `http://localhost:3016/api/auth/callback/google`
- Yahoo: `http://localhost:3016/api/auth/callback/yahoo`

Register the corresponding HTTPS callbacks for each deployed Vercel domain (for example, `https://your-domain/api/auth/callback/google` and `/api/auth/callback/yahoo`). At least one sign-in method (an OAuth provider, or SMTP for the email-link option) must be configured before interactive sign-in is available. Apart from the narrowly configured bootstrap path, signing in requires a matching active `User` record; no Barsheet user table or authentication configuration is shared. Email-link sign-in never creates a password and consumes a one-time, short-lived token stored (hashed) in `VerificationToken`.

## Authorization

The fixed Phase 1 roles are Administrator, Inventory Manager, Inventory User, and Read Only. Server-side permission checks are defined in `lib/authorization.ts`; navigation labels are not treated as authorization controls.

## Validation

Run `npm test`, `npm run lint`, and `npm run build` before committing. Database changes must also pass `npx prisma migrate status` against the intended environment.

Master-data safety, migration identity, Starter Shack availability, and disposable PostgreSQL rehearsal contracts are documented in `docs/master-data-foundation.md`. Run `npm run test:postgres` only with a separately named disposable `TEST_DATABASE_URL`; the harness refuses application database URLs and database names that do not clearly identify themselves as tests.

## Product and stock foundation

The current foundation establishes secure access, Product/Category/Location setup, immutable stock-change history, opening quantities, calculated Location balances, and lightweight Starter Shack request fulfillment. Vendor receiving and physical counts are implemented in focused phases. DCC Inventory is not a billing, accounting, POS, or generalized procurement platform.

Administrators and Inventory Managers can use **Admin → Imports** to preview and atomically import Categories and Products from the provided CSV template or the current DCC Inventory Tracker CSV export. Product imports are repeatable by `source_id`/`ID`; opening counts and consumed quantities are deliberately ignored and no inventory movements are created.

## Vercel production builds

`vercel.json` runs `npm run vercel-build`. For `VERCEL_ENV=production`, this applies committed Prisma migrations before building Next.js; a migration failure stops the build. Preview builds only build the application and do not apply migrations. Production requires `DATABASE_URL` and should also have `DATABASE_URL_UNPOOLED` for the direct migration connection (it falls back to `DATABASE_URL` when absent).

Review and rehearse database changes before authorizing a push to the production branch. That push authorizes production migration execution as part of the deployment. Keep fork deployment authorization enabled and keep production credentials out of untrusted preview builds.
