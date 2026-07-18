import type { ReviewStatus } from "./community-status.ts";
import type { HistoricalMapStudioState, StudioSheetAsset, StudioSourceOption, StudioTownPackage } from "./historical-map-studio.ts";
import type { SanbornAtlasPageRecord, SanbornAtlasRecord, SanbornMapPieceRecord } from "./sanborn-atlas.ts";
import {
  getSanbornPageDisplayLabel,
  getSanbornPagePrintedReference,
  getSanbornPageTypeLabel,
  hasSanbornPageClassificationConflict,
  isClassifiedSanbornPage,
  pageTypeCanBePrimaryTownIndex,
  pageTypeSupportsMapPieces,
} from "./sanborn-atlas.ts";
import { hasOperationalMapPiecePlacement, type SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";
import {
  calculateTownIndexCompletion,
  calculateTownIndexRegionProgress,
  compareSheetReferences,
  sourceRegionIsTownIndexContext,
  sourceRegionSupportsMapPieces,
  sourceRegionSupportsTownIndex,
  type SanbornTownIndexCompletion,
  type SanbornTownIndexRegionProgress,
  type SanbornTownIndexRegionRecord,
  type SanbornTownIndexStatus,
} from "./sanborn-town-index.ts";

export type ReconstructionWorkflowStepId =
  | "town_edition"
  | "source_record"
  | "town_index"
  | "sheet_inventory"
  | "map_pieces_blocks"
  | "map_placement"
  | "building_reconstruction"
  | "people_activity"
  | "evidence_review";

export type ReconstructionRouteId = "map" | "buildings" | "people" | "sources";

export type ReconstructionProgressStatus = "not_started" | "in_progress" | "placed" | "reviewed" | "conflict" | "missing";

export type ReconstructionWorkflowStep = {
  id: ReconstructionWorkflowStepId;
  label: string;
  route?: ReconstructionRouteId;
  isOperational: boolean;
};

export type ReconstructionRouteTab = {
  id: ReconstructionRouteId;
  label: string;
  href: string;
};

export type ReconstructionContextQuery = {
  townPackageId?: string | null;
  mapYear?: string | number | null;
  atlasId?: string | null;
  atlasPageId?: string | null;
  sheetAssetId?: string | null;
  mapPieceId?: string | null;
  indexRegionId?: string | null;
  blockId?: string | null;
  workflow?: string | null;
};

export type ReconstructionSourceRecord = {
  sourceRecordId?: string | null;
  sourceId?: string | null;
  internalSourceId?: string | null;
  title?: string | null;
  repositoryName?: string | null;
  collectionName?: string | null;
  repositoryExternalId?: string | null;
  persistentUrl?: string | null;
  itemPageUrl?: string | null;
  iiifManifestUrl?: string | null;
  imageServiceUrl?: string | null;
  itemTitle?: string | null;
  town?: string | null;
  county?: string | null;
  state?: string | null;
  editionYear?: number | string | null;
  sheetNumber?: number | string | null;
  mapPublisher?: string | null;
  publicationDate?: string | null;
  downloadedAt?: string | null;
  importedBy?: string | null;
  rightsStatement?: string | null;
  rightsUrl?: string | null;
  accessNote?: string | null;
  citationNote?: string | null;
  sourceStatus?: string | null;
  accessDate?: string | null;
  archiveName?: string | null;
  sourceUrl?: string | null;
  rightsNote?: string | null;
};

export type SheetReconstructionProgress = {
  sheetAssetId: string;
  pageId: string | null;
  sourceRecordId: string | null;
  sheetNumber: number | null;
  printedReference: string | null;
  displayLabel: string;
  pageType: string;
  pageTypeLabel: string;
  pageClassified: boolean;
  isPrimaryTownIndex: boolean;
  classificationConflict: boolean;
  sourceLinked: boolean;
  imageUploaded: boolean;
  mapPiecesIdentified: number;
  mapPiecesPlaced: number;
  mapPiecesUnplaced: number;
  mapPiecesHidden: number;
  mapPiecesLocked: number;
  mapPiecesReviewed: number;
  status: ReconstructionProgressStatus;
  completionPercent: number;
  warning: string | null;
};

export type MapPieceReconstructionProgress = {
  pieceId: string;
  atlasPageId: string;
  label: string;
  pieceType: string;
  blockNumber: string | null;
  regionDefined: boolean;
  geographicPlacementSaved: boolean;
  visibleAndOperational: boolean;
  reviewed: boolean;
  status: ReconstructionProgressStatus;
  completionPercent: number;
};

export type EditionReconstructionProgress = {
  atlasId: string | null;
  editionYear: number | null;
  sheetCount: number;
  sheetsWithSource: number;
  sheetsWithPieces: number;
  sheetsWithPlacedPieces: number;
  mapPieceCount: number;
  placedMapPieceCount: number;
  reviewedMapPieceCount: number;
  completionPercent: number;
  status: ReconstructionProgressStatus;
};

export type PageClassificationSummary = {
  totalPages: number;
  classifiedPages: number;
  unknownPages: number;
  geographicPages: number;
  indexPages: number;
  primaryIndexPages: number;
  conflictPages: number;
  completionPercent: number;
  status: ReconstructionProgressStatus;
};

export type TownReconstructionProgress = {
  townPackageId: string | null;
  townName: string;
  activeEditionYear: number | null;
  sourceRecordCount: number;
  sheetCount: number;
  sheetsAligned: number;
  mapPiecesIdentified: number;
  mapPiecesPlaced: number;
  buildingsIdentified: number | null;
  peopleLinked: number | null;
  sourceRecordsLinked: number;
  unresolvedWorkCount: number;
  completionPercent: number;
  status: ReconstructionProgressStatus;
  lastActivity: string | null;
};

export type ReconstructionWorkTask = {
  id: string;
  label: string;
  detail: string;
  route: ReconstructionRouteId;
  priority: "high" | "normal" | "low";
  context: ReconstructionContextQuery;
};

export type TownIndexRegion = {
  id: string;
  label: string;
  sheetReference: string | null;
  sheetNumber: number | null;
  atlasPageId: string | null;
  sheetAssetId: string | null;
  status: SanbornTownIndexStatus;
  completionPercent: number;
  warnings: string[];
};

export type TownIndexSummary = {
  indexPage: SanbornAtlasPageRecord | null;
  indexAsset: StudioSheetAsset | null;
  regions: TownIndexRegion[];
  regionProgress: SanbornTownIndexRegionProgress[];
  completion: SanbornTownIndexCompletion;
  unresolvedRegionCount: number;
};

export const reconstructionWorkflowSteps: ReconstructionWorkflowStep[] = [
  { id: "town_edition", label: "Town & Edition", isOperational: true },
  { id: "source_record", label: "Source Record", isOperational: true },
  { id: "town_index", label: "Town Index", isOperational: true },
  { id: "sheet_inventory", label: "Sheet Inventory", isOperational: true },
  { id: "map_pieces_blocks", label: "Map Pieces", isOperational: true },
  { id: "map_placement", label: "Map Placement", isOperational: true },
  { id: "building_reconstruction", label: "Building Reconstruction", route: "buildings", isOperational: false },
  { id: "people_activity", label: "People & Activity", route: "people", isOperational: false },
  { id: "evidence_review", label: "Evidence Review", route: "sources", isOperational: false },
];

export const reconstructionRouteTabs: ReconstructionRouteTab[] = [
  { id: "map", label: "Map", href: "/community/historical-map-studio" },
  { id: "buildings", label: "Buildings", href: "/community/building-auditor" },
  { id: "people", label: "People", href: "/community/people-auditor" },
  { id: "sources", label: "Sources", href: "/community/source-provenance-inspector" },
];

const completedStatuses = new Set<ReviewStatus | string>(["verified_fact", "reviewed", "approved", "aligned"]);

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function text(value: string | number | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function getPieceLabel(piece: Pick<SanbornMapPieceRecord, "blockNumberText" | "titleText" | "pieceSequence" | "pieceType">): string {
  return piece.titleText || (piece.blockNumberText ? `Block ${piece.blockNumberText}` : `Piece ${piece.pieceSequence} (${piece.pieceType.replaceAll("_", " ")})`);
}

function getSheetLabel(asset: StudioSheetAsset, page?: SanbornAtlasPageRecord | null): string {
  const sheetNumber = page?.sheetNumber ?? asset.sheetNumber;
  return page ? getSanbornPageDisplayLabel(page) : sheetNumber ? `Sheet ${sheetNumber}` : asset.originalFilename;
}

function statusFromCompletion(input: { total: number; done: number; conflict?: boolean; reviewed?: boolean }): ReconstructionProgressStatus {
  if (input.conflict) {
    return "conflict";
  }

  if (input.total <= 0) {
    return "not_started";
  }

  if (input.reviewed && input.done >= input.total) {
    return "reviewed";
  }

  if (input.done >= input.total) {
    return "placed";
  }

  if (input.done > 0) {
    return "in_progress";
  }

  return "not_started";
}

export function formatMindseyeSourceIdFromUuid(id: string | null | undefined): string | null {
  const normalized = text(id)?.replace(/-/g, "").toUpperCase();

  if (!normalized || !/^[0-9A-F]{32}$/.test(normalized)) {
    return null;
  }

  return `SRC-${normalized.slice(0, 12)}`;
}

export function getSourceDisplayId(source: ReconstructionSourceRecord | null | undefined): string {
  return text(source?.internalSourceId) ?? text(source?.sourceId) ?? formatMindseyeSourceIdFromUuid(source?.sourceRecordId) ?? "Source ID unavailable";
}

export function getSourceRepositoryLabel(source: ReconstructionSourceRecord | null | undefined): string {
  return text(source?.repositoryName) ?? text(source?.archiveName) ?? "Repository unavailable";
}

export function getSourcePersistentUrl(source: ReconstructionSourceRecord | null | undefined): string | null {
  return text(source?.persistentUrl) ?? text(source?.itemPageUrl) ?? text(source?.sourceUrl);
}

export function buildStandardSanbornCitation(source: ReconstructionSourceRecord, accessDate = new Date()): string {
  const publisher = text(source.mapPublisher) ?? "Sanborn Map Company";
  const title =
    text(source.itemTitle) ??
    text(source.title) ??
    [
      "Sanborn Fire Insurance Map",
      text(source.town) ? `from ${source.town}` : null,
      text(source.county) ? `${source.county} County` : null,
      text(source.state),
    ]
      .filter(Boolean)
      .join(", ");
  const year = text(source.editionYear) ?? (text(source.publicationDate)?.slice(0, 4) || null);
  const sheet = text(source.sheetNumber);
  const repository = getSourceRepositoryLabel(source);
  const collection = text(source.collectionName);
  const url = getSourcePersistentUrl(source);
  const accessed = accessDate.toISOString().slice(0, 10);
  const parts = [
    `${publisher}. ${title}.`,
    year ? `${year}.` : null,
    sheet ? `Sheet ${sheet}.` : null,
    collection ? `${collection}, ${repository}.` : `${repository}.`,
    url ? `${url}.` : null,
    `Accessed ${accessed}.`,
  ];

  return parts.filter(Boolean).join(" ");
}

export function buildReconstructionUrl(routeHref: string, context: ReconstructionContextQuery): string {
  const params = new URLSearchParams();
  const town = text(context.townPackageId);
  const year = text(context.mapYear);
  const atlas = text(context.atlasId);
  const page = text(context.atlasPageId);
  const sheet = text(context.sheetAssetId);
  const piece = text(context.mapPieceId);
  const indexRegion = text(context.indexRegionId);
  const block = text(context.blockId);
  const workflow = text(context.workflow);

  if (town) {
    params.set("town", town);
    params.set("townPackageId", town);
  }
  if (year) {
    params.set("year", year);
    params.set("mapYear", year);
  }
  if (atlas) {
    params.set("atlas", atlas);
    params.set("atlasId", atlas);
  }
  if (page) {
    params.set("page", page);
    params.set("atlasPageId", page);
  }
  if (sheet) {
    params.set("sheet", sheet);
    params.set("sheetAssetId", sheet);
  }
  if (piece) {
    params.set("piece", piece);
    params.set("mapPieceId", piece);
  }
  if (indexRegion) {
    params.set("indexRegionId", indexRegion);
  }
  if (block) {
    params.set("blockId", block);
  }
  if (workflow) {
    params.set("workflow", workflow);
  }

  const query = params.toString();
  return query ? `${routeHref}?${query}` : routeHref;
}

export function calculateMapPieceProgress(input: {
  piece: SanbornMapPieceRecord;
  placement?: SanbornMapPieceGeoreference | null;
}): MapPieceReconstructionProgress {
  const placement = input.placement ?? null;
  const geographicPlacementSaved = Boolean(placement?.isPersisted && hasOperationalMapPiecePlacement(placement));
  const visibleAndOperational = Boolean(placement?.isVisible && hasOperationalMapPiecePlacement(placement));
  const reviewed = input.piece.reviewStatus === "verified_fact" || input.piece.inventoryStatus === "reviewed" || placement?.reviewStatus === "verified_fact" || placement?.placementStatus === "reviewed";
  const completedUnits = 1 + (geographicPlacementSaved ? 1 : 0) + (visibleAndOperational ? 1 : 0) + (reviewed ? 1 : 0);
  const status = geographicPlacementSaved ? (reviewed ? "reviewed" : "placed") : "not_started";

  return {
    pieceId: input.piece.pieceId,
    atlasPageId: input.piece.atlasPageId,
    label: getPieceLabel(input.piece),
    pieceType: input.piece.pieceType,
    blockNumber: input.piece.blockNumberText,
    regionDefined: true,
    geographicPlacementSaved,
    visibleAndOperational,
    reviewed,
    status,
    completionPercent: clampPercent((completedUnits / 4) * 100),
  };
}

export function calculateSheetProgress(input: {
  asset: StudioSheetAsset;
  page?: SanbornAtlasPageRecord | null;
  pieces: SanbornMapPieceRecord[];
  placements: SanbornMapPieceGeoreference[];
  sourceRegions?: SanbornTownIndexRegionRecord[];
}): SheetReconstructionProgress {
  const pageType = input.page?.pageType ?? "unknown";
  const pageClassified = Boolean(input.page && isClassifiedSanbornPage(input.page));
  const printedReference = getSanbornPagePrintedReference(input.page);
  const pageSourceRegions = input.page ? input.sourceRegions?.filter((region) => region.indexAtlasPageId === input.page?.pageId) ?? [] : [];
  const hasGeographicSourceRegion = pageSourceRegions.some(sourceRegionSupportsMapPieces);
  const geographicPage = Boolean(input.page && (pageTypeSupportsMapPieces(input.page.pageType) || hasGeographicSourceRegion));
  const classificationConflict = hasSanbornPageClassificationConflict({
    page: input.page,
    mapPieceCount: input.pieces.length,
    isPrimaryTownIndex: input.page?.isPrimaryTownIndex,
    hasGeographicSourceRegion,
  });
  const placementByPieceId = new Map(input.placements.map((placement) => [placement.pieceId, placement]));
  const pieceProgress = input.pieces.map((piece) => calculateMapPieceProgress({ piece, placement: placementByPieceId.get(piece.pieceId) }));
  const placed = pieceProgress.filter((piece) => piece.geographicPlacementSaved).length;
  const reviewed = pieceProgress.filter((piece) => piece.reviewed).length;
  const hidden = input.pieces.filter((piece) => placementByPieceId.get(piece.pieceId)?.isVisible === false).length;
  const locked = input.pieces.filter((piece) => placementByPieceId.get(piece.pieceId)?.isLocked === true).length;
  const sourceLinked = Boolean(input.asset.sourceRecordId);
  const printedReferenceRequired = geographicPage || pageType === "index_or_mixed" || pageType === "street_index" || pageType === "special_sheet";
  const printedReferenceAssigned = !printedReferenceRequired || Boolean(printedReference);
  const workflowRelationshipValid = pageClassified && !classificationConflict;
  const geographicWorkComplete = geographicPage ? input.pieces.length > 0 && placed === input.pieces.length : !classificationConflict;
  const units = [true, sourceLinked, pageClassified, printedReferenceAssigned, workflowRelationshipValid, geographicWorkComplete];
  const completed = units.filter(Boolean).length;
  const status = classificationConflict
    ? "conflict"
    : !pageClassified
      ? sourceLinked
        ? "in_progress"
        : "not_started"
      : geographicPage
        ? input.pieces.length === 0
          ? "in_progress"
          : statusFromCompletion({ total: input.pieces.length, done: placed, reviewed: reviewed === input.pieces.length })
        : sourceLinked
          ? "reviewed"
          : "in_progress";
  const warning =
    classificationConflict
      ? "Page classification conflicts with existing map pieces"
      : !pageClassified
        ? "Page type unknown"
        : !sourceLinked
          ? "Missing source record"
          : printedReferenceRequired && !printedReferenceAssigned
            ? "Missing printed reference"
            : null;

  return {
    sheetAssetId: input.asset.assetId,
    pageId: input.page?.pageId ?? null,
    sourceRecordId: input.asset.sourceRecordId,
    sheetNumber: input.page?.sheetNumber ?? input.asset.sheetNumber,
    printedReference,
    displayLabel: getSheetLabel(input.asset, input.page),
    pageType,
    pageTypeLabel: getSanbornPageTypeLabel(pageType),
    pageClassified,
    isPrimaryTownIndex: input.page?.isPrimaryTownIndex === true,
    classificationConflict,
    sourceLinked,
    imageUploaded: true,
    mapPiecesIdentified: input.pieces.length,
    mapPiecesPlaced: placed,
    mapPiecesUnplaced: Math.max(0, input.pieces.length - placed),
    mapPiecesHidden: hidden,
    mapPiecesLocked: locked,
    mapPiecesReviewed: reviewed,
    status,
    completionPercent: clampPercent((completed / units.length) * 100),
    warning,
  };
}

export function calculateEditionProgress(input: {
  atlas: SanbornAtlasRecord | null;
  pages: SanbornAtlasPageRecord[];
  assets: StudioSheetAsset[];
  pieces: SanbornMapPieceRecord[];
  placements: SanbornMapPieceGeoreference[];
  sourceRegions?: SanbornTownIndexRegionRecord[];
}): EditionReconstructionProgress {
  const assetById = new Map(input.assets.map((asset) => [asset.assetId, asset]));
  const placementsByPieceId = new Map(input.placements.map((placement) => [placement.pieceId, placement]));
  const sheets = input.pages
    .map((page) => {
      const asset = assetById.get(page.sanbornSheetAssetId);
      return asset
        ? calculateSheetProgress({
            asset,
            page,
            pieces: input.pieces.filter((piece) => piece.atlasPageId === page.pageId),
            placements: input.placements,
            sourceRegions: input.sourceRegions,
          })
        : null;
    })
    .filter((sheet): sheet is SheetReconstructionProgress => Boolean(sheet));
  const placedPieces = input.pieces.filter((piece) => {
    const placement = placementsByPieceId.get(piece.pieceId);
    return Boolean(placement?.isPersisted && hasOperationalMapPiecePlacement(placement));
  }).length;
  const reviewedPieces = input.pieces.filter((piece) => {
    const placement = placementsByPieceId.get(piece.pieceId);
    return completedStatuses.has(piece.reviewStatus) || piece.inventoryStatus === "reviewed" || placement?.placementStatus === "reviewed";
  }).length;

  return {
    atlasId: input.atlas?.atlasId ?? null,
    editionYear: input.atlas?.editionYear ?? null,
    sheetCount: sheets.length,
    sheetsWithSource: sheets.filter((sheet) => sheet.sourceLinked).length,
    sheetsWithPieces: sheets.filter((sheet) => sheet.mapPiecesIdentified > 0).length,
    sheetsWithPlacedPieces: sheets.filter((sheet) => sheet.mapPiecesIdentified > 0 && sheet.mapPiecesPlaced === sheet.mapPiecesIdentified).length,
    mapPieceCount: input.pieces.length,
    placedMapPieceCount: placedPieces,
    reviewedMapPieceCount: reviewedPieces,
    completionPercent: sheets.length > 0 ? clampPercent(sheets.reduce((sum, sheet) => sum + sheet.completionPercent, 0) / sheets.length) : 0,
    status: statusFromCompletion({ total: input.pieces.length || sheets.length, done: placedPieces || sheets.filter((sheet) => sheet.sourceLinked).length, reviewed: input.pieces.length > 0 && reviewedPieces === input.pieces.length }),
  };
}

export function calculatePageClassificationSummary(input: {
  pages: SanbornAtlasPageRecord[];
  pieces: SanbornMapPieceRecord[];
  sourceRegions?: SanbornTownIndexRegionRecord[];
}): PageClassificationSummary {
  const piecesByPageId = new Map<string, number>();
  const pageHasGeographicSourceRegion = new Map<string, boolean>();

  for (const piece of input.pieces) {
    piecesByPageId.set(piece.atlasPageId, (piecesByPageId.get(piece.atlasPageId) ?? 0) + 1);
  }

  for (const region of input.sourceRegions ?? []) {
    if (sourceRegionSupportsMapPieces(region)) {
      pageHasGeographicSourceRegion.set(region.indexAtlasPageId, true);
    }
  }

  const classifiedPages = input.pages.filter((page) => isClassifiedSanbornPage(page)).length;
  const unknownPages = input.pages.filter((page) => page.pageType === "unknown").length;
  const geographicPages = input.pages.filter((page) => pageTypeSupportsMapPieces(page.pageType) || pageHasGeographicSourceRegion.get(page.pageId) === true).length;
  const indexPages = input.pages.filter((page) => pageTypeCanBePrimaryTownIndex(page.pageType)).length;
  const primaryIndexPages = input.pages.filter((page) => page.isPrimaryTownIndex && pageTypeCanBePrimaryTownIndex(page.pageType)).length;
  const conflictPages = input.pages.filter((page) =>
    hasSanbornPageClassificationConflict({
      page,
      mapPieceCount: piecesByPageId.get(page.pageId) ?? 0,
      isPrimaryTownIndex: page.isPrimaryTownIndex,
      hasGeographicSourceRegion: pageHasGeographicSourceRegion.get(page.pageId) === true,
    }),
  ).length;
  const completionPercent = input.pages.length > 0 ? clampPercent((classifiedPages / input.pages.length) * 100) : 0;

  return {
    totalPages: input.pages.length,
    classifiedPages,
    unknownPages,
    geographicPages,
    indexPages,
    primaryIndexPages,
    conflictPages,
    completionPercent,
    status:
      input.pages.length === 0
        ? "not_started"
        : conflictPages > 0
          ? "conflict"
          : unknownPages > 0
            ? "in_progress"
            : primaryIndexPages === 0
              ? "missing"
              : "reviewed",
  };
}

export function calculateTownProgress(input: {
  town: StudioTownPackage | null;
  activeMapYear: number | null;
  sourceOptions: StudioSourceOption[];
  sheets: StudioSheetAsset[];
  pages: SanbornAtlasPageRecord[];
  pieces: SanbornMapPieceRecord[];
  placements: SanbornMapPieceGeoreference[];
  sourceRegions?: SanbornTownIndexRegionRecord[];
  buildingsIdentified?: number | null;
  peopleLinked?: number | null;
}): TownReconstructionProgress {
  const edition = calculateEditionProgress({
    atlas: null,
    pages: input.pages,
    assets: input.sheets,
    pieces: input.pieces,
    placements: input.placements,
    sourceRegions: input.sourceRegions,
  });
  const sheetsAligned = edition.sheetsWithPlacedPieces;
  const sourceRecordsLinked = new Set(input.sheets.map((sheet) => sheet.sourceRecordId).filter(Boolean)).size;
  const classification = calculatePageClassificationSummary({ pages: input.pages, pieces: input.pieces, sourceRegions: input.sourceRegions });
  const unresolvedWorkCount =
    input.sheets.filter((sheet) => !sheet.sourceRecordId).length +
    Math.max(0, input.pieces.length - edition.placedMapPieceCount) +
    classification.unknownPages +
    classification.conflictPages +
    (classification.primaryIndexPages === 0 ? 1 : 0);

  return {
    townPackageId: input.town?.id ?? null,
    townName: input.town?.name ?? "No town selected",
    activeEditionYear: input.activeMapYear ?? input.town?.year ?? null,
    sourceRecordCount: input.sourceOptions.length,
    sheetCount: input.sheets.length,
    sheetsAligned,
    mapPiecesIdentified: input.pieces.length,
    mapPiecesPlaced: edition.placedMapPieceCount,
    buildingsIdentified: input.buildingsIdentified ?? null,
    peopleLinked: input.peopleLinked ?? null,
    sourceRecordsLinked,
    unresolvedWorkCount,
    completionPercent: edition.completionPercent,
    status: unresolvedWorkCount === 0 && input.sheets.length > 0 ? "reviewed" : edition.status,
    lastActivity: null,
  };
}

export function buildTownIndexSummary(input: {
  pages: SanbornAtlasPageRecord[];
  assets: StudioSheetAsset[];
  pieces: SanbornMapPieceRecord[];
  placements: SanbornMapPieceGeoreference[];
  indexRegions?: SanbornTownIndexRegionRecord[];
}): TownIndexSummary {
  const assetById = new Map(input.assets.map((asset) => [asset.assetId, asset]));
  const indexPage = input.pages.find((page) => page.isPrimaryTownIndex && pageTypeCanBePrimaryTownIndex(page.pageType)) ?? null;
  const durableRegions = (input.indexRegions ?? []).filter(sourceRegionIsTownIndexContext);
  const regionProgress = durableRegions.map((region) =>
    calculateTownIndexRegionProgress({
      region,
      pages: input.pages,
      assets: input.assets,
      pieces: input.pieces,
      placements: input.placements,
    }),
  );
  const progressByRegionId = new Map(regionProgress.map((progress) => [progress.regionId, progress]));
  const regions: TownIndexRegion[] =
    durableRegions.length > 0
      ? [...durableRegions]
          .sort((left, right) => compareSheetReferences(left.sheetReference, right.sheetReference) || left.regionLabel.localeCompare(right.regionLabel))
          .map((region) => {
            const progress = progressByRegionId.get(region.regionId);
            return {
              id: region.regionId,
              label: region.regionLabel || region.sheetReference || "Unlabeled region",
              sheetReference: region.sheetReference,
              sheetNumber: Number.isInteger(Number(region.sheetReference)) ? Number(region.sheetReference) : null,
              atlasPageId: region.linkedAtlasPageId,
              sheetAssetId: region.linkedSheetAssetId,
              status: progress?.status ?? "not_started",
              completionPercent: progress?.completionPercent ?? 0,
              warnings: progress?.warnings ?? [],
            };
          })
      : input.pages
          .filter((page) => pageTypeSupportsMapPieces(page.pageType))
          .sort((left, right) => compareSheetReferences(getSanbornPagePrintedReference(left), getSanbornPagePrintedReference(right)) || left.pageSequence - right.pageSequence)
          .map((page) => {
            const pieces = input.pieces.filter((piece) => piece.atlasPageId === page.pageId);
            const placed = pieces.filter((piece) => {
              const placement = input.placements.find((candidate) => candidate.pieceId === piece.pieceId);
              return Boolean(placement?.isPersisted && hasOperationalMapPiecePlacement(placement));
            }).length;
            const status = statusFromCompletion({ total: pieces.length, done: placed });

            return {
              id: page.pageId,
              label: getSanbornPageDisplayLabel(page),
              sheetReference: getSanbornPagePrintedReference(page),
              sheetNumber: page.sheetNumber,
              atlasPageId: page.pageId,
              sheetAssetId: page.sanbornSheetAssetId,
              status: status === "in_progress" ? "started" : status,
              completionPercent: status === "placed" || status === "reviewed" ? 90 : status === "in_progress" ? 60 : 0,
              warnings: [],
            };
          });
  const completion = calculateTownIndexCompletion(
    durableRegions.length > 0
      ? regionProgress.filter((progress) => {
          const region = durableRegions.find((candidate) => candidate.regionId === progress.regionId);
          return Boolean(region && sourceRegionSupportsTownIndex(region));
        })
      : regions.map((region) => ({
          regionId: region.id,
          label: region.label,
          sheetReference: region.sheetReference,
          status: region.status as SanbornTownIndexStatus,
          completionPercent: region.completionPercent,
          regionDefined: true,
          sheetLinked: Boolean(region.atlasPageId || region.sheetAssetId),
          sourceAvailable: Boolean(region.sheetAssetId),
          mapPiecesIdentified: 0,
          mapPiecesPlaced: 0,
          reviewed: region.status === "reviewed",
          warnings: region.warnings,
        })),
  );

  return {
    indexPage,
    indexAsset: indexPage ? assetById.get(indexPage.sanbornSheetAssetId) ?? null : null,
    regions,
    regionProgress,
    completion,
    unresolvedRegionCount: regions.filter((region) => region.status !== "placed" && region.status !== "reviewed").length,
  };
}

export function buildReconstructionWorkQueue(input: {
  townPackageId?: string | null;
  mapYear?: number | null;
  atlasId?: string | null;
  pages?: SanbornAtlasPageRecord[];
  sourceRegions?: SanbornTownIndexRegionRecord[];
  sheets: SheetReconstructionProgress[];
  pieces: MapPieceReconstructionProgress[];
  classification?: PageClassificationSummary;
  index: TownIndexSummary;
  sourceRecordCount: number;
  buildingCount?: number | null;
  peopleCount?: number | null;
}): ReconstructionWorkTask[] {
  const tasks: ReconstructionWorkTask[] = [];
  const baseContext = {
    townPackageId: input.townPackageId,
    mapYear: input.mapYear,
    atlasId: input.atlasId,
  };
  const pages = input.pages ?? [];
  const pageById = new Map(pages.map((page) => [page.pageId, page]));
  const sourceRegionsByPageId = new Map<string, SanbornTownIndexRegionRecord[]>();

  for (const region of input.sourceRegions ?? []) {
    sourceRegionsByPageId.set(region.indexAtlasPageId, [...(sourceRegionsByPageId.get(region.indexAtlasPageId) ?? []), region]);
  }

  for (const page of pages) {
    const sheet = input.sheets.find((candidate) => candidate.pageId === page.pageId) ?? null;

    if (page.pageType === "unknown") {
      tasks.push({
        id: `classify-page-${page.pageId}`,
        label: `Classify uploaded page ${sheet?.displayLabel ?? getSanbornPageDisplayLabel(page)}`,
        detail: "Choose the page type in Source Record so the correct station tools are enabled.",
        route: "map",
        priority: "high",
        context: { ...baseContext, atlasPageId: page.pageId, sheetAssetId: page.sanbornSheetAssetId, workflow: "page_classification" },
      });
    }

    const pageSourceRegions = sourceRegionsByPageId.get(page.pageId) ?? [];
    const hasGeographicSourceRegion = pageSourceRegions.some(sourceRegionSupportsMapPieces);

    if (hasSanbornPageClassificationConflict({
      page,
      mapPieceCount: input.pieces.filter((piece) => piece.atlasPageId === page.pageId).length,
      isPrimaryTownIndex: page.isPrimaryTownIndex,
      hasGeographicSourceRegion,
    })) {
      tasks.push({
        id: `classification-conflict-${page.pageId}`,
        label: `Resolve map pieces created on ${getSanbornPageDisplayLabel(page)}`,
        detail: "Reclassify page or archive invalid pieces. Existing pieces are not deleted automatically.",
        route: "map",
        priority: "high",
        context: { ...baseContext, atlasPageId: page.pageId, sheetAssetId: page.sanbornSheetAssetId, workflow: "page_classification" },
      });
    }

    if ((pageTypeSupportsMapPieces(page.pageType) || hasGeographicSourceRegion) && !getSanbornPagePrintedReference(page)) {
      tasks.push({
        id: `printed-reference-${page.pageId}`,
        label: `Add printed sheet reference for ${getSanbornPageDisplayLabel(page)}`,
        detail: "Printed references help link non-sequential sheets and index regions.",
        route: "map",
        priority: "normal",
        context: { ...baseContext, atlasPageId: page.pageId, sheetAssetId: page.sanbornSheetAssetId, workflow: "page_classification" },
      });
    }
  }

  if (!input.index.indexPage && pages.length > 0) {
    tasks.push({
      id: "town-index-designate",
      label: "Select a primary Town Index page",
      detail: "Classify one uploaded page as Index or mixed and explicitly set it as the edition Town Index.",
      route: "map",
      priority: "high",
      context: { ...baseContext, workflow: "page_classification" },
    });
  }

  const primaryIndexSourceRegions = input.index.indexPage ? sourceRegionsByPageId.get(input.index.indexPage.pageId) ?? [] : [];

  if (input.index.indexPage && primaryIndexSourceRegions.length === 0) {
    tasks.push({
      id: `source-regions-${input.index.indexPage.pageId}`,
      label: "Classify functional regions on the index page",
      detail: "Mark the town coverage diagram, sheet coverage regions, printed index, and other useful source areas.",
      route: "map",
      priority: "high",
      context: { ...baseContext, atlasPageId: input.index.indexPage.pageId, sheetAssetId: input.index.indexPage.sanbornSheetAssetId, workflow: "page_classification" },
    });
  }

  if (input.index.indexPage && !primaryIndexSourceRegions.some((region) => region.regionType === "town_coverage_diagram")) {
    tasks.push({
      id: `town-coverage-${input.index.indexPage.pageId}`,
      label: "Mark the town coverage diagram",
      detail: "Outline the overall source diagram before reviewing sheet coverage.",
      route: "map",
      priority: "normal",
      context: { ...baseContext, atlasPageId: input.index.indexPage.pageId, sheetAssetId: input.index.indexPage.sanbornSheetAssetId, workflow: "page_classification" },
    });
  }

  if (input.index.indexPage && !primaryIndexSourceRegions.some((region) => region.regionType === "printed_index")) {
    tasks.push({
      id: `printed-index-${input.index.indexPage.pageId}`,
      label: "Mark printed index area",
      detail: "Store the printed index box as a durable source region for later transcription work.",
      route: "map",
      priority: "low",
      context: { ...baseContext, atlasPageId: input.index.indexPage.pageId, sheetAssetId: input.index.indexPage.sanbornSheetAssetId, workflow: "page_classification" },
    });
  }

  for (const region of input.index.regions) {
    if (region.status === "conflict") {
      tasks.push({
        id: `index-conflict-${region.id}`,
        label: `Resolve index conflict for ${region.label}`,
        detail: region.warnings[0] ?? "The region has conflicting links or invalid geometry.",
        route: "map",
        priority: "high",
        context: { ...baseContext, indexRegionId: region.id, atlasPageId: region.atlasPageId, sheetAssetId: region.sheetAssetId, workflow: "town_index" },
      });
    } else if (region.status === "missing") {
      tasks.push({
        id: `index-missing-${region.id}`,
        label: `Upload source for missing region ${region.label}`,
        detail: "The index references a missing sheet or area.",
        route: "map",
        priority: "high",
        context: { ...baseContext, indexRegionId: region.id, workflow: "town_index" },
      });
    } else if (!region.atlasPageId && !region.sheetAssetId) {
      tasks.push({
        id: `index-link-${region.id}`,
        label: `Link index region ${region.label}`,
        detail: "Choose the atlas page or source sheet represented by this index region.",
        route: "map",
        priority: "normal",
        context: { ...baseContext, indexRegionId: region.id, workflow: "town_index" },
      });
    }
  }

  for (const sheet of input.sheets) {
    if (!sheet.pageClassified) {
      continue;
    }

    if (!sheet.sourceLinked) {
      tasks.push({
        id: `source-${sheet.sheetAssetId}`,
        label: `Add source record for ${sheet.displayLabel}`,
        detail: "Link the uploaded sheet to a durable source record.",
        route: "sources",
        priority: "high",
        context: { ...baseContext, sheetAssetId: sheet.sheetAssetId, atlasPageId: sheet.pageId, workflow: "page_classification" },
      });
    }

    if (sheet.mapPiecesIdentified === 0 && pageTypeSupportsMapPieces(sheet.pageType)) {
      tasks.push({
        id: `pieces-${sheet.sheetAssetId}`,
        label: `Identify regions on ${sheet.displayLabel}`,
        detail: "Draw manual map pieces or blocks for this sheet.",
        route: "map",
        priority: "normal",
        context: { ...baseContext, sheetAssetId: sheet.sheetAssetId, atlasPageId: sheet.pageId, workflow: "piece_inventory" },
      });
    }
  }

  for (const piece of input.pieces) {
    const piecePage = pageById.get(piece.atlasPageId);

    const piecePageRegions = piecePage ? sourceRegionsByPageId.get(piecePage.pageId) ?? [] : [];
    if (piecePage && !pageTypeSupportsMapPieces(piecePage.pageType) && !piecePageRegions.some(sourceRegionSupportsMapPieces)) {
      continue;
    }

    if (!piece.geographicPlacementSaved) {
      tasks.push({
        id: `place-${piece.pieceId}`,
        label: `Place ${piece.label}`,
        detail: "Save a geographic map-piece placement.",
        route: "map",
        priority: "normal",
        context: { ...baseContext, atlasPageId: piece.atlasPageId, mapPieceId: piece.pieceId, blockId: piece.blockNumber, workflow: "gps_alignment" },
      });
    } else if (!piece.reviewed) {
      tasks.push({
        id: `review-piece-${piece.pieceId}`,
        label: `Review saved placement for ${piece.label}`,
        detail: "Confirm the saved placement remains evidence-neutral and ready for downstream reconstruction.",
        route: "sources",
        priority: "low",
        context: { ...baseContext, atlasPageId: piece.atlasPageId, mapPieceId: piece.pieceId, blockId: piece.blockNumber, workflow: "gps_alignment" },
      });
    }
  }

  if ((input.buildingCount ?? 0) === 0) {
    tasks.push({
      id: "building-foundation",
      label: "Verify building footprints",
      detail: "Building Reconstruction is a later engine stage; no structured building work is loaded yet.",
      route: "buildings",
      priority: "low",
      context: baseContext,
    });
  }

  if ((input.peopleCount ?? 0) === 0) {
    tasks.push({
      id: "people-foundation",
      label: "Link people to verified places",
      detail: "People & Activity will use the same town, sheet, and block context when that engine expands.",
      route: "people",
      priority: "low",
      context: baseContext,
    });
  }

  if (input.sourceRecordCount === 0) {
    tasks.push({
      id: "source-record-foundation",
      label: "Create the first source record",
      detail: "Durable source identity is required before claims can survive external URL changes.",
      route: "sources",
      priority: "high",
      context: { ...baseContext, workflow: "source" },
    });
  }

  return tasks.slice(0, 12);
}

export function buildReconstructionModelFromStudioState(input: {
  state: HistoricalMapStudioState;
  selectedAtlasId?: string | null;
  selectedPageId?: string | null;
  selectedPieceId?: string | null;
}) {
  const activeAtlas =
    input.state.atlasInventory.atlases.find((atlas) => atlas.atlasId === input.selectedAtlasId) ??
    input.state.atlasInventory.atlases.find((atlas) => atlas.editionYear === input.state.activeMapYear) ??
    input.state.atlasInventory.atlases[0] ??
    null;
  const pages = activeAtlas ? input.state.atlasInventory.pages.filter((page) => page.atlasId === activeAtlas.atlasId) : input.state.atlasInventory.pages;
  const pageIds = new Set(pages.map((page) => page.pageId));
  const pieces = input.state.atlasInventory.pieces.filter((piece) => pageIds.has(piece.atlasPageId));
  const pageByAsset = new Map(pages.map((page) => [page.sanbornSheetAssetId, page]));
  const sheetProgress = input.state.sheets.map((asset) =>
    calculateSheetProgress({
      asset,
      page: pageByAsset.get(asset.assetId) ?? null,
      pieces: pieces.filter((piece) => piece.atlasPageId === pageByAsset.get(asset.assetId)?.pageId),
            placements: input.state.mapPieceGeoreferences,
            sourceRegions: input.state.townIndexRegions,
          }),
  );
  const placementByPieceId = new Map(input.state.mapPieceGeoreferences.map((placement) => [placement.pieceId, placement]));
  const pieceProgress = pieces.map((piece) => calculateMapPieceProgress({ piece, placement: placementByPieceId.get(piece.pieceId) }));
  const sourceRegions = input.state.townIndexRegions.filter((region) => region.atlasId === activeAtlas?.atlasId);
  const classification = calculatePageClassificationSummary({ pages, pieces, sourceRegions });
  const index = buildTownIndexSummary({
    pages,
    assets: input.state.sheets,
    pieces,
    placements: input.state.mapPieceGeoreferences,
    indexRegions: sourceRegions,
  });
  const town = calculateTownProgress({
    town: input.state.activeTownPackage,
    activeMapYear: input.state.activeMapYear,
    sourceOptions: input.state.sourceOptions,
    sheets: input.state.sheets,
    pages,
    pieces,
    placements: input.state.mapPieceGeoreferences,
    sourceRegions,
  });
  const edition = calculateEditionProgress({
    atlas: activeAtlas,
    pages,
    assets: input.state.sheets,
    pieces,
    placements: input.state.mapPieceGeoreferences,
    sourceRegions,
  });
  const tasks = buildReconstructionWorkQueue({
    townPackageId: input.state.activeTownPackage?.id,
    mapYear: input.state.activeMapYear,
    atlasId: activeAtlas?.atlasId,
    sheets: sheetProgress,
    pieces: pieceProgress,
    pages,
    sourceRegions,
    classification,
    index,
    sourceRecordCount: input.state.sourceOptions.length,
  });

  return {
    activeAtlas,
    pages,
    pieces,
    sheetProgress,
    pieceProgress,
    classification,
    index,
    town,
    edition,
    tasks,
  };
}
