from __future__ import annotations

import tempfile
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_community_review_packet, load_building_manifest, load_town_package
from mindseye.models import MindseyeDataError
from mindseye.review_state import (
    append_review_event,
    build_building_review_event,
    build_community_review_event,
    load_review_state,
)


class ReviewStateTests(unittest.TestCase):
    def test_review_events_replay_into_packets(self) -> None:
        package = load_town_package(ROOT, "texarkana")
        community_packet = build_community_review_packet(package)
        person_record = community_packet["people"][0]
        building_manifest = load_building_manifest(ROOT, "texarkana")
        reviewed_building = next(
            building
            for building in building_manifest.buildings
            if building.review_record_id is not None and building.identity_status in {"reviewed", "approved"}
        )

        with tempfile.TemporaryDirectory() as tmp_dir:
            state_dir = Path(tmp_dir)
            append_review_event(
                state_dir,
                build_community_review_event(
                    town_slug="texarkana",
                    record_group="people",
                    record_id=person_record["review_record_id"],
                    review_status="confirmed",
                    historical_basis="verified_fact",
                    notes="People review saved for replay.",
                    return_to="#people-auditor",
                ),
            )
            append_review_event(
                state_dir,
                build_building_review_event(
                    town_slug="texarkana",
                    record_id=reviewed_building.building_id,
                    identity_status="approved",
                    identity_basis="verified_fact",
                    visual_detail_status="verified",
                    notes="Building review saved for replay.",
                    return_to="#map-auditor",
                ),
            )

            replayed_state = load_review_state(state_dir)
            self.assertEqual(len(replayed_state["events"]), 2)

            replayed_community = build_community_review_packet(package, state_root=state_dir)
            replayed_people = {record["review_record_id"]: record for record in replayed_community["people"]}
            self.assertEqual(replayed_people[person_record["review_record_id"]]["review_status"], "confirmed")
            self.assertIn("People review saved for replay.", replayed_people[person_record["review_record_id"]]["notes"])

            replayed_buildings = load_building_manifest(ROOT, "texarkana", state_root=state_dir).buildings
            replayed_building = next(
                building for building in replayed_buildings if building.building_id == reviewed_building.building_id
            )
            self.assertEqual(replayed_building.identity_status, "approved")
            self.assertEqual(replayed_building.visual_detail_status, "verified")
            self.assertIn("Building review saved for replay.", replayed_building.notes)

            self.assertGreaterEqual(len(replayed_state["events"]), 2)
            self.assertEqual(replayed_state["events"][0]["record_id"], person_record["review_record_id"])
            self.assertEqual(replayed_state["events"][1]["record_id"], reviewed_building.building_id)

    def test_append_review_event_rejects_invalid_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            state_dir = Path(tmp_dir)
            with self.assertRaises(MindseyeDataError):
                append_review_event(
                    state_dir,
                    {
                        "domain": "community_review",
                        "record_group": "people",
                        "record_id": "review_texarkana_1885_person_001",
                        "overrides": {
                            "review_status": "not_a_real_status",
                            "historical_basis": "verified_fact",
                        },
                    },
                )


if __name__ == "__main__":
    unittest.main()
