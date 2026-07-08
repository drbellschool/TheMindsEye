from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any

from .building_data import (
    BuildingManifest,
    VerificationSuggestionManifest,
    load_building_manifest,
    load_verification_suggestion_manifest,
)
from .campaign import build_campaign_packet
from .community_dashboard import build_community_dashboard_packet
from .community_review import build_community_review_packet
from .instructional_alignment import (
    InstructionalAlignmentManifest,
    load_instructional_alignment_manifest,
)
from .map_auditor import build_map_auditor_packet
from .mission_seed import build_mission_seed_packet
from .map_rendering import build_map_rendering_packet
from .people_auditor import build_people_auditor_packet
from .accessibility import build_accessibility_support_packet
from .privacy import build_privacy_baseline_packet
from .student_data_minimization import build_student_data_minimization_packet
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


def build_town_package_view_model(
    package: TownPackage,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object]:
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
        "building_manifest": _optional_building_manifest_summary(package, town_slug=town_slug, state_root=state_root),
        "map_rendering": _optional_map_rendering_summary(package, town_slug=town_slug, state_root=state_root),
        "instructional_alignment": _optional_instructional_alignment_summary(package),
        "standards_alignment": _optional_standards_alignment_summary(package),
        "teacher_review": _optional_teacher_review_summary(package),
        "teacher_interface": _optional_teacher_interface_summary(package),
        "community_dashboard": _optional_community_dashboard_summary(package, town_slug=town_slug, state_root=state_root),
        "map_auditor": _optional_map_auditor_summary(package, town_slug=town_slug, state_root=state_root),
        "community_review": _optional_community_review_summary(package, town_slug=town_slug, state_root=state_root),
        "people_auditor": _optional_people_auditor_summary(package, town_slug=town_slug, state_root=state_root),
        "campaign": _optional_campaign_summary(package),
        "student_mission": _optional_student_mission_summary(package),
        "assessment_evidence": _optional_assessment_evidence_summary(package),
        "accessibility": _optional_accessibility_summary(package),
        "privacy": _optional_privacy_summary(package),
        "student_data_minimization": _optional_student_data_minimization_summary(package),
    }


