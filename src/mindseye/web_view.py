from __future__ import annotations

from html import escape
from typing import Any

from .mission_seed import build_mission_seed_packet
from .models import ClaimRecord, LocationRecord, MindseyeDataError, SourceRecord, TownPackage
from .readiness import build_classroom_readiness_report
from .sanborn import (
    SanbornAssetManifest,
    SanbornSheetManifest,
    build_sanborn_image_intake_report,
    load_sanborn_asset_manifest,
    load_sanborn_sheet_manifest,
)


def build_town_package_view_model(package: TownPackage) -> dict[str, object]:
    """Build the read-only browser view model from existing package APIs."""
    return {
        "package": {
            "package_id": package.package_id,
            "town_name": package.town_name,
            "state_region": package.state_region,
            "status": package.status,
            "time_window": package.time_window,
            "notes": package.notes,
        },
        "sources": [_source_summary(source) for source in package.sources],
        "locations": [_location_summary(location) for location in package.locations],
        "claims": [_claim_summary(claim) for claim in package.claims],
        "mission": build_mission_seed_packet(package),
        "readiness": build_classroom_readiness_report(package),
        "sanborn_manifest": _optional_sanborn_manifest_summary(package),
    }


def render_town_package_page(package: TownPackage) -> str:
    """Render a local, read-only HTML page for the current town package."""
    model = build_town_package_view_model(package)
    package_info = model["package"]
    if not isinstance(package_info, dict):
        raise TypeError("package view model must contain a package dictionary")

    return "\n".join(
        [
            "<!doctype html>",
            '<html lang="en">',
            "<head>",
            '<meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            f"<title>{_text(package_info['town_name'])} - The Mind's Eye</title>",
            _style_block(),
            "</head>",
            "<body>",
            '<header class="topbar">',
            "<div>",
            '<p class="eyebrow">Read-only town package view</p>',
            f"<h1>The Mind's Eye: {_text(package_info['town_name'])} 1885</h1>",
            f"<p>{_text(package_info['state_region'])} - Package {_text(package_info['package_id'])}</p>",
            "</div>",
            f'<span class="status">{_text(package_info["status"])}</span>',
            "</header>",
            '<main class="layout">',
            _overview_section(model),
            _sanborn_manifest_section(model["sanborn_manifest"]),
            _readiness_section(model["readiness"]),
            _mission_section(model["mission"]),
            _claims_section(model["claims"]),
            _sources_section(model["sources"]),
            _locations_section(model["locations"]),
            "</main>",
            "</body>",
            "</html>",
        ]
    )


def _source_summary(source: SourceRecord) -> dict[str, object]:
    return {
        "source_id": source.source_id,
        "title": source.title,
        "source_type": source.source_type,
        "repository": source.repository,
        "url": source.url,
        "citation": source.citation,
        "rights_status": source.rights_status,
        "access_level": source.access_level,
        "notes": source.notes,
    }


def _location_summary(location: LocationRecord) -> dict[str, object]:
    return {
        "location_id": location.location_id,
        "label": location.label,
        "map_id": location.map_id,
        "street": location.street,
        "location_type": location.location_type,
        "certainty": location.certainty,
        "source_ids": list(location.source_ids),
        "notes": location.notes,
    }


def _claim_summary(claim: ClaimRecord) -> dict[str, object]:
    return {
        "claim_id": claim.claim_id,
        "claim_text": claim.claim_text,
        "claim_type": claim.claim_type.value,
        "confidence": claim.confidence.value,
        "source_ids": list(claim.source_ids),
        "related_location_ids": list(claim.related_location_ids),
        "reasoning_note": claim.reasoning_note,
    }


def _optional_sanborn_manifest_summary(package: TownPackage) -> dict[str, object] | None:
    if "source_texarkana_1885_sanborn_loc" not in package.source_ids:
        return None

    try:
        manifest = load_sanborn_sheet_manifest()
    except MindseyeDataError:
        return None
    if manifest.town_package_id != package.package_id:
        return None
    return _sanborn_manifest_summary(manifest)


