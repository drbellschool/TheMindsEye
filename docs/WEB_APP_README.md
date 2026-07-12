# Web App Read Me

## Scope

`apps/web` is the Next.js/Vercel foundation for the Community product surface of The Mind's Eye.

This app is demo-data only for the current milestone. It does not connect to Supabase, write to a database, or implement teacher/student/gameplay features.

## Local Dev Command

From the repository root:

```bash
cd apps/web
npm install
npm run dev
```

## Local Build Check

From the repository root:

```bash
cd apps/web
npm install
npm run build
```

## Vercel Deployment Instructions

Use these exact Vercel project settings:

- Import GitHub repo: `drbellschool/TheMindsEye`
- Root Directory: `apps/web`
- Framework Preset: `Next.js`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave blank and use the Next.js default

## Deployment Checklist

- Confirm the Vercel project imports `drbellschool/TheMindsEye`.
- Confirm the Root Directory is `apps/web`.
- Confirm the Framework Preset is `Next.js`.
- Confirm the Install Command is `npm install`.
- Confirm the Build Command is `npm run build`.
- Confirm the Output Directory is blank and left at the Next.js default.
- Confirm the local dev command is `npm run dev`.
- Confirm the local build check is `npm run build`.
- Run `cd apps/web`.
- Run `npm install`.
- Run `npm run build`.

## Public Review Route Checklist

- `/community`
- `/community/map-auditor`
- `/community/building-auditor`
- `/community/people-auditor`
- `/community/source-provenance-inspector`
- `/community/release-gate`

## Data Rule

All pages read from the demo JSON source in `apps/web/lib/demo-data/` for this milestone.
