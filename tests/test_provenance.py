from pathlib import Path
import sys
import unittest
from dataclasses import replace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import ClaimType, MindseyeDataError, load_town_package
from mindseye.provenance import (
    claims_by_type,
    claims_for_mission,
    has_unsupported_historical_claims,
    locations_for_mission,
    lookup_claim,
    lookup_location,
    lookup_mission_seed,
    lookup_source,
    mission_citation_trail,
    mission_map_trail,
    teacher_claim_summary,
)


class ProvenanceTests(unittest.TestCase):
    def test_nonfiction_claims_have_source_support(self):
        package = load_town_package(ROOT, "texarkana")

        self.assertFalse(has_unsupported_historical_claims(package.claims))

    def test_teacher_summary_preserves_claim_labels(self):
        package = load_town_package(ROOT, "texarkana")
        summary = teacher_claim_summary(package.claims)

        self.assertEqual(len(summary), len(package.claims))
        self.assertTrue(all("claim_type" in item for item in summary))
        self.assertTrue(any(item["claim_type"] == ClaimType.FICTIONAL_GAMEPLAY.value for item in summary))

    def test_claims_can_be_grouped_by_type(self):
        package = load_town_package(ROOT, "texarkana")
        grouped = claims_by_type(package.claims)

        self.assertIn(ClaimType.SOURCE_BASED_INFERENCE, grouped)
        self.assertIn(ClaimType.FICTIONAL_GAMEPLAY, grouped)

    def test_lookup_helpers_resolve_package_records(self):
        package = load_town_package(ROOT, "texarkana")

        self.assertEqual(lookup_source(package, "source_texarkana_1885_sanborn_loc").source_type, "sanborn_map")
        self.assertEqual(lookup_location(package, "loc_texarkana_1885_001").label, "Example livery stable location")
        self.assertEqual(lookup_claim(package, "claim_texarkana_1885_001").claim_type, ClaimType.SOURCE_BASED_INFERENCE)
        self.assertEqual(lookup_mission_seed(package, "mission_texarkana_1885_001").title, "The Ledger on Fifth Street")

    def test_mission_helpers_resolve_claims_and_locations(self):
        package = load_town_package(ROOT, "texarkana")

        claims = claims_for_mission(package, "mission_texarkana_1885_001")
        locations = locations_for_mission(package, "mission_texarkana_1885_001")

        self.assertEqual([claim.claim_id for claim in claims], list(package.mission_seed.claim_ids))
        self.assertEqual([location.location_id for location in locations], list(package.mission_seed.location_ids))

    def test_mission_citation_trail_preserves_labels_and_sources(self):
        package = load_town_package(ROOT, "texarkana")
        trail = mission_citation_trail(package, "mission_texarkana_1885_001")

        first_claim = trail[0]
        self.assertEqual(first_claim["claim_id"], "claim_texarkana_1885_001")
        self.assertEqual(first_claim["claim_type"], "source_based_inference")
        self.assertEqual(first_claim["confidence"], "low")
        self.assertEqual(first_claim["source_ids"], ["source_texarkana_1885_sanborn_loc"])
        self.assertEqual(first_claim["sources"][0]["source_id"], "source_texarkana_1885_sanborn_loc")

    def test_mission_map_trail_resolves_claim_locations(self):
        package = load_town_package(ROOT, "texarkana")
        trail = mission_map_trail(package, "mission_texarkana_1885_001")

        first_claim = trail[0]
        self.assertEqual(first_claim["claim_id"], "claim_texarkana_1885_001")
        self.assertEqual(first_claim["location_ids"], ["loc_texarkana_1885_001"])
        self.assertEqual(first_claim["locations"][0]["label"], "Example livery stable location")

    def test_missing_mission_claim_fails_clearly(self):
        package = load_town_package(ROOT, "texarkana")
        mission = replace(package.mission_seed, claim_ids=("claim_texarkana_missing",))
        bad_package = replace(package, mission_seed=mission)

        with self.assertRaisesRegex(MindseyeDataError, "missing claim"):
            claims_for_mission(bad_package, mission.mission_id)

    def test_missing_claim_source_fails_clearly(self):
        package = load_town_package(ROOT, "texarkana")
        claim = replace(package.claims[0], source_ids=("source_texarkana_missing",))
        bad_package = replace(package, claims=(claim, *package.claims[1:]))

        with self.assertRaisesRegex(MindseyeDataError, "missing source"):
            mission_citation_trail(bad_package, package.mission_seed.mission_id)

    def test_unsupported_historical_claim_fails_clearly(self):
        package = load_town_package(ROOT, "texarkana")
        claim = replace(package.claims[0], source_ids=())
        bad_package = replace(package, claims=(claim, *package.claims[1:]))

        with self.assertRaisesRegex(MindseyeDataError, "needs at least one source"):
            mission_citation_trail(bad_package, package.mission_seed.mission_id)

    def test_missing_claim_location_fails_clearly(self):
        package = load_town_package(ROOT, "texarkana")
        claim = replace(package.claims[0], related_location_ids=("loc_texarkana_missing",))
        bad_package = replace(package, claims=(claim, *package.claims[1:]))

        with self.assertRaisesRegex(MindseyeDataError, "missing location"):
            mission_map_trail(bad_package, package.mission_seed.mission_id)


if __name__ == "__main__":
    unittest.main()
