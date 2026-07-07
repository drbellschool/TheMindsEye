from __future__ import annotations

import json
import re
from html import escape
from pathlib import Path
from typing import Any

from .building_data import load_building_manifest
from .community_dashboard import build_community_dashboard_packet
from .community_review import build_community_review_packet
from .map_auditor import build_map_auditor_packet
from .map_rendering import build_map_rendering_packet
from .models import ClaimType, MindseyeDataError, TownPackage
from .people_auditor import build_people_auditor_packet
from .teacher_review import build_teacher_approval_packet

COMMUNITY_ROUTE_ORDER = (
    "community-dashboard",
    "map-auditor",
    "building-auditor",
    "people-auditor",
    "source-provenance-inspector",
    "release-gate-report",
)

COMMUNITY_ROUTE_META: dict[str, dict[str, str]] = {
    "community-dashboard": {
        "title": "Community Dashboard",
        "subtitle": "Community Verification Console",
        "summary": "Town review control room, release gate, and route launcher.",
    },
    "map-auditor": {
        "title": "Map Auditor",
        "subtitle": "Sanborn stitching and georeference workbench",
        "summary": "Sheet review, layer separation, and map handoff tooling.",
    },
    "building-auditor": {
        "title": "Building Auditor",
        "subtitle": "Footprint, identity, and art review",
        "summary": "Review extracted labels, reviewed anchors, and transparent art layers.",
    },
    "people-auditor": {
        "title": "People Auditor",
        "subtitle": "Person and business identity review",
        "summary": "Track issue adapters, identities, and provenance trails separately.",
    },
    "source-provenance-inspector": {
        "title": "Source / Provenance Inspector",
        "subtitle": "Evidence drill-down and citation hub",
        "summary": "Inspect source records, linked claims, and rights metadata in one place.",
    },
    "release-gate-report": {
        "title": "Release Gate Report",
        "subtitle": "Community handoff decision",
        "summary": "Explain what still blocks release and what is ready to move forward.",
    },
}

STYLE_BLOCK = """
<style>
:root {
  --shell-bg: #120e0a;
  --shell-bg-2: #1b140f;
  --shell-bg-3: #241a13;
  --paper: #efe0bd;
  --paper-2: #e1cfaa;
  --paper-ink: #211913;
  --paper-muted: #6c583f;
  --ink: #e8d8b7;
  --ink-soft: #d5bf97;
  --brass: #c59a48;
  --brass-deep: #8c6427;
  --brass-light: #e4c06e;
  --green: #789f5c;
  --amber: #c58d33;
  --red: #a35a47;
  --blue: #6c8faf;
  --shadow: rgba(0, 0, 0, 0.35);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  min-height: 100%;
  background:
    radial-gradient(circle at top left, rgba(194, 153, 76, 0.16), transparent 28%),
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.08), transparent 24%),
    linear-gradient(180deg, #0d0907 0%, var(--shell-bg) 55%, #0d0907 100%);
}

body {
  margin: 0;
  color: var(--paper-ink);
  font-family: Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, serif;
  background:
    radial-gradient(circle at 18% 8%, rgba(214, 175, 93, 0.12), transparent 25%),
    radial-gradient(circle at 80% 12%, rgba(255, 255, 255, 0.08), transparent 22%),
    linear-gradient(180deg, #14100c 0%, #19130f 46%, #100c09 100%);
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
    radial-gradient(circle, rgba(255, 255, 255, 0.06) 0.75px, transparent 0.75px);
  background-size: 180px 180px, 180px 180px, 24px 24px;
  opacity: 0.24;
  mix-blend-mode: soft-light;
}

a {
  color: inherit;
}

button,
input,
textarea,
select {
  font: inherit;
}

.page-shell {
  position: relative;
  min-height: 100vh;
  padding: 20px;
}

.masthead,
.panel,
.route-card,
.footer {
  position: relative;
  overflow: hidden;
}

.masthead {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  border: 1px solid rgba(199, 157, 72, 0.9);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(47, 36, 27, 0.98), rgba(22, 16, 11, 0.98));
  box-shadow:
    0 20px 44px var(--shadow),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  padding: 20px;
}

.masthead::before,
.panel::before,
.route-card::before,
.footer::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    repeating-linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.03) 0,
      rgba(255, 255, 255, 0.03) 1px,
      transparent 1px,
      transparent 11px
    );
  opacity: 0.28;
}

.masthead__brand h1 {
  margin: 0.2rem 0 0.45rem;
  color: #f7e9c9;
  font-size: clamp(2.1rem, 4vw, 3.4rem);
  line-height: 1.02;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.38);
}

.eyebrow {
  margin: 0;
  color: #d9b565;
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.masthead__meta,
.masthead__note,
.masthead__route,
.panel__subtitle,
.footer {
  color: var(--ink-soft);
}

.masthead__meta,
.masthead__note {
  margin: 0.3rem 0 0;
  max-width: 72ch;
}

.masthead__route {
  margin: 0.2rem 0 0;
  color: #f2d99a;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.78rem;
}

.masthead__stats {
  min-width: min(520px, 100%);
  display: grid;
  gap: 12px;
}

.summary-strip,
.chip-row,
.legend,
.route-strip,
.metrics-grid,
.grid,
.list,
.timeline,
.blocker-list,
.review-grid,
.action-row,
.source-browser,
.source-links {
  display: grid;
  gap: 10px;
}

.summary-strip {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  margin-top: 14px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 9px 12px;
  border: 1px solid rgba(186, 145, 70, 0.55);
  background: rgba(255, 255, 255, 0.34);
  font-size: 0.88rem;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.chip__label {
  font-size: 0.66rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.75;
}

.chip__value {
  font-weight: 700;
}

.chip.state-ready,
.badge.state-ready,
.tag.state-ready {
  background: rgba(96, 137, 69, 0.18);
  border-color: rgba(126, 170, 88, 0.55);
  color: #2f5532;
}

.chip.state-reviewing,
.badge.state-reviewing,
.tag.state-reviewing,
.chip.state-partial,
.badge.state-partial,
.tag.state-partial {
  background: rgba(197, 141, 51, 0.16);
  border-color: rgba(197, 141, 51, 0.55);
  color: #7a4f12;
}

.chip.state-blocked,
.badge.state-blocked,
.tag.state-blocked,
.chip.state-rejected,
.badge.state-rejected,
.tag.state-rejected {
  background: rgba(163, 90, 71, 0.16);
  border-color: rgba(163, 90, 71, 0.6);
  color: #7a2f1d;
}

.chip.state-guarded,
.badge.state-guarded,
.tag.state-guarded {
  background: rgba(201, 159, 72, 0.17);
  border-color: rgba(201, 159, 72, 0.6);
  color: #7c5412;
}

.chip.state-deferred,
.badge.state-deferred,
.tag.state-deferred,
.chip.state-draft,
.badge.state-draft,
.tag.state-draft {
  background: rgba(108, 143, 175, 0.15);
  border-color: rgba(108, 143, 175, 0.55);
  color: #34526f;
}

.chip.state-unknown,
.badge.state-unknown,
.tag.state-unknown {
  background: rgba(80, 68, 53, 0.16);
  border-color: rgba(96, 79, 57, 0.45);
  color: #55452f;
}

.badge,
.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 6px 10px;
  border: 1px solid rgba(186, 145, 70, 0.45);
  background: rgba(255, 255, 255, 0.28);
  font-size: 0.82rem;
  white-space: nowrap;
}

.tag strong,
.badge strong {
  font-weight: 700;
}

.route-strip {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin: 14px 0 18px;
}

.route-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 148px;
  padding: 14px;
  text-decoration: none;
  color: var(--paper-ink);
  border-radius: 20px;
  border: 1px solid rgba(184, 146, 76, 0.85);
  background:
    linear-gradient(180deg, rgba(245, 234, 204, 0.98), rgba(228, 211, 176, 0.98));
  box-shadow:
    0 15px 30px rgba(0, 0, 0, 0.24),
    inset 0 0 0 1px rgba(255, 255, 255, 0.24);
}

.route-card:hover {
  transform: translateY(-1px);
  box-shadow:
    0 18px 34px rgba(0, 0, 0, 0.28),
    inset 0 0 0 1px rgba(255, 255, 255, 0.28);
}

.route-card.is-active {
  border-color: rgba(236, 201, 113, 0.98);
  box-shadow:
    0 18px 36px rgba(0, 0, 0, 0.28),
    0 0 0 1px rgba(236, 201, 113, 0.5) inset,
    0 0 28px rgba(236, 201, 113, 0.14);
}

.route-card__label {
  color: var(--brass-deep);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.68rem;
}

.route-card__title {
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.2;
}

.route-card__desc,
.route-card__stat {
  margin: 0;
  color: #604a35;
  line-height: 1.38;
  font-size: 0.9rem;
}

.route-card__stat {
  margin-top: auto;
}

.route-card__stat strong {
  color: var(--paper-ink);
}

.panel {
  border-radius: 22px;
  border: 1px solid rgba(183, 143, 69, 0.9);
  background:
    linear-gradient(180deg, rgba(245, 233, 205, 0.98), rgba(226, 209, 172, 0.98));
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.24),
    inset 0 0 0 1px rgba(255, 255, 255, 0.18);
}

.panel--dark {
  color: #f6e8c6;
  background:
    linear-gradient(180deg, rgba(44, 31, 23, 0.98), rgba(24, 17, 12, 0.98));
  border-color: rgba(199, 157, 72, 0.8);
}

.panel__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 18px 10px;
}

.panel__head h2 {
  margin: 0;
  font-size: 1.08rem;
}

.panel__subtitle {
  margin: 0.28rem 0 0;
  font-size: 0.92rem;
}

.panel__body {
  position: relative;
  padding: 0 18px 18px;
}

.panel__footer {
  position: relative;
  padding: 0 18px 16px;
  color: var(--paper-muted);
  font-size: 0.92rem;
}

.panel--dark .panel__subtitle,
.panel--dark .panel__footer,
.panel--dark .muted,
.panel--dark .small,
.panel--dark .text-muted {
  color: #d8c4a4;
}

.panel--dark .panel__head h2 {
  color: #f7e8c7;
}

.panel::before,
.route-card::before,
.footer::before {
  opacity: 0.22;
}

.metrics-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: 18px;
  padding: 14px;
  border: 1px solid rgba(144, 111, 60, 0.35);
  background: rgba(255, 255, 255, 0.36);
}

.metric__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.metric__label {
  color: var(--brass-deep);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.68rem;
}

.metric__value {
  margin-top: 0.15rem;
  font-size: 1.3rem;
  font-weight: 700;
}

.metric__detail {
  margin: 0;
  font-size: 0.9rem;
  color: var(--paper-muted);
}

.progress {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: rgba(56, 39, 24, 0.12);
  overflow: hidden;
}

.progress__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--brass-deep), var(--brass-light));
}

.progress__fill.state-ready {
  background: linear-gradient(90deg, #739d57, #a8cc78);
}

.progress__fill.state-blocked {
  background: linear-gradient(90deg, #8c4f40, #be7a66);
}

.progress__fill.state-guarded {
  background: linear-gradient(90deg, #c0882b, #d7b061);
}

.progress__fill.state-deferred,
.progress__fill.state-unknown {
  background: linear-gradient(90deg, #69839c, #9fb8cc);
}

.stack {
  display: grid;
  gap: 14px;
}

.grid {
  gap: 14px;
}

.grid--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.grid--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.grid--4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.dashboard-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.9fr);
  gap: 14px;
  align-items: start;
}

.map-layout {
  display: grid;
  grid-template-columns: minmax(240px, 0.82fr) minmax(0, 1.4fr) minmax(300px, 0.88fr);
  gap: 14px;
  align-items: start;
}

.people-layout {
  display: grid;
  grid-template-columns: minmax(240px, 0.86fr) minmax(0, 1.08fr) minmax(0, 1.08fr);
  gap: 14px;
  align-items: start;
}

.source-layout {
  display: grid;
  grid-template-columns: minmax(240px, 0.82fr) minmax(0, 1.2fr) minmax(280px, 0.86fr);
  gap: 14px;
  align-items: start;
}

.release-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 14px;
  align-items: start;
}

@media (max-width: 1200px) {
  .route-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1040px) {
  .masthead,
  .dashboard-layout,
  .map-layout,
  .people-layout,
  .source-layout,
  .release-layout,
  .metrics-grid,
  .grid--2,
  .grid--3,
  .grid--4 {
    grid-template-columns: 1fr;
  }

  .masthead {
    flex-direction: column;
  }

  .masthead__stats {
    min-width: 100%;
  }
}

@media (max-width: 760px) {
  .page-shell {
    padding: 14px;
  }

  .route-strip {
    grid-template-columns: 1fr;
  }
}

.list,
.legend,
.blocker-list,
.timeline,
.review-grid,
.source-browser,
.source-links {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list__item,
.legend__item,
.blocker-item,
.timeline__item,
.review-grid__item,
.source-browser__item,
.source-links__item {
  border-radius: 16px;
  border: 1px solid rgba(140, 100, 39, 0.22);
  background: rgba(255, 255, 255, 0.24);
  padding: 12px 14px;
}

.timeline__item {
  border-left: 4px solid rgba(201, 159, 72, 0.6);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  text-align: left;
  vertical-align: top;
  padding: 9px 8px;
  border-bottom: 1px solid rgba(104, 78, 48, 0.18);
}

.table th {
  color: var(--brass-deep);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.69rem;
}

.small {
  font-size: 0.88rem;
}

.muted {
  color: var(--paper-muted);
}

.source-browser {
  gap: 12px;
}

.source-browser__item.is-selected,
.source-links__item.is-selected {
  border-color: rgba(201, 159, 72, 0.8);
  box-shadow: 0 0 0 1px rgba(201, 159, 72, 0.18) inset;
}

.source-card__title,
.review-card__title {
  margin: 0 0 0.35rem;
  font-size: 1.02rem;
}

.source-card__meta,
.review-card__meta,
.source-card__notes {
  margin: 0;
  color: var(--paper-muted);
  font-size: 0.9rem;
  line-height: 1.4;
}

.source-card__row,
.review-card__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.workspace-frame,
.canvas,
.preview-frame {
  border-radius: 20px;
  border: 1px solid rgba(184, 146, 76, 0.72);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  overflow: hidden;
}

.workspace-frame {
  background:
    linear-gradient(180deg, rgba(246, 235, 208, 0.98), rgba(225, 208, 171, 0.98));
  min-height: 470px;
}

.canvas {
  min-height: 500px;
  background:
    linear-gradient(180deg, rgba(101, 80, 53, 0.98), rgba(58, 43, 30, 0.98));
}

.canvas__sheet {
  position: absolute;
  inset: 14px;
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(245, 233, 206, 0.98), rgba(229, 210, 177, 0.98));
  overflow: hidden;
  border: 1px solid rgba(129, 96, 55, 0.72);
}

.canvas__sheet::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.12), transparent 18%),
    radial-gradient(circle at 72% 68%, rgba(0, 0, 0, 0.12), transparent 18%);
  background-size: 48px 48px, 48px 48px, 100% 100%, 100% 100%;
  opacity: 0.42;
}

.canvas__label {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 0;
}

.canvas__label h3 {
  margin: 0;
  font-size: 1.05rem;
}

.canvas__label p {
  margin: 0.25rem 0 0;
  color: var(--paper-muted);
}

.canvas__surface {
  position: relative;
  z-index: 1;
  margin: 16px 18px 18px;
  min-height: 380px;
  border-radius: 18px;
  border: 1px solid rgba(120, 88, 51, 0.4);
  background:
    radial-gradient(circle at 12% 20%, rgba(194, 153, 76, 0.18), transparent 18%),
    radial-gradient(circle at 74% 42%, rgba(110, 141, 160, 0.18), transparent 22%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0));
}

.canvas__layer-stack {
  position: absolute;
  right: 16px;
  top: 16px;
  display: grid;
  gap: 8px;
  width: min(290px, 42%);
}

.canvas__layer {
  border-radius: 14px;
  padding: 11px 12px;
  border: 1px solid rgba(122, 91, 54, 0.28);
  background: rgba(255, 255, 255, 0.4);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.09);
}

.canvas__layer strong {
  display: block;
  margin-bottom: 3px;
}

.transparent-preview {
  min-height: 220px;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.35) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.35) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.35) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.35) 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
}

.footnote {
  margin: 0;
  font-size: 0.86rem;
  color: var(--paper-muted);
}

.footer {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid rgba(184, 146, 76, 0.62);
  background: rgba(20, 16, 12, 0.82);
  color: #e8d9bb;
}

.footer__row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  align-items: center;
}

.footer__row p {
  margin: 0;
}

.footer a {
  color: #f5dfab;
}

.action-row {
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  justify-content: start;
  align-items: center;
  flex-wrap: wrap;
}

.action-link,
.action-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 999px;
  border: 1px solid rgba(184, 146, 76, 0.62);
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.3);
  text-decoration: none;
  color: inherit;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
}

.action-link.is-primary,
.action-pill.is-primary {
  background: linear-gradient(180deg, rgba(231, 194, 108, 0.52), rgba(209, 160, 70, 0.45));
}

.action-link.is-danger,
.action-pill.is-danger {
  background: rgba(163, 90, 71, 0.18);
  color: #7a2f1d;
}

.text-block {
  margin: 0;
  line-height: 1.55;
}

.key-value {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 10px 12px;
}

.key-value__label {
  color: var(--brass-deep);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.67rem;
}

.key-value__value {
  margin: 0;
}
</style>
"""


