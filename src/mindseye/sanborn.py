from __future__ import annotations

import hashlib
from datetime import date
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import MindseyeDataError, TownPackage, require_text, require_text_tuple
from .town_loader import load_json, load_town_package, repo_root_from


@dataclass(frozen=True)
class SanbornSheetRecord:
    sheet_id: str
    sheet_number: int
    title: str
    date: str
    source_id: str
    map_id: str
    loc_resource_url: str
    download_formats_observed: tuple[str, ...]
    status: str
    derived_location_ids: tuple[str, ...]
    derived_claim_ids: tuple[str, ...]
    notes: str = ""

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "SanbornSheetRecord":
        return cls(
            sheet_id=require_text(raw, "sheet_id", "sanborn sheet"),
            sheet_number=require_int(raw, "sheet_number", "sanborn sheet"),
            title=require_text(raw, "title", "sanborn sheet"),
            date=require_text(raw, "date", "sanborn sheet"),
            source_id=require_text(raw, "source_id", "sanborn sheet"),
            map_id=require_text(raw, "map_id", "sanborn sheet"),
            loc_resource_url=require_text(raw, "loc_resource_url", "sanborn sheet"),
            download_formats_observed=require_text_tuple(
                raw, "download_formats_observed", "sanborn sheet"
            ),
            status=require_text(raw, "status", "sanborn sheet"),
            derived_location_ids=require_text_tuple(
                raw, "derived_location_ids", "sanborn sheet", allow_empty=True
            ),
            derived_claim_ids=require_text_tuple(
                raw, "derived_claim_ids", "sanborn sheet", allow_empty=True
            ),
            notes=str(raw.get("notes", "")),
        )


@dataclass(frozen=True)
class SanbornSheetManifest:
    manifest_id: str
    manifest_type: str
    town_package_id: str
    map_id: str
    source_id: str
    title: str
    item_id: str
    resource_id: str
    loc_item_url: str
    loc_gallery_url: str
    iiif_manifest_url: str
    iiif_manifest_status: str
    created_published: str
    date: str
    sheet_count: int
    repository: str
    rights_status: str
    credit_line: str
    stitching_status: str
    location_extraction_status: str
    derived_location_ids: tuple[str, ...]
    derived_claim_ids: tuple[str, ...]
    claim_boundary: dict[str, str]
    download_options_observed_on_item_page: tuple[str, ...]
    sheets: tuple[SanbornSheetRecord, ...]

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "SanbornSheetManifest":
        sheets = require_object_list(raw, "sheets", "sanborn manifest")
        claim_boundary = require_text_mapping(raw, "claim_boundary", "sanborn manifest")
        return cls(
            manifest_id=require_text(raw, "manifest_id", "sanborn manifest"),
            manifest_type=require_text(raw, "manifest_type", "sanborn manifest"),
            town_package_id=require_text(raw, "town_package_id", "sanborn manifest"),
            map_id=require_text(raw, "map_id", "sanborn manifest"),
            source_id=require_text(raw, "source_id", "sanborn manifest"),
            title=require_text(raw, "title", "sanborn manifest"),
            item_id=require_text(raw, "item_id", "sanborn manifest"),
            resource_id=require_text(raw, "resource_id", "sanborn manifest"),
            loc_item_url=require_text(raw, "loc_item_url", "sanborn manifest"),
            loc_gallery_url=require_text(raw, "loc_gallery_url", "sanborn manifest"),
            iiif_manifest_url=require_text(raw, "iiif_manifest_url", "sanborn manifest"),
            iiif_manifest_status=require_text(raw, "iiif_manifest_status", "sanborn manifest"),
            created_published=require_text(raw, "created_published", "sanborn manifest"),
            date=require_text(raw, "date", "sanborn manifest"),
            sheet_count=require_int(raw, "sheet_count", "sanborn manifest"),
            repository=require_text(raw, "repository", "sanborn manifest"),
            rights_status=require_text(raw, "rights_status", "sanborn manifest"),
            credit_line=require_text(raw, "credit_line", "sanborn manifest"),
            stitching_status=require_text(raw, "stitching_status", "sanborn manifest"),
            location_extraction_status=require_text(raw, "location_extraction_status", "sanborn manifest"),
            derived_location_ids=require_text_tuple(
                raw, "derived_location_ids", "sanborn manifest", allow_empty=True
            ),
            derived_claim_ids=require_text_tuple(
                raw, "derived_claim_ids", "sanborn manifest", allow_empty=True
            ),
            claim_boundary=claim_boundary,
            download_options_observed_on_item_page=require_text_tuple(
                raw, "download_options_observed_on_item_page", "sanborn manifest"
            ),
            sheets=tuple(SanbornSheetRecord.from_dict(sheet) for sheet in sheets),
        )


