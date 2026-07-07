# AI Community Pipeline

## Status

This document defines the AI integration architecture for the community-first slice of The Mind's Eye.

The community product uses AI as a candidate generator and asset preparation aid. It does **not** use AI to auto-promote claims, auto-verify history, or auto-publish visual content.

No live AI API is called from this architecture yet unless a safe stub is already configured. No API keys are stored in the repository.

## 1. Product Boundary

The community product is provenance-first and review-first.

AI may help with:

- candidate building matches;
- candidate people and business matches;
- candidate labels;
- candidate source links;
- and illustrative visual assets for layered map and UI surfaces.

AI may not:

- create verified historical claims automatically;
- mark source-backed history as verified without review;
- generate gameplay;
- flatten provenance into one baked output;
- or overwrite reviewed records.

## 2. Two Pipelines

### 2.1 Evidence Assistant Pipeline

Purpose:

- propose candidate buildings, people, businesses, labels, and source links;
- return review-ready suggestions;
- and preserve the source trail for human triage.

Required output status:

- `candidate_pending_review`

Required behavior:

- keep the result separate from verified history;
- expose source IDs and source text references;
- include a provenance note that explains why the suggestion is a candidate;
- and leave the human reviewer as the final authority.

Recommended request kinds:

- `candidate_building`
- `candidate_person`
- `candidate_business`
- `candidate_label`
- `candidate_source_link`
- `candidate_location`

### 2.2 Visual Asset Pipeline

Purpose:

- generate transparent or layered visual assets for buildings, roads, terrain, people, objects, and UI textures;
- keep the asset anchored to a reviewed or candidate record;
- and preserve the historical source trail in the request itself.

Required output status:

- `illustrative`

Required request fields:

- style;
- dimensions;
- transparent_background;
- intended_layer;
- provenance notes;
- at least one source ID;
- and at least one building, location, person, business, or source record reference.

Required behavior:

- every request must remain reviewable;
- every request must state that the asset is illustrative unless a human later reviews it;
- and no generated image may silently become historical fact.

Recommended request kinds:

- `building_art`
- `road_texture`
- `rail_texture`
- `terrain_texture`
- `person_art`
- `object_art`
- `ui_texture`

## 3. Request Contract

Each request in the queue must include:

- `request_id`
- `pipeline`
- `request_kind`
- `target_record_type`
- `target_record_id`
- `source_ids`
- `prompt_id`
- `prompt_version`
- `review_state`
- `output_status`
- `provenance_notes`

Visual asset requests must also include:

- `style`
- `dimensions`
- `transparent_background`
- `intended_layer`

Evidence assistant requests must also include:

- `candidate_label`
- `candidate_summary`

## 4. Record References

Requests may anchor to any of these record types:

- building;
- location;
- person;
- business;
- source.

Rules:

- the target record reference must be explicit;
- source IDs must stay separate from target references;
- queue records must not imply that a candidate is verified history;
- and request text must not bury the evidence trail.

## 5. Prompt Registry

The community AI architecture uses stable prompt IDs.

Current prompt IDs:

- `prompt_community_evidence_assistant_v001`
- `prompt_community_visual_asset_v001`

Prompt files live under:

- `src/mindseye/ai/prompts/knowledge/`
- `src/mindseye/ai/prompts/map/`

Each prompt file must define:

- prompt ID;
- engine;
- status;
- owner;
- input schema;
- output schema;
- provenance requirement;
- and allowed claim types.

## 6. Queue Storage

The sample queue for Texarkana 1885 lives at:

- `data/towns/texarkana/asset_generation_queue.json`

The queue is a controlled inbox. It is not a live API client and it is not an approval engine.

The queue should remain stub-only until a safe runtime stub exists.

## 7. Provenance Rules

The AI pipeline must preserve the same evidence rules used by the rest of the repo:

- raw source records remain separate from normalized records;
- OCR is an aid, not the canonical source of truth;
- candidate outputs remain candidates until human review;
- reviewed history must stay visible;
- and illustrative art must not be confused with verified fact.

## 8. Failure Behavior

When evidence is thin, the pipeline must fail closed:

- return a candidate rather than a verified claim;
- keep uncertain text explicit;
- surface the missing evidence;
- and avoid auto-publishing.

## 9. Non-Goals

This architecture does not yet include:

- live AI API calls;
- API key storage in the repo;
- automatic historical verification;
- broad gameplay generation;
- teacher dashboard generation;
- student dashboard generation;
- or bulk town onboarding.

