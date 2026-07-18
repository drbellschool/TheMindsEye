# Web App Read Me

## Scope

`apps/web` is the Next.js/Vercel Community surface for The Mind's Eye.

The public Community routes read from Supabase when configured and fall back to clearly labeled demo JSON when Supabase is unavailable. Historical Map Studio uses server routes for Sanborn uploads, sheet metadata, layout transforms, atlas/page/piece inventory, map-piece placement, source-record creation, and georeferencing data without an owner-login screen in the current app.

This app still does not add teacher dashboards, student dashboards, gameplay, automated source ingestion, OCR, AI map interpretation, or full multi-user authentication.

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

- Supabase migrations `0001` through `0015` have been applied.
- `supabase/seed.sql` has been run if seed review data is desired.
- Private Storage bucket `sanborn-sheets` exists.
- Vercel has the public Supabase URL and publishable key.
- Vercel has server-only `SUPABASE_SERVICE_ROLE_KEY`.
- `/community` shows the correct data-source badge.
- `/community/historical-map-studio` opens without an owner-login screen.
- Uploaded Sanborn sheets display through signed URLs, not public bucket URLs.
- Layout drag, scale, rotate, skew, save, reload, georeference save, and overlay reload have been manually checked.
- Georeference Sheets opens as the default Historical Map Studio workflow.
- Historical Map Studio shows the Town Reconstruction context header with town, edition, sheet, block/piece, progress, Source Info, and Map/Buildings/People/Sources tabs.
- Source Info shows durable source identity and can create a Library of Congress source record when migration `0013` is present.
- The Historical Map Studio station rail contains only Town & Edition, Source Record, Town Index, Sheet Inventory, Map Pieces, and Map Placement.
- The Town Index mission map can save, reload, relink, and delete durable regions when migration `0014` is present.
- Source Record classifies the selected uploaded page, saves printed references and display titles, and lets reviewers mark functional source regions directly on the page.
- An Index or mixed page can be explicitly set as the primary Town Index; Town Index shows a repair flow when no primary Town Index is designated.
- Town Index reuses saved sheet-coverage source regions instead of asking reviewers to redraw the same polygons.
- Cover, street-index, legend, advertisement, other, and unknown pages block Map Pieces and Map Placement unless a saved geographic source region makes that work available, with explanatory text instead of exposing the wrong editing tools.
- The Town Index, Sheet Inventory, Map Pieces, and Map Placement stations preserve atlas/page/piece/index-region selection through URL context.
- Unplaced Sanborn sheets can be added directly to the modern map without using the optional prep canvas.
- Georeference Sheets `Edit historical sheets` mode can move, corner-warp, rotate, scale, skew, flip, hide, lock, reorder, save, and reload individual sheets over the modern basemap.
- Modern Overlay renders the saved independent geographic sheet layers.
- Historical Map Studio opens near the town-package center; Texarkana 1885 should resolve near `33.425, -94.047`, not `0,0`.
- Selected Sanborn sheets show signed image load diagnostics and can be dragged by the image body in `Edit Sheet` mode.
- Map Placement displays all visible saved placed map pieces for the active atlas, while saving remains scoped to the selected piece.

## Public Review Routes

- `/community`
- `/community/historical-map-studio`
- `/community/map-auditor`
- `/community/building-auditor`
- `/community/people-auditor`
- `/community/source-provenance-inspector`
- `/community/release-gate`
