# Supabase Setup

## Scope

This milestone adds a read-first Supabase foundation for the Community surface in `apps/web`.

The Map Auditor also includes a narrow Sanborn Sheet Intake workflow for uploading original Sanborn sheet images to Supabase Storage and saving intake metadata.

It does not add:

- authentication UI;
- broad historical review writes;
- teacher or student dashboards;
- gameplay;
- or browser-exposed secret keys.

`/community` attempts to read from Supabase when the public env vars are present. If the env vars are missing, the tables are not created yet, or the query fails, the page falls back to the existing demo JSON.

`/community/map-auditor` shows the Sanborn Sheet Intake workspace. If the Storage bucket, metadata table, or server-only upload configuration is missing, the workspace renders in clearly labeled demo/read-only mode and does not pretend files were stored.

## Environment

Create `apps/web/.env.local` from `apps/web/.env.example` and provide the public values for Community reads:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

For Sanborn Sheet Intake uploads only, the server route also needs server-only values:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
SANBORN_INTAKE_TOKEN=choose-a-temporary-upload-token
SANBORN_MAX_UPLOAD_BYTES=26214400
```

Do not expose the service-role key as `NEXT_PUBLIC_*`. Do not commit `.env.local`. The service-role key is used only by the server-side upload route so the browser never receives privileged Supabase credentials.

## Create The Supabase Project

1. Open https://supabase.com/ and create a new project.
2. Choose the organization, project name, database password, and region.
3. Wait for the project to finish provisioning.

## Find The Project URL And Publishable Key

In the Supabase dashboard:

1. Open your project.
2. Go to `Project Settings`.
3. Open `API`.
4. Copy:
   - `Project URL`
   - `Publishable key`

Use those values in `apps/web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

These two public values are the only Supabase values that browser code should use.

## Database Files

- Migration: `supabase/migrations/0001_initial_community_schema.sql`
- Sanborn Storage and metadata migration: `supabase/migrations/0002_sanborn_sheet_assets.sql`
- Seed: `supabase/seed.sql`

The schema covers the current Community review foundation:

- `town_packages`
- `source_records`
- `locations`
- `claims`
- `buildings`
- `people`
- `businesses`
- `review_events`
- `map_layers`
- `asset_requests`

No record is verified by default. Review status and certainty fields stay explicit across the schema.

The Sanborn migration adds:

- private Supabase Storage bucket: `sanborn-sheets`;
- metadata table: `sanborn_sheet_assets`;
- original filename, controlled storage path, MIME type, file size, image dimensions, SHA-256 checksum, source metadata, intake notes, evidence classification, and review status;
- default `unknown` evidence classification and `unknown` review status for new uploads;
- a per-town checksum uniqueness guard to prevent duplicate original image storage.

## Local Workflow

From the repository root:

```bash
cd apps/web
npm install
npm run build
```

Validation commands from the repository root:

```bash
python scripts/validate_mindseye.py
python -m unittest discover -s tests -p 'test_*.py'
```

## Apply The Schema In Supabase SQL Editor

1. Open your Supabase project.
2. Go to `SQL Editor`.
3. Create a new query.
4. Paste the contents of `supabase/migrations/0001_initial_community_schema.sql`.
5. Run the query.

The migration creates the initial Community read model with:

- explicit certainty fields;
- explicit review status fields;
- `review_events` history that preserves who changed what, when, and from which status to which status;
- and `asset_requests` defaulting to `illustrative` until reviewed later.

## Apply The Sanborn Intake Migration

After the initial schema is applied:

1. Open your Supabase project.
2. Go to `SQL Editor`.
3. Create a new query.
4. Paste the contents of `supabase/migrations/0002_sanborn_sheet_assets.sql`.
5. Run the query.

This creates the private `sanborn-sheets` Storage bucket and the `sanborn_sheet_assets` metadata table.

The bucket should remain private or otherwise access-controlled. The current app uploads through a server-side route and does not expose service-role credentials to the browser.

## Seed The Community Records

After the schema migration runs:

1. Stay in `SQL Editor`.
2. Create another new query.
3. Paste the contents of `supabase/seed.sql`.
4. Run the query.

This inserts a small review-bound Texarkana seed set for the Community dashboard.

## Optional CLI Workflow

If you are using the Supabase CLI locally instead of the SQL Editor:

```bash
supabase db reset
```

That applies the migration and seed files in the repository's `supabase/` directory.

If you are applying the schema to a linked remote project, use your normal reviewed migration flow and then apply `supabase/seed.sql` separately if you want the sample Community records.

## Add The Same Env Vars In Vercel

In Vercel:

1. Open the `TheMindsEye` project.
2. Go to `Project Settings`.
3. Open `Environment Variables`.
4. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SANBORN_INTAKE_TOKEN`
   - `SANBORN_MAX_UPLOAD_BYTES`
5. Use the same public values from the Supabase `Project Settings > API` page and the server-only service-role key from the same settings area.
6. Redeploy after saving the variables.

The current milestone should still work without those variables because `/community` falls back to demo JSON when Supabase is unavailable.

Only the two `NEXT_PUBLIC_*` values are browser-safe. The service-role key and Sanborn intake token must be server-only Vercel environment variables.

## Sanborn Upload Review Steps

1. Open `/community/map-auditor`.
2. Confirm the Community shell still shows `Data source: Supabase` or `Data source: Demo fallback`.
3. Confirm the `Sanborn Sheet Intake` panel shows either `Storage writes enabled` or a clear demo/read-only warning.
4. Select or drag multiple PNG, JPEG, or WebP Sanborn sheet images.
5. Review the thumbnail, original filename, file size, dimensions, checksum, sheet number, source association, source URL, archive name, rights note, and notes.
6. Keep evidence classification and review status at `unknown`.
7. Enter the temporary Sanborn intake token if writes are enabled.
8. Save the ready sheets.
9. Verify duplicate checksums and duplicate sheet numbers are blocked before accidental duplicate storage.