@dataclass(frozen=True)
class SanbornAssetRecord:
    asset_record_id: str
    sheet_id: str
    sheet_number: int
    source_id: str
    map_id: str
    download_page_url: str
    direct_binary_url: str
    asset_url_status: str
    preferred_review_format: str
    local_cache_path: str
    checksum_sha256: str
    observed_download_options: tuple[str, ...]
    notes: str = ""

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "SanbornAssetRecord":
        return cls(
            asset_record_id=require_text(raw, "asset_record_id", "sanborn asset"),
            sheet_id=require_text(raw, "sheet_id", "sanborn asset"),
            sheet_number=require_int(raw, "sheet_number", "sanborn asset"),
            source_id=require_text(raw, "source_id", "sanborn asset"),
            map_id=require_text(raw, "map_id", "sanborn asset"),
            download_page_url=require_text(raw, "download_page_url", "sanborn asset"),
            direct_binary_url=str(raw.get("direct_binary_url", "")),
            asset_url_status=require_text(raw, "asset_url_status", "sanborn asset"),
            preferred_review_format=require_text(raw, "preferred_review_format", "sanborn asset"),
            local_cache_path=str(raw.get("local_cache_path", "")),
            checksum_sha256=str(raw.get("checksum_sha256", "")),
            observed_download_options=require_text_tuple(
                raw, "observed_download_options", "sanborn asset", allow_empty=True
            ),
            notes=str(raw.get("notes", "")),
        )


@dataclass(frozen=True)
class SanbornAssetManifest:
    asset_manifest_id: str
    manifest_type: str
    town_package_id: str
    map_id: str
    source_id: str
    sheet_manifest_id: str
    title: str
    repository: str
    rights_status: str
    binary_files_committed: bool
    stitching_status: str
    georeferencing_status: str
    location_extraction_status: str
    automated_fetch_status: str
    large_binary_policy: str
    runtime_notes: tuple[str, ...]
    asset_count: int
    assets: tuple[SanbornAssetRecord, ...]

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "SanbornAssetManifest":
        assets = require_object_list(raw, "assets", "sanborn asset manifest")
        return cls(
            asset_manifest_id=require_text(raw, "asset_manifest_id", "sanborn asset manifest"),
            manifest_type=require_text(raw, "manifest_type", "sanborn asset manifest"),
            town_package_id=require_text(raw, "town_package_id", "sanborn asset manifest"),
            map_id=require_text(raw, "map_id", "sanborn asset manifest"),
            source_id=require_text(raw, "source_id", "sanborn asset manifest"),
            sheet_manifest_id=require_text(raw, "sheet_manifest_id", "sanborn asset manifest"),
            title=require_text(raw, "title", "sanborn asset manifest"),
            repository=require_text(raw, "repository", "sanborn asset manifest"),
            rights_status=require_text(raw, "rights_status", "sanborn asset manifest"),
            binary_files_committed=require_bool(raw, "binary_files_committed", "sanborn asset manifest"),
            stitching_status=require_text(raw, "stitching_status", "sanborn asset manifest"),
            georeferencing_status=require_text(raw, "georeferencing_status", "sanborn asset manifest"),
            location_extraction_status=require_text(raw, "location_extraction_status", "sanborn asset manifest"),
            automated_fetch_status=require_text(raw, "automated_fetch_status", "sanborn asset manifest"),
            large_binary_policy=require_text(raw, "large_binary_policy", "sanborn asset manifest"),
            runtime_notes=require_text_tuple(raw, "runtime_notes", "sanborn asset manifest"),
            asset_count=require_int(raw, "asset_count", "sanborn asset manifest"),
            assets=tuple(SanbornAssetRecord.from_dict(asset) for asset in assets),
        )


@dataclass(frozen=True)
class SanbornImageIntakeFile:
    sheet_id: str
    filename: str
    path: str
    byte_size: int
    checksum_sha256: str
    width_px: int | None
    height_px: int | None


