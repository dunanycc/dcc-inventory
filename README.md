# DCC Inventory

Standalone inventory application for Dunany Country Club. Phase 1 establishes the product catalogue, location structure, authentication and role boundaries, audit records, and the application navigation shell.

## Technology

- Next.js App Router, TypeScript, React, and Tailwind CSS
- PostgreSQL on a dedicated Neon project
- Prisma ORM with the PostgreSQL driver adapter
- Auth.js with independently configured Google and/or Yahoo OAuth
- Vitest and Testing Library

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and replace placeholders locally. Never commit `.env.local`.
3. Generate the Prisma client with `npm run db:generate`.
4. Apply migrations with `npm run db:deploy` or create a development migration with `npm run db:migrate -- --name <name>`.
5. Seed structural locations with `npm run db:seed`.
6. Start the application with `npm run dev`.

## Environment variables

- `DATABASE_URL`: pooled PostgreSQL connection used by the application.
- `DATABASE_URL_UNPOOLED`: direct PostgreSQL connection used for migrations when available.
- `AUTH_SECRET`: a unique Auth.js signing secret for this standalone application.
- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`: optional independent Google OAuth application credentials.
- `AUTH_YAHOO_ID` and `AUTH_YAHOO_SECRET`: optional independent Yahoo OAuth application credentials.
- `BOOTSTRAP_ADMIN_EMAILS`: reserved comma-separated administrator bootstrap configuration; no user is created unless explicitly configured by a future controlled bootstrap step.

At least one OAuth provider must be configured before interactive sign-in is available. Signing in also requires a matching active `User` record; no Barsheet user table or authentication configuration is shared.

## Authorization

The fixed Phase 1 roles are Administrator, Inventory Manager, Inventory User, and Read Only. Server-side permission checks are defined in `lib/authorization.ts`; navigation labels are not treated as authorization controls.

## Validation

Run `npm test`, `npm run lint`, and `npm run build` before committing. Database changes must also pass `npx prisma migrate status` against the intended environment.

## Phase 1 limits

This foundation intentionally excludes live Google Sheet imports, purchasing, POS posting, Starter Shack fulfillment workflows, inventory ledger posting, cutover balances, production deployment, and Pricing beyond structural product fields.
