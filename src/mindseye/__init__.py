"""Core package for The Mind's Eye prototype.

The early code intentionally stays small. It provides stable module
boundaries for Codex and future agents without pretending the full product
is already implemented.
"""

from .game_loop import MissionRun
from .instructional_alignment import (
    InstructionalAlignmentManifest,
    InstructionalAlignmentRecord,
    load_instructional_alignment_manifest,
)
from .map_engine import MapEngine
from .map_rendering import build_map_rendering_packet
from .standards_alignment import build_standards_alignment_packet
from .teacher_interface import build_teacher_interface_packet
from .mission_seed import build_mission_seed_packet, build_teacher_review_packet
from .building_data import (
    BuildingManifest,
    BuildingRecord,
    VerificationSuggestionManifest,
    VerificationSuggestionRecord,
    load_building_manifest,
    load_verification_suggestion_manifest,
)
from .teacher_review import (
    TeacherReviewItem,
    TeacherReviewManifest,
    build_teacher_approval_packet,
    load_teacher_review_manifest,
)
from .models import (
    ClaimRecord,
    ClaimType,
    Confidence,
    LocationRecord,
    MindseyeDataError,
    MissionSeed,
    SourceRecord,
    TownPackage,
)
from .sanborn import (
    SanbornAssetManifest,
    SanbornAssetRecord,
    SanbornImageIntakeFile,
    SanbornImageMetadataManifest,
    SanbornImageMetadataRecord,
    SanbornSheetManifest,
    SanbornSheetReviewManifest,
    SanbornSheetReviewRecord,
    SanbornSheetRecord,
    SanbornStitchingLinkRecord,
    SanbornStitchingManifest,
    SanbornStitchingSheetPlan,
    build_sanborn_image_intake_report,
    build_sanborn_image_metadata_manifest,
    load_sanborn_asset_manifest,
    load_sanborn_image_metadata_manifest,
    load_sanborn_sheet_manifest,
    load_sanborn_sheet_review_manifest,
    load_sanborn_stitching_manifest,
)
from .town_loader import load_town_package
from .accessibility import build_accessibility_support_packet
from .privacy import build_privacy_baseline_packet
from .readiness import build_classroom_readiness_report
from .assessment_evidence import build_assessment_evidence_packet
from .student_mission import build_student_mission_flow_packet
from .web_view import build_town_package_view_model, render_town_package_page

__all__ = [
    "ClaimType",
    "Confidence",
    "MindseyeDataError",
    "BuildingManifest",
    "BuildingRecord",
    "InstructionalAlignmentManifest",
    "InstructionalAlignmentRecord",
    "TeacherReviewItem",
    "TeacherReviewManifest",
    "SourceRecord",
    "LocationRecord",
    "ClaimRecord",
    "MissionSeed",
    "SanbornAssetManifest",
    "SanbornAssetRecord",
    "SanbornImageIntakeFile",
    "SanbornImageMetadataManifest",
    "SanbornImageMetadataRecord",
    "SanbornSheetManifest",
    "SanbornSheetReviewManifest",
    "SanbornSheetReviewRecord",
    "SanbornSheetRecord",
    "SanbornStitchingLinkRecord",
    "SanbornStitchingManifest",
    "SanbornStitchingSheetPlan",
    "VerificationSuggestionManifest",
    "VerificationSuggestionRecord",
    "TownPackage",
    "MapEngine",
    "build_map_rendering_packet",
    "build_accessibility_support_packet",
    "build_privacy_baseline_packet",
    "build_standards_alignment_packet",
    "build_teacher_interface_packet",
    "MissionRun",
    "build_classroom_readiness_report",
    "build_assessment_evidence_packet",
    "build_student_mission_flow_packet",
    "build_teacher_approval_packet",
    "load_instructional_alignment_manifest",
    "build_mission_seed_packet",
    "build_sanborn_image_intake_report",
    "build_sanborn_image_metadata_manifest",
    "build_teacher_review_packet",
    "build_town_package_view_model",
    "load_building_manifest",
    "load_sanborn_asset_manifest",
    "load_sanborn_image_metadata_manifest",
    "load_sanborn_sheet_manifest",
    "load_sanborn_sheet_review_manifest",
    "load_sanborn_stitching_manifest",
    "load_town_package",
    "load_teacher_review_manifest",
    "load_verification_suggestion_manifest",
    "render_town_package_page",
]