def render_town_package_page(
    package: TownPackage,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> str:
    """Render a local, read-only HTML page for the current town package."""
    model = build_town_package_view_model(package, town_slug=town_slug, state_root=state_root)
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
            '<p class="eyebrow">Local review-enabled town view</p>',
            f"<h1>The Mind's Eye: {_text(package_info['town_name'])} 1885</h1>",
            f"<p>{_text(package_info['state_region'])} - Package {_text(package_info['package_id'])}</p>",
            "</div>",
            f'<span class="status">{_text(package_info["status"])}</span>',
            "</header>",
            '<main class="layout">',
            _overview_section(model),
            _sanborn_manifest_section(model["sanborn_manifest"]),
            _map_rendering_section(model["map_rendering"]),
            _instructional_alignment_section(model["instructional_alignment"]),
            _standards_alignment_section(model["standards_alignment"]),
            _teacher_review_section(model["teacher_review"]),
            _teacher_interface_section(model["teacher_interface"]),
            _community_dashboard_section(model["community_dashboard"]),
            _map_auditor_section(model["map_auditor"]),
            _building_manifest_section(model["building_manifest"]),
            _people_auditor_section(model["people_auditor"]),
            _campaign_section(model["campaign"]),
            _student_mission_section(model["student_mission"]),
            _assessment_evidence_section(model["assessment_evidence"]),
            _accessibility_section(model["accessibility"]),
            _privacy_section(model["privacy"]),
            _student_data_minimization_section(model["student_data_minimization"]),
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


def _optional_building_manifest_summary(
    package: TownPackage,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object] | None:
    try:
        building_manifest = load_building_manifest(town_slug=town_slug, state_root=state_root)
    except MindseyeDataError:
        return None
    if building_manifest.town_package_id != package.package_id:
        return None
    return _building_manifest_summary(building_manifest)


def _optional_map_rendering_summary(
    package: TownPackage,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object] | None:
    try:
        rendering_packet = build_map_rendering_packet(package, town_slug=town_slug, state_root=state_root)
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


def _optional_community_dashboard_summary(
    package: TownPackage,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object] | None:
    try:
        packet = build_community_dashboard_packet(package, town_slug=town_slug, state_root=state_root)
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _optional_map_auditor_summary(
    package: TownPackage,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object] | None:
    try:
        packet = build_map_auditor_packet(package, town_slug=town_slug, state_root=state_root)
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _optional_people_auditor_summary(
    package: TownPackage,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object] | None:
    try:
        packet = build_people_auditor_packet(package, town_slug=town_slug, state_root=state_root)
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _optional_community_review_summary(
    package: TownPackage,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object] | None:
    try:
        packet = build_community_review_packet(package, town_slug=town_slug, state_root=state_root)
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _optional_campaign_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        packet = build_campaign_packet(package)
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


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


def _optional_privacy_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        packet = build_privacy_baseline_packet(package)
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _optional_student_data_minimization_summary(package: TownPackage) -> dict[str, object] | None:
    try:
        packet = build_student_data_minimization_packet(package)
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
<section class="band" id="building-auditor" aria-labelledby="building-title">
  <div class="section-heading">
    <p class="eyebrow">Building Auditor</p>
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


def _community_dashboard_section(raw_dashboard: object) -> str:
    if raw_dashboard is None:
        return ""

    dashboard = _expect_dict(raw_dashboard)
    status_chips = _expect_list(dashboard["status_chips"])
    navigation_links = _expect_list(dashboard["navigation_links"]) if dashboard.get("navigation_links") is not None else []
    scope_ladder = _expect_list(dashboard["scope_ladder"])
    review_domains = _expect_list(dashboard["review_domains"])
    review_history = _expect_list(dashboard["review_history"])
    release_gate = _expect_dict(dashboard["release_gate"])
    evidence_inspector = _expect_dict(dashboard["evidence_inspector"])
    entity_review_panels = _expect_dict(dashboard["entity_review_panels"])
    community_review = _expect_dict(dashboard["community_review"]) if dashboard.get("community_review") is not None else None
    year_gate = _expect_dict(dashboard["year_gate"])

    def _state_class(value: object) -> str:
        label = _text(value).lower()
        return "".join(character if character.isalnum() else "-" for character in label).strip("-")

    def _chip_value(chip_id: str) -> object:
        for raw_chip in status_chips:
            chip = _expect_dict(raw_chip)
            if chip["chip_id"] == chip_id:
                return chip["value"]
        return 0

    def _chip_state(chip_id: str) -> str:
        for raw_chip in status_chips:
            chip = _expect_dict(raw_chip)
            if chip["chip_id"] == chip_id:
                return _text(chip["state"])
        return "blocked"

    buildings = _expect_list(entity_review_panels["buildings"])
    candidates = _expect_list(entity_review_panels["candidates"])
    people = _expect_list(entity_review_panels["people"])
    businesses = _expect_list(entity_review_panels["businesses"])
    year_gate_summary = _expect_dict(entity_review_panels["map_year_gate"])
    source_issues = _expect_list(community_review["source_issues"]) if community_review is not None else []
    focus = _expect_dict(evidence_inspector["focus"])
    focus_editor_form = _building_review_editor_form(
        focus if _text(focus.get("focus_type", "")) == "building_record" else None,
        "#community-dashboard",
    )

    source_count = int(_chip_value("sources-ready")) if isinstance(_chip_value("sources-ready"), int) else 0
    sheet_review_count = int(_chip_value("sheets-in-review")) if isinstance(_chip_value("sheets-in-review"), int) else 0
    building_count = int(_chip_value("building-identities-partial")) if isinstance(_chip_value("building-identities-partial"), int) else 0
    people_business_count = (
        int(_chip_value("people-businesses-reviewed"))
        if isinstance(_chip_value("people-businesses-reviewed"), int)
        else 0
    )

    reviewed_buildings = sum(
        1 for building in buildings if _text(building["identity_status"]) in {"reviewed", "approved"}
    )
    art_ready_buildings = sum(
        1 for building in buildings if _text(building["visual_detail_status"]) in {"verified", "inferred"}
    )
    people_confirmed = sum(1 for person in people if _text(person["review_status"]) == "confirmed")
    people_pending = sum(
        1 for person in people if _text(person["review_status"]) in {"suggested", "under_review", "insufficient_evidence"}
    )
    business_confirmed = sum(1 for business in businesses if _text(business["review_status"]) == "confirmed")
    business_pending = sum(
        1 for business in businesses if _text(business["review_status"]) in {"suggested", "under_review", "insufficient_evidence"}
    )
    total_community_records = len(people) + len(businesses)
    confirmed_community_records = people_confirmed + business_confirmed
    unresolved_buildings = sum(
        1
        for building in buildings
        if _text(building["identity_status"]) not in {"reviewed", "approved"}
        or _text(building["visual_detail_status"]) == "illustrative"
    )
    guarded_lanes = sum(
        1 for raw_domain in review_domains if _text(_expect_dict(raw_domain)["status"]) in {"planned", "guarded"}
    )
    release_blockers = _expect_list(release_gate.get("blockers", [])) if isinstance(release_gate.get("blockers"), list) else []
    unresolved_items = unresolved_buildings + people_pending + business_pending + len(candidates) + len(release_blockers)

    progress_values = []
    if buildings:
        progress_values.append(int(round((reviewed_buildings / len(buildings)) * 100)))
        progress_values.append(int(round((art_ready_buildings / len(buildings)) * 100)))
    if total_community_records:
        progress_values.append(int(round((confirmed_community_records / total_community_records) * 100)))
    if review_history:
        progress_values.append(int(round((min(len(review_history), 5) / 5) * 100)))
    overall_percent = int(round(sum(progress_values) / len(progress_values))) if progress_values else 0

    start_year = int(year_gate["start_year"])
    end_year = int(year_gate["end_year"])
    map_year = int(year_gate["map_year"])
    year_ticks = []
    for year in range(start_year, end_year + 1):
        year_ticks.append(
            f'<span class="year-tick {"highlight" if year == map_year else ""}">{year}</span>'
        )

    release_state = _text(release_gate["state"])
    release_label = release_state.upper()
    release_reason = _text(release_gate["reason"])
    release_badge = _badge(release_label)

    focus_label = _text(focus.get("focus_label", focus.get("focus_type", "Record Focus")))
    focus_name = _text(focus.get("label", "Unavailable"))
    focus_id = _text(focus.get("focus_id", "unavailable"))
    focus_status = _text(focus.get("status", "unavailable"))
    focus_basis = _text(focus.get("historical_basis", "source_based_inference"))
    focus_basis_label = {
        "verified_fact": "Verified Fact",
        "source_based_inference": "Source-Based Inference",
        "fictional_gameplay": "Fictional Gameplay",
    }.get(focus_basis, focus_basis.replace("_", " ").title())
    raw_confidence = focus.get("confidence", 0)
    confidence_percent = 50
    if isinstance(raw_confidence, int) and not isinstance(raw_confidence, bool):
        confidence_percent = max(0, min(raw_confidence, 100))
    elif isinstance(raw_confidence, str):
        confidence_percent = {
            "high": 92,
            "medium": 68,
            "low": 42,
            "placeholder": 24,
            "fictional": 12,
        }.get(raw_confidence.lower(), 50)
    focus_source_ids = _expect_list(focus.get("source_ids", [])) if isinstance(focus.get("source_ids"), list) else []
    related_location = _expect_dict(focus["related_location"]) if isinstance(focus.get("related_location"), dict) else None
    related_location_label = _text(related_location["label"]) if related_location is not None else "No related location selected"
    related_location_street = _text(related_location["street"]) if related_location is not None else ""
    related_location_certainty = _text(related_location["certainty"]) if related_location is not None else ""

    map_status = _text(_chip_state("sheets-in-review"))
    primary_routes = [
        {
            "route_id": "map-auditor",
            "title": "Map Auditor",
            "summary": "Stitch Sanborn sheets, place control points, draft roads and rail, and validate the base map geometry.",
            "status": map_status,
            "stats": [
                ("Sheets", sheet_review_count),
                ("Coverage", f"{overall_percent}%"),
                ("Road / Rail", next((_text(domain["status"]) for domain in review_domains if _expect_dict(domain)["domain_id"] == "roads"), "planned")),
                ("Labels", next((_expect_dict(domain)["record_count"] for domain in review_domains if _expect_dict(domain)["domain_id"] == "labels"), 0)),
            ],
            "button_label": "OPEN MAP AUDITOR",
            "href": "#map-auditor",
            "mark": "MA",
        },
        {
            "route_id": "building-auditor",
            "title": "Building Auditor",
            "summary": "Review building footprints, identities, uses, and art. Link to sources and approve for downstream use.",
            "status": "partial" if building_count else "blocked",
            "stats": [
                ("Identities", f"{reviewed_buildings}/{len(buildings)}"),
                ("Footprints", len(buildings)),
                ("Art Approved", art_ready_buildings),
                ("Queue", len(candidates)),
            ],
            "button_label": "OPEN BUILDING AUDITOR",
            "href": "#building-auditor",
            "mark": "BA",
        },
        {
            "route_id": "people-auditor",
            "title": "People Auditor",
            "summary": "Review people and businesses, normalize names, link to source issues, and validate identities.",
            "status": _text(community_review["review_queue_status"]) if community_review is not None else "blocked",
            "stats": [
                ("People", len(people)),
                ("Businesses", len(businesses)),
                ("Unresolved", people_pending + business_pending),
                ("Source Issues", len(source_issues)),
            ],
            "button_label": "OPEN PEOPLE AUDITOR",
            "href": "#people-auditor",
            "mark": "PA",
        },
    ]

    status_cards = [
        {
            "label": "Sources Ready",
            "value": source_count,
            "state": _chip_state("sources-ready"),
            "note": "Source intake",
        },
        {
            "label": "Sanborn Sheets In Review",
            "value": sheet_review_count,
            "state": _chip_state("sheets-in-review"),
            "note": "Sheet review lane",
        },
        {
            "label": "Building Identities Partial",
            "value": building_count,
            "state": _chip_state("building-identities-partial"),
            "note": "Building anchors",
        },
        {
            "label": "People / Businesses Reviewed",
            "value": people_business_count,
            "state": _chip_state("people-businesses-reviewed"),
            "note": "People and businesses",
        },
        {
            "label": "Unresolved Items",
            "value": unresolved_items,
            "state": "blocked" if unresolved_items else "ready",
            "note": "Needs attention",
        },
        {
            "label": "Release Gate",
            "value": release_label,
            "state": release_state,
            "note": release_reason,
        },
        {
            "label": "Guarded Lanes",
            "value": guarded_lanes,
            "state": "guarded" if guarded_lanes else "ready",
            "note": "Restricted lanes",
        },
    ]

    unresolved_cards = [
        {"label": "Buildings", "count": unresolved_buildings},
        {"label": "People", "count": people_pending},
        {"label": "Businesses", "count": business_pending},
        {"label": "Sources", "count": len(source_issues)},
        {"label": "Claims", "count": next((_expect_dict(domain)["record_count"] for domain in review_domains if _expect_dict(domain)["domain_id"] == "claims"), 0)},
        {"label": "Other", "count": len(release_blockers) + guarded_lanes},
    ]

    diagnostics_cards = [
        {"label": "Source Rights", "value": "Verified for Educational Use", "note": "Source rights and use remain visible."},
        {"label": "No PII", "value": "No personal data stored", "note": "Community review stays data-minimized."},
        {"label": "Package ID", "value": _text(dashboard["town_package_id"]).replace("_", "-").upper(), "note": "Town package identifier."},
        {"label": "Data Integrity", "value": "Immutable audit trail", "note": "Claims and source links remain traceable."},
        {"label": "Last Audit", "value": "Local build snapshot", "note": "Read-only render of the current package."},
        {"label": "Community Review Only", "value": "Not for public release", "note": "Teacher and community review remain upstream."},
    ]

    status_cards_html = []
    for card in status_cards:
        status_cards_html.append(
            f"""
<article class="status-card status-{_state_class(card["state"])}">
  <p class="status-card-label">{_text(card["label"])}</p>
  <strong class="status-card-value">{_text(card["value"])}</strong>
  <p class="status-card-note">{_text(card["note"])}</p>
</article>"""
        )

    scope_rows = []
    for raw_scope in scope_ladder:
        scope = _expect_dict(raw_scope)
        scope_rows.append(
            f"""
<article class="scope-card scope-{_state_class(scope["scope_state"])}">
  <div class="scope-index">{_badge(scope["scope_id"])}</div>
  <h4>{_text(scope["label"])}</h4>
  <p class="note">{_text(scope["notes"])}</p>
</article>"""
        )

    route_rows = []
    for route in primary_routes:
        stat_rows = []
        for stat_label, stat_value in route["stats"]:
            stat_rows.append(
                f"""
<div class="route-stat">
  <span>{_text(stat_label)}</span>
  <strong>{_text(stat_value)}</strong>
</div>"""
            )
        route_rows.append(
            f"""
<article class="route-card route-{_state_class(route["status"])}">
  <div class="route-hero">
    <div class="route-mark" aria-hidden="true">{_text(route["mark"])}</div>
    <div>
      <p class="eyebrow">{_text(route["title"])}</p>
      <h4>{_text(route["title"])}</h4>
      <p class="note">{_text(route["summary"])}</p>
    </div>
  </div>
  <div class="route-status">{_badge(route["status"])}</div>
  <div class="route-stats">{''.join(stat_rows)}</div>
  <a class="action-button action-primary route-button" href="{_attr(route["href"])}">{_text(route["button_label"])}</a>
</article>"""
        )

    unresolved_rows = []
    for card in unresolved_cards:
        unresolved_rows.append(
            f"""
<article class="mini-card">
  <p class="mini-card-label">{_text(card["label"])}</p>
  <strong class="mini-card-value">{_text(card["count"])}</strong>
</article>"""
        )

    history_rows = []
    for index, raw_item in enumerate(review_history, start=1):
        item = _expect_dict(raw_item)
        history_rows.append(
            f"""
<article class="history-card">
  <div class="record-title">
    <h4>{index}. {_text(item["label"])}</h4>
    <div class="badge-row">{_badge(item["status"])}</div>
  </div>
  <p class="note">{_text(item["notes"])}</p>
</article>"""
        )

    nav_rows = []
    for raw_link in navigation_links:
        link = _expect_dict(raw_link)
        nav_rows.append(
            f'<a class="badge link-badge" href="{_attr(link["href"])}">{_text(link["label"])}</a>'
        )

    diagnostic_rows = "".join(
        (
            '<article class="diagnostic-card">\n'
            f'  <p class="diagnostic-label">{_text(card["label"])}</p>\n'
            f'  <strong>{_text(card["value"])}</strong>\n'
            f'  <p class="note">{_text(card["note"])}</p>\n'
            '</article>'
        )
        for card in diagnostics_cards
    )

    year_tick_rows = "".join(year_ticks)
    status_card_rows = "".join(status_cards_html)
    route_card_rows = "".join(route_rows)
    unresolved_card_rows = "".join(unresolved_rows)
    history_card_rows = "".join(history_rows)

    focus_source_rows = "".join(_badge(source_id) for source_id in focus_source_ids)
    release_blocker_rows = []
    blocker_labels = {
        "building_identity_status": "Buildings need more evidence",
        "candidate_queue": "Candidate queue still needs promotion",
        "teacher_release": "Teacher review still pending",
    }
    for blocker in release_blockers:
        release_blocker_rows.append(
            f"""
<li>{_text(blocker_labels.get(_text(blocker), _text(blocker).replace("_", " ").title()))}</li>"""
        )
    release_blocker_rows_html = "".join(release_blocker_rows)

    return f"""
<section class="band community-console" id="community-dashboard" aria-labelledby="community-title">
  <div class="community-shell">
    <header class="community-hero">
      <div class="brand-plate">
        <div class="brand-mark" aria-hidden="true">ME</div>
        <div>
          <p class="eyebrow">Community Verification Console</p>
          <h2 id="community-title">{_text(dashboard["dashboard_title"])}</h2>
          <p class="brand-subtitle">The Mind's Eye Historical Towns</p>
        </div>
      </div>
      <div class="hero-meta-grid">
        <article class="hero-meta-card">
          <p class="hero-meta-label">Town / Dataset</p>
          <strong>{_text(dashboard["town_name"]).upper()}, {_text(dashboard["state_region"]).replace(" / ", " & ").replace(" Region", "").upper()}</strong>
          <span>Sanborn Fire Insurance Maps</span>
        </article>
        <article class="hero-meta-card">
          <p class="hero-meta-label">Package ID</p>
          <strong>{_text(dashboard["town_package_id"]).replace("_", "-").upper()}</strong>
          <span>Community package</span>
        </article>
        <article class="hero-meta-card">
          <p class="hero-meta-label">State / Region</p>
          <strong>{_text(dashboard["state_region"])}</strong>
          <span>Town scope</span>
        </article>
        <article class="hero-meta-card">
          <p class="hero-meta-label">Viewer Role</p>
          <strong>Community Reviewer</strong>
          <span>Review-only access</span>
        </article>
        <article class="hero-meta-card hero-meta-alert">
          <p class="hero-meta-label">Release State</p>
          <strong>{release_label}</strong>
          <span>{release_reason}</span>
        </article>
        <article class="hero-meta-card">
          <p class="hero-meta-label">Last Sync</p>
          <strong>Local build snapshot</strong>
          <span>Read-only render</span>
        </article>
      </div>
    </header>

    <section class="panel year-gate-panel" id="community-year-gate">
      <div class="year-gate-copy">
        <p class="eyebrow">Year Gate</p>
        <h3>20-Year Window</h3>
        <p>{_text(year_gate["rule"])}</p>
      </div>
      <div class="year-gate-track">
        <div class="year-track">{year_tick_rows}</div>
        <div class="year-track-meta">
          <span>Window start {start_year}</span>
          <span class="year-pin">{map_year}</span>
          <span>Window end {end_year}</span>
        </div>
      </div>
      <div class="year-gate-note">
        <p>All records, claims, and evidence outside this window are blocked from review.</p>
      </div>
    </section>

    <section class="panel status-overview-panel" id="community-status">
      <div class="section-heading compact-heading">
        <p class="eyebrow">Review Status Overview</p>
        <h3>Town verification progress and release readiness</h3>
      </div>
      <div class="status-overview-grid">
        <div class="status-card-grid">{status_card_rows}</div>
        <article class="overall-progress-card">
          <p class="eyebrow">Overall Progress</p>
          <strong>{overall_percent}%</strong>
          <p>Community Verification Progress</p>
          <div class="progress-bar"><span style="width: {overall_percent}%"></span></div>
        </article>
      </div>
    </section>

    <section class="panel scope-ladder-panel" id="community-scope">
      <div class="section-heading compact-heading">
        <p class="eyebrow">Scope Ladder</p>
        <h3>Community review is active; county and state roll-ups are planned</h3>
      </div>
      <div class="scope-ladder-grid">{''.join(scope_rows)}</div>
    </section>

    <div class="community-layout">
      <main class="community-main">
        <section class="panel route-panel" id="community-routes">
          <div class="section-heading compact-heading">
            <p class="eyebrow">Primary Routes</p>
            <h3>Move from town review into the specialized auditors</h3>
          </div>
          <div class="route-grid">{route_card_rows}</div>
        </section>

        <div class="community-bottom-grid">
          <article class="panel summary-panel" id="community-unresolved">
            <div class="section-heading compact-heading">
              <p class="eyebrow">Unresolved Summary</p>
              <h3>What still needs human review</h3>
            </div>
            <div class="mini-card-grid">{unresolved_card_rows}</div>
            <a class="action-button action-secondary" href="#community-release">View All Unresolved Items</a>
          </article>

          <article class="panel release-panel release-{_state_class(release_state)}" id="community-release">
            <div class="section-heading compact-heading">
              <p class="eyebrow">Release Gate</p>
              <h3>{release_label}</h3>
            </div>
            <p class="note">{release_reason}</p>
            <div class="release-badge-row">{release_badge}</div>
            <div class="release-blocker-card">
              <p><strong>Top Blocking Reasons</strong></p>
              <ul class="details-list">{release_blocker_rows_html or '<li>Community review remains upstream of classroom release.</li>'}</ul>
            </div>
            <a class="action-button action-secondary" href="#community-history">View Blocking Items ({len(release_blockers) or unresolved_items})</a>
          </article>

          <article class="panel actions-panel" id="community-actions">
            <div class="section-heading compact-heading">
              <p class="eyebrow">Quick Actions</p>
              <h3>Fast review operations</h3>
            </div>
            <div class="action-stack">
              <a class="action-button action-secondary" href="#community-status">Run Data Quality Check</a>
              <a class="action-button action-secondary" href="#community-evidence">Bulk Link Source Issues</a>
              <a class="action-button action-secondary" href="#community-history">Export Review Report</a>
              <a class="action-button action-secondary" href="#community-diagnostics">View Audit Log</a>
            </div>
            <p class="note">These actions stay inside review and do not publish classroom content.</p>
          </article>
        </div>
      </main>

      <aside class="community-sidebar">
        <article class="panel evidence-panel" id="community-evidence">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Evidence Inspector</p>
              <h3>{focus_label}</h3>
            </div>
            <div class="fake-select">{focus_label}</div>
          </div>
          <div class="evidence-grid">
            <article class="evidence-summary">
              <div class="evidence-summary-head">
                <div>
                  <p class="label">Label / Name</p>
                  <h4>{focus_name}</h4>
                </div>
                <div class="score-card">
                  <div class="score-ring" style="--score: {confidence_percent}">
                    <strong>{confidence_percent}%</strong>
                  </div>
                  <small>Confidence</small>
                </div>
              </div>
              <div class="field-grid">
                <div><p class="label">Record ID</p><p>{focus_id}</p></div>
                <div><p class="label">Status</p><p>{focus_basis_label}</p></div>
                <div><p class="label">Reviewed status</p><p>{focus_status}</p></div>
                <div><p class="label">Related Location</p><p>{related_location_label}</p><p class="note">{related_location_street}{f" · {related_location_certainty}" if related_location_certainty else ""}</p></div>
              </div>
            </article>
            <article class="evidence-notes">
              <p class="label">Source IDs</p>
              <div class="badge-row">{focus_source_rows or _badge("none")}</div>
              <p class="label">Review Notes</p>
              <p class="note">{_text(focus.get("notes", ""))}</p>
              {focus_editor_form}
              <a class="action-button action-primary" href="#community-history">View Full Record</a>
            </article>
          </div>
          <p class="note">Selected scope: {_text(evidence_inspector["selected_scope"])} | Selected town: {_text(evidence_inspector["selected_town"])}</p>
        </article>

        <article class="panel history-panel" id="community-history">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Review History</p>
              <h3>Latest activity</h3>
            </div>
            <a class="badge link-badge" href="#community-diagnostics">View Full History</a>
          </div>
          <div class="records">{history_card_rows}</div>
        </article>
      </aside>
    </div>

    <article class="panel diagnostics-panel" id="community-diagnostics">
      <div class="section-heading compact-heading">
        <p class="eyebrow">Diagnostics &amp; Safeguards</p>
        <h3>Review-only protections and provenance guardrails</h3>
      </div>
      <div class="diagnostics-grid">{diagnostic_rows}</div>
      <div class="link-strip">{''.join(nav_rows)}</div>
      <p class="note">Primary navigation remains available for the map, building, and people auditors.</p>
    </article>
  </div>
</section>"""


def _map_auditor_section(raw_auditor: object) -> str:
    if raw_auditor is None:
        return ""

    auditor = _expect_dict(raw_auditor)
    status_chips = _expect_list(auditor["status_chips"])
    navigation_links = _expect_list(auditor["navigation_links"])
    progress_summary = _expect_dict(auditor["progress_summary"])
    sheet_selector = _expect_list(auditor["sheet_selector"])
    coverage_grid = _expect_list(auditor["coverage_grid"])
    selected_sheet = _expect_dict(auditor["selected_sheet"]) if auditor.get("selected_sheet") is not None else None
    stitch_workspace = _expect_dict(auditor["stitch_workspace"])
    georeference_workspace = _expect_dict(auditor["georeference_workspace"]) if auditor.get("georeference_workspace") is not None else {}
    composite_manifest = _expect_dict(auditor["composite_manifest"]) if auditor.get("composite_manifest") is not None else {}
    design_tools = _expect_list(auditor["design_tools"])
    layer_stack = _expect_list(auditor["layer_stack"])
    selected_building = _expect_dict(auditor["selected_building"]) if auditor.get("selected_building") is not None else None
    building_workspace = _expect_dict(auditor["building_workspace"])
    art_preview = _expect_dict(auditor["art_preview"])
    interior_notes = _expect_dict(auditor["interior_notes"])
    provenance_trail = _expect_dict(auditor["provenance_trail"])
    people_review = _expect_list(auditor["people_review"])
    businesses_review = _expect_list(auditor["businesses_review"])
    review_legend = _expect_list(auditor["review_legend"])
    review_history = _expect_list(auditor["review_history"])
    unresolved_summary = _expect_list(auditor["unresolved_summary"])
    quick_actions = _expect_list(auditor["quick_actions"])
    year_gate = _expect_dict(auditor["year_gate"])

    chip_rows = []
    for raw_chip in status_chips:
        chip = _expect_dict(raw_chip)
        chip_rows.append(_badge(f"{_text(chip['label'])}: {_text(chip['value'])}"))

    nav_rows = []
    for raw_link in navigation_links:
        link = _expect_dict(raw_link)
        nav_rows.append(f'<a class="badge link-badge" href="{_attr(link["href"])}">{_text(link["label"])}</a>')

    progress_segments = []
    for raw_segment in _expect_list(progress_summary["segments"]):
        segment = _expect_dict(raw_segment)
        progress_segments.append(
            f"""
<div class="progress-segment">
  <strong>{_text(segment["label"])}</strong>
  <span>{_text(segment["value"])}</span>
  <span class="progress-bar"><span style="width: {_text(segment["percent"])}%"></span></span>
</div>"""
        )

    sheet_rows = []
    for raw_sheet in sheet_selector:
        sheet = _expect_dict(raw_sheet)
        sheet_rows.append(
            f"""
<article class="record sheet-card {'selected' if sheet['is_anchor'] else ''}">
  <div class="record-title">
    <h4>Sheet {_text(sheet["sheet_label"])}</h4>
    <div class="badge-row">
      {_badge(sheet["review_status"])}
      {_badge("anchor" if sheet["is_anchor"] else "reviewed")}
    </div>
  </div>
  <p><strong>Role:</strong> {_text(sheet["sheet_role"])}</p>
  <p><strong>Observed labels:</strong> {_text(sheet["observed_label_count"])}</p>
  <p class="note">{_text(sheet["notes"])}</p>
</article>"""
        )

    selected_sheet_labels = []
    if selected_sheet is not None:
        for label in selected_sheet["observed_labels"]:
            selected_sheet_labels.append(_badge(str(label)))

    selected_sheet_features = []
    if selected_sheet is not None:
        for feature in selected_sheet["visible_features"]:
            selected_sheet_features.append(f"<li>{_text(feature)}</li>")

    selected_sheet_deferred = []
    if selected_sheet is not None:
        for item in selected_sheet["deferred_work"]:
            selected_sheet_deferred.append(f"<li>{_text(item)}</li>")

    layer_rows = []
    for raw_layer in layer_stack:
        layer = _expect_dict(raw_layer)
        layer_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(layer["label"])}</h4>
    <div class="badge-row">{_badge(layer["status"])}</div>
  </div>
  <p class="note">{_text(layer["notes"])}</p>
