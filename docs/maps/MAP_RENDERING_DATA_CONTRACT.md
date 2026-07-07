# Map Rendering Data Contract

This document defines the future rendering-data contract for town-package map
presentation in The Mind's Eye.

## Purpose

The project cannot treat the historical map, the building geometry, and the
building artwork as one blended asset.

The renderer must stay data-driven so that:

- towns remain package-based rather than hard-coded;
- historical uncertainty stays visible;
- building artwork can improve over time without breaking map logic;
- transparent-background assets can be swapped or upgraded safely;
- and teacher-visible provenance remains attached to what students see.

## Core Separation Rule

The rendering system must separate:

1. base map layer
2. road/rail layer
3. building footprint layer
4. building art layer
5. label layer
6. quest marker layer
7. evidence/provenance layer

These are related layers, but they are not the same kind of data.

## Why This Separation Matters

The historical record and the rendered scene are not identical.

Examples:

- a building footprint may be supported directly by the Sanborn sheet;
- a roof form may be inferred from map symbols;
- a facade drawing may be illustrative art used until stronger evidence exists;
- a quest marker may be temporary mission state rather than historical evidence;
- and a citation badge may be a teacher-facing overlay rather than part of the
  scene art.

If these concerns are mixed together, the map will overstate certainty and
become difficult to evolve across towns or later art revisions.

## Required Layer Purposes

### 1. Base Map Layer

Purpose:

- render the stitched or unstitched historical base surface;
- preserve map-sheet/source identity;
- and anchor all later visual layers.

Should store:

- `map_id`
- `source_ids`
- `time_window`
- `render_mode`
- `stitching_status`
- `georeferencing_status`

### 2. Road/Rail Layer

Purpose:

- render streets, rail corridors, depots, crossings, and related route
  geometry separately from the base layer.

Should store:

- stable route IDs
- geometry references
- line style or symbol style
- confidence/provenance fields
- related source IDs

### 3. Building Footprint Layer

Purpose:

- store the spatial building shape independent from decorative artwork.

Should store:

- `building_id`
- `location_id`
- `footprint_geometry`
- `sheet_id`
- `map_id`
- `source_ids`
- `geometry_basis`

### 4. Building Art Layer

Purpose:

- place transparent-background building visuals over reviewed footprints or
  reviewed location anchors.

Each building art record must reference a reviewed building/location record.

Minimum anchor rule:

- use `building_id` once reviewed building records exist;
- allow reviewed `location_id` as the MVP anchor before full building records
  are available;
- never allow free-floating art assets with no reviewed anchor.

Each building art record must store whether its visual details are:

- `verified`
- `inferred`
- `illustrative`

To preserve the repository's required historical taxonomy, each art record must
also carry a canonical historical basis field:

- `verified_fact`
- `source_based_inference`
- `fictional_gameplay`

Expected mapping:

- `verified` -> `verified_fact`
- `inferred` -> `source_based_inference`
- `illustrative` -> usually `fictional_gameplay` unless a narrower reviewed
  rule later defines a safer subtype

Minimum building art fields should include:

```json
{
  "building_art_id": "art_texarkana_1885_building_001_v1",
  "building_id": "building_texarkana_1885_001",
  "location_id": "loc_texarkana_1885_001",
  "asset_path": "assets/buildings/texarkana_1885/building_001.png",
  "transparent_background": true,
  "visual_detail_status": "verified | inferred | illustrative",
  "historical_basis": "verified_fact | source_based_inference | fictional_gameplay",
  "source_ids": ["source_001"],
  "review_status": "draft | reviewed | approved",
  "fallback_render_mode": "footprint_only | neutral_mass | hide_art",
  "notes": "Short explanation of what is known versus illustrative."
}
```

## Rule for Unknown Buildings

Unknown buildings must not receive overconfident art.

Allowed fallback behavior:

- footprint only;
- neutral roof or massing;
- generic exterior marker;
- or hidden art layer.

If the only verified statement is that a building existed at that location on
the Sanborn map, the renderer may still use generic art for visual coherence,
but it must not promote that generic art into a verified identity, owner,
business type, or interior.

Not allowed:

- detailed bespoke art presented as historically verified when the evidence is
  missing.

## 5. Label Layer

Purpose:

- render street labels, business labels, building numbers, and map text
  separately from geometry and art.

Should store:

- label ID
- target anchor ID
- label text
- label type
- display priority
- provenance fields

## 6. Quest Marker Layer

Purpose:

- render mission and classroom interaction markers without polluting the
  historical base map contract.

Should store:

- mission or clue anchor ID
- marker type
- display state
- student visibility
- teacher visibility

Quest markers are gameplay overlays, not historical evidence.

## Runtime Presence Beacon Rule

The student live map should also support runtime presence beacons for:

- the current player;
- classmates where allowed;
- allies;
- NPCs;
- enemies;
- and live event anchors.

These beacons should be rendered as dynamic overlays attached to reviewed
location anchors, route anchors, or event anchors.

They must remain separate from:

- historical source records;
- reviewed building identities;
- and permanent label or geometry layers.

Presence beacons may change minute by minute. Historical place records should
not.

## 7. Evidence/Provenance Layer

Purpose:

- render confidence indicators, evidence badges, teacher-review overlays, and
  provenance cues.

Should store:

- claim IDs
- source IDs
- confidence labels
- review status
- display mode by audience

## Authoritative Anchor Rule

Building artwork must never become the authoritative source of building
identity.

The authoritative chain should remain:

1. reviewed source record
2. reviewed building/location record
3. rendering-layer record
4. artwork asset reference

That order prevents visual polish from silently becoming historical evidence.

## Build-Order Rule

Before large-scale building artwork production begins, the repository should
define:

- the building-data contract;
- the map rendering data contract;
- provenance requirements for visual detail status;
- and fallback rules for unknown buildings.

Do not produce a large composited town map from artwork alone before those
contracts exist.
