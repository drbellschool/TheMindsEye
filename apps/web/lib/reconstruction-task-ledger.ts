import type { StudioSheetAsset, StudioSourceOption, StudioTownPackage } from "./historical-map-studio.ts";
import type { SanbornAtlasPageRecord, SanbornAtlasRecord, SanbornMapPieceRecord } from "./sanborn-atlas.ts";
import { getSanbornPageDisplayLabel, getSanbornPagePrintedReference, pageTypeSupportsMapPieces, isClassifiedSanbornPage } from "./sanborn-atlas.ts";
import type { SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";
import { deriveCanonicalMapPiecePlacementStatus } from "./map-piece-placement-status.ts";
import { getActiveSanbornMapPieceFeatureCategories, sanbornMapPieceReviewStatuses } from "./sanborn-map-piece-features.ts";
import { deriveSheetMapPieceAudit } from "./sheet-map-piece-audit.ts";
import { sourceRegionSupportsMapPieces, type SanbornTownIndexRegionRecord } from "./sanborn-town-index.ts";
import type { ReconstructionContextQuery, ReconstructionWorkflowStepId } from "./town-reconstruction.ts";

export const ledgerWorkflowOrder: ReconstructionWorkflowStepId[] = [
  "town_edition",
  "source_record",
  "town_index",
  "sheet_inventory",
  "map_pieces_blocks",
  "map_placement",
  "evidence_review",
];

export type ReconstructionLedgerTaskState = "blocking" | "incomplete" | "review" | "exception" | "completed";

export type ReconstructionLedgerTask = {
  id: string;
  label: string;
  detail: string;
  stage: ReconstructionWorkflowStepId;
  priority: "high" | "normal" | "low";
  state: ReconstructionLedgerTaskState;
  resolved: boolean;
  context: ReconstructionContextQuery;
  category: string;
  parentId?: string;
};

export type ReconstructionLedgerProgress = {
  resolved: number;
  required: number;
  percent: number;
  explanation: string;
  breakdown: Array<{ label: string; resolved: number; required: number; percent: number }>;
};

export type ReconstructionTaskLedger = {
  tasks: ReconstructionLedgerTask[];
  overall: ReconstructionLedgerProgress;
  currentStage: ReconstructionLedgerProgress;
  activeSheet: ReconstructionLedgerProgress;
  edition: ReconstructionLedgerProgress;
  town: ReconstructionLedgerProgress;
  nextIncompleteTask: ReconstructionLedgerTask | null;
};

const reviewableCategories = getActiveSanbornMapPieceFeatureCategories();
const completedReviewStatuses = new Set(["reviewed_found", "reviewed_none_found"]);

function percent(resolved: number, required: number): number {
  return required > 0 ? Math.max(0, Math.min(100, Math.round((resolved / required) * 100))) : 0;
}

function progress(tasks: ReconstructionLedgerTask[], label: string): ReconstructionLedgerProgress {
  const resolved = tasks.filter((task) => task.resolved).length;
  const required = tasks.length;
  const value = percent(resolved, required);
  return {
    resolved,
    required,
    percent: value,
    explanation: `${value}% complete: ${resolved} of ${required} required tasks are resolved.`,
    breakdown: [{ label, resolved, required, percent: value }],
  };
}

function groupedProgress(tasks: ReconstructionLedgerTask[], label: string): ReconstructionLedgerProgress {
  const groups = new Map<string, ReconstructionLedgerTask[]>();
  for (const task of tasks) groups.set(task.category, [...(groups.get(task.category) ?? []), task]);
  const breakdown = [...groups.entries()].map(([group, groupTasks]) => {
    const resolved = groupTasks.filter((task) => task.resolved).length;
    return { label: group, resolved, required: groupTasks.length, percent: percent(resolved, groupTasks.length) };
  });
  const base = progress(tasks, label);
  return { ...base, breakdown };
}

function task(input: Omit<ReconstructionLedgerTask, "resolved"> & { resolved: boolean }): ReconstructionLedgerTask {
  return input;
}

function sourceLinked(asset: StudioSheetAsset | undefined): boolean {
  return Boolean(asset?.sourceRecordId);
}

function pageNeedsPrintedReference(page: SanbornAtlasPageRecord, pageRegions: SanbornTownIndexRegionRecord[]): boolean {
  return pageTypeSupportsMapPieces(page.pageType) || page.pageType === "index_or_mixed" || page.pageType === "street_index" || page.pageType === "special_sheet" || pageRegions.some(sourceRegionSupportsMapPieces);
}

function regionResolved(region: SanbornTownIndexRegionRecord): { resolved: boolean; exception: boolean } {
  const documentedException = (region.referenceResolution === "missing" || region.referenceResolution === "not_applicable") && Boolean(region.referenceResolutionNote?.trim() || region.notes?.trim());
  const reviewed = region.workflowStatus === "reviewed" || region.progressStatus === "reviewed" || region.workflowStatus === "placed" || region.progressStatus === "placed";
  return { resolved: documentedException || reviewed, exception: documentedException };
}

function pieceReviewed(piece: SanbornMapPieceRecord, placement: SanbornMapPieceGeoreference | undefined): boolean {
  return piece.inventoryStatus === "reviewed" || piece.reviewStatus === "verified_fact" || placement?.reviewStatus === "verified_fact" || placement?.placementStatus === "reviewed";
}

export function deriveReconstructionTaskLedger(input: {
  town: StudioTownPackage | null;
  atlas: SanbornAtlasRecord | null;
  pages: readonly SanbornAtlasPageRecord[];
  assets: readonly StudioSheetAsset[];
  regions: readonly SanbornTownIndexRegionRecord[];
  pieces: readonly SanbornMapPieceRecord[];
  placements: readonly SanbornMapPieceGeoreference[];
  sourceOptions: readonly StudioSourceOption[];
  currentStage?: ReconstructionWorkflowStepId;
  activePageId?: string | null;
}): ReconstructionTaskLedger {
  const base = { townPackageId: input.town?.id, mapYear: input.atlas?.editionYear, atlasId: input.atlas?.atlasId };
  const activePages = input.atlas && !input.atlas.archivedAt ? input.pages.filter((page) => page.atlasId === input.atlas?.atlasId && !page.archivedAt) : [];
  const activePageIds = new Set(activePages.map((page) => page.pageId));
  const activePieces = input.pieces.filter((piece) => activePageIds.has(piece.atlasPageId) && piece.isPersisted !== false);
  const activeRegions = input.regions.filter((region) => region.atlasId === input.atlas?.atlasId && activePageIds.has(region.indexAtlasPageId));
  const placements = new Map(input.placements.map((placement) => [placement.pieceId, placement]));
  const assets = new Map(input.assets.map((asset) => [asset.assetId, asset]));
  const tasks: ReconstructionLedgerTask[] = [];

  if (!input.town) {
    tasks.push(task({ id: "town-prerequisite", label: "Select a town package", detail: "Choose the town that owns this reconstruction evidence.", stage: "town_edition", priority: "high", state: "blocking", resolved: false, context: {}, category: "Town & Edition" }));
  }
  if (!input.atlas || input.atlas.archivedAt) {
    tasks.push(task({ id: "edition-prerequisite", label: "Create or select an active edition", detail: "An active non-archived Sanborn edition is required before review can begin.", stage: "town_edition", priority: "high", state: "blocking", resolved: false, context: base, category: "Town & Edition" }));
  } else {
    tasks.push(task({ id: "edition-prerequisite", label: "Active edition selected", detail: "The active edition is ready for source and map review.", stage: "town_edition", priority: "low", state: "completed", resolved: true, context: base, category: "Town & Edition" }));
  }

  const regionsByPage = new Map<string, SanbornTownIndexRegionRecord[]>();
  for (const region of activeRegions) regionsByPage.set(region.indexAtlasPageId, [...(regionsByPage.get(region.indexAtlasPageId) ?? []), region]);
  const indexPages = activePages.filter((page) => page.isPrimaryTownIndex);
  const primaryIndex = indexPages.length === 1 ? indexPages[0] : null;

  for (const page of activePages) {
    const asset = assets.get(page.sanbornSheetAssetId);
    const pageRegions = regionsByPage.get(page.pageId) ?? [];
    const context = { ...base, atlasPageId: page.pageId, sheetAssetId: page.sanbornSheetAssetId };
    const label = getSanbornPageDisplayLabel(page);
    const classified = isClassifiedSanbornPage(page);
    if (!classified) tasks.push(task({ id: `source-classify:${page.pageId}`, label: `Classify ${label}`, detail: "Choose the page classification before downstream tools are enabled.", stage: "source_record", priority: "high", state: "blocking", resolved: false, context: { ...context, workflow: "page_classification" }, category: "Source pages" }));
    if (!sourceLinked(asset)) tasks.push(task({ id: `source-link:${page.pageId}`, label: `Link a source for ${label}`, detail: "Review the citation and connect this uploaded file to a source record.", stage: "source_record", priority: "high", state: "blocking", resolved: false, context: { ...context, workflow: "source" }, category: "Source pages" }));
    if (pageNeedsPrintedReference(page, pageRegions) && !getSanbornPagePrintedReference(page)) tasks.push(task({ id: `source-reference:${page.pageId}`, label: `Confirm printed reference for ${label}`, detail: "Record the printed sheet reference from the source image.", stage: "source_record", priority: "normal", state: "incomplete", resolved: false, context: { ...context, workflow: "page_classification" }, category: "Source pages" }));
  }

  if (activePages.length > 0 && indexPages.length === 0) tasks.push(task({ id: "primary-index:missing", label: "Identify the primary Sanborn index", detail: "Confirm exactly one uploaded page as the edition's primary index.", stage: "source_record", priority: "normal", state: "blocking", resolved: false, context: { ...base, workflow: "page_classification" }, category: "Source pages" }));
  if (indexPages.length > 1) tasks.push(task({ id: "primary-index:conflict", label: "Resolve the primary index conflict", detail: "Only one active page may be confirmed as the primary index.", stage: "source_record", priority: "high", state: "blocking", resolved: false, context: { ...base, workflow: "page_classification" }, category: "Source pages" }));
  if (primaryIndex && (regionsByPage.get(primaryIndex.pageId) ?? []).length === 0) tasks.push(task({ id: `functional-regions:${primaryIndex.pageId}`, label: "Review functional regions on the primary index", detail: "Mark and review the coverage, index, Specials, Key, and other source regions.", stage: "town_index", priority: "high", state: "review", resolved: false, context: { ...base, atlasPageId: primaryIndex.pageId, sheetAssetId: primaryIndex.sanbornSheetAssetId, workflow: "town_index" }, category: "Functional source regions" }));

  for (const region of activeRegions) {
    const resolution = regionResolved(region);
    if (!resolution.resolved) tasks.push(task({ id: `index-region:${region.regionId}`, label: `Review index region ${region.regionLabel || region.sheetReference || region.regionId}`, detail: "Confirm its link, reference resolution, status, and notes.", stage: "town_index", priority: "normal", state: region.workflowStatus === "conflict" ? "blocking" : "review", resolved: false, context: { ...base, atlasPageId: region.indexAtlasPageId, indexRegionId: region.regionId, workflow: "town_index" }, category: "Town Index review" }));
    else if (resolution.exception) tasks.push(task({ id: `index-region:${region.regionId}`, label: `Documented exception: ${region.regionLabel || region.regionId}`, detail: "This missing or not-applicable region is resolved because its explanation is saved.", stage: "town_index", priority: "low", state: "exception", resolved: true, context: { ...base, atlasPageId: region.indexAtlasPageId, indexRegionId: region.regionId, workflow: "town_index" }, category: "Town Index review" }));
  }

  for (const page of activePages) {
    const pagePieces = activePieces.filter((piece) => piece.atlasPageId === page.pageId);
    if (!pageTypeSupportsMapPieces(page.pageType) && pagePieces.length === 0) continue;
    const asset = assets.get(page.sanbornSheetAssetId);
    const sheetAudit = deriveSheetMapPieceAudit({ pieces: pagePieces, reviewCategories: page.reviewCategories });
    for (const category of reviewableCategories) {
      const status = sheetAudit.categories.find((auditCategory) => auditCategory.category === category)?.reviewStatus;
      if (!completedReviewStatuses.has(status ?? "")) tasks.push(task({ id: `sheet-category:${page.pageId}:${category}`, label: `Review ${category.replaceAll("_", " ")} on ${getSanbornPageDisplayLabel(page)}`, detail: "Mark Reviewed — items found or Reviewed — none found; an empty list is not complete.", stage: "sheet_inventory", priority: "normal", state: "review", resolved: false, context: { ...base, atlasPageId: page.pageId, sheetAssetId: asset?.assetId, workflow: "piece_inventory" }, category: "Sheet review categories", parentId: `sheet:${page.pageId}` }));
    }
  }

  for (const piece of activePieces) {
    const placement = placements.get(piece.pieceId);
    const context = { ...base, atlasPageId: piece.atlasPageId, mapPieceId: piece.pieceId, workflow: "piece_inventory" };
    const label = piece.titleText || (piece.blockNumberText ? `Block ${piece.blockNumberText}` : `Feature ${String(piece.pieceSequence).padStart(2, "0")}`);
    if (!pieceReviewed(piece, placement)) tasks.push(task({ id: `object-review:${piece.pieceId}`, label: `Review ${label}`, detail: "Confirm the object label, category, geometry, and notes.", stage: "map_pieces_blocks", priority: "normal", state: "review", resolved: false, context, category: "Geographic objects", parentId: `sheet:${piece.atlasPageId}` }));
    if ((piece.placementEligibility ?? "available") !== "available") continue;
    const canonicalStatus = deriveCanonicalMapPiecePlacementStatus({ placement });
    const unableResolved = canonicalStatus === "unable_to_place";
    const placed = canonicalStatus === "placed" || canonicalStatus === "reviewed";
    const placementReviewed = canonicalStatus === "reviewed";
    if (unableResolved) tasks.push(task({ id: `placement:${piece.pieceId}`, label: `${label} unable to place`, detail: "Documented placement exception is resolved.", stage: "map_placement", priority: "low", state: "exception", resolved: true, context: { ...context, workflow: "gps_alignment" }, category: "Placement tasks", parentId: `object-review:${piece.pieceId}` }));
    else if (canonicalStatus === "draft") tasks.push(task({ id: `placement:${piece.pieceId}`, label: `Save or reset ${label}`, detail: "This object has an unsaved geographic draft. Save it or reset the draft before continuing.", stage: "map_placement", priority: "normal", state: "incomplete", resolved: false, context: { ...context, workflow: "gps_alignment" }, category: "Placement tasks", parentId: `object-review:${piece.pieceId}` }));
    else if (!placed) tasks.push(task({ id: `placement:${piece.pieceId}`, label: `Place ${label}`, detail: "Save a geographic placement or document why it cannot be placed.", stage: "map_placement", priority: "normal", state: "incomplete", resolved: false, context: { ...context, workflow: "gps_alignment" }, category: "Placement tasks", parentId: `object-review:${piece.pieceId}` }));
    else if (!placementReviewed) tasks.push(task({ id: `placement:${piece.pieceId}`, label: `Review placement for ${label}`, detail: "Confirm the saved geographic placement.", stage: "map_placement", priority: "normal", state: "review", resolved: false, context: { ...context, workflow: "gps_alignment" }, category: "Placement tasks", parentId: `object-review:${piece.pieceId}` }));
    else tasks.push(task({ id: `placement:${piece.pieceId}`, label: `${label} placement reviewed`, detail: "Placement review is complete.", stage: "map_placement", priority: "low", state: "completed", resolved: true, context: { ...context, workflow: "gps_alignment" }, category: "Placement tasks", parentId: `object-review:${piece.pieceId}` }));
  }

  const preFinal = tasks.filter((candidate) => candidate.stage !== "evidence_review");
  const allPriorResolved = preFinal.length > 0 && preFinal.every((candidate) => candidate.resolved);
  tasks.push(task({ id: "edition-review:final", label: "Review edition reconstruction", detail: allPriorResolved ? "All discovered source, index, sheet, object, and placement work is resolved." : "Resolve earlier workflow tasks before final edition review.", stage: "evidence_review", priority: allPriorResolved ? "normal" : "low", state: allPriorResolved ? "incomplete" : "blocking", resolved: false, context: { ...base, workflow: "evidence_review" }, category: "Edition review" }));

  const ordered = tasks.sort((left, right) => ledgerWorkflowOrder.indexOf(left.stage) - ledgerWorkflowOrder.indexOf(right.stage) || (left.priority === "high" ? -1 : right.priority === "high" ? 1 : 0) || left.id.localeCompare(right.id));
  const nextIncompleteTask = ordered.find((candidate) => !candidate.resolved) ?? null;
  const currentStageTasks = ordered.filter((candidate) => candidate.stage === (input.currentStage ?? "town_edition"));
  const activeSheetTasks = input.activePageId ? ordered.filter((candidate) => candidate.context.atlasPageId === input.activePageId) : [];
  const edition = groupedProgress(ordered, "Edition");
  return {
    tasks: ordered,
    overall: edition,
    currentStage: groupedProgress(currentStageTasks, input.currentStage ?? "Current stage"),
    activeSheet: groupedProgress(activeSheetTasks, "Active sheet"),
    edition,
    town: groupedProgress(ordered, "Town reconstruction"),
    nextIncompleteTask,
  };
}