def _sanborn_manifest_summary(manifest: SanbornSheetManifest) -> dict[str, object]:
    return {
        "manifest_id": manifest.manifest_id,
        "title": manifest.title,
        "source_id": manifest.source_id,
        "map_id": manifest.map_id,
        "loc_item_url": manifest.loc_item_url,
        "loc_gallery_url": manifest.loc_gallery_url,
        "iiif_manifest_status": manifest.iiif_manifest_status,
        "sheet_count": manifest.sheet_count,
        "stitching_status": manifest.stitching_status,
        "location_extraction_status": manifest.location_extraction_status,
        "claim_boundary": manifest.claim_boundary,
        "asset_manifest": _optional_sanborn_asset_manifest_summary(manifest),
        "image_intake": _optional_sanborn_image_intake_summary(manifest),
        "sheets": [
            {
                "sheet_id": sheet.sheet_id,
                "sheet_number": sheet.sheet_number,
                "title": sheet.title,
                "date": sheet.date,
                "loc_resource_url": sheet.loc_resource_url,
                "status": sheet.status,
            }
            for sheet in manifest.sheets
        ],
    }


def _optional_sanborn_asset_manifest_summary(manifest: SanbornSheetManifest) -> dict[str, object] | None:
    try:
        asset_manifest = load_sanborn_asset_manifest()
    except MindseyeDataError:
        return None
    if asset_manifest.sheet_manifest_id != manifest.manifest_id:
        return None
    return _sanborn_asset_manifest_summary(asset_manifest)


def _optional_sanborn_image_intake_summary(manifest: SanbornSheetManifest) -> dict[str, object] | None:
    try:
        intake_report = build_sanborn_image_intake_report()
    except MindseyeDataError:
        return None
    expected_files = intake_report.get("expected_files")
    present_files = intake_report.get("present_files")
    if not isinstance(expected_files, list) or not isinstance(present_files, list):
        return None

    return {
        "cache_dir": str(intake_report["cache_dir"]),
        "cache_is_ignored": bool(intake_report["cache_is_ignored"]),
        "present_file_count": len(present_files),
        "expected_file_count": len(expected_files),
        "missing_sheet_ids": list(intake_report["missing_sheet_ids"]),
        "expected_files": [
            {
                "sheet_id": str(item["sheet_id"]),
                "filename": str(item["filename"]),
            }
            for item in expected_files
            if isinstance(item, dict)
        ],
    }


def _sanborn_asset_manifest_summary(manifest: SanbornAssetManifest) -> dict[str, object]:
    return {
        "asset_manifest_id": manifest.asset_manifest_id,
        "asset_count": manifest.asset_count,
        "binary_files_committed": manifest.binary_files_committed,
        "automated_fetch_status": manifest.automated_fetch_status,
        "large_binary_policy": manifest.large_binary_policy,
        "assets": [
            {
                "asset_record_id": asset.asset_record_id,
                "sheet_id": asset.sheet_id,
                "download_page_url": asset.download_page_url,
                "asset_url_status": asset.asset_url_status,
                "preferred_review_format": asset.preferred_review_format,
                "local_cache_path": asset.local_cache_path,
            }
            for asset in manifest.assets
        ],
    }


def _overview_section(model: dict[str, object]) -> str:
    package_info = model["package"]
    sources = model["sources"]
    locations = model["locations"]
    claims = model["claims"]
    if not isinstance(package_info, dict):
        raise TypeError("package view model must contain a package dictionary")
    if not isinstance(sources, list) or not isinstance(locations, list) or not isinstance(claims, list):
        raise TypeError("town package view model contains invalid list fields")

    return f"""
<section class="band overview" aria-labelledby="overview-title">
  <div>
    <h2 id="overview-title">Town Package Status</h2>
    <p>{_text(package_info.get("notes", ""))}</p>
  </div>
  <dl class="metrics">
    <div><dt>Sources</dt><dd>{len(sources)}</dd></div>
    <div><dt>Locations</dt><dd>{len(locations)}</dd></div>
    <div><dt>Claims</dt><dd>{len(claims)}</dd></div>
  </dl>
</section>"""


