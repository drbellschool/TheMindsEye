# Pilot Privacy and Data-Use Notes

This document captures the pilot-facing data-use notes for The Mind's Eye.

## What Is Collected By Default

The prototype is designed to avoid collecting student PII by default.

By default, the repo only works with:

- teacher-reviewed town package data;
- mission seed data;
- source records;
- location records;
- claim records;
- and teacher-facing review packets.

## What Should Not Be Collected In The Prototype

The prototype should not collect:

- student names;
- student IDs;
- student grades;
- student profile records;
- or saved student writing histories.

## Why Data Would Be Collected In A Pilot

If a limited classroom pilot later requires additional data, it should only be
for clearly stated instructional reasons such as:

- teacher review of mission artifacts;
- evidence-based feedback;
- or limited pilot analytics that do not expose student PII unless absolutely necessary.

## Access And Retention Notes

- Teachers remain the final instructional authority.
- Pilot materials must explain who can access data.
- Pilot materials must explain how long data is retained.
- Pilot materials must explain how deletion requests are handled.

## AI Limitations

- AI may draft, organize, and surface evidence.
- AI must not silently replace teacher judgment.
- AI must not imply that student data is stored when it is not.
- AI must not infer private student attributes from mission behavior.

## Current Prototype Status

The current repository uses this note set as a pilot safety boundary only. It
does not implement student rostering, production analytics, or a live retention
service.
