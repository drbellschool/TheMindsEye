"use client";

import { useEffect, useMemo, useState } from "react";

import {
  sanbornPageTypes,
  type SanbornAtlasInventoryState,
  type SanbornAtlasPageRecord,
  type SanbornAtlasRecord,
  type SanbornPageType,
} from "@/lib/sanborn-atlas";
import type { StudioSheetAsset, StudioSourceOption, StudioTownPackage } from "@/lib/historical-map-studio";
import type { SanbornMapPieceGeoreference } from "@/lib/sanborn-map-piece-georeference";
import {
  buildReconstructionWorkQueue,
  buildTownIndexSummary,
  calculateMapPieceProgress,
  calculateSheetProgress,
  calculateTownProgress,
  type ReconstructionWorkTask,
  type SheetReconstructionProgress,
  type TownIndexSummary,
  type TownReconstructionProgress,
} from "@/lib/town-reconstruction";

export type SanbornAtlasWorkflowStep =
  | "source"
  | "page_classification"
  | "town_index"
  | "numbered_sheets"
  | "piece_inventory"
  | "gps_alignment"
  | "building_reconstruction"
  | "people_activity"
  | "evidence_review";

export const sanbornAtlasWorkflowSteps: Array<{ id: SanbornAtlasWorkflowStep; label: string; operational: boolean }> = [
  { id: "source", label: "Town & Edition", operational: true },
  { id: "page_classification", label: "Source Record", operational: true },
  { id: "town_index", label: "Town Index", operational: true },
  { id: "numbered_sheets", label: "Sheet Inventory", operational: true },
  { id: "piece_inventory", label: "Map Pieces / Blocks", operational: true },
  { id: "gps_alignment", label: "Map Placement", operational: true },
  { id: "building_reconstruction", label: "Building Reconstruction", operational: false },
  { id: "people_activity", label: "People & Activity", operational: false },
  { id: "evidence_review", label: "Evidence Review", operational: false },
];

type AtlasDraft = {
  atlasId?: string;
  title: string;
  editionYear: string;
  editionDate: string;
  volumeLabel: string;
  expectedPageCount: string;
  sourceRecordId: string;
};

type SanbornAtlasNavigatorProps = {
  inventory: SanbornAtlasInventoryState;
  assets: StudioSheetAsset[];
  sourceOptions: StudioSourceOption[];
  activeTownPackage: StudioTownPackage | null;
  activeMapYear: number | null;
  mapPieceGeoreferences: SanbornMapPieceGeoreference[];
  fallbackYear: number | null;
  selectedAtlasId: string;
  selectedPageId: string;
  selectedPieceId: string;
  workflowStep: SanbornAtlasWorkflowStep;
  readOnly: boolean;
  onSelectAtlas: (atlasId: string) => void;
  onSelectPage: (pageId: string) => void;
  onSelectPiece: (pieceId: string) => void;
  onWorkflowStepChange: (step: SanbornAtlasWorkflowStep) => void;
  onSaveAtlas: (draft: AtlasDraft) => void;
  onAssignAsset: (assetId: string) => void;
  onPatchPage: (pageId: string, patch: Partial<SanbornAtlasPageRecord>) => void;
  onReorderPage: (pageId: string, direction: "up" | "down") => void;
  onSavePages: () => void;
  onSavePagesAndContinue: () => void;
  pieceInventoryBlocked: boolean;
  saveActionsDisabled: boolean;
};

function createDraft(atlas: SanbornAtlasRecord | null, fallbackYear: number | null): AtlasDraft {
  return {
    atlasId: atlas?.atlasId,
    title: atlas?.title ?? "",
    editionYear: String(atlas?.editionYear ?? fallbackYear ?? ""),
    editionDate: atlas?.editionDate ?? "",
    volumeLabel: atlas?.volumeLabel ?? "",
    expectedPageCount: atlas?.expectedPageCount ? String(atlas.expectedPageCount) : "",
    sourceRecordId: atlas?.sourceRecordId ?? "",
  };
}

function assetLabel(asset: StudioSheetAsset): string {
  return `Sheet ${asset.sheetNumber ?? "?"} - ${asset.originalFilename}`;
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function ProgressPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="reconstruction-mini-pill">
      <strong>{value}</strong>
      {label}
    </span>
  );
}