def _readiness_section(raw_readiness: object) -> str:
    readiness = _expect_dict(raw_readiness)
    checks = _expect_list(readiness["checks"])
    blockers = _expect_list(readiness["blockers"])
    status_text = "Classroom ready" if readiness["classroom_ready"] else "Needs teacher review"

    return f"""
<section class="band" aria-labelledby="readiness-title">
  <div class="section-heading">
    <p class="eyebrow">Classroom Readiness</p>
    <h2 id="readiness-title">Teacher Review Status</h2>
    <div class="badge-row">
      {_badge(status_text)}
      {_badge(f"{len(blockers)} blocker(s)")}
    </div>
    <p>{_text(readiness["summary"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Current Blockers</h3>
      {_blocker_list(blockers)}
    </article>
    <article class="panel">
      <h3>Readiness Checks</h3>
      {_readiness_check_list(checks)}
    </article>
  </div>
</section>"""


def _sanborn_manifest_section(raw_manifest: object) -> str:
    if raw_manifest is None:
        return ""

    manifest = _expect_dict(raw_manifest)
    sheets = _expect_list(manifest["sheets"])
    boundary = _expect_dict(manifest["claim_boundary"])
    asset_manifest = manifest.get("asset_manifest")
    image_intake = manifest.get("image_intake")
    sheet_rows = []
    for raw_sheet in sheets:
        sheet = _expect_dict(raw_sheet)
        sheet_rows.append(
            f"""
<article class="record">
  <div class="record-title">
    <h3>{_text(sheet["sheet_id"])}</h3>
    <div class="badge-row">
      {_badge(f"sheet {sheet['sheet_number']}")}
      {_badge(sheet["status"])}
    </div>
  </div>
  <p>{_text(sheet["title"])}</p>
  <p><strong>Date:</strong> {_text(sheet["date"])}</p>
  <p><strong>LOC:</strong> <a href="{_attr(sheet["loc_resource_url"])}">{_text(sheet["loc_resource_url"])}</a></p>
</article>"""
        )

    return f"""
<section class="band" aria-labelledby="sanborn-title">
  <div class="section-heading">
    <p class="eyebrow">Sanborn Sheet Manifest</p>
    <h2 id="sanborn-title">LOC Texarkana 1885 Sheets</h2>
    <div class="badge-row">
      {_badge(f"{manifest['sheet_count']} sheets")}
      {_badge(manifest["stitching_status"])}
      {_badge(manifest["location_extraction_status"])}
    </div>
    <p>{_text(manifest["title"])}</p>
    <p><strong>Item:</strong> <a href="{_attr(manifest["loc_item_url"])}">{_text(manifest["loc_item_url"])}</a></p>
    <p><strong>Gallery:</strong> <a href="{_attr(manifest["loc_gallery_url"])}">{_text(manifest["loc_gallery_url"])}</a></p>
    <p class="note">IIIF status: {_text(manifest["iiif_manifest_status"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Boundary</h3>
      {_details_list(boundary)}
    </article>
    <article class="panel">
      <h3>Current Status</h3>
      <p>No stitching, georeferencing, building extraction, derived locations, or derived claims have been created from these sheets yet.</p>
    </article>
  </div>
  {_sanborn_asset_manifest_block(asset_manifest)}
  {_sanborn_image_intake_block(image_intake)}
  <div class="records">{''.join(sheet_rows)}</div>
</section>"""


def _sanborn_asset_manifest_block(raw_asset_manifest: object) -> str:
    if raw_asset_manifest is None:
        return ""

    asset_manifest = _expect_dict(raw_asset_manifest)
    assets = _expect_list(asset_manifest["assets"])
    asset_rows = []
    for raw_asset in assets:
        asset = _expect_dict(raw_asset)
        asset_rows.append(
            f"""
<li>
  <strong>{_text(asset["sheet_id"])}</strong>
  <span>{_text(asset["asset_url_status"])}</span>
</li>"""
        )

    binary_status = "binary files committed" if asset_manifest["binary_files_committed"] else "no binaries committed"
    return f"""
  <div class="panel asset-panel">
    <h3>Sanborn Asset Manifest</h3>
    <div class="badge-row">
      {_badge(f"{asset_manifest['asset_count']} asset records")}
      {_badge(binary_status)}
    </div>
    <p class="note">{_text(asset_manifest["automated_fetch_status"])}</p>
    <p>{_text(asset_manifest["large_binary_policy"])}</p>
    <ul class="check-list">{''.join(asset_rows)}</ul>
  </div>"""