def render_community_route_page(
    package: TownPackage,
    route: str = "community-dashboard",
    town_slug: str = "texarkana",
    repo_root: Path | None = None,
    state_root: Path | None = None,
) -> str:
    route = _normalize_route(route)
    if route not in COMMUNITY_ROUTE_META:
        raise MindseyeDataError(f"unsupported community route: {route}")

    repo_root = repo_root or Path(__file__).resolve().parents[2]
    context = build_community_ui_context(package, town_slug=town_slug, repo_root=repo_root, state_root=state_root)
    body = _render_route_body(route, context)
    return _render_document(route, context, body)


def build_community_ui_context(
    package: TownPackage,
    town_slug: str = "texarkana",
    repo_root: Path | None = None,
    state_root: Path | None = None,
) -> dict[str, Any]:
    repo_root = repo_root or Path(__file__).resolve().parents[2]
    if state_root is None:
        state_root = repo_root / "data" / "towns" / town_slug / "local_cache" / "review_state"

    demo = _load_demo_ui_model(repo_root)
    community_packet = _safe_build(
        lambda: build_community_dashboard_packet(
            package,
            repo_root=repo_root,
            town_slug=town_slug,
            state_root=state_root,
        )
    )
    map_packet = _safe_build(
        lambda: build_map_auditor_packet(
            package,
            repo_root=repo_root,
            town_slug=town_slug,
            state_root=state_root,
        )
    )
    people_packet = _safe_build(
        lambda: build_people_auditor_packet(
            package,
            repo_root=repo_root,
            town_slug=town_slug,
            state_root=state_root,
        )
    )
    community_review = _safe_build(
        lambda: build_community_review_packet(
            package,
            repo_root=repo_root,
            town_slug=town_slug,
            state_root=state_root,
        )
    )
    map_rendering = _safe_build(
        lambda: build_map_rendering_packet(
            package,
            repo_root=repo_root,
            town_slug=town_slug,
            state_root=state_root,
        )
    )
    building_manifest = _safe_build(lambda: load_building_manifest(repo_root, town_slug, state_root=state_root))
    teacher_review = _safe_build(lambda: build_teacher_approval_packet(package, repo_root=repo_root, town_slug=town_slug))

    context: dict[str, Any] = {
        "package": package,
        "town_slug": town_slug,
        "repo_root": repo_root,
        "state_root": state_root,
        "demo": demo,
        "community_packet": community_packet,
        "map_packet": map_packet,
        "people_packet": people_packet,
        "community_review": community_review,
        "map_rendering": map_rendering,
        "building_manifest": building_manifest,
        "teacher_review": teacher_review,
        "selected_source": _selected_source(package),
    }
    context["selected_source_issue"] = _selected_source_issue(context)
    context["release_gate"] = _derive_release_gate(context)
    return context


def _render_route_body(route: str, context: dict[str, Any]) -> str:
    if route == "community-dashboard":
        return _render_community_dashboard(context)
    if route == "map-auditor":
        return _render_map_auditor(context)
    if route == "building-auditor":
        return _render_building_auditor(context)
    if route == "people-auditor":
        return _render_people_auditor(context)
    if route == "source-provenance-inspector":
        return _render_source_inspector(context)
    if route == "release-gate-report":
        return _render_release_gate(context)
    raise MindseyeDataError(f"unsupported community route: {route}")


def _render_document(route: str, context: dict[str, Any], body: str) -> str:
    package = context["package"]
    meta = COMMUNITY_ROUTE_META[route]
    town_name = _s(package.town_name)
    state_region = _s(package.state_region)
    package_id = _s(package.package_id)
    map_year = _route_map_year(context)
    return "\n".join(
        [
            "<!doctype html>",
            '<html lang="en">',
            "<head>",
            '<meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            f"<title>{town_name} {meta['title']} - The Mind's Eye</title>",
            STYLE_BLOCK,
            "</head>",
            f'<body class="route-{route}">',
            '<div class="page-shell">',
            _render_masthead(route, context),
            _render_route_strip(route, context),
            f'<main class="route-body route-body--{route}">',
            body,
            "</main>",
            _render_footer(route, context),
            "</div>",
            "</body>",
            "</html>",
        ]
    )


def _render_masthead(route: str, context: dict[str, Any]) -> str:
    package = context["package"]
    meta = COMMUNITY_ROUTE_META[route]
    community_packet = context.get("community_packet") or {}
    demo = context.get("demo") or {}
    demo_shared = demo.get("shared") if isinstance(demo.get("shared"), dict) else {}
    year_gate = community_packet.get("year_gate") if isinstance(community_packet, dict) else {}
    map_year = year_gate.get("map_year") if isinstance(year_gate, dict) else _route_map_year(context)
    summary = COMMUNITY_ROUTE_META[route]["summary"]
    release_gate = context.get("release_gate") or {}
    release_state = str(release_gate.get("state") or demo_shared.get("release_state") or "unknown")
    blocker_count = len(release_gate.get("blockers", [])) if isinstance(release_gate, dict) else 0
    status_counts = _community_status_counts(context)
    return "\n".join(
        [
            '<header class="masthead">',
            '<div class="masthead__brand">',
            '<p class="eyebrow">Community-first review shell</p>',
            f'<h1>{_s(package.town_name)} 1885</h1>',
            f'<p class="masthead__route">{_s(meta["title"])} · {_s(meta["subtitle"])}</p>',
            f'<p class="masthead__meta">{_s(package.state_region)} · Package {_s(package.package_id)} · Sanborn year {map_year}</p>',
            f'<p class="masthead__note">{_s(summary)}</p>',
            "</div>",
            '<div class="masthead__stats">',
            _render_chip_row(
                [
                    {"label": "Release", "value": release_state, "state": release_state},
                    {"label": "Blockers", "value": blocker_count, "state": "blocked" if blocker_count else "ready"},
                    {"label": "Sources", "value": status_counts["sources"], "state": "ready"},
                    {"label": "Sheets", "value": status_counts["sheets"], "state": "reviewing"},
                    {"label": "Buildings", "value": status_counts["buildings"], "state": "partial"},
                    {"label": "People / Businesses", "value": status_counts["people_businesses"], "state": "reviewing"},
                ]
            ),
            _render_progress_card(
                "Town progress",
                f"{status_counts['overall_percent']}%",
                f"Community review is {status_counts['overall_percent']}% complete across the current packets.",
                status_counts["overall_percent"],
                "reviewing",
            ),
            "</div>",
            "</header>",
        ]
    )


def _render_route_strip(active_route: str, context: dict[str, Any]) -> str:
    cards = []
    for route_id in COMMUNITY_ROUTE_ORDER:
        cards.append(_render_route_card(route_id, context, active=(route_id == active_route)))
    return '<nav class="route-strip" aria-label="Community routes">' + "".join(cards) + "</nav>"


def _render_footer(route: str, context: dict[str, Any]) -> str:
    package = context["package"]
    release_gate = context.get("release_gate") or {}
    community_packet = context.get("community_packet") or {}
    demo = context.get("demo") or {}
    demo_shared = demo.get("shared") if isinstance(demo.get("shared"), dict) else {}
    return "\n".join(
        [
            '<footer class="footer">',
            '<div class="footer__row">',
            f'<p><strong>{_s(package.town_name)}</strong> · route <strong>{_s(route)}</strong> · package {_s(package.package_id)}</p>',
            f'<p>{_s(release_gate.get("state", demo_shared.get("release_state", "unknown")))} · {_s(community_packet.get("notes", ""))}</p>',
            "</div>",
            '<div class="footer__row" style="margin-top:10px">',
            f'<p>Legacy debug view: <a href="/{_s(context["town_slug"])}/debug">/{_s(context["town_slug"])}/debug</a></p>',
            f'<p>Community routes remain route-based: <a href="/{_s(context["town_slug"])}/community-dashboard">community dashboard</a>.</p>',
            "</div>",
            "</footer>",
        ]
    )


def _render_route_card(route_id: str, context: dict[str, Any], active: bool = False) -> str:
    model = _route_card_model(route_id, context, active=active)
    active_class = " is-active" if active else ""
    return "\n".join(
        [
            f'<a class="route-card{active_class}" href="{_s(model["href"])}"{" aria-current=\"page\"" if active else ""}>',
            f'<div class="route-card__label">{_s(model["label"])}</div>',
            f'<h3 class="route-card__title">{_s(model["title"])}</h3>',
            f'<p class="route-card__desc">{_s(model["summary"])}</p>',
            f'<p class="route-card__stat"><strong>{_s(model["stat"])}</strong>{(" · " + _s(model["detail"])) if model["detail"] else ""}</p>',
            "</a>",
        ]
    )


