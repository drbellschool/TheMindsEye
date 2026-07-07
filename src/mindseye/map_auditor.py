from __future__ import annotations

from pathlib import Path

from .building_data import (
    BuildingManifest,
    VerificationSuggestionManifest,
    load_building_manifest,
    load_verification_suggestion_manifest,
)
from .community_review import build_community_review_packet
from .map_rendering import build_map_rendering_packet
from .models import MindseyeDataError, TownPackage
from .review_state import history_items_from_events, load_review_state
from .sanborn import (
    SanbornSheetReviewManifest,
    SanbornStitchingManifest,
    load_sanborn_sheet_review_manifest,
    load_sanborn_stitching_manifest,
)
from .teacher_review import build_teacher_approval_packet


def build_map_auditor_packet(
    package: TownPackage,
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
) -> dict[str, object]:
    """Build the community-linked map auditor contract.

    The workspace is intentionally narrow: it reuses the stitched-sheet review
    notes, reviewed building anchors, and source-issue provenance already in the
    repo. Road and rail drafting stay marked as future work rather than
    hard-coded geometry.
    """
    building_manifest = _optional_building_manifest(repo_root, town_slug, state_root=state_root)
    sheet_review_manifest = _optional_sheet_review_manifest(repo_root, town_slug)
    stitching_manifest = _optional_stitching_manifest(repo_root, town_slug)
    suggestion_manifest = _optional_suggestion_manifest(repo_root, town_slug)
    map_packet = _optional_map_rendering_packet(package, repo_root, town_slug, state_root=state_root)
    teacher_review = _optional_teacher_review_packet(package, repo_root, town_slug)
    community_review = _optional_community_review_packet(package, repo_root, town_slug, state_root=state_root)
    review_state = load_review_state(state_root)

    selected_sheet = _selected_sheet(sheet_review_manifest, stitching_manifest)
    selected_building = _selected_building(building_manifest, selected_sheet)

    return {
        "dashboard_id": f"map_auditor_{package.package_id}",
        "dashboard_title": f"{package.town_name} Community Map Auditor",
        "town_package_id": package.package_id,
        "town_name": package.town_name,
        "state_region": package.state_region,
        "year_gate": _historical_year_gate(package),
        "navigation_links": _navigation_links(),
        "status_chips": _status_chips(
            building_manifest,
            sheet_review_manifest,
            suggestion_manifest,
            community_review,
            map_packet,
        ),
        "progress_summary": _progress_summary(
            building_manifest,
            sheet_review_manifest,
            community_review,
            map_packet,
        ),
        "sheet_selector": _sheet_selector(sheet_review_manifest, stitching_manifest),
        "coverage_grid": _coverage_grid(sheet_review_manifest),
        "selected_sheet": selected_sheet,
        "stitch_workspace": _stitch_workspace(stitching_manifest, map_packet, selected_sheet),
        "design_tools": _design_tools(),
        "layer_stack": _layer_stack(map_packet),
        "selected_building": selected_building,
        "building_workspace": _building_workspace(selected_building),
        "art_preview": _art_preview(selected_building, map_packet),
        "interior_notes": _interior_notes(selected_building),
        "provenance_trail": _provenance_trail(community_review),
        "people_review": list(community_review["people"]) if community_review is not None else [],
        "businesses_review": list(community_review["businesses"]) if community_review is not None else [],
        "review_legend": _review_legend(building_manifest, community_review),
        "review_history": _review_history(
            sheet_review_manifest,
            building_manifest,
            suggestion_manifest,
            community_review,
            teacher_review,
            review_state.get("events", []),
        ),
        "unresolved_summary": _unresolved_summary(building_manifest, suggestion_manifest, community_review),
        "quick_actions": _quick_actions(),
        "notes": "Map review is the upstream workspace for building, people, and business auditing.",
    }


def _optional_building_manifest(
    repo_root: Path | None,
    town_slug: str,
    state_root: Path | None,
) -> BuildingManifest | None:
    try:
        return load_building_manifest(repo_root, town_slug, state_root=state_root)
    except MindseyeDataError:
        return None