</article>"""
        )

    tool_rows = []
    for raw_tool in design_tools:
        tool = _expect_dict(raw_tool)
        tool_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(tool["label"])}</h4>
    <div class="badge-row">{_badge(tool["status"])}</div>
  </div>
  <p class="note">{_text(tool["notes"])}</p>
</article>"""
        )

    art_layer_rows = []
    for raw_layer in _expect_list(art_preview["layers"]):
        layer = _expect_dict(raw_layer)
        art_layer_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(layer["label"])}</h4>
    <div class="badge-row">{_badge(layer["status"])}</div>
  </div>
  <p class="note">{_text(layer["notes"])}</p>
</article>"""
        )

    people_rows = []
    for raw_person in people_review:
        person = _expect_dict(raw_person)
        source_issue = _expect_dict(person["source_issue"])
        people_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(person["display_name"])}</h4>
    <div class="badge-row">{_badge(person["review_status"])}{_badge(person["historical_basis"])}</div>
  </div>
  <p><strong>Issue:</strong> {_text(source_issue["publication_title"])} / {_text(source_issue["issue_date"])} / p. {_text(source_issue["page"])}</p>
  <p class="note">{_text(person["notes"])}</p>
</article>"""
        )

    business_rows = []
    for raw_business in businesses_review:
        business = _expect_dict(raw_business)
        source_issue = _expect_dict(business["source_issue"])
        business_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(business["display_name"])}</h4>
    <div class="badge-row">{_badge(business["review_status"])}{_badge(business["historical_basis"])}</div>
  </div>
  <p><strong>Issue:</strong> {_text(source_issue["publication_title"])} / {_text(source_issue["issue_date"])} / p. {_text(source_issue["page"])}</p>
  <p class="note">{_text(business["notes"])}</p>
</article>"""
        )

    legend_rows = []
    for raw_item in review_legend:
        item = _expect_dict(raw_item)
        legend_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(item["label"])}</h4>
    <div class="badge-row">{_badge(item["status"])}</div>
  </div>
  <p><strong>Count:</strong> {_text(item["count"])}</p>
  <p class="note">{_text(item["notes"])}</p>
</article>"""
        )

    history_rows = []
    for raw_item in review_history:
        item = _expect_dict(raw_item)
        history_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(item["label"])}</h4>
    <div class="badge-row">{_badge(str(item["status"]))}</div>
  </div>
  <p class="note">{_text(item["notes"])}</p>
</article>"""
        )

    unresolved_rows = []
    for raw_item in unresolved_summary:
        item = _expect_dict(raw_item)
        unresolved_rows.append(
            f"""
<li>
  <strong>{_text(item["label"])}</strong>
  <span>{_text(item["count"])}</span>
