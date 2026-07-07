from __future__ import annotations

from html import escape
from typing import Any

from .building_data import (
    BuildingManifest,
    VerificationSuggestionManifest,
    load_building_manifest,
    load_verification_suggestion_manifest,
)
from .instructional_alignment import (
    InstructionalAlignmentManifest,
    load_instructional_alignment_manifest,
)
from .mission_seed import build_mission_seed_packet
from .map_rendering import build_map_rendering_packet
from .accessibility import build_accessibility_support_packet
from .assessment_evidence import build_assessment_evidence_packet
from .models import ClaimRecord, LocationRecord, MindseyeDataError, SourceRecord, TownPackage
from .readiness import build_classroom_readiness_report
from .standards_alignment import build_standards_alignment_packet
from .student_mission import build_student_mission_flow_packet
from .teacher_interface import build_teacher_interface_packet
from .teacher_review import build_teacher_approval_packet
from .sanborn import (
    SanbornAssetManifest,
    SanbornSheetManifest,
    SanbornSheetReviewManifest,
    build_sanborn_image_intake_report,
    load_sanborn_asset_manifest,
    load_sanborn_sheet_manifest,
    load_sanborn_sheet_review_manifest,
    load_sanborn_stitching_manifest,
)


def build_town_package_view_model(package: TownPackage) -> dict[str, object]:
    """Build the read-only browser view model from existing package APIs."""
    return {
        "package": {
            "package_id": package.package_id,
            "town_name": package.town_name,
            "state_region": package.state_region,
            "status": package.status,
            "time_window": package.time_window,
            "notes": package.notes,
        },
        "sources": [_source_summary(source) for source in package.sources],
        "locations": [_location_summary(location) for location in package.locations],
        "claims": [_claim_summary(claim) for claim in package.claims],
        "mission": build_mission_seed_packet(package),
        "readiness": build_classroom_readiness_report(package),
        "sanborn_manifest": _optional_sanborn_manifest_summary(package),
        "building_manifest": _optional_building_manifest_summary(package),
        "map_rendering": _optional_map_rendering_summary(package),
        "instructional_alignment": _optional_instructional_alignment_summary(package),
        "standards_alignment": _optional_standards_alignment_summary(package),
        "teacher_review": _optional_teacher_review_summary(package),
        "teacher_interface": _optional_teacher_interface_summary(package),
        "student_mission": _optional_student_mission_summary(package),
        "assessment_evidence": _optional_assessment_evidence_summary(package),
        "accessibility": _optional_accessibility_summary(package),
    }


def render_town_package_page(package: TownPackage) -> str:
    """Render a local, read-only HTML page for the current town package."""
    model = build_town_package_view_model(package)
    package_info = model["package"]
    if not isinstance(package_info, dict):
        raise TypeError("package view model must contain a package dictionary")

    return "\n".join(
        [
            "<!doctype html>",
            '<html lang="en">',
            "<head>",
            '<meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            f"<title>{_text(package_info['town_name'])} - The Mind's Eye</title>",
            _style_block(),
            "</head>",
            "<body>",
            '<header class="topbar">',
            "<div>",
            '<p class="eyebrow">Read-only town package view</p>',
            f"<h1>The Mind's Eye: {_text(package_info['town_name'])} 1885</h1>",
            f"<p>{_text(package_info['state_region'])} - Package {_text(package_info['package_id'])}</p>",
            "</div>",
            f'<span class="status">{_text(package_info["status"])}</span>',
            "</header>",
            '<main class="layout">',
            _overview_section(model),
            _sanborn_manifest_section(model["sanborn_manifest"]),
            _building_manifest_section(model["building_manifest"]),
            _map_rendering_section(model["map_rendering"]),
            _instructional_alignment_section(model["instructional_alignment"]),
            _standards_alignment_section(model["standards_alignment"]),
            _teacher_review_section(model["teacher_review"]),
            _teacher_interface_section(model["teacher_interface"]),
            _student_mission_section(model["student_mission"]),
            _assessment_evidence_section(model["assessment_evidence"]),
            _accessibility_section(model["accessibility"]),
            _readiness_section(model["readiness"]),
            _mission_section(model["mission"]),
            _claims_section(model["claims"]),
            _sources_section(model["sources"]),
            _locations_section(model["locations"]),
            "</main>",
            "</body>",
            "</html>",
        ]
    )


def _source_summary(source: SourceRecord) -> dict[str, object]:
    return {
        "source_id": source.source_id,
        "title": source.title,
        "source_type": source.source_type,
        "repository": source.repository,
        "url": source.url,
        "citation": source.citation,
        "rights_status": source.rights_status,
        "access_level": source.access_level,
        "notes": source.notes,
    }


def _location_summary(location: LocationRecord) -> dict[str, object]:
    return {
        "location_id": location.location_id,
        "label": location.label,
        "map_id": location.map_id,
        "street": location.street,
        "location_type": location.location_type,
        "certainty": location.certainty,
        "source_ids": list(location.source_ids),
        "notes": location.notes,
    }


def _claim_summary(claim: ClaimRecord) -> dict[str, object]:
    return {
        "claim_id": claim.claim_id,
        "claim_text": claim.claim_text,
        "claim_type": claim.claim_type.value,
        "confidence": claim.confidence.value,
        "source_ids": list(claim.source_ids),
        "related_location_ids": list(claim.related_location_ids),
        "reasoning_note": claim.reasoning_note,
    }


def _optional_sanborn_manifest_summary(package: TownPackage) -> dict[str, object] | None:
    if "source_texarkana_1885_sanborn_loc" not in package.source_ids:
        return None

    try:
        manifest = load_sanborn_sheet_manifest()
    except MindseyeDataError:
        return None
    if manifest.town_package_id != package.package_id:
        return None
    return _sanborn_manifest_summary(manifest)


def _sanborn_manifest_summary(manifest: SanbornSheetManifest) -> dict[str, object]:
    return {
        "manifest_id": manifest.manifest_id,
        "title": manifest.title,
        "source_id": manifest.source_id,
        "map_id": manifest.map_id,
        "loc_item_url": manifest.loc_item_url,
        "loc_gallery_url": manifest.loc_gallery_url,
        "iiif_manifest_status": manifest.iiif_manifest_status,
        "sheet_count": manifest.sheet_count,
        "stitching_status": manifest.stitching_status,
        "location_extraction_status": manifest.location_extraction_status,
        "claim_boundary": manifest.claim_boundary,
        "asset_manifest": _optional_sanborn_asset_manifest_summary(manifest),
        "image_intake": _optional_sanborn_image_intake_summary(manifest),
        "sheet_review": _optional_sanborn_sheet_review_summary(manifest),
        "stitching_prep": _optional_sanborn_stitching_summary(manifest),
        "sheets": [
            {
                "sheet_id": sheet.sheet_id,
                "sheet_number": sheet.sheet_number,
                "title": sheet.title,
                "date": sheet.date,
                "loc_resource_url": sheet.loc_resource_url,
                "status": sheet.status,
            }
            for sheet in manifest.sheets
        ],
    }


def _optional_sanborn_asset_manifest_summary(manifest: SanbornSheetManifest) -> dict[str, object] | None:
    try:
        asset_manifest = load_sanborn_asset_manifest()
    except MindseyeDataError:
        return None
    if asset_manifest.sheet_manifest_id != manifest.manifest_id:
        return None
    return _sanborn_asset_manifest_summary(asset_manifest)


def _optional_sanborn_image_intake_summary(manifest: SanbornSheetManifest) -> dict[str, object] | None:
    try:
        intake_report = build_sanborn_image_intake_report()
    except MindseyeDataError:
        return None
    expected_files = intake_report.get("expected_files")
    present_files = intake_report.get("present_files")
    if not isinstance(expected_files, list) or not isinstance(present_files, list):
        return None

    return {
        "cache_dir": str(intake_report["cache_dir"]),
        "cache_is_ignored": bool(intake_report["cache_is_ignored"]),
        "present_file_count": len(present_files),
        "expected_file_count": len(expected_files),
        "missing_sheet_ids": list(intake_report["missing_sheet_ids"]),
        "expected_files": [
            {
                "sheet_id": str(item["sheet_id"]),
                "filename": str(item["filename"]),
            }
            for item in expected_files
            if isinstance(item, dict)
        ],
    }


def _optional_sanborn_sheet_review_summary(manifest: SanbornSheetManifest) -> dict[str, object] | None:
    try:
        sheet_review_manifest = load_sanborn_sheet_review_manifest()
    except MindseyeDataError:
        return None
    if sheet_review_manifest.sheet_manifest_id != manifest.manifest_id:
        return None
    return _sanborn_sheet_review_summary(sheet_review_manifest)


