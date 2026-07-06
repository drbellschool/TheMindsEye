"""Core package for The Mind's Eye prototype.

The early code intentionally stays small. It provides stable module
boundaries for Codex and future agents without pretending the full product
is already implemented.
"""

from .models import ClaimType, Confidence, SourceRecord, LocationRecord, ClaimRecord, MissionSeed, TownPackage
from .town_loader import load_town_package

__all__ = [
    "ClaimType",
    "Confidence",
    "SourceRecord",
    "LocationRecord",
    "ClaimRecord",
    "MissionSeed",
    "TownPackage",
    "load_town_package",
]
