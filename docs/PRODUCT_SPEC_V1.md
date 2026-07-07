# The Mind's Eye Product Specification v1.0

This is the authoritative product specification for The Mind's Eye current vision.

## Product Vision

The Mind's Eye is not simply a game with educational content added.

It is a historically accurate, AI-powered instructional world where authentic historical evidence, standards-based learning, adaptive instruction, and student agency are integrated into a single reusable framework.

Gameplay exists to support learning, not the other way around.

The platform begins with Texarkana, but it must be designed as a repeatable system that can create additional towns through data, review, approval, and publication rather than code rewrites.

## Launch Priority

The platform must launch. The current vision is large, but development must remain disciplined around a usable first release.

The first launchable version should prove:

1. one town package: Texarkana;
2. one historically grounded map layer;
3. one building/location evidence model;
4. one standards-aligned teacher-generated mission;
5. one student mission flow;
6. teacher-visible citations and provenance;
7. and a clear path toward community review and repeatable town onboarding.

## 1. Historical World Engine

The core of the platform is a Historical Digital Twin of real communities.

Required capabilities:

- historical town simulation;
- living world;
- persistent world;
- AI-generated but historically grounded scenarios;
- source-driven world building;
- time progression;
- consequence system;
- reputation system;
- NPC memory;
- living economy;
- dynamic events.

The historical world engine must keep gameplay constrained by historical evidence, provenance labels, and teacher control.

## 2. Historical Sources

Supported historical datasets include:

- Sanborn Fire Insurance Maps;
- Portal to Texas History;
- newspapers;
- photographs;
- city directories;
- census records;
- railroad records;
- church records;
- court records;
- school records;
- oral histories;
- property records.

Every piece of historical data should store:

- citation;
- source;
- confidence;
- review status;
- date;
- AI confidence;
- community approval.

## 3. Historical Digital Twin

Every town becomes a searchable database.

Every building should eventually store:

- building ID;
- address;
- coordinates;
- footprint;
- roof type;
- construction;
- stories;
- owner;
- business;
- occupants;
- years active;
- interior;
- objects;
- inventory;
- citations.

Unknown values must stay unknown. AI may infer, but only with explicit provenance labels.

## 4. Sanborn Map Builder

The Sanborn Map Builder is one of the largest systems in the product.

Pipeline:

```text
Import
↓
Stitch Sheets
↓
Extract Buildings
↓
Extract Labels
↓
Extract Streets
↓
Extract Businesses
↓
Assign IDs
↓
Community Review
↓
Approve
↓
Generate Beautiful Playable Map
```

Required features:

- zoomable map;
- beautiful roof rendering;
- street labels;
- building labels;
- numbered buildings;
- building interiors;
- empty buildings when unknown;
- generic but visually coherent buildings when only existence is known;
- historically accurate placement;
- AI confidence;
- community approval before publishing.

The Sanborn map is not background art. It is the spatial evidence layer for the town.

## 5. Town Onboarding Framework

New towns should not require code changes.

Pipeline:

```text
Choose Town
↓
Gather Sources
↓
Extract
↓
Review
↓
Approve
↓
Publish
↓
Playable
```

The framework should support:

- Wichita Falls;
- Waco;
- San Antonio;
- any future town with sufficient historical sources.

## 6. Town Universe

The town universe is not limited to one map year.

A town package may use an approximate 10-year historical window around a map year.

Example:

- 1885 Sanborn map;
- 1880-1890 newspapers;
- directories;
- photographs;
- court records;
- other source materials.

The universe should surround the map and enrich it with people, businesses, events, institutions, conflicts, economy, and daily life.

## 7. Content Coverage System

Every town should track a coverage score.

Example coverage categories:

- maps: 100%;
- newspapers: 82%;
- photos: 31%;
- directories: 91%;
- church bulletins: 12%.

Coverage score determines scenario readiness. The system should not generate certain scenarios if the evidence base is too thin.

## 8. Community Dashboard

Community members help build and verify local history.

Community dashboard review areas:

- buildings;
- businesses;
- roads;
- people;
- ownership;
- labels;
- sources;
- candidate suggestions from source-matching systems;
- approvals;
- moderation;
- town censorship when appropriate for local governance and educational policy;
- historical corrections.

Community review must improve historical accuracy without allowing unverified claims to become facts.

Suggested matches from the Portal to Texas History, directories, newspapers,
and other source systems must remain review candidates until a human confirms
them.

## 9. Provenance System

Everything is classified.

Required classifications:

- verified fact;
- historical inference;
- simulation element;
- creative licensing.

Every object knows what it is. Every source-based claim must preserve its evidence and confidence.