def _route_card_model(route_id: str, context: dict[str, Any], active: bool = False) -> dict[str, str]:
    package = context["package"]
    community_packet = context.get("community_packet") or {}
    map_packet = context.get("map_packet") or {}
    people_packet = context.get("people_packet") or {}
    community_review = context.get("community_review") or {}
    map_rendering = context.get("map_rendering") or {}
    release_gate = context.get("release_gate") or {}
    if route_id == "community-dashboard":
        progress = _community_progress(context)
        return {
            "href": _route_href(context["town_slug"], route_id),
            "label": "Community",
            "title": COMMUNITY_ROUTE_META[route_id]["title"],
            "summary": COMMUNITY_ROUTE_META[route_id]["summary"],
            "stat": f"{progress}%",
            "detail": "town review progress",
        }
    if route_id == "map-auditor":
        sheet_count = len(map_packet.get("sheet_selector", [])) if isinstance(map_packet, dict) else 0
        return {
            "href": _route_href(context["town_slug"], route_id),
            "label": "Map",
            "title": COMMUNITY_ROUTE_META[route_id]["title"],
            "summary": COMMUNITY_ROUTE_META[route_id]["summary"],
            "stat": f"{sheet_count} sheets",
            "detail": str((map_rendering.get("base_map_layer", {}) or {}).get("stitching_status", "pending")),
        }
    if route_id == "building-auditor":
        building_manifest = context.get("building_manifest")
        building_count = building_manifest.record_count if building_manifest is not None else 0
        reviewed_count = 0
        if building_manifest is not None:
            reviewed_count = sum(1 for building in building_manifest.buildings if building.identity_status in {"reviewed", "approved"})
        return {
            "href": _route_href(context["town_slug"], route_id),
            "label": "Buildings",
            "title": COMMUNITY_ROUTE_META[route_id]["title"],
            "summary": COMMUNITY_ROUTE_META[route_id]["summary"],
            "stat": f"{reviewed_count}/{building_count}" if building_count else "0/0",
            "detail": "identity review",
        }
    if route_id == "people-auditor":
        people_count = len(people_packet.get("people_review", []))
        business_count = len(people_packet.get("businesses_review", []))
        return {
            "href": _route_href(context["town_slug"], route_id),
            "label": "People",
            "title": COMMUNITY_ROUTE_META[route_id]["title"],
            "summary": COMMUNITY_ROUTE_META[route_id]["summary"],
            "stat": f"{people_count}/{business_count}" if people_count or business_count else "0/0",
            "detail": "records in queue",
        }
    if route_id == "source-provenance-inspector":
        return {
            "href": _route_href(context["town_slug"], route_id),
            "label": "Sources",
            "title": COMMUNITY_ROUTE_META[route_id]["title"],
            "summary": COMMUNITY_ROUTE_META[route_id]["summary"],
            "stat": f"{len(package.sources)} sources",
            "detail": f"{len((community_review.get('source_issues') or []))} issue adapters",
        }
    if route_id == "release-gate-report":
        blockers = release_gate.get("blockers", [])
        return {
            "href": _route_href(context["town_slug"], route_id),
            "label": "Gate",
            "title": COMMUNITY_ROUTE_META[route_id]["title"],
            "summary": COMMUNITY_ROUTE_META[route_id]["summary"],
            "stat": str(release_gate.get("state", "blocked")),
            "detail": f"{len(blockers)} blocker(s)",
        }
    raise MindseyeDataError(f"unsupported route card: {route_id}")


def _render_progress_card(label: str, value: str, detail: str, percent: int, state: str) -> str:
    return "\n".join(
        [
            '<section class="metric">',
            '<div class="metric__top">',
            f'<div><div class="metric__label">{_s(label)}</div><div class="metric__value">{_s(value)}</div></div>',
            f'<span class="badge state-{_state_class(state)}">{_s(state)}</span>',
            "</div>",
            f'<p class="metric__detail">{_s(detail)}</p>',
            f'<div class="progress" role="progressbar" aria-valuenow="{int(percent)}" aria-valuemin="0" aria-valuemax="100"><div class="progress__fill state-{_state_class(state)}" style="width:{max(0, min(100, int(percent)))}%"></div></div>',
            "</section>",
        ]
    )


def _render_chip_row(chips: list[dict[str, Any]]) -> str:
    items = []
    for chip in chips:
        items.append(
            "\n".join(
                [
                    f'<span class="chip state-{_state_class(chip.get("state", ""))}">',
                    f'<span class="chip__label">{_s(chip.get("label", ""))}</span>',
                    f'<span class="chip__value">{_s(chip.get("value", ""))}</span>',
                    "</span>",
                ]
            )
        )
    return '<div class="chip-row">' + "".join(items) + "</div>"


def _render_panel(title: str, body: str, subtitle: str = "", classes: str = "", footer: str = "", header_actions: str = "") -> str:
    panel_classes = "panel"
    if classes:
        panel_classes += f" {classes}"
    return "\n".join(
        [
            f'<section class="{panel_classes}">',
            '<div class="panel__head">',
            "<div>",
            f"<h2>{_s(title)}</h2>",
            f'<p class="panel__subtitle">{_s(subtitle)}</p>' if subtitle else "",
            "</div>",
            header_actions,
            "</div>",
            f'<div class="panel__body">{body}</div>',
            f'<div class="panel__footer">{footer}</div>' if footer else "",
            "</section>",
        ]
    )


def _render_kv_rows(rows: list[tuple[str, Any]]) -> str:
    body = []
    for label, value in rows:
        body.append(
            "\n".join(
                [
                    '<div class="key-value">',
                    f'<div class="key-value__label">{_s(label)}</div>',
                    f'<p class="key-value__value">{_s(value)}</p>',
                    "</div>",
                ]
            )
        )
    return '<div class="grid grid--2">' + "".join(body) + "</div>"


def _render_list(items: list[str], class_name: str = "list") -> str:
    if not items:
        return '<p class="small muted">No items available yet.</p>'
    return '<ul class="' + class_name + '">' + "".join(f'<li class="{class_name}__item">{item}</li>' for item in items) + "</ul>"


def _render_table(headers: list[str], rows: list[list[str]], class_name: str = "table") -> str:
    head_html = "".join(f"<th>{_s(header)}</th>" for header in headers)
    row_html = []
    for row in rows:
        row_html.append("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>")
    return f'<table class="{class_name}"><thead><tr>{head_html}</tr></thead><tbody>{"".join(row_html)}</tbody></table>'


def _render_timeline(items: list[dict[str, Any]]) -> str:
    if not items:
        return '<p class="small muted">No review history yet.</p>'
    rows = []
    for item in items:
        rows.append(
            "\n".join(
                [
                    '<li class="timeline__item">',
                    f'<p class="source-card__title">{_s(item.get("label", ""))}</p>',
                    f'<div class="source-card__row"><span class="tag state-{_state_class(item.get("status", ""))}">{_s(item.get("status", ""))}</span></div>',
                    f'<p class="source-card__notes">{_s(item.get("notes", ""))}</p>',
                    "</li>",
                ]
            )
        )
    return '<ol class="timeline">' + "".join(rows) + "</ol>"


def _render_community_dashboard(context: dict[str, Any]) -> str:
    community_packet = context.get("community_packet") or {}
    community_review = context.get("community_review") or {}
    map_rendering = context.get("map_rendering") or {}
    demo = context.get("demo") or {}
    demo_route = demo.get("routes", {}).get("community-dashboard", {}) if isinstance(demo.get("routes"), dict) else {}
    year_gate = community_packet.get("year_gate", {})
    status_chips = community_packet.get("status_chips", [])
    review_domains = community_packet.get("review_domains", [])
    review_history = community_packet.get("review_history", [])
    evidence_inspector = community_packet.get("evidence_inspector", {})
    release_gate = context.get("release_gate", {})
    route_cards = context.get("route_cards", [])
    unresolved = _community_unresolved_summary(context)
    left = []
    left.append(
        _render_panel(
            "Year Gate",
            _render_kv_rows(
                [
                    ("Map year", year_gate.get("map_year", _route_map_year(context))),
                    ("Start year", year_gate.get("start_year", "")),
                    ("End year", year_gate.get("end_year", "")),
                    ("Span", f"{year_gate.get('total_span_years', 20)} years"),
                ]
            )
            + f'<p class="footnote">{_s(year_gate.get("rule", ""))}</p>',
            subtitle="Keep evidence inside the 20-year review window around the Sanborn map year.",
            classes="panel--paper",
        )
    )
    left.append(
        _render_panel(
            "Review Status Overview",
            _render_chip_row(
                [
                    {"label": item.get("label", ""), "value": item.get("value", ""), "state": item.get("state", "")}
                    for item in status_chips
                ]
            )
            + _render_metrics_grid(context),
            subtitle="Counts and progress remain tied to live packet data.",
        )
    )
    left.append(
        _render_panel(
            "Scope Ladder",
            _render_scope_ladder(community_packet.get("scope_ladder", [])),
            subtitle="Community is active now; county and state roll-ups stay planned.",
        )
    )
    left.append(
        _render_panel(
            "Primary Routes",
            _render_route_cards_grid(context, active_route="community-dashboard"),
            subtitle="Route cards should feel like entry points, not dead-end summaries.",
        )
    )
    left.append(
        _render_panel(
            "Review Domains",
            _render_domain_cards(review_domains),
            subtitle="Buildings, people, businesses, roads, labels, claims, and source lanes stay separate.",
        )
    )
    left.append(
        _render_panel(
            "Unresolved Summary",
            _render_summary_list(unresolved),
            subtitle=demo_route.get("empty_summary", ""),
            classes="panel--paper",
        )
    )
    left.append(
        _render_panel(
            "Quick Actions",
            _render_action_links(
                [
                    ("Run data quality check", _route_href(context["town_slug"], "release-gate-report"), "is-primary"),
                    ("Bulk link source issues", _route_href(context["town_slug"], "people-auditor"), ""),
                    ("Export review report", _route_href(context["town_slug"], "release-gate-report"), ""),
                    ("View audit log", _route_href(context["town_slug"], "source-provenance-inspector"), ""),
                ]
            ),
            subtitle="Some actions are routes first; the shell should still feel operational.",
        )
    )

    right = []
    right.append(
        _render_panel(
            "Evidence Inspector",
            _render_evidence_focus(evidence_inspector, context),
            subtitle="Show the selected historical anchor and its evidence trail.",
            classes="panel--dark",
        )
    )
    right.append(
        _render_panel(
            "Release Gate",
            _render_release_gate_summary(release_gate, context),
            subtitle="The product is not ready for classroom release until the gate clears.",
            classes="panel--dark",
        )
    )
    right.append(
        _render_panel(
            "Review History",
            _render_timeline(review_history + _render_community_review_timeline(context)),
            subtitle="History should show how the packets were loaded and what remains blocked.",
            classes="panel--paper",
        )
    )
    right.append(
        _render_panel(
            "Diagnostics & Safeguards",
            _render_diagnostics(context, extra_note=demo_route.get("hero_note", "")),
            subtitle="Community shell diagnostics are intended for review, not student play.",
            classes="panel--dark",
        )
    )

    return '<section class="dashboard-layout"><div class="stack">' + "".join(left) + '</div><div class="stack">' + "".join(right) + "</div></section>"


