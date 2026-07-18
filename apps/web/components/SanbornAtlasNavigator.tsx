"use client";

import { useMemo } from "react";

import type { StudioSheetAsset, StudioSourceOption, StudioTownPackage } from "@/lib/historical-map-studio";
import type { SanbornAtlasInventoryState } from "@/lib/sanborn-atlas";
import type { SanbornMapPieceGeoreference } from "@/lib/sanborn-map-piece-georeference";
import type { SanbornTownIndexRegionRecord } from "@/lib/sanborn-town-index";
import {
  buildTownIndexSummary,
  calculatePageClassificationSummary,
  calculateMapPieceProgress,
  calculateSheetProgress,
  calculateTownProgress,
  type ReconstructionProgressStatus,
} from "@/lib/town-reconstruction";

export type SanbornAtlasWorkflowStep =
  | "source"
  | "page_classification"
  | "town_index"
  | "numbered_sheets"
  | "piece_inventory"
  | "gps_alignment";

export const sanbornAtlasWorkflowSteps: Array<{ id: SanbornAtlasWorkflowStep; label: string }> = [
  { id: "source", label: "Town & Edition" },
  { id: "page_classification", label: "Source Record" },
  { id: "town_index", label: "Town Index" },
  { id: "numbered_sheets", label: "Sheet Inventory" },
  { id: "piece_inventory", label: "Map Pieces" },
  { id: "gps_alignment", label: "Map Placement" },
];

type StationStatus = ReconstructionProgressStatus | "started";

type SanbornAtlasNavigatorProps = {
  inventory: SanbornAtlasInventoryState;
  assets: StudioSheetAsset[];
  sourceOptions: StudioSourceOption[];
  activeTownPackage: StudioTownPackage | null;
  activeMapYear: number | null;
  mapPieceGeoreferences: SanbornMapPieceGeoreference[];
  townIndexRegions: SanbornTownIndexRegionRecord[];
  selectedAtlasId: string;
  workflowStep: SanbornAtlasWorkflowStep;
  onWorkflowStepChange: (step: SanbornAtlasWorkflowStep) => void;
};

function statusLabel(status: StationStatus): string {
  return status.replaceAll("_", " ");
}

function statusClass(status: StationStatus): string {
  return status === "started" ? "in_progress" : status;
}

