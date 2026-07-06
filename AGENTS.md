# AI Agent Instructions for The Mind's Eye

These instructions apply to Codex, ChatGPT agents, and any AI-assisted development workflow working inside `The-Minds-Eye/`.

## Read First

Before changing files, read:

1. `README.md`
2. `PROJECT_GOAL.md`
3. `docs/ARCHITECTURE.md`
4. `docs/chat-context-2026-07-05.md`
5. this `AGENTS.md`

If these documents conflict, follow this order:

1. `PROJECT_GOAL.md`
2. `docs/ARCHITECTURE.md`
3. `README.md`
4. `docs/chat-context-2026-07-05.md`
5. local implementation notes

## Product Thesis

The Mind's Eye is a historically grounded classroom RPG/simulation engine.

It must be built so future towns can be added as town packages.

The first implementation target is still narrow:

> Texarkana 1885, one map-linked historical dataset, one playable mission, and teacher-visible citations.

Do not mistake the narrow MVP for a one-town architecture.

## Non-Negotiable Historical Integrity Rule

Every historically meaningful output must be labeled as one of:

1. `verified_fact`
2. `source_based_inference`
3. `fictional_gameplay`

Never present an inference or invented gameplay detail as verified history.

## Codex Working Rules

When assigned a task:

1. Identify which engine/layer the task belongs to:
   - World / Map Engine
   - Knowledge / Provenance Engine
   - Story / Mission Engine
   - Game / Classroom Engine
2. Check whether the task affects data schemas, prompts, or provenance.
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
- or treat the Sanborn map as only a background image.

## Preferred MVP Build Order

1. Data/source manifest pattern.
2. Town package schema for Texarkana 1885.
3. Small hand-curated source dataset.
4. Location/building index linked to map IDs.
5. Claim/provenance records.
6. One mission generator path.
7. Teacher-facing citation/source notes.
8. Minimal student-facing mission experience.
9. Tests and evals for the above.

## Definition of Done for Early Tasks

A task is not done unless:

- the change supports the Texarkana 1885 prototype;
- reusable code remains town-agnostic where practical;
- historical claims remain labeled;
- source/citation links are preserved;
- any schema changes are documented;
- tests or validation are added when appropriate;
- and the change does not create privacy, IP, or licensing risk.

## Grant and IP Caution

The project may seek non-dilutive funding. Protecting ownership matters.

Agents must not add license terms, third-party datasets, model-training assumptions, or contributor language that could weaken ownership without explicit approval.

If a task involves outside contributors, school pilots, student data, source licensing, or grant materials, flag the issue for human review instead of silently making assumptions.