def _render_map_auditor(context: dict[str, Any]) -> str:
    map_packet = context.get("map_packet") or {}
    map_rendering = context.get("map_rendering") or {}
    demo = context.get("demo") or {}
    demo_route = demo.get("routes", {}).get("map-auditor", {}) if isinstance(demo.get("routes"), dict) else {}
    selected_sheet = map_packet.get("selected_sheet") or {}
    selected_building = map_packet.get("selected_building") or {}
    stitch_workspace = map_packet.get("stitch_workspace") or {}
    layer_stack = map_packet.get("layer_stack", [])
    coverage_grid = map_packet.get("coverage_grid", [])
    review_history = map_packet.get("review_history", [])
    unresolved = map_packet.get("unresolved_summary", [])

    left = [
        _render_panel(
            "Sheet Browser",
            _render_sheet_browser(map_packet.get("sheet_selector", [])),
            subtitle="Choose a Sanborn sheet and keep the stitching order visible.",
        ),
        _render_panel(
            "Coverage Grid",
            _render_coverage_grid(coverage_grid),
            subtitle="Sheets should read as individually reviewed, not flattened into one image.",
        ),
    ]

    center = [
        _render_panel(
            "Stitched Map Workspace",
            _render_map_canvas(map_packet, map_rendering),
            subtitle="This is the map layer shell, not the final renderer.",
            classes="panel--paper",
        ),
        _render_panel(
            "Design Tools",
            _render_tool_stack(map_packet.get("design_tools", [])),
            subtitle="Road, rail, and terrain graphics remain separate from the scan.",
        ),
        _render_panel(
            "Selected Sheet",
            _render_selected_sheet(selected_sheet, stitch_workspace),
            subtitle="Show the anchor sheet and the work still deferred.",
        ),
        _render_panel(
            "Selected Building",
            _render_selected_building(selected_building),
            subtitle="Building anchors stay distinct from art and from the base scan.",
        ),
        _render_panel(
            "Art Preview",
            _render_art_preview(map_packet.get("art_preview", {}), demo_route),
            subtitle="Transparent art is a separate layer and must keep its provenance visible.",
            classes="panel--paper",
        ),
        _render_panel(
            "Interior Notes",
            _render_interior_notes(map_packet.get("interior_notes", {})),
            subtitle="The building auditor can carry use notes without forcing them into the map.",
        ),
    ]

    right = [
        _render_panel(
            "Georeference Panel",
            _render_georef_panel(stitch_workspace, demo_route),
            subtitle="Control points are not fabricated when they are missing.",
            classes="panel--dark",
        ),
        _render_panel(
            "Layer Stack",
            _render_layer_stack(layer_stack),
            subtitle="Keep base map, road/rail, footprint, art, labels, markers, and provenance distinct.",
        ),
        _render_panel(
            "Provenance Trail",
            _render_provenance_trail(map_packet.get("provenance_trail", {})),
            subtitle="Review the source trail before promoting any map-linked building work.",
            classes="panel--dark",
        ),
        _render_panel(
            "Review Legend",
            _render_review_legend(map_packet.get("review_legend", [])),
            subtitle="Verified, inferred, illustrative, unknown, and rejected must remain distinguishable.",
        ),
        _render_panel(
            "Quick Actions",
            _render_action_links(
                [
                    ("Back to Community", _route_href(context["town_slug"], "community-dashboard"), "is-primary"),
                    ("Open Building Auditor", _route_href(context["town_slug"], "building-auditor"), ""),
                    ("Open People Auditor", _route_href(context["town_slug"], "people-auditor"), ""),
                    ("Open Release Gate", _route_href(context["town_slug"], "release-gate-report"), ""),
                ]
            ),
            subtitle="The map auditor is upstream of the other community routes.",
        ),
    ]

    bottom = _render_panel(
        "Coverage / Audit / Export",
        _render_bottom_summary(
            [
                ("Sheet coverage", f"{len(coverage_grid)} reviewed"),
                ("Road / Rail", str((map_rendering.get("road_rail_layer", {}) or {}).get("status", "deferred"))),
                ("Footprints", str((map_rendering.get("building_footprint_layer", {}) or {}).get("status", "deferred"))),
                ("Art layer", str((map_rendering.get("building_art_layer", {}) or {}).get("status", "deferred"))),
            ]
        )
        + _render_list([f"{item.get('label', '')}: {item.get('count', '')}" for item in unresolved]),
        subtitle=demo_route.get("workspace_note", ""),
        classes="panel--dark",
    )

    return (
        '<section class="map-layout">'
        + '<div class="stack">'
        + "".join(left)
        + "</div><div class=\"stack\">"
        + "".join(center)
        + "</div><div class=\"stack\">"
        + "".join(right)
        + "</div></section>"
        + bottom
    )


def _render_building_auditor(context: dict[str, Any]) -> str:
    building_manifest = context.get("building_manifest")
    map_packet = context.get("map_packet") or {}
    map_rendering = context.get("map_rendering") or {}
    community_review = context.get("community_review") or {}
    demo = context.get("demo") or {}
    demo_route = demo.get("routes", {}).get("building-auditor", {}) if isinstance(demo.get("routes"), dict) else {}
    selected_building = map_packet.get("selected_building") or {}
    building_art = map_rendering.get("building_art_layer", {})
    footprint_layer = map_rendering.get("building_footprint_layer", {})
    source_issue = _selected_source_issue(context)
    if source_issue is None and community_review.get("source_issues"):
        source_issue = community_review["source_issues"][0]

    left = [
        _render_panel(
            "Extracted Text Review",
            _render_building_text_block(selected_building),
            subtitle="The text block should show the reviewed label separately from the art preview.",
        ),
        _render_panel(
            "Footprint Review",
            _render_footprint_review(selected_building, footprint_layer, demo_route),
            subtitle="Footprints remain separate from art and remain visibly deferred until extracted.",
        ),
        _render_panel(
            "Art Preview",
            _render_building_art_preview(building_art, selected_building),
            subtitle="Transparent-background art should stack into the footprint, not float on its own.",
            classes="panel--paper",
        ),
    ]

    right = [
        _render_panel(
            "Source / Provenance Trail",
            _render_building_provenance(selected_building, source_issue, context),
            subtitle="Show where the label came from before any visual detail is accepted.",
            classes="panel--dark",
        ),
        _render_panel(
            "People / Business Links",
            _render_building_links(context),
            subtitle="Related people or business records stay visible but separate from the building record.",
        ),
        _render_panel(
            "Review Actions",
            _render_action_links(
                [
                    ("Verified fact", "#", "is-primary"),
                    ("Source-based inference", "#", ""),
                    ("Illustrative only", "#", ""),
                    ("Reject", "#", "is-danger"),
                ]
            ),
            subtitle="The shell can show the review decisions without pretending the pipeline is fully wired.",
        ),
        _render_panel(
            "History / Unresolved",
            _render_timeline(map_packet.get("review_history", []))
            + _render_summary_list(map_packet.get("unresolved_summary", [])),
            subtitle=demo_route.get("footprint_note", ""),
            classes="panel--paper",
        ),
    ]

    center = [
        _render_panel(
            "Building Context",
            _render_kv_rows(
                [
                    ("Building ID", selected_building.get("building_id", "")),
                    ("Reviewed label", selected_building.get("reviewed_label", "")),
                    ("Student-safe name", selected_building.get("student_safe_name", "")),
                    ("Location anchor", selected_building.get("location_id", "")),
                    ("Review record", selected_building.get("review_record_id", "")),
                    ("Sheet reference", selected_building.get("sheet_id", "")),
                    ("Identity status", selected_building.get("identity_status", "")),
                    ("Visual detail", selected_building.get("visual_detail_status", "")),
                    ("Historical function", selected_building.get("historical_function", "")),
                    ("Default render", selected_building.get("default_render_mode", "")),
                ]
            )
            + f'<p class="footnote">{_s(selected_building.get("notes", ""))}</p>',
            subtitle="The reviewed building record anchors footprint and art work.",
        ),
        _render_panel(
            "Layer Contract",
            _render_layer_contract(map_rendering, selected_building),
            subtitle="The building view should keep the same layer separation contract as the map.",
        ),
        _render_panel(
            "Map Link",
            _render_map_link(selected_building, map_rendering),
            subtitle="This reminds the builder which sheet and map layer the building came from.",
            classes="panel--dark",
        ),
    ]

    return '<section class="dashboard-layout"><div class="stack">' + "".join(left) + '</div><div class="stack">' + "".join(center) + '</div><div class="stack">' + "".join(right) + "</div></section>"


def _render_people_auditor(context: dict[str, Any]) -> str:
    people_packet = context.get("people_packet") or {}
    demo = context.get("demo") or {}
    demo_route = demo.get("routes", {}).get("people-auditor", {}) if isinstance(demo.get("routes"), dict) else {}
    source_browser = people_packet.get("source_issue_browser", [])
    selected_issue = people_packet.get("selected_issue") or {}
    selected_person = people_packet.get("selected_person") or {}
    selected_business = people_packet.get("selected_business") or {}
    legend = people_packet.get("review_legend", [])
    unresolved = people_packet.get("unresolved_summary", [])
    history = people_packet.get("review_history", [])

    left = [
        _render_panel(
            "Source Issue Browser",
            _render_source_issue_browser(source_browser, selected_issue),
            subtitle=demo_route.get("issue_note", ""),
        ),
    ]
    center = [
        _render_panel(
            "Person Review Workspace",
            _render_person_workspace(selected_person, people_packet),
            subtitle="People stay distinct from businesses, even when the same issue names both.",
            classes="panel--paper",
        ),
    ]
    right = [
        _render_panel(
            "Business Review Workspace",
            _render_business_workspace(selected_business, people_packet),
            subtitle="Businesses can carry location and price clues without collapsing into people records.",
            classes="panel--dark",
        ),
    ]
    bottom = [
        _render_panel(
            "Provenance Legend",
            _render_review_legend(legend),
            subtitle="Verified, inferred, illustrative, unknown, and rejected must stay visible.",
        ),
        _render_panel(
            "Review History",
            _render_timeline(history),
            subtitle="The shell should make the source adapter history obvious.",
            classes="panel--paper",
        ),
        _render_panel(
            "Unresolved Summary",
            _render_summary_list(unresolved),
            subtitle="Unresolved records should remain visible until a reviewer resolves them.",
        ),
        _render_panel(
            "Quick Actions",
            _render_action_links(
                [
                    ("Back to Community", _route_href(context["town_slug"], "community-dashboard"), "is-primary"),
                    ("Open Map Auditor", _route_href(context["town_slug"], "map-auditor"), ""),
                    ("Open Building Auditor", _route_href(context["town_slug"], "building-auditor"), ""),
                    ("Open Release Gate", _route_href(context["town_slug"], "release-gate-report"), ""),
                ]
            ),
            subtitle="Quick actions keep the community shell navigable even before full workflows are wired.",
            classes="panel--dark",
        ),
    ]

    return (
        '<section class="people-layout">'
        + '<div class="stack">'
        + "".join(left)
        + "</div><div class=\"stack\">"
        + "".join(center)
        + "</div><div class=\"stack\">"
        + "".join(right)
        + "</div></section>"
        + '<section class="stack" style="margin-top:14px">'
        + "".join(bottom)
        + "</section>"
    )


def _render_source_inspector(context: dict[str, Any]) -> str:
    package = context["package"]
    community_review = context.get("community_review") or {}
    selected_source = context.get("selected_source")
    selected_issue = context.get("selected_source_issue") or {}
    source_issue = selected_issue if isinstance(selected_issue, dict) else {}
    demo = context.get("demo") or {}
    demo_route = demo.get("routes", {}).get("source-provenance-inspector", {}) if isinstance(demo.get("routes"), dict) else {}
    source_cards = []
    for source in package.sources:
        selected = selected_source is not None and source.source_id == selected_source.source_id
        source_cards.append(_render_source_browser_item(source, selected=selected))

    linked_claims = [claim for claim in package.claims if selected_source is not None and selected_source.source_id in claim.source_ids]
    linked_locations = [location for location in package.locations if selected_source is not None and selected_source.source_id in location.source_ids]
    linked_people = [
        record for record in community_review.get("people", []) if source_issue and record.get("source_issue_id") == source_issue.get("source_issue_id")
    ]
    linked_businesses = [
        record for record in community_review.get("businesses", []) if source_issue and record.get("source_issue_id") == source_issue.get("source_issue_id")
    ]

    left = [
        _render_panel(
            "Source Filter / Browser",
            '<div class="source-browser">' + "".join(source_cards) + "</div>",
            subtitle="Select the raw source record first, then inspect the linked records.",
        ),
    ]
    center = [
        _render_panel(
            "Source Metadata",
            _render_source_metadata(selected_source),
            subtitle="Raw source metadata stays separate from the derived issue adapter.",
            classes="panel--paper",
        ),
        _render_panel(
            "Issue / Page / OCR",
            _render_source_issue_panel(source_issue, linked_people, linked_businesses, demo_route),
            subtitle="OCR is an aid; the source record and citation remain canonical.",
        ),
        _render_panel(
            "Linked Normalized Records",
            _render_linked_record_summary(linked_claims, linked_locations, linked_people, linked_businesses),
            subtitle="Buildings, people, businesses, and claims should remain inspectable from one source page.",
        ),
    ]
    right = [
        _render_panel(
            "Citation and Rights",
            _render_source_rights(selected_source),
            subtitle="Rights and access notes should be visible before any promotion.",
            classes="panel--dark",
        ),
        _render_panel(
            "Provenance Trail",
            _render_source_provenance_trail(selected_source, source_issue, linked_claims),
            subtitle="Source to issue to claim trails should remain easy to read.",
        ),
        _render_panel(
            "Review Notes",
            _render_source_review_notes(selected_source, source_issue, demo_route),
            subtitle="Use this route to document what still needs human confirmation.",
            classes="panel--paper",
        ),
    ]

    return '<section class="source-layout">' + '<div class="stack">' + "".join(left) + '</div><div class="stack">' + "".join(center) + '</div><div class="stack">' + "".join(right) + "</div></section>"


