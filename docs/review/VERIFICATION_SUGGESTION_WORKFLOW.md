# Verification Suggestion Workflow

This document defines the review-queue contract for candidate matches that come
from the Portal to Texas History, directories, newspapers, and similar sources.

The system may suggest. A human must confirm.

## Purpose

The suggestion workflow exists so the repo can:

- surface likely building, business, or person-place matches;
- help teachers, admins, or trusted reviewers work faster;
- and still prevent unreviewed hints from becoming classroom facts.

## Queue States

Every suggestion record must be in one of these states:

- `suggested`
- `under_review`
- `confirmed`
- `rejected`
- `insufficient_evidence`

These are workflow states, not historical truth labels.

## Required Suggestion Fields

Each suggestion record should identify:

- `suggestion_id`
- `target_building_id`
- `location_id`
- `suggestion_type`
- `status`
- `candidate_label`
- `source_ids`
- `suggestion_origin`
- `confidence`
- `historical_basis`
- `auto_publish`
- `student_visible`
- and `review_notes`

## Non-Negotiable Rules

### No Auto-Publish

Every suggestion must keep:

- `auto_publish = false`

No suggestion should automatically become:

- a verified building identity;
- a public label;
- a teacher-facing fact packet;
- or a student-facing art identity.

### Hidden from Students

Every suggestion must keep:

- `student_visible = false`

Students should see approved classroom-safe outcomes, not unresolved review
queue noise.

### Historical Basis

Suggestion records stay:

- `source_based_inference`

Even a confirmed suggestion is still a workflow record until a human promotes
the result into a reviewed building record, location record, claim, label, or
art decision.

## Promotion Rule

Confirmation in the queue is necessary but not sufficient.

The system should require a second explicit step that promotes the result into:

- a reviewed building identity;
- a reviewed place label;
- or a reviewed art/render decision

This prevents queue history from being confused with canonical town data.

## Dashboard Roles

### Student Dashboard

Shows:

- only classroom-safe map outputs;
- generic fallback buildings when identity is unknown;
- and no suggestion queue records.

### Teacher Dashboard

Shows:

- reviewed facts;
- mission-facing location details;
- and, when appropriate, the status of relevant suggestions.

### Community / Admin / Teacher Review Dashboard

Shows:

- full candidate queues;
- evidence packets;
- confirm/reject/defer decisions;
- and review history

This is the working surface for improving town accuracy over time.

## Current Texarkana Status

The current repo seeds a small suggestion manifest for Texarkana 1885 with:

- candidate building identity hints;
- no auto-publishing;
- no student visibility;
- and explicit notes that the current placeholder hints are not publishable
  evidence.
