# The Mind's Eye

## Project Goal

Build a historically grounded classroom RPG engine that turns primary sources into playable missions.

The first prototype focuses on Texarkana in 1885, using Sanborn Fire Insurance maps, Portal to Texas History API records, OCR newspaper text, city directories, photographs, and other public historical records.

The system should help teachers create D&D-like classroom missions where students explore real towns, real streets, real buildings, and real historical events.

## Non-Negotiable Design Rule

The game may generate dialogue, mystery structure, challenges, choices, and dramatic framing, but it must clearly separate:

1. Verified historical facts
2. Source-based inferences
3. Fictional gameplay additions

Students should always be able to see what came from a primary source and what was created for the mission.

## First Prototype

**Prototype Name:** Texarkana 1885 Quest Engine

### Inputs

- Place: Texarkana, Texas / Arkansas
- Year: 1885
- Source system: Portal to Texas History API
- Map layer: 1885 Sanborn Fire Insurance Map
- Optional sources: newspapers, census records, city directories, photos, county histories

### Outputs

- Real source facts
- Numbered building/location list
- Map-friendly location IDs
- One playable classroom mission
- Teacher-facing source notes
- Student-facing newspaper/mission handout

## Long-Term Vision

Create a repeatable engine that can work for any town with enough historical records.

The teacher chooses a place, year, subject, and standard. The system retrieves historical evidence, builds a playable mission, generates NPCs, prepares classroom materials, and keeps the experience grounded in real source material.