def _optional_sheet_review_manifest(
    repo_root: Path | None,
    town_slug: str,
) -> SanbornSheetReviewManifest | None:
    try:
        return load_sanborn_sheet_review_manifest(repo_root, town_slug)
    except MindseyeDataError:
        return None


def _optional_stitching_manifest(repo_root: Path | None, town_slug: str) -> SanbornStitchingManifest | None:
    try:
        return load_sanborn_stitching_manifest(repo_root, town_slug)
    except MindseyeDataError:
        return None


def _optional_suggestion_manifest(
    repo_root: Path | None,
    town_slug: str,
) -> VerificationSuggestionManifest | None:
    try:
        return load_verification_suggestion_manifest(repo_root, town_slug)
    except MindseyeDataError:
        return None


def _optional_map_rendering_packet(
    package: TownPackage,
    repo_root: Path | None,
    town_slug: str,
    state_root: Path | None,
) -> dict[str, object] | None:
    try:
        packet = build_map_rendering_packet(
            package,
            repo_root=repo_root,
            town_slug=town_slug,
            state_root=state_root,
        )
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _optional_teacher_review_packet(
    package: TownPackage,
    repo_root: Path | None,
    town_slug: str,
) -> dict[str, object] | None:
    try:
        packet = build_teacher_approval_packet(package, repo_root=repo_root, town_slug=town_slug)
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _optional_community_review_packet(
    package: TownPackage,
    repo_root: Path | None,
    town_slug: str,
    state_root: Path | None,
) -> dict[str, object] | None:
    try:
        packet = build_community_review_packet(
            package,
            repo_root=repo_root,
            town_slug=town_slug,
            state_root=state_root,
        )
    except MindseyeDataError:
        return None
    if packet["town_package_id"] != package.package_id:
        return None
    return packet


def _historical_year_gate(package: TownPackage) -> dict[str, object]:
    map_year = _map_year(package)
    return {
        "map_year": map_year,
        "start_year": map_year - 10,
        "end_year": map_year + 10,
        "span_before_years": 10,
        "span_after_years": 10,
        "total_span_years": 20,
        "rule": "Keep Community review, map review, building review, and source gathering inside a 20-year window centered on the Sanborn map year.",
    }


def _map_year(package: TownPackage) -> int:
    if package.map_layers and isinstance(package.map_layers[0], dict):
        map_year = package.map_layers[0].get("year")
        if isinstance(map_year, int) and not isinstance(map_year, bool):
            return map_year

    start_year = package.time_window.get("start_year")
    if isinstance(start_year, int) and not isinstance(start_year, bool):
        return start_year
    raise MindseyeDataError("town package is missing a usable map year")


def _navigation_links() -> list[dict[str, object]]:
    return [
        {"link_id": "return-community", "label": "Back to Community", "href": "#community-dashboard"},
        {"link_id": "open-building-auditor", "label": "Open Building Auditor", "href": "#building-auditor"},
        {"link_id": "open-people-auditor", "label": "Open People Auditor", "href": "#people-auditor"},
    ]