@dataclass(frozen=True)
class SanbornImageMetadataRecord:
    image_record_id: str
    asset_record_id: str
    sheet_id: str
    sheet_number: int
    filename: str
    local_cache_relpath: str
    byte_size: int
    checksum_sha256: str
    width_px: int
    height_px: int
    source_id: str
    map_id: str
    download_page_url: str
    rights_status: str
    origin_repository: str
    capture_status: str

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "SanbornImageMetadataRecord":
        checksum = require_text(raw, "checksum_sha256", "sanborn image metadata")
        if len(checksum) != 64 or any(character not in "0123456789abcdef" for character in checksum.lower()):
            raise MindseyeDataError("sanborn image metadata checksum must be 64 lowercase hex characters")
        return cls(
            image_record_id=require_text(raw, "image_record_id", "sanborn image metadata"),
            asset_record_id=require_text(raw, "asset_record_id", "sanborn image metadata"),
            sheet_id=require_text(raw, "sheet_id", "sanborn image metadata"),
            sheet_number=require_int(raw, "sheet_number", "sanborn image metadata"),
            filename=require_text(raw, "filename", "sanborn image metadata"),
            local_cache_relpath=require_text(raw, "local_cache_relpath", "sanborn image metadata"),
            byte_size=require_positive_int(raw, "byte_size", "sanborn image metadata"),
            checksum_sha256=checksum.lower(),
            width_px=require_positive_int(raw, "width_px", "sanborn image metadata"),
            height_px=require_positive_int(raw, "height_px", "sanborn image metadata"),
            source_id=require_text(raw, "source_id", "sanborn image metadata"),
            map_id=require_text(raw, "map_id", "sanborn image metadata"),
            download_page_url=require_text(raw, "download_page_url", "sanborn image metadata"),
            rights_status=require_text(raw, "rights_status", "sanborn image metadata"),
            origin_repository=require_text(raw, "origin_repository", "sanborn image metadata"),
            capture_status=require_text(raw, "capture_status", "sanborn image metadata"),
        )


@dataclass(frozen=True)
class SanbornImageMetadataManifest:
    image_metadata_manifest_id: str
    manifest_type: str
    town_package_id: str
    map_id: str
    source_id: str
    sheet_manifest_id: str
    asset_manifest_id: str
    title: str
    captured_date: str
    capture_method: str
    rights_status: str
    origin_repository: str
    binary_files_committed: bool
    stitching_status: str
    georeferencing_status: str
    location_extraction_status: str
    image_count: int
    images: tuple[SanbornImageMetadataRecord, ...]

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "SanbornImageMetadataManifest":
        images = require_object_list(raw, "images", "sanborn image metadata manifest")
        return cls(
            image_metadata_manifest_id=require_text(
                raw, "image_metadata_manifest_id", "sanborn image metadata manifest"
            ),
            manifest_type=require_text(raw, "manifest_type", "sanborn image metadata manifest"),
            town_package_id=require_text(raw, "town_package_id", "sanborn image metadata manifest"),
            map_id=require_text(raw, "map_id", "sanborn image metadata manifest"),
            source_id=require_text(raw, "source_id", "sanborn image metadata manifest"),
            sheet_manifest_id=require_text(raw, "sheet_manifest_id", "sanborn image metadata manifest"),
            asset_manifest_id=require_text(raw, "asset_manifest_id", "sanborn image metadata manifest"),
            title=require_text(raw, "title", "sanborn image metadata manifest"),
            captured_date=require_text(raw, "captured_date", "sanborn image metadata manifest"),
            capture_method=require_text(raw, "capture_method", "sanborn image metadata manifest"),
            rights_status=require_text(raw, "rights_status", "sanborn image metadata manifest"),
            origin_repository=require_text(raw, "origin_repository", "sanborn image metadata manifest"),
            binary_files_committed=require_bool(raw, "binary_files_committed", "sanborn image metadata manifest"),
            stitching_status=require_text(raw, "stitching_status", "sanborn image metadata manifest"),
            georeferencing_status=require_text(raw, "georeferencing_status", "sanborn image metadata manifest"),
            location_extraction_status=require_text(
                raw, "location_extraction_status", "sanborn image metadata manifest"
            ),
            image_count=require_int(raw, "image_count", "sanborn image metadata manifest"),
            images=tuple(SanbornImageMetadataRecord.from_dict(item) for item in images),
        )


