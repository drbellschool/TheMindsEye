# Community Product Spec

## Status

This document is the authoritative UI and product contract for the community-first slice of The Mind's Eye.

The current local web view is a temporary debug/prototype surface. It is useful for inspection and validation, but it is not the intended product UI.

The community mockups are the visual target:

- `communitydashboard.png`
- `map auditor.png`
- `building map.png`
- `people auditor.png`

If the debug view and the mockups conflict, the mockups win for layout and visual direction. If the broader product docs conflict, the product boundary in this file wins for the community slice.

## 1. Product Scope

The community product is the first operational product surface for The Mind's Eye.

It exists to help a community team review town history, verify map-linked evidence, resolve identities, and decide when a town package is ready to move forward.

This spec deliberately defers:

- teacher dashboards;
- student dashboards;
- academics and standards workflows;
- roster management;
- grades;
- classroom play;
- mission delivery;
- multiplayer;
- broad AI generation;
- and district deployment.

Texarkana 1885 remains the first town package, but the community product must remain reusable for future towns.

## 2. Product Rules

The community product must be:

- town-package driven, not Texarkana-hardcoded;
- route-based, not a single monolithic page;
- provenance-first;
- review-first;
- visually readable on dark and light background shells;
- explicit about uncertainty;
- and usable before any classroom release exists.

The community product is allowed to sit upstream of teacher and student products, but it must not depend on them.

## 3. Community Route Map

The community product consists of these routes:

1. Community Dashboard / Community Verification Console
2. Map Auditor
3. Building Auditor
4. People Auditor
5. Source / Provenance Inspector
6. Release Gate Report

Route delivery may be implemented as separate HTML pages, server routes, or route-specific templates. The product target is route-based delivery, not one long debug page.

The current local composite page may remain as an internal diagnostic tool, but it is not the product target.

## 4. Visual Direction

The visual language is a dark historical brass/parchment interface.

Required style cues:

- dark outer shell;
- parchment or cream inner surfaces;
- brass, ink, and ledger accents;
- framed cards with visible borders;
- paper grain, fold marks, and scan texture;
- sepia and charcoal map surfaces;
- and a controlled use of red/amber/green for status.

Avoid:

- flat white app shells;
- generic SaaS spacing;
- neon colors;
- purple-heavy defaults;
- unframed content blocks;
- or panels that look like plain documentation.

Mockup intent:

- `communitydashboard.png` is the community hub model.
- `map auditor.png` is the map-stitching and georeference model.
- `building map.png` is the building-handoff and layered map model.
- `people auditor.png` is the person/business review model.

## 5. Shared Layout Contract

All community routes should reuse a shared page shell:

- route title and breadcrumb or back link;
- town/dataset summary;
- year gate or scope gate;
- status chips or summary chips;
- main workspace region;
- side inspector region;
- bottom history or blocker rail;
- and a clear action area.

The mockups show that the product should feel like a serious review console, not a game menu.

## 6. Shared Review States

The community product needs two separate state systems.

### 6.1 Workflow states

These describe the review process.

- `suggested` - a candidate exists but has not been triaged.
- `under_review` - a human is actively reviewing it.
- `confirmed` - a human accepted it into the reviewed set.
- `rejected` - a human rejected it.
- `insufficient_evidence` - the record cannot be promoted yet.

### 6.2 Evidence labels

These describe the historical certainty of a record or detail.

- `verified_fact` - directly supported by source evidence.
- `source_based_inference` - a reasonable historical interpretation, still anchored to sources.
- `illustrative` - visually useful or explanatory, but not evidence-verified.
- `unknown` - evidence is missing or too thin to fill the field.
- `rejected` - reviewed and not accepted as a valid historical claim or detail.

UI rule:

- verified should look solid and stable;
- inferred should look supported but distinct from verified;
- illustrative should look intentionally provisional;
- unknown should remain visibly blank or muted;
- and rejected should remain visible in history without becoming active product truth.

## 7. Source and Provenance Rules

The community product must preserve a visible trail from source to claim to review decision.

Required rules:

- raw source records stay separate from normalized records;
- every normalized record must preserve source IDs, citation text, and rights or access notes;
- OCR text is an aid, not the canonical source of truth;
- candidate matches from Portal to Texas History, newspapers, directories, and similar sources must remain candidates until human review;
- no record may be promoted without a visible review state;
- no building art may be shown as a fact unless it is anchored to a reviewed building or location record;
- and every route must expose the provenance trail somewhere in the layout.

