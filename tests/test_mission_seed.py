from pathlib import Path
import sys
import unittest
from dataclasses import replace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import ClaimType, MindseyeDataError, load_town_package
from mindseye.mission_seed import build_mission_seed_packet, build_teacher_review_packet


class MissionSeedTests(unittest.TestCase):
    def test_teacher_packet_includes_claim_labels_and_locations(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_teacher_review_packet(package)

        self.assertEqual(packet["mission_id"], "mission_texarkana_1885_001")
        self.assertIn("student_hook", packet)
        self.assertIn("teacher_notes", packet)
        self.assertGreaterEqual(len(packet["claims"]), 1)
        self.assertGreaterEqual(len(packet["locations"]), 1)
        self.assertTrue(all("claim_type" in claim for claim in packet["claims"]))

    def test_mission_packet_separates_historical_and_fictional_claims(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_mission_seed_packet(package)

        self.assertEqual(
            [claim["claim_id"] for claim in packet["historical_claims"]],
            ["claim_texarkana_1885_001", "claim_texarkana_1885_003"],
        )
        self.assertEqual(
            [claim["claim_id"] for claim in packet["fictional_claims"]],
            ["claim_texarkana_1885_002"],
        )
        self.assertTrue(
            all(claim["claim_type"] != ClaimType.FICTIONAL_GAMEPLAY.value for claim in packet["historical_claims"])
        )
        self.assertEqual(packet["fictional_claims"][0]["claim_type"], ClaimType.FICTIONAL_GAMEPLAY.value)

    def test_teacher_source_notes_include_citations_for_historical_claims(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_mission_seed_packet(package)

        source_notes = packet["teacher_source_notes"]
        self.assertEqual(
            {note["claim_id"] for note in source_notes},
            {"claim_texarkana_1885_001", "claim_texarkana_1885_003"},
        )
        for note in source_notes:
            self.assertIn(note["claim_type"], {ClaimType.VERIFIED_FACT.value, ClaimType.SOURCE_BASED_INFERENCE.value})
            self.assertGreaterEqual(len(note["sources"]), 1)
            self.assertIn("citation", note["sources"][0])
            self.assertIn("reasoning_note", note)

    def test_student_hook_preserves_visible_provenance_labels(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_mission_seed_packet(package)

        student_hook = packet["student_mission_hook"]
        labels = student_hook["provenance_labels"]

        self.assertEqual(student_hook["text"], package.mission_seed.student_hook)
        self.assertEqual(
            {label["claim_type"] for label in labels},
            {
                ClaimType.VERIFIED_FACT.value,
                ClaimType.SOURCE_BASED_INFERENCE.value,
                ClaimType.FICTIONAL_GAMEPLAY.value,
            },
        )
        self.assertTrue(all("confidence" in label for label in labels))

    def test_placeholder_mission_is_not_classroom_ready_by_default(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_teacher_review_packet(package)

        self.assertFalse(packet["classroom_ready"])
        self.assertIn("Placeholder", packet["readiness_reason"])

    def test_builder_rejects_missing_mission_claim_location_and_source(self):
        package = load_town_package(ROOT, "texarkana")

        with self.subTest("missing claim"):
            mission = replace(package.mission_seed, claim_ids=("claim_texarkana_missing",))
            bad_package = replace(package, mission_seed=mission)
            with self.assertRaisesRegex(MindseyeDataError, "missing claim"):
                build_mission_seed_packet(bad_package)

        with self.subTest("missing location"):
            mission = replace(package.mission_seed, location_ids=("loc_texarkana_missing",))
            bad_package = replace(package, mission_seed=mission)
            with self.assertRaisesRegex(MindseyeDataError, "missing location"):
                build_mission_seed_packet(bad_package)

        with self.subTest("missing source"):
            claim = replace(package.claims[0], source_ids=("source_texarkana_missing",))
            bad_package = replace(package, claims=(claim, *package.claims[1:]))
            with self.assertRaisesRegex(MindseyeDataError, "missing source"):
                build_mission_seed_packet(bad_package)

    def test_unsupported_historical_claim_does_not_appear_unless_mission_links_it(self):
        package = load_town_package(ROOT, "texarkana")
        unsupported_claim = replace(
            package.claims[0],
            claim_id="claim_texarkana_1885_unsupported",
            claim_text="Unsupported historical claim should not appear.",
            source_ids=(),
        )
        package_with_extra_claim = replace(package, claims=(*package.claims, unsupported_claim))

        packet = build_mission_seed_packet(package_with_extra_claim)
        self.assertNotIn("Unsupported historical claim should not appear.", repr(packet))

        mission_with_unsupported_claim = replace(
            package.mission_seed,
            claim_ids=(*package.mission_seed.claim_ids, unsupported_claim.claim_id),
        )
        bad_package = replace(package_with_extra_claim, mission_seed=mission_with_unsupported_claim)
        with self.assertRaisesRegex(MindseyeDataError, "needs at least one source"):
            build_mission_seed_packet(bad_package)


if __name__ == "__main__":
    unittest.main()
