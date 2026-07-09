# Supabase Setup

## Scope

This milestone adds a read-first Supabase foundation for the Community surface in `apps/web`.

It does not add:

- authentication UI;
- review writes;
- teacher or student dashboards;
- gameplay;
- or browser-exposed secret keys.

`/community` attempts to read from Supabase when the public env vars are present. If the env vars are missing, the tables are not created yet, or the query fails, the page falls back to the existing demo JSON.

## Environment

Create `apps/web/.env.local` from `apps/web/.env.example` and provide only the public values:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Do not place a service-role key in `apps/web`. The current web app should use only the public browser-safe key.

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

These are the only Supabase values the current Community app should use.

## Database Files

- Migration: `supabase/migrations/0001_initial_community_schema.sql`
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
5. Use the same values from the Supabase `Project Settings > API` page.
6. Redeploy after saving the variables.

The current milestone should still work without those variables because `/community` falls back to demo JSON when Supabase is unavailable.
