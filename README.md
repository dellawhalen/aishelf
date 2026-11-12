# AIShelf Brand Visibility

A Next.js application for recording AI-shopping audit evidence and calculating transparent, deterministic brand visibility diagnostics.

## Run locally

Requirements: Node.js 22.18 or newer and npm. `.nvmrc` selects Node.js 22 when using a version manager. The app uses Neon PostgreSQL through Prisma 7; set `DATABASE_URL` to Neon's pooled connection string and `DIRECT_URL` to its direct connection string in an ignored environment file. Use `sslmode=verify-full` for both. `DIRECT_URL` falls back to `DATABASE_URL` for local setups where only one connection is available. The placeholders in `.env.example` are not usable credentials.

```bash
cp .env.example .env.local
npm ci
npm run db:generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Set `AUTH_SECRET`, `AUTH_GITHUB_ID`, and `AUTH_GITHUB_SECRET` in the ignored `.env.local` file. Set `AISHELF_ALLOWED_USER_IDS` to a comma-separated list of invited collaborators' numeric GitHub account IDs; an empty list denies access. For local OAuth, register `http://localhost:3000/api/auth/callback/github` as a callback URL. The local workspace and its “Your brand” record are initialized automatically; no fabricated audits or products are inserted.

The existing Neon database is already provisioned. The Phase 4 usage-control migration is applied there. This Prisma upgrade changes client/configuration only and does not apply or require a database migration.

For OpenAI analysis, add `OPENAI_API_KEY` to the ignored `.env.local` file locally or to the server-only environment configuration when deployed. Never use a `NEXT_PUBLIC_` prefix or commit the key. In **Record audit evidence**, enter a question and captured shopping response, then choose **Analyze with AI**. AIShelf shows suggested findings and token counts for review; selected findings are saved only when you submit the existing audit form.

AI usage controls use `gpt-6-luna` standard pricing ($0.10/M input and $0.50/M output tokens), cap each request at 20,000 input and 3,000 output tokens, allow 10 requests per user per hour, and reserve up to the request maximum before calling OpenAI. The shared estimated-spend ceiling is $15, leaving $5 of the existing credits reserved for demonstrations. Identical completed analyses are cached in PostgreSQL for seven days. The usage ledger stores user IDs, request hashes, model, token counts, and estimated costs—not prompts or API keys; the cache stores structured analysis results, which may contain short evidence excerpts.

The usage-control migration has been applied to the current Neon database after approval. One approved live test with synthetic shopping text succeeded; no production deployment has occurred. The AI endpoint still requires an authorized user and server-side `OPENAI_API_KEY`. Other databases must have the usage-control tables before AI analysis can run.