## 10. AI World Builder

The AI World Builder uses historical sources to create the digital town.

Process:

```text
Historical sources
↓
Digital town
↓
NPCs
↓
Objects
↓
Scenarios
```

The AI World Builder must be constrained by the provenance system. It may build, infer, and dramatize, but it must not mislabel unsupported details as verified history.

## 11. Adaptive Mission Engine

Mission generation is not random.

Mission selection should be based on:

- current TEKS;
- student mastery;
- intervention needs;
- teacher goals;
- student interests;
- world state;
- historical events.

Supported mission types:

- individual missions;
- team missions;
- whole-class missions.

## 12. Intervention System

When students struggle, the town naturally asks for help.

Examples:

- judge needs assistance;
- editor needs writer;
- merchant needs math;
- doctor needs science;
- surveyor needs measurements.

Students should receive more practice naturally through missions, not through disconnected remediation worksheets.

## 13. Teacher Dashboard

Teacher chooses:

- subject;
- grade;
- TEKS;
- mission length;
- mission complexity;
- historical year;
- town;
- accommodations;
- translation;
- mission type;
- whole class;
- small group;
- individual.

Teacher sees:

- student locations;
- mastery;
- evidence;
- mission status;
- live event status;
- AI confidence;
- time;
- reports.

The teacher dashboard is the command center for instruction, not just an assignment screen.

## 14. Student Dashboard

The student dashboard should show:

- character;
- current mission;
- current location;
- inventory;
- map;
- map filters;
- live events;
- classmate markers where appropriate;
- NPC markers where appropriate;
- journal;
- telegrams;
- evidence;
- skills;
- mastery progress;
- town reputation;
- professional titles.

## 15. Standards-Based Gradebook

The gradebook should use 1-4 mastery.

Scale:

- 1 = Beginning;
- 2 = Developing;
- 3 = Proficient;
- 4 = Advanced.

Mission grade should automatically convert mastery approximately to a 60-100 grade range.

Incomplete should only occur if the student does nothing.

Grades must be explainable and connected to evidence, not black-box AI scoring.

## 16. Character Progression

Students become stronger by mastering standards, not by grinding.

Examples:

ELAR:

- better interviewing;
- persuasion;
- writing.

Math:

- surveying;
- engineering;
- commerce.

Science:

- observation;
- labs;
- experiments.

Social Studies:

- leadership;
- government;
- community trust.

## 17. Professional Roles

Students unlock professional roles such as:

- surveyor;
- editor;
- railroad inspector;
- merchant;
- deputy clerk;
- telegraph operator;
- naturalist;
- court reporter;
- other historically appropriate roles.

Roles should connect to standards, mission types, student mastery, and world reputation.

## 18. Experience Engine

Real-world learning experiences can update the simulation.

Examples:

- science labs;
- water testing;
- gardens;
- bridge testing;
- weather stations;
- engineering;
- speech;
- writing;
- projects.

The real classroom and the simulation should reinforce each other.

## 19. Assessment Artifact Framework

Students create artifacts such as:

- newspapers;
- editorials;
- letters;
- court briefs;
- lab reports;
- engineering notebooks;
- presentations;
- historical markers;
- council proposals;
- mission reports.

Teacher uploads or selects a rubric.

AI may compare student work to the rubric, but the teacher can override.

## 20. ELAR Integration

Writing becomes authentic.

Examples:

- newspaper;
- telegram;
- witness statement;
- court appeal;
- editorial;
- historical report;
- business proposal.

ELAR work should emerge from mission needs and historical context.

## 21. Science Integration

Real labs should update the simulation.

Examples:

- water quality;
- crop growth;
- weather;
- bridge safety;
- environment.

Science should not be pasted onto the game. The world should create reasons to observe, test, measure, hypothesize, and report.

## 22. Historical Communication Engine

Supported communication systems:

- telegrams;
- Pony Express where historically appropriate;
- letters;
- courier delivery;
- costs;
- distance;
- urgency;
- word count.

AI responses should be historically grounded.

Teacher moderation, teacher ownership, and safety review are required.

## 23. Justice System

The historical simulation may include:

- sheriff;
- deputies;
- court;
- judge;
- jury;
- lawyers;
- warrants;
- consequences.

If students break laws inside the simulation, consequences should be handled inside the simulation.

The teacher must always be informed.

## 24. Railroad Engine

The railroad engine may include:

- train schedules;
- passenger trains;
- freight;
- mail;
- livestock;
- circus trains;
- military;
- railroad companies;
- depot operations;
- cargo;
- passengers;
- special events.

The railroad system should connect to history, commerce, communication, travel, and missions.

