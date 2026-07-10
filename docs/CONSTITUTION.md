# The Mind's Eye Constitution

This document is the highest project authority for product, data, design, and AI-assisted development decisions. When another project document conflicts with this Constitution, this Constitution controls.

## Mission

The Mind's Eye exists to preserve, verify, teach, and experience local history through evidence-first interactive worlds that connect communities, educators, and learners with the past.

The required order is:

1. Preserve evidence.
2. Verify and review historical claims.
3. Release trustworthy historical records.
4. Build educational experiences.
5. Build interactive worlds and gameplay.

## The Golden Rule

> **Nothing in The Mind's Eye exists without provenance.**

Every historical statement, entity, relationship, map feature, image, lesson, mission, NPC, and generated asset must either trace to evidence or explicitly declare that it is illustrative, fictional, unknown, or rejected.

## Article I — Evidence Before Experience

Entertainment, visual polish, speed, and convenience never outrank historical integrity.

The Community verification system is the foundation of the product. Teacher tools, student tools, missions, multiplayer, and gameplay must not be used to bypass unfinished evidence work.

## Article II — AI Proposes; Humans Verify

AI may:

- discover and summarize sources;
- extract candidate records;
- suggest people, businesses, buildings, relationships, and map labels;
- identify possible duplicates;
- draft citations and review notes from supplied evidence;
- generate illustrative assets;
- draft lessons, missions, dialogue, and feedback;
- flag uncertainty, conflicts, and missing evidence.

AI may not:

- silently mark history as verified;
- invent a source or citation;
- convert an inference into a fact;
- conceal uncertainty or conflicting evidence;
- overwrite a human review decision;
- remove provenance;
- present generated art as documentary evidence;
- issue a final student grade without teacher authority.

## Article III — Evidence Classification

Every historically meaningful record must have exactly one evidence classification:

- `verified_fact` — directly supported by reviewed evidence.
- `source_based_inference` — a reasonable interpretation supported by evidence but not directly established.
- `illustrative` — a visual or descriptive reconstruction created to aid understanding.
- `fictional_gameplay` — invented for story, interaction, pacing, or play.
- `unknown` — evidence is missing, conflicting, or insufficient.
- `rejected` — reviewed and determined not to be acceptable as a historical record or candidate.

No default value may imply verification. New AI-generated or imported candidates must begin in a non-verified state.

Evidence classification is separate from workflow status. A record may also carry a review status such as pending, needs evidence, approved, deferred, or rejected.

## Article IV — Honest Uncertainty

Unknown is better than invented.

The system must preserve:

- conflicting sources;
- incomplete names and dates;
- alternate interpretations;
- unresolved identity matches;
- uncertain map alignments;
- missing rights information;
- and review disagreements.

Corrections must be traceable. Historical records must not be silently rewritten.

## Article V — Provenance and Auditability

Every historical record must be able to answer:

- What source supports this?
- Where in the source does the support appear?
- Who or what created the candidate?
- Was AI involved?
- Who reviewed it?
- What changed during review?
- What is its evidence classification?
- What is its certainty?
- Is it released for public, teacher, student, or gameplay use?

Review actions must create append-only review events whenever practical. Destructive edits that erase review history are prohibited.

## Article VI — Data Maturity Pipeline

Historical information follows this pipeline:

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

Stages may be revisited when new evidence appears, but they may not be skipped merely to accelerate a feature.

## Article VII — Product Order

The approved product order is:

```text
Community Evidence System
  -> Source and Provenance Inspector
  -> Map Auditor
  -> Building Auditor
  -> People and Business Auditor
  -> Release Gate
  -> Source Ingestion and Asset Pipelines
  -> Historical World Engine
  -> Teacher Product
  -> Student Product
  -> Assessment and AI Game Master
  -> Classroom and Multiplayer
  -> Additional Towns
```

Until the Community read/write and release-gate model is stable, agents must not expand teacher, student, or gameplay systems except through an explicitly approved exception.

## Article VIII — Release Gate

Historical content is not classroom-ready or gameplay-ready merely because it exists in the database.

A release gate must be able to block or guard release for reasons including:

- unreviewed records;
- unsupported claims;
- missing source links;
- unresolved duplicates;
- unreviewed map layers;
- rights or citation warnings;
- illustrative assets mislabeled as historical evidence;
- unresolved reviewer concerns.

Released content must retain its provenance and evidence classification.

## Article IX — Historical Knowledge Graph

The Mind's Eye must treat relationships as first-class, reviewable records.

Examples include:

- a person owned a business;
- a business occupied a building;
- a building appeared on a map sheet;
- a newspaper mentioned an event;
- a claim was supported by one or more sources;
- a world object was derived from a reviewed Community record.

Relationships must carry the same evidence, certainty, provenance, and review expectations as entities.

## Article X — Town Packages and Scalability

Texarkana is the first implementation, not a hard-coded product boundary.

Every town must use a repeatable town-package contract containing, as available:

- town identity and time window;
- source manifest;
- source records and rights notes;
- maps and map layers;
- buildings, people, businesses, events, and claims;
- relationships and citations;
- review queues and release reports;
- approved educational and world objects.

Adding another town should primarily add data, evidence, configuration, and review work—not require rewriting core product logic.

## Article XI — Education and Teacher Authority

Educational experiences must promote historical inquiry, evidence use, reasoning, and standards-aligned learning.

Teachers retain authority over:

- lesson approval;
- student-visible mission content;
- rubrics;
- final feedback and grades;
- classroom pacing;
- accommodations and instructional decisions.

AI may draft instructional content and feedback, but it must identify source basis, rubric basis, uncertainty, and fictional boundaries.

## Article XII — Production and Review Discipline

The live Next.js application is the product review surface.

The approved architecture is:

- GitHub for source control and pull-request review;
- Next.js in `apps/web` for the product application;
- Vercel for preview and production review;
- Supabase for persistent application data;
- Python for ingestion, transformation, analysis, and background tools—not as the public product shell;
- Codex and other agents as builders;
- human review as the quality and historical-integrity gate.

A meaningful change is not complete merely because it works locally. It must pass repository checks and be reviewable on Vercel when it affects the web product.

## Article XIII — Small, Reviewable Changes

Pull requests should do one coherent thing: one route, schema change, workflow, loader, visual pass, write action, queue, or closely bounded documentation change.

Agents must not conceal scope expansion inside a requested task. New architecture, dependencies, data collection, authentication, student information, licensing terms, or destructive migrations require explicit review.

## Article XIV — Safe Failure

Until production data flows are stable, the application must fail visibly and safely.

Missing environment variables, empty tables, unavailable services, or failed source requests must not:

- crash the entire public review surface;
- fabricate replacement data;
- display demo data as production data;
- or hide the active data source.

Demo fallback may remain while needed, but it must be clearly labeled.

## Article XV — Governance

A pull request must be rejected or revised when it violates this Constitution, even when the code is technically functional.

Changes to this Constitution require an explicit, focused pull request explaining:

- the proposed amendment;
- why it is necessary;
- what safeguards are preserved or changed;
- and which project documents must be updated.

Routine feature work may not amend the Constitution indirectly.

## North Star

The Mind's Eye will become a living historical platform where communities preserve their memory, teachers build rigorous inquiry, students investigate authentic evidence, and interactive worlds make history experiential without sacrificing truth.