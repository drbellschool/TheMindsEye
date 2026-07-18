import type { ReviewStatus } from "./community-status.ts";
import type { StudioSheetAsset } from "./historical-map-studio.ts";
import type { SanbornAtlasPageRecord, SanbornMapPieceRecord, SanbornNormalizedPoint } from "./sanborn-atlas.ts";
import { calculateNormalizedPolygonArea, validateNormalizedPolygon } from "./sanborn-atlas.ts";
import { hasOperationalMapPiecePlacement, type SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";

export const sanbornTownIndexRegionTypes = ["sheet_region", "district", "coverage_area", "inset", "index_label", "unknown"] as const;
export const sanbornTownIndexStatuses = ["missing", "not_started", "started", "placed", "reviewed", "conflict"] as const;

export type SanbornTownIndexRegionType = (typeof sanbornTownIndexRegionTypes)[number];
export type SanbornTownIndexStatus = (typeof sanbornTownIndexStatuses)[number];

export type SanbornTownIndexRegionRecord = {
  rowId: string;
  regionId: string;
  townPackageId: string;
  atlasRowId: string;
  atlasId: string;
  indexAtlasPageRowId: string;
  indexAtlasPageId: string;
  linkedAtlasPageRowId: string | null;
  linkedAtlasPageId: string | null;
  linkedSheetAssetRowId: string | null;
  linkedSheetAssetId: string | null;
  regionLabel: string;
  sheetReference: string | null;
  regionType: SanbornTownIndexRegionType;
  sourcePolygon: SanbornNormalizedPoint[];
  workflowStatus: SanbornTownIndexStatus;
  progressStatus: SanbornTownIndexStatus;
  reviewStatus: ReviewStatus;
  evidenceClassification: ReviewStatus;
  notes: string | null;
  updatedAt: string | null;
  isPersisted: boolean;
};

export type SanbornTownIndexRegionProgress = {
  regionId: string;
  label: string;
  sheetReference: string | null;
  status: SanbornTownIndexStatus;
  completionPercent: number;
  regionDefined: boolean;
  sheetLinked: boolean;
  sourceAvailable: boolean;
  mapPiecesIdentified: number;
  mapPiecesPlaced: number;
  reviewed: boolean;
  warnings: string[];
};

export type SanbornTownIndexCompletion = {
  totalRegions: number;
  linkedRegions: number;
  missingRegions: number;
  notStartedRegions: number;
  startedRegions: number;
  placedRegions: number;
  reviewedRegions: number;
  conflictRegions: number;
  completionPercent: number;
};

const polygonTolerance = 1e-12;

function orientation(a: SanbornNormalizedPoint, b: SanbornNormalizedPoint, c: SanbornNormalizedPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a: SanbornNormalizedPoint, b: SanbornNormalizedPoint, c: SanbornNormalizedPoint, d: SanbornNormalizedPoint): boolean {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);

  return (
    ((abc > polygonTolerance && abd < -polygonTolerance) || (abc < -polygonTolerance && abd > polygonTolerance)) &&
    ((cda > polygonTolerance && cdb < -polygonTolerance) || (cda < -polygonTolerance && cdb > polygonTolerance))
  );
}

export function normalizedPolygonSelfIntersects(points: SanbornNormalizedPoint[]): boolean {
  for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
    const leftNext = (leftIndex + 1) % points.length;

    for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
      const rightNext = (rightIndex + 1) % points.length;
      const adjacent =
        leftIndex === rightIndex ||
        leftNext === rightIndex ||
        rightNext === leftIndex ||
        (leftIndex === 0 && rightNext === points.length - 1);

      if (!adjacent && segmentsCross(points[leftIndex], points[leftNext], points[rightIndex], points[rightNext])) {
        return true;
      }
    }
  }

  return false;
}

export function validateTownIndexRegionPolygon(value: unknown) {
  const validation = validateNormalizedPolygon(value);

  if (!validation.ok) {
    return { ok: false as const, error: validation.error.replace("Map piece", "Index region") };
  }

  if (calculateNormalizedPolygonArea(validation.polygon) <= polygonTolerance) {
    return { ok: false as const, error: "Index region polygon must have nonzero area." };
  }

  if (normalizedPolygonSelfIntersects(validation.polygon)) {
    return { ok: false as const, error: "Index region polygon must not self-intersect." };
  }

  return { ok: true as const, polygon: validation.polygon, bbox: validation.bbox };
}

export function normalizeTownIndexStatus(value: string | null | undefined, fallback: SanbornTownIndexStatus = "not_started"): SanbornTownIndexStatus {
  return sanbornTownIndexStatuses.includes(value as SanbornTownIndexStatus) ? (value as SanbornTownIndexStatus) : fallback;
}

export function normalizeTownIndexRegionType(value: string | null | undefined): SanbornTownIndexRegionType {
  return sanbornTownIndexRegionTypes.includes(value as SanbornTownIndexRegionType) ? (value as SanbornTownIndexRegionType) : "unknown";
}

export function compareSheetReferences(left: string | number | null | undefined, right: string | number | null | undefined): number {
  const leftText = String(left ?? "").trim();
  const rightText = String(right ?? "").trim();
  const leftMatch = leftText.match(/^(\d+)(.*)$/);
  const rightMatch = rightText.match(/^(\d+)(.*)$/);

  if (leftMatch && rightMatch) {
    const numeric = Number(leftMatch[1]) - Number(rightMatch[1]);
    return numeric || leftMatch[2].localeCompare(rightMatch[2], undefined, { numeric: true, sensitivity: "base" });
  }

  if (leftMatch) return -1;
  if (rightMatch) return 1;

  return leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: "base" });
}