## 25. Commerce Engine

The commerce engine may include:

- businesses;
- inventory;
- supply chain;
- prices;
- trade;
- markets;
- seasonality;
- deliveries;
- merchants.

Commerce should support math, economics, social studies, logistics, and mission consequences.

## 26. Inventory System

The inventory system may include:

- historical items;
- evidence;
- money;
- maps;
- tools;
- food;
- keys;
- telegrams;
- letters;
- quest items;
- trade goods.

Inventory should support mission logic and learning evidence.

## 27. World Presence Engine

The living town should feel visible and alive.

Possible visible entities:

- students;
- NPCs;
- dogs;
- horses;
- livestock;
- travelers;
- railroad workers;
- church members;
- construction crews;
- crowds.

Animals and people should appear naturally, not all at once.

## 28. Multi-Class Support

The platform should support:

- many teachers;
- many classes;
- one shared town;
- students visible where appropriate;
- teacher controls for their own students;
- shared historical world.

Multi-class support must still respect privacy, permissions, safety, and teacher authority.

## 29. Map Features

Required map features include:

- zoom;
- interiors;
- roofs;
- street names;
- building labels;
- building numbers;
- players;
- classmate markers;
- NPCs;
- quest markers;
- event markers;
- search;
- layer toggles;
- animals;
- vehicles;
- shops;
- movement.

## 30. Travel System

Supported travel modes may include:

- walking;
- horse;
- train;
- wagon;
- boat;
- travel time;
- random encounters;
- group travel;
- individual travel.

Travel must respect historical time, location, and available transportation.

## 31. Consequence System

Student choices matter.

Good choices:

- town remembers.

Bad choices:

- town remembers.

The consequence system should connect to reputation, mission access, NPC memory, and the persistent world ledger.

## 32. World Ledger

The world ledger stores:

- events;
- player history;
- buildings changed;
- businesses changed;
- town history;
- persistent campaigns.

The world ledger is how the world remembers.

## 33. HQIM Alignment

The platform should be built around high-quality instructional material principles:

- authentic tasks;
- knowledge building;
- evidence;
- discussion;
- writing;
- mastery;
- teacher support;
- standards alignment.

HQIM is not optional. It is the difference between a game and a serious instructional system.

## 34. Accessibility

The platform should support:

- 504;
- Special Education;
- English Learners;
- vocabulary coaching;
- translation;
- scaffolds;
- teacher accommodations;
- supports embedded into missions.

Accessibility should be built into mission generation and student experience, not added afterward.

## 35. AI Image Generation

AI image generation may support:

- historical NPCs;
- buildings;
- students;
- portraits;
- town maps;
- artifacts;
- historical scenes;
- student avatars.

Generated visuals must respect safety, historical uncertainty, and provenance.

## 36. AI Engines

The platform may use specialized AI services:

- Historical Source Engine;
- City Builder;
- Learning Engine;
- Assessment Engine;
- NPC Engine;
- Teacher Copilot;
- Student Copilot;
- Translation Engine;
- Accessibility Engine;
- Image Engine;
- Analytics Engine;
- Mission Engine.

These should be orchestrated with clear inputs, outputs, safeguards, tests, and provenance rules.

## 37. Governance

The platform requires governance for:

- community review;
- approval;
- historical verification;
- versioning;
- moderation;
- content review;
- safety.

Governance keeps the world trustworthy and school-safe.

## 38. Repeatable Architecture

No code changes should be required for new towns.

Everything should be data-driven.

Repeatable pipeline:

```text
Import
Review
Approve
Publish
```

A new town should be a new town package, not a new application.

## 39. Classroom Management

Teacher sees:

- all students;
- mission progress;
- current location;
- communications;
- telegrams;
- behavior flags;
- mastery;
- intervention.

Classroom management should support instruction and safety without turning the platform into surveillance-first software.

## 40. Core Philosophy

The platform is not a game with educational content added.

It is a historically accurate, AI-powered instructional world where authentic historical evidence, standards-based learning, adaptive instruction, and student agency are integrated into a single reusable framework.

Gameplay exists to support learning, not the other way around.

## Required Product Specification Sections Going Forward

Future specification work should be organized into these sections:

- Product Vision;
- Educational Framework;
- Technical Architecture;
- Data Model;
- Town Onboarding Specification;
- AI Orchestration;
- Teacher Experience;
- Student Experience;
- Community Experience;
- Assessment & Analytics;
- Deployment & Scalability.

## Agent Rule

Agents must read this file before major design or implementation work.

If an agent's proposed change ignores this product specification, the change is off-track even if it is technically correct.
