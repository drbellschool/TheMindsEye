# Town Reconstruction Workflow

## Purpose

The Town Reconstruction Workflow is the shared operating model for the Community map, building, people, and source review surfaces.

The hierarchy is:

```text
Town Package -> Edition -> Sheet -> Map Piece / Block
```

Historical Map Studio establishes where source-map regions belong. Building Reconstruction will establish what structures existed. People & Activity will establish who lived, worked, or appeared there. Sources & Evidence establishes why the system believes each claim. The Story and Educational Game Engine must consume only reviewed reconstruction outputs and keep evidence classifications visible.

## Terms

- **Town Package**: the reusable town-scoped evidence package. Texarkana 1885 is the first package, not a hard-coded boundary.
- **Edition**: a dated Sanborn atlas or comparable historical map edition for a town package.
- **Town Index**: the edition index or key-map page that helps reviewers navigate non-sequential sheet coverage.
- **Sheet**: an uploaded archival Sanborn source image and its atlas-page assignment.
- **Map Piece / Block**: a manually drawn source polygon on a sheet. A piece may be a block, district, street segment, index region, or other map region.
- **Building Engine**: the future reconstruction surface for structures and footprints.
- **People Engine**: the future reconstruction surface for people, businesses, and activity.
- **Sources Engine**: the durable source identity, provenance, citation, and evidence-review surface.
- **Story / Educational Game Engine**: a later consumer of reviewed reconstruction data, not part of this workflow PR.

## Visible Workflow

Historical Map Studio now presents the reconstruction sequence:

1. Town & Edition
2. Source Record
3. Town Index
4. Sheet Inventory
5. Map Pieces / Blocks
6. Map Placement
7. Building Reconstruction
8. People & Activity
9. Evidence Review

Steps 1-6 remain operational inside Historical Map Studio. Steps 7-9 preserve the current Community routes and carry the same URL context into the existing Building Auditor, People Auditor, and Source Provenance Inspector.

## Shared Context

`ReconstructionContextBar` displays the active town, edition/year, sheet/page, map piece/block, overall progress, source information, and route tabs for Map, Buildings, People, and Sources.

Context is preserved with URL parameters. Existing short parameters are retained for compatibility:

```text
town, year, atlas, page, sheet, piece, workflow
```

Explicit aliases are also written:

```text
townPackageId, mapYear, atlasId, atlasPageId, sheetAssetId, mapPieceId, blockId
```

## Progress Formulas

Progress is derived from explicit work states, not stored as arbitrary percentages.

### Sheet Progress

Each sheet receives credit for:

- source record linked;
- image uploaded;
- at least one map piece identified;
- all identified pieces geographically placed;
- all identified pieces reviewed.

The displayed percent is the whole-number count of completed units divided by available units.

### Map Piece Progress

Each map piece receives credit for:

- source region defined;
- geographic placement saved;
- placement visible and operational;
- reviewed placement or reviewed inventory state.

Map pieces distinguish `not_started`, `in_progress`, `placed`, `reviewed`, `conflict`, and `missing`.

### Edition And Town Progress

Edition progress aggregates child sheet progress. Town progress aggregates the active edition, linked source records, placed map pieces, and unresolved calculated tasks. Counts remain visible next to any percentages.

## Work Queue

The Available Work panel is calculated from incomplete records. It is not an assignment or claiming system.

Example tasks:

- designate the Town Index page;
- add source records for sheets missing provenance;
- identify regions on a sheet;
- place an unplaced map piece;
- review a saved placement;
- prepare building or people review once those engines expand.

Completed placement work is removed from the queue automatically by the next calculation.

## Durable Source Identity

`source_records` remains the canonical source table.

Migration `0013_town_reconstruction_source_provenance.sql` adds `internal_source_id`, generated from the source row UUID by `public.format_mindseye_source_id(uuid)`. The visible format is:

```text
SRC-XXXXXXXXXXXX
```

This avoids a global sequence that could collide across environments. Child records link to `source_records.id`; citation text is generated from the source record rather than duplicated into every child.

Library of Congress Sanborn records are represented with repository, collection, external record ID, persistent URL, optional IIIF manifest URL, item title, rights, edition year, and sheet number. Library of Congress is supported as a repository, not hard-coded as the only source.

## Source Linkage

The durable source row is the stable parent for sheet and reconstruction evidence. A public URL can be corrected on one `source_records` row without rewriting every linked child.

Current and future source-aware children should link by foreign key where the schema supports it:

- Sanborn sheet assets;
- Sanborn atlas pages;
- Sanborn map pieces;
- buildings;
- businesses;
- people;
- claims and review events where relevant.

This PR adds the missing sheet/page/piece/building/person/business linkage fields without storing duplicate citation strings on every child record.

## Citation Strategy

The initial formatter is labeled `Standard historical citation`.

For Sanborn sheets, it favors:

```text
Sanborn Map Company. [title]. [year]. Sheet [number]. [collection], [repository]. [persistent URL]. Accessed [date].
```

Chicago, MLA, and APA variants can be added later without changing child records because children point to the durable source record.

## Engine Boundaries

This workflow does not add:

- automatic Sanborn index recognition;
- OCR;
- AI map interpretation;
- automatic building extraction;
- automatic people identification;
- educational gameplay;
- assignments, rewards, chat, or live collaboration.

Future engines should query the shared Town / Edition / Sheet / Map Piece context and must preserve source linkage, evidence classification, certainty, and review state.
