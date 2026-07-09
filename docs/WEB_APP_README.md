# Web App Read Me

## Scope

`apps/web` is the Next.js/Vercel foundation for the Community product surface of The Mind's Eye.

This app is demo-data only for the current milestone. It does not connect to Supabase, write to a database, or implement teacher/student/gameplay features.

## Run Locally

From the repository root:

```bash
cd apps/web
npm install
npm run dev
```

## Build Check

From the repository root:

```bash
cd apps/web
npm install
npm run build
```

## Public Review Routes

- `/community`
- `/community/map-auditor`
- `/community/building-auditor`
- `/community/people-auditor`
- `/community/source-provenance-inspector`
- `/community/release-gate`

## Data Rule

All pages read from the demo JSON source in `apps/web/lib/demo-data/` for this milestone.

## Vercel Deployment

Use these exact Vercel project settings:

- Import GitHub repo: `drbellschool/TheMindsEye`
- Root Directory: `apps/web`
- Framework: `Next.js`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave blank and use the Next.js default
- Local dev command: `npm run dev`

## Deployment Checklist

- Confirm the Vercel project imports `drbellschool/TheMindsEye`.
- Confirm the Root Directory is `apps/web`.
- Confirm the Output Directory is blank and left at the Next.js default.
- Run `cd apps/web`, `npm install`, and `npm run build` before opening or updating the PR.
- Open the preview deployment and verify all public review routes load:
  - `/community`
  - `/community/map-auditor`
  - `/community/building-auditor`
  - `/community/people-auditor`
  - `/community/source-provenance-inspector`
  - `/community/release-gate`
