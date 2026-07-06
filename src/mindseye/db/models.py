"""Shared database model constants and light row containers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

ALLOWED_CLAIM_TYPES = (
    "verified_fact",
    "source_based_inference",
    "fictional_gameplay",
)

ALLOWED_CONFIDENCE_LABELS = (
    "high",
    "medium",
    "low",
    "fictional",
)


@dataclass(frozen=True)
class TableRow:
    """A normalized database row before it is written to PostgreSQL."""

    table: str
    values: dict[str, Any]
