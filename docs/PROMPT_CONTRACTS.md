# Prompt Contracts

This document defines how prompts must be written and reviewed for **The Mind's Eye**.

## Purpose

Prompts are part of the product architecture. They are not disposable chat messages.

Every production prompt must define:

- stable prompt ID;
- purpose;
- owning engine/layer;
- expected inputs;
- expected outputs;
- required provenance behavior;
- failure behavior;
- and tests/evals.

## Prompt ID Format

Use this format:

```text
prompt_<engine>_<purpose>_v001
```

Examples:

```text
prompt_knowledge_extract_claims_v001
prompt_story_generate_mission_seed_v001
prompt_teacher_generate_source_notes_v001
```

## Required Prompt Header

Every prompt file should begin with:

```yaml
prompt_id: prompt_story_generate_mission_seed_v001
engine: story_mission
status: draft
owner: The Mind's Eye
input_schema: mission-seed.schema.json
output_schema: mission-output.schema.json
requires_provenance: true
allowed_claim_types:
  - verified_fact
  - source_based_inference
  - fictional_gameplay
```

## Non-Negotiable Provenance Behavior

Any prompt that generates mission text, NPC dialogue, source notes, map descriptions, or student materials must obey these rules:

1. It must not invent verified historical facts.
2. It must label source-based inferences as inferences.
3. It must label invented classroom/gameplay material as fictional gameplay.
4. It must preserve claim IDs when using historical claims.
5. It must surface missing evidence instead of hiding it.
6. It must leave the teacher as the final authority.

## Prompt Categories

### Knowledge / Provenance Prompts

Examples:

- extract claims from OCR text;
- classify claim type;
- link claims to source records;
- infer possible person/business/location relationships;
- summarize uncertainty.

Required outputs:

- claim text;
- claim type;
- confidence;
- source IDs;
- reasoning note;
- uncertainty note when needed.

### Story / Mission Prompts

Examples:

- generate mission hook;
- generate classroom mission outline;
- generate NPC dialogue;
- generate student handout;
- generate teacher notes.

Required outputs:

- mission title;
- objective;
- historical claims used;
- fictional elements used;
- student-facing text;
- teacher-facing notes;
- source notes;
- warning if evidence is insufficient.

### Map / World Prompts

Examples:

- describe nearby locations;
- explain movement options;
- summarize a building's known/inferred purpose.

Required outputs:

- location IDs;
- known map facts;
- inferred map relationships;
- unknown/uncertain details;
- source IDs.

## Failure Behavior

Prompts must fail safe.

If evidence is insufficient, the model should say:

```text
Insufficient evidence to verify this as historical fact. Treat as source-based inference or fictional gameplay unless additional evidence is added.
```

The model should never fill a gap by pretending certainty.

## Eval Requirements

Each production prompt should have tests for:

- verified fact preserved correctly;
- inference labeled correctly;
- fictional addition labeled correctly;
- unsupported claim rejected;
- citation/source ID preserved;
- teacher note generated;
- student-facing output not overloaded with citations;
- and hallucination attempt blocked.

## Prompt Storage

Prompts should live under:

```text
prompts/
  knowledge/
  story/
  map/
  teacher/
  evals/
```

Prompt files should be committed with matching eval examples before they are used in production code.