</li>"""
        )

    quick_action_rows = []
    for raw_action in quick_actions:
        action = _expect_dict(raw_action)
        href = action.get("href", "#")
        quick_action_rows.append(
            f'<a class="action-button action-{_text(action["kind"])}" href="{_attr(str(href))}">{_text(action["label"])}</a>'
        )

    source_issue = provenance_trail.get("source_issue")
    source_issue_card = ""
    if isinstance(source_issue, dict):
        source_issue_card = f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(source_issue["publication_title"])}</h4>
    <div class="badge-row">
      {_badge(_text(source_issue["issue_date"]))}
      {_badge(f"p. {_text(source_issue['page'])}")}
    </div>
  </div>
  <p><strong>Issue ID:</strong> {_text(source_issue["source_issue_id"])}</p>
  <p><strong>Citation:</strong> {_text(source_issue["citation"])}</p>
  <p><strong>OCR Excerpt:</strong> {_text(source_issue["ocr_excerpt"])}</p>
  <p class="note"><a href="{_attr(source_issue["page_url"])}">Open source page</a></p>
</article>"""

    selected_building_editor_form = _building_review_editor_form(selected_building, "#map-auditor")

    selected_building_block = ""
    if selected_building is not None:
        selected_building_block = f"""
<article class="record building-focus-card">
  <div class="record-title">
    <h4>{_text(selected_building["building_id"])}</h4>
    <div class="badge-row">
      {_badge(selected_building["identity_status"])}
      {_badge(selected_building["visual_detail_status"])}
      {_badge(selected_building["default_render_mode"])}
    </div>
  </div>
  <div class="field-grid source-issue-grid">
    <div><p class="label">Student-safe name</p><p>{_text(selected_building["student_safe_name"])}</p></div>
    <div><p class="label">Reviewed label</p><p>{_text(selected_building["reviewed_label"] or selected_building["student_safe_name"])}</p></div>
    <div><p class="label">Location anchor</p><p>{_text(selected_building["location_id"])}</p></div>
    <div><p class="label">Review record</p><p>{_text(selected_building["review_record_id"])}</p></div>
    <div><p class="label">Reviewed sheet</p><p>{_text(selected_building["sheet_id"])} / {_text(selected_building["sheet_number"])}</p></div>
    <div><p class="label">Historical function</p><p>{_text(selected_building["historical_function"])}</p></div>
  </div>
  <p><strong>Anchor status:</strong> {_text(selected_building["anchor_status"])}</p>
  <p><strong>Existence status:</strong> {_text(selected_building["existence_status"])}</p>
  <p><strong>Source IDs:</strong> {_joined_ids(selected_building["source_ids"])}</p>
  <p><strong>Supporting claims:</strong> {_joined_ids(selected_building["supporting_claim_ids"])}</p>
  <p><strong>Suggestion IDs:</strong> {_joined_ids(selected_building["suggestion_ids"])}</p>
  <p class="note">{_text(selected_building["notes"])}</p>
  {selected_building_editor_form}
</article>"""

    return f"""
<section class="band map-auditor" id="map-auditor" aria-labelledby="map-auditor-title">
  <div class="section-heading">
    <p class="eyebrow">Map Auditor</p>
    <h2 id="map-auditor-title">{_text(auditor["dashboard_title"])}</h2>
    <div class="status-strip">{''.join(chip_rows)}</div>
    <div class="progress-shell">{''.join(progress_segments)}</div>
    <div class="link-strip">{''.join(nav_rows)}</div>
    <p>{_text(auditor["notes"])}</p>
    <p class="note">{_text(year_gate["rule"])}</p>
  </div>
  <div class="auditor-grid">
    <article class="panel auditor-sheet-panel">
      <h3>Sanborn Map Review</h3>
      <p><strong>Map year:</strong> {_text(year_gate["map_year"])}</p>
      <p><strong>Stitching status:</strong> {_text(stitch_workspace["stitching_status"])}</p>
      <p><strong>Manifest control points:</strong> {_text(stitch_workspace.get("manifest_control_point_status", ""))}</p>
      <p><strong>Workspace control points:</strong> {_text(stitch_workspace.get("control_point_status", ""))}</p>
      <p><strong>Local alignment:</strong> {_text(stitch_workspace.get("local_alignment_status", ""))}</p>
      <p><strong>Georeferencing status:</strong> {_text(stitch_workspace["georeferencing_status"])}</p>
      <p><strong>Composite status:</strong> {_text(composite_manifest.get("composite_status", ""))}</p>
      <p><strong>Release gate:</strong> {_text(composite_manifest.get("release_gate_status", ""))}</p>
      <p><strong>Missing control points:</strong> {_text(", ".join(str(item) for item in georeference_workspace.get("missing_control_point_sheet_ids", [])) or "none")}</p>
      <p><strong>Selected sheet:</strong> {_text(selected_sheet["sheet_label"] if selected_sheet is not None else "None")}</p>
      <div class="records">{''.join(sheet_rows)}</div>
      <h4>Selected Sheet Workspace</h4>
      <div class="map-stage">
        <div class="map-stage-header">
          <strong>{_text(selected_sheet["sheet_label"]) if selected_sheet is not None else "No sheet selected"}</strong>
          <span>{_text(selected_sheet["sheet_role"]) if selected_sheet is not None else "unavailable"}</span>
        </div>
        <p><strong>Observed labels:</strong> {''.join(selected_sheet_labels) if selected_sheet_labels else "None"}</p>
        <p><strong>Visible features:</strong></p>
        <ul class="details-list">{''.join(selected_sheet_features) if selected_sheet_features else '<li>No visible features loaded.</li>'}</ul>
        <p><strong>Deferred work:</strong></p>
        <ul class="details-list">{''.join(selected_sheet_deferred) if selected_sheet_deferred else '<li>No deferred work loaded.</li>'}</ul>
      </div>
      <h4>Layer Stack</h4>
      <div class="records">{''.join(layer_rows)}</div>
      <h4>Drafting Tools</h4>
      <div class="records">{''.join(tool_rows)}</div>
    </article>
    <article class="panel auditor-building-panel">
      <h3>Building Handoff Workspace</h3>
      <p><strong>Selected building:</strong> {_text(building_workspace.get("building_id", "None"))}</p>
      <p><strong>Footprint status:</strong> {_text(building_workspace.get("footprint_status", "unavailable"))}</p>
      <p><strong>Geometry basis:</strong> {_text(building_workspace.get("geometry_basis", "unavailable"))}</p>
      {selected_building_block}
      <h4>Extracted Text Review</h4>
      <div class="badge-row">{''.join(selected_sheet_labels) if selected_sheet_labels else _badge("No extracted labels loaded")}</div>
      <h4>Footprint Review</h4>
      <article class="record">
        <div class="record-title">
          <h4>{_text(building_workspace["building_id"] if building_workspace.get("building_id") else "No building selected")}</h4>
          <div class="badge-row">
            {_badge(building_workspace["identity_status"]) if building_workspace.get("identity_status") else _badge("blocked")}
            {_badge(building_workspace["visual_detail_status"]) if building_workspace.get("visual_detail_status") else _badge("unknown")}
          </div>
        </div>
        <p><strong>Location:</strong> {_text(building_workspace.get("location_id", ""))}</p>
        <p><strong>Review record:</strong> {_text(building_workspace.get("review_record_id", "")) or "None"}</p>
        <p><strong>Historical function:</strong> {_text(building_workspace.get("historical_function", "")) or "Unknown"}</p>
        <p class="note">{_text(building_workspace["notes"])}</p>
      </article>
      <h4>Art Preview</h4>
      <div class="records">{''.join(art_layer_rows)}</div>
      <div class="map-stage">
        <p><strong>Preview status:</strong> {_text(art_preview["preview_status"])}</p>
        <p><strong>Transparent background:</strong> {_text(art_preview["transparent_background"])}</p>
        <p class="note">{_text(art_preview["notes"])}</p>
      </div>
      <h4>Interior / Use Notes</h4>
      <article class="record">
        <div class="record-title">
          <h4>{_text(interior_notes["historical_basis"])}</h4>
          <div class="badge-row">{_badge(interior_notes["historical_basis"])}</div>
        </div>
        <p>{_text(interior_notes["text"])}</p>
      </article>
      <div class="button-row">
        <span class="action-button action-primary">Approve Building Record</span>
        <span class="action-button action-secondary">Needs More Evidence</span>
        <span class="action-button action-secondary">Defer</span>
        <span class="action-button action-danger">Reject Building</span>
      </div>
    </article>
    <article class="panel auditor-provenance-panel">
      <h3>Provenance & Review Records</h3>
      <h4>Source Issue / Page Trail</h4>
      {source_issue_card or '<p class="note">No source issue trail available.</p>'}
      <h4>People Review</h4>
      <div class="records">{''.join(people_rows) if people_rows else '<p class="note">No people records loaded.</p>'}</div>
      <h4>Businesses Review</h4>
      <div class="records">{''.join(business_rows) if business_rows else '<p class="note">No business records loaded.</p>'}</div>
      <h4>Provenance Legend</h4>
      <div class="records">{''.join(legend_rows)}</div>
      <h4>Review History</h4>
      <div class="records">{''.join(history_rows)}</div>
      <h4>Reviewer Notes</h4>
      <article class="record">
        <p class="note">{_text(provenance_trail["notes"])}</p>
      </article>
    </article>
  </div>
  <div class="auditor-bottom">
    <article class="panel">
      <h3>Sheet Coverage</h3>
      <table class="coverage-table">
        <thead>
          <tr>
            <th>Sheet</th>
            <th>Coverage</th>
            <th>Status</th>
            <th>Buildings Tagged</th>
          </tr>
        </thead>
        <tbody>
          {''.join(f'<tr><td>{_text(row["sheet_label"])}</td><td>{_text(row["coverage_percent"])}%</td><td>{_text(row["status"])}</td><td>{_text(row["buildings_tagged"])}</td></tr>' for row in coverage_grid)}
        </tbody>
      </table>
    </article>
    <article class="panel">
      <h3>Unresolved Summary</h3>
      <ul class="check-list">{''.join(unresolved_rows)}</ul>
    </article>
    <article class="panel">
      <h3>Quick Actions</h3>
      <div class="action-stack">{''.join(quick_action_rows)}</div>
    </article>
  </div>
</section>"""


def _people_auditor_section(raw_auditor: object) -> str:
    if raw_auditor is None:
        return ""

    auditor = _expect_dict(raw_auditor)
    status_chips = _expect_list(auditor["status_chips"])
    navigation_links = _expect_list(auditor["navigation_links"])
    progress_summary = _expect_dict(auditor["progress_summary"])
    source_issue_browser = _expect_list(auditor["source_issue_browser"])
    selected_issue = _expect_dict(auditor["selected_issue"]) if auditor.get("selected_issue") is not None else None
    people_review = _expect_list(auditor["people_review"])
    selected_person = _expect_dict(auditor["selected_person"]) if auditor.get("selected_person") is not None else None
    businesses_review = _expect_list(auditor["businesses_review"])
    selected_business = _expect_dict(auditor["selected_business"]) if auditor.get("selected_business") is not None else None
    review_scope = _expect_dict(auditor["review_scope"])
    review_legend = _expect_list(auditor["review_legend"])
    review_history = _expect_list(auditor["review_history"])
    unresolved_summary = _expect_list(auditor["unresolved_summary"])
    quick_actions = _expect_list(auditor["quick_actions"])
    year_gate = _expect_dict(auditor["year_gate"])
    review_queue_status = _text(auditor["review_queue_status"])
    promotion_rule = _text(auditor["promotion_rule"])
    record_count = _text(auditor["record_count"])
    source_issue_count = _text(auditor["source_issue_count"])
    claim_boundary = _expect_dict(auditor["claim_boundary"]) if auditor.get("claim_boundary") else {}

    def _confidence_profile(record: dict[str, object] | None) -> dict[str, object]:
        if record is None:
            return {"score": 0, "label": "Low", "reason": "No record selected."}

        review_status = str(record.get("review_status", ""))
        historical_basis = str(record.get("historical_basis", ""))
        score = 50
        if review_status == "confirmed":
            score = 88
        elif review_status == "under_review":
            score = 72
        elif review_status == "rejected":
            score = 18
        elif review_status == "insufficient_evidence":
            score = 34

        if historical_basis == "verified_fact":
            score += 4
        elif historical_basis == "fictional_gameplay":
            score -= 25

        score = max(0, min(score, 100))
        if score >= 80:
            label = "High"
        elif score >= 50:
            label = "Moderate"
        else:
            label = "Low"
        reason = "Confidence reflects the current review status and historical basis."
        return {"score": score, "label": label, "reason": reason}

    def _initials(display_name: str) -> str:
        parts = [part for part in display_name.replace("(", " ").replace(")", " ").replace("&", " ").split() if part]
        if not parts:
            return "?"
        if len(parts) == 1:
            return parts[0][:2].upper()
        return "".join(part[0].upper() for part in parts[:2])

    def _classification_cards(selected_basis: str) -> str:
        options = [
            ("verified_fact", "Verified Fact", "Directly supported by primary source review."),
            ("source_based_inference", "Source-Based Inference", "Reasonable historical interpretation."),
            ("fictional_gameplay", "Fictional Gameplay", "Never used for historical identity claims."),
        ]
        rows = []
        for basis, label, note in options:
            active = basis == selected_basis
            rows.append(
                f"""
<article class="classification-card {'active' if active else ''}">
  <div class="record-title">
    <h4>{_text(label)}</h4>
    <div class="badge-row">{_badge('selected' if active else 'available')}</div>
  </div>
  <p class="note">{_text(note)}</p>
</article>"""
            )
        return "".join(rows)

    chip_rows = []
    for raw_chip in status_chips:
        chip = _expect_dict(raw_chip)
        chip_rows.append(_badge(f"{_text(chip['label'])}: {_text(chip['value'])}"))

    nav_rows = []
    for raw_link in navigation_links:
        link = _expect_dict(raw_link)
        nav_rows.append(f'<a class="badge link-badge" href="{_attr(link["href"])}">{_text(link["label"])}</a>')

    progress_segments = []
    for raw_segment in _expect_list(progress_summary["segments"]):
        segment = _expect_dict(raw_segment)
        progress_segments.append(
            f"""
<div class="progress-segment">
  <strong>{_text(segment["label"])}</strong>
  <span>{_text(segment["value"])}</span>
  <span class="progress-bar"><span style="width: {_text(segment["percent"])}%"></span></span>
</div>"""
        )

    issue_rows = []
    for raw_issue in source_issue_browser:
        issue = _expect_dict(raw_issue)
        issue_initials = _initials(_text(issue["publication_title"]))
        issue_rows.append(
            f"""
<article class="record source-issue-card">
  <div class="issue-media">
    <div class="issue-thumb" aria-hidden="true">
      <span>{issue_initials}</span>
    </div>
    <div class="issue-meta">
      <p class="eyebrow">Source Issue</p>
      <h4>{_text(issue["publication_title"])}</h4>
      <p class="note">{_text(issue["issue_date"])} / page {_text(issue["page"])}</p>
    </div>
  </div>
  <div class="issue-body">
    <div class="record-title">
      <div class="badge-row">
        {_badge(f"{issue['linked_people_count']} people")}
        {_badge(f"{issue['linked_business_count']} businesses")}
      </div>
      <div class="badge-row">{_badge(issue["source_issue_id"])}</div>
    </div>
    <p><strong>OCR:</strong> {_text(issue["ocr_excerpt"])}</p>
    <p class="note">{_text(issue["notes"])}</p>
    <div class="button-row">
      <span class="action-button action-primary issue-action">Attach to Person or Business</span>
    </div>
  </div>
</article>"""
        )

    selected_issue_block = ""
    if selected_issue is not None:
        selected_issue_initials = _initials(_text(selected_issue["publication_title"]))
        selected_issue_block = f"""
<article class="record source-issue-card selected-issue-card">
  <div class="issue-media">
    <div class="issue-thumb" aria-hidden="true">
      <span>{selected_issue_initials}</span>
    </div>
    <div class="issue-meta">
      <p class="eyebrow">Selected Issue Trail</p>
      <h4>{_text(selected_issue["publication_title"])}</h4>
      <p class="note">{_text(selected_issue["issue_date"])} / page {_text(selected_issue["page"])}</p>
      <div class="badge-row">
        {_badge(_text(selected_issue["source_issue_id"]))}
        {_badge(f"{len(selected_issue['linked_people_names'])} people")}
        {_badge(f"{len(selected_issue['linked_business_names'])} businesses")}
      </div>
    </div>
  </div>
  <div class="issue-body">
    <div class="field-grid source-issue-grid">
      <div><p class="label">Issue ID</p><p>{_text(selected_issue["source_issue_id"])}</p></div>
      <div><p class="label">Citation</p><p>{_text(selected_issue["citation"])}</p></div>
      <div><p class="label">Linked people</p><p>{_joined_ids(selected_issue["linked_people_names"])}</p></div>
      <div><p class="label">Linked businesses</p><p>{_joined_ids(selected_issue["linked_business_names"])}</p></div>
    </div>
    <p><strong>OCR Excerpt:</strong> {_text(selected_issue["ocr_excerpt"])}</p>
    <div class="button-row">
      <span class="action-button action-primary issue-action">View Full Issue</span>
    </div>
  </div>
</article>"""

    review_scope_block = f"""
<article class="record">
  <div class="record-title">
    <h4>Review Scope</h4>
    <div class="badge-row">
      {_badge(review_queue_status)}
      {_badge(f"{record_count} records")}
      {_badge(f"{source_issue_count} source issues")}
    </div>
  </div>
  <p class="note">{promotion_rule}</p>
  {_details_list(review_scope)}
  {_details_list(claim_boundary)}
</article>"""

    selected_person_block = ""
    if selected_person is not None:
        source_issue = _expect_dict(selected_person["source_issue"])
        person_profile = _confidence_profile(selected_person)
        person_initials = _initials(_text(selected_person["display_name"]))
        selected_person_block = f"""
<article class="record profile-card">
  <div class="profile-shell">
    <div class="profile-media">
      <div class="portrait-frame">
        <div class="portrait-badge">{person_initials}</div>
        <p class="eyebrow">AI Generated Portrait</p>
        <p class="note">Transparent Background</p>
      </div>
      <div class="score-card">
        <div class="score-ring" style="--score: {person_profile['score']}">
          <strong>{person_profile['score']}%</strong>
        </div>
        <small>{_text(person_profile["label"])} Confidence</small>
        <p class="note">{_text(person_profile["reason"])}</p>
      </div>
    </div>
    <div class="profile-main">
      <div class="record-title">
        <div>
          <p class="eyebrow">Person Record</p>
          <h4>{_text(selected_person["display_name"])}</h4>
        </div>
        <div class="badge-row">
          {_badge(selected_person["review_status"])}
          {_badge(selected_person["historical_basis"])}
        </div>
      </div>
      <div class="field-grid">
        <div><p class="label">Record ID</p><p>{_text(selected_person["review_record_id"])}</p></div>
        <div><p class="label">Entity ID</p><p>{_text(selected_person["entity_id"])}</p></div>
        <div><p class="label">Source issue</p><p>{_text(source_issue["publication_title"])}</p><p class="note">{_text(source_issue["issue_date"])} / p. {_text(source_issue["page"])}</p></div>
        <div><p class="label">Related locations</p><p>{_joined_ids(selected_person["related_location_ids"])}</p></div>
        <div><p class="label">Sources</p><p>{_joined_ids(selected_person["source_ids"])}</p></div>
      </div>
      <div class="classification-grid">{_classification_cards(_text(selected_person["historical_basis"]))}</div>
      <div class="duplicate-check">
        <p class="eyebrow">Source Trail</p>
        <p class="note">{_text(selected_person["notes"])}</p>
      </div>
    </div>
  </div>
  {_community_review_editor_form(selected_person, "people", "#people-auditor")}
</article>"""

    person_rows = []
    for raw_person in people_review:
        person = _expect_dict(raw_person)
        source_issue = _expect_dict(person["source_issue"])
        person_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(person["display_name"])}</h4>
    <div class="badge-row">
      {_badge(person["review_status"])}
      {_badge(person["historical_basis"])}
    </div>
  </div>
  <p><strong>Issue:</strong> {_text(source_issue["publication_title"])} / {_text(source_issue["issue_date"])} / p. {_text(source_issue["page"])}</p>
  <p><strong>Related locations:</strong> {_joined_ids(person["related_location_ids"])}</p>
  <p class="note">{_text(person["notes"])}</p>
