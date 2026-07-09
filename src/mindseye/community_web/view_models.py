from __future__ import annotations

import html
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from ..building_data import load_building_manifest
from ..community_dashboard import build_community_dashboard_packet
from ..community_review import build_community_review_packet
from ..map_auditor import build_map_auditor_packet
from ..models import MindseyeDataError, SourceRecord, TownPackage
from ..people_auditor import build_people_auditor_packet
from ..town_loader import load_town_package, repo_root_from
from ..web_view import render_town_package_page
from .routes import COMMUNITY_NAV_ROUTE_IDS, COMMUNITY_PRODUCT_ROUTE_IDS, CommunityRoute, route_by_id
from .template_engine import TemplateEngine


@dataclass(frozen=True)
class SharedBundle:
    package: TownPackage
    community_packet: dict[str, Any]
    map_packet: dict[str, Any]
    people_packet: dict[str, Any]
    building_manifest: Any | None
    community_review: dict[str, Any]
    debug_html: str
    selected_source: SourceRecord | None
    selected_building: dict[str, Any] | None
    selected_person: dict[str, Any] | None
    selected_business: dict[str, Any] | None
    selected_issue: dict[str, Any] | None
    map_year: int

    @property
    def source_count(self) -> int:
        return len(self.package.sources)

    @property
    def sheet_count(self) -> int:
        return len(self.map_packet.get("sheet_selector", [])) if self.map_packet else 0

    @property
    def building_count(self) -> int:
        return getattr(self.building_manifest, "record_count", 0) if self.building_manifest is not None else 0

    @property
    def people_count(self) -> int:
        return len(self.people_packet.get("people_review", [])) if self.people_packet else 0

    @property
    def business_count(self) -> int:
        return len(self.people_packet.get("businesses_review", [])) if self.people_packet else 0

    @property
    def release_state(self) -> str:
        release_gate = self.community_packet.get("release_gate", {}) if self.community_packet else {}
        if isinstance(release_gate, dict):
            return str(release_gate.get("state", DEMO_VALUES["release_state"]))
        return DEMO_VALUES["release_state"]

    @property
    def release_reason(self) -> str:
        release_gate = self.community_packet.get("release_gate", {}) if self.community_packet else {}
        if isinstance(release_gate, dict):
            return str(release_gate.get("reason", DEMO_VALUES["release_reason"]))
        return DEMO_VALUES["release_reason"]


DEMO_VALUES: dict[str, Any] = {
    "release_state": "guarded",
    "release_reason": "Community review remains upstream of classroom release.",
    "fallback_note": "No live packet data was available; showing demo placeholders.",
    "map_canvas_hint": "Stitched map workspace will appear here once the sheet and georeference contracts are present.",
    "building_canvas_hint": "Building footprints and art stay separate from the base map until a reviewed anchor exists.",
    "people_canvas_hint": "People and businesses remain linked to source issues until a human promotion occurs.",
    "source_canvas_hint": "Source metadata, OCR, rights, and linked records stay visible together.",
}


def build_community_page_model(
    route_id: str,
    repo_root: Path | None = None,
    town_slug: str = "texarkana",
    state_root: Path | None = None,
    engine: TemplateEngine | None = None,
) -> dict[str, Any]:
    root = repo_root_from(repo_root)
    template_engine = engine or TemplateEngine(root / "src" / "mindseye" / "community_web" / "templates")
    bundle = _build_shared_bundle(root, town_slug, state_root)
    route = route_by_id(route_id)

    base_context = _build_base_context(bundle, route, template_engine)
    route_context = _build_route_context(bundle, route, template_engine)

    base_context.update(route_context)
    base_context.update(
        {
            "route_id": route.route_id,
            "route_path": route.path,
            "route_title": route.title,
            "route_subtitle": route.subtitle,
            "route_summary": route.summary,
            "page_title": f"{route.title} - {bundle.package.town_name} - The Mind's Eye",
            "page_class": f"page-shell page-shell--{route.route_id}",
            "body_class": f"community-web community-web--{route.route_id}",
            "route_css_link_html": _route_css_link(route),
            "route_js_link_html": _route_js_link(route),
            "topbar_links_html": _topbar_links_html(route.route_id),
            "status_chips_html": _status_chips_html(base_context["status_chips"]),
            "route_cards_html": _route_cards_html(template_engine, base_context["route_cards"]),
            "review_legend_html": _legend_html(base_context["review_legend"]),
            "release_gate_card_html": _release_gate_card_html(template_engine, base_context["release_gate"]),
            "evidence_inspector_html": _evidence_inspector_html(template_engine, base_context["evidence_inspector"]),
            "map_controls_html": _map_controls_html(template_engine, base_context["map_controls"]),
            "debug_html_srcdoc": html.escape(bundle.debug_html, quote=True),
            "fallback_note": DEMO_VALUES["fallback_note"],
            "footer_note": "Route-based community shell. Legacy debug stays under /debug.",
        }
    )
    return base_context


def _build_shared_bundle(root: Path, town_slug: str, state_root: Path | None) -> SharedBundle:
    package = load_town_package(root, town_slug)
    community_packet = _safe(
        lambda: build_community_dashboard_packet(package, repo_root=root, town_slug=town_slug, state_root=state_root),
        {},
    )
    map_packet = _safe(lambda: build_map_auditor_packet(package, repo_root=root, town_slug=town_slug, state_root=state_root), {})
    people_packet = _safe(lambda: build_people_auditor_packet(package, repo_root=root, town_slug=town_slug, state_root=state_root), {})
    building_manifest = _safe(lambda: load_building_manifest(root, town_slug, state_root=state_root), None)
    community_review = _safe(
        lambda: build_community_review_packet(package, repo_root=root, town_slug=town_slug, state_root=state_root),
        {},
    )
    debug_html = render_town_package_page(package, town_slug=town_slug, state_root=state_root)

    selected_source = package.sources[0] if package.sources else None
    selected_building = _selected_building(map_packet, building_manifest)
    selected_person = people_packet.get("selected_person") if isinstance(people_packet, dict) else None
    selected_business = people_packet.get("selected_business") if isinstance(people_packet, dict) else None
    selected_issue = people_packet.get("selected_issue") if isinstance(people_packet, dict) else None

    map_year = _package_map_year(package)
    return SharedBundle(
        package=package,
        community_packet=community_packet if isinstance(community_packet, dict) else {},
        map_packet=map_packet if isinstance(map_packet, dict) else {},
        people_packet=people_packet if isinstance(people_packet, dict) else {},
        building_manifest=building_manifest,
        community_review=community_review if isinstance(community_review, dict) else {},
        debug_html=debug_html,
        selected_source=selected_source,
        selected_building=selected_building,
        selected_person=selected_person if isinstance(selected_person, dict) else None,
        selected_business=selected_business if isinstance(selected_business, dict) else None,
        selected_issue=selected_issue if isinstance(selected_issue, dict) else None,
        map_year=map_year,
    )


