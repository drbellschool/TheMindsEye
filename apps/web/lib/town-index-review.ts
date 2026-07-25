import type { SanbornTownIndexRegionRecord } from "./sanborn-town-index.ts";

export const townIndexDisplayPalette = ["#b98b57", "#8d9b68", "#ad7770", "#7890a8", "#b4a06b", "#8e7664"] as const;
export const referenceResolutionStatuses = ["linked", "missing", "not_applicable", "unresolved"] as const;
export type ReferenceResolution = (typeof referenceResolutionStatuses)[number];

export function normalizeDisplayColor(value: string | null | undefined): string {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : townIndexDisplayPalette[0];
}

export function normalizeDisplayOpacity(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0.15, Math.min(1, Number(parsed.toFixed(2)))) : 0.55;
}

export function validateReferenceResolution(status: string | null | undefined, note: string | null | undefined): { ok: true; status: ReferenceResolution; note: string | null } | { ok: false; error: string } {
  const normalizedStatus = referenceResolutionStatuses.includes(status as ReferenceResolution) ? status as ReferenceResolution : "unresolved";
  const normalizedNote = String(note ?? "").trim() || null;
  if ((normalizedStatus === "missing" || normalizedStatus === "not_applicable") && !normalizedNote) {
    return { ok: false, error: "Missing and not applicable references require a short reason." };
  }
  return { ok: true, status: normalizedStatus, note: normalizedNote };
}

export function getTownIndexChecklistProgress(regions: readonly Pick<SanbornTownIndexRegionRecord, "regionType" | "workflowStatus" | "referenceResolution" | "sheetReference">[]): {
  coverage: { reviewed: number; total: number };
  insets: { reviewed: number; total: number };
  specials: "not_started" | "marked";
  key: "not_started" | "marked";
  references: { resolved: number; total: number };
  completed: number;
  total: number;
} {
  const coverage = regions.filter((region) => region.regionType === "sheet_coverage_region");
  const insets = regions.filter((region) => region.regionType === "inset_map");
  const reviewed = (items: typeof coverage) => items.filter((region) => region.workflowStatus === "reviewed").length;
  const resolved = regions.filter((region) => region.referenceResolution && region.referenceResolution !== "unresolved");
  const specials = regions.some((region) => region.regionType === "specials" && region.workflowStatus !== "not_started") ? "marked" : "not_started";
  const key = regions.some((region) => region.regionType === "legend_key" && region.workflowStatus !== "not_started") ? "marked" : "not_started";
  const categoryChecks = [coverage.length > 0 && reviewed(coverage) === coverage.length, insets.length > 0 && reviewed(insets) === insets.length, specials === "marked", key === "marked"];
  return {
    coverage: { reviewed: reviewed(coverage), total: coverage.length },
    insets: { reviewed: reviewed(insets), total: insets.length },
    specials,
    key,
    references: { resolved: resolved.length, total: regions.filter((region) => Boolean(region.sheetReference)).length },
    completed: categoryChecks.filter(Boolean).length + (resolved.length === regions.filter((region) => Boolean(region.sheetReference)).length && resolved.length > 0 ? 1 : 0),
    total: 5,
  };
}