def load_sanborn_sheet_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = "sanborn_1885_sheet_manifest.json",
) -> SanbornSheetManifest:
    """Load and validate the verified LOC Sanborn sheet manifest.

    This records only source-level metadata. It does not extract building
    locations, generate historical claims, or create gameplay content.
    """
    root = repo_root_from(repo_root)
    manifest_path = root / "data" / "towns" / town_slug / filename
    raw_manifest = load_json(manifest_path)
    if not isinstance(raw_manifest, dict):
        raise MindseyeDataError("sanborn manifest must be a JSON object")

    manifest = SanbornSheetManifest.from_dict(raw_manifest)
    package = load_town_package(root, town_slug)
    assert_sanborn_manifest_links(manifest, package)
    return manifest


def load_sanborn_asset_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = "sanborn_1885_asset_manifest.json",
) -> SanbornAssetManifest:
    """Load and validate the LOC Sanborn asset acquisition manifest."""
    root = repo_root_from(repo_root)
    manifest_path = root / "data" / "towns" / town_slug / filename
    raw_manifest = load_json(manifest_path)
    if not isinstance(raw_manifest, dict):
        raise MindseyeDataError("sanborn asset manifest must be a JSON object")

    asset_manifest = SanbornAssetManifest.from_dict(raw_manifest)
    sheet_manifest = load_sanborn_sheet_manifest(root, town_slug)
    assert_sanborn_asset_manifest_links(asset_manifest, sheet_manifest)
    return asset_manifest


def load_sanborn_image_metadata_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    filename: str = "sanborn_1885_image_metadata.json",
) -> SanbornImageMetadataManifest:
    """Load and validate committed metadata for locally validated Sanborn images."""
    root = repo_root_from(repo_root)
    manifest_path = root / "data" / "towns" / town_slug / filename
    raw_manifest = load_json(manifest_path)
    if not isinstance(raw_manifest, dict):
        raise MindseyeDataError("sanborn image metadata manifest must be a JSON object")

    image_metadata_manifest = SanbornImageMetadataManifest.from_dict(raw_manifest)
    asset_manifest = load_sanborn_asset_manifest(root, town_slug)
    assert_sanborn_image_metadata_manifest_links(image_metadata_manifest, asset_manifest)
    return image_metadata_manifest


def build_sanborn_image_intake_report(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    cache_dir: Path | None = None,
) -> dict[str, object]:
    """Return a local image intake report without creating claims or locations."""
    root = repo_root_from(repo_root)
    sheet_manifest = load_sanborn_sheet_manifest(root, town_slug)
    asset_manifest = load_sanborn_asset_manifest(root, town_slug)
    resolved_cache_dir = (
        cache_dir
        if cache_dir is not None
        else root / "data" / "towns" / town_slug / "local_cache" / "sanborn_1885"
    )
    expected = expected_sanborn_image_files(sheet_manifest)
    present = scan_sanborn_image_cache(resolved_cache_dir, sheet_manifest)
    present_sheet_ids = {record.sheet_id for record in present}

    return {
        "cache_dir": str(resolved_cache_dir),
        "cache_is_ignored": True,
        "binary_files_committed": asset_manifest.binary_files_committed,
        "stitching_status": asset_manifest.stitching_status,
        "georeferencing_status": asset_manifest.georeferencing_status,
        "location_extraction_status": asset_manifest.location_extraction_status,
        "expected_files": expected,
        "present_files": [intake_file_to_dict(record) for record in present],
        "missing_sheet_ids": [
            sheet.sheet_id for sheet in sheet_manifest.sheets if sheet.sheet_id not in present_sheet_ids
        ],
    }


