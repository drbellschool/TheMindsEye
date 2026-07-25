import { getSanbornPageDisplayLabel, getSanbornPagePrintedReference, isClassifiedSanbornPage, pageTypeSupportsMapPieces, type SanbornAtlasPageRecord, type SanbornMapPieceRecord } from "./sanborn-atlas.ts";
import { hasOperationalMapPiecePlacement, type SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";
import type { StudioSheetAsset } from "./historical-map-studio.ts";
import type { SanbornTownIndexRegionRecord } from "./sanborn-town-index.ts";

export const sheetInventoryStatuses = ["needs_classification", "needs_source", "waiting_for_index_link", "ready_for_map_pieces", "map_pieces_in_progress", "waiting_for_placement", "complete", "missing_page", "blocked"] as const;
export type SheetInventoryStatus = (typeof sheetInventoryStatuses)[number];

export type SheetInventoryQueueItem = {
  id: string;
  kind: "sheet" | "missing";
  pageId: string | null;
  sheetAssetId: string | null;
  displayLabel: string;
  printedReference: string | null;
  filename: string | null;
  pageType: string;
  sourceLinked: boolean;
  indexLinked: boolean;
  mapPieceCount: number;
  mapPiecesStatus: "not_started" | "in_progress" | "complete";
  placedObjectCount: number;
  awaitingPlacementCount: number;
  status: SheetInventoryStatus;
  statusLabel: string;
  warning: string | null;
  regionId: string | null;
};

const statusLabels: Record<SheetInventoryStatus, string> = {
  needs_classification: "Needs classification",
  needs_source: "Needs source",
  waiting_for_index_link: "Waiting for index link",
  ready_for_map_pieces: "Ready for Map Pieces",
  map_pieces_in_progress: "Map Pieces in progress",
  waiting_for_placement: "Waiting for placement",
  complete: "Complete",
  missing_page: "Missing page",
  blocked: "Blocked",
};

export function deriveSheetInventoryQueue(input: {
  activeAtlasId: string | null | undefined;
  pages: readonly SanbornAtlasPageRecord[];
  assets: readonly StudioSheetAsset[];
  pieces: readonly SanbornMapPieceRecord[];
  placements: readonly SanbornMapPieceGeoreference[];
  regions: readonly SanbornTownIndexRegionRecord[];
}): SheetInventoryQueueItem[] {
  const pages = input.pages.filter((page) => page.atlasId === input.activeAtlasId && !page.archivedAt);
  const assetsById = new Map(input.assets.map((asset) => [asset.assetId, asset]));
  const placementsByPieceId = new Map(input.placements.map((placement) => [placement.pieceId, placement]));
  const items = pages.map((page): SheetInventoryQueueItem => {
    const asset = assetsById.get(page.sanbornSheetAssetId);
    const pieces = input.pieces.filter((piece) => piece.atlasPageId === page.pageId);
    const placedObjectCount = pieces.filter((piece) => hasOperationalMapPiecePlacement(placementsByPieceId.get(piece.pieceId))).length;
    const pageRegions = input.regions.filter((region) => region.atlasId === input.activeAtlasId && (region.linkedAtlasPageId === page.pageId || region.linkedSheetAssetId === page.sanbornSheetAssetId));
    const indexLinked = pageRegions.length > 0;
    const geographicPage = pageTypeSupportsMapPieces(page.pageType) || pageRegions.some((region) => region.availableToMapPieces);
    const classificationConflict = pieces.length > 0 && !geographicPage;
    const sourceLinked = Boolean(asset?.sourceRecordId);
    let status: SheetInventoryStatus = "complete";
    let warning: string | null = null;
    if (classificationConflict) {
      status = "blocked";
      warning = "Existing geographic objects conflict with this page classification.";
    } else if (!isClassifiedSanbornPage(page)) {
      status = "needs_classification";
    } else if (!sourceLinked) {
      status = "needs_source";
    } else if (geographicPage && !indexLinked) {
      status = "waiting_for_index_link";
    } else if (geographicPage && pieces.length === 0) {
      status = "ready_for_map_pieces";
    } else if (pieces.length > 0 && placedObjectCount < pieces.length) {
      status = "waiting_for_placement";
    } else if (pieces.length > 0 && pieces.some((piece) => piece.inventoryStatus !== "reviewed")) {
      status = "map_pieces_in_progress";
    }
    return {
      id: page.pageId,
      kind: "sheet",
      pageId: page.pageId,
      sheetAssetId: page.sanbornSheetAssetId,
      displayLabel: getSanbornPageDisplayLabel(page),
      printedReference: getSanbornPagePrintedReference(page),
      filename: asset?.originalFilename ?? null,
      pageType: page.pageType,
      sourceLinked,
      indexLinked,
      mapPieceCount: pieces.length,
      mapPiecesStatus: pieces.length === 0 ? "not_started" : pieces.every((piece) => piece.inventoryStatus === "reviewed") ? "complete" : "in_progress",
      placedObjectCount,
      awaitingPlacementCount: Math.max(0, pieces.length - placedObjectCount),
      status,
      statusLabel: statusLabels[status],
      warning,
      regionId: pageRegions[0]?.regionId ?? null,
    };
  });
  const missing = input.regions
    .filter((region) => region.atlasId === input.activeAtlasId && region.referenceResolution === "missing" && !region.linkedAtlasPageId && !region.linkedSheetAssetId)
    .map((region): SheetInventoryQueueItem => ({
      id: `missing:${region.regionId}`,
      kind: "missing",
      pageId: null,
      sheetAssetId: null,
      displayLabel: region.regionLabel || `Missing sheet ${region.sheetReference ?? "reference"}`,
      printedReference: region.sheetReference,
      filename: null,
      pageType: "missing",
      sourceLinked: false,
      indexLinked: true,
      mapPiecesStatus: "not_started",
      mapPieceCount: 0,
      placedObjectCount: 0,
      awaitingPlacementCount: 0,
      status: "missing_page",
      statusLabel: statusLabels.missing_page,
      warning: region.referenceResolutionNote ?? "Documented as missing in Town Index.",
      regionId: region.regionId,
    }));
  return [...items, ...missing].sort((left, right) => (left.status === "complete" ? 1 : 0) - (right.status === "complete" ? 1 : 0) || (left.printedReference ?? left.displayLabel).localeCompare(right.printedReference ?? right.displayLabel));
}
