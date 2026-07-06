"""Schema helpers for the PostgreSQL database foundation."""

from __future__ import annotations

from pathlib import Path

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def read_schema_sql() -> str:
    return SCHEMA_PATH.read_text(encoding="utf-8")
