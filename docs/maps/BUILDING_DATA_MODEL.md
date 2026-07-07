# Building Data Model

This document defines the building-level data contract that sits between the
historical map layer and the later building-art layer.

It exists so the project can render a coherent town without pretending that
every building identity, owner, or interior is already historically verified.

## Purpose

The building model must separate:

- a map/location anchor;
- building existence status;
- building identity status;
- student-safe fallback rendering;
- and future reviewed art references.

This keeps the repo aligned with the rule that verified history, inference, and
fictional gameplay must stay explicit.

## Core Building Record

Each building record should identify:

- `building_id`
- `location_id`
- `map_id`
- `source_ids`
- `supporting_claim_ids`
- `suggestion_ids`
- `anchor_status`
- `existence_status`
- `identity_status`
- `identity_basis`
- `reviewed_label`
- `historical_function`
- `visual_detail_status`
- `default_render_mode`
- `student_safe_name`
- visibility flags
- and review notes

## Required Meanings

### Anchor Status

The record must say whether the anchor is:

- `placeholder_location_seed`
- `reviewed_location_anchor`
- or `reviewed_footprint_anchor`

This prevents the system from silently treating a placeholder as extracted
geometry.

### Existence Status

The record must distinguish whether the system only has:

- `placeholder_presence`
- `source_based_presence`
- or `verified_sanborn_presence`

### Identity Status

The record must distinguish whether the building identity is:

- `unknown`
- `suggested`
- `reviewed`
- or `approved`

If identity is `unknown`, the record must not carry a reviewed historical label.

### Identity Basis

The identity basis must be one of:

- `unassigned`
- `verified_fact`
- `source_based_inference`
- `fictional_gameplay`

For unknown identities, the basis should remain `unassigned`.

## Fallback Rendering Rule

The building model must allow a student-safe town view even when identity is
not yet known.

That means a building record may allow:

- `footprint_only`
- `neutral_mass`
- `generic_art_allowed`
- or later `reviewed_art_only`

If `generic_art_allowed` is used, the visual detail status must remain
`inferred` or `illustrative`, not `verified`.

## Student-Safe Name Rule

Each building record should carry a `student_safe_name`.

For unknown buildings this can be a neutral label such as:

- `Unknown Building`

This allows the town to look complete without inventing specific business
identities.

## Relationship to Suggestions

The building record does not automatically decide what a building is.

Instead, it links to suggestion IDs that point into the human-review queue.

Those linked suggestions may inform later promotion, but they do not become
student-facing facts by themselves.

## Relationship to Future Building Art

Later building-art records must reference reviewed building or location anchors.

The building model is the intermediate layer that allows:

- stable IDs;
- provenance-aware fallback rendering;
- review-state tracking;
- and later transparent-background art upgrades.

## Current Texarkana Status

The current repo implementation seeds a small Texarkana building manifest with:

- placeholder location anchors;
- generic-art fallback allowed;
- no reviewed building identities yet;
- and linked review suggestions kept separate from published facts.
