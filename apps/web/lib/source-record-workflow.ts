import type { SanbornAtlasPageRecord, SanbornPageType } from "./sanborn-atlas.ts";
import type { StudioSheetAsset, StudioSourceOption } from "./historical-map-studio.ts";

export type PrimaryIndexState = "unresolved" | "candidate" | "confirmed" | "conflict";

export type SourceRecordQueuePage = {
  page: SanbornAtlasPageRecord;
  priority: number;
};

export function getActiveEditionPages(
  pages: readonly SanbornAtlasPageRecord[],
  activeAtlasId: string | null | undefined,
): SanbornAtlasPageRecord[] {
  return pages
    .filter((page) => page.atlasId === activeAtlasId && !page.archivedAt)
    .sort((left, right) => left.pageSequence - right.pageSequence || left.pageId.localeCompare(right.pageId));
}

export function getPrimaryIndexState(pages: readonly SanbornAtlasPageRecord[]): PrimaryIndexState {
  const confirmed = pages.filter((page) => page.isPrimaryTownIndex);
  if (confirmed.length > 1) return "conflict";
  if (confirmed.length === 1) return "confirmed";
  if (pages.some((page) => page.pageType === "index_or_mixed")) return "candidate";
  return "unresolved";
}

export function suggestSourceRecordDisplayLabel(input: {
  pageType?: SanbornPageType | string | null;
  sheetNumber?: number | string | null;
  printedReference?: string | null;
  isPrimaryTownIndex?: boolean;
  regionType?: string | null;
  regionSequence?: number | null;
}): string {
  const reference = String(input.printedReference ?? input.sheetNumber ?? "").trim();
  if (input.regionType) return `Coverage Region ${input.regionSequence ?? 1}`;
  if (input.pageType === "legend") return "Key / Legend";
  if (input.pageType === "special_sheet") return reference ? `Sheet ${reference} — Special Sheet` : "Specials";
  if (input.isPrimaryTownIndex || input.pageType === "index_or_mixed") return reference ? `Sheet ${reference} — Index` : "Index";
  return reference ? `Sheet ${reference}` : "Unresolved Sheet";
}

function isUsableSource(source: StudioSourceOption): boolean {
  const status = String(source.sourceStatus ?? "").trim().toLowerCase();
  return !["archived", "invalid", "rejected"].includes(status);
}

export function groupSourceOptionsForEdition(
  sources: readonly StudioSourceOption[],
  editionYear: number | null | undefined,
): { editionSources: StudioSourceOption[]; otherTownSources: StudioSourceOption[] } {
  const usable = sources.filter(isUsableSource);
  const sortSources = (left: StudioSourceOption, right: StudioSourceOption) =>
    `${left.title} ${left.sourceRecordId}`.localeCompare(`${right.title} ${right.sourceRecordId}`);
  return {
    editionSources: usable.filter((source) => source.editionYear === editionYear).sort(sortSources),
    otherTownSources: usable.filter((source) => source.editionYear !== editionYear).sort(sortSources),
  };
}

function pageNeedsPrintedReference(page: SanbornAtlasPageRecord): boolean {
  return ["sanborn_sheet", "special_sheet", "index_or_mixed"].includes(page.pageType);
}

export function getSourceRecordQueue(
  pages: readonly SanbornAtlasPageRecord[],
  assets: readonly Pick<StudioSheetAsset, "assetId" | "sourceRecordId">[],
  regions: readonly { pageId?: string | null; indexAtlasPageId?: string | null; workflowStatus?: string | null }[],
): SourceRecordQueuePage[] {
  const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
  return pages
    .filter((page) => !page.archivedAt)
    .map((page) => {
      const asset = assetById.get(page.sanbornSheetAssetId);
      const pageRegions = regions.filter((region) => (region.pageId ?? region.indexAtlasPageId) === page.pageId);
      const incompleteRegions = pageRegions.some((region) => !["reviewed", "not_applicable"].includes(String(region.workflowStatus)));
      const priority = !page.pageType || page.pageType === "unknown"
        ? 0
        : !asset?.sourceRecordId
          ? 1
          : pageNeedsPrintedReference(page) && !page.printedReference
            ? 2
            : page.pageType === "index_or_mixed" && !page.isPrimaryTownIndex
              ? 3
              : incompleteRegions
                ? 4
                : 5;
      return { page, priority };
    })
    .filter(({ priority }) => priority < 5)
    .sort((left, right) => left.priority - right.priority || left.page.pageSequence - right.page.pageSequence);
}

export function getSourceRecordProgress(input: {
  pages: readonly SanbornAtlasPageRecord[];
  assets: readonly Pick<StudioSheetAsset, "assetId" | "sourceRecordId">[];
  regions: readonly { pageId?: string | null; indexAtlasPageId?: string | null; workflowStatus?: string | null }[];
}): { completed: number; total: number; complete: boolean; primaryIndexState: PrimaryIndexState } {
  const activePages = input.pages.filter((page) => !page.archivedAt);
  const assetById = new Map(input.assets.map((asset) => [asset.assetId, asset]));
  const pageChecks = activePages.map((page) => {
    const regions = input.regions.filter((region) => (region.pageId ?? region.indexAtlasPageId) === page.pageId);
    return [
      page.pageType !== "unknown",
      Boolean(page.printedReference || !pageNeedsPrintedReference(page)),
      Boolean(assetById.get(page.sanbornSheetAssetId)?.sourceRecordId),
      regions.every((region) => ["reviewed", "not_applicable"].includes(String(region.workflowStatus))),
    ];
  });
  const primaryIndexState = getPrimaryIndexState(activePages);
  const checks = pageChecks.flat();
  const completed = checks.filter(Boolean).length + (primaryIndexState === "confirmed" ? 1 : 0);
  const total = checks.length + 1;
  return { completed, total, complete: total > 0 && completed === total, primaryIndexState };
}