def _build_base_context(bundle: SharedBundle, route: CommunityRoute, engine: TemplateEngine) -> dict[str, Any]:
    status_chips = _status_chips(bundle)
    route_cards = _route_cards(bundle, route)
    review_legend = _review_legend(bundle)
    evidence_inspector = _evidence_inspector(bundle)
    map_controls = _map_controls(bundle)
    release_gate = bundle.community_packet.get("release_gate", {}) if isinstance(bundle.community_packet, dict) else {}
    return {
        "town_name": bundle.package.town_name,
        "state_region": bundle.package.state_region,
        "package_id": bundle.package.package_id,
        "map_year": bundle.map_year,
        "year_gate": bundle.community_packet.get("year_gate", _year_gate(bundle.map_year)),
        "status_chips": status_chips,
        "route_cards": route_cards,
        "review_legend": review_legend,
        "release_gate": release_gate if isinstance(release_gate, dict) else _fallback_release_gate(),
        "evidence_inspector": evidence_inspector,
        "map_controls": map_controls,
        "community_packet": bundle.community_packet,
        "map_packet": bundle.map_packet,
        "people_packet": bundle.people_packet,
        "building_manifest": bundle.building_manifest,
        "community_review": bundle.community_review,
        "selected_source": bundle.selected_source,
        "selected_building": bundle.selected_building,
        "selected_person": bundle.selected_person,
        "selected_business": bundle.selected_business,
        "selected_issue": bundle.selected_issue,
        "source_count": len(bundle.package.sources),
        "sheet_count": len(bundle.map_packet.get("sheet_selector", [])) if bundle.map_packet else 0,
        "building_count": getattr(bundle.building_manifest, "record_count", 0) if bundle.building_manifest is not None else 0,
        "people_count": len(bundle.people_packet.get("people_review", [])) if bundle.people_packet else 0,
        "business_count": len(bundle.people_packet.get("businesses_review", [])) if bundle.people_packet else 0,
        "release_state": release_gate.get("state", DEMO_VALUES["release_state"]) if isinstance(release_gate, dict) else DEMO_VALUES["release_state"],
        "release_reason": release_gate.get("reason", DEMO_VALUES["release_reason"]) if isinstance(release_gate, dict) else DEMO_VALUES["release_reason"],
        "progress_percent": _overall_progress(bundle),
        "route_nav_html": _route_nav_html(route.route_id),
        "source_summary_html": _source_summary_html(bundle),
        "scope_ladder_html": _scope_ladder_html(bundle),
        "unresolved_summary_html": _unresolved_summary_html(bundle),
        "review_history_html": _review_history_html(bundle),
        "release_blocker_html": _release_blocker_html(bundle),
        "release_matrix_html": _release_matrix_html(bundle),
        "linked_records_html": _linked_records_html(bundle),
        "source_rights_html": _source_rights_html(bundle),
        "source_issue_browser_html": _source_issue_browser_html(bundle),
        "people_review_html": _people_review_html(bundle),
        "business_review_html": _business_review_html(bundle),
        "stitch_workspace_html": _stitch_workspace_html(bundle),
        "sheet_browser_html": _sheet_browser_html(bundle),
        "layer_stack_html": _layer_stack_html(bundle),
        "building_workspace_html": _building_workspace_html(bundle),
        "art_preview_html": _art_preview_html(bundle),
        "control_point_html": _control_point_html(bundle),
        "georeference_html": _georeference_html(bundle),
        "composite_manifest_html": _composite_manifest_html(bundle),
        "provenance_trail_html": _provenance_trail_html(bundle),
        "debug_html_srcdoc": html.escape(bundle.debug_html, quote=True),
    }


def _build_route_context(bundle: SharedBundle, route: CommunityRoute, engine: TemplateEngine) -> dict[str, Any]:
    if route.route_id == "community":
        return _community_context(bundle)
    if route.route_id == "map-auditor":
        return _map_context(bundle)
    if route.route_id == "building-auditor":
        return _building_context(bundle)
    if route.route_id == "people-auditor":
        return _people_context(bundle)
    if route.route_id == "source-provenance-inspector":
        return _source_context(bundle)
    if route.route_id == "release-gate":
        return _release_context(bundle)
    if route.route_id == "debug":
        return _debug_context(bundle)
    raise KeyError(route.route_id)


def _community_context(bundle: SharedBundle) -> dict[str, Any]:
    return {
        "hero_html": _hero_html(
            "Community Dashboard",
            "Community Verification Console",
            [
                ("Town", bundle.package.town_name),
                ("Package", bundle.package.package_id),
                ("State", bundle.package.state_region),
                ("Map year", str(bundle.map_year)),
            ],
            bundle,
        ),
        "left_html": "".join(
            [
                _panel_html("Primary Routes", "Jump into the specialized auditors.", _route_cards_html_no_engine(bundle)),
                _panel_html("Scope Ladder", "Community stays upstream of county and state roll-ups.", bundle.community_packet.get("scope_ladder_html", _scope_ladder_html(bundle))),
            ]
        ),
        "right_html": "".join(
            [
                _panel_html("Review Status Overview", "Town progress and current counts stay visible.", _review_status_overview_html(bundle)),
                _panel_html("Release Gate", "Explain what still blocks release.", _release_gate_card_html_no_engine(bundle)),
                _panel_html("Evidence Inspector", "Selected evidence remains visible.", bundle.community_packet.get("evidence_inspector_html", _evidence_inspector_html_no_engine(bundle))),
                _panel_html("Unresolved Summary", "Items still needing attention.", bundle.community_packet.get("unresolved_summary_html", _unresolved_summary_html(bundle))),
            ]
        ),
        "bottom_html": "".join(
            [
                _panel_html("Review History", "The community audit trail stays visible.", bundle.community_packet.get("review_history_html", _review_history_html(bundle))),
                _panel_html("Diagnostics", "The dashboard is a review console, not a game shell.", _kv_html([
                    ("Sources", str(bundle.community_packet.get("source_count", len(bundle.package.sources)))),
                    ("Sheets", str(bundle.community_packet.get("sheet_count", bundle.sheet_count))),
                    ("Buildings", str(bundle.building_count)),
                    ("People", str(bundle.people_count)),
                    ("Businesses", str(bundle.business_count)),
                    ("Release state", bundle.release_state),
                ])),
            ]
        ),
    }


def _map_context(bundle: SharedBundle) -> dict[str, Any]:
    workspace = bundle.map_packet.get("stitch_workspace", {})
    selected_sheet = bundle.map_packet.get("selected_sheet", {})
    return {
        "hero_html": _hero_html(
            "Map Auditor",
            "Sanborn stitching and georeferencing workspace",
            [
                ("Town", bundle.package.town_name),
                ("Map year", str(bundle.map_year)),
                ("Sheets", str(bundle.sheet_count)),
                ("Stitching", str(workspace.get("stitching_status", "unavailable"))),
            ],
            bundle,
        ),
        "left_html": "".join(
            [
                _panel_html("Sheet Browser", "Review the stitched sheet queue.", bundle.map_packet.get("sheet_browser_html", _sheet_browser_html(bundle))),
                _panel_html("Coverage Grid", "Coverage remains tied to sheet review.", _coverage_grid_html(bundle.map_packet)),
            ]
        ),
        "center_html": "".join(
            [
                _panel_html("Stitched Map Workspace", "The map workspace is a layered review surface.", bundle.map_packet.get("stitch_workspace_html", _stitch_workspace_html(bundle))),
                _panel_html("Map Controls", "Controls remain visible even when the canvas is a placeholder.", _map_controls_body(bundle)),
            ]
        ),
        "right_html": "".join(
            [
                _panel_html("Layer Stack", "Layer separation stays explicit.", bundle.map_packet.get("layer_stack_html", _layer_stack_html(bundle))),
                _panel_html("Control Points", "Local alignment first; final georeferencing later.", bundle.map_packet.get("control_point_html", _control_point_html(bundle))),
                _panel_html("Georeference Workspace", "A local coordinate system is a prep step only.", bundle.map_packet.get("georeference_html", _georeference_html(bundle))),
                _panel_html("Composite Manifest", "Prep-only composite status.", bundle.map_packet.get("composite_manifest_html", _composite_manifest_html(bundle))),
            ]
        ),
        "bottom_html": "".join(
            [
                _panel_html("Provenance Trail", "Sheet, control-point, and source trace remain separate.", bundle.map_packet.get("provenance_trail_html", _provenance_trail_html(bundle))),
                _panel_html("Review History", "Review events stay readable for humans.", bundle.map_packet.get("review_history_html", _review_history_html(bundle))),
            ]
        ),
    }