export function SanbornAtlasNavigator({
  inventory,
  assets,
  sourceOptions,
  activeTownPackage,
  activeMapYear,
  mapPieceGeoreferences,
  townIndexRegions,
  selectedAtlasId,
  workflowStep,
  onWorkflowStepChange,
}: SanbornAtlasNavigatorProps) {
  const activeAtlas = inventory.atlases.find((atlas) => atlas.atlasId === selectedAtlasId) ?? null;
  const activePages = useMemo(
    () => inventory.pages.filter((page) => page.atlasId === selectedAtlasId).sort((left, right) => left.pageSequence - right.pageSequence),
    [inventory.pages, selectedAtlasId],
  );
  const activePageIds = useMemo(() => new Set(activePages.map((page) => page.pageId)), [activePages]);
  const activePieces = useMemo(
    () => inventory.pieces.filter((piece) => activePageIds.has(piece.atlasPageId)).sort((left, right) => left.pieceSequence - right.pieceSequence),
    [activePageIds, inventory.pieces],
  );
  const pageByAssetId = useMemo(() => new Map(activePages.map((page) => [page.sanbornSheetAssetId, page])), [activePages]);
  const placementByPieceId = useMemo(() => new Map(mapPieceGeoreferences.map((placement) => [placement.pieceId, placement])), [mapPieceGeoreferences]);
  const sheetProgress = useMemo(
    () =>
      assets.map((asset) =>
        calculateSheetProgress({
          asset,
          page: pageByAssetId.get(asset.assetId) ?? null,
          pieces: activePieces.filter((piece) => piece.atlasPageId === pageByAssetId.get(asset.assetId)?.pageId),
          placements: mapPieceGeoreferences,
        }),
      ),
    [activePieces, assets, mapPieceGeoreferences, pageByAssetId],
  );
  const pieceProgress = useMemo(
    () => activePieces.map((piece) => calculateMapPieceProgress({ piece, placement: placementByPieceId.get(piece.pieceId) })),
    [activePieces, placementByPieceId],
  );
  const townIndexSummary = useMemo(
    () =>
      buildTownIndexSummary({
        pages: activePages,
        assets,
        pieces: activePieces,
        placements: mapPieceGeoreferences,
        indexRegions: townIndexRegions.filter((region) => region.atlasId === selectedAtlasId),
      }),
    [activePages, activePieces, assets, mapPieceGeoreferences, selectedAtlasId, townIndexRegions],
  );
  const townProgress = useMemo(
    () =>
      calculateTownProgress({
        town: activeTownPackage,
        activeMapYear,
        sourceOptions,
        sheets: assets,
        pages: activePages,
        pieces: activePieces,
        placements: mapPieceGeoreferences,
      }),
    [activeMapYear, activePages, activePieces, activeTownPackage, assets, mapPieceGeoreferences, sourceOptions],
  );
  const classificationSummary = useMemo(
    () => calculatePageClassificationSummary({ pages: activePages, pieces: activePieces }),
    [activePages, activePieces],
  );
  const sourceLinkedCount = sheetProgress.filter((sheet) => sheet.sourceLinked).length;
  const startedSheets = sheetProgress.filter((sheet) => sheet.status !== "not_started").length;
  const placedPieces = pieceProgress.filter((piece) => piece.geographicPlacementSaved).length;
  const definedPieces = pieceProgress.filter((piece) => piece.regionDefined).length;
  const stationSummaries: Record<SanbornAtlasWorkflowStep, { summary: string; status: StationStatus; warning?: string }> = {
    source: {
      summary: activeAtlas ? "selected" : "missing",
      status: activeAtlas ? "reviewed" : "missing",
      warning: activeAtlas ? undefined : "No atlas edition selected",
    },
    page_classification: {
      summary: `${classificationSummary.classifiedPages}/${Math.max(1, classificationSummary.totalPages)} classified`,
      status: classificationSummary.conflictPages > 0 ? "conflict" : classificationSummary.status === "in_progress" ? "started" : classificationSummary.status,
      warning:
        classificationSummary.conflictPages > 0
          ? "Classification conflicts"
          : classificationSummary.unknownPages > 0
            ? "Unknown page types"
            : sourceLinkedCount < sheetProgress.length
              ? "Missing source records"
              : undefined,
    },
    town_index: {
      summary: `${townIndexSummary.completion.linkedRegions}/${Math.max(1, townIndexSummary.completion.totalRegions)} linked`,
      status: !townIndexSummary.indexPage ? "missing" : townIndexSummary.completion.conflictRegions > 0 ? "conflict" : townIndexSummary.completion.reviewedRegions === townIndexSummary.completion.totalRegions && townIndexSummary.completion.totalRegions > 0 ? "reviewed" : townIndexSummary.completion.linkedRegions > 0 ? "started" : "not_started",
      warning: !townIndexSummary.indexPage ? "No primary Town Index" : townIndexSummary.completion.conflictRegions > 0 ? "Index conflicts" : townIndexSummary.completion.missingRegions > 0 ? "Missing regions" : undefined,
    },
    numbered_sheets: {
      summary: `${startedSheets}/${Math.max(1, sheetProgress.length)} started`,
      status: startedSheets === sheetProgress.length && sheetProgress.length > 0 ? "reviewed" : startedSheets > 0 ? "started" : "not_started",
    },
    piece_inventory: {
      summary: `${definedPieces}/${Math.max(1, pieceProgress.length)} defined`,
      status: pieceProgress.length > 0 ? "started" : "not_started",
      warning: pieceProgress.length === 0 ? "No map pieces" : undefined,
    },
    gps_alignment: {
      summary: `${placedPieces}/${Math.max(1, pieceProgress.length)} placed`,
      status: placedPieces === pieceProgress.length && pieceProgress.length > 0 ? "placed" : placedPieces > 0 ? "started" : "not_started",
      warning: placedPieces < pieceProgress.length ? "Unplaced pieces" : undefined,
    },
  };

  return (
    <aside className="sanborn-atlas-navigator" aria-label="Town Reconstruction station rail">
      <header className="sanborn-atlas-navigator__header">
        <span>Town Reconstruction</span>
        <strong>{townProgress.completionPercent}%</strong>
      </header>
      <nav className="sanborn-atlas-navigator__steps" aria-label="Historical Map Studio stations">
        {sanbornAtlasWorkflowSteps.map((step, index) => {
          const summary = stationSummaries[step.id];
          return (
            <button
              aria-current={workflowStep === step.id ? "step" : undefined}
              aria-label={`${index + 1}. ${step.label}. ${summary.summary}. ${statusLabel(summary.status)}${summary.warning ? `. Warning: ${summary.warning}` : ""}`}
              className={`sanborn-atlas-navigator__step is-${statusClass(summary.status)}${workflowStep === step.id ? " is-active" : ""}${summary.warning ? " has-warning" : ""}`}
              key={step.id}
              onClick={() => onWorkflowStepChange(step.id)}
              title={`${summary.summary}${summary.warning ? ` - ${summary.warning}` : ""}`}
              type="button"
            >
              <span className="sanborn-atlas-navigator__step-number">{index + 1}</span>
              <span className="sanborn-atlas-navigator__step-label">{step.label}</span>
              <span className="sanborn-atlas-navigator__step-status">{summary.summary}</span>
              <span className="sanborn-atlas-navigator__step-indicator" aria-hidden="true" />
            </button>
          );
        })}
      </nav>
      {inventory.warningMessage ? <p className="sanborn-atlas-warning">{inventory.warningMessage}</p> : null}
    </aside>
  );
}
