# Teacher Interface Foundation

This document turns the `teacher_review.png` mockup into a repository contract.

The image is not treated as exact product spec. It is a visual target for the
teacher-side foundation.

## Purpose

The future teacher portal should let a reviewer:

- inspect one mission at a time;
- see the mission status at a glance;
- review exact standards and TEKS selection;
- inspect HQIM alignment and historical evidence;
- decide approve, send back, or defer;
- and understand why classroom release is blocked or unlocked.

## Required Sections

The teacher interface foundation should expose these sections as data:

- mission overview;
- standards and TEKS review;
- HQIM alignment;
- historical verification;
- accommodations;
- teacher certification;
- and classroom release.

## Required Summary Cards

The portal should have summary cards for:

- readiness;
- quality;
- and release status.

These cards must remain explicit about what is computed and what is still a
placeholder. The repository should not invent a hidden score or pretend the
teacher has approved a mission when they have not.

## Decision Workspace

The teacher interface must provide a review workspace for:

- the exact standard under review;
- the mission content being reviewed;
- and the current approval decision.

The decision area should support:

- approve;
- send back to tighten alignment;
- and defer.

## Review-State Rule

The teacher interface is not the source of truth.

It should only reflect:

- the mission seed;
- instructional alignment;
- teacher approval state;
- readiness blockers;
- and provenance records.

## Current Texarkana Status

The repository currently seeds:

- the mission packet;
- the HQIM and TEKS alignment contract;
- the explicit teacher review manifest;
- and a teacher-interface packet that can feed a future dashboard.

That is enough to build the shell of the teacher portal without inventing
final classroom approval logic or fake quality metrics.