def _status_chips(
    building_manifest: BuildingManifest | None,
    sheet_review_manifest: SanbornSheetReviewManifest | None,
    suggestion_manifest: VerificationSuggestionManifest | None,
    community_review: dict[str, object] | None,
    map_packet: dict[str, object] | None,
) -> list[dict[str, object]]:
    sheet_total = len(sheet_review_manifest.reviews) if sheet_review_manifest is not None else 0
    reviewed_buildings = (
        sum(1 for building in building_manifest.buildings if building.identity_status == "reviewed")
        if building_manifest is not None
        else 0
    )
    reviewed_art = (
        sum(1 for building in building_manifest.buildings if building.visual_detail_status in {"verified", "inferred"})
        if building_manifest is not None
        else 0
    )
    people_count = len(community_review["people"]) if community_review is not None else 0
    business_count = len(community_review["businesses"]) if community_review is not None else 0
    source_issue_count = len(community_review["source_issues"]) if community_review is not None else 0
    candidate_count = suggestion_manifest.candidate_count if suggestion_manifest is not None else 0
    road_status = "deferred"
    if map_packet is not None:
        road_status = str(map_packet["road_rail_layer"]["status"])

    overall_progress = _overall_progress(
        sheet_review_manifest,
        building_manifest,
        community_review,
        map_packet,
    )

    return [
        {"chip_id": "town-progress", "label": "Town Progress", "value": f"{overall_progress}%", "state": "reviewing"},
        {
            "chip_id": "sheets-reviewed",
            "label": "Sanborn Sheets",
            "value": f"{sheet_total}/{sheet_total}" if sheet_total else "0/0",
            "state": "ready" if sheet_total else "blocked",
        },
        {
            "chip_id": "footprints-tagged",
            "label": "Building Footprints",
            "value": building_manifest.record_count if building_manifest is not None else 0,
            "state": "partial" if building_manifest is not None else "blocked",
        },
        {
            "chip_id": "art-approved",
            "label": "Building Art Approved",
            "value": reviewed_art,
            "state": "reviewing" if reviewed_art else "blocked",
        },
        {
            "chip_id": "people-reviewed",
            "label": "People Reviewed",
            "value": people_count,
            "state": "reviewing" if people_count else "blocked",
        },
        {
            "chip_id": "businesses-reviewed",
            "label": "Businesses Reviewed",
            "value": business_count,
            "state": "reviewing" if business_count else "blocked",
        },
        {
            "chip_id": "source-issues-linked",
            "label": "Source Issues Linked",
            "value": source_issue_count,
            "state": "reviewing" if source_issue_count else "blocked",
        },
        {
            "chip_id": "road-rail-status",
            "label": "Road / Rail",
            "value": road_status,
            "state": road_status,
        },
    ]


def _overall_progress(
    sheet_review_manifest: SanbornSheetReviewManifest | None,
    building_manifest: BuildingManifest | None,
    community_review: dict[str, object] | None,
    map_packet: dict[str, object] | None,
) -> int:
    percentages: list[int] = []

    if sheet_review_manifest is not None and sheet_review_manifest.reviews:
        percentages.append(100)
    if building_manifest is not None and building_manifest.record_count:
        reviewed = sum(1 for building in building_manifest.buildings if building.identity_status == "reviewed")
        percentages.append(int(round((reviewed / building_manifest.record_count) * 100)))
    if community_review is not None:
        people = len(community_review["people"])
        businesses = len(community_review["businesses"])
        source_issues = len(community_review["source_issues"])
        denominator = max(people + businesses + source_issues, 1)
        percentages.append(int(round(((people + businesses + source_issues) / denominator) * 100)))
    if map_packet is not None:
        layer_statuses = [
            str(map_packet["base_map_layer"]["stitching_status"]),
            str(map_packet["building_art_layer"]["status"]),
            str(map_packet["label_layer"]["status"]),
            str(map_packet["evidence_provenance_layer"]["status"]),
        ]
        ready_layers = sum(1 for status in layer_statuses if status in {"ready", "reviewed_subset_available"})
        percentages.append(int(round((ready_layers / len(layer_statuses)) * 100)))

    if not percentages:
        return 0
    return int(round(sum(percentages) / len(percentages)))