def _render_release_gate(context: dict[str, Any]) -> str:
    release_gate = context.get("release_gate") or {}
    community_packet = context.get("community_packet") or {}
    map_rendering = context.get("map_rendering") or {}
    people_packet = context.get("people_packet") or {}
    building_manifest = context.get("building_manifest")
    teacher_review = context.get("teacher_review") or {}
    demo = context.get("demo") or {}
    demo_route = demo.get("routes", {}).get("release-gate-report", {}) if isinstance(demo.get("routes"), dict) else {}
    blockers = release_gate.get("blockers", [])
    readiness_matrix = _release_readiness_matrix(context)
    unresolved = _render_release_unresolved(context)
    source_warnings = _render_source_warnings(context)

    left = [
        _render_panel(
            "Release State",
            _render_release_banner(release_gate, teacher_review, demo_route),
            subtitle="Community handoff should remain explicit about what is blocking release.",
            classes="panel--dark",
        ),
        _render_panel(
            "Blocker Summary",
            _render_blockers(blockers, demo_route),
            subtitle="Blocks must remain readable enough for a human reviewer to clear them.",
        ),
        _render_panel(
            "Readiness Matrix",
            _render_readiness_matrix(readiness_matrix),
            subtitle="This is the visible contract for deciding whether the town may move forward.",
        ),
    ]
    right = [
        _render_panel(
            "Unresolved Counts",
            _render_summary_list(unresolved),
            subtitle="Track the remaining review work by domain.",
            classes="panel--paper",
        ),
        _render_panel(
            "Source Rights / Provenance Warnings",
            _render_list(source_warnings, class_name="blocker-list"),
            subtitle="Unknown rights or access issues should be seen before release is approved.",
        ),
        _render_panel(
            "Recent Review History",
            _render_timeline(community_packet.get("review_history", []) + people_packet.get("review_history", [])),
            subtitle="Recent history should explain how the release state changed.",
            classes="panel--paper",
        ),
        _render_panel(
            "Export Controls",
            _render_action_links(
                [
                    ("Back to Community", _route_href(context["town_slug"], "community-dashboard"), "is-primary"),
                    ("Open Source Inspector", _route_href(context["town_slug"], "source-provenance-inspector"), ""),
                    ("Open Map Auditor", _route_href(context["town_slug"], "map-auditor"), ""),
                    ("Open People Auditor", _route_href(context["town_slug"], "people-auditor"), ""),
                ]
            )
            + f'<p class="footnote">{_s(demo_route.get("blocker_note", ""))}</p>',
            subtitle=demo_route.get("export_note", ""),
            classes="panel--dark",
        ),
    ]

    return '<section class="release-layout">' + '<div class="stack">' + "".join(left) + '</div><div class="stack">' + "".join(right) + "</div></section>"


def _render_metrics_grid(context: dict[str, Any]) -> str:
    community_packet = context.get("community_packet") or {}
    map_packet = context.get("map_packet") or {}
    people_packet = context.get("people_packet") or {}
    community_review = context.get("community_review") or {}
    overall_percent = _community_progress(context)
    map_progress = map_packet.get("progress_summary", {}) if isinstance(map_packet, dict) else {}
    people_progress = people_packet.get("progress_summary", {}) if isinstance(people_packet, dict) else {}
    metrics = [
        ("Overall", overall_percent, "review completion", overall_percent, "reviewing"),
        (
            "Sheets",
            map_progress.get("sheet_percent", 0),
            f"{map_progress.get('sheet_reviewed', 0)}/{map_progress.get('sheet_total', 0)} sheets",
            map_progress.get("sheet_percent", 0),
            "ready",
        ),
        (
            "Buildings",
            map_progress.get("building_percent", 0),
            f"{map_progress.get('building_reviewed', 0)}/{map_progress.get('building_total', 0)} buildings",
            map_progress.get("building_percent", 0),
            "partial",
        ),
        (
            "Building art",
            map_progress.get("building_art_percent", 0),
            f"{map_progress.get('building_art_approved', 0)}/{map_progress.get('building_total', 0)} art records",
            map_progress.get("building_art_percent", 0),
            "reviewing",
        ),
        (
            "People / Businesses",
            people_progress.get("overall_percent", 0),
            f"{len(community_review.get('people', [])) + len(community_review.get('businesses', []))} records",
            people_progress.get("overall_percent", 0),
            "reviewing",
        ),
    ]
    return '<div class="metrics-grid">' + "".join(_render_progress_card(label, f"{value}%", detail, int(percent), state) for label, value, detail, percent, state in metrics) + "</div>"


def _render_scope_ladder(items: list[dict[str, Any]]) -> str:
    if not items:
        return '<p class="small muted">No scope data yet.</p>'
    rows = []
    for item in items:
        rows.append(
            "\n".join(
                [
                    '<div class="metric">',
                    '<div class="metric__top">',
                    f'<div><div class="metric__label">{_s(item.get("label", ""))}</div><div class="metric__value">{_s(item.get("scope_id", ""))}</div></div>',
                    f'<span class="badge state-{_state_class(item.get("scope_state", ""))}">{_s(item.get("scope_state", ""))}</span>',
                    "</div>",
                    f'<p class="metric__detail">{_s(item.get("notes", ""))}</p>',
                    "</div>",
                ]
            )
        )
    return '<div class="grid grid--3">' + "".join(rows) + "</div>"


def _render_route_cards_grid(context: dict[str, Any], active_route: str) -> str:
    items = []
    for route_id in COMMUNITY_ROUTE_ORDER:
        items.append(_render_route_card(route_id, context, active=(route_id == active_route)))
    return '<div class="grid grid--2">' + "".join(items) + "</div>"


def _render_domain_cards(domains: list[dict[str, Any]]) -> str:
    if not domains:
        return '<p class="small muted">No review domains are available yet.</p>'
    cards = []
    for domain in domains:
        cards.append(
            "\n".join(
                [
                    '<div class="metric">',
                    '<div class="metric__top">',
                    f'<div><div class="metric__label">{_s(domain.get("label", ""))}</div><div class="metric__value">{_s(domain.get("record_count", 0))}</div></div>',
                    f'<span class="badge state-{_state_class(domain.get("status", ""))}">{_s(domain.get("status", ""))}</span>',
                    "</div>",
                    f'<p class="metric__detail">{_s(domain.get("notes", ""))}</p>',
                    "</div>",
                ]
            )
        )
    return '<div class="grid grid--3">' + "".join(cards) + "</div>"


def _render_summary_list(items: list[dict[str, Any]]) -> str:
    if not items:
        return '<p class="small muted">No unresolved items yet.</p>'
    rendered = []
    for item in items:
        if isinstance(item, dict):
            rendered.append(f"{_s(item.get('label', ''))}: {_s(item.get('count', ''))}")
        elif isinstance(item, (tuple, list)) and len(item) >= 2:
            rendered.append(f"{_s(item[0])}: {_s(item[1])}")
        else:
            rendered.append(_s(item))
    return _render_list(rendered)


def _render_action_links(actions: list[tuple[str, str, str]]) -> str:
    if not actions:
        return '<p class="small muted">No actions available.</p>'
    items = []
    for label, href, kind in actions:
        items.append(f'<a class="action-link {kind}" href="{_s(href)}">{_s(label)}</a>')
    return '<div class="action-row">' + "".join(items) + "</div>"


def _render_evidence_focus(evidence_inspector: dict[str, Any], context: dict[str, Any]) -> str:
    focus = evidence_inspector.get("focus", {}) if isinstance(evidence_inspector, dict) else {}
    related_location = focus.get("related_location", {}) if isinstance(focus, dict) else {}
    status = str(focus.get("status", "unknown"))
    confidence = _confidence_percent(focus)
    return "\n".join(
        [
            _render_chip_row(
                [
                    {"label": "Focus", "value": focus.get("focus_label", ""), "state": status},
                    {"label": "Confidence", "value": f"{confidence}%", "state": "guarded" if confidence < 70 else "ready"},
                    {"label": "Basis", "value": focus.get("historical_basis", ""), "state": focus.get("historical_basis", "")},
                ]
            ),
            _render_kv_rows(
                [
                    ("Type", focus.get("focus_type", "")),
                    ("Record ID", focus.get("focus_id", "")),
                    ("Label", focus.get("label", "")),
                    ("Sources", ", ".join(focus.get("source_ids", [])) if isinstance(focus.get("source_ids"), list) else ""),
                    ("Status", status),
                    ("Visual detail", focus.get("visual_detail_status", "")),
                ]
            ),
            f'<p class="footnote">{_s(focus.get("notes", ""))}</p>',
            _render_kv_rows(
                [
                    ("Related location", related_location.get("label", "")),
                    ("Street", related_location.get("street", "")),
                    ("Location certainty", related_location.get("certainty", "")),
                ]
            ),
            _render_list(
                [
                    f"Map layer: {_s(evidence_inspector.get('map_layer_id', ''))}",
                    f"Selected scope: {_s(evidence_inspector.get('selected_scope', ''))}",
                    f"Selected town: {_s(evidence_inspector.get('selected_town', ''))}",
                ]
            ),
        ]
    )


def _render_release_gate_summary(release_gate: dict[str, Any], context: dict[str, Any]) -> str:
    blockers = release_gate.get("blockers", []) if isinstance(release_gate, dict) else []
    release_state = str(release_gate.get("state", "blocked"))
    reason = str(release_gate.get("reason", ""))
    return "\n".join(
        [
            _render_chip_row(
                [
                    {"label": "State", "value": release_state, "state": release_state},
                    {"label": "Blockers", "value": len(blockers), "state": "blocked" if blockers else "ready"},
                ]
            ),
            f'<p class="text-block">{_s(reason)}</p>',
            _render_list([_s(blocker) for blocker in blockers]),
        ]
    )


def _render_diagnostics(context: dict[str, Any], extra_note: str = "") -> str:
    package = context["package"]
    counts = _community_status_counts(context)
    rows = [
        f"Package {package.package_id}",
        f"Town {package.town_name}",
        f"{counts['sources']} sources / {counts['sheets']} sheets",
        f"{counts['buildings']} buildings / {counts['people_businesses']} people-business items",
    ]
    if extra_note:
        rows.append(extra_note)
    rows.append("Legacy debug view remains available at /texarkana/debug.")
    return _render_list(rows)


def _render_map_canvas(map_packet: dict[str, Any], map_rendering: dict[str, Any]) -> str:
    base = map_rendering.get("base_map_layer", {}) if isinstance(map_rendering, dict) else {}
    road = map_rendering.get("road_rail_layer", {}) if isinstance(map_rendering, dict) else {}
    footprint = map_rendering.get("building_footprint_layer", {}) if isinstance(map_rendering, dict) else {}
    art = map_rendering.get("building_art_layer", {}) if isinstance(map_rendering, dict) else {}
    labels = map_rendering.get("label_layer", {}) if isinstance(map_rendering, dict) else {}
    markers = map_rendering.get("quest_marker_layer", {}) if isinstance(map_rendering, dict) else {}
    evidence = map_rendering.get("evidence_provenance_layer", {}) if isinstance(map_rendering, dict) else {}
    selected_sheet = map_packet.get("selected_sheet", {})
    selected_building = map_packet.get("selected_building", {})
    selected_building_label = selected_building.get("reviewed_label") or selected_building.get("student_safe_name") or "Unselected"
    layer_items = [
        ("Base map layer", base.get("stitching_status", "unknown"), "Historical scan and sheet identity anchor the workspace."),
        ("Road / rail layer", road.get("status", "deferred"), road.get("notes", "")),
        ("Footprint layer", footprint.get("status", "deferred"), "Footprints are separate from building art."),
        ("Building art layer", art.get("status", "deferred"), "Transparent art is reviewed only against anchors."),
        ("Label layer", labels.get("status", "ready"), "Location labels stay distinct from geometry."),
        ("Quest markers", markers.get("status", "draft"), "Runtime overlays should not overwrite history."),
        ("Evidence / provenance", evidence.get("status", "ready"), "Claims and citations remain inspectable."),
    ]
    return "\n".join(
        [
            '<div class="canvas">',
            '<div class="canvas__sheet">',
            '<div class="canvas__label">',
            '<div>',
            '<h3>Stitched map workspace</h3>',
            f'<p>{_s(base.get("title", ""))}</p>',
            "</div>",
            '<div class="chip-row">',
            f'<span class="badge state-{_state_class(base.get("stitching_status", ""))}">Stitching {_s(base.get("stitching_status", ""))}</span>',
            f'<span class="badge state-{_state_class(base.get("georeferencing_status", ""))}">Georeferencing {_s(base.get("georeferencing_status", ""))}</span>',
            "</div>",
            "</div>",
            '<div class="canvas__surface">',
            '<div class="canvas__layer-stack">',
            "".join(
                f'<div class="canvas__layer"><strong>{_s(title)}</strong><span class="tag state-{_state_class(state)}">{_s(state)}</span><p class="small muted">{_s(note)}</p></div>'
                for title, state, note in layer_items
            ),
            "</div>",
            "<div style='padding:20px 20px 20px 20px;max-width:52%'>",
            f'<div class="panel panel--paper" style="margin-bottom:12px"><div class="panel__head"><div><h2>Selected sheet</h2><p class="panel__subtitle">{_s(selected_sheet.get("sheet_label", ""))}</p></div></div><div class="panel__body"><p class="text-block">{_s(selected_sheet.get("notes", ""))}</p></div></div>',
            f'<div class="panel panel--paper"><div class="panel__head"><div><h2>Selected building</h2><p class="panel__subtitle">{_s(selected_building_label)}</p></div></div><div class="panel__body"><p class="text-block">{_s(selected_building.get("notes", ""))}</p></div></div>',
            "</div>",
            "</div>",
            "</div>",
            "</div>",
        ]
    )


