# Web App Read Me

## Scope

`apps/web` is the Next.js/Vercel Community surface for The Mind's Eye.

The public Community routes read from Supabase when configured and fall back to clearly labeled demo JSON when Supabase is unavailable. Historical Map Studio uses server routes for Sanborn uploads, sheet metadata, layout transforms, and georeferencing data without an owner-login screen in the current app.

This app still does not add teacher dashboards, student dashboards, gameplay, source ingestion, OCR, or full multi-user authentication.

## Run Locally

From `apps/web`:

```bash
npm install
npm run dev
```

## Build And Unit Test

From `apps/web`:

```bash
npm install
npm run test:unit
npm run build
```

## Routes

- `/community`
- `/community/historical-map-studio`
- `/community/map-auditor` redirects to `/community/historical-map-studio`
- `/community/building-auditor`
- `/community/people-auditor`
- `/community/source-provenance-inspector`
- `/community/release-gate`
- `/community/sources/[sourceId]`

## Environment

For public Community reads:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

For Historical Map Studio writes and signed private image delivery:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
SANBORN_MAX_UPLOAD_BYTES=26214400
```

Never expose the service-role key through `NEXT_PUBLIC_*`.

## Vercel Deployment

Import the GitHub repository:

```text
drbellschool/TheMindsEye
```

Use these Vercel settings:

- Root Directory: `apps/web`
- Framework Preset: `Next.js`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave blank / Next.js default
- Local dev command: `npm run dev`
- Local build check: `npm run build`

Add the environment variables listed above in Vercel Project Settings and redeploy.

## Deployment Checklist

- Supabase migrations `0001` through `0006` have been applied.
- `supabase/seed.sql` has been run if seed review data is desired.
- Private Storage bucket `sanborn-sheets` exists.
- Vercel has the public Supabase URL and publishable key.
- Vercel has server-only `SUPABASE_SERVICE_ROLE_KEY`.
- `/community` shows the correct data-source badge.
- `/community/historical-map-studio` opens without an owner-login screen.
- Uploaded Sanborn sheets display through signed URLs, not public bucket URLs.
- Layout drag, scale, rotate, skew, save, reload, georeference save, and overlay reload have been manually checked.
- Georeferencing mode can copy the local stitching layout into independent geographic sheet layers.
- Georeferencing `Edit historical sheets` mode can move, rotate, scale, skew, flip, hide, lock, reorder, save, and reload individual sheets over the modern basemap.
- Modern Overlay renders the saved independent geographic sheet layers.

## Public Review Routes

- `/community`
- `/community/historical-map-studio`
- `/community/map-auditor`
- `/community/building-auditor`
- `/community/people-auditor`
- `/community/source-provenance-inspector`
- `/community/release-gate`