def _building_context(bundle: SharedBundle) -> dict[str, Any]:
    building = bundle.selected_building or {}
    return {
        "hero_html": _hero_html(
            "Building Auditor",
            "Footprint, identity, and art review",
            [
                ("Building", building.get("reviewed_label") or building.get("student_safe_name") or DEMO_VALUES["building_canvas_hint"]),
                ("Identity", str(building.get("identity_status", "unknown"))),
                ("Visual detail", str(building.get("visual_detail_status", "illustrative"))),
                ("Anchor", str(building.get("anchor_status", "unknown"))),
            ],
            bundle,
        ),
        "left_html": "".join(
            [
                _panel_html("Extracted Text Review", "Approve the words before the image starts to speak.", _kv_html([
                    ("Building ID", building.get("building_id", "")),
                    ("Location", building.get("location_id", "")),
                    ("Review record", building.get("review_record_id", "")),
                    ("Reviewed label", building.get("reviewed_label", "")),
                    ("Student-safe name", building.get("student_safe_name", "")),
                    ("Source IDs", ", ".join(building.get("source_ids", [])) if isinstance(building.get("source_ids"), list) else ""),
                    ("Claim IDs", ", ".join(building.get("supporting_claim_ids", [])) if isinstance(building.get("supporting_claim_ids"), list) else ""),
                    ("Suggestion IDs", ", ".join(building.get("suggestion_ids", [])) if isinstance(building.get("suggestion_ids"), list) else ""),
                ])),
                _panel_html("Interior / Use Notes", "Likely interior use stays inferential unless the source is stronger.", _text_block(building.get("notes") or DEMO_VALUES["building_canvas_hint"])),
            ]
        ),
        "center_html": "".join(
            [
                _panel_html("Footprint Review", "Footprint data stays separate from the art layer.", bundle.map_packet.get("building_workspace_html", _building_workspace_html(bundle))),
                _panel_html("Art Preview", "Transparent-background art must fit the footprint.", bundle.map_packet.get("art_preview_html", _art_preview_html(bundle))),
            ]
        ),
        "right_html": "".join(
            [
                _panel_html("Source / Provenance Trail", "The building stays tied to evidence.", bundle.map_packet.get("provenance_trail_html", _provenance_trail_html(bundle))),
                _panel_html("Evidence Inspector", "Verified, inferred, and illustrative remain distinct.", bundle.community_packet.get("evidence_inspector_html", _evidence_inspector_html_no_engine(bundle))),
                _panel_html("Review Legend", "Historical certainty labels stay visible.", _legend_html(bundle.community_packet.get("review_legend", _review_legend(bundle)))),
            ]
        ),
        "bottom_html": "".join(
            [
                _panel_html("Review History", "Changes stay recorded for human review.", bundle.map_packet.get("review_history_html", _review_history_html(bundle))),
                _panel_html("Unresolved Summary", "Unknowns stay visible instead of being hidden.", bundle.map_packet.get("unresolved_summary_html", _unresolved_summary_html(bundle))),
            ]
        ),
    }


def _people_context(bundle: SharedBundle) -> dict[str, Any]:
    issue = bundle.selected_issue or {}
    return {
        "hero_html": _hero_html(
            "People Auditor",
            "Person and business identity review",
            [
                ("Issue", issue.get("source_issue_id", DEMO_VALUES["source_canvas_hint"])),
                ("People", str(bundle.people_count)),
                ("Businesses", str(bundle.business_count)),
                ("Review queue", str(bundle.people_packet.get("review_queue_status", "unavailable"))),
            ],
            bundle,
        ),
        "left_html": _panel_html("Source Issue Browser", "Keep the issue trail visible.", bundle.people_packet.get("source_issue_browser_html", _source_issue_browser_html(bundle))),
        "center_html": _panel_html("Person Review Workspace", "Person identity remains separate from business identity.", bundle.people_packet.get("people_review_html", _people_review_html(bundle))),
        "right_html": "".join(
            [
                _panel_html("Business Review Workspace", "Business records stay separate and source-backed.", bundle.people_packet.get("business_review_html", _business_review_html(bundle))),
                _panel_html("Evidence Inspector", "Identity evidence remains visible.", bundle.community_packet.get("evidence_inspector_html", _evidence_inspector_html_no_engine(bundle))),
            ]
        ),
        "bottom_html": "".join(
            [
                _panel_html("Review Legend", "Historical certainty and workflow states stay distinct.", _legend_html(bundle.people_packet.get("review_legend", _review_legend(bundle)))),
                _panel_html("Review History", "People and businesses keep their own audit trail.", bundle.people_packet.get("review_history_html", _review_history_html(bundle))),
                _panel_html("Unresolved Summary", "Unresolved items stay on the rail.", bundle.people_packet.get("unresolved_summary_html", _unresolved_summary_html(bundle))),
            ]
        ),
    }


def _source_context(bundle: SharedBundle) -> dict[str, Any]:
    source = bundle.selected_source or _fallback_source()
    return {
        "hero_html": _hero_html(
            "Source / Provenance Inspector",
            "Evidence drill-down and citation hub",
            [
                ("Source", source.source_id if isinstance(source, SourceRecord) else source.get("source_id", "")),
                ("Repository", source.repository if isinstance(source, SourceRecord) else source.get("repository", "")),
                ("Rights", source.rights_status if isinstance(source, SourceRecord) else source.get("rights_status", "")),
                ("Access", source.access_level if isinstance(source, SourceRecord) else source.get("access_level", "")),
            ],
            bundle,
        ),
        "left_html": _panel_html("Source Metadata", "Raw source fields remain visible.", _kv_html(_source_rows(source))),
        "center_html": "".join(
            [
                _panel_html("Issue / OCR / Page", "OCR text is an aid, not the canon.", _source_issue_html(bundle.selected_issue or {})),
                _panel_html("Linked Records", "People, businesses, buildings, and claims remain traceable.", bundle.community_packet.get("linked_records_html", _linked_records_html(bundle))),
            ]
        ),
        "right_html": "".join(
            [
                _panel_html("Citation and Rights", "Every record keeps its source trail.", bundle.community_packet.get("source_rights_html", _source_rights_html(bundle))),
                _panel_html("Provenance Trail", "Preserve the path from raw record to review decision.", bundle.map_packet.get("provenance_trail_html", _provenance_trail_html(bundle))),
            ]
        ),
        "bottom_html": "".join(
            [
                _panel_html("Evidence Inspector", "Selected evidence remains explainable.", bundle.community_packet.get("evidence_inspector_html", _evidence_inspector_html_no_engine(bundle))),
                _panel_html("Review History", "Source and review events stay visible.", bundle.community_packet.get("review_history_html", _review_history_html(bundle))),
            ]
        ),
    }


