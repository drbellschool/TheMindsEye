"use client";
import { useEffect, useState } from "react";
import {
  deriveMapPlacementInspectorActionMode,
  deriveMapPlacementInspectorState,
  mapPlacementInspectorStatusLabel,
  mapPlacementQueueFilterItems,
  type MapPlacementInspectorState,
  type MapPlacementQueueFilter,
} from "@/lib/map-placement-inspector";
import type {
  MapPieceDisplayScope,
  SanbornMapPieceGeoreference,
} from "@/lib/sanborn-map-piece-georeference";
import type {
  MapPiecePlacementCounts,
  MapPiecePlacementQueueItem,
} from "@/lib/map-piece-placement-queue";
import type {
  SanbornAtlasPageRecord,
  SanbornMapPieceRecord,
} from "@/lib/sanborn-atlas";
import type { PlacementSaveResult } from "@/lib/map-placement-continuity";
import { deriveCanonicalMapPiecePlacementStatus } from "@/lib/map-piece-placement-status";
import { formatMapPiecePlacementLabel } from "@/lib/map-piece-label";
import {
  formatGeometryMeasurement,
  type PlacementGeometryMeasurements,
} from "@/lib/placement-geometry-measurements";

type Props = {
  selectedPiece: SanbornMapPieceRecord | null;
  selectedPage: SanbornAtlasPageRecord | null;
  placement: SanbornMapPieceGeoreference | null;
  queue: {
    items: MapPiecePlacementQueueItem[];
    counts: MapPiecePlacementCounts;
  };
  selectedPageSourceRegionLabel: string | null;
  selectedPageAssetName: string | null;
  selectedMapPieceHasGeographicFootprint: boolean;
  selectedMapPiecePlaced: boolean;
  selectedMapPieceDirty: boolean;
  selectedPlacementSaveable: boolean;
  selectedMapPieceOpacity: number;
  selectedMapPieceRotation: number;
  selectedMapPieceIsPolygon: boolean;
  showGeometryGuides: boolean;
  geometryMeasurements: PlacementGeometryMeasurements | null;
  unableToPlaceReason: string;
  atlasReadOnly: boolean;
  selectedPageSupportsMapPlacement: boolean;
  selectedPageToolBlockMessage: string;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveMessage: string;
  showReferenceSheetAlignment: boolean;
  selectedAssetId: string;
  selectedSheetPlaced: boolean;
  hasSelectedSheetGeoreference: boolean;
  geoEditMode: "pan_modern_map" | "edit_historical_sheets";
  selectedMapPieceLocked: boolean;
  selectedMapPieceVisible: boolean;
  pieceDisplayScope: MapPieceDisplayScope;
  allMapPieceBounds: boolean;
  onHide: () => void;
  onSelectQueueItem: (item: MapPiecePlacementQueueItem) => void;
  onPreviousUnplaced: () => void;
  onNextUnplaced: () => void;
  onNextReview: () => void;
  onStartPlacement: () => void;
  onCancelPlacement: () => void;
  onSavePlacement: () => Promise<PlacementSaveResult>;
  onSaveAndNext: () => Promise<void>;
  onEditPlacement: () => void;
  onMarkReviewed: () => void;
  onDiscardChanges: () => void;
  onConfirmUnableToPlace: () => void;
  onSetUnableToPlaceReason: (value: string) => void;
  onReloadPlacement: () => void;
  onResetPiece: () => void;
  onFitSelected: () => void;
  onCenterTown: () => void;
  onFitAll: () => void;
  onSetGeoEditMode: (mode: "pan_modern_map" | "edit_historical_sheets") => void;
  onSetOpacity: (value: number) => void;
  onSetRotation: (value: number) => void;
  onToggleVisible: () => void;
  onToggleLocked: () => void;
  onSetGeometryGuides: (value: boolean) => void;
  showStreetGuides: boolean;
  hasStreetGuides: boolean;
  onSetStreetGuides: (value: boolean) => void;
  onSetDisplayScope: (value: MapPieceDisplayScope) => void;
  onSetShowReferenceSheetAlignment: (value: boolean) => void;
  onPlaceSheet: () => void;
  onSaveSheet: () => void;
  onReloadSheet: () => void;
  onResetSheet: () => void;
  onResetAllSheets: () => void;
  onFitSheet: () => void;
  onToggleOverlayMode: () => void;
  onTogglePlainMap: () => void;
  overlayRenderMode: "projective" | "rectangular";
  plainMapTestMode: boolean;
  onDismissError: () => void;
};

