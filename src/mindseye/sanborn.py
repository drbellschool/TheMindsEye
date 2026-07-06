from __future__ import annotations

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


def require_int(raw: dict[str, Any], key: str, label: str) -> int:
    value = raw.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise MindseyeDataError(f"{label} missing required integer field: {key}")
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
