from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from mindseye.db.importer import build_import_plan


class TownImportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.town_dir = ROOT / "data" / "towns" / "texarkana"
        self.plan = build_import_plan(self.town_dir)

    def test_preserves_source_ids(self) -> None:
        raw_sources = _load(self.town_dir / "sources.json")
        raw_source_ids = [source["source_id"] for source in raw_sources]

        imported_source_ids = [row.values["source_id"] for row in self.plan.source_records]
        claim_source_ids = [row.values["source_id"] for row in self.plan.claim_sources]
        location_source_ids = [
            source_id
            for row in self.plan.locations
            for source_id in row.values["source_ids"]
        ]

        self.assertEqual(imported_source_ids, raw_source_ids)
        self.assertEqual(
            claim_source_ids,
            [
                source_id
                for claim in _load(self.town_dir / "claims.json")
                for source_id in claim["source_ids"]
            ],
        )
        self.assertEqual(
            location_source_ids,
            [
                source_id
                for location in _load(self.town_dir / "locations.json")
                for source_id in location["source_ids"]
            ],
        )

    def test_preserves_location_ids(self) -> None:
        raw_location_ids = [
            location["location_id"]
            for location in _load(self.town_dir / "locations.json")
        ]

        imported_location_ids = [
            row.values["location_id"]
            for row in self.plan.locations
        ]
        linked_location_ids = [
            row.values["location_id"]
            for row in self.plan.claim_locations
        ]

        self.assertEqual(imported_location_ids, raw_location_ids)
        self.assertEqual(
            linked_location_ids,
            [
                location_id
                for claim in _load(self.town_dir / "claims.json")
                for location_id in claim["related_location_ids"]
            ],
        )

    def test_preserves_claim_types_and_confidence_labels(self) -> None:
        raw_claims = _load(self.town_dir / "claims.json")
        imported_claims = [row.values for row in self.plan.claims]

        self.assertEqual(
            [(claim["claim_id"], claim["claim_type"], claim["confidence"]) for claim in imported_claims],
            [(claim["claim_id"], claim["claim_type"], claim["confidence"]) for claim in raw_claims],
        )
        self.assertIn("source_based_inference", {claim["claim_type"] for claim in imported_claims})
        self.assertIn("fictional_gameplay", {claim["claim_type"] for claim in imported_claims})

    def test_preserves_mission_links(self) -> None:
        mission = _load(self.town_dir / "mission_seed.json")

        self.assertEqual(
            [row.values["mission_id"] for row in self.plan.mission_seeds],
            [mission["mission_id"]],
        )
        self.assertEqual(
            [row.values["claim_id"] for row in self.plan.mission_claims],
            mission["claim_ids"],
        )
        self.assertEqual(
            [row.values["location_id"] for row in self.plan.mission_locations],
            mission["location_ids"],
        )

    def test_rejects_broken_provenance_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            temp_town = Path(tmp) / "texarkana"
            shutil.copytree(self.town_dir, temp_town)
            claims_path = temp_town / "claims.json"
            claims = _load(claims_path)
            claims[1]["confidence"] = "high"
            claims_path.write_text(json.dumps(claims, indent=2), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "fictional gameplay must use fictional confidence"):
                build_import_plan(temp_town)


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