def _optional_sanborn_stitching_summary(manifest: SanbornSheetManifest) -> dict[str, object] | None:
    try:
        stitching_manifest = load_sanborn_stitching_manifest()
    except MindseyeDataError:
        return None
    if stitching_manifest.sheet_manifest_id != manifest.manifest_id:
        return None
    return _sanborn_stitching_summary(stitching_manifest)


def _optional_building_manifest_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        building_manifest = load_building_manifest()
    except MindseyeDataError:
        return None
    if building_manifest.town_package_id != package.package_id:
        return None
    return _building_manifest_summary(building_manifest)


def _optional_map_rendering_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        rendering_packet = build_map_rendering_packet(package)
    except MindseyeDataError:
        return None
    if rendering_packet["town_package_id"] != package.package_id:
        return None
    return rendering_packet


def _optional_instructional_alignment_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        manifest = load_instructional_alignment_manifest()
    except MindseyeDataError:
        return None
    if manifest.town_package_id != package.package_id:
        return None
    return _instructional_alignment_summary(manifest)


def _optional_teacher_review_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        review_packet = build_teacher_approval_packet(package)
    except MindseyeDataError:
        return None
    if review_packet["town_package_id"] != package.package_id:
        return None
    return review_packet


def _optional_standards_alignment_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        standards_packet = build_standards_alignment_packet(package)
    except MindseyeDataError:
        return None
    if standards_packet["town_package_id"] != package.package_id:
        return None
    return standards_packet


def _optional_teacher_interface_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        portal_packet = build_teacher_interface_packet(package)
    except MindseyeDataError:
        return None
    if portal_packet["town_package_id"] != package.package_id:
        return None
    return portal_packet


def _optional_student_mission_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        flow_packet = build_student_mission_flow_packet(package)
    except MindseyeDataError:
        return None
    if flow_packet["town_package_id"] != package.package_id:
        return None
    return flow_packet


def _optional_assessment_evidence_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        packet = build_assessment_evidence_packet(package)
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _optional_accessibility_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        packet = build_accessibility_support_packet(package)
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _sanborn_asset_manifest_summary(manifest: SanbornAssetManifest) -> dict[str, object]:
    return {
        "asset_manifest_id": manifest.asset_manifest_id,
        "asset_count": manifest.asset_count,
        "binary_files_committed": manifest.binary_files_committed,
        "automated_fetch_status": manifest.automated_fetch_status,
        "large_binary_policy": manifest.large_binary_policy,
        "assets": [
            {
                "asset_record_id": asset.asset_record_id,
                "sheet_id": asset.sheet_id,
                "download_page_url": asset.download_page_url,
                "asset_url_status": asset.asset_url_status,
                "preferred_review_format": asset.preferred_review_format,
                "local_cache_path": asset.local_cache_path,
            }
            for asset in manifest.assets
        ],
    }


def _sanborn_sheet_review_summary(manifest: SanbornSheetReviewManifest) -> dict[str, object]:
    return {
        "sheet_review_manifest_id": manifest.sheet_review_manifest_id,
        "review_scope": manifest.review_scope,
        "review_method": manifest.review_method,
        "review_count": manifest.review_count,
        "binary_files_committed": manifest.binary_files_committed,
        "stitching_status": manifest.stitching_status,
        "georeferencing_status": manifest.georeferencing_status,
        "location_extraction_status": manifest.location_extraction_status,
        "claim_generation_status": manifest.claim_generation_status,
        "claim_boundary": manifest.claim_boundary,
        "reviews": [
            {
                "review_record_id": review.review_record_id,
                "sheet_id": review.sheet_id,
                "sheet_number": review.sheet_number,
                "review_status": review.review_status,
                "sheet_role": review.sheet_role,
                "observed_labels": list(review.observed_labels),
                "visible_features": list(review.visible_features),
                "deferred_work": list(review.deferred_work),
                "notes": review.notes,
            }
            for review in manifest.reviews
        ],
    }


def _sanborn_stitching_summary(manifest: object) -> dict[str, object]:
    return {
        "stitching_manifest_id": manifest.stitching_manifest_id,
        "stitching_scope": manifest.stitching_scope,
        "stitching_method": manifest.stitching_method,
        "stitching_status": manifest.stitching_status,
        "control_point_status": manifest.control_point_status,
        "georeferencing_status": manifest.georeferencing_status,
        "location_extraction_status": manifest.location_extraction_status,
        "claim_generation_status": manifest.claim_generation_status,
        "anchor_sheet_id": manifest.anchor_sheet_id,
        "sheet_plan_count": manifest.sheet_plan_count,
        "link_count": manifest.link_count,
        "claim_boundary": manifest.claim_boundary,
        "runtime_notes": list(manifest.runtime_notes),
        "sheet_plans": [
            {
                "sheet_id": sheet_plan.sheet_id,
                "sheet_number": sheet_plan.sheet_number,
                "sheet_role": sheet_plan.sheet_role,
                "stitch_priority": sheet_plan.stitch_priority,
                "stitch_readiness": sheet_plan.stitch_readiness,
                "candidate_neighbor_sheet_ids": list(sheet_plan.candidate_neighbor_sheet_ids),
                "blocking_tasks": list(sheet_plan.blocking_tasks),
                "notes": sheet_plan.notes,
            }
            for sheet_plan in manifest.sheet_plans
        ],
        "links": [
            {
                "from_sheet_id": link.from_sheet_id,
                "to_sheet_id": link.to_sheet_id,
                "link_type": link.link_type,
                "alignment_status": link.alignment_status,
                "evidence_basis": link.evidence_basis,
                "notes": link.notes,
            }
            for link in manifest.links
        ],
    }


def _building_manifest_summary(manifest: BuildingManifest) -> dict[str, object]:
    return {
        "building_manifest_id": manifest.building_manifest_id,
        "title": manifest.title,
        "review_scope": manifest.review_scope,
        "location_extraction_status": manifest.location_extraction_status,
        "building_identity_status": manifest.building_identity_status,
        "building_art_status": manifest.building_art_status,
        "claim_boundary": manifest.claim_boundary,
        "record_count": manifest.record_count,
        "buildings": [
            {
                "building_id": building.building_id,
                "location_id": building.location_id,
                "map_id": building.map_id,
                "source_ids": list(building.source_ids),
                "supporting_claim_ids": list(building.supporting_claim_ids),
                "suggestion_ids": list(building.suggestion_ids),
                "review_record_id": building.review_record_id,
                "sheet_id": building.sheet_id,
                "sheet_number": building.sheet_number,
                "anchor_status": building.anchor_status,
                "existence_status": building.existence_status,
                "identity_status": building.identity_status,
                "identity_basis": building.identity_basis,
                "reviewed_label": building.reviewed_label,
                "historical_function": building.historical_function,
                "visual_detail_status": building.visual_detail_status,
                "default_render_mode": building.default_render_mode,
                "student_safe_name": building.student_safe_name,
                "student_visible": building.student_visible,
                "teacher_visible": building.teacher_visible,
                "notes": building.notes,
            }
            for building in manifest.buildings
        ],
        "verification_suggestions": _optional_verification_suggestion_summary(manifest),
    }


def _optional_verification_suggestion_summary(
    manifest: BuildingManifest,
) -> dict[str, object] | None:
    try:
        suggestion_manifest = load_verification_suggestion_manifest()
    except MindseyeDataError:
        return None
    if suggestion_manifest.building_manifest_id != manifest.building_manifest_id:
        return None
    return _verification_suggestion_summary(suggestion_manifest)


def _verification_suggestion_summary(
    manifest: VerificationSuggestionManifest,
) -> dict[str, object]:
    return {
        "suggestion_manifest_id": manifest.suggestion_manifest_id,
        "title": manifest.title,
        "review_queue_status": manifest.review_queue_status,
        "promotion_rule": manifest.promotion_rule,
        "claim_boundary": manifest.claim_boundary,
        "candidate_count": manifest.candidate_count,
        "suggestions": [
            {
                "suggestion_id": suggestion.suggestion_id,
                "target_building_id": suggestion.target_building_id,
                "location_id": suggestion.location_id,
                "suggestion_type": suggestion.suggestion_type,
                "status": suggestion.status,
                "candidate_label": suggestion.candidate_label,
                "source_ids": list(suggestion.source_ids),
                "suggestion_origin": suggestion.suggestion_origin,
                "confidence": suggestion.confidence,
                "historical_basis": suggestion.historical_basis,
                "auto_publish": suggestion.auto_publish,
                "student_visible": suggestion.student_visible,
                "review_notes": suggestion.review_notes,
            }
            for suggestion in manifest.suggestions
        ],
    }


