# Security

Please report suspected vulnerabilities privately using GitHub's **Report a vulnerability** option in the repository's Security tab, when enabled. Do not put credentials, personal information, or exploit details in public issues.

Only the current main branch is maintained. A public repository does not grant access to the deployed application or its database.

## Production and contributor safety

- Keep credentials in environment variables. Never commit real `.env` files, database exports, import workbooks, or Vercel configuration containing secrets.
- This project currently has no staging database. Do not give untrusted code or fork previews production database, SMTP, OAuth, or authentication secrets.
- Keep Vercel fork deployment authorization enabled. Review fork changes before allowing a build with secrets.
- Use a separately named disposable database for migration rehearsals. Follow `docs/master-data-foundation.md` for production migration approval.
- `scripts/reset-starter-shack-data.ts --execute` permanently removes operational history. It is an operator maintenance command, not a setup step.

## Dependency maintenance

The lockfile is committed; use `npm ci` for reproducible installs and run `npm audit` after dependency updates.

- SheetJS is installed from its official `cdn.sheetjs.com` release because the npm registry's `xlsx` release is outdated. Keep the tarball URL and lockfile integrity updated together.
- Auth.js currently advertises older Nodemailer peer ranges. Scoped overrides select the patched Nodemailer used by this application's SMTP sender; this app does not use Auth.js's Nodemailer provider. Recheck these overrides when updating Auth.js.
- A scoped `minimatch` override patches the copy used by TypeScript ESLint. Recheck it when updating `eslint-config-next`; do not override the older API used by other ESLint plugins globally.

## Before making the repository public

Repository owners must review the following outside the checkout:

- GitHub issues, attachments, Actions artifacts, and logs for private information.
- Vercel preview environment variables and fork deployment authorization. Public source must not cause untrusted preview code to run with production credentials.
- Commit author names and email addresses, plus old test fixtures in Git history. Replacing current fixtures does not remove historical copies. If those identities must be removed, plan a coordinated history rewrite before publication.
- Enable GitHub private vulnerability reporting and secret scanning/push protection where available.

The product-vendor feature includes a database migration. Apply that migration through the approved production workflow before deploying code that queries `Product.vendorId`.