def _render_tool_stack(tools: list[dict[str, Any]]) -> str:
    if not tools:
        return '<p class="small muted">No tools available.</p>'
    rows = []
    for tool in tools:
        rows.append(
            "\n".join(
                [
                    '<div class="list__item">',
                    f'<p class="source-card__title">{_s(tool.get("label", ""))}</p>',
                    f'<div class="source-card__row"><span class="tag state-{_state_class(tool.get("status", ""))}">{_s(tool.get("status", ""))}</span></div>',
                    f'<p class="source-card__notes">{_s(tool.get("notes", ""))}</p>',
                    "</div>",
                ]
            )
        )
    return "".join(rows)


def _render_selected_sheet(selected_sheet: dict[str, Any], stitch_workspace: dict[str, Any]) -> str:
    return "\n".join(
        [
            _render_kv_rows(
                [
                    ("Sheet ID", selected_sheet.get("sheet_id", "")),
                    ("Sheet label", selected_sheet.get("sheet_label", "")),
                    ("Role", selected_sheet.get("sheet_role", "")),
                    ("Review status", selected_sheet.get("review_status", "")),
                    ("Visible labels", ", ".join(selected_sheet.get("observed_labels", [])) if isinstance(selected_sheet.get("observed_labels"), list) else ""),
                ]
            ),
            f'<p class="footnote">{_s(selected_sheet.get("notes", ""))}</p>',
            _render_kv_rows(
                [
                    ("Anchor sheet", stitch_workspace.get("anchor_sheet_id", "")),
                    ("Sheet plan count", stitch_workspace.get("sheet_plan_count", "")),
                    ("Link count", stitch_workspace.get("link_count", "")),
                    ("Control points", stitch_workspace.get("control_point_status", "")),
                ]
            ),
        ]
    )


def _render_selected_building(selected_building: dict[str, Any]) -> str:
    return "\n".join(
        [
            _render_kv_rows(
                [
                    ("Building ID", selected_building.get("building_id", "")),
                    ("Location ID", selected_building.get("location_id", "")),
                    ("Map ID", selected_building.get("map_id", "")),
                    ("Identity status", selected_building.get("identity_status", "")),
                    ("Visual detail", selected_building.get("visual_detail_status", "")),
                    ("Review record", selected_building.get("review_record_id", "")),
                ]
            ),
            _render_list([f"Source: {_s(source_id)}" for source_id in selected_building.get("source_ids", [])]),
        ]
    )


def _render_art_preview(art_preview: dict[str, Any], demo_route: dict[str, Any]) -> str:
    layers = art_preview.get("layers", [])
    return "\n".join(
        [
            '<div class="preview-frame transparent-preview">',
            '<div style="padding:16px 18px">',
            f'<div class="chip-row"><span class="badge state-{_state_class(art_preview.get("preview_status", "unknown"))}">Preview {_s(art_preview.get("preview_status", ""))}</span><span class="badge state-ready">Transparent background</span></div>',
            f'<p class="text-block">{_s(demo_route.get("art_note", art_preview.get("notes", "")))}</p>',
            '<div class="grid grid--2" style="margin-top:12px">',
            "".join(
                f'<div class="metric"><div class="metric__top"><div><div class="metric__label">{_s(layer.get("label", ""))}</div><div class="metric__value">{_s(layer.get("status", ""))}</div></div><span class="badge state-{_state_class(layer.get("status", ""))}">{_s(layer.get("status", ""))}</span></div><p class="metric__detail">{_s(layer.get("notes", ""))}</p></div>'
                for layer in layers
            ),
            "</div>",
            "</div>",
            "</div>",
        ]
    )


def _render_interior_notes(interior_notes: dict[str, Any]) -> str:
    return _render_kv_rows(
        [
            ("Historical basis", interior_notes.get("historical_basis", "")),
            ("Notes", interior_notes.get("text", "")),
        ]
    )


def _render_georef_panel(stitch_workspace: dict[str, Any], demo_route: dict[str, Any]) -> str:
    rows = [
        ("Stitching", stitch_workspace.get("stitching_status", "")),
        ("Control points", stitch_workspace.get("control_point_status", "")),
        ("Georeferencing", stitch_workspace.get("georeferencing_status", "")),
        ("Location extraction", stitch_workspace.get("location_extraction_status", "")),
        ("Anchor sheet", stitch_workspace.get("anchor_sheet_id", "")),
        ("Links", stitch_workspace.get("link_count", "")),
    ]
    content = _render_kv_rows(rows)
    if demo_route.get("control_points"):
        control_points = demo_route.get("control_points", [])
        content += _render_list([f"{point.get('label', '')}: {point.get('notes', '')}" for point in control_points])
    else:
        content += '<p class="small muted">Control points remain deferred until the live stitching workflow is connected.</p>'
    return content


def _render_layer_stack(layer_stack: list[dict[str, Any]]) -> str:
    if not layer_stack:
        return '<p class="small muted">No layer stack available.</p>'
    items = []
    for layer in layer_stack:
        items.append(
            "\n".join(
                [
                    '<div class="list__item">',
                    f'<p class="source-card__title">{_s(layer.get("label", ""))}</p>',
                    f'<div class="source-card__row"><span class="tag state-{_state_class(layer.get("status", ""))}">{_s(layer.get("status", ""))}</span></div>',
                    f'<p class="source-card__notes">{_s(layer.get("notes", ""))}</p>',
                    "</div>",
                ]
            )
        )
    return "".join(items)


def _render_provenance_trail(trail: dict[str, Any]) -> str:
    source_issue = trail.get("source_issue", {})
    return "\n".join(
        [
            _render_kv_rows(
                [
                    ("Source issue", source_issue.get("publication_title", "")),
                    ("Issue date", source_issue.get("issue_date", "")),
                    ("Page", source_issue.get("page", "")),
                    ("Citation", source_issue.get("citation", "")),
                ]
            ),
            f'<p class="footnote">{_s(trail.get("notes", ""))}</p>',
        ]
    )


def _render_review_legend(items: list[dict[str, Any]]) -> str:
    if not items:
        return '<p class="small muted">No legend items available.</p>'
    rows = []
    for item in items:
        rows.append(
            "\n".join(
                [
                    '<div class="legend__item">',
                    f'<div class="metric__top"><div><div class="metric__label">{_s(item.get("label", ""))}</div><div class="metric__value">{_s(item.get("count", 0))}</div></div><span class="badge state-{_state_class(item.get("status", ""))}">{_s(item.get("status", ""))}</span></div>',
                    f'<p class="metric__detail">{_s(item.get("notes", ""))}</p>',
                    "</div>",
                ]
            )
        )
    return '<div class="grid grid--2">' + "".join(rows) + "</div>"


def _render_bottom_summary(items: list[tuple[str, Any]]) -> str:
    return _render_kv_rows([(label, value) for label, value in items])


def _render_sheet_browser(sheet_selector: list[dict[str, Any]]) -> str:
    if not sheet_selector:
        return '<p class="small muted">No sheet review records available.</p>'
    rows = []
    for sheet in sheet_selector:
        rows.append(
            "\n".join(
                [
                    '<div class="source-browser__item">',
                    f'<div class="source-card__title">{_s(sheet.get("sheet_label", ""))} · {_s(sheet.get("sheet_role", ""))}</div>',
                    f'<div class="source-card__row"><span class="tag state-{_state_class(sheet.get("review_status", ""))}">{_s(sheet.get("review_status", ""))}</span><span class="tag state-{_state_class("ready" if sheet.get("is_anchor") else "unknown")}">{ "anchor" if sheet.get("is_anchor") else "candidate" }</span></div>',
                    f'<p class="source-card__notes">{_s(sheet.get("notes", ""))}</p>',
                    "</div>",
                ]
            )
        )
    return "".join(rows)


def _render_coverage_grid(coverage_grid: list[dict[str, Any]]) -> str:
    if not coverage_grid:
        return '<p class="small muted">No coverage grid yet.</p>'
    rows = []
    for item in coverage_grid:
        rows.append(
            "\n".join(
                [
                    '<div class="metric">',
                    '<div class="metric__top">',
                    f'<div><div class="metric__label">{_s(item.get("sheet_label", ""))}</div><div class="metric__value">{_s(item.get("coverage_percent", 0))}%</div></div>',
                    f'<span class="badge state-{_state_class(item.get("status", ""))}">{_s(item.get("status", ""))}</span>',
                    "</div>",
                    f'<p class="metric__detail">{_s(item.get("buildings_tagged", 0))} buildings tagged</p>',
                    f'<div class="progress"><div class="progress__fill state-{_state_class(item.get("status", ""))}" style="width:{int(item.get("coverage_percent", 0))}%"></div></div>',
                    "</div>",
                ]
            )
        )
    return '<div class="grid grid--2">' + "".join(rows) + "</div>"


def _render_map_link(selected_building: dict[str, Any], map_rendering: dict[str, Any]) -> str:
    base = map_rendering.get("base_map_layer", {})
    road = map_rendering.get("road_rail_layer", {})
    return _render_kv_rows(
        [
            ("Map year", base.get("time_window", {}).get("start_year", "")),
            ("Base layer", base.get("stitching_status", "")),
            ("Road / rail", road.get("status", "")),
            ("Building anchor", selected_building.get("review_record_id", "")),
        ]
    )


def _render_layer_contract(map_rendering: dict[str, Any], selected_building: dict[str, Any]) -> str:
    base = map_rendering.get("base_map_layer", {})
    road = map_rendering.get("road_rail_layer", {})
    footprint = map_rendering.get("building_footprint_layer", {})
    art = map_rendering.get("building_art_layer", {})
    labels = map_rendering.get("label_layer", {})
    markers = map_rendering.get("quest_marker_layer", {})
    evidence = map_rendering.get("evidence_provenance_layer", {})
    return "\n".join(
        [
            _render_kv_rows(
                [
                    ("Base map", base.get("stitching_status", "")),
                    ("Road / rail", road.get("status", "")),
                    ("Footprints", footprint.get("status", "")),
                    ("Building art", art.get("status", "")),
                    ("Labels", labels.get("status", "")),
                    ("Quest markers", markers.get("status", "")),
                    ("Evidence", evidence.get("status", "")),
                ]
            ),
            _render_list(
                [
                    f"Review anchor: {_s(selected_building.get('review_record_id', ''))}",
                    f"Location anchor: {_s(selected_building.get('location_id', ''))}",
                    f"Visual detail: {_s(selected_building.get('visual_detail_status', ''))}",
                ]
            ),
        ]
    )


def _render_building_text_block(selected_building: dict[str, Any]) -> str:
    return _render_kv_rows(
        [
            ("Reviewed label", selected_building.get("reviewed_label", "")),
            ("Student-safe name", selected_building.get("student_safe_name", "")),
            ("Identity status", selected_building.get("identity_status", "")),
            ("Visual detail", selected_building.get("visual_detail_status", "")),
        ]
    ) + f'<p class="footnote">{_s(selected_building.get("notes", ""))}</p>'


def _render_footprint_review(selected_building: dict[str, Any], footprint_layer: dict[str, Any], demo_route: dict[str, Any]) -> str:
    building_records = footprint_layer.get("records", [])
    building_record = next((record for record in building_records if record.get("building_id") == selected_building.get("building_id")), {})
    fallback = demo_route.get("footprint_note", "")
    return _render_kv_rows(
        [
            ("Footprint status", building_record.get("footprint_status", footprint_layer.get("status", ""))),
            ("Geometry basis", building_record.get("geometry_basis", selected_building.get("identity_status", ""))),
            ("Review anchor", building_record.get("review_record_id", selected_building.get("review_record_id", ""))),
            ("Default render", building_record.get("fallback_render_mode", selected_building.get("default_render_mode", ""))),
        ]
    ) + f'<p class="footnote">{_s(fallback)}</p>'


def _render_building_art_preview(building_art: dict[str, Any], selected_building: dict[str, Any]) -> str:
    layers = building_art.get("records", []) or building_art.get("fallback_records", [])
    return "\n".join(
        [
            '<div class="preview-frame transparent-preview">',
            '<div style="padding:16px 18px">',
            '<div class="chip-row"><span class="badge state-ready">Transparent art</span><span class="badge state-' + _state_class(building_art.get("status", "unknown")) + '">Art layer ' + _s(building_art.get("status", "")) + "</span></div>",
            f'<p class="text-block">{_s(selected_building.get("notes", ""))}</p>',
            '<div class="grid grid--2" style="margin-top:12px">',
            "".join(
                f'<div class="metric"><div class="metric__top"><div><div class="metric__label">{_s(layer.get("layer_id", ""))}</div><div class="metric__value">{_s(layer.get("status", layer.get("visual_detail_status", "")))}</div></div><span class="badge state-{_state_class(layer.get("visual_detail_status", layer.get("status", "")))}">{_s(layer.get("visual_detail_status", layer.get("status", "")))}</span></div><p class="metric__detail">{_s(layer.get("notes", ""))}</p></div>'
                for layer in layers
            ),
            "</div>",
            "</div>",
            "</div>",
        ]
    )


