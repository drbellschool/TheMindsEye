# Sanborn Stitching Specification

This document defines the stitching-prep contract for the Texarkana 1885
Library of Congress Sanborn sheets.

## Purpose

The project now has:

- a verified LOC sheet manifest;
- an asset acquisition manifest;
- validated local image metadata;
- and initial human sheet review notes.

The next step is not full stitching or georeferencing. The next step is a
reviewable planning layer that records how stitching should later proceed
without pretending that reconstruction is already complete.

## Current Boundary

This specification supports:

- sheet order planning;
- anchor-sheet selection;
- candidate sheet-to-sheet links;
- deferred work lists per sheet;
- and explicit stitching blockers.

This specification does **not** support:

- stitched imagery;
- georeferenced coordinates;
- building footprints;
- normalized addresses;
- location IDs derived from stitching;
- or historical claims derived from cross-sheet alignment.

Any later geometry or claim produced from stitched sheets must remain
`source_based_inference` until reviewed against the source evidence.

## Source Inputs

The stitching-prep layer depends on these committed manifests:

- `data/towns/texarkana/sanborn_1885_sheet_manifest.json`
- `data/towns/texarkana/sanborn_1885_asset_manifest.json`
- `data/towns/texarkana/sanborn_1885_image_metadata.json`
- `data/towns/texarkana/sanborn_1885_sheet_review.json`

The planning layer may also rely on ignored local image files under:

```text
data/towns/texarkana/local_cache/sanborn_1885/
```

## Required Stitching-Prep Outputs

The stitching prep manifest must record:

- a stable manifest ID;
- referenced source, map, sheet, asset, image metadata, and review manifest IDs;
- one anchor sheet candidate;
- one sheet plan per reviewed sheet;
- candidate neighboring sheets;
- evidence notes for each planned cross-sheet link;
- stitching status;
- control-point status;
- georeferencing status;
- location-extraction status;
- claim-generation status;
- and explicit blocking tasks.

## Status Rules

Allowed early-status expectations for the current Texarkana branch:

- `stitching_status`: `prep_only`
- `control_point_status`: `not_started`
- `georeferencing_status`: `deferred`
- `location_extraction_status`: `deferred`
- `claim_generation_status`: `deferred`

No committed stitching-prep file should imply that:

- sheets are already aligned;
- control points are already collected;
- downtown geometry is verified;
- or any stitched output is classroom-ready.

## Anchor-Sheet Rule

The chosen anchor sheet should be the sheet that currently gives the best
central commercial reference for later alignment, not necessarily the first
sheet in numeric order.

For the current Texarkana 1885 review, the best anchor candidate is the
downtown commercial corridor sheet because it contains the densest cross-sheet
evidence and the clearest business frontage for later alignment work.

## Candidate Link Rule

Candidate links may be recorded only when they are supported by:

- an index relationship visible on the source;
- an explicit cross-sheet direction note;
- a clearly shared corridor or frontage visible in review notes;
- or a later documented human review decision.

Candidate links are planning data only. They are not proof of exact geometry.

## Future Follow-On Files

When the project is ready, later files may include:

```text
data/towns/texarkana/maps/control_points.json
data/towns/texarkana/maps/stitching_outputs/
docs/maps/NAVIGATION_MODEL.md
```

Those later files must preserve the fact / inference / fiction boundary and
must not silently upgrade stitching assumptions into verified map facts.