def build_sanborn_image_metadata_manifest(
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    cache_dir: Path | None = None,
    captured_date: str | None = None,
) -> dict[str, object]:
    """Build a metadata-only manifest for validated local Sanborn sheet images."""
    root = repo_root_from(repo_root)
    asset_manifest = load_sanborn_asset_manifest(root, town_slug)
    intake_report = build_sanborn_image_intake_report(root, town_slug, cache_dir)
    present_files = intake_report.get("present_files")
    if not isinstance(present_files, list):
        raise MindseyeDataError("sanborn image intake report returned invalid present_files")
    if len(present_files) != asset_manifest.asset_count:
        raise MindseyeDataError("sanborn image metadata manifest requires all expected images to be present")

    assets_by_sheet_id = {asset.sheet_id: asset for asset in asset_manifest.assets}
    images: list[dict[str, object]] = []
    for present_file in present_files:
        if not isinstance(present_file, dict):
            raise MindseyeDataError("sanborn image intake report returned invalid present file record")
        sheet_id = require_text(present_file, "sheet_id", "sanborn image intake report")
        asset = assets_by_sheet_id.get(sheet_id)
        if asset is None:
            raise MindseyeDataError(f"sanborn image intake file references unknown sheet: {sheet_id}")
        width_px = present_file.get("width_px")
        height_px = present_file.get("height_px")
        if not isinstance(width_px, int) or not isinstance(height_px, int) or width_px <= 0 or height_px <= 0:
            raise MindseyeDataError(f"sanborn image {sheet_id} must have positive dimensions")

        images.append(
            {
                "image_record_id": asset.asset_record_id.replace("asset_", "image_", 1),
                "asset_record_id": asset.asset_record_id,
                "sheet_id": sheet_id,
                "sheet_number": asset.sheet_number,
                "filename": require_text(present_file, "filename", "sanborn image intake report"),
                "local_cache_relpath": relpath_within_repo(root, Path(require_text(present_file, "path", "sanborn image intake report"))),
                "byte_size": require_positive_int(present_file, "byte_size", "sanborn image intake report"),
                "checksum_sha256": require_text(
                    present_file, "checksum_sha256", "sanborn image intake report"
                ).lower(),
                "width_px": width_px,
                "height_px": height_px,
                "source_id": asset.source_id,
                "map_id": asset.map_id,
                "download_page_url": asset.download_page_url,
                "rights_status": asset_manifest.rights_status,
                "origin_repository": asset_manifest.repository,
                "capture_status": "validated_local_derivative",
            }
        )

    normalized_date = captured_date or date.today().isoformat()
    return {
        "image_metadata_manifest_id": "sanborn_texarkana_1885_loc_image_metadata_manifest",
        "manifest_type": "loc_sanborn_image_metadata_manifest",
        "town_package_id": asset_manifest.town_package_id,
        "map_id": asset_manifest.map_id,
        "source_id": asset_manifest.source_id,
        "sheet_manifest_id": asset_manifest.sheet_manifest_id,
        "asset_manifest_id": asset_manifest.asset_manifest_id,
        "title": "Sanborn Fire Insurance Map from Texarkana, Bowie County, Texas, October 1885 image metadata manifest",
        "captured_date": normalized_date,
        "capture_method": "manual_loc_download_then_local_validation",
        "rights_status": asset_manifest.rights_status,
        "origin_repository": asset_manifest.repository,
        "binary_files_committed": False,
        "stitching_status": asset_manifest.stitching_status,
        "georeferencing_status": asset_manifest.georeferencing_status,
        "location_extraction_status": asset_manifest.location_extraction_status,
        "image_count": len(images),
        "images": images,
    }


def expected_sanborn_image_files(manifest: SanbornSheetManifest) -> list[dict[str, object]]:
    return [
        {
            "sheet_id": sheet.sheet_id,
            "sheet_number": sheet.sheet_number,
            "filename": f"{sheet.sheet_id}.jpg",
            "download_page_url": sheet.loc_resource_url,
        }
        for sheet in manifest.sheets
    ]


def scan_sanborn_image_cache(
    cache_dir: Path,
    manifest: SanbornSheetManifest,
) -> tuple[SanbornImageIntakeFile, ...]:
    sheet_ids = {sheet.sheet_id for sheet in manifest.sheets}
    if not cache_dir.exists():
        return ()
    if not cache_dir.is_dir():
        raise MindseyeDataError(f"sanborn image cache is not a directory: {cache_dir}")

    unknown_files: list[str] = []
    records: list[SanbornImageIntakeFile] = []
    for path in sorted(item for item in cache_dir.iterdir() if item.is_file()):
        if path.name.startswith("."):
            continue
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            unknown_files.append(path.name)
            continue
        if path.stem not in sheet_ids:
            unknown_files.append(path.name)
            continue

        dimensions = read_image_dimensions(path)
        records.append(
            SanbornImageIntakeFile(
                sheet_id=path.stem,
                filename=path.name,
                path=str(path),
                byte_size=path.stat().st_size,
                checksum_sha256=sha256_file(path),
                width_px=dimensions[0],
                height_px=dimensions[1],
            )
        )

    if unknown_files:
        raise MindseyeDataError("unknown Sanborn intake file(s): " + ", ".join(unknown_files))
    return tuple(records)


