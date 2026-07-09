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

## Applying The Schema

If you are using the Supabase CLI locally:

```bash
supabase db reset
```

That applies the migration and seed files in the repository's `supabase/` directory.

If you are applying the schema to a linked remote project, use your normal reviewed migration flow and then apply `supabase/seed.sql` separately if you want the sample Community records.