def _instructional_alignment_summary(
    manifest: InstructionalAlignmentManifest,
) -> dict[str, object]:
    return {
        "instructional_manifest_id": manifest.instructional_manifest_id,
        "mission_id": manifest.mission_id,
        "title": manifest.title,
        "hqim_status": manifest.hqim_status,
        "teks_status": manifest.teks_status,
        "teacher_authority_rule": manifest.teacher_authority_rule,
        "record_count": manifest.record_count,
        "alignments": [
            {
                "alignment_id": alignment.alignment_id,
                "framework": alignment.framework,
                "subject_area": alignment.subject_area,
                "grade_band": alignment.grade_band,
                "alignment_status": alignment.alignment_status,
                "standard_id": alignment.standard_id,
                "standard_label": alignment.standard_label,
                "hqim_dimension": alignment.hqim_dimension,
                "evidence_expectations": list(alignment.evidence_expectations),
                "teacher_review_required": alignment.teacher_review_required,
                "notes": alignment.notes,
            }
            for alignment in manifest.alignments
        ],
    }


def _overview_section(model: dict[str, object]) -> str:
    package_info = model["package"]
    sources = model["sources"]
    locations = model["locations"]
    claims = model["claims"]
    if not isinstance(package_info, dict):
        raise TypeError("package view model must contain a package dictionary")
    if not isinstance(sources, list) or not isinstance(locations, list) or not isinstance(claims, list):
        raise TypeError("town package view model contains invalid list fields")

    return f"""
<section class="band overview" aria-labelledby="overview-title">
  <div>
    <h2 id="overview-title">Town Package Status</h2>
    <p>{_text(package_info.get("notes", ""))}</p>
  </div>
  <dl class="metrics">
    <div><dt>Sources</dt><dd>{len(sources)}</dd></div>
    <div><dt>Locations</dt><dd>{len(locations)}</dd></div>
    <div><dt>Claims</dt><dd>{len(claims)}</dd></div>
  </dl>
</section>"""


def _readiness_section(raw_readiness: object) -> str:
    readiness = _expect_dict(raw_readiness)
    checks = _expect_list(readiness["checks"])
    blockers = _expect_list(readiness["blockers"])
    status_text = "Classroom ready" if readiness["classroom_ready"] else "Needs teacher review"

    return f"""
<section class="band" aria-labelledby="readiness-title">
  <div class="section-heading">
    <p class="eyebrow">Classroom Readiness</p>
    <h2 id="readiness-title">Teacher Review Status</h2>
    <div class="badge-row">
      {_badge(status_text)}
      {_badge(f"{len(blockers)} blocker(s)")}
    </div>
    <p>{_text(readiness["summary"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Current Blockers</h3>
      {_blocker_list(blockers)}
    </article>
    <article class="panel">
      <h3>Readiness Checks</h3>
      {_readiness_check_list(checks)}
    </article>
  </div>
</section>"""