def _release_context(bundle: SharedBundle) -> dict[str, Any]:
    blockers = bundle.community_packet.get("release_gate", {}).get("blockers", []) if isinstance(bundle.community_packet.get("release_gate", {}), dict) else []
    return {
        "hero_html": _hero_html(
            "Release Gate Report",
            "Community handoff decision",
            [
                ("State", bundle.release_state),
                ("Reason", bundle.release_reason),
                ("Blockers", str(len(blockers))),
                ("Package", bundle.package.package_id),
            ],
            bundle,
        ),
        "left_html": _panel_html("Blockers", "Release stays blocked until the evidence gate clears.", bundle.community_packet.get("release_blocker_html", _release_blocker_html(bundle))),
        "right_html": "".join(
            [
                _panel_html("Readiness Matrix", "Criteria remain explicit.", bundle.community_packet.get("release_matrix_html", _release_matrix_html(bundle))),
                _panel_html("Source / Rights Warnings", "Rights and access notes remain visible.", bundle.community_packet.get("source_rights_html", _source_rights_html(bundle))),
            ]
        ),
        "bottom_html": "".join(
            [
                _panel_html("Review History", "The release decision should be explainable.", bundle.community_packet.get("review_history_html", _review_history_html(bundle))),
                _panel_html("Unresolved Summary", "The release gate is not a blind yes/no.", bundle.community_packet.get("unresolved_summary_html", _unresolved_summary_html(bundle))),
            ]
        ),
    }


def _debug_context(bundle: SharedBundle) -> dict[str, Any]:
    return {
        "notice_html": _panel_html(
            "Debug Surface",
            "The old read-only composite page stays available for internal inspection only.",
            _text_block("This route wraps the legacy diagnostic view instead of replacing the route-based community shell."),
            footer_html="Do not treat this surface as the product UI.",
            dark=True,
        ),
        "debug_html_srcdoc": html.escape(bundle.debug_html, quote=True),
    }


def _status_chips(bundle: SharedBundle) -> list[dict[str, Any]]:
    release_gate = bundle.community_packet.get("release_gate", {}) if isinstance(bundle.community_packet, dict) else {}
    map_status = bundle.map_packet.get("stitch_workspace", {}).get("stitching_status", "unavailable") if bundle.map_packet else "unavailable"
    control_status = bundle.map_packet.get("stitch_workspace", {}).get("control_point_status", "unavailable") if bundle.map_packet else "unavailable"
    build_total = getattr(bundle.building_manifest, "record_count", 0) if bundle.building_manifest is not None else 0
    reviewed = 0
    if bundle.building_manifest is not None:
        reviewed = sum(1 for building in bundle.building_manifest.buildings if building.identity_status in {"reviewed", "approved"})
    return [
        {"label": "Sources", "value": str(len(bundle.package.sources)), "state": "ready" if bundle.package.sources else "blocked"},
        {"label": "Sheets", "value": str(len(bundle.map_packet.get("sheet_selector", [])) if bundle.map_packet else 0), "state": "reviewing" if bundle.map_packet else "blocked"},
        {"label": "Buildings", "value": f"{reviewed}/{build_total}" if build_total else "0/0", "state": "partial" if build_total else "blocked"},
        {"label": "People", "value": str(len(bundle.people_packet.get("people_review", [])) if bundle.people_packet else 0), "state": "reviewing"},
        {"label": "Businesses", "value": str(len(bundle.people_packet.get("businesses_review", [])) if bundle.people_packet else 0), "state": "reviewing"},
        {"label": "Stitching", "value": str(map_status), "state": str(map_status)},
        {"label": "Control points", "value": str(control_status), "state": str(control_status)},
        {"label": "Release gate", "value": str(release_gate.get("state", DEMO_VALUES["release_state"])) if isinstance(release_gate, dict) else DEMO_VALUES["release_state"], "state": str(release_gate.get("state", DEMO_VALUES["release_state"])) if isinstance(release_gate, dict) else DEMO_VALUES["release_state"]},
    ]


def _route_cards(bundle: SharedBundle, active_route: CommunityRoute) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for route_id in COMMUNITY_PRODUCT_ROUTE_IDS:
        route = route_by_id(route_id)
        stat_label, stat_value, state = _route_card_stat(bundle, route_id)
        cards.append(
            {
                "route_id": route.route_id,
                "href": route.path,
                "title": route.title,
                "subtitle": route.subtitle,
                "summary": route.summary,
                "stat_label": stat_label,
                "stat_value": stat_value,
                "state": state,
                "active": route.route_id == active_route.route_id,
                "route_card_class": "is-active" if route.route_id == active_route.route_id else "",
            }
        )
    return cards


def _route_card_stat(bundle: SharedBundle, route_id: str) -> tuple[str, str, str]:
    if route_id == "community":
        progress = _overall_progress(bundle)
        return ("Progress", f"{progress}%", "ready" if progress >= 80 else "reviewing")
    if route_id == "map-auditor":
        status = bundle.map_packet.get("stitch_workspace", {}).get("stitching_status", "unavailable") if bundle.map_packet else "unavailable"
        return ("Stitching", str(status), str(status))
    if route_id == "building-auditor":
        build_total = getattr(bundle.building_manifest, "record_count", 0) if bundle.building_manifest is not None else 0
        reviewed = 0
        if bundle.building_manifest is not None:
            reviewed = sum(1 for building in bundle.building_manifest.buildings if building.identity_status in {"reviewed", "approved"})
        return ("Reviewed", f"{reviewed}/{build_total}" if build_total else "0/0", "partial" if build_total else "blocked")
    if route_id == "people-auditor":
        return ("Queue", str(bundle.people_packet.get("review_queue_status", "unavailable")), str(bundle.people_packet.get("review_queue_status", "unavailable")))
    if route_id == "source-provenance-inspector":
        source = bundle.selected_source or _fallback_source()
        return ("Source", source.source_id if isinstance(source, SourceRecord) else source.get("source_id", ""), "guarded")
    if route_id == "release-gate":
        return ("State", bundle.release_state, bundle.release_state)
    return ("Status", "unknown", "unknown")


def _route_nav_html(route_id: str) -> str:
    items = []
    for nav_route_id in COMMUNITY_NAV_ROUTE_IDS:
        route = route_by_id(nav_route_id)
        cls = "topbar__link"
        if nav_route_id == route_id:
            cls += " is-active"
        items.append(f'<a class="{cls}" href="{html.escape(route.path)}">{html.escape(route.title)}</a>')
    return "".join(items)


def _topbar_links_html(active_route_id: str) -> str:
    return _route_nav_html(active_route_id)


def _status_chips_html(chips: list[dict[str, Any]]) -> str:
    return "".join(
        f'<span class="chip state-{_state_class(chip["state"])}"><span class="chip__label">{html.escape(str(chip["label"]))}</span><span class="chip__value">{html.escape(str(chip["value"]))}</span></span>'
        for chip in chips
    )


def _legend_html(legend: list[dict[str, Any]]) -> str:
    items = []
    for item in legend:
        items.append(
            f'<li class="legend__item"><strong>{html.escape(str(item["label"]))}</strong><span class="tag state-{_state_class(item["status"])}">{html.escape(str(item["count"]))}</span><p class="muted">{html.escape(str(item["notes"]))}</p></li>'
        )
    return '<ul class="legend">' + "".join(items) + "</ul>"


def _release_gate_card_html(engine: TemplateEngine, release_gate: dict[str, Any]) -> str:
    blockers = release_gate.get("blockers", []) if isinstance(release_gate, dict) else []
    return engine.render_partial(
        "partials/release_gate_card.html",
        {
            "state": release_gate.get("state", DEMO_VALUES["release_state"]) if isinstance(release_gate, dict) else DEMO_VALUES["release_state"],
            "reason": release_gate.get("reason", DEMO_VALUES["release_reason"]) if isinstance(release_gate, dict) else DEMO_VALUES["release_reason"],
            "blocker_count": len(blockers),
            "blockers_html": _list_html(blockers),
        },
    )