def _render_building_provenance(selected_building: dict[str, Any], source_issue: dict[str, Any] | None, context: dict[str, Any]) -> str:
    source_ids = selected_building.get("source_ids", [])
    issue_title = source_issue.get("publication_title", "") if isinstance(source_issue, dict) else ""
    issue_page = source_issue.get("page", "") if isinstance(source_issue, dict) else ""
    issue_citation = source_issue.get("citation", "") if isinstance(source_issue, dict) else ""
    return "\n".join(
        [
            _render_kv_rows(
                [
                    ("Source IDs", ", ".join(source_ids) if isinstance(source_ids, list) else ""),
                    ("Source issue", issue_title),
                    ("Issue page", issue_page),
                    ("Citation", issue_citation),
                ]
            ),
            _render_list([claim.claim_id for claim in context["package"].claims if selected_building.get("source_ids") and any(source_id in claim.source_ids for source_id in selected_building.get("source_ids", []))]),
        ]
    )


def _render_building_links(context: dict[str, Any]) -> str:
    community_review = context.get("community_review") or {}
    people = community_review.get("people", [])
    businesses = community_review.get("businesses", [])
    items = [f"Person: {_s(person.get('display_name', ''))}" for person in people] + [
        f"Business: {_s(business.get('display_name', ''))}" for business in businesses
    ]
    return _render_list(items)


def _render_source_issue_browser(source_browser: list[dict[str, Any]], selected_issue: dict[str, Any]) -> str:
    if not source_browser:
        return '<p class="small muted">No source issues available.</p>'
    rows = []
    for issue in source_browser:
        is_selected = selected_issue and issue.get("source_issue_id") == selected_issue.get("source_issue_id")
        rows.append(
            "\n".join(
                [
                    f'<div class="source-browser__item{" is-selected" if is_selected else ""}>',
                    f'<div class="source-card__title">{_s(issue.get("publication_title", ""))}</div>',
                    f'<p class="source-card__meta">{_s(issue.get("issue_date", ""))} · page {_s(issue.get("page", ""))}</p>',
                    f'<p class="source-card__notes">{_s(issue.get("ocr_excerpt", ""))}</p>',
                    f'<div class="source-card__row"><span class="tag state-{_state_class("confirmed" if issue.get("linked_record_count", 0) else "under_review")}">{_s(issue.get("linked_record_count", 0))} linked records</span><span class="tag">{_s(issue.get("citation", ""))}</span></div>',
                    "</div>",
                ]
            )
        )
    return "".join(rows)


def _render_person_workspace(selected_person: dict[str, Any], people_packet: dict[str, Any]) -> str:
    source_issue = selected_person.get("source_issue", {}) if isinstance(selected_person, dict) else {}
    return "\n".join(
        [
            _render_chip_row(
                [
                    {"label": "Person", "value": selected_person.get("display_name", ""), "state": selected_person.get("review_status", "")},
                    {"label": "Basis", "value": selected_person.get("historical_basis", ""), "state": selected_person.get("historical_basis", "")},
                    {"label": "Issue", "value": source_issue.get("issue_date", ""), "state": "reviewing"},
                ]
            ),
            _render_kv_rows(
                [
                    ("Record ID", selected_person.get("review_record_id", "")),
                    ("Entity ID", selected_person.get("entity_id", "")),
                    ("Review status", selected_person.get("review_status", "")),
                    ("Source issue", source_issue.get("publication_title", "")),
                    ("Related locations", ", ".join(selected_person.get("related_location_ids", [])) if isinstance(selected_person.get("related_location_ids"), list) else ""),
                ]
            ),
            f'<p class="text-block">{_s(selected_person.get("notes", ""))}</p>',
            _render_list([f"Source: {_s(source_id)}" for source_id in selected_person.get("source_ids", [])]),
        ]
    )


def _render_business_workspace(selected_business: dict[str, Any], people_packet: dict[str, Any]) -> str:
    source_issue = selected_business.get("source_issue", {}) if isinstance(selected_business, dict) else {}
    return "\n".join(
        [
            _render_chip_row(
                [
                    {"label": "Business", "value": selected_business.get("display_name", ""), "state": selected_business.get("review_status", "")},
                    {"label": "Basis", "value": selected_business.get("historical_basis", ""), "state": selected_business.get("historical_basis", "")},
                    {"label": "Issue", "value": source_issue.get("issue_date", ""), "state": "reviewing"},
                ]
            ),
            _render_kv_rows(
                [
                    ("Record ID", selected_business.get("review_record_id", "")),
                    ("Entity ID", selected_business.get("entity_id", "")),
                    ("Review status", selected_business.get("review_status", "")),
                    ("Source issue", source_issue.get("publication_title", "")),
                    ("Related locations", ", ".join(selected_business.get("related_location_ids", [])) if isinstance(selected_business.get("related_location_ids"), list) else ""),
                ]
            ),
            f'<p class="text-block">{_s(selected_business.get("notes", ""))}</p>',
            _render_list([f"Source: {_s(source_id)}" for source_id in selected_business.get("source_ids", [])]),
        ]
    )


def _render_review_legend(items: list[dict[str, Any]]) -> str:
    if not items:
        return '<p class="small muted">No legend items available.</p>'
    rows = []
    for item in items:
        rows.append(
            "\n".join(
                [
                    '<div class="legend__item">',
                    f'<div class="metric__top"><div><div class="metric__label">{_s(item.get("label", ""))}</div><div class="metric__value">{_s(item.get("count", 0))}</div></div><span class="badge state-{_state_class(item.get("status", ""))}">{_s(item.get("status", ""))}</span></div>',
                    f'<p class="metric__detail">{_s(item.get("notes", ""))}</p>',
                    "</div>",
                ]
            )
        )
    return '<div class="grid grid--2">' + "".join(rows) + "</div>"


def _render_source_browser_item(source: Any, selected: bool = False) -> str:
    return "\n".join(
        [
            f'<div class="source-browser__item{" is-selected" if selected else ""}>',
            f'<div class="source-card__title">{_s(source.title)}</div>',
            f'<p class="source-card__meta">{_s(source.repository)} &middot; {_s(source.source_type)}</p>',
            f'<div class="source-card__row"><span class="tag state-{_state_class(source.rights_status)}">{_s(source.rights_status)}</span><span class="tag">{_s(source.access_level)}</span></div>',
            f'<p class="source-card__notes">{_s(source.citation)}</p>',
            "</div>",
        ]
    )


def _render_source_metadata(source: Any) -> str:
    if source is None:
        return '<p class="small muted">No source selected.</p>'
    return _render_kv_rows(
        [
            ("Source ID", source.source_id),
            ("Title", source.title),
            ("Type", source.source_type),
            ("Repository", source.repository),
            ("URL", source.url),
            ("Access", source.access_level),
            ("Rights", source.rights_status),
        ]
    ) + f'<p class="footnote">{_s(source.notes)}</p>'


def _render_source_issue_panel(source_issue: dict[str, Any], linked_people: list[dict[str, Any]], linked_businesses: list[dict[str, Any]], demo_route: dict[str, Any]) -> str:
    return "\n".join(
        [
            _render_kv_rows(
                [
                    ("Issue ID", source_issue.get("source_issue_id", "")),
                    ("Publication", source_issue.get("publication_title", "")),
                    ("Issue date", source_issue.get("issue_date", "")),
                    ("Page", source_issue.get("page", "")),
                    ("Citation", source_issue.get("citation", "")),
                ]
            ),
            f'<p class="text-block">{_s(source_issue.get("ocr_excerpt", ""))}</p>',
            _render_list([f"Person: {_s(record.get('display_name', ''))}" for record in linked_people] + [f"Business: {_s(record.get('display_name', ''))}" for record in linked_businesses]),
            f'<p class="footnote">{_s(demo_route.get("source_note", ""))}</p>',
        ]
    )


def _render_linked_record_summary(
    linked_claims: list[Any],
    linked_locations: list[Any],
    linked_people: list[dict[str, Any]],
    linked_businesses: list[dict[str, Any]],
) -> str:
    items = [
        f"Claims linked: {len(linked_claims)}",
        f"Locations linked: {len(linked_locations)}",
        f"People linked: {len(linked_people)}",
        f"Businesses linked: {len(linked_businesses)}",
    ]
    claim_ids = [claim.claim_id for claim in linked_claims]
    location_ids = [location.location_id for location in linked_locations]
    items.extend([f"Claim: {_s(claim_id)}" for claim_id in claim_ids[:4]])
    items.extend([f"Location: {_s(location_id)}" for location_id in location_ids[:4]])
    return _render_list(items)


def _render_source_rights(source: Any) -> str:
    if source is None:
        return '<p class="small muted">No source selected.</p>'
    return _render_kv_rows(
        [
            ("Citation", source.citation),
            ("Rights", source.rights_status),
            ("Access level", source.access_level),
            ("Repository", source.repository),
        ]
    )


def _render_source_provenance_trail(source: Any, source_issue: dict[str, Any], linked_claims: list[Any]) -> str:
    items = []
    if source is not None:
        items.append(f"Raw source record: {_s(source.source_id)}")
    if source_issue:
        items.append(f"Issue adapter: {_s(source_issue.get('source_issue_id', ''))}")
    items.extend([f"Claim: {_s(claim.claim_id)}" for claim in linked_claims])
    return _render_list(items)


def _render_source_review_notes(source: Any, source_issue: dict[str, Any], demo_route: dict[str, Any]) -> str:
    notes = [source.notes if source is not None else ""]
    if source_issue:
        notes.append(source_issue.get("notes", ""))
    if demo_route.get("provenance_note"):
        notes.append(demo_route.get("provenance_note"))
    return _render_list([note for note in notes if note])


def _render_release_banner(release_gate: dict[str, Any], teacher_review: dict[str, Any], demo_route: dict[str, Any]) -> str:
    state = str(release_gate.get("state", "blocked"))
    reason = str(release_gate.get("reason", ""))
    return "\n".join(
        [
            _render_chip_row(
                [
                    {"label": "State", "value": state, "state": state},
                    {"label": "Teacher review", "value": teacher_review.get("review_status", ""), "state": teacher_review.get("review_status", "")},
                    {"label": "Mission release", "value": teacher_review.get("mission_release_status", ""), "state": teacher_review.get("mission_release_status", "")},
                ]
            ),
            f'<p class="text-block">{_s(reason)}</p>',
            f'<p class="footnote">{_s(teacher_review.get("teacher_authority_rule", ""))}</p>',
            f'<p class="footnote">{_s(demo_route.get("blocker_note", ""))}</p>',
        ]
    )


def _render_blockers(blockers: list[Any], demo_route: dict[str, Any]) -> str:
    items = [_s(blocker) for blocker in blockers] if blockers else []
    if not items and demo_route.get("blocker_note"):
        items.append(_s(demo_route.get("blocker_note", "")))
    return _render_list(items, class_name="blocker-list")


def _render_readiness_matrix(items: list[dict[str, Any]]) -> str:
    if not items:
        return '<p class="small muted">No readiness matrix available.</p>'
    headers = ["Category", "State", "Count", "Details"]
    rows = []
    for item in items:
        rows.append(
            [
                _s(item.get("label", "")),
                f'<span class="tag state-{_state_class(item.get("state", ""))}">{_s(item.get("state", ""))}</span>',
                _s(item.get("count", "")),
                _s(item.get("details", "")),
            ]
        )
    return _render_table(headers, rows)


def _render_building_links_summary(context: dict[str, Any]) -> str:
    community_review = context.get("community_review") or {}
    return _render_list(
        [
            f"People: {len(community_review.get('people', []))}",
            f"Businesses: {len(community_review.get('businesses', []))}",
            f"Source issues: {len(community_review.get('source_issues', []))}",
        ]
    )


def _render_community_review_timeline(context: dict[str, Any]) -> list[dict[str, Any]]:
    review = context.get("community_review") or {}
    history = [
        {"label": "Community review packet loaded", "status": review.get("review_queue_status", "unknown"), "notes": review.get("promotion_rule", "")},
    ]
    if review.get("source_issues"):
        history.append({"label": "Source issue adapter available", "status": len(review.get("source_issues", [])), "notes": "Source issue metadata stays visible to reviewers."})
    return history