def assert_sanborn_manifest_links(manifest: SanbornSheetManifest, package: TownPackage) -> None:
    if manifest.manifest_type != "loc_sanborn_sheet_manifest":
        raise MindseyeDataError("sanborn manifest has unsupported manifest_type")
    if manifest.town_package_id != package.package_id:
        raise MindseyeDataError("sanborn manifest town_package_id does not match package")
    if manifest.source_id not in package.source_ids:
        raise MindseyeDataError(f"sanborn manifest references missing source: {manifest.source_id}")

    map_ids = {str(layer["map_id"]) for layer in package.map_layers}
    if manifest.map_id not in map_ids:
        raise MindseyeDataError(f"sanborn manifest references missing map: {manifest.map_id}")
    if manifest.sheet_count != len(manifest.sheets):
        raise MindseyeDataError("sanborn manifest sheet_count does not match sheets")
    if manifest.stitching_status != "not_started":
        raise MindseyeDataError("sanborn manifest must not mark stitching as complete")
    if manifest.location_extraction_status != "deferred":
        raise MindseyeDataError("sanborn manifest must defer location extraction")
    if manifest.derived_location_ids or manifest.derived_claim_ids:
        raise MindseyeDataError("sanborn manifest must not create derived locations or claims")

    sheet_numbers = [sheet.sheet_number for sheet in manifest.sheets]
    if sheet_numbers != list(range(1, manifest.sheet_count + 1)):
        raise MindseyeDataError("sanborn manifest sheet numbers must be sequential")

    sheet_ids: set[str] = set()
    for sheet in manifest.sheets:
        if sheet.sheet_id in sheet_ids:
            raise MindseyeDataError(f"duplicate sanborn sheet id: {sheet.sheet_id}")
        sheet_ids.add(sheet.sheet_id)
        if sheet.source_id != manifest.source_id:
            raise MindseyeDataError(f"sanborn sheet {sheet.sheet_id} source_id mismatch")
        if sheet.map_id != manifest.map_id:
            raise MindseyeDataError(f"sanborn sheet {sheet.sheet_id} map_id mismatch")
        expected_url = f"https://www.loc.gov/resource/{manifest.resource_id}/?sp={sheet.sheet_number}"
        if sheet.loc_resource_url != expected_url:
            raise MindseyeDataError(f"sanborn sheet {sheet.sheet_id} has unexpected LOC URL")
        if sheet.derived_location_ids or sheet.derived_claim_ids:
            raise MindseyeDataError(f"sanborn sheet {sheet.sheet_id} must not create derived records")


def assert_sanborn_asset_manifest_links(
    asset_manifest: SanbornAssetManifest,
    sheet_manifest: SanbornSheetManifest,
) -> None:
    if asset_manifest.manifest_type != "loc_sanborn_asset_manifest":
        raise MindseyeDataError("sanborn asset manifest has unsupported manifest_type")
    if asset_manifest.town_package_id != sheet_manifest.town_package_id:
        raise MindseyeDataError("sanborn asset manifest town_package_id does not match sheet manifest")
    if asset_manifest.source_id != sheet_manifest.source_id:
        raise MindseyeDataError("sanborn asset manifest source_id does not match sheet manifest")
    if asset_manifest.map_id != sheet_manifest.map_id:
        raise MindseyeDataError("sanborn asset manifest map_id does not match sheet manifest")
    if asset_manifest.sheet_manifest_id != sheet_manifest.manifest_id:
        raise MindseyeDataError("sanborn asset manifest references the wrong sheet manifest")
    if asset_manifest.asset_count != len(asset_manifest.assets):
        raise MindseyeDataError("sanborn asset manifest asset_count does not match assets")
    if asset_manifest.binary_files_committed:
        raise MindseyeDataError("sanborn asset manifest must not commit binary map assets yet")
    if asset_manifest.stitching_status != "not_started":
        raise MindseyeDataError("sanborn asset manifest must not mark stitching as complete")
    if asset_manifest.georeferencing_status != "deferred":
        raise MindseyeDataError("sanborn asset manifest must defer georeferencing")
    if asset_manifest.location_extraction_status != "deferred":
        raise MindseyeDataError("sanborn asset manifest must defer location extraction")

    sheets_by_id = {sheet.sheet_id: sheet for sheet in sheet_manifest.sheets}
    asset_sheet_ids = [asset.sheet_id for asset in asset_manifest.assets]
    if asset_sheet_ids != [sheet.sheet_id for sheet in sheet_manifest.sheets]:
        raise MindseyeDataError("sanborn asset manifest must preserve sheet order")

    seen_asset_ids: set[str] = set()
    for asset in asset_manifest.assets:
        if asset.asset_record_id in seen_asset_ids:
            raise MindseyeDataError(f"duplicate sanborn asset id: {asset.asset_record_id}")
        seen_asset_ids.add(asset.asset_record_id)

        sheet = sheets_by_id[asset.sheet_id]
        if asset.sheet_number != sheet.sheet_number:
            raise MindseyeDataError(f"sanborn asset {asset.asset_record_id} sheet_number mismatch")
        if asset.source_id != sheet.source_id:
            raise MindseyeDataError(f"sanborn asset {asset.asset_record_id} source_id mismatch")
        if asset.map_id != sheet.map_id:
            raise MindseyeDataError(f"sanborn asset {asset.asset_record_id} map_id mismatch")
        if asset.download_page_url != sheet.loc_resource_url:
            raise MindseyeDataError(f"sanborn asset {asset.asset_record_id} download_page_url mismatch")
        if asset.local_cache_path or asset.checksum_sha256:
            raise MindseyeDataError(f"sanborn asset {asset.asset_record_id} must not claim a local cache yet")