def _release_gate_card_html_no_engine(bundle: SharedBundle) -> str:
    release_gate = bundle.community_packet.get("release_gate", {}) if bundle.community_packet else {}
    blockers = release_gate.get("blockers", []) if isinstance(release_gate, dict) else []
    return _kv_html(
        [
            ("State", release_gate.get("state", DEMO_VALUES["release_state"]) if isinstance(release_gate, dict) else DEMO_VALUES["release_state"]),
            ("Reason", release_gate.get("reason", DEMO_VALUES["release_reason"]) if isinstance(release_gate, dict) else DEMO_VALUES["release_reason"]),
            ("Blockers", len(blockers)),
        ]
    ) + _list_html(blockers)


def _evidence_inspector_html(engine: TemplateEngine, evidence: dict[str, Any]) -> str:
    context = dict(evidence)
    if isinstance(context.get("source_ids"), list):
        context["source_ids"] = ", ".join(str(item) for item in context["source_ids"])
    return engine.render_partial("partials/evidence_inspector.html", context)


def _evidence_inspector_html_no_engine(bundle: SharedBundle) -> str:
    evidence = bundle.community_packet.get("evidence_inspector", {}) if isinstance(bundle.community_packet, dict) else {}
    if not evidence:
        source = bundle.selected_source or _fallback_source()
        evidence = {
            "focus_label": "Source Record",
            "focus_id": source.source_id if isinstance(source, SourceRecord) else source.get("source_id", ""),
            "label": source.title if isinstance(source, SourceRecord) else source.get("title", ""),
            "status": source.rights_status if isinstance(source, SourceRecord) else source.get("rights_status", ""),
            "historical_basis": "verified_fact",
            "confidence": 100,
            "source_ids": [source.source_id] if isinstance(source, SourceRecord) else [source.get("source_id", "")],
            "notes": source.citation if isinstance(source, SourceRecord) else source.get("citation", ""),
        }
    return _kv_html(
        [
            ("Focus", evidence.get("focus_label", "")),
            ("Focus ID", evidence.get("focus_id", "")),
            ("Label", evidence.get("label", "")),
            ("State", evidence.get("status", "")),
            ("Historical basis", evidence.get("historical_basis", "")),
            ("Confidence", evidence.get("confidence", "")),
            ("Source IDs", ", ".join(evidence.get("source_ids", [])) if isinstance(evidence.get("source_ids"), list) else ""),
            ("Notes", evidence.get("notes", "")),
        ]
    )


def _map_controls_html(engine: TemplateEngine, controls: dict[str, Any]) -> str:
    return engine.render_partial("partials/map_controls.html", controls)


def _map_controls_body(bundle: SharedBundle) -> str:
    controls = _shared_map_controls(bundle)
    rows = controls.get("controls", [])
    cards = []
    for control in rows:
        cards.append(
            f'<div class="control-card"><strong>{html.escape(str(control.get("label", "")))}</strong><p>{html.escape(str(control.get("notes", "")))}</p></div>'
        )
    return '<div class="map-controls__grid">' + "".join(cards) + '</div>' + _text_block(str(controls.get("notes", "")))


def _panel_html(title: str, subtitle: str, body_html: str, footer_html: str = "", dark: bool = False) -> str:
    return _render_panel(title, subtitle, body_html, footer_html=footer_html, dark=dark)


def _source_rows(source: SourceRecord | Mapping[str, Any]) -> list[tuple[str, Any]]:
    if isinstance(source, SourceRecord):
        return [
            ("Source ID", source.source_id),
            ("Title", source.title),
            ("Type", source.source_type),
            ("Citation", source.citation),
            ("Rights", source.rights_status),
            ("Access", source.access_level),
            ("Repository", source.repository),
            ("URL", source.url),
            ("Accessed", source.accessed_date),
            ("Notes", source.notes),
        ]
    return [
        ("Source ID", source.get("source_id", "")),
        ("Title", source.get("title", "")),
        ("Type", source.get("source_type", "")),
        ("Citation", source.get("citation", "")),
        ("Rights", source.get("rights_status", "")),
        ("Access", source.get("access_level", "")),
        ("Repository", source.get("repository", "")),
        ("URL", source.get("url", "")),
        ("Accessed", source.get("accessed_date", "")),
        ("Notes", source.get("notes", "")),
    ]


def _source_issue_html(issue: Mapping[str, Any]) -> str:
    if not issue:
        return _text_block(DEMO_VALUES["source_canvas_hint"])
    return _kv_html(
        [
            ("Source issue ID", issue.get("source_issue_id", "")),
            ("Source ID", issue.get("source_id", "")),
            ("Publication", issue.get("publication_title", "")),
            ("Issue date", issue.get("issue_date", "")),
            ("Volume", issue.get("volume", "")),
            ("Number", issue.get("number", "")),
            ("Edition", issue.get("edition", "")),
            ("Page", issue.get("page", "")),
            ("Citation", issue.get("citation", "")),
            ("OCR excerpt", issue.get("ocr_excerpt", "")),
            ("Notes", issue.get("notes", "")),
        ]
    )


def _source_summary_html(bundle: SharedBundle) -> str:
    source = bundle.selected_source or _fallback_source()
    return _kv_html(_source_rows(source))


def _review_status_overview_html(bundle: SharedBundle) -> str:
    return _kv_html([
        ("Progress", f"{_overall_progress(bundle)}%"),
        ("Sources", str(bundle.source_count)),
        ("Sheets", str(bundle.sheet_count)),
        ("Buildings", str(bundle.building_count)),
        ("People", str(bundle.people_count)),
        ("Businesses", str(bundle.business_count)),
    ]) + _progress_html(_overall_progress(bundle))


def _scope_ladder_html(bundle: SharedBundle) -> str:
    ladder = bundle.community_packet.get("scope_ladder", []) if bundle.community_packet else []
    rows = [(item.get("label", ""), item.get("scope_state", ""), item.get("notes", "")) for item in ladder]
    return _table_html(["Scope", "State", "Notes"], rows)


def _release_blocker_html(bundle: SharedBundle) -> str:
    blockers = bundle.community_packet.get("release_gate", {}).get("blockers", []) if isinstance(bundle.community_packet.get("release_gate", {}), dict) else []
    return _list_html(blockers or [DEMO_VALUES["release_reason"]])


def _release_matrix_html(bundle: SharedBundle) -> str:
    matrix = bundle.community_packet.get("review_domains", []) if bundle.community_packet else []
    rows = [(item.get("label", ""), item.get("status", ""), item.get("record_count", ""), item.get("notes", "")) for item in matrix]
    return _table_html(["Domain", "State", "Count", "Notes"], rows)


def _linked_records_html(bundle: SharedBundle) -> str:
    people = bundle.community_review.get("people", []) if bundle.community_review else []
    businesses = bundle.community_review.get("businesses", []) if bundle.community_review else []
    items = [f"{record.get('display_name', '')} - {record.get('review_status', '')} - {record.get('historical_basis', '')}" for record in (people + businesses)[:8]]
    return _list_html(items or [DEMO_VALUES["fallback_note"]])


def _source_rights_html(bundle: SharedBundle) -> str:
    source = bundle.selected_source or _fallback_source()
    return _kv_html(_source_rows(source))


def _source_issue_browser_html(bundle: SharedBundle) -> str:
    issues = bundle.people_packet.get("source_issue_browser", []) if bundle.people_packet else []
    items = [f"{item.get('publication_title', '')} - {item.get('issue_date', '')} - {item.get('linked_record_count', 0)} linked" for item in issues]
    return _list_html(items or [DEMO_VALUES["people_canvas_hint"]])