def _sanborn_manifest_section(raw_manifest: object) -> str:
    if raw_manifest is None:
        return ""

    manifest = _expect_dict(raw_manifest)
    sheets = _expect_list(manifest["sheets"])
    boundary = _expect_dict(manifest["claim_boundary"])
    asset_manifest = manifest.get("asset_manifest")
    image_intake = manifest.get("image_intake")
    sheet_review = manifest.get("sheet_review")
    stitching_prep = manifest.get("stitching_prep")
    sheet_rows = []
    for raw_sheet in sheets:
        sheet = _expect_dict(raw_sheet)
        sheet_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h3>{_text(sheet["sheet_id"])}</h3>
    <div class="badge-row">
      {_badge(f"sheet {sheet['sheet_number']}")}
      {_badge(sheet["status"])}
    </div>
  </div>
  <p>{_text(sheet["title"])}</p>
  <p><strong>Date:</strong> {_text(sheet["date"])}</p>
  <p><strong>LOC:</strong> <a href="{_attr(sheet["loc_resource_url"])}">{_text(sheet["loc_resource_url"])}</a></p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="sanborn-title">
  <div class="section-heading">
    <p class="eyebrow">Sanborn Sheet Manifest</p>
    <h2 id="sanborn-title">LOC Texarkana 1885 Sheets</h2>
    <div class="badge-row">
      {_badge(f"{manifest['sheet_count']} sheets")}
      {_badge(manifest["stitching_status"])}
      {_badge(manifest["location_extraction_status"])}
    </div>
    <p>{_text(manifest["title"])}</p>
    <p><strong>Item:</strong> <a href="{_attr(manifest["loc_item_url"])}">{_text(manifest["loc_item_url"])}</a></p>
    <p><strong>Gallery:</strong> <a href="{_attr(manifest["loc_gallery_url"])}">{_text(manifest["loc_gallery_url"])}</a></p>
    <p class="note">IIIF status: {_text(manifest["iiif_manifest_status"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Boundary</h3>
      {_details_list(boundary)}
    </article>
    <article class="panel">
      <h3>Current Status</h3>
      <p>No stitching, georeferencing, building extraction, derived locations, or derived claims have been created from these sheets yet.</p>
    </article>
  </div>
  {_sanborn_asset_manifest_block(asset_manifest)}
  {_sanborn_image_intake_block(image_intake)}
  {_sanborn_sheet_review_block(sheet_review)}
  {_sanborn_stitching_block(stitching_prep)}
  <div class="records">{''.join(sheet_rows)}</div>
</section>"""


def _sanborn_asset_manifest_block(raw_asset_manifest: object) -> str:
    if raw_asset_manifest is None:
        return ""

    asset_manifest = _expect_dict(raw_asset_manifest)
    assets = _expect_list(asset_manifest["assets"])
    asset_rows = []
    for raw_asset in assets:
        asset = _expect_dict(raw_asset)
        asset_rows.append(
            f"""
<li>
  <strong>{_text(asset["sheet_id"])}</strong>
  <span>{_text(asset["asset_url_status"])}</span>
</li>"""
        )

    binary_status = "binary files committed" if asset_manifest["binary_files_committed"] else "no binaries committed"
    return f"""
  <div class="panel asset-panel">
    <h3>Sanborn Asset Manifest</h3>
    <div class="badge-row">
      {_badge(f"{asset_manifest['asset_count']} asset records")}
      {_badge(binary_status)}
    </div>
    <p class="note">{_text(asset_manifest["automated_fetch_status"])}</p>
    <p>{_text(asset_manifest["large_binary_policy"])}</p>
    <ul class="check-list">{''.join(asset_rows)}</ul>
  </div>"""


def _sanborn_image_intake_block(raw_image_intake: object) -> str:
    if raw_image_intake is None:
        return ""

    image_intake = _expect_dict(raw_image_intake)
    expected_files = _expect_list(image_intake["expected_files"])
    missing_sheet_ids = _expect_list(image_intake["missing_sheet_ids"])
    expected_rows = []
    for raw_expected in expected_files:
        expected = _expect_dict(raw_expected)
        expected_rows.append(
            f"""
<li>
  <strong>{_text(expected["sheet_id"])}</strong>
  <span>{_text(expected["filename"])}</span>
</li>"""
        )

    missing_text = _joined_ids(missing_sheet_ids)
    ignored_status = "ignored cache path" if image_intake["cache_is_ignored"] else "tracked cache path"
    return f"""
  <div class="panel asset-panel">
    <h3>Sanborn Image Intake</h3>
    <div class="badge-row">
      {_badge(f"{image_intake['present_file_count']} present")}
      {_badge(f"{image_intake['expected_file_count']} expected")}
      {_badge(ignored_status)}
    </div>
    <p><strong>Cache:</strong> {_text(image_intake["cache_dir"])}</p>
    <p><strong>Missing sheet IDs:</strong> {missing_text}</p>
    <ul class="check-list">{''.join(expected_rows)}</ul>
  </div>"""


def _sanborn_sheet_review_block(raw_sheet_review: object) -> str:
    if raw_sheet_review is None:
        return ""

    sheet_review = _expect_dict(raw_sheet_review)
    reviews = _expect_list(sheet_review["reviews"])
    boundary = _expect_dict(sheet_review["claim_boundary"])
    review_rows = []
    for raw_review in reviews:
        review = _expect_dict(raw_review)
        review_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(review["sheet_id"])}</h4>
    <div class="badge-row">
      {_badge(f"sheet {review['sheet_number']}")}
      {_badge(review["review_status"])}
      {_badge(review["sheet_role"])}
    </div>
  </div>
  <p>{_text(review["notes"])}</p>
  <p><strong>Observed labels:</strong> {_joined_ids(review["observed_labels"])}</p>
  <p><strong>Visible features:</strong> {_joined_ids(review["visible_features"])}</p>
  <p><strong>Deferred work:</strong> {_joined_ids(review["deferred_work"])}</p>
</article>"""
        )

    binary_status = "no binaries committed" if not sheet_review["binary_files_committed"] else "binary files committed"
    return f"""
  <div class="panel asset-panel">
    <h3>Sanborn Sheet Review</h3>
    <div class="badge-row">
      {_badge(f"{sheet_review['review_count']} review notes")}
      {_badge(binary_status)}
      {_badge(sheet_review["claim_generation_status"])}
    </div>
    <p class="note">{_text(sheet_review["review_scope"])}</p>
    <p class="note">{_text(sheet_review["review_method"])}</p>
    {_details_list(boundary)}
    <div class="records">{''.join(review_rows)}</div>
  </div>"""


def _sanborn_stitching_block(raw_stitching_prep: object) -> str:
    if raw_stitching_prep is None:
        return ""

    stitching_prep = _expect_dict(raw_stitching_prep)
    sheet_plans = _expect_list(stitching_prep["sheet_plans"])
    links = _expect_list(stitching_prep["links"])
    boundary = _expect_dict(stitching_prep["claim_boundary"])
    runtime_notes = _expect_list(stitching_prep["runtime_notes"])

    plan_rows = []
    for raw_plan in sheet_plans:
        plan = _expect_dict(raw_plan)
        plan_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(plan["sheet_id"])}</h4>
    <div class="badge-row">
      {_badge(f"sheet {plan['sheet_number']}")}
      {_badge(plan["stitch_priority"])}
      {_badge(plan["stitch_readiness"])}
    </div>
  </div>
  <p>{_text(plan["notes"])}</p>
  <p><strong>Candidate neighbors:</strong> {_joined_ids(plan["candidate_neighbor_sheet_ids"])}</p>
  <p><strong>Blocking tasks:</strong> {_joined_ids(plan["blocking_tasks"])}</p>
</article>"""
        )

    link_rows = []
    for raw_link in links:
        link = _expect_dict(raw_link)
        link_rows.append(
            f"""
<li>
  <strong>{_text(link["from_sheet_id"])} -> {_text(link["to_sheet_id"])}</strong>
  <span>{_text(link["link_type"])}</span>
</li>"""
        )

    return f"""
  <div class="panel asset-panel">
    <h3>Sanborn Stitching Prep</h3>
    <div class="badge-row">
      {_badge(stitching_prep["stitching_status"])}
      {_badge(stitching_prep["control_point_status"])}
      {_badge(stitching_prep["claim_generation_status"])}
    </div>
    <p class="note">{_text(stitching_prep["stitching_scope"])}</p>
    <p class="note">{_text(stitching_prep["stitching_method"])}</p>
    <p><strong>Anchor sheet:</strong> {_text(stitching_prep["anchor_sheet_id"])}</p>
    <p><strong>Candidate links:</strong> {_text(stitching_prep["link_count"])}</p>
    <p><strong>Runtime notes:</strong> {_joined_ids(runtime_notes)}</p>
    {_details_list(boundary)}
    <ul class="check-list">{''.join(link_rows)}</ul>
    <div class="records">{''.join(plan_rows)}</div>
  </div>"""


def _building_manifest_section(raw_manifest: object) -> str:
    if raw_manifest is None:
        return ""

    manifest = _expect_dict(raw_manifest)
    buildings = _expect_list(manifest["buildings"])
    boundary = _expect_dict(manifest["claim_boundary"])
    verification_suggestions = manifest.get("verification_suggestions")
    building_rows = []
    for raw_building in buildings:
        building = _expect_dict(raw_building)
        reviewed_label = _text(building["reviewed_label"]) if building["reviewed_label"] else "None"
        review_record_id = _text(building["review_record_id"]) if building["review_record_id"] else "None"
        sheet_id = _text(building["sheet_id"]) if building["sheet_id"] else "None"
        sheet_number = _text(building["sheet_number"]) if building["sheet_number"] is not None else "None"
        building_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(building["building_id"])}</h4>
    <div class="badge-row">
      {_badge(building["anchor_status"])}
      {_badge(building["existence_status"])}
      {_badge(building["default_render_mode"])}
    </div>
  </div>
  <p><strong>Student-safe name:</strong> {_text(building["student_safe_name"])}</p>
  <p><strong>Location anchor:</strong> {_text(building["location_id"])}</p>
  <p><strong>Identity status:</strong> {_text(building["identity_status"])}</p>
  <p><strong>Visual detail status:</strong> {_text(building["visual_detail_status"])}</p>
  <p><strong>Reviewed label:</strong> {reviewed_label}</p>
  <p><strong>Review record:</strong> {review_record_id}</p>
  <p><strong>Reviewed sheet:</strong> {sheet_id} / {sheet_number}</p>
  <p><strong>Sources:</strong> {_joined_ids(building["source_ids"])}</p>
  <p><strong>Supporting claims:</strong> {_joined_ids(building["supporting_claim_ids"])}</p>
  <p><strong>Suggestion IDs:</strong> {_joined_ids(building["suggestion_ids"])}</p>
  <p class="note">{_text(building["notes"])}</p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="building-title">
  <div class="section-heading">
    <p class="eyebrow">Building Review Contract</p>
    <h2 id="building-title">{_text(manifest["title"])}</h2>
    <div class="badge-row">
      {_badge(f"{manifest['record_count']} building anchors")}
      {_badge(manifest["building_identity_status"])}
      {_badge(manifest["building_art_status"])}
    </div>
    <p>{_text(manifest["review_scope"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Contract Boundary</h3>
      {_details_list(boundary)}
    </article>
    <article class="panel">
      <h3>Current Status</h3>
      <p><strong>Location extraction:</strong> {_text(manifest["location_extraction_status"])}</p>
      <p>Generic building rendering is allowed only as a student-safe fallback. Reviewed identity and reviewed art remain separate.</p>
    </article>
  </div>
  {_verification_suggestion_block(verification_suggestions)}
  <div class="records">{''.join(building_rows)}</div>
</section>"""


def _map_rendering_section(raw_packet: object) -> str:
    if raw_packet is None:
        return ""

    packet = _expect_dict(raw_packet)
    base_map_layer = _expect_dict(packet["base_map_layer"])
    road_rail_layer = _expect_dict(packet["road_rail_layer"])
    footprint_layer = _expect_dict(packet["building_footprint_layer"])
    art_layer = _expect_dict(packet["building_art_layer"])
    label_layer = _expect_dict(packet["label_layer"])
    quest_layer = _expect_dict(packet["quest_marker_layer"])
    evidence_layer = _expect_dict(packet["evidence_provenance_layer"])
    art_records = _expect_list(art_layer["records"])
    fallback_records = _expect_list(art_layer["fallback_records"])
    footprint_records = _expect_list(footprint_layer["records"])
    label_records = _expect_list(label_layer["records"])
    evidence_records = _expect_list(evidence_layer["records"])

    art_rows = []
    for raw_art in art_records:
        art = _expect_dict(raw_art)
        art_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(art["building_art_id"])}</h4>
    <div class="badge-row">
      {_badge(art["visual_detail_status"])}
      {_badge(art["review_anchor_status"])}
    </div>
  </div>
  <p><strong>Anchor kind:</strong> {_text(art["review_anchor_kind"])}</p>
  <p><strong>Anchor ID:</strong> {_text(art["review_anchor_id"])}</p>
  <p><strong>Historical basis:</strong> {_text(art["historical_basis"])}</p>
  <p><strong>Fallback mode:</strong> {_text(art["fallback_render_mode"])}</p>
</article>"""
        )

    fallback_rows = []
    for raw_art in fallback_records:
        art = _expect_dict(raw_art)
        fallback_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(art["building_art_id"])}</h4>
    <div class="badge-row">
      {_badge("fallback")}
      {_badge(art["visual_detail_status"])}
    </div>
  </div>
  <p><strong>Anchor kind:</strong> {_text(art["review_anchor_kind"])}</p>
  <p><strong>Anchor ID:</strong> {_text(art["review_anchor_id"])}</p>
  <p><strong>Anchor status:</strong> {_text(art["review_anchor_status"])}</p>
  <p><strong>Fallback mode:</strong> {_text(art["fallback_render_mode"])}</p>
</article>"""
        )

    footprint_rows = []
    for raw_footprint in footprint_records:
        footprint = _expect_dict(raw_footprint)
        footprint_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(footprint["building_id"])}</h4>
    <div class="badge-row">
      {_badge(footprint["footprint_status"])}
      {_badge(footprint["geometry_basis"])}
    </div>
  </div>
  <p><strong>Location:</strong> {_text(footprint["location_id"])}</p>
  <p><strong>Review record:</strong> {_text(footprint["review_record_id"]) if footprint["review_record_id"] else "None"}</p>
  <p><strong>Visual detail status:</strong> {_text(footprint["visual_detail_status"])}</p>
