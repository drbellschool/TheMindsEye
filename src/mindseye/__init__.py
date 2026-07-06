"""Core package for The Mind's Eye prototype.

The early code intentionally stays small. It provides stable module
boundaries for Codex and future agents without pretending the full product
is already implemented.
"""

from .game_loop import MissionRun
from .map_engine import MapEngine
from .mission_seed import build_teacher_review_packet
from .models import ClaimRecord, ClaimType, Confidence, LocationRecord, MissionSeed, SourceRecord, TownPackage
from .town_loader import load_town_package

__all__ = [
    "ClaimType",
    "Confidence",
    "SourceRecord",
    "LocationRecord",
    "ClaimRecord",
    "MissionSeed",
    "TownPackage",
    "MapEngine",
    "MissionRun",
    "build_teacher_review_packet",
    "load_town_package",
]