def _people_review_html(bundle: SharedBundle) -> str:
    person = bundle.selected_person or {}
    return _kv_html([
        ("Person", person.get("display_name", "")),
        ("Review status", person.get("review_status", "")),
        ("Historical basis", person.get("historical_basis", "")),
        ("Source issue", person.get("source_issue_id", "")),
        ("Source IDs", ", ".join(person.get("source_ids", [])) if isinstance(person.get("source_ids"), list) else ""),
        ("Related locations", ", ".join(person.get("related_location_ids", [])) if isinstance(person.get("related_location_ids"), list) else ""),
        ("Notes", person.get("notes", "")),
    ])


def _business_review_html(bundle: SharedBundle) -> str:
    business = bundle.selected_business or {}
    return _kv_html([
        ("Business", business.get("display_name", "")),
        ("Review status", business.get("review_status", "")),
        ("Historical basis", business.get("historical_basis", "")),
        ("Source issue", business.get("source_issue_id", "")),
        ("Source IDs", ", ".join(business.get("source_ids", [])) if isinstance(business.get("source_ids"), list) else ""),
        ("Related locations", ", ".join(business.get("related_location_ids", [])) if isinstance(business.get("related_location_ids"), list) else ""),
        ("Notes", business.get("notes", "")),
    ])


def _stitch_workspace_html(bundle: SharedBundle) -> str:
    workspace = bundle.map_packet.get("stitch_workspace", {}) if bundle.map_packet else {}
    return _kv_html([
        ("Stitching status", workspace.get("stitching_status", "")),
        ("Control point status", workspace.get("control_point_status", "")),
        ("Georeferencing status", workspace.get("georeferencing_status", "")),
        ("Local alignment status", workspace.get("local_alignment_status", "")),
        ("Anchor sheet", workspace.get("anchor_sheet_id", "")),
        ("Composite status", workspace.get("composite_status", "")),
        ("Release gate", workspace.get("release_gate_status", "")),
        ("Warnings", "; ".join(workspace.get("warnings", [])) if isinstance(workspace.get("warnings", []), list) else ""),
    ])


def _sheet_browser_html(bundle: SharedBundle) -> str:
    sheets = bundle.map_packet.get("sheet_selector", []) if bundle.map_packet else []
    items = [f"Sheet {sheet.get('sheet_label', '')} - {sheet.get('sheet_role', '')} - {sheet.get('review_status', '')}" for sheet in sheets]
    return _list_html(items or [DEMO_VALUES["map_canvas_hint"]])


def _coverage_grid_html(map_packet: dict[str, Any]) -> str:
    coverage = map_packet.get("coverage_grid", []) if isinstance(map_packet, dict) else []
    rows = [(item.get("label", ""), item.get("status", ""), item.get("count", ""), item.get("notes", "")) for item in coverage]
    return _table_html(["Area", "State", "Count", "Notes"], rows)


def _layer_stack_html(bundle: SharedBundle) -> str:
    layers = bundle.map_packet.get("layer_stack", []) if bundle.map_packet else []
    items = [f"{layer.get('label', '')} - {layer.get('status', '')} - {layer.get('notes', '')}" for layer in layers]
    return _list_html(items)


def _building_workspace_html(bundle: SharedBundle) -> str:
    building = bundle.map_packet.get("building_workspace", {}) if bundle.map_packet else {}
    return _kv_html([
        ("Building ID", building.get("building_id", "")),
        ("Location ID", building.get("location_id", "")),
        ("Review record", building.get("review_record_id", "")),
        ("Identity status", building.get("identity_status", "")),
        ("Visual detail", building.get("visual_detail_status", "")),
        ("Footprint status", building.get("footprint_status", "")),
        ("Geometry basis", building.get("geometry_basis", "")),
        ("Notes", building.get("notes", "")),
    ])


def _art_preview_html(bundle: SharedBundle) -> str:
    art = bundle.map_packet.get("art_preview", {}) if bundle.map_packet else {}
    items = [
        f"Preview status: {art.get('preview_status', '')}",
        f"Transparent background: {art.get('transparent_background', False)}",
        f"Building art id: {art.get('building_art_id', '')}",
    ]
    for layer in art.get("layers", []):
        items.append(f"{layer.get('label', '')} - {layer.get('status', '')} - {layer.get('notes', '')}")
    return _list_html(items or [DEMO_VALUES["building_canvas_hint"]])


def _control_point_html(bundle: SharedBundle) -> str:
    control = bundle.map_packet.get("control_point_workspace", {}) if bundle.map_packet else {}
    return _kv_html([
        ("Control point status", control.get("control_point_status", "")),
        ("Manifest id", control.get("control_point_manifest_id", "")),
        ("Missing sheets", ", ".join(control.get("missing_control_point_sheet_ids", [])) if isinstance(control.get("missing_control_point_sheet_ids", []), list) else ""),
        ("Warnings", "; ".join(control.get("warnings", [])) if isinstance(control.get("warnings", []), list) else ""),
    ])


def _georeference_html(bundle: SharedBundle) -> str:
    georef = bundle.map_packet.get("georeference_workspace", {}) if bundle.map_packet else {}
    return _kv_html([
        ("Coordinate system", georef.get("coordinate_system", "")),
        ("Local alignment", georef.get("local_alignment_status", "")),
        ("Transform status", georef.get("transform_status", "")),
        ("Warnings", "; ".join(georef.get("warnings", [])) if isinstance(georef.get("warnings", []), list) else ""),
    ])


def _composite_manifest_html(bundle: SharedBundle) -> str:
    composite = bundle.map_packet.get("composite_manifest", {}) if bundle.map_packet else {}
    return _kv_html([
        ("Composite id", composite.get("composite_manifest_id", "")),
        ("Composite status", composite.get("composite_status", "")),
        ("Release gate", composite.get("release_gate_status", "")),
        ("Release reason", composite.get("release_gate_reason", "")),
        ("Blockers", str(len(composite.get("blockers", [])))),
        ("Warnings", str(len(composite.get("warnings", [])))),
    ])


def _provenance_trail_html(bundle: SharedBundle) -> str:
    issue = bundle.selected_issue or {}
    return _kv_html([
        ("Source issue", issue.get("source_issue_id", "")),
        ("Source id", issue.get("source_id", "")),
        ("Page", issue.get("page", "")),
        ("Citation", issue.get("citation", "")),
        ("OCR excerpt", issue.get("ocr_excerpt", "")),
    ])


def _review_history_html(bundle: SharedBundle) -> str:
    history = bundle.community_packet.get("review_history", []) if bundle.community_packet else []
    items = [f"{item.get('label', '')} - {item.get('status', '')} - {item.get('notes', '')}" for item in history]
    return _list_html(items or [DEMO_VALUES["fallback_note"]])


def _unresolved_summary_html(bundle: SharedBundle) -> str:
    unresolved = bundle.map_packet.get("unresolved_summary", []) if bundle.map_packet else []
    items = [f"{item.get('label', '')}: {item.get('count', '')}" for item in unresolved]
    return _list_html(items or [DEMO_VALUES["fallback_note"]])


def _review_legend(bundle: SharedBundle) -> list[dict[str, Any]]:
    legend = bundle.map_packet.get("review_legend", []) if bundle.map_packet else []
    if legend:
        return list(legend)
    return [
        {"label": "Verified Fact", "status": "verified", "count": 0, "notes": "Directly supported by evidence."},
        {"label": "Source-Based Inference", "status": "inferred", "count": 0, "notes": "Reasonable but not fully verified."},
        {"label": "Illustrative", "status": "illustrative", "count": 0, "notes": "Useful, but not historical proof."},
        {"label": "Unknown", "status": "unknown", "count": 0, "notes": "Still unresolved."},
        {"label": "Rejected", "status": "rejected", "count": 0, "notes": "Reviewed and not accepted."},
    ]


