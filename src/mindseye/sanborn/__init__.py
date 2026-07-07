from __future__ import annotations

"""Sanborn compatibility package.

This package keeps the legacy :mod:`mindseye.sanborn` loader API available
while adding prep-only stitching and georeferencing helpers in dedicated
modules.
"""

from importlib import util as importlib_util
from pathlib import Path
import sys
from types import ModuleType

_LEGACY_MODULE_NAME = "mindseye._legacy_sanborn"
_LEGACY_EXPORTS = (
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
    "build_sanborn_image_intake_report",
    "build_sanborn_image_metadata_manifest",
    "load_sanborn_asset_manifest",
    "load_sanborn_image_metadata_manifest",
    "load_sanborn_sheet_manifest",
    "load_sanborn_sheet_review_manifest",
    "load_sanborn_stitching_manifest",
)


def _load_legacy_module() -> ModuleType:
    legacy_module = sys.modules.get(_LEGACY_MODULE_NAME)
    if legacy_module is not None:
        return legacy_module

    legacy_path = Path(__file__).resolve().parents[1] / "sanborn.py"
    spec = importlib_util.spec_from_file_location(_LEGACY_MODULE_NAME, legacy_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"unable to load legacy Sanborn module from {legacy_path}")

    module = importlib_util.module_from_spec(spec)
    sys.modules[_LEGACY_MODULE_NAME] = module
    spec.loader.exec_module(module)
    return module


_legacy = _load_legacy_module()
for _name in _LEGACY_EXPORTS:
    globals()[_name] = getattr(_legacy, _name)

from .georeference import (  # noqa: E402
    build_sanborn_georeference_workspace,
    load_sanborn_control_point_manifest,
    load_sanborn_layer_stack_manifest,
    load_sanborn_sheet_transform_manifest,
)
from .stitching import build_sanborn_composite_manifest  # noqa: E402

__all__ = list(_LEGACY_EXPORTS) + [
    "build_sanborn_composite_manifest",
    "build_sanborn_georeference_workspace",
    "load_sanborn_control_point_manifest",
    "load_sanborn_layer_stack_manifest",
    "load_sanborn_sheet_transform_manifest",
]