</article>"""
        )

    selected_business_block = ""
    if selected_business is not None:
        source_issue = _expect_dict(selected_business["source_issue"])
        business_profile = _confidence_profile(selected_business)
        business_initials = _initials(_text(selected_business["display_name"]))
        selected_business_block = f"""
<article class="record profile-card">
  <div class="profile-shell">
    <div class="profile-media">
      <div class="portrait-frame">
        <div class="portrait-badge">{business_initials}</div>
        <p class="eyebrow">Business Seal</p>
        <p class="note">Source-linked record</p>
      </div>
      <div class="score-card">
        <div class="score-ring" style="--score: {business_profile['score']}">
          <strong>{business_profile['score']}%</strong>
        </div>
        <small>{_text(business_profile["label"])} Confidence</small>
        <p class="note">{_text(business_profile["reason"])}</p>
      </div>
    </div>
    <div class="profile-main">
      <div class="record-title">
        <div>
          <p class="eyebrow">Business Record</p>
          <h4>{_text(selected_business["display_name"])}</h4>
        </div>
        <div class="badge-row">
          {_badge(selected_business["review_status"])}
          {_badge(selected_business["historical_basis"])}
        </div>
      </div>
      <div class="field-grid">
        <div><p class="label">Record ID</p><p>{_text(selected_business["review_record_id"])}</p></div>
        <div><p class="label">Entity ID</p><p>{_text(selected_business["entity_id"])}</p></div>
        <div><p class="label">Source issue</p><p>{_text(source_issue["publication_title"])}</p><p class="note">{_text(source_issue["issue_date"])} / p. {_text(source_issue["page"])}</p></div>
        <div><p class="label">Related locations</p><p>{_joined_ids(selected_business["related_location_ids"])}</p></div>
        <div><p class="label">Sources</p><p>{_joined_ids(selected_business["source_ids"])}</p></div>
      </div>
      <div class="classification-grid">{_classification_cards(_text(selected_business["historical_basis"]))}</div>
      <div class="duplicate-check">
        <p class="eyebrow">Source Trail</p>
        <p class="note">{_text(selected_business["notes"])}</p>
      </div>
    </div>
  </div>
  {_community_review_editor_form(selected_business, "businesses", "#people-auditor")}
</article>"""

    business_rows = []
    for raw_business in businesses_review:
        business = _expect_dict(raw_business)
        source_issue = _expect_dict(business["source_issue"])
        business_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(business["display_name"])}</h4>
    <div class="badge-row">
      {_badge(business["review_status"])}
      {_badge(business["historical_basis"])}
    </div>
  </div>
  <p><strong>Issue:</strong> {_text(source_issue["publication_title"])} / {_text(source_issue["issue_date"])} / p. {_text(source_issue["page"])}</p>
  <p><strong>Related locations:</strong> {_joined_ids(business["related_location_ids"])}</p>
  <p class="note">{_text(business["notes"])}</p>
</article>"""
        )

    legend_rows = []
    for raw_item in review_legend:
        item = _expect_dict(raw_item)
        legend_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(item["label"])}</h4>
    <div class="badge-row">{_badge(item["status"])}</div>
  </div>
  <p><strong>Count:</strong> {_text(item["count"])}</p>
  <p class="note">{_text(item["notes"])}</p>
</article>"""
        )

    history_rows = []
    for raw_item in review_history:
        item = _expect_dict(raw_item)
        history_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(item["label"])}</h4>
    <div class="badge-row">{_badge(str(item["status"]))}</div>
  </div>
  <p class="note">{_text(item["notes"])}</p>
</article>"""
        )

    unresolved_rows = []
    for raw_item in unresolved_summary:
        item = _expect_dict(raw_item)
        unresolved_rows.append(
            f"""
<li>
  <strong>{_text(item["label"])}</strong>
  <span>{_text(item["count"])}</span>
</li>"""
        )

    quick_action_rows = []
    for raw_action in quick_actions:
        action = _expect_dict(raw_action)
        href = action.get("href", "#")
        quick_action_rows.append(
            f'<a class="action-button action-{_text(action["kind"])}" href="{_attr(str(href))}">{_text(action["label"])}</a>'
        )

    return f"""
<section class="band people-auditor" id="people-auditor" aria-labelledby="people-auditor-title">
  <div class="section-heading">
    <p class="eyebrow">People Auditor</p>
    <h2 id="people-auditor-title">{_text(auditor["dashboard_title"])}</h2>
    <div class="status-strip">{''.join(chip_rows)}</div>
    <div class="progress-shell">{''.join(progress_segments)}</div>
    <div class="link-strip">{''.join(nav_rows)}</div>
    <p>{_text(auditor["notes"])}</p>
    <p class="note">{_text(year_gate["rule"])}</p>
  </div>
  <div class="auditor-grid">
    <article class="panel auditor-source-panel">
      <h3>Source Issue Browser</h3>
      <p><strong>Review queue:</strong> {_text(review_queue_status)}</p>
      <p><strong>Issue count:</strong> {source_issue_count}</p>
      <p><strong>Record count:</strong> {record_count}</p>
      <p class="note">{promotion_rule}</p>
      <div class="records">{''.join(issue_rows)}</div>
      <h4>Selected Issue Trail</h4>
      {selected_issue_block or '<p class="note">No selected issue is available.</p>'}
      <h4>Review Scope</h4>
      {review_scope_block}
    </article>
    <article class="panel auditor-people-panel">
      <h3>People Review Workspace</h3>
      <p><strong>Selected person:</strong> {_text(selected_person["display_name"]) if selected_person is not None else "None"}</p>
      <p><strong>Selected status:</strong> {_text(selected_person["review_status"]) if selected_person is not None else "unavailable"}</p>
      <p><strong>Selected basis:</strong> {_text(selected_person["historical_basis"]) if selected_person is not None else "unavailable"}</p>
      {selected_person_block or '<p class="note">No person record is available.</p>'}
      <h4>People Queue</h4>
      <div class="records">{''.join(person_rows) if person_rows else '<p class="note">No people records loaded.</p>'}</div>
    </article>
    <article class="panel auditor-business-panel">
      <h3>Business Review Workspace</h3>
      <p><strong>Selected business:</strong> {_text(selected_business["display_name"]) if selected_business is not None else "None"}</p>
      <p><strong>Selected status:</strong> {_text(selected_business["review_status"]) if selected_business is not None else "unavailable"}</p>
      <p><strong>Selected basis:</strong> {_text(selected_business["historical_basis"]) if selected_business is not None else "unavailable"}</p>
      {selected_business_block or '<p class="note">No business record is available.</p>'}
      <h4>Business Queue</h4>
      <div class="records">{''.join(business_rows) if business_rows else '<p class="note">No business records loaded.</p>'}</div>
    </article>
  </div>
  <div class="auditor-bottom">
    <article class="panel">
      <h3>Provenance Legend</h3>
      <div class="records">{''.join(legend_rows)}</div>
    </article>
    <article class="panel">
      <h3>Review History</h3>
      <div class="records">{''.join(history_rows)}</div>
    </article>
    <article class="panel">
      <h3>Unresolved Summary</h3>
      <ul class="check-list">{''.join(unresolved_rows)}</ul>
      <h3>Quick Actions</h3>
      <div class="action-stack">{''.join(quick_action_rows)}</div>
    </article>
  </div>
</section>"""


