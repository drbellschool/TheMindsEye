from dataclasses import replace
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import MindseyeDataError, build_classroom_readiness_report, load_town_package


class ClassroomReadinessTests(unittest.TestCase):
    def test_report_returns_structured_checks_for_texarkana_mission(self):
        package = load_town_package(ROOT, "texarkana")
        report = build_classroom_readiness_report(package)

        self.assertEqual(report["mission_id"], "mission_texarkana_1885_001")
        self.assertEqual(report["town_package_id"], "texarkana_1885")
        self.assertFalse(report["classroom_ready"])
        self.assertGreaterEqual(len(report["checks"]), 1)
        self.assertTrue(all("check_id" in check for check in report["checks"]))
        self.assertTrue(all("passed" in check for check in report["checks"]))
        self.assertTrue(all("summary" in check for check in report["checks"]))

    def test_placeholder_locations_are_teacher_review_blockers(self):
        package = load_town_package(ROOT, "texarkana")
        report = build_classroom_readiness_report(package)
        checks = {check["check_id"]: check for check in report["checks"]}

        placeholder_check = checks["placeholder_locations"]
        self.assertFalse(placeholder_check["passed"])
        self.assertIn("loc_texarkana_1885_001", placeholder_check["details"]["placeholder_location_ids"])
        self.assertIn(placeholder_check, report["blockers"])

    def test_source_notes_provenance_labels_and_fictional_separation_pass(self):
        package = load_town_package(ROOT, "texarkana")
        report = build_classroom_readiness_report(package)
        checks = {check["check_id"]: check for check in report["checks"]}

        self.assertTrue(checks["historical_source_notes"]["passed"])
        self.assertTrue(checks["provenance_labels_visible"]["passed"])
        self.assertTrue(checks["fictional_gameplay_separated"]["passed"])

    def test_missing_citation_fails_historical_source_notes_check(self):
        package = load_town_package(ROOT, "texarkana")
        source_without_citation = replace(package.sources[0], citation="")
        bad_package = replace(package, sources=(source_without_citation, *package.sources[1:]))

        report = build_classroom_readiness_report(bad_package)
        checks = {check["check_id"]: check for check in report["checks"]}

        source_notes_check = checks["historical_source_notes"]
        self.assertFalse(source_notes_check["passed"])
        self.assertIn("claim_texarkana_1885_001", source_notes_check["details"]["missing_citation_claim_ids"])
        self.assertIn(source_notes_check, report["blockers"])

    def test_unsupported_historical_claim_fails_closed(self):
        package = load_town_package(ROOT, "texarkana")
        unsupported_claim = replace(package.claims[0], source_ids=())
        bad_package = replace(package, claims=(unsupported_claim, *package.claims[1:]))

        with self.assertRaisesRegex(MindseyeDataError, "needs at least one source"):
            build_classroom_readiness_report(bad_package)


if __name__ == "__main__":
    unittest.main()
