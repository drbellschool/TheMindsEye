# Sanborn Stitching and Georeferencing

This document defines the prep-only workspace for the Texarkana 1885 Sanborn
map. It is intentionally narrower than final georeferencing.

## Purpose

The project needs a reviewable path for:

- sheet stitching prep;
- local alignment;
- control-point collection;
- sheet transform planning;
- and explicit georeferencing blockers.

The current workspace is not a final stitched map. It is a foundation for
review and later alignment work.

## Source Inputs

The workspace reads from committed, source-bound files:

- `data/towns/texarkana/sanborn_1885_sheet_manifest.json`
- `data/towns/texarkana/sanborn_1885_asset_manifest.json`
- `data/towns/texarkana/sanborn_1885_image_metadata.json`
- `data/towns/texarkana/sanborn_1885_sheet_review.json`
- `data/towns/texarkana/sanborn_1885_stitching_manifest.json`
- `data/towns/texarkana/sanborn_1885_control_points.json`
- `data/towns/texarkana/sanborn_1885_sheet_transforms.json`
- `data/towns/texarkana/sanborn_1885_layer_stack.json`

## Local Coordinate Rule

If true lat/lon georeferencing is not yet available, the workspace must use a
local coordinate system first.

Rules:

- local coordinates are provisional;
- local alignment is not final georeferencing;
- no local transform should be promoted to verified map truth;
- and no control point may be auto-approved.

The local coordinate system exists only to keep sheet order, adjacency, and
workspace alignment visible during review.

## Control Points

Control points are the first evidence-bearing alignment layer.

Required behavior:

- store sheet-linked control points in a dedicated manifest;
- label each control point as candidate, pending review, or missing;
- keep missing control points visible as warnings;
- and do not fill gaps with invented coordinates.

Each sheet must show a clear control-point status:

- `missing_control_points`
- `local_anchor_only`
- `candidate_alignment`
- or another explicit prep status that does not imply final georeferencing.

## Sheet Transforms

Sheet transforms record how a sheet would align inside a local coordinate
system.

Required behavior:

- one transform record per sheet;
- explicit transform status per sheet;
- candidate neighbor references when known;
- warnings for missing control points;
- and a note when a sheet is only a local anchor.

Allowed transform statuses in this workspace:

- `missing_control_points`
- `local_anchor_only`
- `partial`
- `prep_only`

## Layer Stack

The workspace must keep the seven rendering layers separate:

1. base map layer
2. road/rail layer
3. building footprint layer
4. building art layer
5. label layer
6. quest marker layer
7. evidence/provenance layer

The layer stack is a review contract, not a rendering shortcut.

## Texture Requirements

The UI shell and map auditor should use controlled textures, not flat generic
chrome.

Required texture directions:

- parchment background texture for light review surfaces;
- dark panel background texture for shell surfaces;
- aged border treatment for brass or gold edges;
- subtle map-paper grain for the stitched map surface;
- and transparent checker or wash cues for art previews.

These textures are for review clarity only. They do not imply historical
certainty.

## Asset Layer Requirements

The workspace must keep asset responsibilities separate:

- base map layers hold scan identity and source metadata;
- road/rail layers hold route geometry only when it is actually extracted;
- building footprint layers hold shape, not decoration;
- building art layers hold transparent-background art only when anchored to a
  reviewed building or reviewed location record;
- label layers hold text and provenance separate from geometry;
- quest marker layers hold runtime gameplay overlays only;
- and evidence/provenance layers hold citations, review state, and confidence
  cues.

Building art records must label visual detail as one of:

- `verified`
- `inferred`
- `illustrative`

Unknown buildings may still use neutral or generic fallback art, but that art
must never be treated as verified identity.

## Review States

Use these review states explicitly:

- `verified`
- `inferred`
- `illustrative`
- `unknown`
- `rejected`

These labels are review states, not hidden assumptions.

## Composite Manifest

The composite map manifest is the derived prep summary that combines:

- the stitching manifest;
- the control point manifest;
- the sheet transform manifest;
- and the layer stack manifest.

It must provide:

- a clear status for each sheet;
- warnings for missing control points;
- a release-gate summary;
- and a statement that local alignment is not final georeferencing.

## Release Gate Blockers

The release gate must stay blocked when any of the following remain true:

- control points are missing for one or more sheets;
- local alignment is still provisional;
- georeferencing is still deferred;
- or the map layer cannot yet be trusted for classroom release.

The release gate should explain blockers, not hide them.

## What Must Not Be Built Yet

Do not:

- auto-approve extracted locations;
- generate final stitched imagery;
- pretend the local coordinate system is final georeferencing;
- auto-create building claims from the map;
- generate illustrated assets for buildings yet;
- or merge map review, building review, and gameplay state into one object.

The workspace is for review, not for overpromising certainty.