def _sanborn_image_intake_block(raw_image_intake: object) -> str:
    if raw_image_intake is None:
        return ""

    image_intake = _expect_dict(raw_image_intake)
    expected_files = _expect_list(image_intake["expected_files"])
    missing_sheet_ids = _expect_list(image_intake["missing_sheet_ids"])
    expected_rows = []
    for raw_expected in expected_files:
        expected = _expect_dict(raw_expected)
        expected_rows.append(
            f"""
<li>
  <strong>{_text(expected["sheet_id"])}</strong>
  <span>{_text(expected["filename"])}</span>
</li>"""
        )

    missing_text = _joined_ids(missing_sheet_ids)
    ignored_status = "ignored cache path" if image_intake["cache_is_ignored"] else "tracked cache path"
    return f"""
  <div class="panel asset-panel">
    <h3>Sanborn Image Intake</h3>
    <div class="badge-row">
      {_badge(f"{image_intake['present_file_count']} present")}
      {_badge(f"{image_intake['expected_file_count']} expected")}
      {_badge(ignored_status)}
    </div>
    <p><strong>Cache:</strong> {_text(image_intake["cache_dir"])}</p>
    <p><strong>Missing sheet IDs:</strong> {missing_text}</p>
    <ul class="check-list">{''.join(expected_rows)}</ul>
  </div>"""


def _mission_section(raw_mission: object) -> str:
    mission = _expect_dict(raw_mission)
    student_hook = _expect_dict(mission["student_mission_hook"])
    source_notes = _expect_list(mission["teacher_source_notes"])
    labels = _expect_list(student_hook["provenance_labels"])

    return f"""
<section class="band" aria-labelledby="mission-title">
  <div class="section-heading">
    <p class="eyebrow">Mission Seed</p>
    <h2 id="mission-title">{_text(mission["title"])}</h2>
    <p>{_text(mission["teacher_goal"])}</p>
  </div>
  <div class="split">
    <article class="panel">
      <h3>Student Hook</h3>
      <p>{_text(student_hook["text"])}</p>
      <div class="badge-row">{_label_badges(labels)}</div>
    </article>
    <article class="panel">
      <h3>Teacher Notes</h3>
      <p>{_text(mission["teacher_notes"])}</p>
      <p class="readiness">{_text(mission["readiness_reason"])}</p>
    </article>
  </div>
  <div class="records">
    <h3>Teacher Source Notes</h3>
    {_source_note_records(source_notes)}
  </div>
</section>"""


def _claims_section(raw_claims: object) -> str:
    claims = _expect_list(raw_claims)
    records = []
    for raw_claim in claims:
        claim = _expect_dict(raw_claim)
        records.append(
            f"""
<article class="record">
  <div class="record-title">
    <h3>{_text(claim["claim_id"])}</h3>
    <div class="badge-row">
      {_badge(claim["claim_type"])}
      {_badge(claim["confidence"])}
    </div>
  </div>
  <p>{_text(claim["claim_text"])}</p>
  <p><strong>Sources:</strong> {_joined_ids(claim["source_ids"])}</p>
  <p><strong>Locations:</strong> {_joined_ids(claim["related_location_ids"])}</p>
  <p class="note">{_text(claim["reasoning_note"])}</p>
</article>"""
        )
    return f"""
<section class="band" aria-labelledby="claims-title">
  <div class="section-heading">
    <p class="eyebrow">Claims</p>
    <h2 id="claims-title">Provenance-Labeled Claims</h2>
  </div>
  <div class="records">{''.join(records)}</div>
</section>"""