export function MapPlacementInspector(props: Props) {
  const [queueOpen, setQueueOpen] = useState(!props.selectedPiece);
  const [queueFilter, setQueueFilter] = useState<MapPlacementQueueFilter>(
    props.queue.counts.needPlacement > 0
      ? "need_placement"
      : props.queue.counts.placedAwaitingReview > 0
        ? "awaiting_review"
        : "all",
  );
  const [editing, setEditing] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const state: MapPlacementInspectorState = deriveMapPlacementInspectorState({
    hasSelection: Boolean(props.selectedPiece),
    hasPlacement: Boolean(props.placement),
    hasGeographicFootprint: props.selectedMapPieceHasGeographicFootprint,
    isPersisted: Boolean(props.placement?.isPersisted),
    placementStatus: props.placement?.placementStatus,
    reviewStatus:
      props.placement?.reviewStatus ?? props.selectedPiece?.reviewStatus,
    hasPlacementAnchor:
      props.saveMessage.includes("Click the modern map to place") &&
      props.saveStatus === "idle",
    canonicalStatus: deriveCanonicalMapPiecePlacementStatus({
      placement: props.placement,
    }),
  });
  const filteredItems = mapPlacementQueueFilterItems(
    props.queue.items,
    queueFilter,
    props.selectedPage?.pageId,
  );
  useEffect(() => {
    if (
      queueFilter === "need_placement" &&
      props.queue.counts.needPlacement === 0 &&
      props.queue.counts.placedAwaitingReview > 0
    )
      setQueueFilter("awaiting_review");
  }, [
    props.queue.counts.needPlacement,
    props.queue.counts.placedAwaitingReview,
    queueFilter,
  ]);
  const selectedLabel = props.selectedPiece
    ? formatMapPiecePlacementLabel(props.selectedPiece)
    : "Geographic object";
  const sourceLabel =
    props.selectedPage?.displayLabel ||
    (props.selectedPage?.sheetNumber
      ? "Sheet " + props.selectedPage.sheetNumber
      : "Source sheet");
  const actionMode = deriveMapPlacementInspectorActionMode({
    state,
    isPersisted: Boolean(props.placement?.isPersisted),
    hasGeographicFootprint: props.selectedMapPieceHasGeographicFootprint,
    isDirty: props.selectedMapPieceDirty,
  });
  const dirtyPersisted = actionMode === "save_dirty";
  const showAlignment =
    state === "draft" || editing || props.selectedMapPieceDirty;
  function discardChanges() {
    if (
      typeof window === "undefined" ||
      window.confirm(`Discard unsaved changes to ${selectedLabel}?`)
    ) {
      props.onDiscardChanges();
    }
  }
  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select") ?? false;
      if (
        dirtyPersisted &&
        !typing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        if (props.saveStatus !== "saving" && !props.atlasReadOnly)
          void props.onSavePlacement();
      }
    }
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [
    dirtyPersisted,
    props.atlasReadOnly,
    props.onSavePlacement,
    props.saveStatus,
  ]);
  function selectQueueItem(item: MapPiecePlacementQueueItem) {
    setQueueOpen(false);
    setEditing(false);
    setExceptionOpen(false);
    props.onSelectQueueItem(item);
  }
  return (
    <section
      className="map-placement-inspector"
      aria-label="Map Placement inspector"
    >
      <header className="map-placement-inspector__header">
        <div>
          <span className="panel__eyebrow">Map Placement</span>
          <strong>
            {props.selectedPiece ? selectedLabel : "Select a geographic object"}
          </strong>
          {props.selectedPiece ? (
            <small>
              {sourceLabel} ·{" "}
              {props.selectedPiece.featureCategory?.replaceAll("_", " ") ??
                "blocks and lots"}
              {props.selectedMapPieceDirty ? " · Unsaved changes" : ""}
            </small>
          ) : null}
        </div>
        <div className="map-placement-inspector__header-actions">
          <span className={"map-placement-inspector__status is-" + state}>
            {mapPlacementInspectorStatusLabel(state)}
          </span>
          <button
            className="sanborn-station-inspector__close"
            onClick={props.onHide}
            type="button"
          >
            Hide
          </button>
        </div>
      </header>
      {props.saveStatus === "error" && props.saveMessage ? (
        <div className="map-placement-inspector__error" role="alert">
          <span>{shortPlacementError(props.saveMessage)}</span>
          <div>
            <button
              className="sanborn-button"
              onClick={() => void props.onSavePlacement()}
              type="button"
            >
              Retry save
            </button>
            <button
              className="sanborn-button"
              onClick={props.onDismissError}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div className="map-placement-inspector__primary">
        {state === "no_selection" ? (
          <p>Select an object from the queue to begin placement.</p>
        ) : null}
        {state === "unplaced" ? (
          <button
            className="sanborn-button sanborn-button--primary"
            disabled={
              props.atlasReadOnly || !props.selectedPageSupportsMapPlacement
            }
            onClick={props.onStartPlacement}
            type="button"
          >
            Start placement
          </button>
        ) : null}
        {state === "armed" ? (
          <>
            <p>
              Click the modern map to place <strong>{selectedLabel}</strong>.
            </p>
            <button
              className="sanborn-button"
              onClick={props.onCancelPlacement}
              type="button"
            >
              Cancel placement
            </button>
          </>
        ) : null}
        {actionMode === "save_new" ? (
          <div className="map-placement-inspector__primary-actions">
            <button
              className="sanborn-button sanborn-button--primary"
              disabled={
                !props.selectedPlacementSaveable ||
                props.saveStatus === "saving" ||
                props.atlasReadOnly
              }
              onClick={() => void props.onSavePlacement()}
              type="button"
            >
              {props.saveStatus === "saving" ? "Saving" : "Save placement"}
            </button>
            <button
              className="sanborn-button"
              disabled={
                !props.selectedPlacementSaveable ||
                props.saveStatus === "saving" ||
                props.atlasReadOnly
              }
              onClick={() => void props.onSaveAndNext()}
              type="button"
            >
              Save and next
            </button>
          </div>
        ) : null}
        {dirtyPersisted ? (
          <div className="map-placement-inspector__primary-actions">
            <button
              className="sanborn-button sanborn-button--primary"
              disabled={
                !props.selectedPlacementSaveable ||
                props.saveStatus === "saving" ||
                props.atlasReadOnly
              }
              onClick={() => void props.onSavePlacement()}
              type="button"
            >
              {props.saveStatus === "saving" ? "Saving" : "Save changes"}
            </button>
            <button
              className="sanborn-button"
              disabled={props.saveStatus === "saving"}
              onClick={discardChanges}
              type="button"
            >
              Discard changes
            </button>
            <p role="status">Save or discard these changes before reviewing.</p>
          </div>
        ) : null}
        {state === "saved" ? (
          <>
            <button
              className={
                "sanborn-button" +
                (props.queue.counts.placedAwaitingReview === 0
                  ? " sanborn-button--primary"
                  : "")
              }
              onClick={() => {
                setEditing(true);
                props.onEditPlacement();
              }}
              type="button"
            >
              Edit placement
            </button>
            {props.queue.counts.needPlacement === 0 &&
            props.queue.counts.placedAwaitingReview > 0 ? (
              <button
                className="sanborn-button sanborn-button--primary"
                onClick={props.onNextReview}
                type="button"
              >
                Review next placement
              </button>
            ) : null}
          </>
        ) : null}
        {state === "reviewed" ? (
          <>
            <button
              className="sanborn-button"
              onClick={() => {
                setEditing(true);
                props.onEditPlacement();
              }}
              type="button"
            >
              Reopen review
            </button>
            <button
              className="sanborn-button sanborn-button--primary"
              onClick={props.onMarkReviewed}
              type="button"
            >
              Reviewed
            </button>
          </>
        ) : null}
        {state === "unable_to_place" ? (
          <button
            className="sanborn-button sanborn-button--primary"
            onClick={() => {
              setExceptionOpen(true);
              props.onEditPlacement();
            }}
            type="button"
          >
            Edit exception
          </button>
        ) : null}
      </div>
      <section
        className="map-placement-inspector__progress"
        aria-label="Map Placement progress"
      >
        <strong>PLACEMENT</strong>
        <span>
          {props.queue.counts.geographicallyPlaced} of{" "}
          {props.queue.counts.total} placed · {props.queue.counts.needPlacement}{" "}
          still need placement
        </span>
        <strong>REVIEW</strong>
        <span>
          {props.queue.counts.reviewed} of{" "}
          {props.queue.counts.geographicallyPlaced} reviewed ·{" "}
          {props.queue.counts.placedAwaitingReview} await review
        </span>
        <strong>EXCEPTIONS</strong>
        <span>{props.queue.counts.unableToPlace} unable to place</span>
        <p>
          {props.queue.counts.geographicallyPlaced} of{" "}
          {props.queue.counts.total} objects have geographic placements.{" "}
          {props.queue.counts.needPlacement + props.queue.counts.draft} still
          need placement; saved placements remain review work.
        </p>
      </section>
      <section
        className="map-placement-inspector__queue"
        aria-label="Geographic object placement queue"
      >
        <header>
          <strong>
            {props.queue.counts.placementWorkRemaining} placement actions
            remaining
          </strong>
          <span>
            {props.queue.counts.total} total ·{" "}
            {props.queue.counts.placedAwaitingReview} awaiting review ·{" "}
            {props.queue.counts.reviewed} reviewed ·{" "}
            {props.queue.counts.unableToPlace} unable
          </span>
        </header>
        {props.selectedPiece ? (
          <div className="map-placement-inspector__queue-nav">
            <button
              className="sanborn-button"
              onClick={props.onPreviousUnplaced}
              type="button"
            >
              Previous
            </button>
            <button
              className="sanborn-button"
              onClick={props.onNextUnplaced}
              type="button"
            >
              Next unplaced
            </button>
            <button
              className="sanborn-button"
              onClick={props.onNextReview}
              type="button"
            >
              Next review-needed
            </button>
            <button
              className="sanborn-button"
              onClick={() => setQueueOpen((value) => !value)}
              type="button"
            >
              {queueOpen ? "Hide queue" : "Browse objects"}
            </button>
          </div>
        ) : null}
        {queueOpen ? (
          <>
            <label className="map-placement-inspector__filter">
              Queue
              <select
                value={queueFilter}
                onChange={(event) =>
                  setQueueFilter(event.target.value as MapPlacementQueueFilter)
                }
              >
                <option value="need_placement">
                  Need placement ({props.queue.counts.needPlacement})
                </option>
                <option value="drafts">
                  Drafts ({props.queue.counts.draft})
                </option>
                <option value="awaiting_review">
                  Awaiting review ({props.queue.counts.placedAwaitingReview})
                </option>
                <option value="reviewed">
                  Reviewed ({props.queue.counts.reviewed})
                </option>
                <option value="unable">
                  Unable ({props.queue.counts.unableToPlace})
                </option>
                <option value="current_sheet">Current sheet</option>
                <option value="all">All ({props.queue.counts.total})</option>
              </select>
            </label>
            <div className="map-placement-inspector__queue-list">
              {filteredItems.map((item) => (
                <button
                  className={
                    "map-placement-inspector__queue-item is-" +
                    item.status +
                    (item.pieceId === props.selectedPiece?.pieceId
                      ? " is-selected"
                      : "")
                  }
                  key={item.pieceId}
                  onClick={() => selectQueueItem(item)}
                  type="button"
                >
                  <strong>{item.label}</strong>
                  <span>
                    {item.printedReference
                      ? "Sheet " + item.printedReference
                      : "Sheet unresolved"}{" "}
                    · {item.category}
                  </span>
                  <small>{item.statusLabel}</small>
                </button>
              ))}
              {filteredItems.length === 0 ? (
                <p className="sanborn-atlas-empty">
                  No objects match this queue filter.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
      {props.selectedPiece ? (
        <>
          <dl className="map-placement-inspector__metadata">
            <dt>Source</dt>
            <dd>{sourceLabel}</dd>
            <dt>Uploaded file</dt>
            <dd>{props.selectedPageAssetName ?? "Unavailable"}</dd>
            <dt>Context</dt>
            <dd>
              {props.selectedPageSourceRegionLabel ??
                "No linked Town Index region"}
            </dd>
          </dl>
          {state === "unable_to_place" || exceptionOpen ? (
            <section className="map-placement-inspector__section">
              <h3>UNABLE TO PLACE</h3>
              <label>
                Reason *
                <textarea
                  value={
                    props.unableToPlaceReason ||
                    props.placement?.unableToPlaceReason ||
                    ""
                  }
                  onChange={(event) =>
                    props.onSetUnableToPlaceReason(event.target.value)
                  }
                  placeholder="Explain why this object cannot be placed."
                />
              </label>
              <label>
                Notes / evidence
                <textarea
                  value={props.placement?.notes ?? ""}
                  readOnly
                  placeholder="Saved placement notes"
                />
              </label>
              <div className="map-placement-inspector__actions">
                <button
                  className="sanborn-button"
                  onClick={() => setExceptionOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="sanborn-button sanborn-button--primary"
                  disabled={
                    !props.unableToPlaceReason.trim() || props.atlasReadOnly
                  }
                  onClick={() => {
                    props.onConfirmUnableToPlace();
                    setExceptionOpen(false);
                  }}
                  type="button"
                >
                  Confirm unable to place
                </button>
              </div>
            </section>
          ) : (
            <button
              className="map-placement-inspector__exception-link"
              onClick={() => setExceptionOpen(true)}
              type="button"
            >
              Mark unable to place
            </button>
          )}
          {showAlignment ? (
            <section className="map-placement-inspector__section">
              <h3>ALIGNMENT</h3>
              <div className="map-placement-inspector__segmented">
                <button
                  className={
                    "sanborn-button" +
                    (props.geoEditMode === "pan_modern_map"
                      ? " sanborn-button--primary"
                      : "")
                  }
                  onClick={() => props.onSetGeoEditMode("pan_modern_map")}
                  type="button"
                >
                  Pan modern map
                </button>
                <button
                  className={
                    "sanborn-button" +
                    (props.geoEditMode === "edit_historical_sheets"
                      ? " sanborn-button--primary"
                      : "")
                  }
                  onClick={() =>
                    props.onSetGeoEditMode("edit_historical_sheets")
                  }
                  type="button"
                >
                  Edit object
                </button>
              </div>
                {props.selectedMapPieceIsPolygon ? (
                  <label className="map-placement-inspector__geometry-toggle">
                  <input
                    checked={props.showGeometryGuides}
                    onChange={(event) =>
                      props.onSetGeometryGuides(event.target.checked)
                    }
                    type="checkbox"
                  />{" "}
                  Geometry guides
                  </label>
                ) : null}
                {props.hasStreetGuides ? (
                  <label className="map-placement-inspector__geometry-toggle">
                    <input checked={props.showStreetGuides} onChange={(event) => props.onSetStreetGuides(event.target.checked)} type="checkbox" /> Show street guides
                  </label>
                ) : null}
              <label>
                Opacity{" "}
                <output>
                  {Math.round(props.selectedMapPieceOpacity * 100)}%
                </output>
                <input
                  disabled={props.selectedMapPieceLocked}
                  max="1"
                  min="0.05"
                  step="0.01"
                  type="range"
                  value={props.selectedMapPieceOpacity}
                  onChange={(event) =>
                    props.onSetOpacity(Number(event.target.value))
                  }
                />
              </label>
              <label>
                Rotation{" "}
                <output>{Math.round(props.selectedMapPieceRotation)}°</output>
                <input
                  disabled={props.selectedMapPieceLocked}
                  max="180"
                  min="-180"
                  step="1"
                  type="range"
                  value={props.selectedMapPieceRotation}
                  onChange={(event) =>
                    props.onSetRotation(Number(event.target.value))
                  }
                />
              </label>
              {props.selectedMapPieceIsPolygon &&
              props.showGeometryGuides &&
              props.geometryMeasurements ? (
                <div className="map-placement-inspector__geometry-summary">
                  <strong>GEOMETRY</strong>
                  {props.geometryMeasurements.valid ? (
                    <>
                      <span>
                        NW{" "}
                        {formatGeometryMeasurement(
                          props.geometryMeasurements.corners[0]?.angle ?? 0,
                        )}
                        ° · NE{" "}
                        {formatGeometryMeasurement(
                          props.geometryMeasurements.corners[1]?.angle ?? 0,
                        )}
                        °
                      </span>
                      <span>
                        SW{" "}
                        {formatGeometryMeasurement(
                          props.geometryMeasurements.corners[3]?.angle ?? 0,
                        )}
                        ° · SE{" "}
                        {formatGeometryMeasurement(
                          props.geometryMeasurements.corners[2]?.angle ?? 0,
                        )}
                        °
                      </span>
                      <span>
                        Maximum drift:{" "}
                        {formatGeometryMeasurement(
                          props.geometryMeasurements.maximumCornerDeviation,
                        )}
                        °
                      </span>
                      <span>
                        Opposite edges: within{" "}
                        {formatGeometryMeasurement(
                          Math.max(
                            props.geometryMeasurements.oppositeEdgeDrift
                              .topBottom,
                            props.geometryMeasurements.oppositeEdgeDrift
                              .leftRight,
                          ),
                        )}
                        °
                      </span>
                    </>
                  ) : (
                    <span>
                      {props.geometryMeasurements.message ??
                        "Invalid corner order"}
                    </span>
                  )}
                </div>
              ) : null}
              <div className="map-placement-inspector__actions">
                <button
                  className="sanborn-button"
                  disabled={!props.selectedMapPiecePlaced}
                  onClick={props.onFitSelected}
                  type="button"
                >
                  Fit selected
                </button>
                <button
                  className="sanborn-button"
                  disabled={props.selectedMapPieceLocked}
                  onClick={props.onResetPiece}
                  type="button"
                >
                  Reset piece
                </button>
              </div>
            </section>
          ) : null}
          {state === "saved" || state === "reviewed" ? (
            <section className="map-placement-inspector__section">
              <h3>REVIEW</h3>
              <dl className="map-placement-inspector__summary">
                <dt>Status</dt>
                <dd>
                  {props.placement?.reviewStatus ??
                    props.placement?.placementStatus ??
                    "saved"}
                </dd>
                <dt>Visibility</dt>
                <dd>{props.selectedMapPieceVisible ? "Visible" : "Hidden"}</dd>
                <dt>Lock</dt>
                <dd>{props.selectedMapPieceLocked ? "Locked" : "Unlocked"}</dd>
                <dt>Reviewer</dt>
                <dd>{props.placement?.reviewerIdentity ?? "Not reviewed"}</dd>
              </dl>
              {dirtyPersisted ? (
                <p role="status">
                  Save or discard these changes before reviewing.
                </p>
              ) : state === "saved" ? (
                <button
                  className="sanborn-button sanborn-button--primary"
                  onClick={props.onMarkReviewed}
                  type="button"
                >
                  Mark reviewed
                </button>
              ) : null}
            </section>
          ) : null}
          <details className="map-placement-inspector__advanced">
            <summary>Advanced</summary>
            <label>
              Display scope
              <select
                aria-label="Map piece display scope"
                value={props.pieceDisplayScope}
                onChange={(event) =>
                  props.onSetDisplayScope(
                    event.target.value as MapPieceDisplayScope,
                  )
                }
              >
                <option value="all_placed_pieces">All placed pieces</option>
                <option value="current_page_only">Current page only</option>
              </select>
            </label>
            <div className="map-placement-inspector__actions">
              <button
                className="sanborn-button"
                onClick={props.onToggleVisible}
                type="button"
              >
                {props.selectedMapPieceVisible ? "Hide piece" : "Show piece"}
              </button>
              <button
                className="sanborn-button"
                onClick={props.onToggleLocked}
                type="button"
              >
                {props.selectedMapPieceLocked ? "Unlock piece" : "Lock piece"}
              </button>
              <button
                className="sanborn-button"
                onClick={props.onReloadPlacement}
                type="button"
              >
                Reload saved placement
              </button>
              <button
                className="sanborn-button"
                disabled={!props.allMapPieceBounds}
                onClick={props.onFitAll}
                type="button"
              >
                Fit all placed pieces
              </button>
              <button
                className="sanborn-button"
                onClick={props.onCenterTown}
                type="button"
              >
                Center on town
              </button>
            </div>
            <section className="map-placement-inspector__whole-sheet">
              <h4>Advanced whole-sheet reference</h4>
              <label>
                <input
                  checked={props.showReferenceSheetAlignment}
                  onChange={(event) =>
                    props.onSetShowReferenceSheetAlignment(event.target.checked)
                  }
                  type="checkbox"
                />{" "}
                Show reference sheet overlays
              </label>
              <button
                className="sanborn-button"
                disabled={!props.selectedAssetId}
                onClick={props.onPlaceSheet}
                type="button"
              >
                Place sheet
              </button>
              <button
                className="sanborn-button"
                disabled={!props.selectedSheetPlaced}
                onClick={props.onSaveSheet}
                type="button"
              >
                Save sheet placement
              </button>
              <button
                className="sanborn-button"
                disabled={!props.hasSelectedSheetGeoreference}
                onClick={props.onReloadSheet}
                type="button"
              >
                Reload sheet placement
              </button>
              <button
                className="sanborn-button"
                disabled={!props.hasSelectedSheetGeoreference}
                onClick={props.onResetSheet}
                type="button"
              >
                Reset sheet
              </button>
              <button
                className="sanborn-button"
                disabled={!props.selectedAssetId}
                onClick={props.onResetAllSheets}
                type="button"
              >
                Reset all sheets
              </button>
              <button
                className="sanborn-button"
                disabled={!props.hasSelectedSheetGeoreference}
                onClick={props.onFitSheet}
                type="button"
              >
                Fit sheet
              </button>
              <button
                className="sanborn-button"
                onClick={props.onToggleOverlayMode}
                type="button"
              >
                {props.overlayRenderMode === "projective"
                  ? "Rectangular overlay"
                  : "Projective overlay"}
              </button>
              <button
                className="sanborn-button"
                onClick={props.onTogglePlainMap}
                type="button"
              >
                {props.plainMapTestMode ? "Studio map" : "Plain map test"}
              </button>
            </section>
          </details>
        </>
      ) : null}
      {props.selectedPage && !props.selectedPageSupportsMapPlacement ? (
        <p className="sanborn-atlas-warning">
          {props.selectedPageToolBlockMessage}
        </p>
      ) : null}
    </section>
  );
}
function shortPlacementError(message: string): string {
  if (message.toLowerCase().includes("workspace"))
    return "Placement could not resolve the workspace. Reload the saved placement and try again.";
  if (message.toLowerCase().includes("unable to place"))
    return "Add a reason before saving this exception.";
  return message.replace(/^Save failed:\s*/i, "");
}
