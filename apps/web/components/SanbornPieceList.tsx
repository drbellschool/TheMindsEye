"use client";

import { useEffect, useState } from "react";

import {
  calculateSourceBoundingBox,
  sanbornMapPieceInventoryStatuses,
  sanbornMapPieceTypes,
  type SanbornMapPieceRecord,
  type SanbornMapPieceType,
  type SanbornMapPieceInventoryStatus,
} from "@/lib/sanborn-atlas";
import { getActiveSanbornMapPieceFeatureCategories, sanbornMapPieceFeatureCategoryLabels, sanbornMapPieceGeometryTypes, sanbornMapPieceReviewStatuses, type SanbornMapPieceFeatureCategory, type SanbornMapPieceGeometryType, type SanbornMapPieceReviewCategories, type SanbornMapPieceReviewStatus } from "@/lib/sanborn-map-piece-features";
import { calculateSourceQuadrilateralMeasurements, getSquareCornersEligibility, squareSanbornQuadrilateral } from "@/lib/sanborn-source-geometry";
import { formatGeometryMeasurement } from "@/lib/placement-geometry-measurements";
import { formatMapPiecePlacementLabel } from "@/lib/map-piece-label";

type SanbornPieceListProps = {
  pieces: SanbornMapPieceRecord[];
  selectedPieceId: string;
  readOnly: boolean;
  onSelectPiece: (pieceId: string) => void;
  onPatchPiece: (pieceId: string, patch: Partial<SanbornMapPieceRecord>) => void;
  onReorderPiece: (pieceId: string, direction: "up" | "down") => void;
  onDeletePiece: (pieceId: string) => void;
  onSetReviewCategory: (category: SanbornMapPieceFeatureCategory, status: SanbornMapPieceReviewStatus) => void;
  reviewCategories?: SanbornMapPieceReviewCategories;
  selectedAssetDimensions?: { width: number; height: number } | null;
  selectedPieceHasPlacement?: boolean;
  showAngleGuides?: boolean;
  onSetShowAngleGuides?: (value: boolean) => void;
};

function pieceLabel(piece: SanbornMapPieceRecord): string {
  return formatMapPiecePlacementLabel(piece);
}

