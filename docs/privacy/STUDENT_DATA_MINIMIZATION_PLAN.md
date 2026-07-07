# Student Data Minimization Plan

This document defines the student-data minimization plan for the Texarkana
1885 prototype.

## Purpose

The prototype should minimize student data collection to the smallest amount
needed for instruction, teacher review, and limited pilot feedback.

## Plan Rules

- Collect the minimum data needed to support the mission and review workflow.
- Do not create saved student profiles.
- Do not store unnecessary student records.
- Keep teacher review data visible and explainable.
- Make any later pilot analytics as non-identifying as possible.

## Data Categories

### Default

- mission responses, only when a teacher is reviewing an artifact;
- teacher notes;
- source citations.

### Conditional

- student artifact text, if a teacher chooses to keep it;
- temporary session progress, if a pilot needs it for the current session only;
- support flags entered by the teacher.

### Prohibited

- student names;
- student IDs;
- student grades;
- student profile records;
- saved writing histories;
- home addresses;
- contact information;
- and always-on analytics profiles.

## Current Texarkana Status

The current repo uses this plan as a pilot-boundary contract only. It does not
implement student rostering or retention services.