The **Why AIShelf** page at [http://localhost:3000/why-aishelf](http://localhost:3000/why-aishelf) describes the product’s intended value for small online-first clothing brands, including the challenges of selling without in-person fit and product experiences.

### Authentication and workspace access

The dashboard and every data-changing or data-reading API route require an Auth.js JWT session for a GitHub account ID included in `AISHELF_ALLOWED_USER_IDS`. Auth.js checks the allowlist during sign-in, and the Next.js Proxy and server-side workspace authorization recheck it on requests. The list is deny-by-default and must contain numeric GitHub account IDs, not usernames. `/sign-up` redirects to sign-in; there is no open registration. The functional test server has a development-only bypass that is enabled only by its test harness; it is not enabled in production.

## Upload to a Git repository

The project is initialized as a local Git repository. Create an empty repository with your Git host, then add its URL and push:

```bash
git remote add origin <repository-url>
git add .
git commit -m "Initial AIShelf prototype"
git push -u origin main
```

`.env`, the local SQLite database, installed packages, and build output are ignored. Commit `.env.example`, but never commit real credentials or private customer/business data.

## Scoring methodology v1.0

All values are calculated server-side from records in the current audit. The overall score is available only when every category has valid evidence. Category scores are not reweighted when a category is missing.

| Category | Weight | Deterministic formula |
| --- | ---: | --- |
| AI brand visibility | 35% | Brand-mentioning responses ÷ valid sampled responses × 100 |
| Product information accuracy | 30% | Verified claims matching business information ÷ all verified claims × 100. Missing and unverified claims do not enter the denominator. |
| Competitive presence | 20% | Brand-mentioning responses ÷ (brand-mentioning responses + recorded competitor mentions) × 100 |
| Product information completeness | 15% | Completed applicable product fields ÷ applicable required product fields × 100 |

The overall score is the sum of category scores multiplied by their weights, rounded to the nearest integer. Classification thresholds are 90–100 Excellent, 75–89 Good, 60–74 Needs Improvement, 40–59 Low Visibility, and 0–39 Critical. These are proprietary AIShelf diagnostic classifications, not official platform ratings, market-share measures, or predictions of business outcomes.

Simulated and external observations are stored on separate audits. Historical comparisons require the same source type/name, collection method, methodology version, and normalized tested question. Product-field inputs are snapshotted with each audit so later catalog edits do not rewrite history.

## Database changes

The active schema and PostgreSQL migration history are in `prisma/schema.prisma` and `prisma/migrations/`. The original SQLite migration is preserved under `prisma/migrations-sqlite/` and is not applied to PostgreSQL. `npm run db:deploy` applies committed PostgreSQL migrations; obtain approval before running it against any database. The Phase 4 usage-control migration is already applied to the current Neon database. While developing schema changes, use `npm run db:dev`; use `npm run db:push` only for a disposable database. Set `DATABASE_URL` in each environment. Keep credentials, database files, and `.env` out of source control.

The schema stores organizations and brands, catalog products, audits and raw captured responses, competitor mentions, verified claim checks, category scores, product-field snapshots, overall score snapshots, recommendations, and recommendation status transitions. Audit scores retain calculation version, source, sample size, timestamp, and linked evidence.

### Prisma deployment security

The Prisma CLI advisory [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) (CVE-2026-40345) affected Prisma 6's `deepmerge-ts` configuration dependency. The isolated Prisma remediation branch upgrades both `prisma` and `@prisma/client` to 7.10.1, uses Prisma's generated client and PostgreSQL driver adapter, and moves CLI connection configuration into `prisma.config.ts`. The upgrade adds no schema migration; do not run `db:deploy` or `db:push` against the existing Neon database as part of this dependency change.

The remaining moderate `minimatch` advisory is nested under TypeScript ESLint tooling and marked development-only in the lockfile. It did not appear in the production dependency audit; it is not being upgraded as part of the production blocker fix.

### Vercel preparation

Vercel should auto-detect Next.js; no `vercel.json` or custom build command is required. Select Node.js 22 and set these variables in Vercel's server-side project settings: pooled Neon `DATABASE_URL`, direct Neon `DIRECT_URL` (used by Prisma CLI), `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AISHELF_ALLOWED_USER_IDS`, and server-only `OPENAI_API_KEY`. Use Neon's verified SSL connection strings. Never add secrets with a `NEXT_PUBLIC_` prefix. Auth.js uses Vercel's trusted host setting; no custom domain is needed. Register `https://<project>.vercel.app/api/auth/callback/github` as the GitHub OAuth App callback URL. Use a separately generated `AUTH_SECRET` for Vercel.

Vercel Hobby is free and limited to personal or non-commercial use. Its current terms also permit use of Hobby-submitted content for AI/model training and sharing with third parties. Do not put confidential brand information on Hobby unless the account's applicable opt-out is confirmed and enabled; use the fictional MAISON ELLE data or other non-confidential test data for the group demo.

This branch only prepares the application. No Vercel project/account action, paid-plan activation, or deployment is authorized or performed. Before sharing a deployment URL, confirm the applicable free-tier terms and limits in the accounts; a free tier is not a guarantee of zero usage charges.

### SQLite-to-Neon data copy

The guarded migration script copied `dev.db` into Neon with SQLite opened read-only. It refused unexpected or populated PostgreSQL tables and compared every row before reporting success. This copy has completed; AIShelf now uses Neon, while the SQLite database and its external backup remain unchanged. The script does not change application configuration and must not be rerun against the populated destination.

```bash
NEON_PROJECT_ID="replace-with-your-neon-project-id"
AISHELF_SQLITE_URL="file:$PWD/dev.db?mode=ro" \
NEON_DATABASE_URL="$(npx --yes neonctl --analytics=false connection-string --project-id "$NEON_PROJECT_ID" --prisma)" \
npx tsx scripts/migrate-sqlite-to-neon.mjs
```

The connection string is passed through the process environment and is not printed by the script. Do not commit it or put it in a frontend variable. This was a one-time migration and must not be rerun against the populated destination.

## What works / what needs integration

**Functional locally:** responsive dashboard; clickable category evidence panels; product catalog entry/editing and per-product required specifications; manual audit evidence capture; simulated/external source separation; score history with before/after evidence; issue investigation and review actions; deterministic recommendations from saved accuracy, visibility, competitive, and completeness evidence; recommendation approval/completion tracking; persistent follow-up reminders; Neon PostgreSQL persistence.

**Not connected:** live AI-shopping platform APIs, automated prompt execution/collection, external product feeds, and calendar notifications/automated follow-up execution. Follow-up dates are stored as local reminders only. “External observation” means a user manually entered an observation from an external platform; AIShelf does not verify that platform or fetch its data. OpenAI analysis uses only owner-provided catalog details and captured responses. Existing recommendations remain reviewable and never publish changes.

The workspace is currently single-tenant. Before sharing a public URL, configure the GitHub OAuth App, add only invited users' numeric GitHub IDs to the Vercel allowlist, and verify the hosted environment variables and free-tier terms. This Auth.js change does not modify the Neon schema or records, and it does not authorize or perform a deployment.

## Checks

```bash
npm ci
npm run db:generate
npm run db:deploy
npm test
npm run test:ai-audit
npm run test:functional
npm run typecheck
npm run lint
npm run build
```

`npm run test:functional` requires `AISHELF_TEST_DATABASE_URL` to point to a disposable PostgreSQL database. It starts an isolated local server, creates a uniquely named schema, verifies the product, audit, recommendation, follow-up, and dashboard API flow, then drops only that test schema. It never uses the app's configured `DATABASE_URL` or changes its `public` schema. For local runs, supply the separate test connection explicitly:

```bash
AISHELF_TEST_DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require" npm run test:functional
```

GitHub Actions uses a job-local PostgreSQL container.

To test the fictional MAISON ELLE fixture, set both `AISHELF_MAISON_ELLE_DATASET` and `AISHELF_TEST_DATABASE_URL`, then run `npm run test:maison-elle`. This validates product specifications, simulated observations, claim checks, comparable runs, recommendation status changes, and follow-up records in its own temporary PostgreSQL schema. The dataset-specific command is intentionally separate from CI because the fixture directory is supplied locally.

To display the fictional dataset in the running local app, add it as a separate brand without replacing existing workspace data:

```bash
AISHELF_MAISON_ELLE_DATASET="/Users/dellawhalen/Downloads/aishelf_maison_elle_test_dataset" npm run import:maison-elle
```

The importer adds the products, synthetic observations (labeled `SIMULATED`), claim checks, scores, recommendations, status history, and scheduled follow-up to the configured local database. It stops without changes if MAISON ELLE is already present. Switch to MAISON ELLE using the workspace selector in the app. No schema migration is required; the existing models support multiple brands.

GitHub Actions runs these checks for pushes and pull requests.

## Phase 2 Prototype Demonstration

**Live prototype:** https://aishelf-chi.vercel.app/

**Access:** Invitation-only through GitHub OAuth. Approved users must have their numeric GitHub account ID included in the server-side allowlist.

### Demonstration workflow

1. Sign in using an approved GitHub account.
2. Select the fictional MAISON ELLE clothing brand.
3. Explore the dashboard and review the brand visibility scoring categories.
4. Examine the product catalog and existing audit evidence.
5. Record a new simulated shopping-response audit.
6. Use **Analyze with AI** to generate suggested findings for human review.
7. Review the findings and choose which information to save.
8. Examine the updated audit evidence and any resulting recommendations.
9. Update a recommendation's status or schedule a follow-up.

### Important limitations

- MAISON ELLE is a fictional brand used for prototype testing.
- AIShelf does not automatically collect responses from external AI-shopping platforms.
- The visibility score is a deterministic diagnostic, not a verified measure of market share or commercial performance.
- AI-generated suggestions require human review before saving.
- External product integrations and automated notifications are not implemented.

**Access for evaluation:** The instructor must be added to the approved GitHub account allowlist before testing the hosted prototype.
