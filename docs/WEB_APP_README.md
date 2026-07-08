# Web App Read Me

## Scope

`apps/web` is the Next.js/Vercel foundation for the Community product surface of The Mind's Eye.

This app is demo-data only for the current milestone. It does not connect to Supabase, write to a database, or implement teacher/student/gameplay features.

## Run Locally

From `apps/web`:

```bash
npm install
npm run dev
```

## Build Check

From `apps/web`:

```bash
npm install
npm run build
```

## Routes

- `/community`
- `/community/map-auditor`
- `/community/building-auditor`
- `/community/people-auditor`
- `/community/source-provenance-inspector`
- `/community/release-gate`

## Data Rule

All pages read from the demo JSON source in `apps/web/lib/demo-data/` for this milestone.

## Deployment

The app is structured to deploy as a public Vercel preview once the repository is connected to Vercel.
