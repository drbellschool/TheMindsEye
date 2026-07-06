# Feature Coverage Matrix

This file checks the 40 numbered items from the current master feature and function list against the repository documentation.

Status meanings:

- **Captured** = explicitly documented in `docs/PRODUCT_SPEC_V1.md`.
- **Partially implemented** = some schema/data/CI support exists, but the feature itself is not built.
- **Future implementation** = documented vision only; agents should not assume it is complete.

| # | Feature Area | Documentation Status | Implementation Status | Notes |
|---|---|---|---|---|
| 1 | Historical World Engine | Captured | Future implementation | Includes living/persistent world, time progression, consequences, reputation, NPC memory, economy, dynamic events. |
| 2 | Historical Sources | Captured | Partially implemented | Source manifest exists for sample data; full datasets not ingested yet. |
| 3 | Historical Digital Twin | Captured | Future implementation | Building-level database fields documented. |
| 4 | Sanborn Map Builder | Captured | Future implementation | Pipeline documented: import, stitch, extract, review, approve, playable map. |
| 5 | Town Onboarding Framework | Captured | Partially implemented | Town-package direction exists; full click-to-create onboarding not built. |
| 6 | Town Universe | Captured | Future implementation | 10-year historical window documented. |
| 7 | Content Coverage System | Captured | Future implementation | Coverage score categories documented. |
| 8 | Community Dashboard | Captured | Future implementation | Includes review, approvals, moderation, censorship/governance when appropriate. |
| 9 | Provenance System | Captured | Partially implemented | Claim schema and sample claims exist; full provenance engine not built. |
| 10 | AI World Builder | Captured | Future implementation | AI source-to-town-to-NPC-object-scenario pipeline documented. |
| 11 | Adaptive Mission Engine | Captured | Future implementation | Mission selection factors documented. |
| 12 | Intervention System | Captured | Future implementation | Natural intervention-through-town needs documented. |
| 13 | Teacher Dashboard | Captured | Future implementation | Teacher choices and visible monitoring fields documented. |
| 14 | Student Dashboard | Captured | Future implementation | Character, mission, location, map, inventory, journal, mastery, titles documented. |
| 15 | Standards-Based Gradebook | Captured | Future implementation | 1-4 mastery and 60-100 conversion direction documented. |
| 16 | Character Progression | Captured | Future implementation | Standards-based progression, not grinding, documented. |
| 17 | Professional Roles | Captured | Future implementation | Role examples documented. |
| 18 | Experience Engine | Captured | Future implementation | Real-world experiences updating simulation documented. |
| 19 | Assessment Artifact Framework | Captured | Future implementation | Artifact types, rubric upload, AI compare, teacher override documented. |
| 20 | ELAR Integration | Captured | Future implementation | Authentic writing formats documented. |
| 21 | Science Integration | Captured | Future implementation | Labs updating simulation documented. |
| 22 | Historical Communication Engine | Captured | Future implementation | Telegrams, letters, couriers, costs, distance, moderation documented. |
| 23 | Justice System | Captured | Future implementation | Court, sheriff, warrants, consequences, teacher notification documented. |
| 24 | Railroad Engine | Captured | Future implementation | Train schedules, freight, mail, livestock, depots, events documented. |
| 25 | Commerce Engine | Captured | Future implementation | Businesses, inventory, supply chain, prices, trade, markets documented. |
| 26 | Inventory System | Captured | Future implementation | Items, evidence, money, maps, tools, food, telegrams, trade goods documented. |
| 27 | World Presence Engine | Captured | Future implementation | Students, NPCs, animals, workers, crowds documented. |
| 28 | Multi-Class Support | Captured | Future implementation | Many teachers/classes in one shared town documented. |
| 29 | Map Features | Captured | Future implementation | Zoom, interiors, roofs, labels, numbers, players, NPCs, animals, movement documented. |
| 30 | Travel System | Captured | Future implementation | Walk, horse, train, wagon, boat, travel time, random encounters documented. |
| 31 | Consequence System | Captured | Future implementation | Town remembers choices; linked to ledger/reputation. |
| 32 | World Ledger | Captured | Future implementation | Events, player history, building/business changes, persistent campaigns documented. |
| 33 | HQIM Alignment | Captured | Future implementation | Authentic tasks, knowledge building, evidence, discussion, writing, mastery documented. |
| 34 | Accessibility | Captured | Future implementation | 504, SPED, ELs, translation, scaffolds, accommodations documented. |
| 35 | AI Image Generation | Captured | Future implementation | NPCs, buildings, portraits, maps, artifacts, scenes, avatars documented. |
| 36 | AI Engines | Captured | Future implementation | Specialized engines documented. |
| 37 | Governance | Captured | Future implementation | Review, approval, verification, versioning, moderation, content safety documented. |
| 38 | Repeatable Architecture | Captured | Partially implemented | Schemas and sample town package exist; full no-code onboarding not built. |
| 39 | Classroom Management | Captured | Future implementation | Students, progress, location, communications, behavior flags, mastery, intervention documented. |
| 40 | Core Philosophy | Captured | Future implementation | Product philosophy documented as controlling principle. |

## Repository Support Files

The following files support this matrix:

- `docs/PRODUCT_SPEC_V1.md` — authoritative current product vision and 40-item feature list.
- `docs/PRODUCT_PRIORITY_CAPTURE.md` — earlier clarified priority capture around TEKS, dashboards, Sanborn/GPS, MTSS, gradebook, and launch focus.
- `docs/CORE_WORKSTREAMS.md` — workstreams for HQIM, Sanborn stitching, building details, map navigation, historical source ingestion, citation UI, and missions.
- `docs/ARCHITECTURE.md` — architecture contract.
- `AGENTS.md` — AI-agent operating rules.
- `data/schemas/` — initial machine-checkable schemas.
- `data/towns/texarkana/` — initial sample town package.
- `scripts/validate_mindseye.py` — validation script.
- `.github/workflows/mindseye-ci.yml` — CI validation workflow.

## Agent Warning

Captured does not mean built.

Agents must not jump from this feature list directly to building the full platform. The product vision is documented so nothing is lost, but implementation must still follow the roadmap and MVP sequence.
