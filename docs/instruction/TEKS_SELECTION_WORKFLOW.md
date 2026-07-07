# TEKS Selection Workflow

This document defines the current repository contract for the exact TEKS
selection step.

## Purpose

The teacher must be able to see the exact standards decision boundary before a
mission is released to students.

The repository should support:

- a pending TEKS selection state;
- a teacher review state;
- a rejected or send-back state;
- and a classroom-approved state only when the final TEKS choice is recorded.

## Required Data

The standards workflow should surface:

- the mission ID;
- the town package ID;
- the HQIM seed status;
- the current TEKS status;
- the exact standard under review;
- the teacher authority rule;
- the available decision options;
- and the release gate state.

## Teacher Rule

The teacher remains the final authority.

The system should not invent a standards code or pretend a TEKS choice has
been finalized when it has not.

## Current Texarkana Status

The Texarkana 1885 slice currently seeds:

- one HQIM record;
- one TEKS pending-selection record;
- and a read-only standards workflow packet that can be shown in the teacher
  portal.