export function SanbornPieceList({
  pieces,
  selectedPieceId,
  readOnly,
  onSelectPiece,
  onPatchPiece,
  onReorderPiece,
  onDeletePiece,
  onSetReviewCategory,
  reviewCategories = {},
  selectedAssetDimensions = null,
  selectedPieceHasPlacement = false,
  showAngleGuides: showAngleGuidesProp,
  onSetShowAngleGuides,
}: SanbornPieceListProps) {
  const [localShowAngleGuides, setLocalShowAngleGuides] = useState(true);
  const [squareUndo, setSquareUndo] = useState<{ pieceId: string; points: SanbornMapPieceRecord["sourcePolygon"] } | null>(null);
  const sortedPieces = [...pieces].sort((left, right) => left.pieceSequence - right.pieceSequence);
  const selectedPiece = pieces.find((piece) => piece.pieceId === selectedPieceId) ?? null;
  const selectedPoints = selectedPiece?.sourceGeometry?.points?.length ? selectedPiece.sourceGeometry.points : selectedPiece?.sourcePolygon ?? [];
  const squareEligibility = selectedPiece ? getSquareCornersEligibility({ geometryType: selectedPiece.sourceGeometry?.geometryType, points: selectedPiece.sourceGeometry?.points, sourcePolygon: selectedPiece.sourcePolygon, width: selectedAssetDimensions?.width, height: selectedAssetDimensions?.height, readOnly }) : null;
  const selectedMeasurements = squareEligibility?.measurements ?? (selectedPiece && selectedAssetDimensions ? calculateSourceQuadrilateralMeasurements(selectedPoints, selectedAssetDimensions.width, selectedAssetDimensions.height) : null);
  const alreadySquare = squareEligibility?.alreadySquare ?? false;
  const canSquare = Boolean(squareEligibility?.eligible);
  const showAngleGuides = showAngleGuidesProp ?? localShowAngleGuides;
  useEffect(() => { setSquareUndo(null); setLocalShowAngleGuides(true); }, [selectedPieceId]);
  useEffect(() => { if (selectedPiece?.isPersisted) setSquareUndo(null); }, [selectedPiece?.isPersisted, selectedPiece?.updatedAt]);
  function squareSelectedPiece() {
    if (!selectedPiece || !selectedAssetDimensions || !canSquare || alreadySquare) return;
    if (selectedPieceHasPlacement && typeof window !== "undefined" && !window.confirm("Changing this source outline may require you to realign and review its existing Map Placement. Geographic coordinates will not be changed.\n\nSquare corners?")) return;
    const result = squareSanbornQuadrilateral(squareEligibility?.normalizedPoints ?? selectedPoints, selectedAssetDimensions.width, selectedAssetDimensions.height);
    if (!result.ok) return;
    setSquareUndo({ pieceId: selectedPiece.pieceId, points: [...selectedPoints] });
    onPatchPiece(selectedPiece.pieceId, { sourceGeometry: { geometryType: "polygon", points: result.points }, sourcePolygon: result.points, sourceBBox: calculateSourceBoundingBox(result.points) });
  }
  function undoSquare() {
    if (!squareUndo || squareUndo.pieceId !== selectedPiece?.pieceId) return;
    onPatchPiece(squareUndo.pieceId, { sourceGeometry: { geometryType: "polygon", points: squareUndo.points }, sourcePolygon: squareUndo.points, sourceBBox: calculateSourceBoundingBox(squareUndo.points) });
    setSquareUndo(null);
  }

  return (
    <div className="sanborn-piece-list">
      <fieldset className="sanborn-piece-review-categories">
        <legend>Sheet review categories</legend>
        {getActiveSanbornMapPieceFeatureCategories().map((category) => {
          const status = reviewCategories[category] ?? "not_reviewed";
          return <label key={category}>{sanbornMapPieceFeatureCategoryLabels[category]}<select disabled={readOnly} value={status} onChange={(event) => onSetReviewCategory(category, event.target.value as SanbornMapPieceReviewStatus)}>{sanbornMapPieceReviewStatuses.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>;
        })}
      </fieldset>
      {sortedPieces.length === 0 ? <p className="sanborn-atlas-empty">No map pieces have been inventoried for this page. Use Mark point, Draw line, Draw area, or Add junction to record every geographically meaningful feature.</p> : null}
      {sortedPieces.map((piece, index) => (
        <article className={`sanborn-piece-list__item${piece.pieceId === selectedPieceId ? " is-selected" : ""}`} data-focus-target={`map-piece-inspector-card:${piece.pieceId}`} key={piece.pieceId} tabIndex={-1}>
          <button className="sanborn-piece-list__select" onClick={() => onSelectPiece(piece.pieceId)} type="button">
            <strong>{pieceLabel(piece)}</strong>
            <span>{piece.pieceType.replaceAll("_", " ")}</span>
          </button>
          <div className="sanborn-piece-list__fields">
            <label>
              Type
              <select
                disabled={readOnly}
                value={piece.pieceType}
                onChange={(event) => onPatchPiece(piece.pieceId, { pieceType: event.target.value as SanbornMapPieceType })}
              >
                {sanbornMapPieceTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Geometry
              <select disabled={readOnly} value={piece.sourceGeometry?.geometryType ?? "polygon"} onChange={(event) => onPatchPiece(piece.pieceId, { sourceGeometry: { geometryType: event.target.value as SanbornMapPieceGeometryType, points: piece.sourceGeometry?.points ?? piece.sourcePolygon } })}>
                {sanbornMapPieceGeometryTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label>
              Category
              <select disabled={readOnly} value={piece.featureCategory ?? "blocks_and_lots"} onChange={(event) => onPatchPiece(piece.pieceId, { featureCategory: event.target.value as SanbornMapPieceFeatureCategory })}>
                {getActiveSanbornMapPieceFeatureCategories(piece.featureCategory).map((category) => <option key={category} value={category}>{sanbornMapPieceFeatureCategoryLabels[category]}</option>)}
              </select>
            </label>
            <label>
              Block number
              <input
                disabled={readOnly}
                value={piece.blockNumberText ?? ""}
                onChange={(event) => onPatchPiece(piece.pieceId, { blockNumberText: event.target.value })}
              />
            </label>
            <label>
              Title text
              <input
                disabled={readOnly}
                value={piece.titleText ?? ""}
                onChange={(event) => onPatchPiece(piece.pieceId, { titleText: event.target.value })}
              />
            </label>
            <label>
              Placement
              <select disabled={readOnly} value={piece.placementEligibility ?? "available"} onChange={(event) => onPatchPiece(piece.pieceId, { placementEligibility: event.target.value as SanbornMapPieceRecord["placementEligibility"] })}>
                <option value="available">available for placement</option><option value="reference_only">reference-only</option><option value="unresolved">unresolved</option>
              </select>
            </label>
            <label>
              Printed symbol / capacity
              <input disabled={readOnly} value={piece.printedSymbolText ?? ""} onChange={(event) => onPatchPiece(piece.pieceId, { printedSymbolText: event.target.value })} />
            </label>
            <label>
              Inventory
              <select
                disabled={readOnly}
                value={piece.inventoryStatus}
                onChange={(event) => onPatchPiece(piece.pieceId, { inventoryStatus: event.target.value as SanbornMapPieceInventoryStatus })}
              >
                {sanbornMapPieceInventoryStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            {piece.pieceId === selectedPieceId ? <section className="sanborn-piece-list__geometry" aria-label="Source geometry measurements">
              <strong>GEOMETRY</strong>
              {selectedMeasurements?.valid && showAngleGuides ? <><span>NW {formatGeometryMeasurement(selectedMeasurements.corners[0]?.angle ?? 0)}° · NE {formatGeometryMeasurement(selectedMeasurements.corners[1]?.angle ?? 0)}°</span><span>SW {formatGeometryMeasurement(selectedMeasurements.corners[3]?.angle ?? 0)}° · SE {formatGeometryMeasurement(selectedMeasurements.corners[2]?.angle ?? 0)}°</span><span>Maximum corner drift: {formatGeometryMeasurement(selectedMeasurements.maximumCornerDeviation)}°</span><span>Top/bottom parallel drift: {formatGeometryMeasurement(selectedMeasurements.oppositeEdgeDrift.topBottom)}°</span><span>Left/right parallel drift: {formatGeometryMeasurement(selectedMeasurements.oppositeEdgeDrift.leftRight)}°</span></> : <span>{!selectedAssetDimensions ? "Preparing geometry tools." : squareEligibility?.disabledReason ?? "Geometry measurements are unavailable."}</span>}
              {selectedMeasurements?.valid ? <label className="sanborn-piece-list__inline-toggle"><input checked={showAngleGuides} onChange={(event) => { setLocalShowAngleGuides(event.target.checked); onSetShowAngleGuides?.(event.target.checked); }} type="checkbox" /> Show angle guides</label> : null}
              <button aria-describedby={`square-corners-reason-${piece.pieceId}`} className="sanborn-button" disabled={!canSquare} onClick={squareSelectedPiece} title={squareEligibility?.disabledReason ?? undefined} type="button">{alreadySquare ? "Already squared" : "Square corners"}</button>
              {squareUndo?.pieceId === piece.pieceId ? <button className="sanborn-button" onClick={undoSquare} type="button">Undo square-up</button> : null}
              <small id={`square-corners-reason-${piece.pieceId}`}>{squareEligibility?.disabledReason ?? "Makes all four corners 90 while preserving orientation and proportions."}</small>
            </section> : null}
            <label className="sanborn-piece-list__notes">
              Notes
              <textarea disabled={readOnly} value={piece.notes ?? ""} onChange={(event) => onPatchPiece(piece.pieceId, { notes: event.target.value })} />
            </label>
          </div>
          <div className="sanborn-piece-list__actions">
            <button className="sanborn-button" disabled={readOnly || index === 0} onClick={() => onReorderPiece(piece.pieceId, "up")} type="button">
              Move up
            </button>
            <button className="sanborn-button" disabled={readOnly || index === sortedPieces.length - 1} onClick={() => onReorderPiece(piece.pieceId, "down")} type="button">
              Move down
            </button>
            <button className="sanborn-button" disabled={readOnly} onClick={() => onDeletePiece(piece.pieceId)} type="button">
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