</article>"""
        )

    label_rows = []
    for raw_label in label_records:
        label = _expect_dict(raw_label)
        label_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(label["label_id"])}</h4>
    <div class="badge-row">
      {_badge(label["label_type"])}
      {_badge(label["certainty"])}
    </div>
  </div>
  <p><strong>Text:</strong> {_text(label["label_text"])}</p>
  <p><strong>Target:</strong> {_text(label["target_anchor_id"])}</p>
</article>"""
        )

    evidence_rows = []
    for raw_evidence in evidence_records:
        evidence = _expect_dict(raw_evidence)
        evidence_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(evidence["evidence_id"])}</h4>
    <div class="badge-row">
      {_badge(evidence["claim_type"])}
      {_badge(evidence["confidence"])}
    </div>
  </div>
  <p><strong>Anchor:</strong> {_text(evidence["anchor_id"])}</p>
  <p><strong>Sources:</strong> {_joined_ids(evidence["source_ids"])}</p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="map-rendering-title">
  <div class="section-heading">
    <p class="eyebrow">Map Rendering Contract</p>
    <h2 id="map-rendering-title">{_text(packet["render_contract_id"])}</h2>
    <div class="badge-row">
      {_badge(base_map_layer["render_mode"])}
      {_badge(road_rail_layer["status"])}
      {_badge(art_layer["status"])}
    </div>
    <p>Layered rendering keeps historical evidence, building art, runtime markers, and provenance separate.</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Base / Road Layers</h3>
      <p><strong>Base map:</strong> {_text(base_map_layer["map_id"])}</p>
      <p><strong>Stitching:</strong> {_text(base_map_layer["stitching_status"])}</p>
      <p><strong>Georeferencing:</strong> {_text(base_map_layer["georeferencing_status"])}</p>
      <p><strong>Road / rail status:</strong> {_text(road_rail_layer["status"])}</p>
    </article>
    <article class="panel">
      <h3>Footprint / Art Layers</h3>
      <p><strong>Footprints:</strong> {_text(len(footprint_rows))}</p>
      <p><strong>Reviewed art records:</strong> {_text(len(art_rows))}</p>
      <p><strong>Fallback art records:</strong> {_text(len(fallback_rows))}</p>
      <p><strong>Labels:</strong> {_text(len(label_rows))}</p>
      <p><strong>Quest markers:</strong> {_text(len(_expect_list(quest_layer["records"])))}</p>
      <p><strong>Evidence records:</strong> {_text(len(evidence_rows))}</p>
    </article>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Building Footprints</h3>
      <div class="records">{''.join(footprint_rows)}</div>
    </article>
    <article class="panel">
      <h3>Building Art</h3>
      <div class="records">{''.join(art_rows)}</div>
      <h4>Fallback Art</h4>
      <div class="records">{''.join(fallback_rows)}</div>
    </article>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Labels</h3>
      <div class="records">{''.join(label_rows)}</div>
    </article>
    <article class="panel">
      <h3>Evidence / Provenance</h3>
      <div class="records">{''.join(evidence_rows)}</div>
    </article>
  </div>
</section>"""


def _verification_suggestion_block(raw_suggestions: object) -> str:
    if raw_suggestions is None:
        return ""

    suggestion_manifest = _expect_dict(raw_suggestions)
    suggestions = _expect_list(suggestion_manifest["suggestions"])
    boundary = _expect_dict(suggestion_manifest["claim_boundary"])
    suggestion_rows = []
    for raw_suggestion in suggestions:
        suggestion = _expect_dict(raw_suggestion)
        suggestion_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(suggestion["suggestion_id"])}</h4>
    <div class="badge-row">
      {_badge(suggestion["status"])}
      {_badge(suggestion["suggestion_type"])}
      {_badge(suggestion["confidence"])}
    </div>
  </div>
  <p><strong>Candidate:</strong> {_text(suggestion["candidate_label"])}</p>
  <p><strong>Target building:</strong> {_text(suggestion["target_building_id"])}</p>
  <p><strong>Origin:</strong> {_text(suggestion["suggestion_origin"])}</p>
  <p><strong>Sources:</strong> {_joined_ids(suggestion["source_ids"])}</p>
  <p class="note">{_text(suggestion["review_notes"])}</p>
</article>"""
        )

    return f"""
  <div class="panel asset-panel">
    <h3>Verification Suggestions</h3>
    <div class="badge-row">
      {_badge(f"{suggestion_manifest['candidate_count']} candidates")}
      {_badge(suggestion_manifest["review_queue_status"])}
    </div>
    <p>{_text(suggestion_manifest["promotion_rule"])}</p>
    {_details_list(boundary)}
    <div class="records">{''.join(suggestion_rows)}</div>
  </div>"""


def _instructional_alignment_section(raw_manifest: object) -> str:
    if raw_manifest is None:
        return ""

    manifest = _expect_dict(raw_manifest)
    alignments = _expect_list(manifest["alignments"])
    alignment_rows = []
    for raw_alignment in alignments:
        alignment = _expect_dict(raw_alignment)
        standard_id = _text(alignment["standard_id"]) if alignment["standard_id"] else "Pending teacher selection"
        alignment_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(alignment["alignment_id"])}</h4>
    <div class="badge-row">
      {_badge(alignment["framework"])}
      {_badge(alignment["alignment_status"])}
      {_badge(alignment["grade_band"])}
    </div>
  </div>
  <p><strong>Subject area:</strong> {_text(alignment["subject_area"])}</p>
  <p><strong>Standard ID:</strong> {standard_id}</p>
  <p><strong>Alignment label:</strong> {_text(alignment["standard_label"])}</p>
  <p><strong>HQIM dimension:</strong> {_text(alignment["hqim_dimension"])}</p>
  <p><strong>Evidence expectations:</strong> {_joined_ids(alignment["evidence_expectations"])}</p>
  <p class="note">{_text(alignment["notes"])}</p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="instructional-title">
  <div class="section-heading">
    <p class="eyebrow">Instructional Alignment</p>
    <h2 id="instructional-title">{_text(manifest["title"])}</h2>
    <div class="badge-row">
      {_badge(manifest["hqim_status"])}
      {_badge(manifest["teks_status"])}
      {_badge(f"{manifest['record_count']} alignment records")}
    </div>
    <p>{_text(manifest["teacher_authority_rule"])}</p>
  </div>
  <div class="records">{''.join(alignment_rows)}</div>
</section>"""


def _standards_alignment_section(raw_packet: object) -> str:
    if raw_packet is None:
        return ""

    packet = _expect_dict(raw_packet)
    standard = _expect_dict(packet["current_standard_under_review"])
    hqim_records = _expect_list(packet["hqim_records"])
    teks_records = _expect_list(packet["teks_records"])
    release_gate = _expect_dict(packet["release_gate"])

    hqim_rows = []
    for raw_alignment in hqim_records:
        alignment = _expect_dict(raw_alignment)
        hqim_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(alignment["alignment_id"])}</h4>
    <div class="badge-row">
      {_badge(alignment["framework"])}
      {_badge(alignment["alignment_status"])}
    </div>
  </div>
  <p><strong>Standard label:</strong> {_text(alignment["standard_label"])}</p>
</article>"""
        )

    teks_rows = []
    for raw_alignment in teks_records:
        alignment = _expect_dict(raw_alignment)
        standard_id = _text(alignment["standard_id"]) if alignment["standard_id"] else "Pending teacher selection"
        teks_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(alignment["alignment_id"])}</h4>
    <div class="badge-row">
      {_badge(alignment["framework"])}
      {_badge(alignment["alignment_status"])}
    </div>
  </div>
  <p><strong>Standard ID:</strong> {standard_id}</p>
  <p><strong>Standard label:</strong> {_text(alignment["standard_label"])}</p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="standards-title">
  <div class="section-heading">
    <p class="eyebrow">Standards & TEKS Review</p>
    <h2 id="standards-title">{_text(packet["workflow_title"])}</h2>
    <div class="badge-row">
      {_badge(packet["hqim_status"])}
      {_badge(packet["teks_status"])}
      {_badge(release_gate["status"])}
    </div>
    <p>{_text(packet["teacher_authority_rule"])}</p>
    <p class="note">{_text(release_gate["reason"])}</p>
    <p class="note">Secondary TEKS tethers stay mission-scoped and hidden from the primary review surface.</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>HQIM Records</h3>
      <div class="records">{''.join(hqim_rows)}</div>
    </article>
    <article class="panel">
      <h3>TEKS Records</h3>
      <div class="records">{''.join(teks_rows)}</div>
    </article>
  </div>
  <article class="panel">
    <h3>Current Standard Under Review</h3>
    <p><strong>Alignment:</strong> {_text(standard["alignment_id"])}</p>
    <p><strong>Status:</strong> {_text(standard["alignment_status"])}</p>
    <p><strong>Label:</strong> {_text(standard["standard_label"])}</p>
  </article>