The community product must never hide whether a detail is verified, inferred, illustrative, unknown, or rejected.

## 8. Asset and Texture Rules

The interface should feel physically grounded.

Required texture rules:

- parchment texture for internal cards;
- dark ink wash or charcoal for the outer shell;
- brass or bronze trim for labels and buttons;
- subtle map grain and ledger paper noise;
- light wear at edges and corners;
- and restrained shadowing that makes panels feel like objects.

Asset rules:

- building art should support transparent backgrounds;
- art previews should not be forced into a flat opaque box;
- each art record should expose its visual detail state;
- generic fallback art should remain clearly distinct from reviewed art;
- map thumbnails should preserve the feel of scanned historical paper;
- and the product should not flatten all visual layers into one baked image.

## 9. Shared Layer Contract

The map and building system must keep these layers separate:

- base map layer;
- road / rail layer;
- building footprint layer;
- building art layer;
- label layer;
- quest marker layer;
- evidence / provenance layer;
- and runtime overlay layers such as reviewer markers or live beacons.

Rules:

- a layer may be rendered together for display, but it must remain distinct in the data contract;
- building art records must reference a reviewed building or location record;
- building art details must explicitly state whether they are verified, inferred, or illustrative;
- runtime overlays must not rewrite the underlying historical evidence;
- and unknown areas should stay unknown rather than being overfilled with invented certainty.

## 10. Route Specifications

### 10.1 Community Dashboard / Community Verification Console

Purpose:

- summarize the state of the town package;
- route users into the specialized auditors;
- surface blockers;
- and show the current readiness of the community review effort.

Required layout regions:

- hero block with town/dataset identity;
- package ID and state/region metadata;
- release state badge;
- year gate panel centered on the Sanborn map year;
- review status overview with count cards and a progress bar;
- scope ladder showing community, county, and state hierarchy;
- primary route cards for the auditors;
- unresolved summary;
- release gate summary;
- quick actions;
- evidence inspector;
- review history;
- and diagnostics / safeguards footer.

Required data panels:

- source counts;
- sheet counts;
- building counts;
- people and business counts;
- unresolved counts;
- release blockers;
- source rights;
- package ID;
- audit history;
- and selected evidence details.

Required actions:

- run data quality check;
- bulk link source issues;
- export review report;
- view audit log;
- and navigate into the other routes.

### 10.2 Map Auditor

Purpose:

- stitch Sanborn sheets;
- review map coverage;
- manage georeferencing work;
- inspect layer separation;
- and hand off map-linked building anchors downstream.

Required layout regions:

- route header with town, year, and scope;
- left Sanborn sheet browser or sheet strip;
- central stitched map workspace;
- map control rail or tool stack;
- layer stack panel;
- control-point and georeference panel;
- right review/provenance panel;
- and bottom coverage / audit / export rail.

Required map controls:

- sheet selection;
- zoom in and out;
- pan or drag;
- reset view;
- seam overlay;
- review coverage overlay;
- control point table;
- add control point;
- layer visibility toggles;
- background mode selector;
- and export or handoff actions.

Required data panels:

- sheet status;
- stitching status;
- georeferencing status;
- road / rail drafting status;
- layer stack status;
- control point error values;
- reviewed building handoff record;
- source issue trail;
- and review history.

Behavior rules:

- roads and rails are editable as their own layer, not baked into the base map;
- building footprints stay separate from building art;
- labels stay separate from both geometry and art;
- quest markers and live reviewer beacons are runtime overlays;
- and map uncertainty should be shown instead of guessed away.

### 10.3 Building Auditor

Purpose:

- review building identity;
- review building footprints;
- review art readiness;
- inspect interior or use notes;
- and keep the building tied to source evidence.

Required layout regions:

- route header with building context;
- extracted text review;
- footprint review;
- art preview with transparent background behavior;
- interior / use notes;
- source issue or provenance trail;
- review actions;
- and a history or unresolved rail.

Required data panels:

- building ID;
- reviewed label;
- student-safe fallback name;
- location anchor;
- review record ID;
- reviewed sheet reference;
- anchor status;
- existence status;
- identity status;
- visual detail status;
- source IDs;
- supporting claim IDs;
- suggestion IDs;
- and reviewer notes.

Required art behavior:

