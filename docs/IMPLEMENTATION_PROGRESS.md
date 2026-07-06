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
[#######.............] 35%
```

Current active gates:

1. Complete issue #9: Add town-package loader API.
2. Keep issue #4 aligned whenever progress changes.
3. Continue with issue #10 after issue #9 merges.

Open tracking pages:

- Agent command center: https://github.com/drbellschool/TheMindsEye/issues/3
- Implementation dashboard: https://github.com/drbellschool/TheMindsEye/issues/4
- Foundation gate issue, closed: https://github.com/drbellschool/TheMindsEye/issues/6
- Python packaging task, closed: https://github.com/drbellschool/TheMindsEye/issues/7
- JSON schema validation task, closed: https://github.com/drbellschool/TheMindsEye/issues/8
- Town-package loader task: https://github.com/drbellschool/TheMindsEye/issues/9
- Next provenance task: https://github.com/drbellschool/TheMindsEye/issues/10
- Readiness foundation PR, merged: https://github.com/drbellschool/TheMindsEye/pull/1
- PostgreSQL foundation PR, merged: https://github.com/drbellschool/TheMindsEye/pull/2
- Python packaging PR, merged: https://github.com/drbellschool/TheMindsEye/pull/13
- JSON schema validation PR, merged: https://github.com/drbellschool/TheMindsEye/pull/14

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
[####################] 100%
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
- [x] First implementation PR merged.
- [x] Open foundation PR sequence resolved into `main`.
- [x] Foundation gate issue closed after dashboard/doc confirmation.

### Phase 1: Data, Provenance, and Database Foundation

```text
[##############......] 70%
```

- [x] Initial town package folder exists.
- [x] Initial source, location, claim, and mission seed JSON exists.
- [x] Basic validation script exists.
- [x] Structured Codex readiness foundation merged.
- [x] PostgreSQL database foundation merged.
- [x] Town-package loader API added.
- [x] Provenance integrity tests added.
- [x] Mission teacher-review packet scaffold added.
- [x] Python project packaging added.
- [x] Dependency declaration added.
- [x] Stricter JSON schema validation tests added.
- [x] Missing source, location, claim type, confidence label, and mission-link rejection tests added.
- [x] Town-package loader API hardened with schema validation and broken-link tests.

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

The current unblocked task is issue #9:

```text
Add and harden the town-package loader API.
```

After issue #9 merges, agents should continue with issue #10 unless a newer
dashboard update or open PR blocks that work.
