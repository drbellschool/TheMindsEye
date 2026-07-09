# Next.js / Vercel Migration Plan

## Purpose

This document defines the migration path for The Mind's Eye from the current Python prototype to a Next.js application deployed on Vercel.

It does **not** delete the Python prototype, rebuild all features, or add teacher/student dashboards yet. The current Python system remains the working source for historical processing, validation, and local data workflows until each migration milestone is complete.

## Migration Principle

Migrate the user-facing Community product first.

Keep the data and evidence pipeline conservative.

Move UI surfaces only when the new surface can preserve:

- route-based navigation;
- provenance labels;
- review state;
- town-package driven data;
- and read-only safety during early phases.

## Proposed Monorepo Shape

```text
TheMindsEye/
  apps/
    web/
  packages/
    core/
    db/
    schemas/
  data/
  scripts/
  src/
  docs/
  tests/
```

### Package Roles

- `apps/web` is the Next.js application for the community product surface.
- `packages/core` holds shared domain types, route metadata, review-state constants, and UI/view-model contracts.
- `packages/db` holds the Postgres access layer, migrations, and query helpers.
- `packages/schemas` holds shared JSON Schema or validation definitions for town data and review records.
- `data` remains the repository for town packages, raw inputs, normalized outputs, and demo fixtures during migration.
- `scripts` remains the home for validation, import/export, and maintenance scripts.
- `src` remains the Python prototype until the migration proves parity.

## What Stays in Python

The Python prototype should remain authoritative for:

- Sanborn processing;
- Texas Portal ingestion;
- validation scripts;
- local data import/export;
- and any existing CLI or file-based review utilities.

Keep Python in place while `apps/web` is being built. Do not force a cutover before the new web app can read the same community data safely.

## What Moves to Next.js

The Next.js app should own the community-facing product routes:

- Community Dashboard;
- Map Auditor;
- Building Auditor;
- People Auditor;
- Source / Provenance Inspector;
- Release Gate.

The Next.js app should be route-based, mockup-faithful, and read-only first.

## Recommended Infrastructure

- Database: Postgres through Neon or Supabase.
- File storage: Vercel Blob or compatible object storage.
- Deployment: Vercel preview deployments from GitHub PRs, with production deployments from the main branch.

Use portable SQL and keep the database layer thin so the application is not locked into one provider's application-specific abstractions.

## Environment Variables To Plan For Later

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_TOWN_SLUG`
- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `BLOB_READ_WRITE_TOKEN`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `MINDSEYE_DATA_ROOT`
- `TEXAS_PORTAL_API_BASE_URL`
- `TEXAS_PORTAL_API_KEY`

Only expose `NEXT_PUBLIC_*` values that are safe for the browser.

## Migration Milestones

### 1. Create `apps/web` with demo-only community routes

Build `apps/web` as a Next.js app with static, mockup-faithful Community routes using demo JSON only.

Exit criteria:

- the Community routes render;
- the visual shell matches the mockup direction;
- the app does not depend on the Python runtime for page rendering;
- and demo values are isolated from production data paths.

### 2. Connect `apps/web` to town package JSON

Wire the Next.js app to the repo's town package JSON and validation-friendly data files.

Exit criteria:

- route content comes from town package JSON instead of hardcoded demo fixtures;
- community counts and status panels reflect repository data;
- and the pages remain read-only.

### 3. Connect `apps/web` to Postgres

Move the review state and community records that need persistence into Postgres.

Exit criteria:

- the app can read review records from the database;
- the app can write through a controlled server-side data layer;
- and JSON import/export still works for local development and recovery.

### 4. Add authenticated community review writes

Enable authenticated writes for community review workflows.

Exit criteria:

- users can record review actions safely;
- review history is auditable;
- provenance remains visible;
- and teacher/student dashboards are still out of scope until their own migration plan exists.

## Recommended Build Order Inside `apps/web`

- Community Dashboard first.
- Map Auditor second.
- Building Auditor third.
- People Auditor fourth.
- Source / Provenance Inspector fifth.
- Release Gate sixth.

That order follows the current community-first product boundary and keeps the release-gate logic upstream of classroom features.

## Non-Goals For This Migration

- Do not delete the Python prototype.
- Do not rebuild teacher or student dashboards yet.
- Do not add gameplay.
- Do not add roster, grading, or classroom features.
- Do not move every historical processor into Next.js at once.

## Operating Rule

The migration is successful only when the Next.js surface can stand on its own for the Community product while the Python prototype continues to validate and support the historical pipeline behind it.

