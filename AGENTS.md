# AI Agent Instructions for The Mind's Eye

These instructions apply to Codex, ChatGPT, and every AI-assisted development workflow operating inside this repository.

## Read First

Before changing files, read in this order:

1. `docs/CONSTITUTION.md`
2. `PROJECT_GOAL.md`
3. `docs/ARCHITECTURE.md`
4. `docs/PR_REVIEW_CHECKLIST.md`
5. `docs/ROADMAP.md`
6. relevant product, schema, prompt, privacy, rights, and implementation documents
7. this `AGENTS.md`

When documents conflict, `docs/CONSTITUTION.md` controls. Do not silently resolve a material conflict; identify it in the pull request.

## Current Product Architecture

- GitHub is source control and the pull-request review surface.
- `apps/web` is the Next.js public product application.
- Vercel is the live preview and production review surface.
- Supabase is the persistent application database.
- Python is limited to ingestion, transformation, analysis, evaluation, and background-processing tools.
- Codex and other agents build bounded changes.
- Humans verify history, review production behavior, and approve merges.

Do not treat a local Python page as the public product. Do not declare a web task complete solely because it works locally.

## Current Build Priority

The Community evidence system is the foundation. The approved sequence is:

1. Community Verification Console
2. Source / Provenance Inspector
3. Map Auditor
4. Building Auditor
5. People and Business Auditor
6. Release Gate
7. Source ingestion and visual asset pipelines
8. Historical World Engine
9. Teacher product
10. Student product
11. Assessment, AI Game Master, classroom, and multiplayer
12. additional town packages

Until the Community evidence read/write and release-gate model is stable, do not add teacher dashboards, student dashboards, missions, multiplayer, or gameplay unless the task explicitly authorizes an exception.

## Historical Integrity Contract

Every historically meaningful record must use exactly one evidence classification:

- `verified_fact`
- `source_based_inference`
- `illustrative`
- `fictional_gameplay`
- `unknown`
- `rejected`

Evidence classification is separate from workflow/review status.

New imported, extracted, or AI-generated candidates must never default to `verified_fact`.

Unknown is better than invented.

## AI Boundary

AI may propose, extract, summarize, normalize, match, classify, draft, and generate candidate material.

AI must not:

- silently verify history;
- invent citations or source details;
- hide uncertainty or conflicting evidence;
- convert illustrative or fictional content into fact;
- overwrite human review decisions;
- remove provenance or review history;
- present generated artwork as documentary evidence;
- issue final student grades without teacher authority.

## Provenance Requirements

Every historical entity, claim, relationship, map feature, and released derivative must preserve or expose:

- source linkage;
- source location such as page, issue, sheet, or excerpt when available;
- evidence classification;
- certainty;
- candidate origin, including AI involvement when applicable;
- review state;
- reviewer and review-event history when applicable;
- release state and unresolved blockers.

Relationships are first-class records and must carry the same evidence and review expectations as entities.

## Data Maturity Pipeline

Do not bypass this sequence:

```text
Raw Source
  -> Normalized Source
  -> Candidate Record
  -> Human Review
  -> Approved Record
  -> Released Historical Record
  -> World Object
  -> Educational Object
  -> Gameplay Object
```

Raw source material must remain separate from normalized or derived records. Normalization must not destroy the source trail.

## Town-Package Rule

Texarkana is the first town package, not a hard-coded product boundary.

Reusable application logic must remain town-agnostic where practical. Town-specific names, years, source manifests, maps, records, and release state belong in data or configuration layers.

Adding another town should primarily add evidence, structured records, configuration, review queues, and approved content—not require rewriting the engine.

## Working Rules

For each assigned task:

1. State the single intended scope.
2. Identify affected routes, tables, schemas, evidence states, and review workflows.
3. Check the Constitution and current product phase.
4. Preserve safe demo fallback until production data behavior is stable.
5. Show the active data source where relevant.
6. Add or update validation and tests for changed behavior.
7. Use safe migrations and non-destructive review workflows.
8. Keep the pull request small and reviewable.
9. Run the relevant checks. For web changes, run:

```bash
cd apps/web
npm run build
```

10. Open a pull request that explains scope, evidence impact, validation, Vercel verification steps, and known limitations.

## Do Not

Do not:

- merge or revive the obsolete Python community web-shell direction as the product;
- add auth before the Community read/write model is stable unless explicitly assigned;
- add student or roster data before privacy and access controls are approved;
- create destructive review actions that erase history;
- fabricate fallback data or present demo data as Supabase data;
- hide failed Supabase connections;
- combine unrelated schema, route, visual, ingestion, and gameplay work in one PR;
- add unreviewed third-party datasets or source content without rights notes;
- add licenses, contributor terms, or model-training assumptions that weaken ownership without explicit approval;
- hard-code a one-town architecture;
- skip the release gate;
- or declare success without a production/preview review path for web-facing work.

## Definition of Done

A task is not complete unless:

- it obeys `docs/CONSTITUTION.md`;
- it stays within the requested scope and current build phase;
- evidence classifications and provenance remain intact;
- AI-generated candidates remain non-verified until human review;
- review events or equivalent audit history are created for review writes;
- demo and failure states are visibly labeled and safe;
- relevant tests and builds pass;
- the pull request explains how to review the change on Vercel when applicable;
- and `docs/PR_REVIEW_CHECKLIST.md` can be completed without a constitutional exception.

If a requested task conflicts with these rules, stop the conflicting portion, document the conflict, and propose the smallest compliant alternative.