def _progress_summary(
    building_manifest: BuildingManifest | None,
    sheet_review_manifest: SanbornSheetReviewManifest | None,
    community_review: dict[str, object] | None,
    map_packet: dict[str, object] | None,
) -> dict[str, object]:
    sheet_reviewed = len(sheet_review_manifest.reviews) if sheet_review_manifest is not None else 0
    sheet_total = len(sheet_review_manifest.reviews) if sheet_review_manifest is not None else 0
    building_total = building_manifest.record_count if building_manifest is not None else 0
    building_reviewed = (
        sum(1 for building in building_manifest.buildings if building.identity_status == "reviewed")
        if building_manifest is not None
        else 0
    )
    building_art_approved = (
        sum(1 for building in building_manifest.buildings if building.visual_detail_status in {"verified", "inferred"})
        if building_manifest is not None
        else 0
    )
    people_reviewed = len(community_review["people"]) if community_review is not None else 0
    business_reviewed = len(community_review["businesses"]) if community_review is not None else 0
    source_issues_linked = len(community_review["source_issues"]) if community_review is not None else 0
    road_rail_status = str(map_packet["road_rail_layer"]["status"]) if map_packet is not None else "deferred"

    return {
        "overall_percent": _overall_progress(sheet_review_manifest, building_manifest, community_review, map_packet),
        "sheet_reviewed": sheet_reviewed,
        "sheet_total": sheet_total,
        "sheet_percent": 100 if sheet_total else 0,
        "building_total": building_total,
        "building_reviewed": building_reviewed,
        "building_percent": int(round((building_reviewed / building_total) * 100)) if building_total else 0,
        "building_art_approved": building_art_approved,
        "building_art_percent": int(round((building_art_approved / building_total) * 100)) if building_total else 0,
        "people_reviewed": people_reviewed,
        "business_reviewed": business_reviewed,
        "source_issues_linked": source_issues_linked,
        "road_rail_status": road_rail_status,
        "segments": [
            {
                "label": "Sheets",
                "value": f"{sheet_reviewed}/{sheet_total}" if sheet_total else "0/0",
                "percent": 100 if sheet_total else 0,
            },
            {
                "label": "Buildings",
                "value": f"{building_reviewed}/{building_total}" if building_total else "0/0",
                "percent": int(round((building_reviewed / building_total) * 100)) if building_total else 0,
            },
            {
                "label": "Building Art",
                "value": f"{building_art_approved}/{building_total}" if building_total else "0/0",
                "percent": int(round((building_art_approved / building_total) * 100)) if building_total else 0,
            },
            {
                "label": "People / Businesses",
                "value": f"{people_reviewed + business_reviewed}",
                "percent": 100 if (people_reviewed + business_reviewed) else 0,
            },
            {
                "label": "Source Issues",
                "value": str(source_issues_linked),
                "percent": 100 if source_issues_linked else 0,
            },
        ],
    }


def _sheet_selector(
    sheet_review_manifest: SanbornSheetReviewManifest | None,
    stitching_manifest: SanbornStitchingManifest | None,
) -> list[dict[str, object]]:
    reviews = list(sheet_review_manifest.reviews) if sheet_review_manifest is not None else []
    anchor_sheet_id = stitching_manifest.anchor_sheet_id if stitching_manifest is not None else ""
    cards: list[dict[str, object]] = []
    for review in reviews:
        cards.append(
            {
                "sheet_id": review.sheet_id,
                "sheet_number": review.sheet_number,
                "sheet_label": f"{review.sheet_number:03d}",
                "sheet_role": review.sheet_role,
                "review_status": review.review_status,
                "review_percent": 100 if review.review_status == "sheet_level_visual_review_complete" else 0,
                "observed_label_count": len(review.observed_labels),
                "is_anchor": review.sheet_id == anchor_sheet_id,
                "visible_features": list(review.visible_features),
                "deferred_work": list(review.deferred_work),
                "notes": review.notes,
            }
        )
    return cards


def _coverage_grid(sheet_review_manifest: SanbornSheetReviewManifest | None) -> list[dict[str, object]]:
    cards = _sheet_selector(sheet_review_manifest, None)
    grid: list[dict[str, object]] = []
    for card in cards:
        grid.append(
            {
                "sheet_id": card["sheet_id"],
                "sheet_label": card["sheet_label"],
                "coverage_percent": card["review_percent"],
                "status": "reviewed" if card["review_percent"] else "in_progress",
                "buildings_tagged": card["observed_label_count"],
            }
        )
    return grid


