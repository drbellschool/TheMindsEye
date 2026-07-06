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
[##############......] 70%
```

Current active gates:

1. Complete issue #20: Add minimal read-only town package web view.
2. Keep issue #4 aligned whenever progress changes.
3. Create or continue the next narrow classroom-readiness task after issue #20 merges.

Open tracking pages:

- Agent command center: https://github.com/drbellschool/TheMindsEye/issues/3
- Implementation dashboard: https://github.com/drbellschool/TheMindsEye/issues/4
- Foundation gate issue, closed: https://github.com/drbellschool/TheMindsEye/issues/6
- Python packaging task, closed: https://github.com/drbellschool/TheMindsEye/issues/7
- JSON schema validation task, closed: https://github.com/drbellschool/TheMindsEye/issues/8
- Town-package loader task, closed: https://github.com/drbellschool/TheMindsEye/issues/9
- Provenance query task, closed: https://github.com/drbellschool/TheMindsEye/issues/10
- Texarkana source metadata task, closed: https://github.com/drbellschool/TheMindsEye/issues/11
- Mission seed builder task, closed: https://github.com/drbellschool/TheMindsEye/issues/18
- Read-only web visibility task: https://github.com/drbellschool/TheMindsEye/issues/20
- Readiness foundation PR, merged: https://github.com/drbellschool/TheMindsEye/pull/1
- PostgreSQL foundation PR, merged: https://github.com/drbellschool/TheMindsEye/pull/2
- Python packaging PR, merged: https://github.com/drbellschool/TheMindsEye/pull/13
- JSON schema validation PR, merged: https://github.com/drbellschool/TheMindsEye/pull/14
- Town-package loader PR, merged: https://github.com/drbellschool/TheMindsEye/pull/15
- Provenance query PR, merged: https://github.com/drbellschool/TheMindsEye/pull/16
- Texarkana source metadata PR, merged: https://github.com/drbellschool/TheMindsEye/pull/17
- Mission seed builder PR, merged: https://github.com/drbellschool/TheMindsEye/pull/19

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
[####################] 100%
```

- [x] Replace placeholder Sanborn source record with real metadata.
- [x] Add verified source URLs and rights notes.
- [x] Add first stable map/location IDs.
- [x] Add first verified historical claims.
- [x] Add first source-based inferences with reasoning notes.
- [x] Preserve fictional gameplay records separately.
- [x] Add tests proving source IDs and location IDs remain stable.

### Phase 3: Provenance Query Layer

```text
[####################] 100%
```

- [x] Add source lookup functions.
- [x] Add location lookup functions.
- [x] Add claim lookup functions.
- [x] Add mission seed lookup functions.
- [x] Add teacher-facing citation trail tests.
- [x] Add map-linked claim resolution tests.
- [x] Add unsupported-claim rejection tests.

### Phase 4: Mission Seed and Teacher Notes

```text
[####################] 100%
```

- [x] Add a narrow mission seed builder that uses existing claims only.
- [x] Add teacher-facing source note output.
- [x] Add student-facing mission hook output.
- [x] Keep provenance labels visible in mission output.
- [x] Add tests proving unsupported historical claims do not appear in mission output.

### Phase 5: Minimal Read-Only Web Visibility

```text
[####################] 100%
```

- [x] Add a minimal read-only webpage or app route showing town package status.
- [x] Show sources.
- [x] Show locations.
- [x] Show claims with provenance labels.
- [x] Show mission seed links.
- [x] Show teacher-facing source notes.

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

The current unblocked task is issue #20:

```text
Add minimal read-only town package web view.
```

After issue #20 merges, agents should create or continue the next narrow
classroom-readiness task unless a newer dashboard update or open PR blocks that
work.