def assert_sanborn_image_metadata_manifest_links(
    image_metadata_manifest: SanbornImageMetadataManifest,
    asset_manifest: SanbornAssetManifest,
) -> None:
    if image_metadata_manifest.manifest_type != "loc_sanborn_image_metadata_manifest":
        raise MindseyeDataError("sanborn image metadata manifest has unsupported manifest_type")
    if image_metadata_manifest.town_package_id != asset_manifest.town_package_id:
        raise MindseyeDataError("sanborn image metadata manifest town_package_id does not match asset manifest")
    if image_metadata_manifest.map_id != asset_manifest.map_id:
        raise MindseyeDataError("sanborn image metadata manifest map_id does not match asset manifest")
    if image_metadata_manifest.source_id != asset_manifest.source_id:
        raise MindseyeDataError("sanborn image metadata manifest source_id does not match asset manifest")
    if image_metadata_manifest.sheet_manifest_id != asset_manifest.sheet_manifest_id:
        raise MindseyeDataError("sanborn image metadata manifest sheet_manifest_id mismatch")
    if image_metadata_manifest.asset_manifest_id != asset_manifest.asset_manifest_id:
        raise MindseyeDataError("sanborn image metadata manifest asset_manifest_id mismatch")
    if image_metadata_manifest.image_count != len(image_metadata_manifest.images):
        raise MindseyeDataError("sanborn image metadata manifest image_count does not match images")
    if image_metadata_manifest.binary_files_committed:
        raise MindseyeDataError("sanborn image metadata manifest must not commit binaries")
    if image_metadata_manifest.stitching_status != "not_started":
        raise MindseyeDataError("sanborn image metadata manifest must not mark stitching as complete")
    if image_metadata_manifest.georeferencing_status != "deferred":
        raise MindseyeDataError("sanborn image metadata manifest must defer georeferencing")
    if image_metadata_manifest.location_extraction_status != "deferred":
        raise MindseyeDataError("sanborn image metadata manifest must defer location extraction")

    assets_by_id = {asset.asset_record_id: asset for asset in asset_manifest.assets}
    images_by_sheet_id: set[str] = set()
    for image in image_metadata_manifest.images:
        if image.sheet_id in images_by_sheet_id:
            raise MindseyeDataError(f"duplicate sanborn image metadata sheet: {image.sheet_id}")
        images_by_sheet_id.add(image.sheet_id)

        asset = assets_by_id.get(image.asset_record_id)
        if asset is None:
            raise MindseyeDataError(f"sanborn image metadata references unknown asset: {image.asset_record_id}")
        if image.sheet_id != asset.sheet_id:
            raise MindseyeDataError(f"sanborn image metadata {image.image_record_id} sheet_id mismatch")
        if image.sheet_number != asset.sheet_number:
            raise MindseyeDataError(f"sanborn image metadata {image.image_record_id} sheet_number mismatch")
        if image.source_id != asset.source_id:
            raise MindseyeDataError(f"sanborn image metadata {image.image_record_id} source_id mismatch")
        if image.map_id != asset.map_id:
            raise MindseyeDataError(f"sanborn image metadata {image.image_record_id} map_id mismatch")
        if image.download_page_url != asset.download_page_url:
            raise MindseyeDataError(f"sanborn image metadata {image.image_record_id} download_page_url mismatch")
        if image.rights_status != image_metadata_manifest.rights_status:
            raise MindseyeDataError(f"sanborn image metadata {image.image_record_id} rights_status mismatch")
        if image.origin_repository != image_metadata_manifest.origin_repository:
            raise MindseyeDataError(f"sanborn image metadata {image.image_record_id} origin_repository mismatch")
        if image.capture_status != "validated_local_derivative":
            raise MindseyeDataError(f"sanborn image metadata {image.image_record_id} capture_status mismatch")