function ReconstructionRailSummary({ progress }: { progress: TownReconstructionProgress }) {
  return (
    <section className="sanborn-atlas-navigator__section reconstruction-rail-summary" aria-label="Town package dashboard">
      <h3>Town Package dashboard</h3>
      <div className="reconstruction-rail-summary__progress">
        <div className="reconstruction-progress" role="progressbar" aria-label="Town reconstruction progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.completionPercent}>
          <span style={{ width: `${progress.completionPercent}%` }} />
        </div>
        <strong>{progress.completionPercent}%</strong>
      </div>
      <div className="reconstruction-rail-summary__metrics">
        <ProgressPill label="sheets" value={progress.sheetCount} />
        <ProgressPill label="sheets aligned" value={progress.sheetsAligned} />
        <ProgressPill label="pieces" value={progress.mapPiecesIdentified} />
        <ProgressPill label="placed" value={progress.mapPiecesPlaced} />
        <ProgressPill label="sources" value={progress.sourceRecordCount} />
        <ProgressPill label="unresolved" value={progress.unresolvedWorkCount} />
      </div>
    </section>
  );
}

function TownIndexPanel({
  summary,
  onSelectPage,
}: {
  summary: TownIndexSummary;
  onSelectPage: (pageId: string) => void;
}) {
  return (
    <section className="sanborn-atlas-navigator__section reconstruction-index-panel" aria-label="Town Index navigator">
      <h3>Town Index</h3>
      {summary.indexAsset?.signedUrl ? (
        <img alt={summary.indexPage?.displayLabel || "Town Index page"} className="reconstruction-index-panel__thumbnail" src={summary.indexAsset.signedUrl} />
      ) : (
        <p className="sanborn-atlas-empty">No designated Town Index image is available yet.</p>
      )}
      <div className="reconstruction-index-panel__regions">
        {summary.regions.length > 0 ? (
          summary.regions.map((region) => (
            <button
              className={`reconstruction-region-button is-${region.status}`}
              disabled={!region.atlasPageId}
              key={region.id}
              onClick={() => region.atlasPageId && onSelectPage(region.atlasPageId)}
              type="button"
            >
              <strong>{region.label}</strong>
              <span>{statusLabel(region.status)}</span>
            </button>
          ))
        ) : (
          <p className="sanborn-atlas-empty">Index regions are not linked to numbered sheets yet.</p>
        )}
      </div>
    </section>
  );
}