</section>"""


def _teacher_review_section(raw_review: object) -> str:
    if raw_review is None:
        return ""

    review = _expect_dict(raw_review)
    review_items = _expect_list(review["review_items"])
    item_rows = []
    for raw_item in review_items:
        item = _expect_dict(raw_item)
        standard_id = _text(item["standard_id"]) if item["standard_id"] else "Pending teacher selection"
        item_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(item["review_item_id"])}</h4>
    <div class="badge-row">
      {_badge(item["framework"])}
      {_badge(item["decision_state"])}
    </div>
  </div>
  <p><strong>Alignment:</strong> {_text(item["alignment_id"])}</p>
  <p><strong>Standard ID:</strong> {standard_id}</p>
  <p><strong>Standard label:</strong> {_text(item["standard_label"])}</p>
  <p class="note">{_text(item["notes"])}</p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="teacher-review-title">
  <div class="section-heading">
    <p class="eyebrow">Teacher Review Approval</p>
    <h2 id="teacher-review-title">{_text(review["title"])}</h2>
    <div class="badge-row">
      {_badge(review["review_status"])}
      {_badge(review["mission_release_status"])}
      {_badge("release ready" if review["classroom_release_ready"] else "release blocked")}
    </div>
    <p>{_text(review["teacher_authority_rule"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Decision State</h3>
      <p><strong>Pending alignment IDs:</strong> {_joined_ids(review["pending_alignment_ids"])}</p>
      <p><strong>Approved alignment IDs:</strong> {_joined_ids(review["approved_alignment_ids"])}</p>
      <p><strong>Rejected alignment IDs:</strong> {_joined_ids(review["rejected_alignment_ids"])}</p>
    </article>
    <article class="panel">
      <h3>Review Status</h3>
      <p>{_text(review["review_status"])}</p>
      <p class="readiness">{_text(review["mission_release_status"])}</p>
    </article>
  </div>
  <div class="records">{''.join(item_rows)}</div>
</section>"""


def _teacher_interface_section(raw_portal: object) -> str:
    if raw_portal is None:
        return ""

    portal = _expect_dict(raw_portal)
    portal_modules = _expect_list(portal["portal_modules"])
    workflow_steps = _expect_list(portal["workflow_steps"])
    summary_cards = _expect_list(portal["summary_cards"])
    standards_alignment = _expect_dict(portal["standards_alignment"])
    review_workspace = _expect_dict(portal["review_workspace"])
    decision_panel = _expect_dict(portal["decision_panel"])
    release_state = _expect_dict(portal["release_state"])

    module_rows = []
    for raw_module in portal_modules:
        module = _expect_dict(raw_module)
        module_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(module["label"])}</h4>
    <div class="badge-row">
      {_badge(module["status"])}
    </div>
  </div>
  <p><strong>Module ID:</strong> {_text(module["module_id"])}</p>
</article>"""
        )

    workflow_rows = []
    for raw_step in workflow_steps:
        step = _expect_dict(raw_step)
        workflow_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(step["step_number"])}. {_text(step["title"])}</h4>
    <div class="badge-row">
      {_badge(step["status"])}
    </div>
  </div>
  <p class="note">{_text(step["note"])}</p>
</article>"""
        )

    summary_rows = []
    for raw_card in summary_cards:
        card = _expect_dict(raw_card)
        value = _text(card["value"]) if card["value"] is not None else "Not calculated"
        summary_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(card["label"])}</h4>
    <div class="badge-row">
      {_badge(card["status"])}
    </div>
  </div>
  <p><strong>Value:</strong> {value}</p>
  <p class="note">{_text(card["note"])}</p>
</article>"""
        )

    exact_standard = _expect_dict(review_workspace["exact_standard_under_review"])
    mission_content = _expect_dict(review_workspace["mission_content_being_reviewed"])
    teacher_alignment_decision = _expect_dict(review_workspace["teacher_alignment_decision"])
    decision_actions = _expect_list(decision_panel["decision_actions"])

    action_rows = []
    for raw_action in decision_actions:
        action = _expect_dict(raw_action)
        action_rows.append(
            f"""
<li>
  <strong>{_text(action["label"])}</strong>
  <span>{_text("enabled" if action["enabled"] else "disabled")}</span>
</li>"""
        )

    return f"""
<section class="band" aria-labelledby="teacher-portal-title">
  <div class="section-heading">
    <p class="eyebrow">Teacher Portal</p>
    <h2 id="teacher-portal-title">{_text(portal["portal_title"])}</h2>
    <div class="badge-row">
      {_badge("mission " + _text(portal["mission_id"]))}
      {_badge("town " + _text(portal["town_package_id"]))}
    </div>
  </div>
  <article class="panel">
    <h3>Portal Modules</h3>
    <div class="records">{''.join(module_rows)}</div>
  </article>
  <article class="panel">
    <h3>Standards Alignment Snapshot</h3>
    <p><strong>Workflow:</strong> {_text(standards_alignment["workflow_title"])}</p>
    <p><strong>TEKS status:</strong> {_text(standards_alignment["teks_status"])}</p>
    <p><strong>Release gate:</strong> {_text(standards_alignment["release_gate"]["status"])}</p>
    <p class="note">Primary subject scope stays front and center; secondary TEKS tethering remains mission-scoped only.</p>
  </article>
  <div class="split">
    <article class="panel">
      <h3>Workflow Steps</h3>
      <div class="records">{''.join(workflow_rows)}</div>
    </article>
    <article class="panel">
      <h3>Summary Cards</h3>
      <div class="records">{''.join(summary_rows)}</div>
    </article>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Review Workspace</h3>
      <p><strong>Exact standard under review:</strong> {_text(exact_standard["alignment_id"])}</p>
      <p><strong>Standard label:</strong> {_text(exact_standard["standard_label"])}</p>
      <p><strong>Teacher authority rule:</strong> {_text(exact_standard["teacher_authority_rule"])}</p>
      <p><strong>Mission:</strong> {_text(mission_content["title"])}</p>
      <p><strong>Current decision:</strong> {_text(teacher_alignment_decision["current_state"])}</p>
      <p class="note">Cross-subject standards remain secondary attachments and do not expand the default review scope.</p>
    </article>
    <article class="panel">
      <h3>Decision Panel</h3>
      <p><strong>Release state:</strong> {_text(release_state["state"])}</p>
      <p class="note">{_text(release_state["reason"])}</p>
      <ul class="check-list">{''.join(action_rows)}</ul>
    </article>
  </div>
</section>"""


def _student_mission_section(raw_flow: object) -> str:
    if raw_flow is None:
        return ""

    flow = _expect_dict(raw_flow)
    steps = _expect_list(flow["visible_mission_steps"])
    locations = _expect_list(flow["selected_locations"])
    labels = _expect_list(flow["provenance_labels"])
    evidence_packets = _expect_list(flow["evidence_packets"])

    step_rows = []
    for raw_step in steps:
        step = _expect_dict(raw_step)
        step_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(step["label"])}</h4>
    <div class="badge-row">
      {_badge(step["status"])}
    </div>
  </div>
  <p class="note">{_text(step["notes"])}</p>
</article>"""
        )

    location_rows = []
    for raw_location in locations:
        location = _expect_dict(raw_location)
        location_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(location["location_id"])}</h4>
    <div class="badge-row">
      {_badge(location["certainty"])}
    </div>
  </div>
  <p><strong>Label:</strong> {_text(location["label"])}</p>
  <p><strong>Street:</strong> {_text(location.get("street", ""))}</p>
  <p><strong>Type:</strong> {_text(location.get("location_type", ""))}</p>
</article>"""
        )

    evidence_rows = []
    for raw_evidence in evidence_packets:
        evidence = _expect_dict(raw_evidence)
        source_rows = evidence.get("sources", [])
        source_count = len(source_rows) if isinstance(source_rows, list) else 0
        evidence_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(evidence["claim_id"])}</h4>
    <div class="badge-row">
      {_badge(evidence["claim_type"])}
      {_badge(evidence["confidence"])}
    </div>
  </div>
  <p><strong>Claim:</strong> {_text(evidence["claim_text"])}</p>
  <p><strong>Sources:</strong> {_text(source_count)}</p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="student-mission-title">
  <div class="section-heading">
    <p class="eyebrow">Student Mission Flow</p>
    <h2 id="student-mission-title">{_text(flow["flow_title"])}</h2>
    <div class="badge-row">
      {_badge(flow["release_state"])}
      {_badge(f"{len(steps)} steps")}
    </div>
    <p>{_text(flow["student_objective"])}</p>
    <p class="note">{_text(flow["release_reason"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Visible Steps</h3>
      <div class="records">{''.join(step_rows)}</div>
    </article>
    <article class="panel">
      <h3>Artifact Expectation</h3>
      <p>{_text(flow["artifact_expectation"]["label"])}</p>
      <p class="note">{_text(flow["artifact_expectation"]["details"])}</p>
      <p><strong>Provenance required:</strong> {_text(flow["artifact_expectation"]["provenance_required"])}</p>
    </article>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Selected Locations</h3>
      <div class="records">{''.join(location_rows)}</div>
    </article>
    <article class="panel">
      <h3>Visible Evidence</h3>
      <div class="records">{''.join(evidence_rows)}</div>
      <div class="badge-row">{_label_badges(labels)}</div>
    </article>
  </div>
</section>"""