def _sources_section(raw_sources: object) -> str:
    sources = _expect_list(raw_sources)
    records = []
    for raw_source in sources:
        source = _expect_dict(raw_source)
        records.append(
            f"""
<article class="record">
  <div class="record-title">
    <h3>{_text(source["source_id"])}</h3>
    <div class="badge-row">
      {_badge(source["source_type"])}
      {_badge(source["rights_status"])}
      {_badge(source["access_level"])}
    </div>
  </div>
  <p>{_text(source["title"])}</p>
  <p><strong>Repository:</strong> {_text(source["repository"])}</p>
  {_source_link(source)}
  <p class="citation">{_text(source["citation"])}</p>
</article>"""
        )
    return f"""
<section class="band" aria-labelledby="sources-title">
  <div class="section-heading">
    <p class="eyebrow">Sources</p>
    <h2 id="sources-title">Source Records</h2>
  </div>
  <div class="records">{''.join(records)}</div>
</section>"""


def _locations_section(raw_locations: object) -> str:
    locations = _expect_list(raw_locations)
    records = []
    for raw_location in locations:
        location = _expect_dict(raw_location)
        records.append(
            f"""
<article class="record">
  <div class="record-title">
    <h3>{_text(location["location_id"])}</h3>
    <div class="badge-row">
      {_badge(location["location_type"])}
      {_badge(location["certainty"])}
    </div>
  </div>
  <p>{_text(location["label"])}</p>
  <p><strong>Street:</strong> {_text(location["street"])}</p>
  <p><strong>Map:</strong> {_text(location["map_id"])}</p>
  <p><strong>Sources:</strong> {_joined_ids(location["source_ids"])}</p>
  <p class="note">{_text(location["notes"])}</p>
</article>"""
        )
    return f"""
<section class="band" aria-labelledby="locations-title">
  <div class="section-heading">
    <p class="eyebrow">Locations</p>
    <h2 id="locations-title">Map-Linked Locations</h2>
  </div>
  <div class="records">{''.join(records)}</div>
</section>"""


def _source_note_records(source_notes: list[object]) -> str:
    records = []
    for raw_note in source_notes:
        note = _expect_dict(raw_note)
        records.append(
            f"""
<article class="record">
  <div class="record-title">
    <h4>{_text(note["claim_id"])}</h4>
    <div class="badge-row">
      {_badge(note["claim_type"])}
      {_badge(note["confidence"])}
    </div>
  </div>
  <p>{_text(note["claim_text"])}</p>
  <p class="note">{_text(note["reasoning_note"])}</p>
  {_source_citation_list(_expect_list(note["sources"]))}
</article>"""
        )
    return "".join(records)


def _source_citation_list(sources: list[object]) -> str:
    items = []
    for raw_source in sources:
        source = _expect_dict(raw_source)
        items.append(
            f"<li><strong>{_text(source['source_id'])}</strong>: {_text(source['citation'])}</li>"
        )
    return f"<ul class=\"citations\">{''.join(items)}</ul>"


def _blocker_list(blockers: list[object]) -> str:
    if not blockers:
        return '<p class="note">No blockers reported.</p>'

    items = []
    for raw_blocker in blockers:
        blocker = _expect_dict(raw_blocker)
        items.append(
            f"""
<li>
  <strong>{_text(blocker["check_id"])}</strong>
  <p>{_text(blocker["summary"])}</p>
  {_details_list(_expect_dict(blocker["details"]))}
</li>"""
        )
    return '<ul class="check-list">' + "".join(items) + "</ul>"


def _readiness_check_list(checks: list[object]) -> str:
    items = []
    for raw_check in checks:
        check = _expect_dict(raw_check)
        status = "pass" if check["passed"] else "fail"
        items.append(
            f"""
<li>
  <div class="record-title">
    <strong>{_text(check["check_id"])}</strong>
    <span class="badge badge-{_attr(status)}">{_text(status)}</span>
  </div>
  <p>{_text(check["summary"])}</p>
</li>"""
        )
    return '<ul class="check-list">' + "".join(items) + "</ul>"


def _details_list(details: dict[str, object]) -> str:
    rows = []
    for key, value in details.items():
        if isinstance(value, list):
            rendered_value = _joined_ids(value)
        else:
            rendered_value = _text(value)
        if rendered_value == "None":
            continue
        rows.append(f"<li><strong>{_text(key)}:</strong> {rendered_value}</li>")
    if not rows:
        return ""
    return '<ul class="details-list">' + "".join(rows) + "</ul>"