function SheetInventoryPanel({
  sheets,
  onSelectPage,
}: {
  sheets: SheetReconstructionProgress[];
  onSelectPage: (pageId: string) => void;
}) {
  return (
    <section className="sanborn-atlas-navigator__section reconstruction-sheet-panel" aria-label="Sheet Inventory">
      <h3>Sheet Inventory</h3>
      <div className="reconstruction-sheet-list">
        {sheets.map((sheet) => (
          <button
            className={`reconstruction-sheet-list__item is-${sheet.status}`}
            disabled={!sheet.pageId}
            key={sheet.sheetAssetId}
            onClick={() => sheet.pageId && onSelectPage(sheet.pageId)}
            type="button"
          >
            <strong>{sheet.displayLabel}</strong>
            <span>{sheet.mapPiecesIdentified} pieces, {sheet.mapPiecesPlaced} placed</span>
            <span>{sheet.sourceLinked ? "Source linked" : "Missing source"} | {statusLabel(sheet.status)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PieceWorkloadPanel({
  pieces,
  selectedPieceId,
  onSelectPiece,
}: {
  pieces: ReturnType<typeof calculateMapPieceProgress>[];
  selectedPieceId: string;
  onSelectPiece: (pieceId: string) => void;
}) {
  const placed = pieces.filter((piece) => piece.geographicPlacementSaved).length;
  const hidden = pieces.filter((piece) => !piece.visibleAndOperational && piece.geographicPlacementSaved).length;
  const reviewed = pieces.filter((piece) => piece.reviewed).length;

  return (
    <section className="sanborn-atlas-navigator__section reconstruction-piece-panel" aria-label="Map-piece and block workload">
      <h3>Map Pieces / Blocks</h3>
      <div className="reconstruction-rail-summary__metrics">
        <ProgressPill label="total" value={pieces.length} />
        <ProgressPill label="placed" value={placed} />
        <ProgressPill label="unplaced" value={Math.max(0, pieces.length - placed)} />
        <ProgressPill label="hidden" value={hidden} />
        <ProgressPill label="reviewed" value={reviewed} />
      </div>
      <div className="reconstruction-piece-list">
        {pieces.length > 0 ? (
          pieces.map((piece) => (
            <button
              className={`reconstruction-piece-list__item${piece.pieceId === selectedPieceId ? " is-selected" : ""} is-${piece.status}`}
              key={piece.pieceId}
              onClick={() => onSelectPiece(piece.pieceId)}
              type="button"
            >
              <strong>{piece.label}</strong>
              <span>{piece.pieceType.replaceAll("_", " ")}</span>
              <span>{statusLabel(piece.status)}</span>
            </button>
          ))
        ) : (
          <p className="sanborn-atlas-empty">No map pieces or blocks are identified on this edition yet.</p>
        )}
      </div>
    </section>
  );
}

function WorkQueuePanel({ tasks }: { tasks: ReconstructionWorkTask[] }) {
  return (
    <section className="sanborn-atlas-navigator__section reconstruction-work-queue" aria-label="Available Work">
      <h3>Available Work</h3>
      {tasks.length === 0 ? (
        <p className="sanborn-atlas-empty">No calculated reconstruction tasks are currently open.</p>
      ) : (
        <div className="reconstruction-task-list">
          {tasks.slice(0, 6).map((task) => (
            <article className={`reconstruction-task-list__item is-${task.priority}`} key={task.id}>
              <strong>{task.label}</strong>
              <span>{task.detail}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function SanbornAtlasNavigator({
  inventory,
  assets,
  sourceOptions,
  activeTownPackage,
  activeMapYear,
  mapPieceGeoreferences,
  fallbackYear,
  selectedAtlasId,
  selectedPageId,
  selectedPieceId,
  workflowStep,
  readOnly,
  onSelectAtlas,
  onSelectPage,
  onSelectPiece,
  onWorkflowStepChange,
  onSaveAtlas,
  onAssignAsset,
  onPatchPage,
  onReorderPage,
  onSavePages,
  onSavePagesAndContinue,
  pieceInventoryBlocked,
  saveActionsDisabled,
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
  const unassignedAssets = assets.filter((asset) => inventory.unassignedAssetIds.includes(asset.assetId));
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
  const townIndexSummary = useMemo<TownIndexSummary>(
    () =>
      buildTownIndexSummary({
        pages: activePages,
        assets,
        pieces: activePieces,
        placements: mapPieceGeoreferences,
      }),
    [activePages, activePieces, assets, mapPieceGeoreferences],
  );
  const townProgress = useMemo<TownReconstructionProgress>(
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
  const workQueue = useMemo<ReconstructionWorkTask[]>(
    () =>
      buildReconstructionWorkQueue({
        townPackageId: activeTownPackage?.id,
        mapYear: activeMapYear,
        atlasId: activeAtlas?.atlasId,
        sheets: sheetProgress,
        pieces: pieceProgress,
        index: townIndexSummary,
        sourceRecordCount: sourceOptions.length,
      }),
    [activeAtlas?.atlasId, activeMapYear, activeTownPackage?.id, pieceProgress, sheetProgress, sourceOptions.length, townIndexSummary],
  );
  const [draft, setDraft] = useState<AtlasDraft>(createDraft(activeAtlas, fallbackYear));
  const showSaveAtlas = workflowStep === "source" || workflowStep === "page_classification";
  const showSavePagesAndContinue = workflowStep === "piece_inventory" && pieceInventoryBlocked;
  const showSavePageOrder = activePages.length > 0 && !showSaveAtlas && !showSavePagesAndContinue;
  const showAtlasEditor = workflowStep === "source";
  const showSourceRecordStage = workflowStep === "page_classification";
  const showTownIndexStage = workflowStep === "town_index";
  const showSheetInventoryStage = workflowStep === "numbered_sheets";
  const showPieceStage = workflowStep === "piece_inventory";

  useEffect(() => {
    setDraft(createDraft(activeAtlas, fallbackYear));
  }, [activeAtlas?.atlasId, activeAtlas?.updatedAt, fallbackYear]);

  return (
    <aside className="sanborn-atlas-navigator">
      <nav className="sanborn-atlas-navigator__steps" aria-label="Sanborn atlas workflow">
        {sanbornAtlasWorkflowSteps.map((step) => (
          <button
            className={`sanborn-atlas-navigator__step${workflowStep === step.id ? " is-active" : ""}`}
            key={step.id}
            onClick={() => onWorkflowStepChange(step.id)}
            type="button"
          >
            <span>{sanbornAtlasWorkflowSteps.indexOf(step) + 1}</span>
            {step.label}
          </button>
        ))}
      </nav>

      <div className="sanborn-atlas-navigator__scroll">
        {inventory.warningMessage ? <p className="sanborn-atlas-warning">{inventory.warningMessage}</p> : null}

        <ReconstructionRailSummary progress={townProgress} />

        {showSourceRecordStage ? (
          <section className="sanborn-atlas-navigator__section reconstruction-source-panel" aria-label="Source Record">
            <h3>Source Record</h3>
            <p className="sanborn-atlas-empty">
              Source details are optional during upload, but every sheet should be linked before review. {sheetProgress.filter((sheet) => !sheet.sourceLinked).length} sheet(s) are missing durable provenance.
            </p>
            <label>
              Atlas source
              <select disabled={readOnly} value={draft.sourceRecordId} onChange={(event) => setDraft({ ...draft, sourceRecordId: event.target.value })}>
                <option value="">No linked source record</option>
                {sourceOptions.map((source) => (
                  <option key={source.sourceRecordId} value={source.sourceRecordId}>
                    {(source.internalSourceId ?? source.sourceId)} - {source.title}
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : null}

        {showTownIndexStage ? <TownIndexPanel summary={townIndexSummary} onSelectPage={onSelectPage} /> : null}

        {showSheetInventoryStage ? <SheetInventoryPanel sheets={sheetProgress} onSelectPage={onSelectPage} /> : null}

        {showPieceStage ? <PieceWorkloadPanel pieces={pieceProgress} selectedPieceId={selectedPieceId} onSelectPiece={onSelectPiece} /> : null}

        <WorkQueuePanel tasks={workQueue} />

        {showAtlasEditor ? (
        <section className="sanborn-atlas-navigator__section">
          <h3>Atlas / edition</h3>
          <label>
            Select atlas
            <select disabled={readOnly || inventory.atlases.length === 0} value={selectedAtlasId} onChange={(event) => onSelectAtlas(event.target.value)}>
              <option value="">No atlas selected</option>
              {inventory.atlases.map((atlas) => (
                <option key={atlas.atlasId} value={atlas.atlasId}>
                  {atlas.title}
                </option>
              ))}
            </select>
          </label>
          <div className="sanborn-atlas-navigator__form">
            <label>
              Title
              <input disabled={readOnly} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label>
              Edition year
              <input disabled={readOnly} inputMode="numeric" value={draft.editionYear} onChange={(event) => setDraft({ ...draft, editionYear: event.target.value })} />
            </label>
            <label>
              Edition date
              <input disabled={readOnly} placeholder="YYYY-MM-DD" value={draft.editionDate} onChange={(event) => setDraft({ ...draft, editionDate: event.target.value })} />
            </label>
            <label>
              Volume label
              <input disabled={readOnly} value={draft.volumeLabel} onChange={(event) => setDraft({ ...draft, volumeLabel: event.target.value })} />
            </label>
            <label>
              Expected pages
              <input disabled={readOnly} inputMode="numeric" value={draft.expectedPageCount} onChange={(event) => setDraft({ ...draft, expectedPageCount: event.target.value })} />
            </label>
            <label>
              Source record
              <select disabled={readOnly} value={draft.sourceRecordId} onChange={(event) => setDraft({ ...draft, sourceRecordId: event.target.value })}>
                <option value="">No linked source record</option>
                {sourceOptions.map((source) => (
                  <option key={source.sourceRecordId} value={source.sourceRecordId}>
                    {source.sourceId} - {source.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        ) : null}

        {showAtlasEditor || showSheetInventoryStage ? (
        <section className="sanborn-atlas-navigator__section">
          <h3>Unassigned uploads</h3>
          {unassignedAssets.length === 0 ? (
            <p className="sanborn-atlas-empty">All uploaded Sanborn sheets are assigned to an atlas page.</p>
          ) : (
            <div className="sanborn-atlas-upload-list">
              {unassignedAssets.map((asset) => (
                <div className="sanborn-atlas-upload-list__item" key={asset.assetId}>
                  <span>{assetLabel(asset)}</span>
                  <button className="sanborn-button" disabled={readOnly || !selectedAtlasId} onClick={() => onAssignAsset(asset.assetId)} type="button">
                    Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        ) : null}

        {showSheetInventoryStage || showPieceStage || showTownIndexStage ? (
        <section className="sanborn-atlas-navigator__section">
          <h3>Atlas pages</h3>
          {activePages.length === 0 ? (
            <p className="sanborn-atlas-empty">No pages are assigned to this atlas yet.</p>
          ) : (
            <div className="sanborn-atlas-page-list">
              {activePages.map((page, index) => {
                const asset = assets.find((candidate) => candidate.assetId === page.sanbornSheetAssetId) ?? null;
                return (
                  <article className={`sanborn-atlas-page-list__item${page.pageId === selectedPageId ? " is-selected" : ""}`} key={page.pageId}>
                    <button className="sanborn-atlas-page-list__select" onClick={() => onSelectPage(page.pageId)} type="button">
                      <strong>{page.displayLabel || `Page ${page.pageSequence}`}</strong>
                      <span>{asset ? assetLabel(asset) : page.sanbornSheetAssetId}</span>
                      <span className={`sanborn-atlas-page-list__state${page.isPersisted ? " is-saved" : " is-draft"}`}>
                        {page.isPersisted ? "Saved page" : "Draft assignment"}
                      </span>
                    </button>
                    <div className="sanborn-atlas-page-list__fields">
                      <label>
                        Sequence
                        <input disabled={readOnly} inputMode="numeric" value={page.pageSequence} onChange={(event) => onPatchPage(page.pageId, { pageSequence: Number(event.target.value) })} />
                      </label>
                      <label>
                        Type
                        <select disabled={readOnly} value={page.pageType} onChange={(event) => onPatchPage(page.pageId, { pageType: event.target.value as SanbornPageType })}>
                          {sanbornPageTypes.map((type) => (
                            <option key={type} value={type}>
                              {type.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Sheet number
                        <input disabled={readOnly} inputMode="numeric" value={page.sheetNumber ?? ""} onChange={(event) => onPatchPage(page.pageId, { sheetNumber: event.target.value ? Number(event.target.value) : null })} />
                      </label>
                      <label>
                        Volume
                        <input disabled={readOnly} value={page.volumeLabel ?? ""} onChange={(event) => onPatchPage(page.pageId, { volumeLabel: event.target.value })} />
                      </label>
                      <label>
                        Display label
                        <input disabled={readOnly} value={page.displayLabel ?? ""} onChange={(event) => onPatchPage(page.pageId, { displayLabel: event.target.value })} />
                      </label>
                    </div>
                    <div className="sanborn-atlas-page-list__actions">
                      <button className="sanborn-button" disabled={readOnly || index === 0} onClick={() => onReorderPage(page.pageId, "up")} type="button">
                        Move up
                      </button>
                      <button className="sanborn-button" disabled={readOnly || index === activePages.length - 1} onClick={() => onReorderPage(page.pageId, "down")} type="button">
                        Move down
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        ) : null}
      </div>

      <footer className="sanborn-atlas-navigator__footer" aria-label="Atlas workflow actions">
        {showSaveAtlas ? (
          <button className="sanborn-button sanborn-button--primary" disabled={readOnly || saveActionsDisabled || !draft.editionYear} onClick={() => onSaveAtlas(draft)} type="button">
            Save atlas
          </button>
        ) : null}
        {showSavePageOrder ? (
          <button className="sanborn-button sanborn-button--primary" disabled={readOnly || saveActionsDisabled || !selectedAtlasId} onClick={onSavePages} type="button">
            Save page order
          </button>
        ) : null}
        {showSavePagesAndContinue ? (
          <button className="sanborn-button sanborn-button--primary" disabled={readOnly || saveActionsDisabled || !selectedAtlasId} onClick={onSavePagesAndContinue} type="button">
            Save pages and continue
          </button>
        ) : null}
        {!showSaveAtlas && !showSavePageOrder && !showSavePagesAndContinue ? (
          <span className="sanborn-atlas-navigator__footer-note">Select or assign a page to continue.</span>
        ) : null}
      </footer>
    </aside>
  );
}