export function buildDefaultTownIndexRegionId(input: { atlasId: string; regionLabel?: string | null; sheetReference?: string | null; suffix?: string | number | null }): string {
  const base = String(input.regionLabel || input.sheetReference || "region")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "region";
  const suffix = String(input.suffix ?? Date.now())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "draft";

  return `${input.atlasId}-${base}-${suffix}-index-region`;
}

export function calculateTownIndexRegionProgress(input: {
  region: SanbornTownIndexRegionRecord;
  pages: SanbornAtlasPageRecord[];
  assets: StudioSheetAsset[];
  pieces: SanbornMapPieceRecord[];
  placements: SanbornMapPieceGeoreference[];
}): SanbornTownIndexRegionProgress {
  const regionDefined = validateTownIndexRegionPolygon(input.region.sourcePolygon).ok;
  const linkedPage = input.pages.find((page) => page.pageId === input.region.linkedAtlasPageId) ?? null;
  const linkedAsset =
    input.assets.find((asset) => asset.assetId === input.region.linkedSheetAssetId) ??
    (linkedPage ? input.assets.find((asset) => asset.assetId === linkedPage.sanbornSheetAssetId) : null) ??
    null;
  const sheetLinked = Boolean(linkedPage || linkedAsset);
  const pagePieces = linkedPage ? input.pieces.filter((piece) => piece.atlasPageId === linkedPage.pageId) : [];
  const mapPiecesPlaced = pagePieces.filter((piece) => {
    const placement = input.placements.find((candidate) => candidate.pieceId === piece.pieceId);
    return Boolean(placement?.isPersisted && hasOperationalMapPiecePlacement(placement));
  }).length;
  const reviewed =
    input.region.reviewStatus === "verified_fact" ||
    input.region.workflowStatus === "reviewed" ||
    input.region.progressStatus === "reviewed" ||
    (pagePieces.length > 0 && pagePieces.every((piece) => piece.inventoryStatus === "reviewed" || piece.reviewStatus === "verified_fact"));
  const warnings: string[] = [];

  if (!regionDefined) warnings.push("Invalid region geometry");
  if (!sheetLinked && input.region.workflowStatus !== "missing") warnings.push("No linked sheet or page");
  if (linkedPage && linkedAsset && linkedPage.sanbornSheetAssetId !== linkedAsset.assetId) warnings.push("Linked page and sheet conflict");
  if (input.region.workflowStatus === "conflict" || input.region.progressStatus === "conflict") warnings.push("Marked conflict");
  if (input.region.workflowStatus === "missing" || input.region.progressStatus === "missing") warnings.push("Marked missing");

  let completionPercent = 0;
  if (regionDefined) completionPercent = 15;
  if (regionDefined && sheetLinked) completionPercent = 30;
  if (regionDefined && sheetLinked && linkedAsset) completionPercent = 40;
  if (regionDefined && sheetLinked && linkedAsset && pagePieces.length > 0) completionPercent = 60;
  if (regionDefined && sheetLinked && linkedAsset && pagePieces.length > 0 && mapPiecesPlaced === pagePieces.length) completionPercent = 90;
  if (reviewed && completionPercent >= 90) completionPercent = 100;

  const status =
    warnings.some((warning) => warning.includes("conflict")) || warnings.includes("Invalid region geometry") || warnings.includes("Linked page and sheet conflict")
      ? "conflict"
      : input.region.workflowStatus === "missing" || input.region.progressStatus === "missing"
        ? "missing"
        : reviewed && completionPercent >= 90
          ? "reviewed"
          : completionPercent >= 90
            ? "placed"
            : completionPercent > 15
              ? "started"
              : "not_started";

  return {
    regionId: input.region.regionId,
    label: input.region.regionLabel || input.region.sheetReference || "Unlabeled region",
    sheetReference: input.region.sheetReference,
    status,
    completionPercent: status === "missing" ? 0 : Math.min(100, Math.max(0, Math.round(completionPercent))),
    regionDefined,
    sheetLinked,
    sourceAvailable: Boolean(linkedAsset),
    mapPiecesIdentified: pagePieces.length,
    mapPiecesPlaced,
    reviewed,
    warnings,
  };
}

export function calculateTownIndexCompletion(progress: SanbornTownIndexRegionProgress[]): SanbornTownIndexCompletion {
  const totalRegions = progress.length;
  const completionPercent =
    totalRegions === 0
      ? 0
      : Math.round(progress.reduce((sum, region) => sum + (region.status === "missing" ? 0 : region.completionPercent), 0) / totalRegions);

  return {
    totalRegions,
    linkedRegions: progress.filter((region) => region.sheetLinked).length,
    missingRegions: progress.filter((region) => region.status === "missing").length,
    notStartedRegions: progress.filter((region) => region.status === "not_started").length,
    startedRegions: progress.filter((region) => region.status === "started").length,
    placedRegions: progress.filter((region) => region.status === "placed").length,
    reviewedRegions: progress.filter((region) => region.status === "reviewed").length,
    conflictRegions: progress.filter((region) => region.status === "conflict").length,
    completionPercent,
  };
}
