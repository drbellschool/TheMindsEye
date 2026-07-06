"""Core package for The Mind's Eye prototype.

The early code intentionally stays small. It provides stable module
boundaries for Codex and future agents without pretending the full product
is already implemented.
"""

from .game_loop import MissionRun
from .map_engine import MapEngine
from .mission_seed import build_mission_seed_packet, build_teacher_review_packet
from .models import (
    ClaimRecord,
    ClaimType,
    Confidence,
    LocationRecord,
    MindseyeDataError,
    MissionSeed,
    SourceRecord,
    TownPackage,
)
from .town_loader import load_town_package
from .web_view import build_town_package_view_model, render_town_package_page

__all__ = [
    "ClaimType",
    "Confidence",
    "MindseyeDataError",
    "SourceRecord",
    "LocationRecord",
    "ClaimRecord",
    "MissionSeed",
    "TownPackage",
    "MapEngine",
    "MissionRun",
    "build_mission_seed_packet",
    "build_teacher_review_packet",
    "build_town_package_view_model",
    "load_town_package",
    "render_town_package_page",
]