def _option_tags(options: list[tuple[str, str]], current_value: str) -> str:
    return "".join(
        f'<option value="{_attr(value)}"{" selected" if value == current_value else ""}>{_text(label)}</option>'
        for value, label in options
    )


def _community_review_editor_form(
    record: dict[str, object] | None,
    record_group: str,
    return_to: str,
) -> str:
    if record is None:
        return ""

    record_id = _text(record.get("review_record_id", ""))
    current_status = _text(record.get("review_status", "under_review"))
    current_basis = _text(record.get("historical_basis", "source_based_inference"))
    current_notes = _text(record.get("notes", ""))
    status_options = [
        ("suggested", "Suggested"),
        ("under_review", "Under Review"),
        ("confirmed", "Confirmed"),
        ("rejected", "Rejected"),
        ("insufficient_evidence", "Insufficient Evidence"),
    ]
    basis_options = [
        ("verified_fact", "Verified Fact"),
        ("source_based_inference", "Source-Based Inference"),
    ]

    return f"""
<form class="review-editor" method="post" action="/api/review-action">
  <input type="hidden" name="record_domain" value="community_review">
  <input type="hidden" name="record_group" value="{_attr(record_group)}">
  <input type="hidden" name="record_id" value="{_attr(record_id)}">
  <input type="hidden" name="return_to" value="{_attr(return_to)}">
  <label>
    Review Status
    <select name="review_status">{_option_tags(status_options, current_status)}</select>
  </label>
  <label>
    Historical Basis
    <select name="historical_basis">{_option_tags(basis_options, current_basis)}</select>
  </label>
  <label>
    Notes
    <textarea name="notes" rows="3">{_text(current_notes)}</textarea>
  </label>
  <div class="button-row">
    <button class="action-button action-primary" type="submit">Save Review</button>
  </div>
</form>"""


def _building_review_editor_form(record: dict[str, object] | None, return_to: str) -> str:
    if record is None:
        return ""

    building_id = _text(record.get("building_id", ""))
    if _text(record.get("review_record_id", "")) == "" or _text(record.get("identity_status", "")) not in {"reviewed", "approved"}:
        return ""
    current_identity = _text(record.get("identity_status", "suggested"))
    current_basis = _text(record.get("identity_basis", "source_based_inference"))
    current_visual = _text(record.get("visual_detail_status", "illustrative"))
    current_notes = _text(record.get("notes", ""))
    identity_options = [
        ("reviewed", "Reviewed"),
        ("approved", "Approved"),
    ]
    basis_options = [
        ("verified_fact", "Verified Fact"),
        ("source_based_inference", "Source-Based Inference"),
    ]
    visual_options = [
        ("verified", "Verified"),
        ("inferred", "Inferred"),
        ("illustrative", "Illustrative"),
    ]

    return f"""
<form class="review-editor" method="post" action="/api/review-action">
  <input type="hidden" name="record_domain" value="building">
  <input type="hidden" name="record_id" value="{_attr(building_id)}">
  <input type="hidden" name="return_to" value="{_attr(return_to)}">
  <label>
    Identity Status
    <select name="identity_status">{_option_tags(identity_options, current_identity)}</select>
  </label>
  <label>
    Identity Basis
    <select name="identity_basis">{_option_tags(basis_options, current_basis)}</select>
  </label>
  <label>
    Visual Detail
    <select name="visual_detail_status">{_option_tags(visual_options, current_visual)}</select>
  </label>
  <label>
    Notes
    <textarea name="notes" rows="3">{_text(current_notes)}</textarea>
  </label>
  <div class="button-row">
    <button class="action-button action-primary" type="submit">Save Building Review</button>
  </div>
</form>"""


def _community_review_section(raw_review: object) -> str:
    return _people_auditor_section(raw_review)


def _campaign_section(raw_campaign: object) -> str:
    if raw_campaign is None:
        return ""

    campaign = _expect_dict(raw_campaign)
    bands = _expect_list(campaign["mastery_bands"])
    checkpoints = _expect_list(campaign["mastery_checkpoints"])
    placement = _expect_dict(campaign["preassessment_placement"])
    year_gate = _expect_dict(campaign["year_gate"])

    band_rows = []
    for raw_band in bands:
        band = _expect_dict(raw_band)
        band_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(band["band_number"])}. {_text(band["band_label"])}</h4>
    <div class="badge-row">{_badge(_text(band["checkpoint_range"][0]) + "-" + _text(band["checkpoint_range"][1]))}</div>
  </div>
  <p class="note">{_text(band["purpose"])}</p>
</article>"""
        )

    checkpoint_rows = []
    for raw_checkpoint in checkpoints:
        checkpoint = _expect_dict(raw_checkpoint)
        checkpoint_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(checkpoint["checkpoint_number"])}. {_text(checkpoint["band_label"])}</h4>
    <div class="badge-row">
      {_badge(_text(checkpoint["mission_role"]))}
      {_badge(_text(checkpoint["assessment_mode"]))}
    </div>
  </div>
  <p class="note">{_text(checkpoint["notes"])}</p>
</article>"""
        )

    return f"""
<section class="band campaign-section" aria-labelledby="campaign-title">
  <div class="section-heading">
    <p class="eyebrow">Campaign Framework</p>
    <h2 id="campaign-title">{_text(campaign["campaign_title"])}</h2>
    <div class="badge-row">
      {_badge(f"{_text(campaign['mastery_checkpoint_count'])} checkpoints")}
      {_badge(f"{_text(year_gate['start_year'])} to {_text(year_gate['end_year'])}")}
    </div>
    <p>{_text(campaign["mission_granularity_rule"])}</p>
    <p class="note">{_text(year_gate["rule"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Mastery Bands</h3>
      <div class="records">{''.join(band_rows)}</div>
    </article>
    <article class="panel">
      <h3>Preassessment Placement</h3>
      <p><strong>Placement rule:</strong> {_text(placement["placement_rule"])}</p>
      <p><strong>Entry points:</strong> {_joined_ids([str(point) for point in placement["entry_points"]])}</p>
      <p><strong>Teacher override:</strong> {_text(placement["teacher_override_allowed"])}</p>
      <p class="note">{_text(placement["mission_span_rule"])}</p>
    </article>
  </div>
  <article class="panel campaign-checkpoints">
    <h3>Mastery Checkpoints</h3>
    <div class="records">{''.join(checkpoint_rows)}</div>
  </article>
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


def _privacy_section(raw_packet: object) -> str:
    if raw_packet is None:
        return ""

    packet = _expect_dict(raw_packet)
    access_controls = _expect_list(packet["access_controls"])
    pilot_material_notes = _expect_list(packet["pilot_material_notes"])
    retention_notes = _expect_list(packet["retention_notes"])
    boundary = _expect_dict(packet["privacy_boundary"])

    access_rows = []
    for raw_control in access_controls:
        control = _expect_dict(raw_control)
        access_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(control["label"])}</h4>
    <div class="badge-row">
      {_badge(control["status"])}
    </div>
  </div>
  <p class="note">{_text(control["note"])}</p>
</article>"""
        )

    pilot_rows = []
    for note in pilot_material_notes:
        pilot_rows.append(
            f"""
<article class="record">
  <p>{_text(note)}</p>
</article>"""
        )

    retention_rows = []
    for note in retention_notes:
        retention_rows.append(
            f"""
<article class="record">
  <p>{_text(note)}</p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="privacy-title">
  <div class="section-heading">
    <p class="eyebrow">Pilot Privacy Baseline</p>
    <h2 id="privacy-title">{_text(packet["framework_title"])}</h2>
    <div class="badge-row">
      {_badge(packet["privacy_status"])}
      {_badge(packet["release_state"])}
    </div>
    <p>{_text(packet["data_minimization_rule"])}</p>
    <p class="note">{_text(packet["ai_limitations_note"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Access Controls</h3>
      <div class="records">{''.join(access_rows)}</div>
    </article>
    <article class="panel">
      <h3>Privacy Boundary</h3>
      <p><strong>Student names:</strong> {_text(boundary["student_names"])}</p>
      <p><strong>Student IDs:</strong> {_text(boundary["student_ids"])}</p>
      <p><strong>Grades:</strong> {_text(boundary["grades"])}</p>
      <p><strong>Saved writing profiles:</strong> {_text(boundary["saved_writing_profiles"])}</p>
    </article>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Pilot Material Notes</h3>
      <div class="records">{''.join(pilot_rows)}</div>
    </article>
    <article class="panel">
      <h3>Retention Notes</h3>
      <div class="records">{''.join(retention_rows)}</div>
      <p class="note">{_text(packet["readiness_summary"])}</p>
      <p><strong>Teacher final authority:</strong> {_text(packet["teacher_final_authority"])}</p>
      <p><strong>No PII default:</strong> {_text(packet["no_pii_default"])}</p>
      <p><strong>Retention posture:</strong> {_text(packet["retention_posture"])}</p>
    </article>
  </div>
</section>"""


def _student_data_minimization_section(raw_packet: object) -> str:
    if raw_packet is None:
        return ""

    packet = _expect_dict(raw_packet)
    default_collections = _expect_list(packet["default_collections"])
    conditional_collections = _expect_list(packet["conditional_collections"])
    retention_controls = _expect_list(packet["retention_controls"])
    teacher_controls = _expect_list(packet["teacher_controls"])
    pilot_questions = _expect_list(packet["pilot_questions"])
    prohibited_collections = _expect_list(packet["prohibited_collections"])
    privacy_alignment = _expect_dict(packet["privacy_alignment"])

    default_rows = []
    for raw_item in default_collections:
        item = _expect_dict(raw_item)
        default_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(item["data_type"])}</h4>
    <div class="badge-row">
      {_badge(item["status"])}
    </div>
  </div>
  <p class="note">{_text(item["why_needed"])}</p>
</article>"""
        )

    conditional_rows = []
    for raw_item in conditional_collections:
        item = _expect_dict(raw_item)
        conditional_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(item["data_type"])}</h4>
    <div class="badge-row">
      {_badge(item["status"])}
    </div>
  </div>
  <p class="note">{_text(item["why_needed"])}</p>
</article>"""
        )

    retention_rows = []
    for raw_item in retention_controls:
        item = _expect_dict(raw_item)
        retention_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(item["label"])}</h4>
    <div class="badge-row">
      {_badge(item["status"])}
    </div>
  </div>
  <p class="note">{_text(item["note"])}</p>
</article>"""
        )

    teacher_rows = []
    for item in teacher_controls:
        teacher_rows.append(
            f"""
<article class="record">
  <p>{_text(item)}</p>
</article>"""
        )

    question_rows = []
    for item in pilot_questions:
        question_rows.append(
            f"""
<article class="record">
  <p>{_text(item)}</p>
</article>"""
        )

    prohibited_rows = []
    for item in prohibited_collections:
        prohibited_rows.append(
            f"""
