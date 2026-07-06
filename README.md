# The Mind's Eye

**The Mind's Eye** is a historically grounded classroom RPG engine.

It uses real historical maps, newspapers, photographs, directories, and archival records to create D&D-like educational missions for students.

## Core Idea

Students do not just read history. They enter it.

A student might say:

> I walk down Fifth Street past the livery.

The system uses a numbered historical map and source database to know where the student is, what buildings are nearby, who may have been there, and what real historical events can become a mission.

## First Build

The first build is the **Texarkana 1885 Quest Engine**.

It will connect:

- 1885 Sanborn Fire Insurance map data
- Portal to Texas History API metadata
- OCR newspaper text when available
- numbered map locations
- teacher-facing source notes
- student-facing playable missions

## Folder Structure

```text
The-Minds-Eye/
  PROJECT_GOAL.md
  README.md
  docs/
  data/
  prompts/
  src/
  tests/
```

## Historical Integrity Rule

Every generated mission must label its claims:

- **Verified fact**: directly supported by a source
- **Inference**: reasonable conclusion from available sources
- **Fictional gameplay**: invented for student engagement

## Prototype Success Criteria

The first successful demo should produce:

1. A list of verified 1885 Texarkana source facts
2. A numbered location/building index
3. A student newspaper-style mission hook
4. A D&D-style mission brief
5. A teacher note showing the source evidence
