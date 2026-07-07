# Building Inference Rules

This document defines how The Mind's Eye may move from direct historical map
evidence to cautious building-level interpretation.

It exists to keep historically grounded buildings useful for gameplay without
presenting imagination as fact.

## Core Rule

Every building-facing output must remain traceable to one of:

1. `verified_fact`
2. `source_based_inference`
3. `fictional_gameplay`

The system must prefer explicit uncertainty over overconfident reconstruction.

## What the Sanborn Sheet Can Verify Directly

The Sanborn sheet may directly support:

- a building's visible labeled identity;
- a business or institutional use when written on the sheet;
- a visible number of stories when shown;
- construction material when shown;
- adjacency to streets, rails, depots, or yards when clearly visible;
- and existence of a structure on the reviewed sheet.

Examples from the current Texarkana reviewed subset:

- `A.S. Blythe. Wagon Yard & Livery.` is a `verified_fact` as a directly
  observed label on reviewed sheet 3.
- `The Arkansaw Cotton Seed Oil Mill.` is a `verified_fact` as a directly
  observed label on reviewed sheet 5.

## What Usually Remains Inference

The system may infer, but must label as `source_based_inference`:

- likely interior functions implied by a verified building label;
- likely work activity associated with a known business type;
- likely movement between adjacent buildings or yards before full extraction;
- likely street assignment when a label is visible on a reviewed sheet but the
  exact parcel anchor is not yet extracted;
- and likely visual massing or exterior treatment used for student-safe map
  rendering.

Examples:

- a verified livery label can support the inference that horses, tack, wagons,
  feed, and stable labor were likely present;
- a verified cotton seed oil mill label can support the inference that pressing
  and storage activity likely occurred in the tract;
- a student-safe rendered building exterior may be generic or inferred even
  when the building identity itself is reviewed.

## What Must Not Be Upgraded Automatically

The system must not automatically upgrade the following into verified history:

- exact parcel geometry from an unextracted reviewed sheet;
- exact interior layout;
- named occupants or owners not shown on the reviewed map evidence;
- persistence of a building identity across years without supporting sources;
- and bespoke building art that visually implies details not actually
  evidenced.

## Abbreviation Rule

Abbreviated map labels require caution.

Examples such as `P.O.` should not become a fully normalized published place
name unless a reviewer has confirmed the intended expansion and use.

Abbreviation expansion may be:

- `source_based_inference` when it is a strong, conventional reading;
- or `verified_fact` only after review and supporting evidence justify the
  normalized form.

## Cross-Sheet Rule

No building should inherit a verified identity from an adjacent sheet
automatically.

Cross-sheet continuity is usually:

- `source_based_inference`

until a reviewer confirms the identity and anchor.

## Suggestion Queue Rule

Portal to Texas History hints, newspaper matches, directory matches, and
similar suggestions remain:

- `source_based_inference`

while they are in the verification queue.

Even a strong hint must not become:

- a verified building identity;
- a published label;
- or bespoke student-facing art

until a human reviewer promotes it.

## Building Art Rule

Building art is downstream from building review.

If the repo only knows that a structure existed, the map may use:

- `footprint_only`
- `neutral_mass`
- or `generic_art_allowed`

If the repo has a reviewed identity but not reviewed visual evidence, the
student view may still use generic or inferred exterior art.

Only reviewed visual evidence can justify `verified` visual detail status.

## Gameplay Rule

Mission details invented for pacing or challenge stay:

- `fictional_gameplay`

Examples:

- a missing ledger hidden in a reviewed livery;
- a named suspect moving through the depot;
- or a sabotage event attached to a historical rail corridor.

These may use real places, but the invented mission element must remain labeled
separately from the building history.

## Current Texarkana Build Boundary

The repo currently supports:

- placeholder building anchors;
- a small reviewed-building subset tied to direct Sanborn labels;
- a review queue for unconfirmed building suggestions;
- and generic or inferred building visuals when reviewed art does not exist.

It does not yet support:

- broad parcel extraction;
- stitched geometry as verified map truth;
- or large-scale bespoke building art generation.