def _selected_sheet(
    sheet_review_manifest: SanbornSheetReviewManifest | None,
    stitching_manifest: SanbornStitchingManifest | None,
) -> dict[str, object] | None:
    if sheet_review_manifest is None or not sheet_review_manifest.reviews:
        return None

    anchor_sheet_id = stitching_manifest.anchor_sheet_id if stitching_manifest is not None else ""
    for review in sheet_review_manifest.reviews:
        if review.sheet_id == anchor_sheet_id:
            return {
                "sheet_id": review.sheet_id,
                "sheet_number": review.sheet_number,
                "sheet_label": f"{review.sheet_number:03d}",
                "sheet_role": review.sheet_role,
                "review_status": review.review_status,
                "observed_labels": list(review.observed_labels),
                "visible_features": list(review.visible_features),
                "deferred_work": list(review.deferred_work),
                "notes": review.notes,
            }

    review = sheet_review_manifest.reviews[0]
    return {
        "sheet_id": review.sheet_id,
        "sheet_number": review.sheet_number,
        "sheet_label": f"{review.sheet_number:03d}",
        "sheet_role": review.sheet_role,
        "review_status": review.review_status,
        "observed_labels": list(review.observed_labels),
        "visible_features": list(review.visible_features),
        "deferred_work": list(review.deferred_work),
        "notes": review.notes,
    }


def _selected_building(
    building_manifest: BuildingManifest | None,
    selected_sheet: dict[str, object] | None,
) -> dict[str, object] | None:
    if building_manifest is None or not building_manifest.buildings:
        return None

    selected_sheet_number = selected_sheet["sheet_number"] if selected_sheet is not None else None
    reviewed_buildings = [building for building in building_manifest.buildings if building.identity_status == "reviewed"]
    for building in reviewed_buildings:
        if selected_sheet_number is not None and building.sheet_number == selected_sheet_number:
            return _building_record(building)

    if reviewed_buildings:
        return _building_record(reviewed_buildings[0])

    return _building_record(building_manifest.buildings[0])


