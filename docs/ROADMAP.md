# The Mind's Eye Roadmap

This is the authoritative implementation roadmap for the early project.

## Roadmap Rule

The project should be designed as a repeatable town-package historical simulation engine, but only the Texarkana 1885 vertical slice should be built first.

> Design for many towns. Build only Texarkana 1885 first.

## Phase 0 — AI-Ready Foundation

Goal: make the repository safe for agent-assisted development.

Required outcomes:

- authoritative architecture file;
- agent instructions;
- roadmap;
- prompt contracts;
- JSON schemas;
- sample town package;
- validation script;
- basic CI;
- contributor/IP boundary;
- and readiness checklist.

Exit criteria:

- CI can validate the sample town package;
- every sample historical claim is labeled as `verified_fact`, `source_based_inference`, or `fictional_gameplay`;
- agents know which files are authoritative;
- and no gameplay code is required yet.

## Phase 1 — Town Package and Provenance Loader

Goal: load a town package without hard-coding Texarkana into the engine.

Build:

- schema-validated town package loader;
- source manifest loader;
- claim/provenance loader;
- location/building loader;
- citation lookup;
- and tests.

Acceptance tests:

- loader accepts `data/towns/texarkana/metadata.json`;
- loader rejects missing source IDs;
- loader rejects historical claims without claim type;
- loader rejects invalid claim types;
- loader can list locations and linked claims.

## Phase 2 — Static Texarkana 1885 Dataset

Goal: replace placeholder data with a small, hand-curated source-grounded dataset.

Build:

- source records from allowed/public metadata;
- map/location records from Sanborn evidence;
- claim records with confidence labels;
- citation links;
- source-rights notes;
- and eval examples.

Acceptance tests:

- every claim has at least one citation unless it is `fictional_gameplay`;
- every verified claim cites a real source record;
- source URLs and rights notes are present;
- map locations use stable IDs.

## Phase 3 — Mission Seed Generator

Goal: generate one classroom mission plan from validated data.

Build:

- mission seed model;
- teacher request input model;
- mission outline generator;
- teacher source note output;
- student-facing mission hook;
- and provenance labels embedded in output.

Acceptance tests:

- mission output includes fact/inference/fiction labels;
- teacher note lists all cited claims;
- no unsupported historical claim appears in mission output;
- fictional elements are clearly marked.

## Phase 4 — Map-Linked Classroom Interaction

Goal: connect the mission to map locations and simple student actions.

Build:

- location lookup;
- nearby-place query;
- movement validation stub;
- map-linked mission clue placement;
- and teacher-visible explanation of location evidence.

Acceptance tests:

- student actions can reference stable location IDs;
- map-linked claims resolve to citations;
- impossible/unknown locations produce uncertainty rather than hallucinated map answers.

## Phase 5 — Teacher Review and Export

Goal: give the teacher authority before students see materials.

Build:

- teacher review view;
- source note display;
- claim inspection;
- edit/approve workflow;
- printable/exportable mission materials.

Acceptance tests:

- teacher can see source evidence before approval;
- mission cannot be marked classroom-ready while unsupported historical claims exist;
- teacher edits preserve or relabel provenance.

## Phase 6 — Pilot Readiness

Goal: prepare for limited classroom testing.

Build:

- privacy baseline;
- student-data minimization plan;
- pilot terms;
- feedback form;
- accessibility review;
- and teacher onboarding instructions.

Acceptance tests:

- no unnecessary student PII is collected;
- pilot materials explain AI limitations;
- teacher remains final authority;
- source-rights notes are complete.

## Deferred Until Later

Do not build these until after the Texarkana 1885 loop works:

- many-town automated onboarding;
- full multiplayer;
- student rostering;
- district integrations;
- automated historical scraping at scale;
- paid marketplace features;
- complex combat systems;
- or full standards coverage across all subjects.
