# Database Architecture

The PostgreSQL database is the persistence foundation for the town-package, source, provenance, location, and mission seed layers. It is intentionally narrow for the Texarkana 1885 prototype and does not include gameplay state, student accounts, multiplayer, district deployment, or broad AI generation.

## Local Database

Start PostgreSQL locally:

```bash
cp .env.example .env
docker compose up -d postgres
```

Import the current Texarkana town package:

```bash
python scripts/import_town.py --apply-schema
```

The importer reads `data/towns/texarkana/*.json`, applies `src/mindseye/db/schema.sql` when requested, and replaces the existing database rows for the same `town_package_id` inside one transaction. The live database import requires `psycopg`; the validation and unit tests do not require a running database.

## Scope

The database stores:

- town package metadata;
- raw and normalized source records;
- map-linked locations;
- historical claims with claim type and confidence labels;
- claim-to-source links;
- claim-to-location links;
- mission seeds;
- mission-to-claim links;
- mission-to-location links.

The database does not store:

- student accounts;
- rosters;
- gameplay sessions;
- multiplayer state;
- district configuration;
- generated mission prose beyond the curated mission seed JSON already in the town package.

## Provenance Boundary

Every historically meaningful claim must keep one of these labels:

- `verified_fact`
- `source_based_inference`
- `fictional_gameplay`

The `claims` table uses a check constraint for valid claim types and confidence labels. It also requires `fictional_gameplay` claims to use `fictional` confidence, and prevents `verified_fact` or `source_based_inference` claims from using fictional confidence.

The importer adds the source-trail rule that SQL cannot express cleanly without triggers:

- `verified_fact` and `source_based_inference` claims must link to at least one source record;
- `fictional_gameplay` claims may have no source links, but must remain labeled as fictional;
- source IDs, location IDs, claim IDs, and mission links are copied directly from the town-package JSON.

Unknown historical details must remain unknown. The database supports inference, but it does not upgrade inferred or fictional content into verified history.

## Table Summary

### `town_packages`

One row per town package. The current package is `texarkana_1885`. The row stores the town name, region, time window, status, source manifest path, and the original metadata JSON in `raw_record`.

### `source_records`

Source metadata from `sources.json`. The table preserves the source ID, citation, rights status, access level, repository, URL, notes, and original source JSON.

### `locations`

Map-linked locations from `locations.json`. The table preserves the stable location ID, map ID, label, street, location type, source IDs, certainty, notes, and original location JSON.

### `claims`

Claim records from `claims.json`. The table preserves the stable claim ID, claim text, claim type, confidence label, visibility flags, reasoning note, and original claim JSON.

### `claim_sources`

Join table linking claims to source records. This is the citation trail used by teacher-facing source notes and future evidence inspection.

### `claim_locations`

Join table linking claims to map locations. This keeps historical facts and inferences attached to stable location IDs.

### `mission_seeds`

Mission seed records from `mission_seed.json`. The table stores the stable mission ID, town package ID, title, teacher goal, student hook, teacher notes, fictional elements, and original mission JSON.

### `mission_claims`

Join table linking mission seeds to claims. This ensures a mission can show which claims are verified facts, source-based inferences, or fictional gameplay additions.

### `mission_locations`

Join table linking mission seeds to locations. This keeps mission activity map-aware without building gameplay movement yet.

## Design Notes

The normalized tables are for reliable lookup and joins. The `raw_record` JSONB columns are for auditability and future schema migration. Raw records are preserved so the database layer does not destroy the town-package source trail.

The schema is town-agnostic. Texarkana is the first package, not a hard-coded engine assumption.