def require_int(raw: dict[str, Any], key: str, label: str) -> int:
    value = raw.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise MindseyeDataError(f"{label} missing required integer field: {key}")
    return value


def require_positive_int(raw: dict[str, Any], key: str, label: str) -> int:
    value = require_int(raw, key, label)
    if value <= 0:
        raise MindseyeDataError(f"{label} must have positive integer field: {key}")
    return value


def require_bool(raw: dict[str, Any], key: str, label: str) -> bool:
    value = raw.get(key)
    if not isinstance(value, bool):
        raise MindseyeDataError(f"{label} missing required boolean field: {key}")
    return value


def require_object_list(raw: dict[str, Any], key: str, label: str) -> list[dict[str, Any]]:
    value = raw.get(key)
    if not isinstance(value, list) or not value:
        raise MindseyeDataError(f"{label} missing required object list: {key}")
    if any(not isinstance(item, dict) for item in value):
        raise MindseyeDataError(f"{label} contains invalid object in: {key}")
    return value


def require_text_mapping(raw: dict[str, Any], key: str, label: str) -> dict[str, str]:
    value = raw.get(key)
    if not isinstance(value, dict) or not value:
        raise MindseyeDataError(f"{label} missing required text mapping: {key}")

    result: dict[str, str] = {}
    for map_key, map_value in value.items():
        if not isinstance(map_key, str) or not map_key.strip():
            raise MindseyeDataError(f"{label} contains invalid mapping key: {key}")
        if not isinstance(map_value, str) or not map_value.strip():
            raise MindseyeDataError(f"{label} contains invalid mapping value: {key}")
        result[map_key] = map_value
    return result


def intake_file_to_dict(record: SanbornImageIntakeFile) -> dict[str, object]:
    return {
        "sheet_id": record.sheet_id,
        "filename": record.filename,
        "path": record.path,
        "byte_size": record.byte_size,
        "checksum_sha256": record.checksum_sha256,
        "width_px": record.width_px,
        "height_px": record.height_px,
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_image_dimensions(path: Path) -> tuple[int | None, int | None]:
    with path.open("rb") as handle:
        header = handle.read(24)
        if header.startswith(b"\x89PNG\r\n\x1a\n") and len(header) >= 24:
            width = int.from_bytes(header[16:20], "big")
            height = int.from_bytes(header[20:24], "big")
            return width, height
        if header.startswith(b"\xff\xd8"):
            handle.seek(2)
            return read_jpeg_dimensions(handle)
    return None, None


def read_jpeg_dimensions(handle: Any) -> tuple[int | None, int | None]:
    while True:
        marker_prefix = handle.read(1)
        if not marker_prefix:
            return None, None
        if marker_prefix != b"\xff":
            continue
        marker = handle.read(1)
        while marker == b"\xff":
            marker = handle.read(1)
        if marker in {b"\xc0", b"\xc1", b"\xc2", b"\xc3"}:
            segment_length = int.from_bytes(handle.read(2), "big")
            if segment_length < 7:
                return None, None
            handle.read(1)
            height = int.from_bytes(handle.read(2), "big")
            width = int.from_bytes(handle.read(2), "big")
            return width, height
        if marker in {b"\xd8", b"\xd9"}:
            continue
        segment_length_bytes = handle.read(2)
        if len(segment_length_bytes) != 2:
            return None, None
        segment_length = int.from_bytes(segment_length_bytes, "big")
        if segment_length < 2:
            return None, None
        handle.seek(segment_length - 2, 1)


def relpath_within_repo(root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError as exc:
        raise MindseyeDataError(f"sanborn image path is outside the repository: {path}") from exc