- each building art record must reference a reviewed building or location record;
- each building art record must explicitly mark visual detail as `verified`, `inferred`, or `illustrative`;
- transparent-background art must be supported;
- generic fallback art must remain visibly fallback;
- and art should fit into the footprint instead of floating as unanchored decoration.

### 10.4 People Auditor

Purpose:

- review people and businesses separately;
- attach them to source issues;
- inspect identity evidence;
- and keep the source trail visible.

Required layout regions:

- left source issue browser;
- center person review workspace;
- right business review workspace;
- bottom provenance legend;
- bottom review history;
- bottom unresolved summary;
- and bottom quick actions.

Required data panels:

- source issue thumbnails or issue cards;
- publication title;
- issue date;
- page number;
- OCR excerpt;
- linked people count;
- linked business count;
- person identity fields;
- business identity fields;
- confidence indicators;
- duplicate or merge checks;
- classification cards;
- and reviewer notes.

Person review requirements:

- person identity must remain separate from business identity;
- person records should show a source trail and a confidence indicator;
- portrait or silhouette art should remain transparent-background friendly;
- and evidence classification must be visible before any promotion.

Business review requirements:

- business records must show source issue linkage;
- business type, location, and goods or services should be visible when available;
- price or commercial clues may appear only when source-backed;
- and business records must not be collapsed into person records.

### 10.5 Source / Provenance Inspector

Purpose:

- inspect a single source record deeply;
- show the raw source trail;
- show all linked normalized records;
- and preserve rights, OCR, citation, and review notes in one place.

Required layout regions:

- source filter or search region;
- source metadata panel;
- issue/page/OCR panel;
- linked record panel;
- citation and rights panel;
- provenance trail panel;
- and source history or export controls.

Required data panels:

- source ID;
- repository or archive name;
- publication title;
- issue date;
- page;
- OCR excerpt;
- citation string;
- rights/access notes;
- linked building/person/business/claim IDs;
- and review notes.

This route is the evidence drill-down for the other routes. It must not hide the underlying source data behind summary cards.

### 10.6 Release Gate Report

Purpose:

- explain whether the town package is ready to move past community review;
- list blockers;
- and produce a plain release decision for humans.

Required layout regions:

- top release state banner;
- blocker summary;
- criteria or readiness matrix;
- unresolved counts by domain;
- source rights and provenance warnings;
- recent review history;
- and export controls.

Required blocker categories:

- missing citations;
- unresolved source issue linkage;
- unreviewed building anchors;
- uncertain map stitching;
- missing or conflicting georeferencing;
- unpromoted candidate identities;
- rejected records that still need attention;
- art assets without reviewed anchors;
- unsupported claims exposed as if verified;
- rights or access problems;
- and records that fall outside the evidence gate.

Required gate states:

- `blocked` - release must not proceed;
- `guarded` - release is possible only with explicit caution;
- `ready` - community review has no remaining blocking issues.

The release gate report is a community handoff report. It is not a teacher dashboard.

## 11. What Must Not Be Built Yet

This product spec explicitly defers:

- teacher dashboards;
- student dashboards;
- classroom rosters;
- gradebooks;
- assignment submission;
- classroom play loops;
- missions as a student-facing product;
- broad AI generation across the town;
- automated town onboarding at scale;
- multiplayer;
- district administration;
- and general gameplay systems.

Also deferred:

- any interface that treats the community product as if it were the final classroom product;
- any design that hides source provenance to make the UI look cleaner;
- any auto-promotion of candidate records into verified truth;
- any flattening of map, art, evidence, and runtime layers into one baked asset;
- and any feature that assumes Texas-only or Texarkana-only code paths.

## 12. Relationship To The Current Debug View

The current local web view may continue to exist as a diagnostic, read-heavy, aggregated debug surface.

However:

- it is not the final product UI;
- it should not be treated as the route-based community design target;
- and it should not be used to justify collapsing the product into one long page.

The long-term community product should be route-based and mockup-driven, with each route able to stand on its own.

## 13. Acceptance Criteria

The community product spec is satisfied when:

- the six community routes are defined and linkable;
- each route has a clear required layout;
- the historical certainty labels are visible and preserved;
- the map layers remain separate in the data model;
- building art is anchored to reviewed building/location records;
- source and provenance are always inspectable;
- release blockers are explicit and explainable;
- and teacher/student/classroom features remain deferred.

