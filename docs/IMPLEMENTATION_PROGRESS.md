# Implementation Progress

This document is the repo-hosted progress page for The Mind's Eye MVP build.
It pairs with the live GitHub dashboard issue:

https://github.com/drbellschool/TheMindsEye/issues/4

Agents should keep this document and the dashboard issue aligned when a PR
changes project status.

## Current Snapshot

Last updated: 2026-07-06

Overall MVP progress:

```text
[##..................] 10%
```

Current active gates:

1. Review and merge PR #1: structured Codex readiness foundation.
2. Review and merge PR #2: PostgreSQL database foundation.
3. Continue with the next foundation task from issue #3 after open PRs are resolved.

Open tracking pages:

- Agent command center: https://github.com/drbellschool/TheMindsEye/issues/3
- Implementation dashboard: https://github.com/drbellschool/TheMindsEye/issues/4
- Readiness foundation PR: https://github.com/drbellschool/TheMindsEye/pull/1
- PostgreSQL foundation PR: https://github.com/drbellschool/TheMindsEye/pull/2

## Agent Operating Rules

Before starting implementation work, an agent must:

1. Read `README.md`, `PROJECT_GOAL.md`, `AGENTS.md`, and the required docs listed in `AGENTS.md`.
2. Check open PRs before starting a new branch.
3. Check issue #3 for the next unblocked task.
4. Keep work scoped to one reviewable PR.
5. Preserve the `verified_fact`, `source_based_inference`, and `fictional_gameplay` boundary.
6. Avoid gameplay, student accounts, multiplayer, district deployment, and broad AI generation until the foundation phases are complete.
7. Run the required validation before opening or updating a PR.
8. Update issue #4 and this document when progress changes.

Required validation for implementation PRs:

```bash
python scripts/validate_mindseye.py
python -m unittest discover -s tests -p 'test_*.py'
```

If the repository does not yet contain a `tests/` directory on the branch being
worked, run the validation script and document that unit-test discovery is not
available on that branch.

## Phase Progress

### Phase 0: Project and Agent Operating System

```text
[###############.....] 75%
```

- [x] Product goal documented.
- [x] Architecture contract documented.
- [x] Agent instructions documented.
- [x] Roadmap documented.
- [x] Codex readiness checklist documented.
- [x] Basic validation workflow exists.
- [x] Agent command center issue exists.
- [x] GitHub progress dashboard issue exists.
- [x] Repo-hosted implementation progress document exists.
- [ ] First implementation PR merged.
- [ ] Open PR sequence resolved into `main`.

### Phase 1: Data, Provenance, and Database Foundation

```text
[####................] 20%
```

- [x] Initial town package folder exists.
- [x] Initial source, location, claim, and mission seed JSON exists.
- [x] Basic validation script exists.
- [ ] Structured Codex readiness foundation merged.
- [ ] PostgreSQL database foundation merged.
- [ ] Python project packaging added.
- [ ] Dependency declaration added.
- [ ] Stricter JSON schema validation tests added.
- [ ] Town-package loader API added.
- [ ] Missing source, location, claim type, confidence label, and mission-link rejection tests added.

### Phase 2: Real Texarkana 1885 Source Data

```text
[....................] 0%
```

- [ ] Replace placeholder Sanborn source record with real metadata.
- [ ] Add verified source URLs and rights notes.
- [ ] Add first stable map/location IDs.
- [ ] Add first verified historical claims.
- [ ] Add first source-based inferences with reasoning notes.
- [ ] Preserve fictional gameplay records separately.
- [ ] Add tests proving source IDs and location IDs remain stable.

### Phase 3: Provenance Query Layer

```text
[....................] 0%
```

- [ ] Add source lookup functions.
- [ ] Add location lookup functions.
- [ ] Add claim lookup functions.
- [ ] Add mission seed lookup functions.
- [ ] Add teacher-facing citation trail tests.
- [ ] Add map-linked claim resolution tests.
- [ ] Add unsupported-claim rejection tests.

### Phase 4: Mission Seed and Teacher Notes

```text
[....................] 0%
```

- [ ] Add a narrow mission seed builder that uses existing claims only.
- [ ] Add teacher-facing source note output.
- [ ] Add student-facing mission hook output.
- [ ] Keep provenance labels visible in mission output.
- [ ] Add tests proving unsupported historical claims do not appear in mission output.

### Phase 5: Minimal Read-Only Web Visibility

```text
[....................] 0%
```

Do not start this phase until the data/provenance layer is stable enough to show.

- [ ] Add a minimal read-only webpage or app route showing town package status.
- [ ] Show sources.
- [ ] Show locations.
- [ ] Show claims with provenance labels.
- [ ] Show mission seed links.
- [ ] Show teacher-facing source notes.

### Phase 6: Later Classroom Product

```text
[....................] 0%
```

This phase is intentionally deferred.

- [ ] Student mission flow.
- [ ] Teacher review flow.
- [ ] Standards alignment workflow.
- [ ] Assessment evidence workflow.
- [ ] Accessibility supports.
- [ ] Pilot privacy baseline.

## Deferred Until Foundation Is Stable

Do not start these until earlier phases explicitly allow them:

- gameplay systems;
- student accounts;
- multiplayer;
- district deployment;
- broad AI generation;
- automated town onboarding at scale.

## Next Agent Task

After PR #1 and PR #2 are reviewed and merged, the next task is:

```text
Add Python project packaging and dependency declaration, including optional
PostgreSQL import dependency.
```

If those PRs are not merged, agents should inspect them first instead of
starting conflicting foundation work.