def _evidence_inspector(bundle: SharedBundle) -> dict[str, Any]:
    inspector = bundle.community_packet.get("evidence_inspector", {}) if bundle.community_packet else {}
    if inspector:
        return dict(inspector)
    source = bundle.selected_source or _fallback_source()
    return {
        "focus_label": "Source Record",
        "focus_id": source.source_id if isinstance(source, SourceRecord) else source.get("source_id", ""),
        "label": source.title if isinstance(source, SourceRecord) else source.get("title", ""),
        "status": source.rights_status if isinstance(source, SourceRecord) else source.get("rights_status", ""),
        "historical_basis": "verified_fact",
        "confidence": 100,
        "source_ids": [source.source_id] if isinstance(source, SourceRecord) else [source.get("source_id", "")],
        "notes": source.citation if isinstance(source, SourceRecord) else source.get("citation", ""),
    }


def _map_controls(bundle: SharedBundle) -> dict[str, Any]:
    controls = bundle.map_packet.get("map_controls", {}) if bundle.map_packet else {}
    if controls:
        return dict(controls)
    return {
        "controls": [
            {"label": "Sheet selection", "notes": "Choose a reviewed sheet."},
            {"label": "Zoom", "notes": "Magnify the stitched map."},
            {"label": "Control points", "notes": "Local only until alignment is stable."},
        ],
        "notes": DEMO_VALUES["map_canvas_hint"],
    }


def _render_panel(title: str, subtitle: str, body_html: str, footer_html: str = "", dark: bool = False) -> str:
    panel_class = "panel panel--dark" if dark else "panel"
    footer = f'<div class="panel__footer">{html.escape(footer_html)}</div>' if footer_html else ""
    return (
        f'<section class="{panel_class}">'
        f'<div class="panel__head"><div><p class="eyebrow">{html.escape(title)}</p><h2>{html.escape(title)}</h2><p class="panel__subtitle">{html.escape(subtitle)}</p></div></div>'
        f'<div class="panel__body">{body_html}</div>'
        f"{footer}"
        "</section>"
    )


def _hero_html(title: str, subtitle: str, rows: list[tuple[str, str]], bundle: SharedBundle) -> str:
    body = _kv_html(rows) + _progress_html(_overall_progress(bundle))
    return _render_panel(title, subtitle, body, footer_html=f"{bundle.package.town_name} - {bundle.package.state_region} - {bundle.package.package_id}", dark=True)


def _progress_html(progress: int) -> str:
    progress = max(0, min(100, progress))
    return f'<div class="progress" aria-label="Town progress"><div class="progress__fill" style="width: {progress}%"></div></div>'


def _kv_html(rows: list[tuple[str, Any]]) -> str:
    items = []
    for label, value in rows:
        items.append(
            f'<div class="key-value"><div class="key-value__label">{html.escape(str(label))}</div><p class="key-value__value">{html.escape(str(value))}</p></div>'
        )
    return f'<div class="key-value-grid">{"".join(items)}</div>'


def _table_html(headers: list[str], rows: list[tuple[Any, ...]]) -> str:
    header_html = "".join(f"<th>{html.escape(header)}</th>" for header in headers)
    row_html = []
    for row in rows:
        row_html.append("<tr>" + "".join(f"<td>{html.escape(str(cell))}</td>" for cell in row) + "</tr>")
    return f'<table class="table"><thead><tr>{header_html}</tr></thead><tbody>{"".join(row_html)}</tbody></table>'


def _list_html(items: list[Any]) -> str:
    if not items:
        return '<p class="muted">No items available.</p>'
    return '<ul class="list">' + "".join(f'<li class="list__item">{html.escape(str(item))}</li>' for item in items) + "</ul>"


def _route_cards_html(engine: TemplateEngine, cards: list[dict[str, Any]]) -> str:
    return "".join(engine.render_partial("partials/route_card.html", card) for card in cards)


def _route_cards_html_no_engine(bundle: SharedBundle) -> str:
    cards = _route_cards(bundle, route_by_id("community"))
    html_cards = []
    for card in cards:
        html_cards.append(
            f'<a class="route-card {html.escape(card["route_card_class"])}" href="{html.escape(card["href"])}">'
            f'<span class="route-card__label">{html.escape(card["route_id"])}</span>'
            f'<h3 class="route-card__title">{html.escape(card["title"])}</h3>'
            f'<p class="route-card__desc">{html.escape(card["subtitle"])}</p>'
            f'<p class="route-card__desc">{html.escape(card["summary"])}</p>'
            f'<p class="route-card__stat"><strong>{html.escape(card["stat_label"])}:</strong> {html.escape(card["stat_value"])}</p>'
            "</a>"
        )
    return '<div class="route-card-grid">' + "".join(html_cards) + "</div>"


def _status_chips_html(chips: list[dict[str, Any]]) -> str:
    return "".join(
        f'<span class="chip state-{_state_class(chip["state"])}"><span class="chip__label">{html.escape(str(chip["label"]))}</span><span class="chip__value">{html.escape(str(chip["value"]))}</span></span>'
        for chip in chips
    )


def _legend_html(legend: list[dict[str, Any]]) -> str:
    items = []
    for item in legend:
        items.append(
            f'<li class="legend__item"><strong>{html.escape(str(item["label"]))}</strong><span class="tag state-{_state_class(item["status"])}">{html.escape(str(item["count"]))}</span><p class="muted">{html.escape(str(item["notes"]))}</p></li>'
        )
    return '<ul class="legend">' + "".join(items) + "</ul>"


def _release_gate_card_html(engine: TemplateEngine, release_gate: dict[str, Any]) -> str:
    blockers = release_gate.get("blockers", []) if isinstance(release_gate, dict) else []
    return engine.render_partial(
        "partials/release_gate_card.html",
        {
            "state": release_gate.get("state", DEMO_VALUES["release_state"]) if isinstance(release_gate, dict) else DEMO_VALUES["release_state"],
            "reason": release_gate.get("reason", DEMO_VALUES["release_reason"]) if isinstance(release_gate, dict) else DEMO_VALUES["release_reason"],
            "blocker_count": len(blockers),
            "blockers_html": _list_html(blockers),
        },
    )


def _evidence_inspector_html(engine: TemplateEngine, evidence: dict[str, Any]) -> str:
    return engine.render_partial("partials/evidence_inspector.html", evidence)


def _map_controls_html(engine: TemplateEngine, controls: dict[str, Any]) -> str:
    return engine.render_partial("partials/map_controls.html", controls)


def _source_rows(source: SourceRecord | Mapping[str, Any]) -> list[tuple[str, Any]]:
    if isinstance(source, SourceRecord):
        return [
            ("Source ID", source.source_id),
            ("Title", source.title),
            ("Type", source.source_type),
            ("Citation", source.citation),
            ("Rights", source.rights_status),
            ("Access", source.access_level),
            ("Repository", source.repository),
            ("URL", source.url),
            ("Accessed", source.accessed_date),
            ("Notes", source.notes),
        ]
    return [
        ("Source ID", source.get("source_id", "")),
        ("Title", source.get("title", "")),
        ("Type", source.get("source_type", "")),
        ("Citation", source.get("citation", "")),
        ("Rights", source.get("rights_status", "")),
        ("Access", source.get("access_level", "")),
        ("Repository", source.get("repository", "")),
        ("URL", source.get("url", "")),
        ("Accessed", source.get("accessed_date", "")),
        ("Notes", source.get("notes", "")),
    ]


