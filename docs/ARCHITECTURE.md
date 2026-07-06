# The Mind's Eye Architecture

This document is the architecture contract for **The Mind's Eye**. It is written for Adam Bell, human contributors, Codex, and future AI agents.

## Architecture Position

The Mind's Eye should be designed from the beginning as a repeatable historical simulation platform, not as a one-off Texarkana game.

That does **not** mean the first build should attempt every town, every school subject, or every game mechanic. It means the first build should prove the repeatable architecture with one narrow vertical slice.

The correct balance is:

> **Design for many towns. Build only Texarkana 1885 first.**

This is not scope creep. It is the core product thesis. If town scalability is postponed until later, the first prototype may become a hard-coded historical demo that is expensive to generalize. The first prototype should therefore use a town-package contract even if only one town package exists at first.

## North Star

The first working system should prove this loop:

1. Ingest real historical source material.
2. Connect source facts to a numbered Sanborn/location map.
3. Distinguish verified fact, source-based inference, and fictional gameplay.
4. Generate one playable classroom mission.
5. Show teacher-facing citations and source notes.
6. Let students experience local history as an explorable world.

## First Prototype Boundary

The first prototype is the **Texarkana 1885 Quest Engine**.

It should include:

- one town package: `texarkana`;
- one approximate historical period: 1885;
- one map layer based on Sanborn Fire Insurance map evidence;
- a numbered building/location index;
- a small set of verified facts and source-based inferences;
- one student-facing mission;
- one teacher-facing source note;
- a citation/provenance display pattern;
- and a narrow interaction loop that can be tested.

It should not attempt yet:

- full multiplayer at scale;
- every school subject;
- every Texas standard;
- every historical source type;
- open-world generation without constraints;
- automatic support for all towns;
- production student rostering;
- or district-level deployment.

## Core Design Rule

The product must always separate:

1. **Verified historical facts** — directly supported by source evidence.
2. **Source-based inferences** — reasonable conclusions based on available evidence.
3. **Fictional gameplay additions** — invented for engagement, challenge, pacing, or story.

No AI-generated mission, NPC line, map description, classroom handout, or teacher note should blur these categories.

## Four-Engine Architecture

The system should be organized around four conceptual engines. The exact code folders may evolve, but these boundaries should remain clear.

### 1. World / Map Engine

Purpose: represent the explorable historical town.

Responsibilities:

- streets;
- intersections;
- buildings;
- numbered locations;
- movement rules;
- map bounds;
- historical time window;
- spatial relationship between places;
- and map-linked source evidence.

The Sanborn map is not decorative. It is a gameplay and reasoning layer. A student should eventually be able to say something like:

> I walk down Fifth Street past the livery.

The system should know whether that movement makes sense inside the mapped town.

### 2. Knowledge / Provenance Engine

Purpose: manage evidence, citations, confidence, and historical claims.

Responsibilities:

- source records;
- citation metadata;
- claims;
- confidence levels;
- source chains;
- inferred relationships;
- historical uncertainty;
- retrieval over source text;
- and claim inspection for teachers/students.

Core principle:

> Nothing historical in the world should exist without provenance.

This does not mean every detail must be fully verified. It means the system must label whether a detail is verified, inferred, or fictional.

### 3. Story / Mission Engine

Purpose: turn teacher goals and historical evidence into playable missions.

Responsibilities:

- teacher-selected subject;
- grade level;
- standard or learning target;
- mission hook;
- mission objective;
- NPC dialogue;
- clue structure;
- challenge design;
- student handouts;
- and teacher notes.

The Story Engine may create dramatic framing, but it must respect the Knowledge / Provenance Engine.

### 4. Game / Classroom Engine

Purpose: run the classroom experience.

Responsibilities:

- player/session state;
- student choices;
- group progress;
- classroom pacing;
- clue inventory;
- teacher controls;
- mission completion;
- and later multiplayer behavior.

The first prototype may use a simple classroom loop instead of a full game engine.

## Town Package Contract

A town should be treated as a content/data package connected to the shared engine.

A future structure may look like this:

```text
data/
  towns/
    texarkana/
      metadata.json
      timeline.json
      sources/
      maps/
      places/
      buildings/
      businesses/
      people/
      events/
      claims/
      citations/
      missions/
```

For the first prototype, this structure may be lightweight, but the code should avoid hard-coding Texarkana-specific assumptions into the engine.

### Minimum Town Package Fields

A town package should eventually define:

- town name;
- state/region;
- time window;
- source manifest;
- map layers;
- street names;
- location IDs;
- building records;
- known businesses;
- known people;
- known events;
- historical claims;
- citations;
- confidence labels;
- and allowed mission settings.

### Rule for Expansion

Adding a new town should primarily mean adding structured historical data and source records, not rewriting the core engine.

This should guide every early code decision.

