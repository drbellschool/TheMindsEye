# Texas Portal / UNT Digital Library Ingestion Spike

## Purpose

This document defines the first ingestion spike for Portal to Texas History / UNT Digital Library source records.

The spike is intentionally narrow:

- search Texas Portal records;
- fetch item metadata when a record is identified;
- cache raw responses locally;
- normalize source metadata into the project's source-record shape;
- and prepare page/OCR excerpts for human source review.

It does **not**:

- create historical claims automatically;
- mark anything verified automatically;
- generate gameplay;
- or scrape the site aggressively.

The adapter is a boundary-layer spike. It is allowed to discover endpoints and preserve raw responses, but it must keep candidate records separate from reviewed history.

## Product Boundary

The community product treats Texas Portal records as evidence candidates until a human reviewer promotes them.

Rules:

- raw source records stay separate from normalized records;
- OCR text is an aid, not the canonical source of truth;
- citation text and rights/access notes must be preserved;
- and no adapter method may promote a record into verified historical truth.

## Discovered Public Surfaces

The current spike uses public UNT/Portal surfaces that are documented on the UNT Digital Library site and on Portal item pages.

Observed public endpoints include:

- search pages, such as `https://texashistory.unt.edu/search/?q=...`;
- item pages, such as `https://texashistory.unt.edu/ark:/67531/metapth1248256/`;
- metadata exports from item pages:
  - `metadata.untl.xml`
  - `metadata.dc.rdf`
  - `metadata.dc.xml`
  - `metadata.mets.xml`
  - `oai/?verb=GetRecord&metadataPrefix=oai_dc&identifier=info:ark/...`
  - `opensearch.xml`
  - `manifest/`
  - `thumbnail/`
  - `small/`
  - `urls.txt`
  - `stats/stats.json?ark=...`

The exact OCR/page-text endpoint is not treated as fixed. The adapter discovers page/OCR candidates from the item page when present and treats those as optional.

## Raw Cache Layout

Raw responses are cached under:

- `data/raw/texas_portal`

Normalized source records are written under:

- `data/normalized/texas_portal`

The cache exists so the adapter can be inspected and replayed without repeated network requests.

## Normalized Output

The normalized output is a source record plus review metadata.

Required output fields:

- `source_id`
- `title`
- `source_type`
- `citation`
- `rights_status`
- `access_level`
- `repository`
- `url`
- `accessed_date`
- `notes`

The adapter also preserves:

- citation fields;
- rights/access fields;
- discovered metadata URLs;
- page/OCR excerpt candidates;
- and the parsed raw metadata payload.

## Source ID Rules

Source IDs must be stable and deterministic.

Current rule:

- if the record has an ARK, generate the source ID from that ARK;
- otherwise, fall back to a stable hash of the item URL or search result URL.

The generated identifier must not imply review or verification.

## Rights / Access Rules

The adapter must preserve rights and access notes from the source record.

It may use conservative heuristics to map explicit rights text into a normalized `rights_status`, but it must not invent stronger rights claims than the source supports.

Recommended statuses:

- `public_domain`
- `copyright_restricted`
- `rights_unclear`
- `rights_unknown`

If the rights text is ambiguous, use the more conservative label.

## Page / OCR Rules

OCR and page text are optional aids.

Rules:

- fetch only targeted candidate resources;
- cache every raw response that is fetched;
- keep OCR text separate from the normalized citation trail;
- and never treat OCR text as a verified historical claim.

When OCR is unavailable, the adapter should still preserve the item page title and metadata-derived excerpts for review context.

## CLI Spike

The spike includes a small command-line entry point for search and item ingestion.

Expected use:

- search for candidate records;
- fetch one item record;
- write raw cache files;
- and emit the normalized record as JSON.

The CLI is for inspection and validation, not for bulk harvesting.

## Endpoint Discovery Notes

The endpoint surface is intentionally documented as a spike because the public UNT/Portal pages expose several related metadata routes and the OCR route may vary by record.

The adapter should:

- build known metadata URLs from the item page/ARK;
- inspect item page links for OCR candidates;
- try the smallest useful fetch set;
- and keep the implementation boundary open for later confirmation.

If a future record exposes a better OCR endpoint, that endpoint can be added as another discovered candidate without changing the historical rules.

## Non-Goals

This spike does not:

- create historical claims;
- auto-promote evidence;
- generate mission text;
- generate building art;
- or connect directly to teacher/student gameplay systems.

Those layers depend on reviewed source records, not on raw source discovery.