<article class="record">
  <p>{_text(item)}</p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="student-data-minimization-title">
  <div class="section-heading">
    <p class="eyebrow">Student Data Minimization Plan</p>
    <h2 id="student-data-minimization-title">{_text(packet["framework_title"])}</h2>
    <div class="badge-row">
      {_badge(packet["minimization_status"])}
      {_badge(packet["release_state"])}
      {_badge(packet["collection_strategy"])}
    </div>
    <p>{_text(packet["purpose_limitation"])}</p>
    <p class="note">{_text(packet["storage_limitation"])}</p>
    <p class="note">{_text(packet["access_limitation"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Default Collections</h3>
      <div class="records">{''.join(default_rows)}</div>
    </article>
    <article class="panel">
      <h3>Conditional Collections</h3>
      <div class="records">{''.join(conditional_rows)}</div>
    </article>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Prohibited Collections</h3>
      <div class="records">{''.join(prohibited_rows)}</div>
    </article>
    <article class="panel">
      <h3>Retention Controls</h3>
      <div class="records">{''.join(retention_rows)}</div>
    </article>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Teacher Controls</h3>
      <div class="records">{''.join(teacher_rows)}</div>
    </article>
    <article class="panel">
      <h3>Pilot Questions</h3>
      <div class="records">{''.join(question_rows)}</div>
      <p class="note">{_text(packet["readiness_summary"])}</p>
    </article>
  </div>
  <article class="panel">
    <h3>Privacy Alignment</h3>
    <p><strong>No PII default:</strong> {_text(privacy_alignment["no_pii_default"])}</p>
    <p><strong>Teacher final authority:</strong> {_text(privacy_alignment["teacher_final_authority"])}</p>
    <p><strong>Retention posture:</strong> {_text(privacy_alignment["retention_posture"])}</p>
  </article>
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
.status-strip, .tab-strip { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; }
.link-strip { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.console-grid { display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2fr); gap: 14px; margin-top: 12px; }
.console-main > .split, .community-console > .split { margin-top: 12px; }
.console-nav .records, .console-main .records { margin-top: 10px; }
.console-nav .panel + .panel, .console-main .panel + .panel { margin-top: 12px; }
.tab-strip .badge { background: #f8fafc; }
.community-console { background: linear-gradient(180deg, #fffdf8 0%, #ffffff 100%); border-color: #d8c79b; }
.community-console .panel { background: #fffef9; }
.community-console .badge { background: #fff; }
.community-console .status-strip .badge { background: #fff7e8; }
.community-console .records { gap: 10px; }
.community-console {
  background: linear-gradient(180deg, #f5ead1 0%, #fff6e6 100%);
  border-color: #cdb88b;
  padding: 20px;
}
.community-shell {
  display: grid;
  gap: 14px;
}
.community-hero {
  display: grid;
  grid-template-columns: minmax(260px, 0.85fr) minmax(0, 2.15fr);
  gap: 12px;
  align-items: stretch;
}
.brand-plate {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 18px;
  border: 1px solid #4e3b1d;
  border-radius: 10px;
  background: linear-gradient(180deg, #1a2430 0%, #101722 100%);
  color: #f5dfb2;
  box-shadow: inset 0 0 0 1px rgba(245, 223, 178, 0.08);
}
.brand-mark {
  width: 66px;
  height: 66px;
  border-radius: 50%;
  border: 2px solid #cfad68;
  display: grid;
  place-items: center;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 1px;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.18));
}
.brand-plate .eyebrow,
.brand-subtitle {
  color: #f0d59c;
}
.brand-subtitle {
  margin-bottom: 0;
}
.hero-meta-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}
.hero-meta-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 102px;
  padding: 12px 14px;
  border: 1px solid #d7c29a;
  border-radius: 8px;
  background: linear-gradient(180deg, #f9efd9 0%, #efe0bd 100%);
}
.hero-meta-card strong {
  font-size: 16px;
  line-height: 1.25;
}
.hero-meta-card span {
  color: var(--muted);
  font-size: 12px;
}
.hero-meta-label {
  margin: 0;
  color: #7b5a2d;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hero-meta-alert {
  background: linear-gradient(180deg, #73321d 0%, #4d2016 100%);
  border-color: #ca6e35;
  color: #f7d9b1;
}
.hero-meta-alert .hero-meta-label,
.hero-meta-alert span {
  color: #f3c692;
}
.year-gate-panel {
  display: grid;
  grid-template-columns: minmax(220px, 0.9fr) minmax(0, 2.2fr) minmax(220px, 0.9fr);
  gap: 14px;
  align-items: center;
  background: linear-gradient(180deg, #f9eed7 0%, #f1e0bf 100%);
  border-color: #d2bf95;
}
.year-gate-copy h3,
.year-gate-copy p {
  margin-bottom: 8px;
}
.year-track {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 12px 0;
}
.year-track::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  background: rgba(94, 75, 35, 0.45);
  transform: translateY(-50%);
}
.year-tick {
  position: relative;
  z-index: 1;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(255, 249, 237, 0.88);
  color: #725729;
  font-size: 12px;
}
.year-tick.highlight {
  border-color: #d5b36d;
  background: #1f3d45;
  color: #f8e4b6;
  font-weight: 700;
  transform: scale(1.08);
}
.year-track-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  color: var(--muted);
  font-size: 12px;
}
.year-pin {
  padding: 4px 10px;
  border: 1px solid #d6b36e;
  border-radius: 999px;
  background: #17353e;
  color: #f8e3b0;
  font-weight: 700;
}
.year-gate-note {
  border: 1px solid #d8c6a1;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.5);
  padding: 12px;
}
.status-overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 0.34fr);
  gap: 14px;
  align-items: stretch;
}
.status-card-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
}
.status-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 106px;
  padding: 12px;
  border: 1px solid #c9b58b;
  border-radius: 8px;
  background: linear-gradient(180deg, #fffaf1 0%, #f3e4c5 100%);
}
.status-card-label,
.mini-card-label,
.diagnostic-label,
.route-stat span,
.hero-meta-label,
.label,
.scope-index .badge {
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.status-card-label {
  margin: 0;
  color: #7d5b2e;
  font-size: 11px;
  font-weight: 700;
}
.status-card-value {
  font-size: 22px;
  line-height: 1.05;
}
.status-card-note {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.status-card.status-blocked {
  border-color: #c55b3f;
  background: linear-gradient(180deg, #f9d9cf 0%, #f0c1ad 100%);
}
.status-card.status-ready {
  border-color: #95b78a;
}
.status-card.status-guarded {
  border-color: #c69b42;
  background: linear-gradient(180deg, #f4e1af 0%, #efd58e 100%);
}
.status-card.status-partial {
  border-color: #c19a53;
}
.overall-progress-card {
  display: grid;
  gap: 6px;
  align-content: center;
  padding: 14px;
  border: 1px solid #c7b68b;
  border-radius: 8px;
  background: linear-gradient(180deg, #fff8ee 0%, #f0e0bf 100%);
  text-align: center;
}
.overall-progress-card strong {
  font-size: 48px;
  line-height: 1;
}
.overall-progress-card p {
  margin: 0;
}
.scope-ladder-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.scope-card {
  padding: 14px;
  border: 1px solid #c9b58b;
  border-radius: 8px;
  background: linear-gradient(180deg, #f9f1de 0%, #efe1bf 100%);
}
.scope-card.scope-active {
  border-color: #2e6c73;
  background: linear-gradient(180deg, #dfeeed 0%, #c9e0dc 100%);
  box-shadow: 0 0 0 1px rgba(46, 108, 115, 0.12);
}
.scope-index {
  margin-bottom: 10px;
}
.community-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(340px, 1fr);
  gap: 14px;
  align-items: start;
}
.community-main,
.community-sidebar {
  display: grid;
  gap: 14px;
}
.community-bottom-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.route-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.route-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #c9b58b;
  border-radius: 8px;
  background: linear-gradient(180deg, #fffaf0 0%, #f7edd5 100%);
}
.route-hero {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}
.route-mark {
  width: 76px;
  height: 76px;
  border: 1px solid #b89457;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: repeating-linear-gradient(45deg, #efe2bf 0 10px, #fff8e7 10px 20px);
  color: #4c3a1d;
  font-size: 24px;
  font-weight: 700;
}
.route-status {
  display: flex;
  justify-content: flex-start;
}
.route-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.route-stat {
  padding: 8px 10px;
  border: 1px solid #d7c6a0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.55);
}
.route-stat span {
  display: block;
  color: var(--muted);
  font-size: 11px;
}
.route-stat strong {
  font-size: 15px;
}
.route-button {
  justify-content: center;
}
.mini-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 10px 0 12px;
}
.mini-card {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid #d9c6a0;
  border-radius: 8px;
  background: #fff9ef;
}
.mini-card-label {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}
.mini-card-value {
  font-size: 24px;
  line-height: 1;
}
.release-panel {
  display: grid;
  gap: 10px;
}
.release-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.release-blocker-card {
  padding: 12px;
  border: 1px solid #d2b88f;
  border-radius: 8px;
  background: #fff9ee;
}
.actions-panel .action-stack {
  display: grid;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.evidence-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(180px, 0.8fr);
  gap: 12px;
  align-items: start;
}
.evidence-summary,
.evidence-notes,
.history-card,
.diagnostic-card {
  border: 1px solid #d7c6a0;
  border-radius: 8px;
  background: #fffaf2;
  padding: 12px;
}
.evidence-summary-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.label {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}
.evidence-notes .action-button {
  width: 100%;
  justify-content: center;
}
.review-editor {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding: 10px;
  border: 1px solid #d8c6a1;
  border-radius: 8px;
  background: #fffdf7;
}
.review-editor label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
}
.review-editor select,
.review-editor textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
  font: inherit;
  background: #ffffff;
}
.review-editor textarea {
  resize: vertical;
  min-height: 76px;
}
.history-panel .records {
  gap: 8px;
}
.diagnostics-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}
.diagnostic-card {
  display: grid;
  gap: 4px;
  background: linear-gradient(180deg, #fff8ea 0%, #f1e4c9 100%);
}
.diagnostic-label {
  margin: 0;
  color: #7d5b2e;
  font-size: 11px;
  font-weight: 700;
}
.compact-heading {
  max-width: none;
}
.compact-heading h3 {
  font-size: 18px;
  margin-bottom: 0;
}
.link-badge { text-decoration: none; }
.map-auditor {
  background: linear-gradient(180deg, #f9f6ef 0%, #fffdf8 100%);
  border-color: #c7b68b;
}
.map-auditor .panel {
  background: #fffaf0;
}
.map-auditor .badge {
  background: #fffdf8;
}
.map-auditor .status-strip .badge {
  background: #fff3d7;
}
.people-auditor {
  background: linear-gradient(180deg, #f4f8fb 0%, #ffffff 100%);
  border-color: #b8cad6;
}
.people-auditor .panel {
  background: #f9fcfe;
}
.people-auditor .badge {
  background: #ffffff;
}
.people-auditor .status-strip .badge {
  background: #e9f3f7;
}
.people-auditor-bottom {
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.05fr) minmax(0, 0.9fr) minmax(0, 0.85fr) minmax(0, 0.95fr);
}
.filter-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 10px 0 12px;
}
.filter-input {
  flex: 1;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #ffffff;
  padding: 8px 10px;
  color: var(--muted);
}
.filter-input::placeholder {
  color: #7d8892;
}
.filter-button {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #f7f3ea;
  color: var(--ink);
  font-weight: 700;
  padding: 8px 12px;
}
.issue-action {
  display: inline-flex;
  margin-top: 10px;
}
.focus-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.8fr);
  gap: 12px;
  align-items: start;
}
.focus-card {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  padding: 12px;
}
.portrait-frame {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 220px;
  background: repeating-linear-gradient(45deg, #f2f2f2 0 12px, #ffffff 12px 24px);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 12px;
}
.portrait-badge {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  border: 2px solid #a9884c;
  display: grid;
  place-items: center;
  font-size: 42px;
  font-weight: 700;
  color: #4a3a24;
  background: rgba(255, 255, 255, 0.72);
}
.score-card {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  padding: 12px;
  text-align: center;
}
.score-ring {
  --score: 0;
  width: 112px;
  height: 112px;
  margin: 8px auto 10px;
  border-radius: 50%;
  background: conic-gradient(#3e7c3a calc(var(--score) * 1%), #d9d9d9 0);
  display: grid;
  place-items: center;
  position: relative;
}
.score-ring::after {
  content: "";
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: #fff;
}
.score-ring strong {
  position: relative;
  z-index: 1;
  font-size: 28px;
}
.score-ring small {
  position: relative;
  z-index: 1;
  display: block;
  font-size: 11px;
  font-weight: 700;
}
.classification-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.classification-card {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  padding: 10px;
}
.classification-card.active {
  border-color: #7db35a;
  box-shadow: 0 0 0 1px rgba(125, 179, 90, 0.18);
}
.duplicate-check {
  margin-top: 12px;
}
.field-grid {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.fake-select {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: #59636d;
  padding: 8px 10px;
}
.progress-shell {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.progress-segment {
  display: grid;
  gap: 4px;
}
.progress-segment strong,
.progress-segment span {
  display: block;
  font-size: 12px;
}
.progress-bar {
  display: block;
  height: 8px;
  background: #e5dcc8;
  border-radius: 999px;
  overflow: hidden;
}
.progress-bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #0f766e 0%, #7cb342 100%);
}
.auditor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.1fr) minmax(0, 0.95fr);
  gap: 14px;
  margin-top: 14px;
}
.auditor-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.9fr);
  gap: 14px;
  margin-top: 14px;
}
.map-stage {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: linear-gradient(180deg, #efe2bb 0%, #f7edd0 100%);
  padding: 12px;
}
.map-stage-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}
.sheet-card.selected {
  border-color: #d09c3f;
  box-shadow: 0 0 0 1px rgba(208, 156, 63, 0.2);
}
.coverage-table {
  width: 100%;
  border-collapse: collapse;
}
.coverage-table th,
.coverage-table td {
  border: 1px solid var(--line);
  padding: 8px;
  text-align: left;
  vertical-align: top;
}
.button-row,
.action-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.action-button {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  color: var(--ink);
}
.action-primary {
  background: #edf6e6;
  border-color: #9bc47f;
}
.action-secondary {
  background: #f8f4ea;
}
.action-danger {
  background: #fcecec;
  border-color: #e4a1a1;
}
.auditor-bottom .panel { align-self: start; }
.campaign-checkpoints { display: grid; gap: 12px; }
.campaign-checkpoints .record { background: #fafcf7; }
.campaign-section .split { align-items: start; }

body {
  color: var(--ink);
  font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
  background:
    radial-gradient(circle at top, rgba(70, 94, 124, 0.42) 0%, rgba(11, 17, 24, 0) 45%),
    linear-gradient(180deg, #0b1118 0%, #111923 100%);
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.018) 1px, transparent 1px, transparent 6px),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.014), rgba(255, 255, 255, 0.014) 1px, transparent 1px, transparent 8px);
  opacity: 0.55;
  mix-blend-mode: overlay;
}
a {
  color: #294f8c;
}
h1,
h2,
h3,
h4 {
  font-family: "Georgia", "Times New Roman", serif;
  letter-spacing: 0.02em;
}
.topbar {
  background: linear-gradient(180deg, #121c27 0%, #0b1118 100%);
  border-bottom: 1px solid #3f2e18;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  color: #f0d8a4;
}
.topbar h1,
.topbar p {
  color: inherit;
}
.topbar .status {
  background: linear-gradient(180deg, #5a2519 0%, #35150f 100%);
  border-color: #cd7449;
  color: #f6d1a0;
}
.layout {
  gap: 16px;
  margin: 0 auto;
  max-width: 1720px;
  padding: 16px clamp(12px, 2vw, 24px) 60px;
}
.band {
  background: linear-gradient(180deg, #f7ebd2 0%, #f0dfb9 100%);
  border: 1px solid #cdb78a;
  border-radius: 16px;
  box-shadow: 0 18px 40px rgba(21, 14, 7, 0.14);
  padding: 20px;
}
.panel,
.record {
  background: linear-gradient(180deg, #fff8ed 0%, #f3e6cc 100%);
  border: 1px solid #cbb58a;
  border-radius: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}
.badge {
  background: linear-gradient(180deg, #fffef8 0%, #efe0bc 100%);
  border-color: #c8b37c;
  border-radius: 999px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
  color: #3c2f1e;
}
.action-button {
  background: linear-gradient(180deg, #fff8ec 0%, #e5d2a9 100%);
  border-color: #bc9c67;
  border-radius: 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
  color: #2f2518;
}
.action-primary {
  background: linear-gradient(180deg, #2b6266 0%, #17383c 100%);
  border-color: #143639;
  color: #f7e5bd;
}
.action-secondary {
  background: linear-gradient(180deg, #f7eddc 0%, #e8d6af 100%);
}
.action-danger {
  background: linear-gradient(180deg, #7d281d 0%, #581811 100%);
  border-color: #c65f4a;
  color: #f8dfd5;
}
.section-heading {
  max-width: none;
}
.section-heading h2 {
  font-size: 26px;
}
.compact-heading h3 {
  font-size: 18px;
}
.note,
.citation,
.readiness {
  color: #6c5d47;
}
.community-console {
  background: linear-gradient(180deg, #f4e5c9 0%, #efddb4 100%);
  border-color: #c8b184;
}
.community-console .panel {
  background: linear-gradient(180deg, #fff8ee 0%, #f4e3bf 100%);
}
.community-console .record {
  background: linear-gradient(180deg, #fffdf8 0%, #f6ebd3 100%);
}
.community-console .badge {
  background: linear-gradient(180deg, #fff8ee 0%, #eeddb5 100%);
  border-color: #c9b27b;
  color: #433625;
}
.community-console .status-strip .badge {
  background: linear-gradient(180deg, #fff4d9 0%, #edd39f 100%);
}
.community-shell {
  display: grid;
  gap: 16px;
}
.community-hero {
  gap: 14px;
  grid-template-columns: minmax(300px, 0.96fr) minmax(0, 2.04fr);
}
.brand-plate {
  min-height: 128px;
  border-radius: 14px;
  background: linear-gradient(180deg, #121b26 0%, #09111a 100%);
  box-shadow: inset 0 0 0 1px rgba(240, 215, 160, 0.08), 0 18px 30px rgba(22, 14, 7, 0.18);
}
.hero-meta-grid {
  gap: 10px;
}
.hero-meta-card {
  min-height: 108px;
  border-radius: 12px;
  background: linear-gradient(180deg, #f9efda 0%, #ecd6a9 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
}
.hero-meta-alert {
  background: linear-gradient(180deg, #7a2f1a 0%, #471d14 100%);
  border-color: #cf7a47;
  color: #f7d9b4;
}
.year-gate-panel {
  grid-template-columns: minmax(230px, 0.9fr) minmax(0, 2.2fr) minmax(230px, 0.9fr);
  border-radius: 14px;
  background: linear-gradient(180deg, #f8ecd1 0%, #efdeb7 100%);
}
.year-track {
  padding: 14px 0 12px;
}
.status-overview-grid {
  gap: 14px;
}
.status-card-grid {
  gap: 10px;
}
.status-card {
  border-radius: 12px;
}
.overall-progress-card {
  border-radius: 12px;
  background: linear-gradient(180deg, #fff7e9 0%, #eedcb4 100%);
}
.scope-card {
  border-radius: 12px;
}
.scope-card.scope-active {
  background: linear-gradient(180deg, #dceeed 0%, #bfd8d2 100%);
}
.community-layout {
  gap: 16px;
  grid-template-columns: minmax(0, 1.8fr) minmax(360px, 0.98fr);
}
.community-main,
.community-sidebar {
  gap: 16px;
}
.community-bottom-grid {
  gap: 16px;
}
.route-grid {
  gap: 14px;
}
.route-card {
  border-radius: 14px;
}
.route-mark {
  border-radius: 10px;
}
.route-stat {
  border-radius: 8px;
}
.mini-card {
  border-radius: 10px;
}
.release-panel,
.summary-panel,
.actions-panel,
.diagnostics-panel {
  border-radius: 14px;
}
.release-panel.release-blocked {
  background: linear-gradient(180deg, #f4d9d0 0%, #e8bda8 100%);
  border-color: #c05e43;
}
.release-panel.release-ready {
  background: linear-gradient(180deg, #e1f0dd 0%, #c3ddba 100%);
  border-color: #79a864;
}
.release-panel .release-badge-row .badge {
  background: rgba(255, 255, 255, 0.6);
}
.evidence-summary,
.evidence-notes,
.history-card,
.diagnostic-card,
.release-blocker-card {
  border-radius: 12px;
}
.diagnostics-panel {
  background: linear-gradient(180deg, #e8d7b0 0%, #d6bd8f 100%);
}
.link-badge {
  text-decoration: none;
}
.map-auditor,
.people-auditor {
  background: linear-gradient(180deg, #0f1721 0%, #081018 100%);
  border-color: #2a3947;
  border-radius: 18px;
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.32), inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  color: #f3e2bd;
  padding: 20px;
}
.map-auditor .section-heading,
.people-auditor .section-heading {
  max-width: none;
}
.map-auditor .section-heading h2,
.people-auditor .section-heading h2 {
  color: #f0cf8e;
}
.map-auditor .section-heading p,
.people-auditor .section-heading p,
.map-auditor .note,
.people-auditor .note {
  color: #d0c1a0;
}
.map-auditor .badge,
.people-auditor .badge {
  background: rgba(15, 24, 34, 0.95);
  border-color: #4a596b;
  color: #f1d79c;
}
.map-auditor .panel,
.people-auditor .panel {
  background: linear-gradient(180deg, #f7ebd6 0%, #eddbb6 100%);
  border-color: #7f6540;
}
.map-auditor .record,
.people-auditor .record {
  background: linear-gradient(180deg, #f7edd9 0%, #ead8b4 100%);
  border-color: #a88d5b;
}
.map-auditor .review-editor,
.people-auditor .review-editor {
  background: rgba(255, 250, 243, 0.92);
  border-color: #cdb88e;
}
.auditor-grid {
  gap: 16px;
  grid-template-columns: minmax(320px, 0.98fr) minmax(0, 1.25fr) minmax(340px, 0.98fr);
}
.auditor-bottom {
  gap: 16px;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 0.95fr) minmax(0, 0.9fr);
}
.auditor-sheet-panel,
.auditor-building-panel,
.auditor-provenance-panel {
  display: grid;
  gap: 10px;
}
.building-focus-card {
  display: grid;
  gap: 10px;
}
.building-focus-card .field-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.map-stage {
  border-radius: 12px;
  background: linear-gradient(180deg, #e4d1ac 0%, #cfbb92 100%);
  border-color: #84683f;
}
.map-stage-header {
  border-bottom: 1px solid rgba(88, 67, 37, 0.28);
  padding-bottom: 8px;
}
.coverage-table {
  background: rgba(255, 255, 255, 0.22);
}
.coverage-table th {
  background: #1a2430;
  color: #f4d9a4;
}
.coverage-table td {
  background: rgba(255, 248, 233, 0.72);
}
.source-issue-card {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(120px, 0.42fr) minmax(0, 1fr);
  align-items: start;
}
.issue-media {
  display: grid;
  gap: 10px;
}
.issue-thumb {
  min-height: 136px;
  border: 1px solid #8b7046;
  border-radius: 12px;
  background:
    repeating-linear-gradient(0deg, rgba(72, 57, 29, 0.1), rgba(72, 57, 29, 0.1) 1px, transparent 1px, transparent 7px),
    repeating-linear-gradient(90deg, rgba(72, 57, 29, 0.08), rgba(72, 57, 29, 0.08) 1px, transparent 1px, transparent 9px),
    linear-gradient(180deg, #f3ead7 0%, #decda8 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
  display: grid;
  place-items: center;
}
.issue-thumb span {
  color: #4f3c22;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.issue-meta h4 {
  margin-bottom: 4px;
}
.issue-body {
  display: grid;
  gap: 10px;
}
.issue-action {
  justify-content: center;
  width: 100%;
}
.selected-issue-card {
  box-shadow: 0 0 0 1px rgba(232, 180, 74, 0.18);
}
.source-issue-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.map-auditor .building-focus-card {
  background: linear-gradient(180deg, #fff5e3 0%, #ecdab0 100%);
}
.profile-card {
  background: linear-gradient(180deg, #fff6e9 0%, #efd9b1 100%);
  border-radius: 14px;
  padding: 12px;
}
.profile-shell {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(240px, 0.82fr) minmax(0, 1.18fr);
}
.profile-media {
  display: grid;
  gap: 12px;
}
.profile-main {
  display: grid;
  gap: 12px;
}
.people-auditor .portrait-frame {
  min-height: 232px;
  background: linear-gradient(180deg, #f6f0e6 0%, #fffdf7 100%);
  border-color: #d1c09d;
  border-radius: 12px;
}
.people-auditor .portrait-badge {
  border-color: #9c7b47;
  background: radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.95), rgba(240, 227, 199, 0.8));
}
.people-auditor .score-card {
  background: linear-gradient(180deg, #fff9ef 0%, #efdfbf 100%);
  border-color: #cdbc90;
}
.people-auditor .classification-grid {
  gap: 10px;
}
.people-auditor .classification-card {
  background: linear-gradient(180deg, #fff8ec 0%, #ead9b8 100%);
  border-color: #ccb487;
  border-radius: 12px;
}
.people-auditor .classification-card.active {
  background: linear-gradient(180deg, #edf3e4 0%, #cfe0b8 100%);
}
.people-auditor .duplicate-check {
  background: rgba(255, 255, 255, 0.28);
  border: 1px dashed rgba(125, 95, 53, 0.4);
  border-radius: 12px;
  padding: 10px 12px;
}
#building-auditor {
  background: linear-gradient(180deg, #f7ecd1 0%, #efe0b7 100%);
  border-color: #cdb88b;
}
#building-auditor .records {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}
@media (max-width: 760px) {
  .topbar, .overview, .split { grid-template-columns: 1fr; }
  .console-grid { grid-template-columns: 1fr; }
  .auditor-grid, .auditor-bottom { grid-template-columns: 1fr; }
  .topbar { display: grid; }
  .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .record-title { display: grid; }
  .community-hero,
  .status-overview-grid,
  .community-layout,
  .source-issue-card,
  .profile-shell {
    grid-template-columns: 1fr;
  }
  .hero-meta-grid,
  .status-card-grid,
  .scope-ladder-grid,
  .route-grid,
  .community-bottom-grid,
  .diagnostics-grid,
  .source-issue-grid {
    grid-template-columns: 1fr;
  }
}
</style>"""