def _source_summary_html(bundle: SharedBundle) -> str:
    source = bundle.selected_source or _fallback_source()
    return _kv_html(_source_rows(source))


def _route_card_stat(bundle: SharedBundle, route_id: str) -> tuple[str, str, str]:
    if route_id == "community":
        progress = _overall_progress(bundle)
        return ("Progress", f"{progress}%", "ready" if progress >= 80 else "reviewing")
    if route_id == "map-auditor":
        status = bundle.map_packet.get("stitch_workspace", {}).get("stitching_status", "unavailable") if bundle.map_packet else "unavailable"
        return ("Stitching", str(status), str(status))
    if route_id == "building-auditor":
        build_total = getattr(bundle.building_manifest, "record_count", 0) if bundle.building_manifest is not None else 0
        reviewed = 0
        if bundle.building_manifest is not None:
            reviewed = sum(1 for building in bundle.building_manifest.buildings if building.identity_status in {"reviewed", "approved"})
        return ("Reviewed", f"{reviewed}/{build_total}" if build_total else "0/0", "partial" if build_total else "blocked")
    if route_id == "people-auditor":
        return ("Queue", str(bundle.people_packet.get("review_queue_status", "unavailable")), str(bundle.people_packet.get("review_queue_status", "unavailable")))
    if route_id == "source-provenance-inspector":
        source = bundle.selected_source or _fallback_source()
        return ("Source", source.source_id if isinstance(source, SourceRecord) else source.get("source_id", ""), "guarded")
    if route_id == "release-gate":
        return ("State", bundle.release_state, bundle.release_state)
    return ("Status", "unknown", "unknown")


def _route_cards(bundle: SharedBundle, active_route: CommunityRoute) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for route_id in COMMUNITY_PRODUCT_ROUTE_IDS:
        route = route_by_id(route_id)
        stat_label, stat_value, state = _route_card_stat(bundle, route_id)
        cards.append(
            {
                "route_id": route.route_id,
                "href": route.path,
                "title": route.title,
                "subtitle": route.subtitle,
                "summary": route.summary,
                "stat_label": stat_label,
                "stat_value": stat_value,
                "state": state,
                "active": route.route_id == active_route.route_id,
                "route_card_class": "is-active" if route.route_id == active_route.route_id else "",
            }
        )
    return cards


def _route_css_link(route: CommunityRoute) -> str:
    if not route.css_file:
        return ""
    return f'<link rel="stylesheet" href="/static/css/{html.escape(route.css_file)}">'


def _route_js_link(route: CommunityRoute) -> str:
    if not route.js_file:
        return ""
    return f'<script src="/static/js/{html.escape(route.js_file)}" defer></script>'


def _route_nav_html(route_id: str) -> str:
    items = []
    for nav_route_id in COMMUNITY_NAV_ROUTE_IDS:
        route = route_by_id(nav_route_id)
        cls = "topbar__link"
        if nav_route_id == route_id:
            cls += " is-active"
        items.append(f'<a class="{cls}" href="{html.escape(route.path)}">{html.escape(route.title)}</a>')
    return "".join(items)


def _topbar_links_html(active_route_id: str) -> str:
    return _route_nav_html(active_route_id)


def _overall_progress(bundle: SharedBundle) -> int:
    metrics: list[int] = []
    if bundle.community_packet:
        progress_summary = bundle.community_packet.get("progress_summary", {})
        if isinstance(progress_summary, dict):
            metrics.append(int(progress_summary.get("overall_percent", 0) or 0))
    if bundle.map_packet:
        progress_summary = bundle.map_packet.get("progress_summary", {})
        if isinstance(progress_summary, dict):
            metrics.append(int(progress_summary.get("overall_percent", 0) or 0))
    if bundle.people_packet:
        progress_summary = bundle.people_packet.get("progress_summary", {})
        if isinstance(progress_summary, dict):
            metrics.append(int(progress_summary.get("overall_percent", 0) or 0))
    if not metrics:
        return 0
    return int(round(sum(metrics) / len(metrics)))


def _text_block(text: str) -> str:
    return f'<p class="text-block">{html.escape(text)}</p>'


def _shared_map_controls(bundle: SharedBundle) -> dict[str, Any]:
    controls = bundle.map_packet.get("map_controls", {}) if bundle.map_packet else {}
    if controls:
        data = dict(controls)
    else:
        data = {
            "controls": [
                {"label": "Sheet selection", "notes": "Choose a reviewed sheet."},
                {"label": "Zoom", "notes": "Magnify the stitched map."},
                {"label": "Control points", "notes": "Local only until alignment is stable."},
            ],
            "notes": DEMO_VALUES["map_canvas_hint"],
        }
    data["controls_html"] = _map_controls_markup(data.get("controls", []))
    return data


def _map_controls_markup(controls: list[dict[str, Any]]) -> str:
    items = []
    for control in controls:
        items.append(
            f'<div class="control-card"><strong>{html.escape(str(control.get("label", "")))}</strong><p>{html.escape(str(control.get("notes", "")))}</p></div>'
        )
    return "".join(items)


def _selected_building(map_packet: dict[str, Any], building_manifest: Any | None) -> dict[str, Any] | None:
    if isinstance(map_packet, dict) and isinstance(map_packet.get("selected_building"), dict):
        return dict(map_packet["selected_building"])
    if building_manifest is None or not getattr(building_manifest, "buildings", None):
        return None
    building = building_manifest.buildings[0]
    return {
        "building_id": building.building_id,
        "location_id": building.location_id,
        "review_record_id": building.review_record_id,
        "reviewed_label": building.reviewed_label,
        "identity_status": building.identity_status,
        "visual_detail_status": building.visual_detail_status,
        "anchor_status": building.anchor_status,
        "existence_status": building.existence_status,
        "default_render_mode": building.default_render_mode,
        "historical_function": building.historical_function,
        "notes": building.notes,
        "source_ids": list(building.source_ids),
        "supporting_claim_ids": list(building.supporting_claim_ids),
        "suggestion_ids": list(building.suggestion_ids),
        "student_safe_name": building.student_safe_name,
    }


def _fallback_release_gate() -> dict[str, Any]:
    return {"state": DEMO_VALUES["release_state"], "reason": DEMO_VALUES["release_reason"], "blockers": []}


def _fallback_source() -> Mapping[str, Any]:
    return {
        "source_id": "source_texarkana_1885_demo",
        "title": "Texarkana 1885 demo source",
        "source_type": "demo",
        "citation": "Demo source placeholder used when live data is unavailable.",
        "rights_status": "unknown",
        "access_level": "demo",
        "repository": "local demo",
        "url": "",
        "accessed_date": "",
        "notes": DEMO_VALUES["fallback_note"],
    }


def _package_map_year(package: TownPackage) -> int:
    if package.map_layers and isinstance(package.map_layers[0], dict):
        map_year = package.map_layers[0].get("year")
        if isinstance(map_year, int) and not isinstance(map_year, bool):
            return map_year
    start_year = package.time_window.get("start_year")
    if isinstance(start_year, int) and not isinstance(start_year, bool):
        return start_year
    raise MindseyeDataError("town package is missing a usable map year")


def _year_gate(map_year: int) -> dict[str, Any]:
    return {
        "map_year": map_year,
        "start_year": map_year - 10,
        "end_year": map_year + 10,
        "span_before_years": 10,
        "span_after_years": 10,
        "total_span_years": 20,
    }


def _state_class(value: Any) -> str:
    cleaned = str(value).lower().strip().replace(" ", "-")
    cleaned = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in cleaned)
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned or "unknown"


def _safe(builder, fallback):
    try:
        return builder()
    except MindseyeDataError:
        return fallback