def _assessment_evidence_section(raw_packet: object) -> str:
    if raw_packet is None:
        return ""

    packet = _expect_dict(raw_packet)
    artifact_expectation = _expect_dict(packet["artifact_expectation"])
    mastery_scale = _expect_list(packet["mastery_scale"])
    evidence_trail = _expect_dict(packet["evidence_trail"])
    teacher_source_notes = _expect_list(evidence_trail["teacher_source_notes"])
    provenance_labels = _expect_list(evidence_trail["provenance_labels"])
    locations = _expect_list(evidence_trail["locations"])
    artifact_types = _expect_list(packet["student_artifact_types"])

    mastery_rows = []
    for raw_level in mastery_scale:
        level = _expect_dict(raw_level)
        mastery_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(level["level"])}. {_text(level["label"])}</h4>
    <div class="badge-row">
      {_badge(level["grade_range"])}
    </div>
  </div>
  <p>{_text(level["description"])}</p>
</article>"""
        )

    note_rows = []
    for raw_note in teacher_source_notes:
        note = _expect_dict(raw_note)
        note_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(note["claim_id"])}</h4>
    <div class="badge-row">
      {_badge(note["claim_type"])}
      {_badge(note["confidence"])}
    </div>
  </div>
  <p>{_text(note["claim_text"])}</p>
</article>"""
        )

    label_rows = []
    for raw_label in provenance_labels:
        label = _expect_dict(raw_label)
        label_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(label["claim_id"])}</h4>
    <div class="badge-row">
      {_badge(label["claim_type"])}
      {_badge(label["confidence"])}
    </div>
  </div>
