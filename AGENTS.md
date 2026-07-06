# AI Agent Instructions for The Mind's Eye

These instructions apply to Codex, ChatGPT agents, and any AI-assisted development workflow working inside `TheMindsEye`.

## Read First

Before changing files, read:

1. `README.md`
2. `PROJECT_GOAL.md`
3. `docs/PRODUCT_SPEC_V1.md`
4. `docs/FEATURE_COVERAGE_MATRIX.md`
5. `docs/PRODUCT_PRIORITY_CAPTURE.md`
6. `docs/CORE_WORKSTREAMS.md`
7. `docs/ARCHITECTURE.md`
8. `docs/ROADMAP.md`
9. `docs/CODEX_READINESS_CHECKLIST.md`
10. `docs/PROMPT_CONTRACTS.md`
11. `docs/CONTRIBUTOR_IP_BOUNDARY.md`
12. this `AGENTS.md`

If these documents conflict, follow this order:

1. `PROJECT_GOAL.md`
2. `docs/PRODUCT_SPEC_V1.md`
3. `docs/ARCHITECTURE.md`
4. `docs/ROADMAP.md`
5. `docs/PRODUCT_PRIORITY_CAPTURE.md`
6. `docs/CORE_WORKSTREAMS.md`
7. `README.md`
8. local implementation notes

## Product Thesis

The Mind's Eye is a historically accurate, AI-powered instructional world where authentic historical evidence, standards-based learning, adaptive instruction, and student agency are integrated into a single reusable framework.

Gameplay exists to support learning, not the other way around.

It must be built so future towns can be added as town packages.

The first implementation target is still narrow:

> Texarkana 1885, one map-linked historical dataset, one playable mission, teacher-visible citations, and a repeatable architecture that can eventually support other towns.

Do not mistake the narrow MVP for a one-town architecture.

## Non-Negotiable Historical Integrity Rule

Every historically meaningful output must be labeled as one of:

1. `verified_fact`
2. `source_based_inference`
3. `fictional_gameplay`

The larger product language may also refer to verified fact, historical inference, simulation element, and creative licensing. The implementation must keep these categories explicit and never present an inference or invented gameplay detail as verified history.

## Non-Negotiable Instructional Rule

The product must remain standards-based and instructionally serious.

Agents must not reduce it to:

- a generic D&D clone;
- a simple historical fiction generator;
- a map viewer only;
- a dashboard-only school app;
- or a disconnected AI lesson generator.

The platform must preserve:

- TEKS/standards alignment;
- HQIM principles;
- teacher authority;
- student mastery evidence;
- MTSS/intervention possibilities;
- accessibility supports;
- and gradebook-facing evidence.

## Codex Working Rules

When assigned a task:

1. Identify which engine/layer the task belongs to:
   - Historical World Engine
   - World / Map Engine
   - Sanborn Map Builder
   - Knowledge / Provenance Engine
   - Story / Mission Engine
   - Standards / Learning Engine
   - Assessment Engine
   - Teacher Dashboard
   - Student Dashboard
   - Community Dashboard
   - Game / Classroom Engine
2. Check whether the task affects data schemas, prompts, provenance, standards, dashboards, or student data.
3. Add or update tests where behavior changes.
4. Avoid hard-coding Texarkana-specific values into reusable engine code.
5. Keep raw source records separate from normalized records.
6. Preserve citation/source trails.
7. Document meaningful architecture decisions.
8. Prefer small, reviewable commits.

## Do Not Do These Things

Do not:

- rewrite the repository structure without explicit approval;
- build a large open-world game before the prototype loop works;
- add student account/roster features before privacy rules are defined;
- add copyrighted or restricted historical content without source-rights notes;
- create AI prompts without documenting expected inputs and outputs;
- generate missions that hide which facts are verified, inferred, or fictional;
- mix source ingestion, mission writing, and gameplay state into one untestable module;
- remove the town-package direction;
- treat the Sanborn map as only a background image;
- skip standards alignment;
- skip teacher review;
- or build features that ignore `docs/PRODUCT_SPEC_V1.md`.

## Preferred MVP Build Order

1. Data/source manifest pattern.
2. Town package schema for Texarkana 1885.
3. Small hand-curated source dataset.
4. Location/building index linked to map IDs.
5. Claim/provenance records.
6. Sanborn stitching and building-data specifications.
7. Standards/HQIM mission template.
8. One mission generator path.
9. Teacher-facing citation/source notes.
10. Minimal student-facing mission experience.
11. Tests and evals for the above.

## Definition of Done for Early Tasks

A task is not done unless:

- the change supports the Texarkana 1885 prototype;
- reusable code remains town-agnostic where practical;
- historical claims remain labeled;
- source/citation links are preserved;
- instructional purpose and standards alignment are not lost;
- any schema changes are documented;
- tests or validation are added when appropriate;
- and the change does not create privacy, IP, or licensing risk.

## Grant and IP Caution

The project may seek non-dilutive funding. Protecting ownership matters.

Agents must not add license terms, third-party datasets, model-training assumptions, or contributor language that could weaken ownership without explicit approval.

If a task involves outside contributors, school pilots, student data, source licensing, or grant materials, flag the issue for human review instead of silently making assumptions.
