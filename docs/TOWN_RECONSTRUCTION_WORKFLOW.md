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
- **Page Classification**: the authoritative type assigned to each uploaded Sanborn page. It controls which station tools apply.
- **Town Index**: the edition index or key-map page that helps reviewers navigate non-sequential sheet coverage.
- **Sheet**: an uploaded archival Sanborn source image and its atlas-page assignment.
- **Map Piece / Block**: a manually drawn source polygon on a sheet. A piece may be a block, district, street segment, index region, or other map region.
- **Building Engine**: the future reconstruction surface for structures and footprints.
- **People Engine**: the future reconstruction surface for people, businesses, and activity.
- **Sources Engine**: the durable source identity, provenance, citation, and evidence-review surface.
- **Story / Educational Game Engine**: a later consumer of reviewed reconstruction data, not part of this workflow PR.

## Historical Map Studio Stations

Historical Map Studio contains only the map-reconstruction stations:

1. Town & Edition
2. Source Record
3. Town Index
4. Sheet Inventory
5. Map Pieces
6. Map Placement

These stations are free navigation, not a rigid wizard. The left rail is station navigation only. Editing for the active station lives in the right inspector so the center workspace can remain the dominant map, index image, sheet inventory, or polygon editor.

Building Reconstruction, People & Activity, and Sources & Evidence remain separate Community routes reached from the shared context bar. They carry the same Town / Edition / Sheet / Map Piece context but do not appear as Historical Map Studio stations.

## Page Classification Workflow

Every imported Sanborn page should be classified once in the Source Record station before reconstruction tools are used. The canonical page types are:

- `cover`
- `sanborn_sheet`
- `index_or_mixed`
- `street_index`
- `special_sheet`
- `legend`
- `advertisement`
- `other`
- `unknown`

The visible UI uses plain labels such as Cover page, Index or mixed page, Sanborn Sheet, and Special Sheet / Inset. `unknown` pages generate work-queue tasks and cannot appear complete. Legacy values such as `graphic_index`, `specials_index`, `numbered_sheet`, and `inset` are normalized by migration `0016_functional_source_regions.sql`.

Page classification describes the broad page. Functional source regions describe useful areas inside the page:

- `town_coverage_diagram`
- `sheet_coverage_region`
- `printed_index`
- `geographic_map_content`
- `street_index_text`
- `block_index_text`
- `legend_key`
- `inset_map`
- `title_or_decoration`
- `notes`
- `other`

Workflow behavior is driven by both levels:

- Cover, legend, advertisement, street-index, other, and unknown pages are metadata/provenance pages unless functional regions make specific work available.
- Index or mixed pages use functional source regions. `sheet_coverage_region` entries feed Town Index, while `geographic_map_content` and `inset_map` entries can make Map Pieces available for that page.
- Sanborn Sheet and Special Sheet / Inset pages can use Map Pieces and Map Placement by default.
- Existing map pieces on a non-geographic page are flagged as classification conflicts. They are not deleted automatically; the repair path is to reclassify the page or archive invalid pieces in a later workflow.

The Source Record inspector is authoritative for page type, printed reference, display title, classification notes, primary Town Index designation, and functional source-region drawing. Only Index or mixed pages can be primary, and primary Town Index remains a separate explicit user action. The save RPC must not auto-designate the only eligible page.

## Shared Context

`ReconstructionContextBar` displays the active town, edition/year, sheet/page, map piece/block, overall progress, source information, and route tabs for Map, Buildings, People, and Sources.

Context is preserved with URL parameters. Existing short parameters are retained for compatibility:

```text
town, year, atlas, page, sheet, piece, workflow
```

Explicit aliases are also written:

```text
townPackageId, mapYear, atlasId, atlasPageId, sheetAssetId, mapPieceId, blockId, indexRegionId
```

## Town Index Mission Map

The Town Index station is the edition-level workload map. Reviewers classify a source page as Index or mixed, explicitly set it as the primary Town Index, and mark functional source regions in Source Record. Town Index then reads saved `sheet_coverage_region` polygons from that page instead of requiring duplicate drawing. Each sheet-coverage region is labeled with a printed sheet reference and linked to the corresponding atlas page or Sanborn sheet asset when known. The original source image remains the evidence source; no derivative image becomes the source of truth.

Functional source regions are stored in `public.sanborn_source_regions` by migration `0016_functional_source_regions.sql`. Migration `0016` links existing `public.sanborn_town_index_regions` rows into source regions as `sheet_coverage_region` records where appropriate so earlier polygons are preserved. Regions validate normalized `0..1` polygons with at least three points, finite coordinates, nonzero area, and no self-intersection where practical. Server routes save and delete regions through service-role-only RPCs that validate town, atlas, page, and sheet scope before writing.

Region statuses are:

- `missing`: the index references a sheet or area that is unavailable.
- `not_started`: the region exists but linked sheet work has not begun.
- `started`: linked sheet or piece work exists but placement/review is incomplete.
- `placed`: required map pieces for the region are geographically placed.
- `reviewed`: the linked region or sheet work has been reviewed.
- `conflict`: links, geometry, duplicate references, or evidence need resolution.

Clicking a linked index region selects the linked sheet/page, keeps the town and edition context, updates URL parameters, and moves the workspace to Sheet Inventory or Map Pieces. Returning to Town Index preserves the selected region through `indexRegionId`.

If no primary Town Index is designated, Town Index shows a repair state with eligible uploaded pages. Reviewers can select a page, classify it as Index or mixed, and explicitly set it as primary without leaving the station.

## Progress Formulas

Progress is derived from explicit work states, not stored as arbitrary percentages.

### Sheet Progress

Each sheet receives credit for:

- image uploaded;
- source record linked;
- page classified;
- printed reference assigned when required;
- workflow relationship valid for its page type;
- at least one map piece identified;
- all identified pieces geographically placed;
- all identified pieces reviewed.

The displayed percent is the whole-number count of completed units divided by available units. Non-geographic classified pages can complete their sheet-inventory work through source/provenance metadata. Geographic pages cannot complete until their map-piece and placement work is complete. A classification conflict prevents the page from being treated as complete.

### Map Piece Progress

Each map piece receives credit for:

- source region defined;
- geographic placement saved;
- placement visible and operational;
- reviewed placement or reviewed inventory state.

Map pieces distinguish `not_started`, `in_progress`, `placed`, `reviewed`, `conflict`, and `missing`.

### Edition And Town Progress

Edition progress aggregates child sheet progress. Town progress aggregates the active edition, linked source records, placed map pieces, and unresolved calculated tasks. Counts remain visible next to any percentages.

### Town Index Region Progress

Index-region progress uses milestones rather than false precision:

- region polygon defined: 15%;
- sheet or page linked: 30%;
- source sheet available: 40%;
- map-piece inventory created: 60%;
- all linked page pieces placed: 90%;
- reviewed: 100%.

`missing` regions count as 0% and remain visible. `conflict` regions remain incomplete until the conflict is cleared. Edition-wide Town Index completion averages durable sheet-coverage region progress only. Printed-index, title, legend, and other contextual source regions remain visible where useful but do not count as incomplete sheet-link work.

## Work Queue

The Available Work panel is calculated from incomplete records. It is not an assignment or claiming system.

Example tasks:

- classify uploaded pages;
- select a primary Town Index page;
- classify functional regions on the index page;
- mark the town coverage diagram;
- mark printed index areas;
- resolve map pieces created on non-geographic pages;
- add printed sheet references;
- link or resolve sheet-coverage regions;
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
