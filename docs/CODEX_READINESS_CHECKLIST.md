# Codex Readiness Checklist

This checklist determines whether **The Mind's Eye** is ready for AI-agent-assisted implementation.

## Current Decision

The project is ready for **structured Codex implementation work** on the Texarkana 1885 vertical slice.

This means Codex may now take bounded implementation tasks that touch multiple files when the work follows the roadmap, keeps the town-package architecture intact, and passes validation plus unit tests.

The project is still not approved for free-running autonomous platform expansion.

Approved near-term agent work:

- create and strengthen schemas;
- scaffold modules;
- create tests;
- build source manifests;
- create Texarkana 1885 sample data;
- build one vertical mission-generation path;
- document prompts;
- validate provenance handling;
- add Sanborn sheet inventory and stitching contracts;
- replace placeholder records with verified source data.

Not approved yet:

- full multiplayer;
- production student accounts;
- district deployment;
- automated ingestion of large copyrighted corpora;
- unrestricted AI mission generation;
- or broad support for many towns before the Texarkana package proves the pattern.

## Required Before Heavy Coding

### Architecture

- [x] Architecture contract exists.
- [x] Agent instructions exist.
- [x] Town package schema exists.
- [x] Provenance/claim schema exists.
- [x] Source manifest schema exists.
- [x] Prompt registry exists.
- [x] MVP roadmap exists.

### Data

- [x] Raw source storage pattern is defined.
- [x] Normalized source storage pattern is defined.
- [x] Texarkana 1885 town package folder exists.
- [x] Map/location ID convention exists.
- [x] Citation/source ID convention exists.
- [x] Source-rights notes exist in source records.

### Code

- [x] World / Map module scaffold exists.
- [x] Knowledge / Provenance module scaffold exists.
- [x] Story / Mission module scaffold exists.
- [x] Game / Classroom loop scaffold exists.
- [x] Shared types/models exist.
- [x] Town package loader exists.
- [x] Basic validation script exists.

### Prompts and Evaluation

- [x] Prompt contract document exists.
- [ ] Prompt files have stable IDs.
- [ ] Prompts define expected inputs.
- [ ] Prompts define expected outputs.
- [ ] Prompts require fact/inference/fiction labels.
- [ ] Prompt regression examples exist.
- [ ] Hallucination/provenance failure cases exist.

### Tests

- [x] Basic validation exists.
- [ ] Full JSON Schema test runner exists.
- [x] Citation/provenance tests exist.
- [x] Map/location consistency tests exist.
- [x] Mission output tests exist.
- [ ] Prompt/eval tests exist.
- [x] Basic CI exists.
- [x] CI runs validation and unit tests.

### Privacy / IP / Grant Readiness

- [x] Repository license strategy is explicit.
- [x] Contributor/contractor IP assignment caution is documented.
- [x] Student-data minimization posture is documented.
- [x] Pilot privacy/data-use notes exist.
- [x] Grant one-pager exists.
- [x] Pilot school/museum partner packet exists.

## Agent Acceptance Criteria for the MVP

The first agent-built MVP should be considered successful only if it can:

1. Load a Texarkana 1885 town package.
2. Read a small set of source records.
3. Load a numbered location/building index.
4. Store historical claims with provenance labels.
5. Generate one classroom mission.
6. Show which claims are verified, inferred, or fictional.
7. Provide teacher-facing source notes.
8. Avoid hard-coded assumptions that prevent a second town package later.

## Key Correction from Deep Research Review

The deep research report correctly identified that the project needs stronger contracts before agent implementation.

However, the project should **not** delay town-package architecture until later. The ability to create other towns is not a later pivot. It is part of the product's foundation.

Therefore:

> The repository should define a repeatable town-package architecture immediately, while still limiting the first actual build to Texarkana 1885.

## Recommended Next Codex Prompt

Use this as the first implementation prompt after this readiness branch is merged:

```text
Read README.md, PROJECT_GOAL.md, docs/PRODUCT_SPEC_V1.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/CORE_WORKSTREAMS.md, AGENTS.md, and docs/CODEX_READINESS_CHECKLIST.md.

Do not build broad gameplay, multiplayer, production accounts, district integrations, or automated large-scale scraping.

Work only on the Texarkana 1885 vertical slice. Extend the current src/mindseye module scaffolds by adding the next narrow implementation layer: a source-grounded town-package loader, provenance-aware mission packet builder, Sanborn sheet inventory contract, or tests that strengthen the fact / inference / fiction boundary.

Every change must preserve town-package architecture, avoid hard-coding Texarkana into reusable engine logic, and pass both scripts/validate_mindseye.py and python -m unittest discover -s tests -p 'test_*.py'.
```
