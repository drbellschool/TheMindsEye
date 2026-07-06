# Product Priority Capture

Date captured: 2026-07-05

This document preserves Adam Bell's clarified product priorities so they are not lost, overwritten, minimized, or reduced to a generic game build.

## Highest Priority

The Mind's Eye must launch.

The project can hold many ambitious ideas, but every architecture and agent decision should serve the goal of getting a working version built, tested, and usable.

## Core Product Definition

The Mind's Eye is an AI-powered learning system for grades 7-12 that lets students learn core subject content through roleplay in their town's history.

The first town is Texarkana, but the system must be designed so other towns can be created through the same repeatable pipeline.

The correct product direction is:

> A standards-based AI learning platform where students complete individual, group, and class missions inside a historically reconstructed version of their community.

## Standards and Subjects

The system should support grades 7-12 core subjects and connect learning experiences to TEKS.

Teacher generation should not be only creative mission writing. It must produce standards-aligned instructional content.

The system should eventually show standards at a glance per student so teachers can see what has been attempted, practiced, or demonstrated.

## Three Dashboard Model

The product should include three major user-facing areas.

### 1. Community Dashboard

Purpose: community/map verification and historical accuracy support.

The community dashboard should allow trusted users or reviewers to:

- review map accuracy;
- inspect stitched Sanborn map layers;
- check streets;
- check addresses;
- review building labels;
- confirm or challenge what a building is called;
- add or review evidence;
- and help improve local historical accuracy.

This is not just a public website. It is part of the accuracy engine.

### 2. Teacher Dashboard

Purpose: teacher planning, mission generation, standards alignment, review, grading, and intervention.

The teacher dashboard should allow teachers to:

- select grade level;
- select subject;
- select TEKS or learning standards;
- generate missions from the town-history universe;
- review claims, citations, and fictional elements before use;
- assign individual, group, or class missions;
- monitor progress;
- view standards at a glance;
- see MTSS-related supports or intervention flags;
- and receive a grade or score that can be entered into the gradebook during an interim period.

The teacher remains the instructional authority.

### 3. Student Console / Dashboard

Purpose: student gameplay, learning progress, mission completion, reflection, and leveling.

The student console should allow students to:

- enter the historical town;
- complete missions;
- work individually;
- work in groups;
- participate in class missions;
- collect clues/evidence;
- level up;
- earn perks;
- see progress;
- and demonstrate mastery through mission outputs.

The student experience should feel like a meaningful new way of doing school, not just a worksheet wrapped in a game skin.

## Sanborn Map System

The Sanborn map system is foundational.

The project needs an entire system for:

- identifying Sanborn map sheets;
- stitching map sheets together;
- checking streets;
- checking addresses;
- confirming building labels;
- assigning stable building IDs;
- connecting map regions to evidence;
- slowly adding additional maps as they are confirmed;
- and eventually connecting map locations to a real GPS/geospatial system where appropriate.

Sanborn maps are not background art. They are the base spatial layer for the learning universe.

## Building Verification and Visualization

Once the base map layer is established, the system should allow building-level verification and reconstruction.

The user should be able to see a building as part of the map and confirm what the system is calling it.

Building records should track:

- known label;
- inferred label;
- address or block location;
- Sanborn sheet reference;
- building type;
- source evidence;
- confidence level;
- and reviewer/community verification status.

## Rooftop / Cutaway Building Generation

After the map is solid, AI should help generate a visual building layer.

Desired behavior:

- If the building can be identified, AI may generate building details using source-supported and clearly labeled inference.
- The view should feel like looking through or beneath the roof/rooftop into the building's likely use or interior.
- If the building cannot be identified, it should remain only a roof or generic exterior marker.
- Unknown buildings must not be filled with fake detail.

This protects historical integrity while still allowing the world to become visually engaging.

## Texas History API and Historical Universe

Once the map base is solid, the system should use the Portal to Texas History API:

https://texashistory.unt.edu/api/

Purpose:

- gather factual data around the Sanborn map;
- connect newspapers, maps, directories, photos, and records;
- build the surrounding historical universe;
- identify people, businesses, events, and local context;
- connect evidence to buildings, streets, and missions;
- and preserve citations and confidence labels.

The historical universe should surround the map, not float separately from it.

## Mission Generation

Teachers should be able to generate content for a specific:

- class;
- subject;
- grade level;
- TEKS/standard;
- student group;
- instructional purpose;
- and town/time period.

Missions should be possible at multiple levels:

- individual missions;
- group missions;
- class missions.

Mission generation must use the map, building evidence, historical source universe, standards, and teacher intent.

It should not produce generic historical fiction.

## Student Progression, Levels, and Perks

Students should be able to level up and earn perks for completing missions.

These mechanics should motivate engagement, but they must support learning rather than replace it.

Progression should connect to:

- standards attempted;
- standards demonstrated;
- mission completion;
- evidence collection;
- reflection/writing;
- collaboration;
- and teacher-approved mastery outputs.

## MTSS Integration

The system should eventually function as part of an MTSS support structure.

This means missions and dashboards should help identify, support, and track:

- students needing extra help;
- students needing enrichment;
- missing prerequisite skills;
- repeated struggle patterns;
- intervention assignments;
- small-group mission pathways;
- and standards-level progress.

MTSS should be embedded into the learning/game system, not bolted on afterward.

## Standards-at-a-Glance and Gradebook Support

Teachers need standards visibility.

The system should include a standards-at-a-glance view per student.

It should also provide a teacher-facing grade, score, or evidence summary that can be entered into the gradebook during an interim period.

This gradebook support must be explainable and based on mission evidence, not a black-box AI score.

## Agent Build Warning

Agents must not reduce this project to:

- a generic D&D clone;
- a simple historical fiction generator;
- a map viewer only;
- a dashboard-only school app;
- or a disconnected AI lesson generator.

The project is all of these systems working together:

1. standards-based learning;
2. Sanborn/map reconstruction;
3. historical source universe;
4. community verification;
5. teacher generation/review;
6. student mission console;
7. MTSS/progress tracking;
8. citation/provenance integrity;
9. and repeatable town-package architecture.

## Launch Discipline

The project should remain ambitious but launch-focused.

The first launchable version should prove:

1. one town package: Texarkana;
2. one map-linked historical layer;
3. one building/location evidence system;
4. one standards-aligned teacher-generated mission;
5. one student mission flow;
6. teacher-visible citations;
7. and a clear path toward community review and future town replication.
