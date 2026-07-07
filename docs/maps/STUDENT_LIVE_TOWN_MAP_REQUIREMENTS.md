# Student Live Town Map Requirements

This document captures the expected end-state direction for the student-facing
town map experience.

It is based on the current product thesis, the rendering-data contract, and the
visual direction represented by the `sample2.png` student dashboard reference.

## Purpose

The student map should feel like a living historical town, not a static archive
viewer and not a generic fantasy minimap.

The experience should let students:

- move through a historically grounded town;
- see where they, classmates, and relevant NPCs are;
- respond to missions and live events;
- inspect places and evidence;
- and understand where the system is certain versus where it is using a safe
  visual fallback.

## Core Student Map Expectations

The student map should eventually support:

- a live town view as the primary student map mode;
- player location beacons;
- classmate location beacons where permissions allow;
- NPC location beacons;
- ally/enemy/event beacons when relevant to mission state;
- location search;
- map zoom and navigation controls;
- layer/filter toggles;
- selected-location details;
- selected-event details;
- quest/task visibility on the map;
- and a class-in-town summary view.

## Beacon and Filter Expectations

The student interface should support filters for at least:

- players;
- quests;
- NPCs;
- locations;
- and events.

Expected beacon categories include:

- you;
- classmates;
- allies;
- NPCs;
- and enemies.

These are gameplay/runtime overlays, not historical source records.

They must never overwrite or redefine the historical map data itself.

## Building Presentation Rule

The student should still see a coherent town even when the evidence base for a
specific building is incomplete.

That means:

- if the Sanborn map confirms a building footprint but no stronger source
  confirms identity, the map may still render a generic visually pleasing
  building asset;
- but that generic asset must not imply a verified business identity, owner, or
  interior;
- and the selected-location panel must make clear when the system only knows
  that a building existed at that place during the mapped period.

Allowed fallback states:

- reviewed identity plus reviewed art;
- reviewed footprint plus inferred art;
- reviewed footprint plus generic art;
- reviewed footprint only;
- or neutral massing only.

Not allowed:

- specific confident labels or bespoke artwork presented as historical fact when
  the evidence only proves a structure existed.

## Selected Location Panel Requirements

When a student selects a place, the panel should distinguish:

- what is historically verified;
- what is source-based inference;
- what is illustrative or gameplay-facing;
- and what is still unknown.

The panel should eventually be able to show:

- location name;
- location type;
- reviewed identity status;
- visual detail status;
- source support strength;
- key features;
- teacher-safe notes;
- and a path to evidence or teacher-facing provenance when allowed.

## Live Event Requirements

The student map should support live event panels or overlays for things like:

- railroad sabotage;
- town emergencies;
- debates or civic meetings;
- science fieldwork;
- and mission-critical time windows.

These event views may show:

- event title;
- time remaining;
- involved factions or teams;
- location anchor;
- recommended actions;
- and success/failure implications.

Event overlays are runtime gameplay structures and must remain separate from
historical fact records.

## Class Visibility Requirements

The student interface may show where classmates are in town when appropriate.

It should also support a class summary view that can show:

- player name;
- current location;
- current task or status;
- and whether the student is gathering, researching, planning, writing, or in a
  live event.

This feature must still respect teacher authority, privacy, and later safety
rules.

## Teacher and Review Separation

The student map is not the same thing as the teacher or review map.

The product should maintain three distinct roles:

### Student Dashboard

Shows:

- the live playable town;
- safe location/event/task overlays;
- approved or classroom-safe labels;
- and student-facing status indicators.

### Teacher Dashboard

Shows:

- where students are in town;
- active mission and event state;
- evidence-linked location details;
- current class distribution;
- and teacher controls for classroom use.

### Community / Admin / Teacher Review Dashboard

Shows:

- candidate building identities;
- candidate person/business/location matches;
- evidence packets from Sanborn, Portal to Texas History, directories, and
  other sources;
- approval/reject/defer controls;
- and provenance/review history.

This review dashboard is the verification workspace that improves map accuracy
over time.

## Human Verification Hint Workflow

The end-state system should support a suggestion workflow similar to a
research-hint or "green leaf" model.

Meaning:

- the system may surface likely candidate matches from the Portal to Texas
  History and other sources;
- those candidates may be useful and even strong;
- but they are not facts until a human reviewer confirms them.

Candidate suggestion states should include:

- suggested;
- under review;
- confirmed;
- rejected;
- and insufficient evidence.

A candidate suggestion must never automatically become:

- a verified building identity;
- a verified person-place link;
- a published location label;
- or a specific student-facing building art identity.

## Build-Order Rule

Before implementing the full student live town view, the repository should
define:

- the building-data contract;
- the rendering-data contract;
- review-state handling for suggested identities;
- beacon categories and permissions;
- and fallback behavior for generic or unknown buildings.

The student should eventually see a beautiful town map, but beauty must remain
subordinate to provenance, review, and teacher authority.
