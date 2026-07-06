# Codex Readiness Checklist

This checklist determines whether **The Mind's Eye** is ready for AI-agent-assisted implementation.

## Current Decision

The project is ready for **specification-first Codex work** and small implementation tasks.

The project is not yet ready for unsupervised large-scale feature building.

Approved near-term agent work:

- create schemas;
- scaffold modules;
- create tests;
- build source manifests;
- create Texarkana 1885 sample data;
- build one vertical mission-generation path;
- document prompts;
- validate provenance handling.

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

- [ ] World / Map module scaffold exists.
- [ ] Knowledge / Provenance module scaffold exists.
- [ ] Story / Mission module scaffold exists.
- [ ] Game / Classroom module scaffold exists.
- [ ] Shared types/models exist.
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
- [ ] Schema tests exist.
- [ ] Citation/provenance tests exist.
- [ ] Map/location consistency tests exist.
- [ ] Mission output tests exist.
- [ ] Prompt/eval tests exist.
- [x] Basic CI exists.

### Privacy / IP / Grant Readiness

- [ ] Repository license strategy is explicit.
- [x] Contributor/contractor IP assignment caution is documented.
- [x] Student-data minimization posture is documented.
- [ ] Pilot privacy/data-use notes exist.
- [ ] Grant one-pager exists.
- [ ] Pilot school/museum partner packet exists.

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

Use this as the first implementation prompt after the architecture documents are committed:

```text
Read README.md, PROJECT_GOAL.md, docs/ARCHITECTURE.md, AGENTS.md, and docs/CODEX_READINESS_CHECKLIST.md.

Do not build gameplay yet.

Create a minimal town-package schema and provenance schema for the Texarkana 1885 prototype. Add example JSON files under data/towns/texarkana/ using placeholder/sample content only where real source data is not yet available. Add validation tests proving that a town package can define sources, locations, buildings, claims, citations, and a mission seed while preserving verified_fact, source_based_inference, and fictional_gameplay labels.

Keep the implementation town-agnostic. Texarkana should be the first package, not a hard-coded engine assumption.
```
