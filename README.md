# AIShelf Brand Visibility

A local Next.js application for recording AI-shopping audit evidence and calculating transparent, deterministic brand visibility diagnostics.

## Run locally

Requirements: Node.js 20.9+ and npm. `.nvmrc` selects Node.js 20 when using a version manager.

```bash
cp .env.example .env
npm ci
npm run db:generate
npm run db:deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `.env.example` configures SQLite at `./dev.db`; copy it to `.env` before starting. The local workspace and its “Your brand” record are initialized automatically; no fabricated audits or products are inserted.

The **Why AIShelf** page at [http://localhost:3000/why-aishelf](http://localhost:3000/why-aishelf) describes the product’s intended value for small online-first clothing brands, including the challenges of selling without in-person fit and product experiences.

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

The schema is in `prisma/schema.prisma`; the initial SQLite migration is `prisma/migrations/20261023000000_initial/migration.sql`. Use `npm run db:deploy` to apply committed migrations to a fresh or deployed database. While developing schema changes, use `npm run db:dev` to create a migration, or `npm run db:push` for a disposable local database. Set `DATABASE_URL` in your deployment environment. Keep database files and `.env` out of source control.

The schema stores organizations and brands, catalog products, audits and raw captured responses, competitor mentions, verified claim checks, category scores, product-field snapshots, overall score snapshots, recommendations, and recommendation status transitions. Audit scores retain calculation version, source, sample size, timestamp, and linked evidence.

## What works / what needs integration

**Functional locally:** responsive dashboard; clickable category evidence panels; product catalog entry/editing and per-product required specifications; manual audit evidence capture; simulated/external source separation; score history with before/after evidence; issue investigation and review actions; deterministic recommendations from saved accuracy, visibility, competitive, and completeness evidence; recommendation approval/completion tracking; persistent follow-up reminders; SQLite persistence.

**Not connected:** authentication, organization membership/session authorization, live AI-shopping platform APIs, automated prompt execution/collection, external product feeds, and calendar notifications/automated follow-up execution. Follow-up dates are stored as local reminders only. “External observation” means a user manually entered an observation from an external platform; AIShelf does not verify that platform or fetch its data. Recommendations use deterministic templates, not an LLM, and never publish changes.

This is a single local demo workspace, not a production multi-tenant deployment. Do not expose it publicly or store sensitive business/customer data until authentication and per-user organization authorization are integrated at every route.

## Checks

```bash
npm ci
npm run db:generate
npm run db:deploy
npm test
npm run typecheck
npm run lint
npm run build
```

GitHub Actions runs these checks for pushes and pull requests.
