# Pull Request Review Checklist

Use this checklist before merging any meaningful pull request. A technically working PR can still fail review if it violates the Constitution, project order, historical integrity, or production-review requirements.

## 1. Scope

- [ ] The PR does one coherent thing.
- [ ] The implementation matches the stated goal and acceptance criteria.
- [ ] No unrelated feature, schema, dependency, auth, student, teacher, or gameplay work was added.
- [ ] Reusable code is not hard-coded to Texarkana unless the value belongs in a town package.
- [ ] The PR does not revive or merge the obsolete Python public web-shell direction.

## 2. Constitutional Compliance

- [ ] The PR follows `docs/CONSTITUTION.md`.
- [ ] Evidence comes before experience.
- [ ] AI-generated material remains a proposal until human review.
- [ ] Unknown or incomplete information is not presented as fact.
- [ ] No provenance, review history, or uncertainty is silently removed.

## 3. Evidence and Classification

- [ ] Every historically meaningful record supports the approved evidence classifications:
  - `verified_fact`
  - `source_based_inference`
  - `illustrative`
  - `fictional_gameplay`
  - `unknown`
  - `rejected`
- [ ] New candidates do not default to `verified_fact`.
- [ ] Evidence classification is not confused with workflow/review status.
- [ ] Relationships between entities carry evidence and certainty expectations.
- [ ] Generated artwork is not treated as documentary evidence.

## 4. Provenance and Review Trail

- [ ] Historical records expose or preserve source linkage.
- [ ] Citations do not invent archives, dates, pages, issues, or URLs.
- [ ] Source rights or usage notes are preserved where relevant.
- [ ] Human review decisions cannot be silently overwritten by AI.
- [ ] Write workflows create review events or an equivalent audit trail.
- [ ] Destructive edits are avoided or explicitly justified.

## 5. Data Maturity and Release

- [ ] The PR respects the raw source -> candidate -> review -> approved -> released pipeline.
- [ ] No teacher, student, world, or gameplay object bypasses the Community evidence layer.
- [ ] Released records retain classification, certainty, and provenance.
- [ ] Release blockers remain visible rather than being bypassed.

## 6. Architecture

- [ ] The public product remains the Next.js app in `apps/web`.
- [ ] Vercel remains the live review surface.
- [ ] Supabase remains the persistent application data layer.
- [ ] Python is limited to ingestion, processing, analysis, or background tools.
- [ ] Raw source data remains separate from normalized data.
- [ ] Demo fallback is retained when required and clearly labeled.
- [ ] Data-source state is visible when the route depends on Supabase or fallback data.

## 7. Security, Privacy, Rights, and Ownership

- [ ] No secrets, credentials, or private keys are committed.
- [ ] No unnecessary personal or student data is introduced.
- [ ] Authentication or RLS changes receive focused review.
- [ ] Copyright, archive rights, and source restrictions are not ignored.
- [ ] New licenses, contributor terms, datasets, or model-training assumptions do not weaken project ownership without explicit approval.

## 8. Code Quality and Validation

- [ ] Changed behavior has tests, validation, or a documented reason why not.
- [ ] Schema changes include migrations and safe failure behavior.
- [ ] Empty, missing, or unavailable data does not cause fabricated output.
- [ ] Errors are visible and actionable without exposing sensitive internals.
- [ ] `cd apps/web && npm run build` passes for web changes.
- [ ] Repository checks pass.

## 9. Vercel Review

For web-facing changes:

- [ ] Preview deployment loads.
- [ ] The intended route works without relying on a local-only service.
- [ ] Production or preview visibly identifies the active data source where relevant.
- [ ] Supabase-backed behavior works with expected environment variables.
- [ ] Missing Supabase configuration or empty tables fail safely.
- [ ] Mobile and desktop layouts remain usable.
- [ ] No accidental teacher, student, auth, or gameplay surface appears.

## 10. Merge Decision

Choose exactly one:

- **MERGE** — scope, checks, evidence rules, and Vercel review pass.
- **MERGE AFTER MINOR FIX** — no constitutional risk; a small correction is required.
- **DO NOT MERGE** — scope violation, broken checks, unverifiable production behavior, unsafe data behavior, missing provenance, or historical-integrity failure.

The reviewer should record:

1. What changed.
2. Whether the PR obeyed scope.
3. Whether historical and provenance rules were preserved.
4. What was verified on Vercel.
5. The merge decision.
6. The exact next Codex prompt.