def _render_release_unresolved(context: dict[str, Any]) -> list[tuple[str, Any]]:
    community_packet = context.get("community_packet") or {}
    map_packet = context.get("map_packet") or {}
    people_packet = context.get("people_packet") or {}
    map_rendering = context.get("map_rendering") or {}
    building_manifest = context.get("building_manifest")
    building_count = building_manifest.record_count if building_manifest is not None else 0
    reviewed_buildings = 0
    if building_manifest is not None:
        reviewed_buildings = sum(1 for building in building_manifest.buildings if building.identity_status in {"reviewed", "approved"})
    fallback_art = len((map_rendering.get("building_art_layer", {}) or {}).get("fallback_records", []))
    return [
        ("Buildings needing more evidence", max(building_count - reviewed_buildings, 0)),
        ("Fallback art records", fallback_art),
        ("People under review", len([item for item in people_packet.get("people_review", []) if item.get("review_status") == "under_review"])),
        ("Businesses under review", len([item for item in people_packet.get("businesses_review", []) if item.get("review_status") == "under_review"])),
        ("Candidate identities", _domain_count(community_packet, "candidates")),
    ]


def _render_source_warnings(context: dict[str, Any]) -> list[str]:
    package = context["package"]
    warnings = []
    for source in package.sources:
        if source.rights_status == "unknown":
            warnings.append(f"{source.title}: rights status is unknown")
        elif source.access_level not in {"digital_image", "public", "open"}:
            warnings.append(f"{source.title}: access level is {_s(source.access_level)}")
    if not warnings:
        warnings.append("No source rights warnings detected in the current packet.")
    return warnings


def _community_status_counts(context: dict[str, Any]) -> dict[str, int]:
    package = context["package"]
    community_packet = context.get("community_packet") or {}
    map_packet = context.get("map_packet") or {}
    people_packet = context.get("people_packet") or {}
    building_manifest = context.get("building_manifest")
    map_rendering = context.get("map_rendering") or {}
    community_review = context.get("community_review") or {}
    building_count = building_manifest.record_count if building_manifest is not None else 0
    reviewed_buildings = 0
    if building_manifest is not None:
        reviewed_buildings = sum(1 for building in building_manifest.buildings if building.identity_status in {"reviewed", "approved"})
    return {
        "sources": len(package.sources),
        "sheets": len(map_packet.get("sheet_selector", [])) if isinstance(map_packet, dict) else 0,
        "buildings": building_count,
        "people_businesses": len(community_review.get("people", [])) + len(community_review.get("businesses", [])),
        "overall_percent": _community_progress(context),
        "reviewed_buildings": reviewed_buildings,
    }


def _community_progress(context: dict[str, Any]) -> int:
    community_packet = context.get("community_packet") or {}
    map_packet = context.get("map_packet") or {}
    people_packet = context.get("people_packet") or {}
    map_rendering = context.get("map_rendering") or {}
    metrics = []
    progress_summary = community_packet.get("progress_summary", {})
    if progress_summary:
        metrics.append(int(progress_summary.get("overall_percent", 0)))
    if map_packet:
        metrics.append(int(map_packet.get("progress_summary", {}).get("overall_percent", 0)))
    if people_packet:
        metrics.append(int(people_packet.get("progress_summary", {}).get("overall_percent", 0)))
    if map_rendering:
        layer_statuses = [
            str((map_rendering.get("base_map_layer", {}) or {}).get("stitching_status", "")),
            str((map_rendering.get("building_art_layer", {}) or {}).get("status", "")),
            str((map_rendering.get("label_layer", {}) or {}).get("status", "")),
            str((map_rendering.get("evidence_provenance_layer", {}) or {}).get("status", "")),
        ]
        ready_layers = sum(1 for status in layer_statuses if status in {"ready", "reviewed_subset_available", "prep_only"})
        metrics.append(int(round((ready_layers / max(len(layer_statuses), 1)) * 100)))
    return int(round(sum(metrics) / len(metrics))) if metrics else 0


def _release_readiness_matrix(context: dict[str, Any]) -> list[dict[str, Any]]:
    package = context["package"]
    community_packet = context.get("community_packet") or {}
    map_rendering = context.get("map_rendering") or {}
    people_packet = context.get("people_packet") or {}
    teacher_review = context.get("teacher_review") or {}
    building_manifest = context.get("building_manifest")
    reviewed_buildings = 0
    if building_manifest is not None:
        reviewed_buildings = sum(1 for building in building_manifest.buildings if building.identity_status in {"reviewed", "approved"})
    building_total = building_manifest.record_count if building_manifest is not None else 0
    source_count = len(package.sources)
    rights_unknown = len([source for source in package.sources if source.rights_status == "unknown"])
    fallback_art = len((map_rendering.get("building_art_layer", {}) or {}).get("fallback_records", []))
    candidate_count = _domain_count(community_packet, "candidates")
    source_issues = len((context.get("community_review") or {}).get("source_issues", []))
    return [
        {"label": "Teacher approval", "state": teacher_review.get("review_status", "blocked"), "count": teacher_review.get("record_count", 0), "details": teacher_review.get("teacher_authority_rule", "")},
        {"label": "Source citations", "state": "ready" if source_count and rights_unknown == 0 else "guarded", "count": source_count, "details": "All source records should carry citation and rights metadata."},
        {"label": "Source issue linkage", "state": "reviewing" if source_issues else "blocked", "count": source_issues, "details": "Issue adapters should stay visible until human confirmed."},
        {"label": "Building anchors", "state": "partial" if building_total else "blocked", "count": f"{reviewed_buildings}/{building_total}" if building_total else "0/0", "details": "Reviewed building anchors should not be overpromoted."},
        {"label": "Map stitching", "state": str((map_rendering.get("base_map_layer", {}) or {}).get("stitching_status", "unknown")), "count": 1, "details": "Stitching remains the top-level map gate."},
        {"label": "Georeferencing", "state": str((map_rendering.get("base_map_layer", {}) or {}).get("georeferencing_status", "unknown")), "count": 1, "details": "Missing control points should block release until resolved."},
        {"label": "Candidate identities", "state": "guarded" if candidate_count else "ready", "count": candidate_count, "details": "Potential Portal or directory matches need human promotion."},
        {"label": "Fallback art", "state": "guarded" if fallback_art else "ready", "count": fallback_art, "details": "Building art without reviewed anchors must remain visibly fallback."},
    ]


def _derive_release_gate(context: dict[str, Any]) -> dict[str, Any]:
    community_packet = context.get("community_packet") or {}
    map_rendering = context.get("map_rendering") or {}
    teacher_review = context.get("teacher_review") or {}
    building_manifest = context.get("building_manifest")
    community_review = context.get("community_review") or {}
    blockers: list[str] = []

    if teacher_review and not teacher_review.get("classroom_release_ready", False):
        blockers.append("Teacher approval is still pending.")
    if str((map_rendering.get("base_map_layer", {}) or {}).get("stitching_status", "")) not in {"ready", "reviewed_subset_available"}:
        blockers.append("Map stitching is not ready for handoff.")
    if str((map_rendering.get("base_map_layer", {}) or {}).get("georeferencing_status", "")) != "ready":
        blockers.append("Georeferencing is deferred.")
    if building_manifest is not None and building_manifest.record_count:
        reviewed_buildings = sum(1 for building in building_manifest.buildings if building.identity_status in {"reviewed", "approved"})
        if reviewed_buildings < building_manifest.record_count:
            blockers.append("Not all building anchors are reviewed yet.")
    candidate_count = _domain_count(community_packet, "candidates")
    if candidate_count:
        blockers.append("Candidate identities are still waiting for human promotion.")
    if len(community_review.get("source_issues", [])):
        under_review_people = len([record for record in community_review.get("people", []) if record.get("review_status") == "under_review"])
        under_review_businesses = len([record for record in community_review.get("businesses", []) if record.get("review_status") == "under_review"])
        if under_review_people or under_review_businesses:
            blockers.append("People and business records are still under review.")
    fallback_art = len((map_rendering.get("building_art_layer", {}) or {}).get("fallback_records", []))
    if fallback_art:
        blockers.append("Fallback building art remains attached to placeholder anchors.")
    rights_unknown = len([source for source in context["package"].sources if source.rights_status == "unknown"])
    if rights_unknown:
        blockers.append("At least one source has unknown rights status.")

    if teacher_review.get("classroom_release_ready") and not blockers:
        state = "ready"
        reason = "Community review and downstream approvals are clear."
    elif blockers:
        state = "blocked"
        reason = "Community review remains upstream of classroom release."
    else:
        state = "guarded"
        reason = "No hard blocker is present, but the handoff remains cautious."

    return {"state": state, "reason": reason, "blockers": blockers}


def _selected_source(package: TownPackage) -> Any | None:
    if not package.sources:
        return None
    for source in package.sources:
        if "sanborn" in source.source_id:
            return source
    return package.sources[0]


def _selected_source_issue(context: dict[str, Any]) -> dict[str, Any] | None:
    community_review = context.get("community_review") or {}
    selected_source = context.get("selected_source")
    if selected_source is None:
        return None
    source_issues = community_review.get("source_issues", [])
    if not source_issues:
        return None
    issue_by_source = {issue.get("source_id"): issue for issue in source_issues if isinstance(issue, dict)}
    if selected_source.source_id in issue_by_source:
        return issue_by_source[selected_source.source_id]
    return source_issues[0]


def _route_href(town_slug: str, route_id: str) -> str:
    if route_id == "community-dashboard":
        return f"/{town_slug}/community-dashboard"
    return f"/{town_slug}/{route_id}"


def _route_map_year(context: dict[str, Any]) -> int:
    community_packet = context.get("community_packet") or {}
    if isinstance(community_packet, dict):
        year_gate = community_packet.get("year_gate", {})
        if isinstance(year_gate, dict):
            map_year = year_gate.get("map_year")
            if isinstance(map_year, int):
                return map_year
    package = context["package"]
    if package.map_layers and isinstance(package.map_layers[0], dict):
        map_year = package.map_layers[0].get("year")
        if isinstance(map_year, int):
            return map_year
    start_year = package.time_window.get("start_year")
    if isinstance(start_year, int):
        return start_year
    raise MindseyeDataError("town package is missing a usable map year")


def _load_demo_ui_model(repo_root: Path) -> dict[str, Any]:
    demo_path = repo_root / "data" / "community_ui_demo.json"
    if not demo_path.exists():
        return {}
    raw = json.loads(demo_path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


def _safe_build(builder):
    try:
        return builder()
    except MindseyeDataError:
        return None


def _normalize_route(route: str) -> str:
    cleaned = route.strip().lstrip("/")
    if not cleaned:
        return "community-dashboard"
    if cleaned in {"texarkana", "texarkana/community-dashboard"}:
        return "community-dashboard"
    if cleaned.startswith("community-dashboard"):
        return "community-dashboard"
    return cleaned


def _state_class(value: Any) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    return normalized or "unknown"


def _s(value: Any) -> str:
    return escape("" if value is None else str(value), quote=True)


def _confidence_percent(focus: dict[str, Any]) -> int:
    confidence = int(focus.get("confidence", 0) or 0)
    return max(0, min(100, confidence))


def _community_unresolved_summary(context: dict[str, Any]) -> list[dict[str, Any]]:
    building_manifest = context.get("building_manifest")
    map_rendering = context.get("map_rendering") or {}
    community_review = context.get("community_review") or {}
    people_packet = context.get("people_packet") or {}
    package = context["package"]
    reviewed_buildings = 0
    if building_manifest is not None:
        reviewed_buildings = sum(1 for building in building_manifest.buildings if building.identity_status in {"reviewed", "approved"})
    return [
        {"label": "Buildings needing more evidence", "count": max((building_manifest.record_count if building_manifest is not None else 0) - reviewed_buildings, 0)},
        {"label": "Fallback art records", "count": len((map_rendering.get("building_art_layer", {}) or {}).get("fallback_records", []))},
        {"label": "People under review", "count": len([record for record in people_packet.get("people_review", []) if record.get("review_status") == "under_review"])},
        {"label": "Businesses under review", "count": len([record for record in people_packet.get("businesses_review", []) if record.get("review_status") == "under_review"])},
        {"label": "Candidate matches", "count": _domain_count(context.get("community_packet") or {}, "candidates")},
        {"label": "Unknown rights sources", "count": len([source for source in package.sources if source.rights_status == "unknown"])},
    ]


def _domain_count(packet: dict[str, Any], domain_id: str) -> int:
    if not isinstance(packet, dict):
        return 0
    for domain in packet.get("review_domains", []):
        if isinstance(domain, dict) and domain.get("domain_id") == domain_id:
            return int(domain.get("record_count", 0) or 0)
    return 0


def _render_source_browser_item(source: Any, selected: bool = False) -> str:
    return "\n".join(
        [
            f'<div class="source-browser__item{" is-selected" if selected else ""}>',
            f'<div class="source-card__title">{_s(source.title)}</div>',
            f'<p class="source-card__meta">{_s(source.repository)} · {_s(source.source_type)}</p>',
            f'<div class="source-card__row"><span class="tag state-{_state_class(source.rights_status)}">{_s(source.rights_status)}</span><span class="tag">{_s(source.access_level)}</span></div>',
            f'<p class="source-card__notes">{_s(source.citation)}</p>',
            "</div>",
        ]
    )