def _label_badges(labels: list[object]) -> str:
    return "".join(
        _badge(f"{_expect_dict(label)['claim_type']} / {_expect_dict(label)['confidence']}")
        for label in labels
    )


def _source_link(source: dict[str, object]) -> str:
    url = str(source.get("url", ""))
    if not url:
        return ""
    return f'<p><strong>URL:</strong> <a href="{_attr(url)}">{_text(url)}</a></p>'


def _joined_ids(values: object) -> str:
    if not isinstance(values, list) or not values:
        return "None"
    return ", ".join(_text(value) for value in values)


def _badge(value: object) -> str:
    label = _text(value)
    css_class = "".join(character if character.isalnum() else "-" for character in label.lower()).strip("-")
    return f'<span class="badge badge-{css_class}">{label}</span>'


def _text(value: object) -> str:
    return escape(str(value), quote=False)


def _attr(value: object) -> str:
    return escape(str(value), quote=True)


def _expect_dict(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError("expected dictionary in town package view model")
    return value


def _expect_list(value: object) -> list[object]:
    if not isinstance(value, list):
        raise TypeError("expected list in town package view model")
    return value


def _style_block() -> str:
    return """<style>
:root {
  color-scheme: light;
  --bg: #f7f8f5;
  --ink: #1f2933;
  --muted: #5d6975;
  --line: #ccd4d8;
  --panel: #ffffff;
  --teal: #0f766e;
  --amber: #b45309;
  --blue: #1d4ed8;
  --red: #b91c1c;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  line-height: 1.45;
}
a { color: var(--blue); overflow-wrap: anywhere; }
.topbar {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding: 28px clamp(18px, 4vw, 56px);
  background: #ffffff;
  border-bottom: 1px solid var(--line);
}
h1, h2, h3, h4, p { margin-top: 0; }
h1 { font-size: 30px; margin-bottom: 8px; }
h2 { font-size: 22px; margin-bottom: 8px; }
h3 { font-size: 16px; margin-bottom: 8px; }
h4 { font-size: 15px; margin-bottom: 8px; }
.eyebrow {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  margin-bottom: 6px;
  text-transform: uppercase;
}
.status {
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--teal);
  font-weight: 700;
  padding: 6px 10px;
  text-transform: uppercase;
}
.layout { display: grid; gap: 18px; padding: 18px clamp(18px, 4vw, 56px) 48px; }
.band {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 18px;
}
.overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(76px, 1fr));
  gap: 10px;
  margin: 0;
}
.metrics div {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px;
  text-align: center;
}
.metrics dt { color: var(--muted); font-size: 12px; }
.metrics dd { font-size: 24px; font-weight: 700; margin: 0; }
.section-heading { max-width: 980px; }
.split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 12px; }
.panel, .record {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
  padding: 14px;
}
.records { display: grid; gap: 12px; margin-top: 14px; }
.record-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.badge-row { display: flex; flex-wrap: wrap; gap: 6px; }
.badge {
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink);
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 7px;
}
.badge-verified-fact, .badge-high, .badge-public-domain { border-color: #8cc5b8; color: var(--teal); }
.badge-source-based-inference, .badge-low, .badge-placeholder { border-color: #e4b46f; color: var(--amber); }
.badge-fictional-gameplay, .badge-fictional { border-color: #f0a5a5; color: var(--red); }
.badge-classroom-ready, .badge-pass { border-color: #8cc5b8; color: var(--teal); }
.badge-needs-teacher-review, .badge-fail, .badge-1-blocker-s { border-color: #f0a5a5; color: var(--red); }
.note, .citation, .readiness { color: var(--muted); }
.citations { margin-bottom: 0; padding-left: 20px; }
.check-list, .details-list { margin-bottom: 0; padding-left: 20px; }
.check-list li + li { margin-top: 10px; }
@media (max-width: 760px) {
  .topbar, .overview, .split { grid-template-columns: 1fr; }
  .topbar { display: grid; }
  .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .record-title { display: grid; }
}
</style>"""
