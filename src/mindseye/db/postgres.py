"""PostgreSQL adapter for town-package imports."""

from __future__ import annotations

from typing import Any

from .importer import TownImportPlan
from .schema import read_schema_sql


def import_plan(database_url: str, plan: TownImportPlan, apply_schema: bool = False) -> None:
    """Import a town package into PostgreSQL.

    Existing rows for the same town package are replaced in one transaction.
    """

    try:
        import psycopg
        from psycopg.types.json import Jsonb
    except ImportError as exc:
        raise RuntimeError(
            "PostgreSQL import requires psycopg. Install it with "
            "`python -m pip install \"psycopg[binary]\"`."
        ) from exc

    with psycopg.connect(database_url) as conn:
        with conn.transaction():
            if apply_schema:
                conn.execute(read_schema_sql())
            conn.execute("DELETE FROM town_packages WHERE package_id = %s", (plan.package_id,))
            _insert_town_package(conn, plan.town_package.values, Jsonb)
            _insert_many(conn, "source_records", plan.source_records, Jsonb)
            _insert_many(conn, "locations", plan.locations, Jsonb)
            _insert_many(conn, "claims", plan.claims, Jsonb)
            _insert_many(conn, "claim_sources", plan.claim_sources, Jsonb)
            _insert_many(conn, "claim_locations", plan.claim_locations, Jsonb)
            _insert_many(conn, "mission_seeds", plan.mission_seeds, Jsonb)
            _insert_many(conn, "mission_claims", plan.mission_claims, Jsonb)
            _insert_many(conn, "mission_locations", plan.mission_locations, Jsonb)


def _insert_town_package(conn: Any, values: dict[str, Any], jsonb: Any) -> None:
    conn.execute(
        """
        INSERT INTO town_packages (
            package_id,
            town_name,
            state_region,
            start_year,
            end_year,
            time_window_label,
            source_manifest,
            status,
            notes,
            raw_record
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            values["package_id"],
            values["town_name"],
            values["state_region"],
            values["start_year"],
            values["end_year"],
            values["time_window_label"],
            values["source_manifest"],
            values["status"],
            values["notes"],
            jsonb(values["raw_record"]),
        ),
    )


def _insert_many(conn: Any, table: str, rows: list[Any], jsonb: Any) -> None:
    for row in rows:
        values = row.values
        if table == "source_records":
            conn.execute(
                """
                INSERT INTO source_records (
                    source_id,
                    town_package_id,
                    title,
                    source_type,
                    repository,
                    url,
                    citation,
                    rights_status,
                    access_level,
                    accessed_date,
                    notes,
                    raw_record
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    values["source_id"],
                    values["town_package_id"],
                    values["title"],
                    values["source_type"],
                    values["repository"],
                    values["url"],
                    values["citation"],
                    values["rights_status"],
                    values["access_level"],
                    values["accessed_date"],
                    values["notes"],
                    jsonb(values["raw_record"]),
                ),
            )
        elif table == "locations":
            conn.execute(
                """
                INSERT INTO locations (
                    location_id,
                    town_package_id,
                    map_id,
                    label,
                    street,
                    location_type,
                    source_ids,
                    certainty,
                    notes,
                    raw_record
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    values["location_id"],
                    values["town_package_id"],
                    values["map_id"],
                    values["label"],
                    values["street"],
                    values["location_type"],
                    values["source_ids"],
                    values["certainty"],
                    values["notes"],
                    jsonb(values["raw_record"]),
                ),
            )
        elif table == "claims":
            conn.execute(
                """
                INSERT INTO claims (
                    claim_id,
                    town_package_id,
                    claim_text,
                    claim_type,
                    confidence,
                    reasoning_note,
                    student_visible,
                    teacher_visible,
                    raw_record
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    values["claim_id"],
                    values["town_package_id"],
                    values["claim_text"],
                    values["claim_type"],
                    values["confidence"],
                    values["reasoning_note"],
                    values["student_visible"],
                    values["teacher_visible"],
                    jsonb(values["raw_record"]),
                ),
            )
        elif table == "claim_sources":
            conn.execute(
                "INSERT INTO claim_sources (claim_id, source_id) VALUES (%s, %s)",
                (values["claim_id"], values["source_id"]),
            )
        elif table == "claim_locations":
            conn.execute(
                "INSERT INTO claim_locations (claim_id, location_id) VALUES (%s, %s)",
                (values["claim_id"], values["location_id"]),
            )
        elif table == "mission_seeds":
            conn.execute(
                """
                INSERT INTO mission_seeds (
                    mission_id,
                    town_package_id,
                    title,
                    teacher_goal,
                    student_hook,
                    teacher_notes,
                    fictional_elements,
                    raw_record
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    values["mission_id"],
                    values["town_package_id"],
                    values["title"],
                    values["teacher_goal"],
                    values["student_hook"],
                    values["teacher_notes"],
                    jsonb(values["fictional_elements"]),
                    jsonb(values["raw_record"]),
                ),
            )
        elif table == "mission_claims":
            conn.execute(
                "INSERT INTO mission_claims (mission_id, claim_id) VALUES (%s, %s)",
                (values["mission_id"], values["claim_id"]),
            )
        elif table == "mission_locations":
            conn.execute(
                "INSERT INTO mission_locations (mission_id, location_id) VALUES (%s, %s)",
                (values["mission_id"], values["location_id"]),
            )
        else:
            raise ValueError(f"unsupported table: {table}")
