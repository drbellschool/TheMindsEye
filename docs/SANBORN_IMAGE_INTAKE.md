# Sanborn Image Intake

This workflow is for locally reviewing the five public-domain Library of
Congress Texarkana 1885 Sanborn sheets without committing large image files.

## Cache Location

Place downloaded sheet images in this ignored local directory:

```text
data/towns/texarkana/local_cache/sanborn_1885/
```

The repository `.gitignore` excludes `data/towns/*/local_cache/`, so JPEG,
PNG, TIFF, or other downloaded map binaries should not enter git history.

## Expected Filenames

Use the stable sheet IDs as filenames. Prefer the LOC JPEG derivative from each
sheet download page when available:

```text
sheet_texarkana_1885_sanborn_001.jpg
sheet_texarkana_1885_sanborn_002.jpg
sheet_texarkana_1885_sanborn_003.jpg
sheet_texarkana_1885_sanborn_004.jpg
sheet_texarkana_1885_sanborn_005.jpg
```

The source sheet pages are listed in:

```text
data/towns/texarkana/sanborn_1885_sheet_manifest.json
data/towns/texarkana/sanborn_1885_asset_manifest.json
```

## Validate Intake

Run:

```bash
python scripts/validate_sanborn_intake.py
```

For JSON output:

```bash
python scripts/validate_sanborn_intake.py --json
```

The validator maps local files back to known sheet IDs, records byte size,
SHA-256 checksum, and image dimensions when it can read them. Unknown filenames
are rejected.

## Boundary

This workflow does not stitch, georeference, or extract building-level claims
from the Sanborn sheets. Any future location or claim derived from these images
must stay labeled as `source_based_inference` until reviewed against the source.
Fictional gameplay must remain separate from historical claims.