</article>"""
        )

    location_rows = []
    for raw_location in locations:
        location = _expect_dict(raw_location)
        location_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(location["location_id"])}</h4>
    <div class="badge-row">
      {_badge(location["certainty"])}
    </div>
  </div>
  <p>{_text(location["label"])}</p>
</article>"""
        )

    artifact_rows = []
    for artifact_type in artifact_types:
        artifact_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(artifact_type)}</h4>
    <div class="badge-row">
      {_badge("allowed")}
    </div>
  </div>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="assessment-title">
  <div class="section-heading">
    <p class="eyebrow">Assessment Evidence</p>
    <h2 id="assessment-title">{_text(packet["framework_title"])}</h2>
    <div class="badge-row">
      {_badge(packet["assessment_status"])}
      {_badge(packet["release_state"])}
      {_badge(packet["rubric_boundary"]["status"])}
    </div>
    <p>{_text(packet["teacher_override_rule"])}</p>
    <p class="note">{_text(packet["readiness_summary"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Artifact Expectation</h3>
      <p><strong>Label:</strong> {_text(artifact_expectation["label"])}</p>
      <p class="note">{_text(artifact_expectation["details"])}</p>
      <p><strong>Provenance required:</strong> {_text(artifact_expectation["provenance_required"])}</p>
      <p><strong>Teacher review state:</strong> {_text(packet["teacher_review_state"])}</p>
    </article>
    <article class="panel">
      <h3>Gradebook Boundary and Teacher Override</h3>
      <p><strong>Status:</strong> {_text(packet["gradebook_conversion"]["status"])}</p>
      <p class="note">{_text(packet["gradebook_conversion"]["description"])}</p>
      <p><strong>Rubric uploaded:</strong> {_text(packet["rubric_boundary"]["rubric_uploaded"])}</p>
      <p><strong>AI compare allowed:</strong> {_text(packet["rubric_boundary"]["ai_compare_allowed"])}</p>
      <p><strong>Teacher override allowed:</strong> {_text(packet["rubric_boundary"]["teacher_override_allowed"])}</p>
    </article>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Mastery Scale</h3>
      <div class="records">{''.join(mastery_rows)}</div>
    </article>
    <article class="panel">
      <h3>Student Artifact Types</h3>
      <div class="records">{''.join(artifact_rows)}</div>
    </article>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Teacher Source Notes</h3>
      <div class="records">{''.join(note_rows)}</div>
    </article>
    <article class="panel">
      <h3>Visible Provenance Labels</h3>
      <div class="records">{''.join(label_rows)}</div>
      <div class="badge-row">{_label_badges(provenance_labels)}</div>
    </article>
  </div>
  <article class="panel">
    <h3>Location Evidence</h3>
    <div class="records">{''.join(location_rows)}</div>
  </article>
</section>"""


def _accessibility_section(raw_packet: object) -> str:
    if raw_packet is None:
        return ""

    packet = _expect_dict(raw_packet)
    support_categories = _expect_list(packet["support_categories"])
    teacher_notes = _expect_list(packet["teacher_notes"])
    scaffold_notes = _expect_list(packet["mission_scaffold_notes"])
    boundary = _expect_dict(packet["support_boundary"])

    support_rows = []
    for raw_support in support_categories:
        support = _expect_dict(raw_support)
        support_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(support["label"])}</h4>
    <div class="badge-row">
      {_badge(support["status"])}
    </div>
  </div>
  <p class="note">{_text(support["note"])}</p>
</article>"""
        )

    note_rows = []
    for note in teacher_notes:
        note_rows.append(
            f"""
<article class="record">
  <p>{_text(note)}</p>
</article>"""
        )

    scaffold_rows = []
    for note in scaffold_notes:
        scaffold_rows.append(
            f"""
<article class="record">
  <p>{_text(note)}</p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="accessibility-title">
  <div class="section-heading">
    <p class="eyebrow">Accessibility Supports</p>
    <h2 id="accessibility-title">{_text(packet["framework_title"])}</h2>
    <div class="badge-row">
      {_badge(packet["accessibility_status"])}
      {_badge(packet["release_state"])}
    </div>
    <p>{_text(packet["embedded_support_rule"])}</p>
    <p class="note">{_text(packet["release_summary"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Support Categories</h3>
      <div class="records">{''.join(support_rows)}</div>
    </article>
    <article class="panel">
      <h3>Boundary</h3>
      <p><strong>Teacher authority:</strong> {_text(boundary["teacher_authority"])}</p>
      <p><strong>Student profile inference:</strong> {_text(boundary["student_profile_inference"])}</p>
      <p><strong>Dynamic scoring:</strong> {_text(boundary["dynamic_scoring"])}</p>
    </article>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Teacher Notes</h3>
      <div class="records">{''.join(note_rows)}</div>
    </article>
    <article class="panel">
      <h3>Embedded Scaffolds</h3>
      <div class="records">{''.join(scaffold_rows)}</div>
    </article>
  </div>
</section>"""


def _mission_section(raw_mission: object) -> str:
    mission = _expect_dict(raw_mission)
    student_hook = _expect_dict(mission["student_mission_hook"])
    source_notes = _expect_list(mission["teacher_source_notes"])
    labels = _expect_list(student_hook["provenance_labels"])

    return f"""
<section class="band" aria-labelledby="mission-title">
  <div class="section-heading">
    <p class="eyebrow">Mission Seed</p>
    <h2 id="mission-title">{_text(mission["title"])}</h2>
    <p>{_text(mission["teacher_goal"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Student Hook</h3>
      <p>{_text(student_hook["text"])}</p>
      <div class="badge-row">{_label_badges(labels)}</div>
    </article>
    <article class="panel">
      <h3>Teacher Notes</h3>
      <p>{_text(mission["teacher_notes"])}</p>
      <p class="readiness">{_text(mission["readiness_reason"])}</p>
    </article>
  </div>
  <div class="records">
    <h3>Teacher Source Notes</h3>
    {_source_note_records(source_notes)}
  </div>
</section>"""


def _claims_section(raw_claims: object) -> str:
    claims = _expect_list(raw_claims)
    records = []
    for raw_claim in claims:
        claim = _expect_dict(raw_claim)
        records.append(
            f"""
<article class="record">
  <div class="record-title">
    <h3>{_text(claim["claim_id"])}</h3>
    <div class="badge-row">
      {_badge(claim["claim_type"])}
      {_badge(claim["confidence"])}
    </div>
  </div>
  <p>{_text(claim["claim_text"])}</p>
  <p><strong>Sources:</strong> {_joined_ids(claim["source_ids"])}</p>
  <p><strong>Locations:</strong> {_joined_ids(claim["related_location_ids"])}</p>
  <p class="note">{_text(claim["reasoning_note"])}</p>
</article>"""
        )
    return f"""
<section class="band" aria-labelledby="claims-title">
  <div class="section-heading">
    <p class="eyebrow">Claims</p>
    <h2 id="claims-title">Provenance-Labeled Claims</h2>
  </div>
  <div class="records">{''.join(records)}</div>
</section>"""


def _sources_section(raw_sources: object) -> str:
    sources = _expect_list(raw_sources)
    records = []
    for raw_source in sources:
        source = _expect_dict(raw_source)
        records.append(
            f"""
<article class="record">
  <div class="record-title">
    <h3>{_text(source["source_id"])}</h3>
    <div class="badge-row">
      {_badge(source["source_type"])}
      {_badge(source["rights_status"])}
      {_badge(source["access_level"])}
    </div>
  </div>
  <p>{_text(source["title"])}</p>
  <p><strong>Repository:</strong> {_text(source["repository"])}</p>
  {_source_link(source)}
  <p class="citation">{_text(source["citation"])}</p>
</article>"""
        )
    return f"""
<section class="band" aria-labelledby="sources-title">
  <div class="section-heading">
    <p class="eyebrow">Sources</p>
    <h2 id="sources-title">Source Records</h2>
  </div>
  <div class="records">{''.join(records)}</div>
</section>"""


def _locations_section(raw_locations: object) -> str:
    locations = _expect_list(raw_locations)
    records = []
    for raw_location in locations:
        location = _expect_dict(raw_location)
        records.append(
            f"""
<article class="record">
  <div class="record-title">
    <h3>{_text(location["location_id"])}</h3>
    <div class="badge-row">
      {_badge(location["location_type"])}
      {_badge(location["certainty"])}
    </div>
  </div>
  <p>{_text(location["label"])}</p>
  <p><strong>Street:</strong> {_text(location["street"])}</p>
  <p><strong>Map:</strong> {_text(location["map_id"])}</p>
  <p><strong>Sources:</strong> {_joined_ids(location["source_ids"])}</p>
  <p class="note">{_text(location["notes"])}</p>
</article>"""
        )
    return f"""
<section class="band" aria-labelledby="locations-title">
  <div class="section-heading">
    <p class="eyebrow">Locations</p>
    <h2 id="locations-title">Map-Linked Locations</h2>
  </div>
  <div class="records">{''.join(records)}</div>
</section>"""


def _source_note_records(source_notes: list[object]) -> str:
    records = []
    for raw_note in source_notes:
        note = _expect_dict(raw_note)
        records.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(note["claim_id"])}</h4>
    <div class="badge-row">
      {_badge(note["claim_type"])}
      {_badge(note["confidence"])}
    </div>
  </div>
  <p>{_text(note["claim_text"])}</p>
  <p class="note">{_text(note["reasoning_note"])}</p>
  {_source_citation_list(_expect_list(note["sources"]))}
</article>"""
        )
    return "".join(records)


def _source_citation_list(sources: list[object]) -> str:
    items = []
    for raw_source in sources:
        source = _expect_dict(raw_source)
        items.append(
            f"<li><strong>{_text(source['source_id'])}</strong>: {_text(source['citation'])}</li>"
        )
    return f"<ul class=\"citations\">{''.join(items)}</ul>"


def _blocker_list(blockers: list[object]) -> str:
    if not blockers:
        return '<p class="note">No blockers reported.</p>'

    items = []
    for raw_blocker in blockers:
        blocker = _expect_dict(raw_blocker)
        items.append(
            f"""
<li>
  <strong>{_text(blocker["check_id"])}</strong>
  <p>{_text(blocker["summary"])}</p>
  {_details_list(_expect_dict(blocker["details"]))}
</li>"""
        )
    return '<ul class="check-list">' + "".join(items) + "</ul>"


def _readiness_check_list(checks: list[object]) -> str:
    items = []
    for raw_check in checks:
        check = _expect_dict(raw_check)
        status = "pass" if check["passed"] else "fail"
        items.append(
            f"""
<li>
  <div class="record-title">
    <strong>{_text(check["check_id"])}</strong>
    <span class="badge badge-{_attr(status)}">{_text(status)}</span>
  </div>
  <p>{_text(check["summary"])}</p>
</li>"""
        )
    return '<ul class="check-list">' + "".join(items) + "</ul>"


def _details_list(details: dict[str, object]) -> str:
    rows = []
    for key, value in details.items():
        if isinstance(value, list):
            rendered_value = _joined_ids(value)
        else:
            rendered_value = _text(value)
        if rendered_value == "None":
            continue
        rows.append(f"<li><strong>{_text(key)}:</strong> {rendered_value}</li>")
    if not rows:
        return ""
    return '<ul class="details-list">' + "".join(rows) + "</ul>"


def _label_badges(labels: list[object]) -> str:
    return "".join(
        _badge(f"{_expect_dict(label)['claim_type']} / {_expect_dict(label)['confidence']}")
        for label in labels
    )


def _source_link(source: dict[str, object]) -> str:
    url = str(source.get("url", ""))
    if not url:
        return ""
    return f'<p><strong>URL:</strong> <a href="{_attr(url)}">{_text(url)}</a></p>'


def _joined_ids(values: object) -> str:
    if not isinstance(values, list) or not values:
        return "None"
    return ", ".join(_text(value) for value in values)


def _badge(value: object) -> str:
    label = _text(value)
    css_class = "".join(character if character.isalnum() else "-" for character in label.lower()).strip("-")
    return f'<span class="badge badge-{css_class}">{label}</span>'


def _text(value: object) -> str:
    return escape(str(value), quote=False)


def _attr(value: object) -> str:
    return escape(str(value), quote=True)


def _expect_dict(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError("expected dictionary in town package view model")
    return value


def _expect_list(value: object) -> list[object]:
    if not isinstance(value, list):
        raise TypeError("expected list in town package view model")
    return value


def _style_block() -> str:
    return """<style>
:root {
  color-scheme: light;
  --bg: #f7f8f5;
  --ink: #1f2933;
  --muted: #5d6975;
  --line: #ccd4d8;
  --panel: #ffffff;
  --teal: #0f766e;
  --amber: #b45309;
  --blue: #1d4ed8;
  --red: #b91c1c;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  line-height: 1.45;
}
a { color: var(--blue); overflow-wrap: anywhere; }
.topbar {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding: 28px clamp(18px, 4vw, 56px);
  background: #ffffff;
  border-bottom: 1px solid var(--line);
}
h1, h2, h3, h4, p { margin-top: 0; }
h1 { font-size: 30px; margin-bottom: 8px; }
h2 { font-size: 22px; margin-bottom: 8px; }
h3 { font-size: 16px; margin-bottom: 8px; }
h4 { font-size: 15px; margin-bottom: 8px; }
.eyebrow {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  margin-bottom: 6px;
  text-transform: uppercase;
}
.status {
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--teal);
  font-weight: 700;
  padding: 6px 10px;
  text-transform: uppercase;
}
.layout { display: grid; gap: 18px; padding: 18px clamp(18px, 4vw, 56px) 48px; }
.band {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 18px;
}
.overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(76px, 1fr));
  gap: 10px;
  margin: 0;
}
.metrics div {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px;
  text-align: center;
}
.metrics dt { color: var(--muted); font-size: 12px; }
.metrics dd { font-size: 24px; font-weight: 700; margin: 0; }
.section-heading { max-width: 980px; }
.split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 12px; }
.panel, .record {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
  padding: 14px;
}
.records { display: grid; gap: 12px; margin-top: 14px; }
.record-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.badge-row { display: flex; flex-wrap: wrap; gap: 6px; }
.badge {
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink);
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 7px;
}
.badge-verified-fact, .badge-high, .badge-public-domain { border-color: #8cc5b8; color: var(--teal); }
.badge-source-based-inference, .badge-low, .badge-placeholder { border-color: #e4b46f; color: var(--amber); }
.badge-fictional-gameplay, .badge-fictional { border-color: #f0a5a5; color: var(--red); }
.badge-classroom-ready, .badge-pass { border-color: #8cc5b8; color: var(--teal); }
.badge-needs-teacher-review, .badge-fail, .badge-1-blocker-s { border-color: #f0a5a5; color: var(--red); }
.note, .citation, .readiness { color: var(--muted); }
.citations { margin-bottom: 0; padding-left: 20px; }
.check-list, .details-list { margin-bottom: 0; padding-left: 20px; }
.check-list li + li { margin-top: 10px; }
@media (max-width: 760px) {
  .topbar, .overview, .split { grid-template-columns: 1fr; }
  .topbar { display: grid; }
  .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .record-title { display: grid; }
}
</style>"""
