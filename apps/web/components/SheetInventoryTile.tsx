"use client";

import { SanbornSourceImageStatus, useSanbornSourceImageState } from "@/components/SanbornSourceImage";
import type { StudioSheetAsset } from "@/lib/historical-map-studio";
import type { SanbornMapPieceFeatureCategory, SanbornMapPieceReviewStatus } from "@/lib/sanborn-map-piece-features";
import type { SheetInventoryDashboardItem } from "@/lib/sheet-inventory-dashboard";

type SheetInventoryTileProps = {
  item: SheetInventoryDashboardItem;
  asset: StudioSheetAsset | null;
  selected: boolean;
  auditOpen: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onPrimaryAction: () => void;
  onToggleAudit: () => void;
  onAuditAction: (category: SanbornMapPieceFeatureCategory, status: SanbornMapPieceReviewStatus) => void;
};

export function SheetInventoryTile({ item, asset, selected, auditOpen, readOnly, onSelect, onPrimaryAction, onToggleAudit, onAuditAction }: SheetInventoryTileProps) {
  const imageState = useSanbornSourceImageState({ asset });
  const statusLabel = item.queueItem.kind === "missing" ? "Resolved missing" : item.isComplete ? "Complete" : item.queueItem.statusLabel;

  return (
    <article className={`sheet-inventory-tile${selected ? " is-selected" : ""}`} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} role="button" tabIndex={0}>
      <div className="sheet-inventory-tile__thumbnail">
        {asset?.signedUrl ? <>
          <img alt={imageState.isLoaded ? asset.originalFilename : ""} aria-hidden={!imageState.isLoaded} className={`sanborn-source-image__img is-${imageState.state}`} key={imageState.imageKey} onError={imageState.onError} onLoad={imageState.onLoad} src={asset.signedUrl} />
          <SanbornSourceImageStatus filename={asset.originalFilename} onRetry={imageState.retryImage} state={imageState.state} />
        </> : <div className="sheet-inventory-tile__missing-image">{item.queueItem.kind === "missing" ? "No uploaded page" : "Source image unavailable"}</div>}
      </div>
      <div className="sheet-inventory-tile__identity">
        <div><strong>{item.queueItem.displayLabel}</strong><span>{item.queueItem.filename ?? "Documented missing reference"}</span></div>
        <span className={`sheet-inventory-tile__status is-${item.queueItem.status}`}>{statusLabel}</span>
      </div>
      <div className="sheet-inventory-tile__metadata"><span>{item.queueItem.pageType.replaceAll("_", " ")}</span><span>{item.queueItem.printedReference ? `Printed ${item.queueItem.printedReference}` : "Printed reference unresolved"}</span></div>
      <div className="sheet-inventory-tile__stats">
        <div><span>Map Pieces</span><strong>{item.audit.totalObjects} objects</strong></div>
        <div><span>Sheet Audit</span><strong>{item.audit.reviewedCategoryCount} of {item.audit.activeCategoryCount} categories reviewed</strong></div>
        <div><span>Placement</span><strong>{item.placed} placed · {item.needPlacement + item.drafts} need placement</strong></div>
        <div><span>Review</span><strong>{item.reviewed} reviewed · {item.awaitingReview} await review</strong></div>
      </div>
      <div className="sheet-inventory-tile__audit-summary"><span>Audit: {item.audit.reviewedCategoryCount} of {item.audit.activeCategoryCount} complete</span><button className="sanborn-button" onClick={(event) => { event.stopPropagation(); onToggleAudit(); }} type="button">{auditOpen ? "Hide category audit" : "View category audit"}</button></div>
      {auditOpen ? <div className="sheet-inventory-tile__audit" onClick={(event) => event.stopPropagation()}>
        {item.audit.categories.map((category) => <div className="sheet-inventory-tile__audit-row" key={category.category}>
          <div><strong>{category.label}</strong><span>{category.persistedObjectCount} saved{category.draftObjectCount ? ` · ${category.draftObjectCount} unsaved drafts` : ""} · {category.reviewStatus.replaceAll("_", " ")}{category.changedSinceReview ? " · Changed since review" : ""}</span></div>
          {category.reviewComplete ? <button className="sanborn-button" disabled={readOnly} onClick={() => onAuditAction(category.category, "in_progress")} type="button">Reopen review</button> : category.total > 0 ? <button className="sanborn-button" disabled={readOnly || category.draftObjectCount > 0} onClick={() => onAuditAction(category.category, "reviewed_found")} type="button">Finish review</button> : <button className="sanborn-button" disabled={readOnly} onClick={() => onAuditAction(category.category, "reviewed_none_found")} type="button">Reviewed none found</button>}
        </div>)}
      </div> : null}
      <div className="sheet-inventory-tile__next"><span>Next action</span><button className="sanborn-button sanborn-button--primary" onClick={(event) => { event.stopPropagation(); onPrimaryAction(); }} type="button">{item.primaryActionLabel}</button></div>
    </article>
  );
}