def _building_record(building) -> dict[str, object]:
    return {
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


def _stitch_workspace(
    stitching_manifest: SanbornStitchingManifest | None,
    map_packet: dict[str, object] | None,
    selected_sheet: dict[str, object] | None,
) -> dict[str, object]:
    if stitching_manifest is None:
        return {
            "stitching_status": "unavailable",
            "control_point_status": "unavailable",
            "georeferencing_status": "deferred",
            "anchor_sheet_id": "",
            "sheet_plan_count": 0,
            "link_count": 0,
            "selected_sheet_id": selected_sheet["sheet_id"] if selected_sheet is not None else "",
            "notes": "Stitching prep is not available yet.",
        }

    return {
        "stitching_status": stitching_manifest.stitching_status,
        "control_point_status": stitching_manifest.control_point_status,
        "georeferencing_status": stitching_manifest.georeferencing_status,
        "location_extraction_status": stitching_manifest.location_extraction_status,
        "anchor_sheet_id": stitching_manifest.anchor_sheet_id,
        "sheet_plan_count": stitching_manifest.sheet_plan_count,
        "link_count": stitching_manifest.link_count,
        "selected_sheet_id": selected_sheet["sheet_id"] if selected_sheet is not None else stitching_manifest.anchor_sheet_id,
        "candidate_links": [
            {
                "from_sheet_id": link.from_sheet_id,
                "to_sheet_id": link.to_sheet_id,
                "link_type": link.link_type,
                "alignment_status": link.alignment_status,
                "evidence_basis": link.evidence_basis,
                "notes": link.notes,
            }
            for link in stitching_manifest.links
        ],
        "sheet_plans": [
            {
                "sheet_id": plan.sheet_id,
                "sheet_number": plan.sheet_number,
                "sheet_role": plan.sheet_role,
                "stitch_priority": plan.stitch_priority,
                "stitch_readiness": plan.stitch_readiness,
                "candidate_neighbor_sheet_ids": list(plan.candidate_neighbor_sheet_ids),
                "blocking_tasks": list(plan.blocking_tasks),
                "notes": plan.notes,
            }
            for plan in stitching_manifest.sheet_plans
        ],
        "notes": "Control points and georeferencing remain deferred while the stitched map is still in prep.",
    }


def _design_tools() -> list[dict[str, object]]:
    return [
        {"tool_id": "road_draft", "label": "Road Drafting", "status": "planned", "notes": "Street geometry will be drafted after sheet stitching is stable."},
        {"tool_id": "rail_draft", "label": "Rail Drafting", "status": "planned", "notes": "Rail corridors and crossings stay separate from the base scan."},
        {"tool_id": "surface_style", "label": "Grass / Dirt / Road Graphics", "status": "planned", "notes": "Terrain graphics should stay layered under the map review work."},
        {"tool_id": "building_handoff", "label": "Building Handoff", "status": "planned", "notes": "Buildings are reviewed downstream once the map layer is trustworthy."},
        {"tool_id": "people_handoff", "label": "People Handoff", "status": "planned", "notes": "People auditor should use the same source-trail rule as buildings."},
    ]


def _layer_stack(map_packet: dict[str, object] | None) -> list[dict[str, object]]:
    if map_packet is None:
        return []

    return [
        {
            "layer_id": map_packet["base_map_layer"]["layer_id"],
            "label": "Base Map",
            "status": map_packet["base_map_layer"]["stitching_status"],
            "notes": "Historical scan and sheet identity anchor the workspace.",
        },
        {
            "layer_id": map_packet["road_rail_layer"]["layer_id"],
            "label": "Road / Rail",
            "status": map_packet["road_rail_layer"]["status"],
            "notes": "Roads and rail drafting are planned but not yet extracted.",
        },
        {
            "layer_id": map_packet["building_footprint_layer"]["layer_id"],
            "label": "Building Footprints",
            "status": map_packet["building_footprint_layer"]["status"],
            "notes": "Footprints remain deferred until extraction is implemented.",
        },
        {
            "layer_id": map_packet["building_art_layer"]["layer_id"],
            "label": "Building Art",
            "status": map_packet["building_art_layer"]["status"],
            "notes": "Transparent-background art can be reviewed only against reviewed anchors.",
        },
        {
            "layer_id": map_packet["label_layer"]["layer_id"],
            "label": "Labels",
            "status": map_packet["label_layer"]["status"],
            "notes": "Map labels stay tied to reviewed locations.",
        },
        {
            "layer_id": map_packet["quest_marker_layer"]["layer_id"],
            "label": "Quest Markers",
            "status": map_packet["quest_marker_layer"]["status"],
            "notes": "Mission markers are runtime overlays, not historical evidence.",
        },
        {
            "layer_id": map_packet["evidence_provenance_layer"]["layer_id"],
            "label": "Evidence / Provenance",
            "status": map_packet["evidence_provenance_layer"]["status"],
            "notes": "Claims, citations, and review status stay visible to reviewers.",
        },
    ]


def _building_workspace(selected_building: dict[str, object] | None) -> dict[str, object]:
    if selected_building is None:
        return {
            "footprint_status": "unavailable",
            "review_state": "blocked",
            "notes": "No building record is available yet.",
        }

    return {
        "building_id": selected_building["building_id"],
        "location_id": selected_building["location_id"],
        "review_record_id": selected_building["review_record_id"],
        "reviewed_label": selected_building["reviewed_label"],
        "identity_status": selected_building["identity_status"],
        "visual_detail_status": selected_building["visual_detail_status"],
        "anchor_status": selected_building["anchor_status"],
        "existence_status": selected_building["existence_status"],
        "default_render_mode": selected_building["default_render_mode"],
        "historical_function": selected_building["historical_function"],
        "footprint_status": "deferred",
        "geometry_basis": "reviewed_location_anchor" if selected_building["identity_status"] == "reviewed" else "placeholder_location_seed",
        "notes": selected_building["notes"],
    }


def _art_preview(selected_building: dict[str, object] | None, map_packet: dict[str, object] | None) -> dict[str, object]:
    if selected_building is None or map_packet is None:
        return {
            "preview_status": "unavailable",
            "layers": [],
            "notes": "No reviewed building is available for art preview.",
        }

    building_art_layer = map_packet["building_art_layer"]
    reviewed_records = list(building_art_layer["records"])
    fallback_records = list(building_art_layer["fallback_records"])

    layer_status = "illustrative"
    if selected_building["visual_detail_status"] == "verified":
        layer_status = "verified"
    elif selected_building["visual_detail_status"] == "inferred":
        layer_status = "inferred"

    return {
        "preview_status": layer_status,
        "transparent_background": True,
        "building_art_id": reviewed_records[0]["building_art_id"] if reviewed_records else (fallback_records[0]["building_art_id"] if fallback_records else ""),
        "layers": [
            {
                "layer_id": "roof",
                "label": "Roof",
                "status": layer_status,
                "notes": "Roof massing is only shown at the level supported by the reviewed label.",
            },
            {
                "layer_id": "walls",
                "label": "Walls",
                "status": layer_status,
                "notes": "Wall massing stays generic until stronger evidence exists.",
            },
            {
                "layer_id": "signage",
                "label": "Signage",
                "status": "verified" if selected_building["reviewed_label"] else "illustrative",
                "notes": "Sign text may be verified from the reviewed label; shape remains stylized.",
            },
            {
                "layer_id": "doors_windows",
                "label": "Doors / Windows",
                "status": "illustrative",
                "notes": "Openings are a visual approximation until better evidence exists.",
            },
            {
                "layer_id": "chimney",
                "label": "Chimney",
                "status": "illustrative",
                "notes": "Chimney placement remains illustrative in this mockup.",
            },
            {
                "layer_id": "shadow",
                "label": "Shadow",
                "status": "illustrative",
                "notes": "Soft shadow helps stacking but is not a historical claim.",
            },
            {
                "layer_id": "environment",
                "label": "Environment",
                "status": "illustrative",
                "notes": "Background environment is a neutral staging layer only.",
            },
        ],
        "notes": "Transparent-background art will stack into the footprint once asset generation is wired.",
    }


def _interior_notes(selected_building: dict[str, object] | None) -> dict[str, object]:
    if selected_building is None:
        return {
            "historical_basis": "source_based_inference",
            "text": "Interior use remains under review.",
        }

    function_text = str(selected_building.get("historical_function", "")).lower()
    label_text = str(selected_building.get("reviewed_label", "")).lower()
    if "livery" in function_text or "wagon yard" in function_text or "livery" in label_text:
        return {
            "historical_basis": "source_based_inference",
            "text": "Likely stalls, tack, feed, wagons, and a small office based on the wagon yard and livery label.",
        }
    if "mill" in function_text or "mill" in label_text or "oil" in function_text:
        return {
            "historical_basis": "source_based_inference",
            "text": "Likely machinery space, storage, loading areas, and labor circulation based on the mill label.",
        }
    return {
        "historical_basis": "source_based_inference",
        "text": "Likely interior use is still under review and should remain generic until stronger evidence exists.",
    }


def _provenance_trail(community_review: dict[str, object] | None) -> dict[str, object]:
    if community_review is None:
        return {
            "source_issue": None,
            "notes": "No source issue record available.",
        }

    source_issues = list(community_review["source_issues"])
    source_issue = source_issues[0] if source_issues else None
    return {
        "source_issue": source_issue,
        "notes": "Every person and business record must stay linked to a visible issue/page trail.",
    }


def _review_legend(
    building_manifest: BuildingManifest | None,
    community_review: dict[str, object] | None,
) -> list[dict[str, object]]:
    verified_count = 0
    inferred_count = 0
    illustrative_count = 0
    unknown_count = 0

    if building_manifest is not None:
        for building in building_manifest.buildings:
            if building.identity_status == "reviewed":
                verified_count += 1
            if building.visual_detail_status == "inferred":
                inferred_count += 1
            if building.visual_detail_status == "illustrative":
                illustrative_count += 1
            if building.identity_status == "unknown":
                unknown_count += 1

    rejected_count = 0
    if community_review is not None:
        for record in list(community_review["people"]) + list(community_review["businesses"]):
            if record["review_status"] == "rejected":
                rejected_count += 1

    return [
        {"label": "Verified Fact", "status": "verified", "count": verified_count, "notes": "Directly supported by primary source review."},
        {"label": "Source-Based Inference", "status": "inferred", "count": inferred_count, "notes": "Reasonable historical interpretation, not direct proof."},
        {"label": "Illustrative / Generic", "status": "illustrative", "count": illustrative_count, "notes": "Useful visual fallback, not a verified identity."},
        {"label": "Unknown / Unverified", "status": "unknown", "count": unknown_count, "notes": "The evidence is not strong enough yet."},
        {"label": "Rejected", "status": "rejected", "count": rejected_count, "notes": "Reviewed and determined incorrect or insufficient."},
    ]


def _review_history(
    sheet_review_manifest: SanbornSheetReviewManifest | None,
    building_manifest: BuildingManifest | None,
    suggestion_manifest: VerificationSuggestionManifest | None,
    community_review: dict[str, object] | None,
    teacher_review: dict[str, object] | None,
    review_events: list[dict[str, object]] | None = None,
) -> list[dict[str, object]]:
    history = []
    if sheet_review_manifest is not None:
        history.append(
            {
                "event_id": "sheet-review-loaded",
                "label": "Sanborn sheet review loaded",
                "status": sheet_review_manifest.review_count,
                "notes": sheet_review_manifest.review_scope,
            }
        )
    if building_manifest is not None:
        history.append(
            {
                "event_id": "building-manifest-loaded",
                "label": "Building anchors loaded",
                "status": building_manifest.building_identity_status,
                "notes": building_manifest.review_scope,
            }
        )
    if suggestion_manifest is not None:
        history.append(
            {
                "event_id": "candidate-queue-loaded",
                "label": "Candidate matches queued",
                "status": suggestion_manifest.review_queue_status,
                "notes": suggestion_manifest.promotion_rule,
            }
        )
    if community_review is not None:
        history.append(
            {
                "event_id": "community-review-loaded",
                "label": "People and businesses loaded",
                "status": community_review["review_queue_status"],
                "notes": community_review["promotion_rule"],
            }
        )
    if teacher_review is not None:
        history.append(
            {
                "event_id": "teacher-release",
                "label": "Teacher release gate",
                "status": "ready" if teacher_review.get("classroom_release_ready") else "blocked",
                "notes": teacher_review.get("teacher_authority_rule", ""),
            }
        )
    if review_events:
        history.extend(history_items_from_events(review_events))
    return history


def _unresolved_summary(
    building_manifest: BuildingManifest | None,
    suggestion_manifest: VerificationSuggestionManifest | None,
    community_review: dict[str, object] | None,
) -> list[dict[str, object]]:
    unknown_buildings = 0
    generic_art = 0
    if building_manifest is not None:
        for building in building_manifest.buildings:
            if building.identity_status == "unknown":
                unknown_buildings += 1
            if building.default_render_mode == "generic_art_allowed":
                generic_art += 1

    under_review_people = 0
    if community_review is not None:
        under_review_people = sum(
            1 for record in list(community_review["people"]) + list(community_review["businesses"]) if record["review_status"] == "under_review"
        )

    candidate_count = suggestion_manifest.candidate_count if suggestion_manifest is not None else 0
    rejected_count = 0
    if community_review is not None:
        rejected_count = sum(
            1 for record in list(community_review["people"]) + list(community_review["businesses"]) if record["review_status"] == "rejected"
        )

    return [
        {"label": "Buildings needing more evidence", "count": unknown_buildings},
        {"label": "Buildings using generic art", "count": generic_art},
        {"label": "People or businesses under review", "count": under_review_people},
        {"label": "Candidate matches awaiting promotion", "count": candidate_count},
        {"label": "Rejected records", "count": rejected_count},
    ]


def _quick_actions() -> list[dict[str, object]]:
    return [
        {"action_id": "run_coverage", "label": "Run Coverage Analysis", "kind": "secondary"},
        {"action_id": "export_report", "label": "Export Review Report", "kind": "secondary"},
        {"action_id": "open_buildings", "label": "Open Building Auditor", "kind": "primary", "href": "#building-auditor"},
        {"action_id": "open_people", "label": "Open People Auditor", "kind": "primary", "href": "#people-auditor"},
        {"action_id": "return_community", "label": "Return to Community", "kind": "primary", "href": "#community-dashboard"},
    ]
