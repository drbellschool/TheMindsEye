import type { SanbornMapPieceRecord } from "./sanborn-atlas";
import {
  getActiveSanbornMapPieceFeatureCategories,
  sanbornMapPieceFeatureCategoryLabels,
  type SanbornMapPieceFeatureCategory,
  type SanbornMapPieceReviewCategories,
  type SanbornMapPieceReviewStatus,
} from "./sanborn-map-piece-features.ts";

export type SheetMapPieceAuditAction = "finish_review" | "reviewed_none_found" | "review_category" | "none";

export type SheetMapPieceCategoryAudit = {
  category: SanbornMapPieceFeatureCategory;
  label: string;
  total: number;
  persistedObjectCount: number;
  draftObjectCount: number;
  reviewStatus: SanbornMapPieceReviewStatus;
  workStarted: boolean;
  reviewComplete: boolean;
  statusConflictsWithObjects: boolean;
  changedSinceReview: boolean;
  recommendedNextAction: SheetMapPieceAuditAction;
};

export type SheetMapPieceAudit = {
  categories: SheetMapPieceCategoryAudit[];
  activeCategoryCount: number;
  reviewedCategoryCount: number;
  totalObjects: number;
  persistedObjectCount: number;
  draftObjectCount: number;
  complete: boolean;
  nextCategory: SanbornMapPieceFeatureCategory | null;
};

type AuditInput = {
  pieces: readonly SanbornMapPieceRecord[];
  reviewCategories?: SanbornMapPieceReviewCategories;
  reviewedObjectCounts?: Partial<Record<SanbornMapPieceFeatureCategory, number>>;
};

export function deriveSheetMapPieceAudit({ pieces, reviewCategories = {}, reviewedObjectCounts = {} }: AuditInput): SheetMapPieceAudit {
  const categories = getActiveSanbornMapPieceFeatureCategories().map((category): SheetMapPieceCategoryAudit => {
    const matching = pieces.filter((piece) => (piece.featureCategory ?? "blocks_and_lots") === category);
    const persistedObjectCount = matching.filter((piece) => piece.isPersisted !== false).length;
    const draftObjectCount = matching.length - persistedObjectCount;
    const total = matching.length;
    const storedStatus = reviewCategories[category] ?? matching.find((piece) => piece.reviewCategories?.[category])?.reviewCategories?.[category] ?? "not_reviewed";
    const evidenceChanged = reviewedObjectCounts[category] !== undefined && reviewedObjectCounts[category] !== total;
    const statusConflictsWithObjects = (storedStatus === "reviewed_none_found" && total > 0) || (storedStatus === "reviewed_found" && (total === 0 || evidenceChanged || draftObjectCount > 0));
    const changedSinceReview = statusConflictsWithObjects && storedStatus === "reviewed_found";
    const reviewStatus = statusConflictsWithObjects || (storedStatus === "not_reviewed" && total > 0) ? "in_progress" : storedStatus;
    const reviewComplete = (reviewStatus === "reviewed_found" || reviewStatus === "reviewed_none_found") && draftObjectCount === 0;
    const workStarted = total > 0 || reviewStatus !== "not_reviewed";
    const recommendedNextAction: SheetMapPieceAuditAction = reviewComplete
      ? "none"
      : draftObjectCount > 0
        ? "review_category"
        : total > 0
          ? "finish_review"
          : "reviewed_none_found";
    return {
      category,
      label: sanbornMapPieceFeatureCategoryLabels[category],
      total,
      persistedObjectCount,
      draftObjectCount,
      reviewStatus,
      workStarted,
      reviewComplete,
      statusConflictsWithObjects,
      changedSinceReview,
      recommendedNextAction,
    };
  });
  const reviewedCategoryCount = categories.filter((category) => category.reviewComplete).length;
  const totalObjects = categories.reduce((sum, category) => sum + category.total, 0);
  const persistedObjectCount = categories.reduce((sum, category) => sum + category.persistedObjectCount, 0);
  const draftObjectCount = categories.reduce((sum, category) => sum + category.draftObjectCount, 0);
  const nextCategory = categories.find((category) => !category.reviewComplete)?.category ?? null;
  return {
    categories,
    activeCategoryCount: categories.length,
    reviewedCategoryCount,
    totalObjects,
    persistedObjectCount,
    draftObjectCount,
    complete: draftObjectCount === 0 && categories.every((category) => category.reviewComplete),
    nextCategory,
  };
}