## Provenance Model

Every historically meaningful claim should have a provenance record.

A claim should eventually include:

```json
{
  "claim_id": "claim_texarkana_1885_0001",
  "claim_text": "Example historical claim.",
  "claim_type": "verified_fact | source_based_inference | fictional_gameplay",
  "confidence": "high | medium | low | fictional",
  "related_entities": ["building_001", "person_001"],
  "sources": ["source_001"],
  "reasoning_note": "Short explanation of why this claim is labeled this way.",
  "student_visible": true,
  "teacher_visible": true
}
```

### Citation Strength Concept

The interface may represent support strength visually:

- single-source support: subtle citation icon;
- multiple independent sources: stronger citation indicator;
- inference: distinct icon or label;
- fictional gameplay: clearly marked as invented.

This should be implemented carefully so the citation display improves historical thinking instead of cluttering gameplay.

## Inference Rules

The system may infer likely relationships when sources are incomplete, but it must label those relationships honestly.

Examples:

- If a newspaper mentions an event at a business and the map identifies the business location, the system may connect the event to that location.
- If a directory names a business owner and a Sanborn map identifies the business building, the system may infer a likely owner-building connection.
- If a source gives a partial name, the system may suggest candidate matches only with a confidence label.

The system must not present guesses as verified facts.

## Source Ingestion Architecture

The first ingestion work should be boring and reliable.

Priority order:

1. Source manifest.
2. Raw source record.
3. Normalized source record.
4. Extracted claim.
5. Entity link.
6. Citation link.
7. Mission use.

Suggested data areas:

```text
data/
  raw/
  normalized/
  towns/
  schemas/
  citations/
  eval_sets/
```

Raw data should be preserved separately from normalized data.

Normalized data should never destroy the source trail.

## AI Agent Readiness Rules

AI agents may help build the project, but they must obey the architecture contract.

Agents should:

- read `README.md`, `PROJECT_GOAL.md`, this file, and `AGENTS.md` before coding;
- preserve the fact / inference / fiction boundary;
- avoid hard-coding Texarkana into reusable engine code;
- add or update tests when changing behavior;
- add schema validation before adding complex data;
- document any new architectural decision;
- and keep the MVP focused on the Texarkana 1885 vertical slice.

Agents should not:

- casually restructure the repository;
- replace the prototype goal with a large platform build;
- build unsupported AI behavior without evals;
- mix provenance logic into mission prose generation without clear labels;
- ingest copyrighted or restricted source content without source-rights notes;
- collect student data before privacy rules are defined;
- or create production deployment assumptions without documenting them.

## MVP Implementation Sequence

### Phase 0 — Specification Gate

Before heavy Codex implementation, add or confirm:

- `ARCHITECTURE.md`;
- `AGENTS.md`;
- town package spec;
- provenance model;
- prompt registry;
- MVP roadmap;
- data/source manifest pattern;
- testing expectations;
- and IP/privacy cautions.

### Phase 1 — Static Historical Dataset

Build a small hand-curated Texarkana 1885 dataset:

- source records;
- map locations;
- buildings;
- claims;
- citations;
- and confidence labels.

No AI magic yet. Get the data shape right first.

### Phase 2 — Provenance-Aware Mission Generator

Generate one mission from the dataset.

The output must include:

- student hook;
- mission objective;
- NPC/context text;
- claim labels;
- citations;
- and teacher notes.

### Phase 3 — Map-Linked Interaction

Connect mission locations to numbered map/building IDs.

The student should be able to reason spatially inside the historical town.

### Phase 4 — Teacher Review Layer

Add teacher-facing controls:

- view claims;
- inspect citations;
- approve/edit mission text;
- see which parts are fact, inference, or fiction;
- and export/use classroom materials.

### Phase 5 — Classroom Pilot Preparation

Before real students use the system, add:

- privacy baseline;
- no unnecessary student data collection;
- deletion/retention posture;
- pilot agreement templates;
- and basic usage analytics that do not expose student PII unless absolutely necessary.

## Grant Readiness Alignment

The architecture should support non-dilutive grant framing.

Strong grant framing:

> The Mind's Eye is a provenance-aware AI historical simulation platform that helps teachers generate standards-aligned, evidence-based learning missions from local primary sources.

The technical novelty is not simply that AI writes missions. The technical novelty is the combination of:

- town-package architecture;
- map-linked historical simulation;
- claim-level provenance;
- confidence-labeled inference;
- teacher-directed mission generation;
- and classroom-ready historical inquiry.

## Final Architecture Decision

The system should remain simple in early implementation, but not conceptually one-off.

The approved direction is:

> Build the Texarkana 1885 prototype as the first town package in a repeatable engine. Do not hard-code the project into a single-town demo. Do not expand the MVP beyond what is needed to prove that repeatable engine.
