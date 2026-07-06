# The Mind's Eye Core Workstreams

This file exists because the project is larger than a generic software build. The Mind's Eye has several major workstreams that must stay visible for AI agents and human contributors.

## Workstream Rule

The project is not ready if it only has code architecture. It must also preserve the instructional model, the Sanborn/map reconstruction model, and the building-level historical evidence model.

The core product is:

> A town-package historical simulation engine where map accuracy, building evidence, instructional quality, and provenance all work together.

## 1. HQIM / Instructional Quality Workstream

Purpose: make the product classroom-worthy, not just entertaining.

This layer should define how missions become high-quality instructional materials.

Required concerns:

- standards alignment;
- grade-level appropriateness;
- lesson objective clarity;
- evidence-based student tasks;
- reading/writing/speaking/listening opportunities;
- academic vocabulary;
- accessibility supports;
- multilingual/EB supports;
- teacher facilitation notes;
- mastery demonstration;
- reflection and writing output;
- and clear separation between fun gameplay and actual learning evidence.

Agent rule:

> Do not generate missions as entertainment alone. Every mission must have an instructional purpose and a way for the teacher to see what students learned.

Future files may include:

```text
docs/instructional/HQIM_FRAMEWORK.md
docs/instructional/MISSION_LESSON_TEMPLATE.md
docs/instructional/TEACHER_REVIEW_RUBRIC.md
```

## 2. Sanborn Map Stitching Workstream

Purpose: convert Sanborn map sheets into a usable historical navigation layer.

This workstream is core to the product. Sanborn maps are not decoration.

Required concerns:

- identify all relevant Sanborn sheets for the target year;
- preserve original sheet metadata;
- align / stitch sheets into a usable map layer;
- handle sheet overlap and scale differences;
- preserve street names and block boundaries;
- assign stable map IDs;
- assign building/location IDs;
- keep source citations linked to each map region;
- and document uncertainty when alignment is approximate.

Agent rule:

> Do not treat the Sanborn map as a background image. It is the spatial evidence layer for movement, building lookup, and mission placement.

Future files may include:

```text
docs/maps/SANBORN_STITCHING_SPEC.md
data/towns/texarkana/maps/sheets/
data/towns/texarkana/maps/stitching_manifest.json
data/towns/texarkana/maps/control_points.json
```

## 3. Map-Building and Navigation Workstream

Purpose: turn stitched map evidence into an explorable town.

Required concerns:

- streets;
- intersections;
- blocks;
- sidewalks/paths where known;
- building footprints;
- location IDs;
- directionality;
- neighboring locations;
- distance estimates where appropriate;
- and classroom-friendly movement rules.

Example student action:

> I walk down Fifth Street past the livery.

The system should be able to resolve that action against the map layer and return historically constrained options.

Agent rule:

> Navigation should prefer uncertainty over hallucination. If the map cannot prove a path or location, the system must say so.

Future files may include:

```text
docs/maps/NAVIGATION_MODEL.md
data/towns/texarkana/streets.json
data/towns/texarkana/blocks.json
data/towns/texarkana/adjacency.json
```

## 4. Building Details and Reconstruction Workstream

Purpose: make each building historically inspectable.

Buildings are not just labels. Each building can become a learning node.

Required concerns:

- building ID;
- map sheet reference;
- street/block location;
- building type;
- construction material if shown;
- number of stories if shown;
- business label if shown;
- possible occupants;
- possible owners;
- related newspaper references;
- related directory records;
- related people/events;
- source confidence;
- and visible distinction between verified details and inferred details.

Agent rule:

> A building detail must never be upgraded from inferred to verified unless the source evidence supports it.

Future files may include:

```text
data/towns/texarkana/buildings.json
data/towns/texarkana/businesses.json
data/towns/texarkana/people.json
data/towns/texarkana/building_claims.json
```

## 5. Building Interior / Use Inference Workstream

Purpose: support cautious historical imagination without lying to students.

The user wants the game to suggest what may have been inside buildings, what kind of work happened there, and what people might have encountered.

This is allowed only when labeled properly.

Example:

- verified: Sanborn map labels a building as a livery.
- inference: a livery likely contained horses, tack, feed, wagons, and stable labor.
- fiction: a specific missing saddle or named stablehand is invented for the mission.

Agent rule:

> Interior details are usually source-based inference or fictional gameplay unless specifically verified by a source.

Future files may include:

```text
docs/history/BUILDING_INFERENCE_RULES.md
data/reference/historical_business_types.json
```

## 6. Historical Source Ingestion Workstream

Purpose: pull together the evidence base.

Sources may include:

- Sanborn maps;
- Portal to Texas History records;
- newspapers;
- city directories;
- census records;
- photos;
- county histories;
- Library of Congress materials;
- local archive records.

Required concerns:

- raw metadata;
- normalized records;
- rights/use notes;
- OCR quality notes;
- citation IDs;
- extracted claims;
- entity linking;
- and confidence scoring.

Agent rule:

> Keep raw source evidence separate from normalized game-ready records.

## 7. Citation / Evidence UI Workstream

Purpose: make evidence visible without overwhelming the game.

Required concerns:

- tiny citation icon;
- source inspection;
- stronger citation indicator when multiple sources support a claim;
- different visual treatment for inference;
- clear label for fictional gameplay;
- teacher-facing evidence panel;
- student-friendly citation view.

Agent rule:

> Evidence visibility is a product feature, not a footnote.

## 8. Mission / Story Workstream

Purpose: turn the evidence and map into student missions.

Required concerns:

- mission hook;
- student objective;
- source packet;
- NPC dialogue;
- clues;
- classroom discussion;
- writing/reflection;
- mastery output;
- and teacher notes.

Agent rule:

> Mission generation must use the building/map/source/provenance systems. It should not write free-floating historical fiction.

## Correct Build Sequence With These Workstreams Included

1. AI readiness contracts, schemas, CI, and agent rules.
2. Town-package loader.
3. Source manifest and provenance engine.
4. Sanborn sheet inventory and stitching specification.
5. Building/location ID model.
6. Initial Texarkana map/building sample dataset.
7. Building detail and inference rules.
8. HQIM/instructional framework.
9. One source-grounded mission seed.
10. Teacher review and citation display.
11. Student mission experience.
12. Second town package test.

## Immediate Correction

If an AI agent begins with generic gameplay, multiplayer, or broad platform features before Sanborn stitching, building details, and HQIM are represented, the agent is off-track.

The next agent work should include:

- `SANBORN_STITCHING_SPEC.md`;
- `BUILDING_DATA_MODEL.md`;
- `BUILDING_INFERENCE_RULES.md`;
- and `HQIM_FRAMEWORK.md`.
