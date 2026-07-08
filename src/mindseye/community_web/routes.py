from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CommunityRoute:
    route_id: str
    path: str
    title: str
    subtitle: str
    summary: str
    template_name: str
    css_file: str | None = None
    js_file: str | None = None
    legacy_paths: tuple[str, ...] = ()


COMMUNITY_ROUTES: tuple[CommunityRoute, ...] = (
    CommunityRoute(
        route_id="community",
        path="/community",
        title="Community Dashboard",
        subtitle="Community Verification Console",
        summary="Town review control room, release gate, and route launcher.",
        template_name="community_dashboard.html",
        css_file="community_dashboard.css",
        js_file="community_dashboard.js",
        legacy_paths=("/texarkana", "/texarkana/community-dashboard"),
    ),
    CommunityRoute(
        route_id="map-auditor",
        path="/community/map-auditor",
        title="Map Auditor",
        subtitle="Sanborn stitching and georeferencing workspace",
        summary="Sheet review, layer separation, and map handoff tooling.",
        template_name="map_auditor.html",
        css_file="map_auditor.css",
        js_file="map_auditor.js",
        legacy_paths=("/texarkana/map-auditor",),
    ),
    CommunityRoute(
        route_id="building-auditor",
        path="/community/building-auditor",
        title="Building Auditor",
        subtitle="Footprint, identity, and art review",
        summary="Review extracted labels, reviewed anchors, and transparent art layers.",
        template_name="building_auditor.html",
        css_file="building_auditor.css",
        js_file="building_auditor.js",
        legacy_paths=("/texarkana/building-auditor",),
    ),
    CommunityRoute(
        route_id="people-auditor",
        path="/community/people-auditor",
        title="People Auditor",
        subtitle="Person and business identity review",
        summary="Track issue adapters, identities, and provenance trails separately.",
        template_name="people_auditor.html",
        css_file="people_auditor.css",
        js_file="people_auditor.js",
        legacy_paths=("/texarkana/people-auditor",),
    ),
    CommunityRoute(
        route_id="source-provenance-inspector",
        path="/community/source-provenance-inspector",
        title="Source / Provenance Inspector",
        subtitle="Evidence drill-down and citation hub",
        summary="Inspect source records, linked claims, and rights metadata in one place.",
        template_name="source_provenance_inspector.html",
        legacy_paths=("/texarkana/source-provenance-inspector",),
    ),
    CommunityRoute(
        route_id="release-gate",
        path="/community/release-gate",
        title="Release Gate Report",
        subtitle="Community handoff decision",
        summary="Explain what still blocks release and what is ready to move forward.",
        template_name="release_gate.html",
        legacy_paths=("/texarkana/release-gate-report",),
    ),
    CommunityRoute(
        route_id="debug",
        path="/debug",
        title="Debug View",
        subtitle="Internal diagnostic surface",
        summary="Read-only diagnostic composite surface retained for internal inspection.",
        template_name="debug.html",
        legacy_paths=("/texarkana/debug",),
    ),
)

COMMUNITY_ROUTE_IDS: tuple[str, ...] = tuple(route.route_id for route in COMMUNITY_ROUTES)
COMMUNITY_PRODUCT_ROUTE_IDS: tuple[str, ...] = tuple(route.route_id for route in COMMUNITY_ROUTES if route.route_id != "debug")
COMMUNITY_NAV_ROUTE_IDS: tuple[str, ...] = tuple(route.route_id for route in COMMUNITY_ROUTES if route.route_id != "debug")

_ROUTE_BY_ID = {route.route_id: route for route in COMMUNITY_ROUTES}
_PATH_TO_ROUTE_ID = {route.path: route.route_id for route in COMMUNITY_ROUTES}
for route in COMMUNITY_ROUTES:
    for legacy_path in route.legacy_paths:
        _PATH_TO_ROUTE_ID[legacy_path] = route.route_id


def route_by_id(route_id: str) -> CommunityRoute:
    route = _ROUTE_BY_ID.get(route_id)
    if route is None:
        raise KeyError(route_id)
    return route


def route_path(route_id: str) -> str:
    return route_by_id(route_id).path


def normalize_path(path: str) -> str:
    cleaned = path.strip() or "/"
    if not cleaned.startswith("/"):
        cleaned = f"/{cleaned}"
    if cleaned != "/":
        cleaned = cleaned.rstrip("/")
    return cleaned or "/"


def resolve_route(path: str) -> CommunityRoute | None:
    normalized = normalize_path(path)
    route_id = _PATH_TO_ROUTE_ID.get(normalized)
    if route_id is None:
        return None
    return _ROUTE_BY_ID[route_id]


def static_path(*parts: str) -> str:
    suffix = "/".join(part.strip("/") for part in parts if part)
    return f"/static/{suffix}" if suffix else "/static"

