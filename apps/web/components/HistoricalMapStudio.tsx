"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { LatLngTuple } from "leaflet";

import {
  HistoricalMapLeaflet,
  PlainLeafletMapTest,
  basemaps,
  type HistoricalPieceMapLayer,
  type HistoricalSheetMapLayer,
  type LeafletTileRuntimeDebug,
  type SheetImageLoadState,
} from "@/components/HistoricalMapLeaflet";
import {
  SanbornAtlasNavigator,
  sanbornAtlasWorkflowSteps,
  type SanbornAtlasWorkflowStep,
} from "@/components/SanbornAtlasNavigator";
import { SanbornPageWorkbench } from "@/components/SanbornPageWorkbench";
import { createTileDiagnostics, defaultBasemapKey, shouldAutoFallbackBasemap, type TileDiagnostics } from "@/lib/historical-map-basemap";
import type { GeocodeSuccess } from "@/lib/historical-map-geocode";
import {
  canAutosaveStudioMode,
  canDragStudioPlacement,
  canEditHistoricalSheetOnMap,
  buildInitialHistory,
  clampHistoricalOpacity,
  findDuplicateStudioSheetNumbers,
  findMissingStudioSheetNumbers,
  getWorkspaceStatus,
  maxStudioScale,
  minStudioScale,
  normalizeRotation,
  pushStudioHistory,
  redoStudioHistory,
  reorderPlacement,
  shouldAttachStudioTransformer,
  shouldIgnoreStudioShortcut,
  shouldClearStudioSelection,
  shouldRefreshSignedUrl,
  selectPreferredSheetAfterUpload,
  shouldPanStudioStage,
  studioAutosaveDelayMs,
  studioTransformerAnchors,
  undoStudioHistory,
  updatePlacement,
  type HistoricalMapStudioState,
  type StudioHistoryState,
  type StudioPlacement,
  type StudioPresentState,
  type StudioSaveStatus,
  type StudioSheetAsset,
  type StudioViewport,
} from "@/lib/historical-map-studio";
import {
  buildInitialSheetGeographicHistory,
  createSheetGeoreferencesFromStitching,
  moveSheetGeographicAssembly,
  normalizeSheetGeographicTransform,
  normalizeGeographicMapSettings,
  isAccidentalZeroSheetPlacement,
  hasOperationalSheetPlacement,
  placeSheetAtMapCenter,
  pushSheetGeographicHistory,
  redoSheetGeographicHistory,
  removeSheetGeographicPlacement,
  resetSheetGeographicPlacementToCenter,
  reorderSheetGeographicTransform,
  selectManualSheetPlacementForSave,
  sheetPlacementMatchesForPersistence,
  undoSheetGeographicHistory,
  updateSheetGeographicTransform,
  updateSheetGeographicCorner,
  type GeoEditMode,
  type MovementScope,
  type SheetGeographicHistoryState,
  type SheetGeographicPresentState,
  type SheetGeographicTransform,
} from "@/lib/historical-map-sheet-georeference";
import {
  hasOperationalMapPiecePlacement,
  mergeSavedAndDefaultMapPieceGeoreferences,
  normalizeSanbornMapPieceGeoreference,
  piecePlacementMatchesForPersistence,
  placeMapPieceAtCenter,
  rotateMapPieceGeoreference,
  type SanbornMapPieceGeoreference,
} from "@/lib/sanborn-map-piece-georeference";
import { reviewStatuses } from "@/lib/community-status";
import {
  buildDefaultSanbornPageId,
  getUnassignedSanbornUploads,
  normalizeOptionalSanbornText,
  reorderAtlasPages,
  reorderMapPieces,
  type SanbornAtlasPageRecord,
  type SanbornMapPieceRecord,
} from "@/lib/sanborn-atlas";
import {
  boundsFromCorners,
  calculateAffineTransform,
  clampOverlayOpacity,
  createDefaultGeoCorners,
  deriveGeoreferenceStatus,
  getCompleteControlPoints,
  normalizeControlPoint,
  normalizeGeoBounds,
  isNearZeroCoordinate,
  isOperationalMapCenter,
  type GeoBounds,
  type GeoCoordinate,
  type GeoCorners,
  type HistoricalMapControlPoint,
  type HistoricalMapGeoreference,
} from "@/lib/historical-map-georeference";
import { formatBytes } from "@/lib/sanborn-intake";

type UploadStatus = {
  filename: string;
  status: "uploading" | "saved" | "failed";
  message: string;
};

type MetadataDraft = {
  sheetNumber: string;
  sourceRecordId: string;
  sourceUrl: string;
  archiveName: string;
  rightsNote: string;
  intakeNotes: string;
  evidenceClassification: string;
  reviewStatus: string;
};

type StudioWorkspaceMode = "stitching" | "georeferencing" | "modern_overlay";

type GeoreferenceDraft = {
  targetType: "sheet" | "workspace";
  targetAssetId: string | null;
  corners: GeoCorners;
  bounds: GeoBounds | null;
  controlPoints: HistoricalMapControlPoint[];
  selectedControlPointId: string;
  selectedBasemap: string;
  overlayOpacity: number;
  overlayVisible: boolean;
  showControlPoints: boolean;
  showSheetBoundaries: boolean;
  notes: string;
  status: string;
};

type ModernTileDiagnostics = TileDiagnostics & {
  basemapKey: string;
  tileLayerMounted: boolean;
};

type MapViewChangeSource =
  | "initial"
  | "location_search"
  | "town_package"
  | "leaflet_moveend"
  | "leaflet_zoomend"
  | "user_pan"
  | "user_zoom"
  | "requested_view"
  | "fit_bounds"
  | "force_tile_redraw"
  | "fit_sheet"
  | "reset_invalid_placements"
  | "reload_saved";

type MapInteractionStatus = "idle" | "panning" | "zooming" | "saved";

type PendingStudioSelection = {
  atlasId: string;
  pageId: string;
  pieceId?: string;
  assetId?: string;
  workflowStep: SanbornAtlasWorkflowStep;
};

type InitialStudioSelection = {
  workflowStep?: string;
  atlasId?: string;
  pageId?: string;
  pieceId?: string;
  assetId?: string;
};

const minimumUsefulGpsZoom = 12;
const defaultTownGpsZoom = 16;
const minimumAutoGpsZoom = 15;
const maximumAutoGpsZoom = 18;

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Unavailable";
}

function getMapPieceDisplayLabel(piece: SanbornMapPieceRecord | null | undefined): string {
  if (!piece) {
    return "No map piece selected";
  }

  return piece.titleText || (piece.blockNumberText ? `Block ${piece.blockNumberText}` : `Piece ${piece.pieceSequence}`);
}

function hasMapPieceGeographicFootprint(placement: SanbornMapPieceGeoreference | null | undefined): boolean {
  if (!placement) {
    return false;
  }

  return [
    placement.corners.northwest,
    placement.corners.northeast,
    placement.corners.southeast,
    placement.corners.southwest,
  ].some((coordinate) => coordinate && isOperationalMapCenter(coordinate));
}

function getMapPiecePlacementLabel(placement: SanbornMapPieceGeoreference | null | undefined): string {
  if (!placement || placement.placementStatus === "unplaced" || !hasMapPieceGeographicFootprint(placement)) {
    return "Not placed";
  }

  if (placement.placementStatus === "reviewed") {
    return "Reviewed placement";
  }

  return placement.isPersisted ? "Saved placement" : "Draft placement";
}

function getMapPiecePlacementClass(placement: SanbornMapPieceGeoreference | null | undefined): string {
  if (!placement || placement.placementStatus === "unplaced" || !hasMapPieceGeographicFootprint(placement)) {
    return "is-unplaced";
  }

  if (placement.placementStatus === "reviewed") {
    return "is-reviewed";
  }

  return placement.isPersisted ? "is-saved" : "is-draft";
}

function getSourcePolygonSvgPoints(piece: SanbornMapPieceRecord, asset: StudioSheetAsset): string {
  return piece.sourcePolygon
    .map((point) => `${Number((point.x * asset.width).toFixed(2))},${Number((point.y * asset.height).toFixed(2))}`)
    .join(" ");
}

function normalizeAtlasWorkflowStep(value: string | null | undefined): SanbornAtlasWorkflowStep | null {
  if (value === "map_placement") {
    return "gps_alignment";
  }

  return sanbornAtlasWorkflowSteps.some((step) => step.id === value) ? (value as SanbornAtlasWorkflowStep) : null;
}

function createPresentFromState(studioState: HistoricalMapStudioState): StudioPresentState {
  return {
    viewport: studioState.workspace?.viewport ?? { x: 0, y: 0, scale: 1 },
    placements: studioState.placements,
  };
}

function createSheetGeographicPresentFromState(studioState: HistoricalMapStudioState): SheetGeographicPresentState {
  return {
    sheets: studioState.sheetGeoreferences,
    mapSettings: normalizeGeographicMapSettings(studioState.geographicMap),
  };
}

function createMetadataDraft(asset: StudioSheetAsset | null): MetadataDraft {
  return {
    sheetNumber: asset?.sheetNumber ? String(asset.sheetNumber) : "",
    sourceRecordId: asset?.sourceRecordId ?? "",
    sourceUrl: asset?.sourceUrl ?? "",
    archiveName: asset?.archiveName ?? "",
    rightsNote: asset?.rightsNote ?? "",
    intakeNotes: asset?.intakeNotes ?? "",
    evidenceClassification: asset?.evidenceClassification ?? "unknown",
    reviewStatus: asset?.reviewStatus ?? "unknown",
  };
}

function getDefaultTownCenter(studioState: HistoricalMapStudioState): GeoCoordinate {
  if (isOperationalMapCenter(studioState.geographicMap.center)) {
    return studioState.geographicMap.center;
  }

  const sheetCenter = getSheetBoundsCenterFromState(studioState);

  if (sheetCenter) {
    return sheetCenter;
  }

  const townCenter = getTownCenterFromState(studioState);

  if (townCenter) {
    return townCenter;
  }

  const existingGeoreference = studioState.georeferences.find((georeference) => georeference.bounds);

  if (existingGeoreference?.bounds) {
    const center = {
      latitude: (existingGeoreference.bounds.northLatitude + existingGeoreference.bounds.southLatitude) / 2,
      longitude: (existingGeoreference.bounds.eastLongitude + existingGeoreference.bounds.westLongitude) / 2,
    };

    if (isOperationalMapCenter(center)) {
      return center;
    }
  }

  const firstTownCenter = studioState.townPackages
    .map((town) =>
      typeof town.centerLatitude === "number" && typeof town.centerLongitude === "number"
        ? { latitude: town.centerLatitude, longitude: town.centerLongitude }
        : null,
    )
    .find((center) => isOperationalMapCenter(center));

  return firstTownCenter ?? { latitude: 0, longitude: 0 };
}

function createGeoreferenceDraft(studioState: HistoricalMapStudioState, targetAssetId: string | null): GeoreferenceDraft {
  const saved =
    studioState.georeferences.find((georeference) => georeference.targetType === "sheet" && georeference.targetAssetId === targetAssetId) ??
    studioState.georeferences.find((georeference) => georeference.targetType === "workspace" && !targetAssetId) ??
    null;
  const corners = saved?.corners ?? createDefaultGeoCorners(getDefaultTownCenter(studioState));
  const bounds = saved?.bounds ?? boundsFromCorners(corners);

  return {
    targetType: targetAssetId ? "sheet" : "workspace",
    targetAssetId,
    corners,
    bounds,
    controlPoints: saved?.controlPoints ?? [],
    selectedControlPointId: saved?.controlPoints[0]?.controlPointId ?? "",
    selectedBasemap: saved?.selectedBasemap ?? studioState.selectedBasemap,
    overlayOpacity: clampOverlayOpacity(saved?.overlayOpacity ?? studioState.overlayOpacity),
    overlayVisible: saved?.overlayVisible ?? studioState.overlayVisible,
    showControlPoints: saved?.showControlPoints ?? true,
    showSheetBoundaries: saved?.showSheetBoundaries ?? true,
    notes: saved?.notes ?? "",
    status: saved?.status ?? "not_started",
  };
}

function updateDraftPoint(points: HistoricalMapControlPoint[], controlPointId: string, patch: Partial<HistoricalMapControlPoint>) {
  return points.map((point) => (point.controlPointId === controlPointId ? normalizeControlPoint({ ...point, ...patch, controlPointId }) : point));
}

function formatCoordinate(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(6) : "unavailable";
}

function coordinatesClose(left: GeoCoordinate | null | undefined, right: GeoCoordinate | null | undefined, tolerance = 0.05): boolean {
  return Boolean(
    left &&
      right &&
      Math.abs(left.latitude - right.latitude) <= tolerance &&
      Math.abs(left.longitude - right.longitude) <= tolerance,
  );
}

function getPlacementBounds(assets: StudioSheetAsset[], placements: StudioPlacement[]) {
  const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
  const visiblePlacements = placements.filter((placement) => placement.isVisible);

  if (visiblePlacements.length === 0) {
    return null;
  }

  const corners = visiblePlacements
    .map((placement) => {
      const asset = assetById.get(placement.assetId);

      if (!asset) {
        return null;
      }

      return getTransformedCorners(placement, asset.width, asset.height);
    })
    .filter((transformedCorners): transformedCorners is Array<{ x: number; y: number }> => Boolean(transformedCorners))
    .flat();

  if (corners.length === 0) {
    return null;
  }

  return {
    x1: Math.min(...corners.map((corner) => corner.x)),
    y1: Math.min(...corners.map((corner) => corner.y)),
    x2: Math.max(...corners.map((corner) => corner.x)),
    y2: Math.max(...corners.map((corner) => corner.y)),
  };
}

function getInitialGeoEditMode(studioState: HistoricalMapStudioState, selectedAssetId: string | null | undefined): GeoEditMode {
  const selected = selectedAssetId ? studioState.sheetGeoreferences.find((sheet) => sheet.assetId === selectedAssetId) : null;

  return selected ? "edit_historical_sheets" : "pan_modern_map";
}

function getTownCenterFromState(studioState: HistoricalMapStudioState): GeoCoordinate | null {
  const town = studioState.activeTownPackage;

  if (typeof town?.centerLatitude !== "number" || typeof town.centerLongitude !== "number") {
    return null;
  }

  const center = { latitude: town.centerLatitude, longitude: town.centerLongitude };

  return isOperationalMapCenter(center) ? center : null;
}

function getGpsTownCenterFromState(studioState: HistoricalMapStudioState): GeoCoordinate {
  return getTownCenterFromState(studioState) ?? getDefaultTownCenter(studioState);
}

function getGpsTownZoomFromState(studioState: HistoricalMapStudioState): number {
  const townZoom = typeof studioState.activeTownPackage?.defaultZoom === "number" ? studioState.activeTownPackage.defaultZoom : defaultTownGpsZoom;
  const preferredZoom = Math.max(defaultTownGpsZoom, townZoom);

  return Math.min(maximumAutoGpsZoom, Math.max(minimumAutoGpsZoom, preferredZoom));
}

function isMeaningfulGpsView(center: GeoCoordinate | null | undefined, zoom: number | null | undefined): boolean {
  return Boolean(center && isOperationalMapCenter(center) && typeof zoom === "number" && zoom >= minimumUsefulGpsZoom);
}

function getSheetBoundsCenterFromState(studioState: HistoricalMapStudioState): GeoCoordinate | null {
  const coordinates = studioState.sheetGeoreferences
    .filter((sheet) => sheet.isVisible && sheet.placementStatus !== "unplaced")
    .flatMap((sheet) => [sheet.corners.northwest, sheet.corners.northeast, sheet.corners.southeast, sheet.corners.southwest])
    .filter((coordinate): coordinate is GeoCoordinate => Boolean(coordinate) && isOperationalMapCenter(coordinate));

  if (coordinates.length < 2) {
    return null;
  }

  return {
    latitude: (Math.max(...coordinates.map((coordinate) => coordinate.latitude)) + Math.min(...coordinates.map((coordinate) => coordinate.latitude))) / 2,
    longitude: (Math.max(...coordinates.map((coordinate) => coordinate.longitude)) + Math.min(...coordinates.map((coordinate) => coordinate.longitude))) / 2,
  };
}

function getTransformedCorners(placement: StudioPlacement, width: number, height: number) {
  const radians = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const skewXRadians = (placement.skewX * Math.PI) / 180;
  const skewYRadians = (placement.skewY * Math.PI) / 180;
  const skewXTangent = Math.tan(skewXRadians);
  const skewYTangent = Math.tan(skewYRadians);
  const signedScaleX = placement.scaleX * (placement.isFlippedHorizontally ? -1 : 1);
  const signedScaleY = placement.scaleY * (placement.isFlippedVertically ? -1 : 1);
  const offsetX = placement.isFlippedHorizontally ? width : 0;
  const offsetY = placement.isFlippedVertically ? height : 0;
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];

  return corners.map((corner) => {
    const scaledX = (corner.x - offsetX) * signedScaleX;
    const scaledY = (corner.y - offsetY) * signedScaleY;
    const skewedX = scaledX + skewXTangent * scaledY;
    const skewedY = skewYTangent * scaledX + scaledY;

    return {
      x: placement.x + skewedX * cos - skewedY * sin,
      y: placement.y + skewedX * sin + skewedY * cos,
    };
  });
}

function getPlacementCenter(placement: StudioPlacement, asset: StudioSheetAsset) {
  const corners = getTransformedCorners(placement, asset.width, asset.height);
  const minX = Math.min(...corners.map((corner) => corner.x));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxY = Math.max(...corners.map((corner) => corner.y));

  return {
    x: minX + (maxX - minX) / 2,
    y: minY + (maxY - minY) / 2,
  };
}

function escapeSvgAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function buildWorkspaceCompositeImage(assets: StudioSheetAsset[], placements: StudioPlacement[]) {
  const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
  const visiblePlacements = placements
    .filter((placement) => placement.isVisible)
    .map((placement) => ({ placement, asset: assetById.get(placement.assetId) ?? null }))
    .filter((item): item is { placement: StudioPlacement; asset: StudioSheetAsset } => Boolean(item.asset?.signedUrl));

  if (visiblePlacements.length === 0) {
    return null;
  }

  const corners = visiblePlacements.flatMap(({ placement, asset }) => getTransformedCorners(placement, asset.width, asset.height));
  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const maxY = Math.max(...corners.map((corner) => corner.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const imageElements = visiblePlacements
    .sort((a, b) => a.placement.layerOrder - b.placement.layerOrder)
    .map(({ placement, asset }) => {
      const href = escapeSvgAttribute(asset.signedUrl!);
      const signedScaleX = placement.scaleX * (placement.isFlippedHorizontally ? -1 : 1);
      const signedScaleY = placement.scaleY * (placement.isFlippedVertically ? -1 : 1);
      const offsetX = placement.isFlippedHorizontally ? asset.width : 0;
      const offsetY = placement.isFlippedVertically ? asset.height : 0;
      const transform = `translate(${placement.x} ${placement.y}) rotate(${placement.rotation}) skewX(${placement.skewX}) skewY(${placement.skewY}) scale(${signedScaleX} ${signedScaleY}) translate(${-offsetX} ${-offsetY})`;

      return `<image href="${href}" width="${asset.width}" height="${asset.height}" opacity="${placement.opacity}" transform="${transform}" preserveAspectRatio="none" />`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">${imageElements}</svg>`;

  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
    offsetX: minX,
    offsetY: minY,
  };
}

function useLoadedImage(src: string | null, onError: () => void) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setImage(null);
      setFailed(true);
      return;
    }

    let cancelled = false;
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      if (!cancelled) {
        setImage(nextImage);
        setFailed(false);
      }
    };
    nextImage.onerror = () => {
      if (!cancelled) {
        setImage(null);
        setFailed(true);
        onError();
      }
    };
    nextImage.src = src;

    return () => {
      cancelled = true;
    };
  }, [src, onError]);

  return { image, failed };
}

const minimumRenderedSheetSize = 28;

function setKonvaCursor(event: KonvaEventObject<globalThis.MouseEvent | PointerEvent | DragEvent>, cursor: string) {
  const container = event.target.getStage()?.container();
  if (container) {
    container.style.cursor = cursor;
  }
}

function StudioSheetNode({
  asset,
  placement,
  isSelected,
  isDraggable,
  onSelect,
  onCommit,
  onNode,
  onRefreshSignedUrl,
}: {
  asset: StudioSheetAsset;
  placement: StudioPlacement;
  isSelected: boolean;
  isDraggable: boolean;
  onSelect: () => void;
  onCommit: (patch: Partial<StudioPlacement>) => void;
  onNode: (node: any | null) => void;
  onRefreshSignedUrl: () => void;
}) {
  const imageResult = useLoadedImage(asset.signedUrl, onRefreshSignedUrl);
  const signedScaleX = placement.scaleX * (placement.isFlippedHorizontally ? -1 : 1);
  const signedScaleY = placement.scaleY * (placement.isFlippedVertically ? -1 : 1);
  const offsetX = placement.isFlippedHorizontally ? asset.width : 0;
  const offsetY = placement.isFlippedVertically ? asset.height : 0;
  const cursor = placement.isLocked ? "not-allowed" : "grab";

  function selectBeforePointerAction(event: KonvaEventObject<globalThis.MouseEvent | PointerEvent>) {
    event.cancelBubble = true;
    onSelect();
  }

  function handleDragStart(event: KonvaEventObject<DragEvent>) {
    event.cancelBubble = true;
    onSelect();
    const container = event.target.getStage()?.container();
    if (container) {
      container.style.cursor = "grabbing";
    }
  }

  function handleDragEnd(event: KonvaEventObject<DragEvent>) {
    event.cancelBubble = true;
    setKonvaCursor(event, cursor);
    onCommit({ x: event.target.x(), y: event.target.y() });
  }

  function handleTransformEnd(event: KonvaEventObject<Event>) {
    event.cancelBubble = true;
    const node = event.target;
    const nextScaleX = Math.max(minStudioScale, Math.min(maxStudioScale, Math.abs(node.scaleX())));
    const nextScaleY = Math.max(minStudioScale, Math.min(maxStudioScale, Math.abs(node.scaleY())));

    onCommit({
      x: node.x(),
      y: node.y(),
      scaleX: nextScaleX,
      scaleY: nextScaleY,
      skewX: node.skewX(),
      skewY: node.skewY(),
      rotation: node.rotation(),
    });
  }

  if (!placement.isVisible) {
    return null;
  }

  if (!imageResult.image || imageResult.failed) {
    return (
      <>
        <Rect
          ref={onNode}
          x={placement.x}
          y={placement.y}
          width={Math.max(asset.width, 220)}
          height={Math.max(asset.height, 150)}
          scaleX={signedScaleX}
          scaleY={signedScaleY}
          offsetX={offsetX}
          offsetY={offsetY}
          skewX={placement.skewX}
          skewY={placement.skewY}
          rotation={placement.rotation}
          opacity={placement.opacity}
          fill="rgba(55, 38, 28, 0.82)"
          stroke={isSelected ? "#e2be7e" : "rgba(226,190,126,0.32)"}
          dash={[10, 8]}
          draggable={isDraggable}
          listening
          onClick={onSelect}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
          onMouseEnter={(event) => setKonvaCursor(event, cursor)}
          onMouseLeave={(event) => setKonvaCursor(event, "default")}
          onPointerDown={selectBeforePointerAction}
          onTap={onSelect}
          onTransformEnd={handleTransformEnd}
        />
        <Text x={placement.x + 18} y={placement.y + 18} text="Image unavailable" fill="#f6e7cb" fontSize={18} listening={false} />
      </>
    );
  }

  return (
    <KonvaImage
      ref={onNode}
      image={imageResult.image}
      x={placement.x}
      y={placement.y}
      width={asset.width}
      height={asset.height}
      scaleX={signedScaleX}
      scaleY={signedScaleY}
      offsetX={offsetX}
      offsetY={offsetY}
      skewX={placement.skewX}
      skewY={placement.skewY}
      rotation={placement.rotation}
      opacity={placement.opacity}
      stroke={isSelected ? "#e2be7e" : "transparent"}
      strokeWidth={isSelected ? 8 : 0}
      draggable={isDraggable}
      listening
      onClick={onSelect}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      onMouseEnter={(event) => setKonvaCursor(event, cursor)}
      onMouseLeave={(event) => setKonvaCursor(event, "default")}
      onPointerDown={selectBeforePointerAction}
      onTap={onSelect}
      onTransformEnd={handleTransformEnd}
    />
  );
}

export function HistoricalMapStudio({
  initialData,
  initialSelection = {},
}: {
  initialData: HistoricalMapStudioState;
  initialSelection?: InitialStudioSelection;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<any | null>(null);
  const transformerRef = useRef<any | null>(null);
  const sheetNodeRefs = useRef<Map<string, any>>(new Map());
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadedAssetIdRef = useRef<string>("");
  const minimalMapRef = useRef<HTMLElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const saveInFlightRef = useRef(false);
  const [stageSize, setStageSize] = useState({ width: 1100, height: 720 });
  const [sheets, setSheets] = useState<StudioSheetAsset[]>(initialData.sheets);
  const [history, setHistory] = useState<StudioHistoryState>(buildInitialHistory(createPresentFromState(initialData)));
  const [geoHistory, setGeoHistory] = useState<SheetGeographicHistoryState>(buildInitialSheetGeographicHistory(createSheetGeographicPresentFromState(initialData)));
  const initialSelectedAssetId = initialData.sheets[0]?.assetId ?? "";
  const [selectedAssetId, setSelectedAssetId] = useState(initialSelectedAssetId);
  const [isDirty, setIsDirty] = useState(initialData.placements.some((placement) => !placement.isPersisted) || !initialData.workspace?.isPersisted);
  const [saveStatus, setSaveStatus] = useState<StudioSaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(initialData.workspace?.updatedAt ?? "");
  const [search, setSearch] = useState("");
  const [sheetFilter, setSheetFilter] = useState<"all" | "unplaced" | "draft" | "aligned" | "reviewed" | "hidden" | "locked" | "warnings">("all");
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [isStagePanning, setIsStagePanning] = useState(false);
  const [uniformScale, setUniformScale] = useState(false);
  const [canvasCoordinates, setCanvasCoordinates] = useState({ x: 0, y: 0 });
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>(createMetadataDraft(initialData.sheets[0] ?? null));
  const [atlasInventory, setAtlasInventory] = useState(initialData.atlasInventory);
  const [mapPieceGeoreferences, setMapPieceGeoreferences] = useState<SanbornMapPieceGeoreference[]>(
    mergeSavedAndDefaultMapPieceGeoreferences(initialData.atlasInventory.pieces, initialData.mapPieceGeoreferences),
  );
  const [atlasWorkflowStep, setAtlasWorkflowStep] = useState<SanbornAtlasWorkflowStep>("source");
  const [selectedAtlasId, setSelectedAtlasId] = useState(initialData.atlasInventory.activeAtlasId ?? "");
  const [selectedAtlasPageId, setSelectedAtlasPageId] = useState(initialData.atlasInventory.activePageId ?? "");
  const [selectedMapPieceId, setSelectedMapPieceId] = useState("");
  const [lastNonGpsWorkflowStep, setLastNonGpsWorkflowStep] = useState<Exclude<SanbornAtlasWorkflowStep, "gps_alignment">>("source");
  const pendingStudioSelectionRef = useRef<PendingStudioSelection | null>(null);
  const initialSelectionAppliedRef = useRef(false);
  const [studioMode, setStudioMode] = useState<StudioWorkspaceMode>("georeferencing");
  const [geoEditMode, setGeoEditMode] = useState<GeoEditMode>(getInitialGeoEditMode(initialData, initialSelectedAssetId));
  const [movementScope, setMovementScope] = useState<MovementScope>(initialData.geographicMap.movementScope);
  const [showSheetLabels, setShowSheetLabels] = useState(true);
  const [showHistoricalLayers, setShowHistoricalLayers] = useState(true);
  const [comparisonMode, setComparisonMode] = useState<"both" | "modern_only" | "historical_only">("both");
  const [globalHistoricalOpacity, setGlobalHistoricalOpacity] = useState(initialData.geographicMap.globalHistoricalOpacity);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [placementAnchorAssetId, setPlacementAnchorAssetId] = useState("");
  const [piecePlacementAnchorId, setPiecePlacementAnchorId] = useState("");
  const [showReferenceSheetAlignment, setShowReferenceSheetAlignment] = useState(false);
  const [georeferenceDraft, setGeoreferenceDraft] = useState<GeoreferenceDraft>(createGeoreferenceDraft(initialData, initialData.sheets[0]?.assetId ?? null));
  const [historicalClickMode, setHistoricalClickMode] = useState<"idle" | "adding_point">("idle");
  const [mapCursor, setMapCursor] = useState<any>(null);
  const [mapCenter, setMapCenter] = useState<GeoCoordinate>(getDefaultTownCenter(initialData));
  const [modernMapZoom, setModernMapZoom] = useState(initialData.geographicMap.zoom);
  const [sheetImageStates, setSheetImageStates] = useState<Record<string, SheetImageLoadState>>({});
  const [fitOverlayRequest, setFitOverlayRequest] = useState(0);
  const [mapViewRefreshRequest, setMapViewRefreshRequest] = useState(0);
  const [plainMapTestMode, setPlainMapTestMode] = useState(false);
  const [locationQuery, setLocationQuery] = useState(initialData.activeTownPackage?.locationQuery ?? initialData.activeTownPackage?.locationDisplayName ?? "");
  const [locationResult, setLocationResult] = useState<GeocodeSuccess | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "searching" | "found" | "saved" | "error">("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const [resolvedLocationSource, setResolvedLocationSource] = useState(initialData.locationSource);
  const [modernTileDiagnostics, setModernTileDiagnostics] = useState<ModernTileDiagnostics>({
    ...createTileDiagnostics(),
    basemapKey: georeferenceDraft.selectedBasemap,
    tileLayerMounted: false,
  });
  const [tileRuntimeDebug, setTileRuntimeDebug] = useState<LeafletTileRuntimeDebug | null>(null);
  const [requestedGeocodeCenter, setRequestedGeocodeCenter] = useState<GeoCoordinate | null>(null);
  const requestedGeocodeCenterRef = useRef<GeoCoordinate | null>(null);
  const locationSearchGuardUntilRef = useRef(0);
  const [lastViewChangeSource, setLastViewChangeSource] = useState<MapViewChangeSource>("initial");
  const [lastCenterChangePath, setLastCenterChangePath] = useState("initial");
  const [fitBoundsActive, setFitBoundsActive] = useState(false);
  const [staleViewBlocked, setStaleViewBlocked] = useState(false);
  const [overlayRenderMode, setOverlayRenderMode] = useState<"projective" | "rectangular">("projective");
  const [requestedViewSource, setRequestedViewSource] = useState<MapViewChangeSource>("initial");
  const [mapInteractionStatus, setMapInteractionStatus] = useState<MapInteractionStatus>("idle");
  const isUserPanningRef = useRef(false);
  const isUserZoomingRef = useRef(false);
  const isProgrammaticViewChangeRef = useRef(false);
  const mapViewSaveInFlightRef = useRef(false);
  const mapViewSaveTimeoutRef = useRef<number | null>(null);
  const mapViewSavedStatusTimeoutRef = useRef<number | null>(null);
  const [mapContainerSize, setMapContainerSize] = useState({ width: 0, height: 0 });
  const [autoFallbackNotice, setAutoFallbackNotice] = useState("");
  const present = history.present;
  const geoPresent = geoHistory.present;
  const selectedAsset: any = sheets.find((sheet) => sheet.assetId === selectedAssetId) ?? null;
  const selectedPlacement = present.placements.find((placement) => placement.assetId === selectedAssetId) ?? null;
  const selectedSheetGeoreference: any = geoPresent.sheets.find((sheet) => sheet.assetId === selectedAssetId) ?? null;
  const visiblePlacements = present.placements.filter((placement) => placement.isVisible).length;
  const hiddenPlacements = present.placements.length - visiblePlacements;
  const lockedPlacements = present.placements.filter((placement) => placement.isLocked).length;
  const duplicateSheetNumbers = findDuplicateStudioSheetNumbers(sheets);
  const missingSheetNumbers = findMissingStudioSheetNumbers(sheets, initialData.expectedSheetCount);
  const workspaceStatus = getWorkspaceStatus({
    sheets: sheets.length,
    unsavedChanges: isDirty,
    saveStatus,
    warningMessage: initialData.warningMessage,
  });
  const activeAtlas = atlasInventory.atlases.find((atlas) => atlas.atlasId === selectedAtlasId) ?? null;
  const activeAtlasPages = atlasInventory.pages
    .filter((page) => page.atlasId === selectedAtlasId)
    .sort((left, right) => left.pageSequence - right.pageSequence);
  const selectedAtlasPage = activeAtlasPages.find((page) => page.pageId === selectedAtlasPageId) ?? activeAtlasPages[0] ?? null;
  const selectedAtlasPageAsset = selectedAtlasPage ? sheets.find((sheet) => sheet.assetId === selectedAtlasPage.sanbornSheetAssetId) ?? null : null;
  const selectedAtlasPagePieces = selectedAtlasPage
    ? atlasInventory.pieces
        .filter((piece) => piece.atlasPageId === selectedAtlasPage.pageId)
        .sort((left, right) => left.pieceSequence - right.pieceSequence)
    : [];
  const selectedMapPiece = selectedAtlasPagePieces.find((piece) => piece.pieceId === selectedMapPieceId) ?? selectedAtlasPagePieces[0] ?? null;
  const selectedMapPieceGeoreference = selectedMapPiece
    ? mapPieceGeoreferences.find((placement) => placement.pieceId === selectedMapPiece.pieceId) ?? null
    : null;
  const atlasReadOnly = initialData.mode === "read_only" || atlasInventory.mode === "read_only";
  const pieceInventoryBlocked = atlasWorkflowStep === "piece_inventory" && Boolean(selectedAtlasPage && !selectedAtlasPage.isPersisted);
  const atlasSaveActionsDisabled = saveStatus === "saving";

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setStageSize({
          width: Math.max(520, Math.floor(entry.contentRect.width)),
          height: Math.max(520, Math.floor(entry.contentRect.height)),
        });
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry) {
        setMapContainerSize({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        });
      }
    });

    if (minimalMapRef.current) {
      resizeObserver.observe(minimalMapRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (mapViewSaveTimeoutRef.current) {
        window.clearTimeout(mapViewSaveTimeoutRef.current);
      }
      if (mapViewSavedStatusTimeoutRef.current) {
        window.clearTimeout(mapViewSavedStatusTimeoutRef.current);
      }
    };
  }, []);

  const handleTileDiagnosticsChange = useCallback((diagnostics: ModernTileDiagnostics) => {
    setModernTileDiagnostics(diagnostics);
  }, []);

  const requestExternalMapView = useCallback((center: GeoCoordinate, zoom: number, source: MapViewChangeSource, path: string) => {
    if (!isOperationalMapCenter(center)) {
      return;
    }

    isProgrammaticViewChangeRef.current = true;
    setRequestedViewSource(source);
    setLastViewChangeSource(source);
    setLastCenterChangePath(path);
    setMapCenter(center);
    setModernMapZoom(zoom);
    setMapViewRefreshRequest((current) => current + 1);
    window.setTimeout(() => {
      isProgrammaticViewChangeRef.current = false;
    }, 750);
  }, []);

  const saveMapViewOnly = useCallback(async (center: GeoCoordinate, zoom: number) => {
    if (
      mapViewSaveInFlightRef.current ||
      saveInFlightRef.current ||
      !initialData.workspace ||
      !initialData.activeTownPackage ||
      !canAutosaveStudioMode(initialData.mode) ||
      !isOperationalMapCenter(center)
    ) {
      return;
    }

    mapViewSaveInFlightRef.current = true;
    try {
      const response = await fetch("/api/community/historical-map-studio/sheet-georeferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          townPackageId: initialData.activeTownPackage.id,
          mapYear: initialData.activeMapYear,
          workspaceId: initialData.workspace.workspaceId,
          workspaceName: initialData.workspace.name,
          selectedBasemap: georeferenceDraft.selectedBasemap,
          mapCenter: center,
          mapZoom: zoom,
          editMode: geoEditMode,
          globalHistoricalOpacity: 1,
          sheets: [],
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; savedAt?: string } | null;

      if (response.ok && payload?.ok) {
        setLastSavedAt(payload.savedAt ?? new Date().toISOString());
        setMapInteractionStatus("saved");
        if (mapViewSavedStatusTimeoutRef.current) {
          window.clearTimeout(mapViewSavedStatusTimeoutRef.current);
        }
        mapViewSavedStatusTimeoutRef.current = window.setTimeout(() => setMapInteractionStatus("idle"), 1800);
      }
    } finally {
      mapViewSaveInFlightRef.current = false;
    }
  }, [geoEditMode, georeferenceDraft.selectedBasemap, initialData.activeMapYear, initialData.activeTownPackage, initialData.mode, initialData.workspace]);

  const scheduleMapViewPersistence = useCallback((center: GeoCoordinate, zoom: number) => {
    if (!isOperationalMapCenter(center)) {
      return;
    }

    if (mapViewSaveTimeoutRef.current) {
      window.clearTimeout(mapViewSaveTimeoutRef.current);
    }

    mapViewSaveTimeoutRef.current = window.setTimeout(() => {
      mapViewSaveTimeoutRef.current = null;
      void saveMapViewOnly(center, zoom);
    }, 800);
  }, [saveMapViewOnly]);

  const clearActiveExternalViewRequest = useCallback(() => {
    requestedGeocodeCenterRef.current = null;
    locationSearchGuardUntilRef.current = 0;
    setRequestedGeocodeCenter(null);
    setFitBoundsActive(false);
  }, []);

  const handleMapViewMutation = useCallback((source: string) => {
    setLastCenterChangePath(source);
    if (source === "requested_view" || source === "location_search" || source === "town_package" || source === "reload_saved" || source === "fit_sheet" || source === "reset_invalid_placements") {
      isProgrammaticViewChangeRef.current = true;
    }
    if (source === "fit_bounds") {
      setFitBoundsActive(true);
    }
  }, []);

  const handleMapInteractionChange = useCallback((state: "idle" | "panning" | "zooming", source: string) => {
    if (state === "panning") {
      if (mapViewSaveTimeoutRef.current) {
        window.clearTimeout(mapViewSaveTimeoutRef.current);
        mapViewSaveTimeoutRef.current = null;
      }
      isUserPanningRef.current = true;
      clearActiveExternalViewRequest();
      setMapInteractionStatus("panning");
      setLastCenterChangePath(source);
      return;
    }

    if (state === "zooming") {
      if (mapViewSaveTimeoutRef.current) {
        window.clearTimeout(mapViewSaveTimeoutRef.current);
        mapViewSaveTimeoutRef.current = null;
      }
      isUserZoomingRef.current = true;
      clearActiveExternalViewRequest();
      setMapInteractionStatus("zooming");
      setLastCenterChangePath(source);
      return;
    }

    isUserPanningRef.current = false;
    isUserZoomingRef.current = false;
    if (mapInteractionStatus !== "saved") {
      setMapInteractionStatus("idle");
    }
    setLastCenterChangePath(source);
  }, [clearActiveExternalViewRequest, mapInteractionStatus]);

  const handleLeafletViewChange = useCallback((center: LatLngTuple, zoom: number, source: string = "leaflet_moveend") => {
    const nextCenter = { latitude: center[0], longitude: center[1] };
    const normalizedSource = (
      source === "user_pan"
        ? "user_pan"
        : source === "user_zoom"
          ? "user_zoom"
          : source === "leaflet_zoomend"
            ? "leaflet_zoomend"
            : "leaflet_moveend"
    ) as MapViewChangeSource;
    const userGestureSource = normalizedSource === "user_pan" || normalizedSource === "user_zoom";
    const requested = requestedGeocodeCenterRef.current;
    const guardActive = Boolean(requested && Date.now() < locationSearchGuardUntilRef.current);

    setLastViewChangeSource(normalizedSource);
    setLastCenterChangePath(source);

    if (userGestureSource) {
      clearActiveExternalViewRequest();
      isProgrammaticViewChangeRef.current = false;
    }

    if (guardActive && requested && isNearZeroCoordinate(nextCenter) && !coordinatesClose(nextCenter, requested)) {
      setStaleViewBlocked(true);
      setLocationMessage("A stale saved map position was prevented from replacing your selected location.");
      requestExternalMapView(requested, Math.max(14, Math.min(16, modernMapZoom || zoom || 15)), "location_search", `${source}:restore_requested_geocode`);
      return;
    }

    if (!isOperationalMapCenter(nextCenter)) {
      setStaleViewBlocked(true);
      setLastCenterChangePath(`${source}:blocked_near_zero`);
      return;
    }

    setMapCenter(nextCenter);
    setModernMapZoom(zoom);
    if (userGestureSource) {
      scheduleMapViewPersistence(nextCenter, zoom);
    }
    if (!guardActive || coordinatesClose(nextCenter, requested)) {
      setFitBoundsActive(false);
    }
  }, [clearActiveExternalViewRequest, modernMapZoom, requestExternalMapView, scheduleMapViewPersistence]);

  useEffect(() => {
    const startedAt = Date.now();
    const timeout = window.setTimeout(() => {
      const visibleLoadedTiles = tileRuntimeDebug?.visibleLoadedTileCount ?? 0;

      if (
        shouldAutoFallbackBasemap({
          basemapKey: georeferenceDraft.selectedBasemap,
          status: modernTileDiagnostics.status,
          successfulTiles: visibleLoadedTiles,
          failedTiles: modernTileDiagnostics.failedTiles,
          elapsedMs: Date.now() - startedAt,
        })
      ) {
        setGeoreferenceDraft((current) => ({ ...current, selectedBasemap: "esri_world_street" }));
        setAutoFallbackNotice("OpenStreetMap returned no visible tiles, so the studio switched to Alternate streets.");
      }
    }, 5_000);

    return () => window.clearTimeout(timeout);
  }, [georeferenceDraft.selectedBasemap, modernTileDiagnostics.failedTiles, modernTileDiagnostics.status, tileRuntimeDebug?.visibleLoadedTileCount]);

  useEffect(() => {
    const requested = requestedGeocodeCenterRef.current;

    if (!requested || Date.now() >= locationSearchGuardUntilRef.current || !tileRuntimeDebug?.center) {
      return;
    }

    const actual = { latitude: tileRuntimeDebug.center.latitude, longitude: tileRuntimeDebug.center.longitude };

    if (isNearZeroCoordinate(actual) && !coordinatesClose(actual, requested)) {
      setStaleViewBlocked(true);
      setLocationMessage("A stale saved map position was prevented from replacing your selected location.");
      setLastCenterChangePath("tile_runtime_debug:blocked_stale_zero");
      requestExternalMapView(requested, Math.max(14, Math.min(16, modernMapZoom || tileRuntimeDebug.zoom || 15)), "location_search", "tile_runtime_debug:restore_requested_geocode");
    }
  }, [modernMapZoom, requestExternalMapView, tileRuntimeDebug?.center?.latitude, tileRuntimeDebug?.center?.longitude, tileRuntimeDebug?.zoom]);

  useEffect(() => {
    const pendingSelection = pendingStudioSelectionRef.current;
    const pendingUploadedAssetId = pendingUploadedAssetIdRef.current;
    const pendingAssetExists = pendingSelection?.assetId ? initialData.sheets.some((sheet) => sheet.assetId === pendingSelection.assetId) : false;
    const uploadedPreferredAssetId = selectPreferredSheetAfterUpload(initialData.sheets, pendingUploadedAssetId);
    const pendingAtlasExists = pendingSelection
      ? initialData.atlasInventory.atlases.some((atlas) => atlas.atlasId === pendingSelection.atlasId)
      : false;
    const nextAtlasId = pendingSelection && pendingAtlasExists ? pendingSelection.atlasId : (initialData.atlasInventory.activeAtlasId ?? "");
    const activePagesAfterRefresh = initialData.atlasInventory.pages
      .filter((page) => page.atlasId === nextAtlasId)
      .sort((left, right) => left.pageSequence - right.pageSequence);
    const restoredPage = pendingSelection
      ? activePagesAfterRefresh.find((page) => page.pageId === pendingSelection.pageId) ?? activePagesAfterRefresh[0] ?? null
      : null;
    const nextPageId = pendingSelection ? (restoredPage?.pageId ?? "") : (initialData.atlasInventory.activePageId ?? "");
    const piecesAfterRefresh = nextPageId
      ? initialData.atlasInventory.pieces
          .filter((piece) => piece.atlasPageId === nextPageId)
          .sort((left, right) => left.pieceSequence - right.pieceSequence)
      : [];
    const restoredPiece = pendingSelection?.pieceId
      ? piecesAfterRefresh.find((piece) => piece.pieceId === pendingSelection.pieceId) ?? piecesAfterRefresh[0] ?? null
      : null;
    const nextPieceId = pendingSelection?.pieceId ? restoredPiece?.pieceId ?? "" : "";
    const pageAssetId = restoredPage?.sanbornSheetAssetId ?? "";
    const preferredAssetId =
      pendingSelection && pendingAssetExists
        ? pendingSelection.assetId!
        : pendingSelection && pageAssetId && initialData.sheets.some((sheet) => sheet.assetId === pageAssetId)
          ? pageAssetId
          : uploadedPreferredAssetId;
    const preferredAsset = initialData.sheets.find((sheet) => sheet.assetId === preferredAssetId) ?? initialData.sheets[0] ?? null;

    pendingUploadedAssetIdRef.current = "";
    setSheets(initialData.sheets);
    setHistory(buildInitialHistory(createPresentFromState(initialData)));
    setGeoHistory(buildInitialSheetGeographicHistory(createSheetGeographicPresentFromState(initialData)));
    setSelectedAssetId(preferredAssetId);
    setMetadataDraft(createMetadataDraft(preferredAsset));
    setIsDirty(initialData.placements.some((placement) => !placement.isPersisted) || !initialData.workspace?.isPersisted);
    setSaveStatus("idle");
    setSaveMessage("");
    setLastSavedAt(initialData.workspace?.updatedAt ?? "");
    setGeoreferenceDraft(createGeoreferenceDraft(initialData, preferredAssetId || null));
    setMapCenter(getDefaultTownCenter(initialData));
    setModernMapZoom(initialData.geographicMap.zoom);
    setGeoEditMode(getInitialGeoEditMode(initialData, preferredAssetId));
    setMovementScope(initialData.geographicMap.movementScope);
    setGlobalHistoricalOpacity(initialData.geographicMap.globalHistoricalOpacity);
    setSheetImageStates({});
    setAtlasInventory(initialData.atlasInventory);
    setMapPieceGeoreferences(mergeSavedAndDefaultMapPieceGeoreferences(initialData.atlasInventory.pieces, initialData.mapPieceGeoreferences));
    setSelectedAtlasId(nextAtlasId);
    setSelectedAtlasPageId(nextPageId);
    setSelectedMapPieceId(nextPieceId);
    if (pendingSelection) {
      setAtlasWorkflowStep(pendingSelection.workflowStep);
      if (pendingSelection.workflowStep !== "gps_alignment") {
        setLastNonGpsWorkflowStep(pendingSelection.workflowStep);
      }
    }
    pendingStudioSelectionRef.current = null;
    setLocationQuery(initialData.activeTownPackage?.locationQuery ?? initialData.activeTownPackage?.locationDisplayName ?? "");
    setLocationResult(null);
    setLocationStatus("idle");
    setLocationMessage("");
    setResolvedLocationSource(initialData.locationSource);
    setRequestedGeocodeCenter(null);
    requestedGeocodeCenterRef.current = null;
    locationSearchGuardUntilRef.current = 0;
    setLastViewChangeSource("initial");
    setLastCenterChangePath("initial_data_reload");
    setFitBoundsActive(false);
    setStaleViewBlocked(false);
    setRequestedViewSource("initial");
    setMapInteractionStatus("idle");
    isUserPanningRef.current = false;
    isUserZoomingRef.current = false;
    isProgrammaticViewChangeRef.current = false;
  }, [initialData.lastLoadedAt, initialData.sheets, initialData.placements, initialData.sheetGeoreferences, initialData.mapPieceGeoreferences, initialData.geographicMap, initialData.workspace, initialData.atlasInventory]);

  useEffect(() => {
    if (initialSelectionAppliedRef.current) {
      return;
    }

    const requestedWorkflowStep = normalizeAtlasWorkflowStep(initialSelection.workflowStep);
    const hasRequestedSelection = Boolean(
      requestedWorkflowStep || initialSelection.atlasId || initialSelection.pageId || initialSelection.pieceId || initialSelection.assetId,
    );

    initialSelectionAppliedRef.current = true;

    if (!hasRequestedSelection) {
      return;
    }

    const requestedAtlas = initialSelection.atlasId
      ? atlasInventory.atlases.find((atlas) => atlas.atlasId === initialSelection.atlasId)
      : null;
    const nextAtlasId = requestedAtlas?.atlasId ?? selectedAtlasId;
    const requestedPage = initialSelection.pageId
      ? atlasInventory.pages.find((page) => page.pageId === initialSelection.pageId && page.atlasId === nextAtlasId)
      : null;
    const nextPageId = requestedPage?.pageId ?? selectedAtlasPageId;
    const requestedPiece = initialSelection.pieceId
      ? atlasInventory.pieces.find((piece) => piece.pieceId === initialSelection.pieceId && piece.atlasPageId === nextPageId)
      : null;
    const requestedAsset = initialSelection.assetId
      ? sheets.find((sheet) => sheet.assetId === initialSelection.assetId)
      : null;
    const pageAssetId = requestedPage?.sanbornSheetAssetId ?? atlasInventory.pages.find((page) => page.pageId === nextPageId)?.sanbornSheetAssetId ?? "";

    setSelectedAtlasId(nextAtlasId);
    setSelectedAtlasPageId(nextPageId);
    setSelectedMapPieceId(requestedPiece?.pieceId ?? "");

    if (requestedAsset?.assetId || pageAssetId) {
      setSelectedAssetId(requestedAsset?.assetId ?? pageAssetId);
    }

    if (requestedWorkflowStep) {
      if (requestedWorkflowStep === "gps_alignment") {
        setAtlasWorkflowStep("gps_alignment");
        setLastNonGpsWorkflowStep("piece_inventory");
        setStudioMode("georeferencing");
        setGeoEditMode("pan_modern_map");
        setPlacementAnchorAssetId("");
        setPiecePlacementAnchorId("");
        commitGeographicMapSettings({ editMode: "pan_modern_map", globalHistoricalOpacity: 1 }, false);

        if (!isMeaningfulGpsView(mapCenter, modernMapZoom)) {
          centerGpsOnActiveTown("initialSelection");
        }
      } else {
        setAtlasWorkflowStep(requestedWorkflowStep);
        setLastNonGpsWorkflowStep(requestedWorkflowStep);
      }
    }
  }, [
    atlasInventory,
    initialSelection.assetId,
    initialSelection.atlasId,
    initialSelection.pageId,
    initialSelection.pieceId,
    initialSelection.workflowStep,
    mapCenter,
    modernMapZoom,
    selectedAtlasId,
    selectedAtlasPageId,
    sheets,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !initialData.activeTownPackage) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("town", initialData.activeTownPackage.id);
    params.set("year", String(initialData.activeMapYear ?? initialData.activeTownPackage.year));
    params.set("workflow", atlasWorkflowStep);

    const selectionParams = {
      atlas: selectedAtlasId,
      page: selectedAtlasPageId,
      piece: selectedMapPieceId,
      sheet: selectedAssetId,
    };

    Object.entries(selectionParams).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    const nextUrl = `${window.location.pathname}?${params.toString()}`;

    if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [
    atlasWorkflowStep,
    initialData.activeMapYear,
    initialData.activeTownPackage,
    selectedAssetId,
    selectedAtlasId,
    selectedAtlasPageId,
    selectedMapPieceId,
  ]);

  useEffect(() => {
    setMetadataDraft(createMetadataDraft(selectedAsset));
    if (studioMode !== "stitching") {
      setGeoreferenceDraft(createGeoreferenceDraft(initialData, selectedAsset?.assetId ?? null));
    }
  }, [selectedAssetId]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const node = selectedAssetId ? sheetNodeRefs.current.get(selectedAssetId) : null;
    const shouldAttach =
      transformer &&
      shouldAttachStudioTransformer({
        isSelected: Boolean(selectedAssetId),
        isLocked: selectedPlacement?.isLocked ?? false,
        nodeMounted: Boolean(node),
      });

    if (shouldAttach) {
      transformer.nodes([node]);
      transformer.moveToTop();
      transformer.getLayer()?.batchDraw();
    } else if (transformer) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
    }
  }, [selectedAssetId, selectedPlacement, history.present.placements]);

  useEffect(() => {
    if (!isDirty || !canAutosaveStudioMode(initialData.mode)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (studioMode === "stitching") {
        void saveLayout("autosave");
      } else {
        void saveSheetGeoreferences("autosave");
      }
    }, studioAutosaveDelayMs);

    return () => window.clearTimeout(timeout);
  }, [isDirty, present, geoPresent, studioMode, initialData.mode]);

  useEffect(() => {
    if (initialData.mode === "read_only") {
      return;
    }

    const refreshExpiringUrls = () => {
      const visibleAssetIds = new Set(geoHistory.present.sheets.filter((sheet) => sheet.isVisible).map((sheet) => sheet.assetId));

      for (const sheet of sheets) {
        if (visibleAssetIds.has(sheet.assetId) && shouldRefreshSignedUrl(sheet.signedUrlExpiresAt)) {
          void refreshSignedUrl(sheet.assetId);
        }
      }
    };

    refreshExpiringUrls();
    const interval = window.setInterval(refreshExpiringUrls, 60_000);

    return () => window.clearInterval(interval);
  }, [sheets, geoHistory.present.sheets, initialData.mode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreStudioShortcut(event.target)) {
        return;
      }

      if (event.code === "Space") {
        setIsSpacePanning(true);
        return;
      }

      const selected = selectedPlacement;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === "Escape") {
        setSelectedAssetId("");
        return;
      }

      if (event.key === "[") {
        event.preventDefault();
        setLeftPanelCollapsed((value) => !value);
        return;
      }

      if (event.key === "]") {
        event.preventDefault();
        setRightPanelCollapsed((value) => !value);
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        fitAllSheets();
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(1.12);
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomBy(0.88);
        return;
      }

      if (event.key === "Delete" && selectedAsset) {
        event.preventDefault();
        void deleteSelectedSheet();
        return;
      }

      const canNudgeSelected =
        studioMode === "stitching"
          ? Boolean(selected && !selected.isLocked)
          : Boolean(selectedSheetGeoreference && !selectedSheetGeoreference.isLocked && selectedSheetGeoreference.isVisible);

      if (canNudgeSelected && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const amount = event.shiftKey ? 20 : 2;
        const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
        const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;

        if (studioMode === "stitching" && selected) {
          commitPlacement(selected.assetId, { x: selected.x + dx, y: selected.y + dy });
        } else if (selectedSheetGeoreference && !selectedSheetGeoreference.isLocked) {
          const degreeStep = (event.shiftKey ? 0.0006 : 0.00008) / Math.max(1, modernMapZoom / 15);
          commitSheetGeoreference(selectedSheetGeoreference.assetId, {
            centerLatitude: selectedSheetGeoreference.centerLatitude - dy * degreeStep,
            centerLongitude: selectedSheetGeoreference.centerLongitude + dx * degreeStep,
          });
        }
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setIsSpacePanning(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedPlacement, selectedSheetGeoreference, selectedAsset, present, studioMode, modernMapZoom]);

  function setPresent(next: StudioPresentState, recordHistory: boolean) {
    setHistory((current) => (recordHistory ? pushStudioHistory(current, next) : { ...current, present: next }));
    setIsDirty(true);
    setSaveStatus("idle");
  }

  function setSheetGeoPresent(next: SheetGeographicPresentState, recordHistory: boolean) {
    setGeoHistory((current) => (recordHistory ? pushSheetGeographicHistory(current, next) : { ...current, present: next }));
    setIsDirty(true);
    setSaveStatus("idle");
  }

  function commitPlacement(assetId: string, patch: Partial<StudioPlacement>) {
    const nextPlacements = updatePlacement(present.placements, assetId, {
      ...patch,
      ...(snapToGrid && patch.x !== undefined ? { x: Math.round(patch.x / 20) * 20 } : {}),
      ...(snapToGrid && patch.y !== undefined ? { y: Math.round(patch.y / 20) * 20 } : {}),
    });
    setPresent({ ...present, placements: nextPlacements }, true);
  }

  function commitSheetGeoreference(assetId: string, patch: Partial<SheetGeographicTransform>, recordHistory = true) {
    const currentSheet = geoPresent.sheets.find((sheet) => sheet.assetId === assetId);
    const nextSelected = currentSheet ? updateSheetGeographicTransform([currentSheet], assetId, patch)[0] : null;
    let nextSheets = updateSheetGeographicTransform(geoPresent.sheets, assetId, patch);

    if (
      movementScope === "entire_assembly" &&
      currentSheet &&
      nextSelected &&
      (patch.centerLatitude !== undefined || patch.centerLongitude !== undefined)
    ) {
      nextSheets = moveSheetGeographicAssembly(geoPresent.sheets, {
        latitude: nextSelected.centerLatitude - currentSheet.centerLatitude,
        longitude: nextSelected.centerLongitude - currentSheet.centerLongitude,
      });
    }

    setSheetGeoPresent({ ...geoPresent, sheets: nextSheets }, recordHistory);
  }

  function addSheetToMap(assetId: string, center: GeoCoordinate = mapCenter) {
    const sheet = geoPresent.sheets.find((candidate) => candidate.assetId === assetId);
    const asset = sheets.find((candidate) => candidate.assetId === assetId);

    if (!sheet || !asset) {
      setSaveStatus("error");
      setSaveMessage("Sheet could not be added because its upload metadata is unavailable.");
      return;
    }

    const aspectRatio = asset.width / Math.max(1, asset.height);
    const latitudeSpan = Math.max(0.0008, Math.min(0.01, sheet.latitudeSpan || 0.003));
    const longitudeSpan = Math.max(0.0008, Math.min(0.012, latitudeSpan * aspectRatio));
    const safeCenter = isOperationalMapCenter(center) ? center : getDefaultTownCenter(initialData);
    const placed = placeSheetAtMapCenter(
      {
        ...sheet,
        opacity: 0.5,
      },
      safeCenter,
      { latitudeSpan, longitudeSpan },
    );
    const nextSheets = geoPresent.sheets.map((candidate) => (candidate.assetId === assetId ? placed : candidate));

    setSelectedAssetId(assetId);
    setMapCenter(safeCenter);
    setGeoEditMode("edit_historical_sheets");
    setStudioMode("georeferencing");
    setPlacementAnchorAssetId("");
    setSheetGeoPresent(
      {
        ...geoPresent,
        mapSettings: normalizeGeographicMapSettings({
          ...geoPresent.mapSettings,
          center: safeCenter,
          editMode: "edit_historical_sheets",
          globalHistoricalOpacity,
        }),
        sheets: nextSheets,
      },
      true,
    );
    setFitOverlayRequest((current) => current + 1);
  }

  function removeSelectedGeographicPlacement() {
    if (!selectedSheetGeoreference) {
      return;
    }

    const removed = removeSheetGeographicPlacement(selectedSheetGeoreference);
    const nextSheets = geoPresent.sheets.map((sheet) => (sheet.assetId === removed.assetId ? removed : sheet));
    setSheetGeoPresent({ ...geoPresent, sheets: nextSheets }, true);
  }

  function handleModernMapClick(latitude: number, longitude: number) {
    if (piecePlacementAnchorId && selectedMapPiece?.pieceId === piecePlacementAnchorId) {
      placeSelectedMapPieceAt({ latitude, longitude });
      return;
    }

    if (placementAnchorAssetId) {
      addSheetToMap(placementAnchorAssetId, { latitude, longitude });
      return;
    }

    completeSelectedControlPoint(latitude, longitude);
  }

  function commitGeographicMapSettings(patch: Partial<SheetGeographicPresentState["mapSettings"]>, recordHistory = false) {
    const nextSettings = normalizeGeographicMapSettings({
      ...geoPresent.mapSettings,
      ...patch,
      editMode: patch.editMode ?? geoEditMode,
      movementScope: patch.movementScope ?? movementScope,
      globalHistoricalOpacity: patch.globalHistoricalOpacity ?? globalHistoricalOpacity,
    });
    setSheetGeoPresent({ ...geoPresent, mapSettings: nextSettings }, recordHistory);
  }

  function centerGpsOnActiveTown(path = "centerGpsOnActiveTown") {
    const center = getGpsTownCenterFromState(initialData);
    const zoom = getGpsTownZoomFromState(initialData);

    setGeoEditMode("pan_modern_map");
    setPlacementAnchorAssetId("");
    setPiecePlacementAnchorId("");
    commitGeographicMapSettings({ center, zoom, editMode: "pan_modern_map", globalHistoricalOpacity: 1 }, false);
    requestExternalMapView(center, zoom, "town_package", path);
  }

  function enterGpsAlignment() {
    if (atlasWorkflowStep !== "gps_alignment") {
      setLastNonGpsWorkflowStep(atlasWorkflowStep);
    }

    setAtlasWorkflowStep("gps_alignment");
    setStudioMode("georeferencing");
    setGeoEditMode("pan_modern_map");
    setPlacementAnchorAssetId("");
    setPiecePlacementAnchorId("");
    if (selectedMapPiece) {
      setSelectedMapPieceId(selectedMapPiece.pieceId);
      if (selectedAtlasPage?.sanbornSheetAssetId) {
        setSelectedAssetId(selectedAtlasPage.sanbornSheetAssetId);
      }
    }
    commitGeographicMapSettings({ editMode: "pan_modern_map", globalHistoricalOpacity: 1 }, false);

    if (!isMeaningfulGpsView(mapCenter, modernMapZoom)) {
      centerGpsOnActiveTown("enterGpsAlignment");
    }
  }

  function changeAtlasWorkflowStep(step: SanbornAtlasWorkflowStep) {
    if (step === "gps_alignment") {
      enterGpsAlignment();
      return;
    }

    setAtlasWorkflowStep(step);
    setLastNonGpsWorkflowStep(step);
  }

  function backToLastNonGpsWorkflowStep() {
    changeAtlasWorkflowStep(lastNonGpsWorkflowStep);
  }

  function commitViewport(viewport: StudioViewport, recordHistory = false) {
    setPresent({ ...present, viewport }, recordHistory);
  }

  function undo() {
    if (studioMode === "stitching") {
      setHistory((current) => undoStudioHistory(current));
    } else {
      setGeoHistory((current) => undoSheetGeographicHistory(current));
    }
    setIsDirty(true);
  }

  function redo() {
    if (studioMode === "stitching") {
      setHistory((current) => redoStudioHistory(current));
    } else {
      setGeoHistory((current) => redoSheetGeographicHistory(current));
    }
    setIsDirty(true);
  }

  async function saveLayout(kind: "manual" | "autosave" = "manual") {
    if (saveInFlightRef.current || !initialData.workspace || !initialData.activeTownPackage || !canAutosaveStudioMode(initialData.mode)) {
      return;
    }

    saveInFlightRef.current = true;
    setSaveStatus("saving");
    setSaveMessage(kind === "autosave" ? "Autosaving layout..." : "Saving layout...");

    const response = await fetch("/api/community/historical-map-studio/layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        townPackageId: initialData.activeTownPackage.id,
        mapYear: initialData.activeMapYear,
        workspaceId: initialData.workspace.workspaceId,
        name: initialData.workspace.name,
        viewport: present.viewport,
        placements: present.placements,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; savedAt?: string } | null;

    saveInFlightRef.current = false;

    if (!response.ok || !payload?.ok) {
      setSaveStatus("error");
      setSaveMessage(payload?.message ?? "Layout save failed.");
      return;
    }

    setSaveStatus("saved");
    setSaveMessage(kind === "autosave" ? "Autosaved." : "Layout saved.");
    setLastSavedAt(payload.savedAt ?? new Date().toISOString());
    setIsDirty(false);
  }

  async function saveSheetGeoreferences(kind: "manual" | "autosave" = "manual", assetIdToSave?: string) {
    if (saveInFlightRef.current || !initialData.workspace || !initialData.activeTownPackage || !canAutosaveStudioMode(initialData.mode)) {
      return;
    }

    const sheetsToSave =
      kind === "manual"
        ? selectManualSheetPlacementForSave(geoPresent.sheets, assetIdToSave ?? selectedAssetId)
        : geoPresent.sheets.filter((sheet) => sheet.isVisible || sheet.isPersisted);

    if (sheetsToSave.length === 0) {
      setSaveStatus("error");
      setSaveMessage("Save failed: select a placed Sanborn sheet first.");
      return;
    }

    saveInFlightRef.current = true;
    setSaveStatus("saving");
    setSaveMessage(kind === "autosave" ? "Saving..." : "Saving placement...");
    const mapCenterForSave = isOperationalMapCenter(mapCenter)
      ? mapCenter
      : requestedGeocodeCenterRef.current && isOperationalMapCenter(requestedGeocodeCenterRef.current)
        ? requestedGeocodeCenterRef.current
        : getDefaultTownCenter(initialData);

    const response = await fetch("/api/community/historical-map-studio/sheet-georeferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        townPackageId: initialData.activeTownPackage.id,
        mapYear: initialData.activeMapYear,
        workspaceId: initialData.workspace.workspaceId,
        workspaceName: initialData.workspace.name,
        selectedBasemap: georeferenceDraft.selectedBasemap,
        mapCenter: mapCenterForSave,
        mapZoom: modernMapZoom,
        editMode: geoEditMode,
        globalHistoricalOpacity: 1,
        sheets: sheetsToSave,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; savedAt?: string; sheets?: SheetGeographicTransform[] } | null;

    saveInFlightRef.current = false;

    if (!response.ok || !payload?.ok) {
      setSaveStatus("error");
      setSaveMessage(`Save failed: ${payload?.message ?? "Geographic sheet placement save failed."}`);
      return;
    }

    const savedSheets = (payload.sheets ?? []).map((sheet) => normalizeSheetGeographicTransform({ ...sheet, assetId: sheet.assetId, isPersisted: true }));
    const savedByAssetId = new Map(savedSheets.map((sheet) => [sheet.assetId, sheet]));
    const selectedSaved = savedByAssetId.get(assetIdToSave ?? selectedAssetId);
    const selectedDraft = sheetsToSave.find((sheet) => sheet.assetId === (assetIdToSave ?? selectedAssetId));

    if (kind === "manual" && selectedDraft && (!selectedSaved || !sheetPlacementMatchesForPersistence(selectedDraft, selectedSaved))) {
      setSaveStatus("error");
      setSaveMessage("Save failed: database confirmation did not match the current sheet placement.");
      return;
    }

    const nextSheets = geoPresent.sheets.map((sheet) => savedByAssetId.get(sheet.assetId) ?? sheet);
    setSheetGeoPresent(
      {
        ...geoPresent,
        mapSettings: normalizeGeographicMapSettings({
          ...geoPresent.mapSettings,
          center: mapCenterForSave,
          zoom: modernMapZoom,
          editMode: geoEditMode,
          globalHistoricalOpacity: 1,
        }),
        sheets: nextSheets,
      },
      false,
    );
    setSaveStatus("saved");
    const savedAt = payload.savedAt ?? new Date().toISOString();
    setSaveMessage(kind === "autosave" ? "Saved to database." : `Saved to database at ${new Date(savedAt).toLocaleTimeString()}.`);
    setLastSavedAt(payload.savedAt ?? new Date().toISOString());
    setIsDirty(false);
  }

  async function reloadSavedPlacement() {
    if (!initialData.workspace || !initialData.activeTownPackage) {
      setSaveStatus("error");
      setSaveMessage("Reload failed: no active Historical Map Studio workspace is available.");
      return;
    }

    setSaveStatus("saving");
    setSaveMessage("Reloading saved placement...");

    const params = new URLSearchParams({
      townPackageId: initialData.activeTownPackage.id,
      mapYear: String(initialData.activeMapYear),
      workspaceId: initialData.workspace.workspaceId,
    });
    const response = await fetch(`/api/community/historical-map-studio/sheet-georeferences?${params.toString()}`);
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      savedAt?: string | null;
      mapCenter?: GeoCoordinate | null;
      mapZoom?: number | null;
      sheets?: SheetGeographicTransform[];
    } | null;

    if (!response.ok || !payload?.ok) {
      setSaveStatus("error");
      setSaveMessage(`Save failed: ${payload?.message ?? "Saved placement could not be reloaded."}`);
      return;
    }

    const savedSheets = (payload.sheets ?? []).map((sheet) => normalizeSheetGeographicTransform({ ...sheet, assetId: sheet.assetId, isPersisted: true }));
    const savedByAssetId = new Map(savedSheets.map((sheet) => [sheet.assetId, sheet]));
    const nextSheets = geoPresent.sheets.map((sheet) => savedByAssetId.get(sheet.assetId) ?? sheet);
    const reloadedCenter = payload.mapCenter && isOperationalMapCenter(payload.mapCenter) ? payload.mapCenter : null;

    if (reloadedCenter) {
      requestExternalMapView(reloadedCenter, payload.mapZoom ?? modernMapZoom, "reload_saved", "reloadSavedPlacement");
    }

    if (typeof payload.mapZoom === "number") {
      setModernMapZoom(payload.mapZoom);
    }

    setSheetGeoPresent(
      {
        ...geoPresent,
        mapSettings: normalizeGeographicMapSettings({
          ...geoPresent.mapSettings,
          center: reloadedCenter ?? mapCenter,
          zoom: payload.mapZoom ?? modernMapZoom,
          editMode: geoEditMode,
          globalHistoricalOpacity: 1,
        }),
        sheets: nextSheets,
      },
      false,
    );
    setSaveStatus("saved");
    setSaveMessage(`Reloaded saved placement${payload.savedAt ? ` from ${new Date(payload.savedAt).toLocaleTimeString()}` : ""}.`);
    setLastSavedAt(payload.savedAt ?? new Date().toISOString());
    setIsDirty(false);
  }

  function replaceMapPieceGeoreference(nextPlacement: SanbornMapPieceGeoreference) {
    setMapPieceGeoreferences((current) => {
      const exists = current.some((placement) => placement.pieceId === nextPlacement.pieceId);
      const next = exists
        ? current.map((placement) => (placement.pieceId === nextPlacement.pieceId ? nextPlacement : placement))
        : [...current, nextPlacement];

      return next.sort((left, right) => left.layerOrder - right.layerOrder);
    });
    setIsDirty(true);
    setSaveStatus("idle");
  }

  function commitMapPieceGeoreference(pieceId: string, patch: Partial<SanbornMapPieceGeoreference>) {
    const currentPlacement = mapPieceGeoreferences.find((placement) => placement.pieceId === pieceId);
    const piece = atlasInventory.pieces.find((candidate) => candidate.pieceId === pieceId);

    if (!currentPlacement || !piece) {
      return;
    }

    replaceMapPieceGeoreference(
      normalizeSanbornMapPieceGeoreference({
        ...currentPlacement,
        ...patch,
        pieceId,
        atlasPageId: piece.atlasPageId,
        isPersisted: false,
      }),
    );
  }

  function placeSelectedMapPieceAt(center: GeoCoordinate) {
    if (!selectedMapPiece || !selectedMapPieceGeoreference) {
      setSaveStatus("error");
      setSaveMessage("Select a saved map piece before placing it.");
      return;
    }

    if (!selectedMapPiece.isPersisted) {
      setSaveStatus("error");
      setSaveMessage("Save map pieces before geographic placement.");
      return;
    }

    const placed = placeMapPieceAtCenter(selectedMapPiece, selectedMapPieceGeoreference, center);
    replaceMapPieceGeoreference(placed);
    setSelectedMapPieceId(selectedMapPiece.pieceId);
    setPiecePlacementAnchorId("");
    setGeoEditMode("edit_historical_sheets");
    commitGeographicMapSettings({ center, editMode: "edit_historical_sheets", globalHistoricalOpacity: 1 }, false);
    setSaveMessage("Map piece placed. Drag the four corners to align it, then save placement.");
  }

  function resetSelectedMapPiecePlacement() {
    if (!selectedMapPieceGeoreference || !selectedMapPiece) {
      return;
    }

    replaceMapPieceGeoreference(
      normalizeSanbornMapPieceGeoreference({
        ...selectedMapPieceGeoreference,
        pieceId: selectedMapPiece.pieceId,
        atlasPageId: selectedMapPiece.atlasPageId,
        isVisible: false,
        isLocked: false,
        placementStatus: "unplaced",
        isPersisted: false,
      }),
    );
    setPiecePlacementAnchorId("");
    setSaveMessage("Piece placement reset. Save placement to persist the reset.");
  }

  function fitSelectedMapPiece() {
    if (!selectedMapPieceGeoreference || !hasOperationalMapPiecePlacement(selectedMapPieceGeoreference)) {
      return;
    }

    const nextCenter = {
      latitude: selectedMapPieceGeoreference.centerLatitude,
      longitude: selectedMapPieceGeoreference.centerLongitude,
    };
    requestExternalMapView(nextCenter, Math.max(modernMapZoom, 17), "fit_sheet", "fitSelectedMapPiece");
    commitGeographicMapSettings({ center: nextCenter, zoom: Math.max(modernMapZoom, 17), editMode: geoEditMode, globalHistoricalOpacity: 1 }, false);
  }

  async function saveSelectedMapPiecePlacement() {
    if (!selectedMapPiece || !selectedMapPieceGeoreference || !selectedAtlasPage || !activeAtlas) {
      setSaveStatus("error");
      setSaveMessage("Select a saved map piece before saving placement.");
      return;
    }

    if (!selectedMapPieceHasGeographicFootprint) {
      setSaveStatus("error");
      setSaveMessage("Place the selected map piece before saving placement.");
      return;
    }

    if (!initialData.activeTownPackage || atlasReadOnly || saveInFlightRef.current) {
      setSaveStatus("error");
      setSaveMessage("Map piece placement save failed: write access is unavailable.");
      return;
    }

    saveInFlightRef.current = true;
    setSaveStatus("saving");
    setSaveMessage("Saving map piece placement...");
    const mapCenterForSave = isOperationalMapCenter(mapCenter) ? mapCenter : getGpsTownCenterFromState(initialData);
    const workspaceId = initialData.workspace?.workspaceId ?? `${initialData.activeTownPackage.packageId}-${initialData.activeMapYear ?? initialData.activeTownPackage.year}-historical-map-studio`;
    const response = await fetch("/api/community/historical-map-studio/map-piece-georeferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        townPackageId: initialData.activeTownPackage.id,
        mapYear: initialData.activeMapYear,
        workspaceId,
        workspaceName: initialData.workspace?.name ?? `${initialData.activeTownPackage.name} ${initialData.activeMapYear ?? initialData.activeTownPackage.year} Historical Map Studio`,
        mapCenter: mapCenterForSave,
        mapZoom: modernMapZoom,
        pieceId: selectedMapPiece.pieceId,
        placement: selectedMapPieceGeoreference,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; savedAt?: string; placement?: SanbornMapPieceGeoreference } | null;
    saveInFlightRef.current = false;

    if (!response.ok || !payload?.ok || !payload.placement) {
      setSaveStatus("error");
      setSaveMessage(`Save failed: ${payload?.message ?? "Map piece placement save failed."}`);
      return;
    }

    const savedPlacement = normalizeSanbornMapPieceGeoreference({ ...payload.placement, pieceId: selectedMapPiece.pieceId, atlasPageId: selectedMapPiece.atlasPageId, isPersisted: true });

    if (!piecePlacementMatchesForPersistence(selectedMapPieceGeoreference, savedPlacement)) {
      setSaveStatus("error");
      setSaveMessage("Save failed: database confirmation did not match the current map piece placement.");
      return;
    }

    replaceMapPieceGeoreference(savedPlacement);
    setSaveStatus("saved");
    setSaveMessage("Map piece placement saved.");
    setLastSavedAt(payload.savedAt ?? new Date().toISOString());
    setIsDirty(false);
    pendingStudioSelectionRef.current = {
      atlasId: activeAtlas.atlasId,
      pageId: selectedAtlasPage.pageId,
      pieceId: selectedMapPiece.pieceId,
      assetId: selectedAtlasPage.sanbornSheetAssetId,
      workflowStep: atlasWorkflowStep,
    };
    router.refresh();
  }

  async function reloadSelectedMapPiecePlacement() {
    if (!selectedMapPiece || !initialData.activeTownPackage) {
      setSaveStatus("error");
      setSaveMessage("Select a map piece before reloading placement.");
      return;
    }

    setSaveStatus("saving");
    setSaveMessage("Reloading saved map piece placement...");
    const params = new URLSearchParams({
      townPackageId: initialData.activeTownPackage.id,
      mapYear: String(initialData.activeMapYear ?? initialData.activeTownPackage.year),
      pieceId: selectedMapPiece.pieceId,
    });
    const response = await fetch(`/api/community/historical-map-studio/map-piece-georeferences?${params.toString()}`);
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      savedAt?: string;
      mapCenter?: GeoCoordinate | null;
      mapZoom?: number | null;
      placement?: SanbornMapPieceGeoreference | null;
    } | null;

    if (!response.ok || !payload?.ok || !payload.placement) {
      setSaveStatus("error");
      setSaveMessage(`Reload failed: ${payload?.message ?? "No saved placement exists for the selected piece."}`);
      return;
    }

    const reloaded = normalizeSanbornMapPieceGeoreference({ ...payload.placement, pieceId: selectedMapPiece.pieceId, atlasPageId: selectedMapPiece.atlasPageId, isPersisted: true });
    replaceMapPieceGeoreference(reloaded);

    if (hasOperationalMapPiecePlacement(reloaded)) {
      requestExternalMapView({ latitude: reloaded.centerLatitude, longitude: reloaded.centerLongitude }, payload.mapZoom ?? modernMapZoom, "reload_saved", "reloadSelectedMapPiecePlacement");
    } else if (payload.mapCenter && isOperationalMapCenter(payload.mapCenter)) {
      requestExternalMapView(payload.mapCenter, payload.mapZoom ?? modernMapZoom, "reload_saved", "reloadSelectedMapPiecePlacement");
    }

    setSaveStatus("saved");
    setSaveMessage("Reloaded saved map piece placement.");
    setLastSavedAt(payload.savedAt ?? new Date().toISOString());
    setIsDirty(false);
  }

  function zoomBy(multiplier: number) {
    commitViewport({ ...present.viewport, scale: Math.max(0.05, Math.min(6, present.viewport.scale * multiplier)) }, false);
  }

  function handleWheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();

    if (!stage || !pointer) {
      return;
    }

    const oldScale = present.viewport.scale;
    const scaleBy = 1.06;
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const mousePointTo = {
      x: (pointer.x - present.viewport.x) / oldScale,
      y: (pointer.y - present.viewport.y) / oldScale,
    };

    commitViewport(
      {
        scale: Math.max(0.05, Math.min(6, newScale)),
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      },
      false,
    );
  }

  function fitAllSheets() {
    if (studioMode !== "stitching") {
      setLastViewChangeSource("fit_sheet");
      setLastCenterChangePath("fitAllSheets");
      setFitBoundsActive(true);
      setFitOverlayRequest((current) => current + 1);
      return;
    }

    const bounds = getPlacementBounds(sheets, present.placements);

    if (!bounds) {
      return;
    }

    const width = Math.max(bounds.x2 - bounds.x1, 1);
    const height = Math.max(bounds.y2 - bounds.y1, 1);
    const scale = Math.min(stageSize.width / (width + 160), stageSize.height / (height + 160), 1.6);

    commitViewport(
      {
        scale,
        x: stageSize.width / 2 - (bounds.x1 + width / 2) * scale,
        y: stageSize.height / 2 - (bounds.y1 + height / 2) * scale,
      },
      true,
    );
  }

  function resetView() {
    commitViewport({ x: 0, y: 0, scale: 1 }, true);
  }

  function centerSelectedSheet() {
    if (studioMode !== "stitching" && selectedSheetGeoreference && hasOperationalSheetPlacement(selectedSheetGeoreference)) {
      const nextCenter = { latitude: selectedSheetGeoreference.centerLatitude, longitude: selectedSheetGeoreference.centerLongitude };
      requestExternalMapView(nextCenter, modernMapZoom, "fit_sheet", "centerSelectedSheet");
      commitGeographicMapSettings(
        {
          center: nextCenter,
          zoom: modernMapZoom,
        },
        true,
      );
      return;
    }

    if (!selectedPlacement || !selectedAsset) {
      return;
    }

    const center = getPlacementCenter(selectedPlacement, selectedAsset);

    commitViewport(
      {
        scale: present.viewport.scale,
        x: stageSize.width / 2 - center.x * present.viewport.scale,
        y: stageSize.height / 2 - center.y * present.viewport.scale,
      },
      true,
    );
  }

  function resetSelectedTransform() {
    if (studioMode !== "stitching" && selectedSheetGeoreference) {
      commitSheetGeoreference(selectedSheetGeoreference.assetId, {
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        isFlippedHorizontally: false,
        isFlippedVertically: false,
        opacity: 1,
      });
      return;
    }

    if (!selectedPlacement) {
      return;
    }

    commitPlacement(selectedPlacement.assetId, {
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      rotation: 0,
      opacity: 1,
      isFlippedHorizontally: false,
      isFlippedVertically: false,
    });
  }

  function resetSelectedPlacementToTownCenter() {
    if (!selectedSheetGeoreference || !selectedAsset) {
      return;
    }

    const center = getDefaultTownCenter(initialData);
    const aspectRatio = selectedAsset.width / Math.max(1, selectedAsset.height);
    const latitudeSpan = Math.max(0.0008, Math.min(0.01, selectedSheetGeoreference.latitudeSpan || 0.003));
    const longitudeSpan = Math.max(0.0008, Math.min(0.012, latitudeSpan * aspectRatio));
    const repaired = resetSheetGeographicPlacementToCenter(selectedSheetGeoreference, center, { latitudeSpan, longitudeSpan });
    const nextSheets = geoPresent.sheets.map((sheet) => (sheet.assetId === repaired.assetId ? repaired : sheet));

    setSelectedAssetId(repaired.assetId);
    requestExternalMapView(center, modernMapZoom, "reset_invalid_placements", "resetSelectedPlacementToTownCenter");
    setGeoEditMode("edit_historical_sheets");
    setSheetGeoPresent(
      {
        ...geoPresent,
        mapSettings: normalizeGeographicMapSettings({
          ...geoPresent.mapSettings,
          center,
          editMode: "edit_historical_sheets",
          globalHistoricalOpacity,
        }),
        sheets: nextSheets,
      },
      true,
    );
    setFitOverlayRequest((current) => current + 1);
  }

  function resetAllSheetPlacementsToCurrentTownLocation() {
    const center = isOperationalMapCenter(mapCenter)
      ? mapCenter
      : requestedGeocodeCenterRef.current && isOperationalMapCenter(requestedGeocodeCenterRef.current)
        ? requestedGeocodeCenterRef.current
        : getDefaultTownCenter(initialData);
    let selectedWasPlaced = false;
    const nextSheets = geoPresent.sheets.map((sheet) => {
      const asset = sheets.find((candidate) => candidate.assetId === sheet.assetId);

      if (!asset) {
        return sheet;
      }

      if (sheet.assetId === selectedAssetId) {
        const aspectRatio = asset.width / Math.max(1, asset.height);
        const latitudeSpan = Math.max(0.0008, Math.min(0.01, sheet.latitudeSpan || 0.003));
        const longitudeSpan = Math.max(0.0008, Math.min(0.012, latitudeSpan * aspectRatio));
        selectedWasPlaced = true;
        return resetSheetGeographicPlacementToCenter(
          {
            ...sheet,
            opacity: 0.5,
          },
          center,
          { latitudeSpan, longitudeSpan },
        );
      }

      return hasOperationalSheetPlacement(sheet) ? sheet : removeSheetGeographicPlacement(sheet);
    });

    requestExternalMapView(center, modernMapZoom, "reset_invalid_placements", "resetAllSheetPlacementsToCurrentTownLocation");
    setGeoEditMode("edit_historical_sheets");
    setStaleViewBlocked(false);
    setSheetGeoPresent(
      {
        ...geoPresent,
        mapSettings: normalizeGeographicMapSettings({
          ...geoPresent.mapSettings,
          center,
          editMode: "edit_historical_sheets",
          globalHistoricalOpacity: 1,
        }),
        sheets: nextSheets,
      },
      true,
    );
    setSaveMessage(selectedWasPlaced ? "Invalid sheet placements were reset. Save placement to persist the repair." : "No selected sheet was available to place.");
  }

  function rotateSelectedSheet(deltaDegrees: number) {
    if (studioMode !== "stitching" && selectedSheetGeoreference) {
      if (selectedSheetGeoreference.isLocked) {
        return;
      }

      commitSheetGeoreference(selectedSheetGeoreference.assetId, { rotation: normalizeRotation(selectedSheetGeoreference.rotation + deltaDegrees) });
      return;
    }

    if (!selectedPlacement || selectedPlacement.isLocked) {
      return;
    }

    commitPlacement(selectedPlacement.assetId, { rotation: normalizeRotation(selectedPlacement.rotation + deltaDegrees) });
  }

  function flipSelectedSheet(axis: "horizontal" | "vertical") {
    if (studioMode !== "stitching" && selectedSheetGeoreference) {
      if (selectedSheetGeoreference.isLocked) {
        return;
      }

      commitSheetGeoreference(
        selectedSheetGeoreference.assetId,
        axis === "horizontal"
          ? { isFlippedHorizontally: !selectedSheetGeoreference.isFlippedHorizontally }
          : { isFlippedVertically: !selectedSheetGeoreference.isFlippedVertically },
      );
      return;
    }

    if (!selectedPlacement || selectedPlacement.isLocked) {
      return;
    }

    commitPlacement(
      selectedPlacement.assetId,
      axis === "horizontal"
        ? { isFlippedHorizontally: !selectedPlacement.isFlippedHorizontally }
        : { isFlippedVertically: !selectedPlacement.isFlippedVertically },
    );
  }

  function updateSelectedScale(axis: "x" | "y", value: number) {
    if (studioMode !== "stitching" && selectedSheetGeoreference) {
      if (selectedSheetGeoreference.isLocked) {
        return;
      }

      const patch = uniformScale
        ? { scaleX: value, scaleY: value }
        : axis === "x"
          ? { scaleX: value }
          : { scaleY: value };

      commitSheetGeoreference(selectedSheetGeoreference.assetId, patch);
      return;
    }

    if (!selectedPlacement || selectedPlacement.isLocked) {
      return;
    }

    const patch = uniformScale
      ? { scaleX: value, scaleY: value }
      : axis === "x"
        ? { scaleX: value }
        : { scaleY: value };

    commitPlacement(selectedPlacement.assetId, patch);
  }

  function setLayerOrder(action: "forward" | "backward" | "front" | "back") {
    if (!selectedAssetId) {
      return;
    }

    if (studioMode !== "stitching") {
      setSheetGeoPresent({ ...geoPresent, sheets: reorderSheetGeographicTransform(geoPresent.sheets, selectedAssetId, action) }, true);
      return;
    }

    setPresent({ ...present, placements: reorderPlacement(present.placements, selectedAssetId, action) }, true);
  }

  function fitSelectedSheet() {
    if (!selectedSheetGeoreference || !hasOperationalSheetPlacement(selectedSheetGeoreference)) {
      centerSelectedSheet();
      return;
    }

    const nextCenter = { latitude: selectedSheetGeoreference.centerLatitude, longitude: selectedSheetGeoreference.centerLongitude };
    const nextZoom = Math.max(modernMapZoom, 17);
    setMapCenter(nextCenter);
    setModernMapZoom(nextZoom);
    setLastViewChangeSource("fit_sheet");
    setLastCenterChangePath("fitSelectedSheet");
    setFitBoundsActive(true);
    commitGeographicMapSettings({ center: nextCenter, zoom: nextZoom }, true);
    setFitOverlayRequest((current) => current + 1);
  }

  function selectAndCenter(assetId: string) {
    setSelectedAssetId(assetId);
    const sheetGeoreference = geoPresent.sheets.find((candidate) => candidate.assetId === assetId);

    if (studioMode !== "stitching" && sheetGeoreference) {
      if (hasOperationalSheetPlacement(sheetGeoreference)) {
        const nextCenter = { latitude: sheetGeoreference.centerLatitude, longitude: sheetGeoreference.centerLongitude };
        requestExternalMapView(nextCenter, modernMapZoom, "fit_sheet", "selectAndCenter");
        setGeoEditMode("edit_historical_sheets");
        commitGeographicMapSettings({ center: nextCenter, editMode: "edit_historical_sheets" }, false);
      } else {
        setGeoEditMode("edit_historical_sheets");
        commitGeographicMapSettings({ editMode: "edit_historical_sheets" }, false);
      }
      return;
    }

    const placement = present.placements.find((candidate) => candidate.assetId === assetId);
    const asset = sheets.find((candidate) => candidate.assetId === assetId);

    if (placement && asset) {
      const center = getPlacementCenter(placement, asset);

      commitViewport(
        {
          scale: present.viewport.scale,
          x: stageSize.width / 2 - center.x * present.viewport.scale,
          y: stageSize.height / 2 - center.y * present.viewport.scale,
        },
        false,
      );
    }
  }

  function copyStitchingLayoutIntoGeoreferencing() {
    const placedCount = geoPresent.sheets.filter((sheet) => sheet.isPersisted || sheet.georeferenceStatus !== "not_started").length;

    if (placedCount > 0 && !window.confirm("Replace the current draft georeferenced sheet arrangement with the local stitching layout?")) {
      return;
    }

    const copied = createSheetGeoreferencesFromStitching({
      assets: sheets,
      placements: present.placements,
      center: mapCenter,
    });

    if (copied.length === 0) {
      setSaveStatus("error");
      setSaveMessage("No visible stitching sheets are available to copy into georeferencing.");
      return;
    }

    setSheetGeoPresent(
      {
        mapSettings: normalizeGeographicMapSettings({
          ...geoPresent.mapSettings,
          center: mapCenter,
          zoom: modernMapZoom,
          editMode: "edit_historical_sheets",
          movementScope,
          globalHistoricalOpacity,
        }),
        sheets: copied,
      },
      true,
    );
    setGeoEditMode("edit_historical_sheets");
    setStudioMode("georeferencing");
    setSaveMessage("Copied local stitching layout into draft geographic sheet layers. Save to persist the georeferenced arrangement.");
  }

  async function refreshSignedUrl(assetId: string) {
    const response = await fetch(`/api/community/historical-map-studio/assets/${encodeURIComponent(assetId)}/signed-url`);
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; asset?: { signedUrl: string; signedUrlExpiresAt: string } } | null;

    if (response.ok && payload?.ok && payload.asset) {
      setSheets((currentSheets) =>
        currentSheets.map((sheet) =>
          sheet.assetId === assetId ? { ...sheet, signedUrl: payload.asset!.signedUrl, signedUrlExpiresAt: payload.asset!.signedUrlExpiresAt, signedUrlError: undefined } : sheet,
        ),
      );
      return;
    }

    setSheets((currentSheets) =>
      currentSheets.map((sheet) => (sheet.assetId === assetId ? { ...sheet, signedUrlError: payload?.message ?? "Signed URL refresh failed." } : sheet)),
    );
  }

  async function findLocation(saveToTownPackage = false) {
    if (!locationQuery.trim()) {
      setLocationStatus("error");
      setLocationMessage("Enter a town, address, ZIP code, or latitude and longitude.");
      return;
    }

    setLocationStatus("searching");
    setLocationMessage(saveToTownPackage ? "Saving resolved location..." : "Finding location...");

    const response = await fetch("/api/community/historical-map-studio/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: locationQuery,
        townPackageId: initialData.activeTownPackage?.id,
        saveToTownPackage,
      }),
    });
    const payload = (await response.json().catch(() => null)) as (GeocodeSuccess & { saved?: boolean; message?: string }) | { ok?: false; message?: string } | null;

    if (!response.ok || !payload?.ok) {
      setLocationStatus("error");
      setLocationMessage(payload?.message ?? "Location search failed.");
      return;
    }

    const view = {
      center: { latitude: payload.latitude, longitude: payload.longitude },
      zoom: payload.defaultZoom,
    };
    setLocationResult(payload);
    setRequestedGeocodeCenter(view.center);
    requestedGeocodeCenterRef.current = view.center;
    locationSearchGuardUntilRef.current = Date.now() + 2_000;
    setStaleViewBlocked(false);
    setFitBoundsActive(false);
    requestExternalMapView(
      view.center,
      view.zoom,
      saveToTownPackage ? "town_package" : "location_search",
      saveToTownPackage ? "findLocation:save_to_town_package" : "findLocation:location_search",
    );
    setResolvedLocationSource(saveToTownPackage ? "town_package" : "location_search");
    setLocationStatus(saveToTownPackage ? "saved" : "found");
    setLocationMessage(
      saveToTownPackage
        ? `Saved location for ${initialData.activeTownPackage?.name ?? "the active town"}: ${payload.displayName}`
        : `Found ${payload.displayName}`,
    );
  }

  async function uploadSheets(files: FileList | null) {
    if (!files || !initialData.activeTownPackage) {
      return;
    }

    const startingMissing = missingSheetNumbers[0] ?? sheets.length + 1;
    let offset = 0;
    const statuses: UploadStatus[] = [];
    let newestUploadedAssetId = "";

    for (const file of Array.from(files)) {
      statuses.push({ filename: file.name, status: "uploading", message: "Uploading..." });
      setUploadStatuses([...statuses]);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheetNumber", String(startingMissing + offset));
      formData.append("townPackageId", initialData.activeTownPackage.id);
      formData.append("intakeNotes", "Uploaded from Historical Map Studio.");
      offset += 1;

      const response = await fetch("/api/community/sanborn-sheets", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; asset?: { assetId?: string; originalFilename?: string } } | null;
      if (response.ok && payload?.ok && payload.asset?.assetId) {
        newestUploadedAssetId = payload.asset.assetId;
      }

      statuses[statuses.length - 1] = {
        filename: file.name,
        status: response.ok && payload?.ok ? "saved" : "failed",
        message: response.ok && payload?.ok ? "Uploaded. Refreshing sheet list..." : payload?.message ?? "Upload failed.",
      };
      setUploadStatuses([...statuses]);
    }

    if (newestUploadedAssetId) {
      pendingUploadedAssetIdRef.current = newestUploadedAssetId;
      setSelectedAssetId(newestUploadedAssetId);
    }

    router.refresh();
  }

  async function updateMetadata() {
    if (!selectedAsset) {
      return;
    }

    const response = await fetch("/api/community/historical-map-studio/metadata", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: selectedAsset.assetId,
        sheetNumber: metadataDraft.sheetNumber ? Number(metadataDraft.sheetNumber) : null,
        sourceRecordId: metadataDraft.sourceRecordId || null,
        sourceUrl: metadataDraft.sourceUrl,
        archiveName: metadataDraft.archiveName,
        rightsNote: metadataDraft.rightsNote,
        intakeNotes: metadataDraft.intakeNotes,
        evidenceClassification: metadataDraft.evidenceClassification,
        reviewStatus: metadataDraft.reviewStatus,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

    setSaveStatus(response.ok && payload?.ok ? "saved" : "error");
    setSaveMessage(response.ok && payload?.ok ? "Metadata updated." : payload?.message ?? "Metadata update failed.");

    if (response.ok && payload?.ok) {
      router.refresh();
    }
  }

  async function replaceSelectedImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file || !selectedAsset) {
      return;
    }

    if (!window.confirm(`Replace image for sheet ${selectedAsset.sheetNumber ?? "unknown"} (${selectedAsset.originalFilename})?`)) {
      return;
    }

    const formData = new FormData();
    formData.append("assetId", selectedAsset.assetId);
    formData.append("file", file);

    const response = await fetch("/api/community/historical-map-studio/replace", { method: "POST", body: formData });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; warningMessage?: string } | null;

    setSaveStatus(response.ok && payload?.ok ? "saved" : "error");
    setSaveMessage(response.ok && payload?.ok ? payload.warningMessage ?? "Image replaced." : payload?.message ?? "Replacement failed.");

    if (response.ok && payload?.ok) {
      router.refresh();
    }
  }

  async function deleteSelectedSheet() {
    if (!selectedAsset) {
      return;
    }

    if (!window.confirm(`Delete sheet ${selectedAsset.sheetNumber ?? "unknown"} (${selectedAsset.originalFilename})? This removes the stored image and metadata.`)) {
      return;
    }

    const response = await fetch("/api/community/historical-map-studio/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: selectedAsset.assetId }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; partialFailure?: boolean } | null;

    setSaveStatus(response.ok && payload?.ok ? "saved" : "error");
    setSaveMessage(response.ok && payload?.ok ? "Sheet deleted." : payload?.message ?? "Delete failed.");

    if (response.ok && payload?.ok) {
      router.refresh();
    }
  }

  function replaceActiveAtlasPages(nextActivePages: SanbornAtlasPageRecord[]) {
    if (!activeAtlas) {
      return;
    }

    const nextPages = [
      ...atlasInventory.pages.filter((page) => page.atlasId !== activeAtlas.atlasId),
      ...reorderAtlasPages(nextActivePages),
    ];

    setAtlasInventory({
      ...atlasInventory,
      pages: nextPages,
      unassignedAssetIds: getUnassignedSanbornUploads(sheets, nextPages).map((asset) => asset.assetId),
    });
  }

  function replaceSelectedPagePieces(nextPieces: SanbornMapPieceRecord[]) {
    if (!selectedAtlasPage) {
      return;
    }

    setAtlasInventory({
      ...atlasInventory,
      pieces: [
        ...atlasInventory.pieces.filter((piece) => piece.atlasPageId !== selectedAtlasPage.pageId),
        ...reorderMapPieces(nextPieces),
      ],
    });
  }

  async function saveAtlas(draft: {
    atlasId?: string;
    title: string;
    editionYear: string;
    editionDate: string;
    volumeLabel: string;
    expectedPageCount: string;
    sourceRecordId: string;
  }) {
    if (!initialData.activeTownPackage || atlasReadOnly) {
      setSaveStatus("error");
      setSaveMessage("Atlas save failed: active town package or write access is unavailable.");
      return;
    }

    setSaveStatus("saving");
    setSaveMessage("Saving Sanborn atlas...");
    const response = await fetch("/api/community/historical-map-studio/atlases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        townPackageId: initialData.activeTownPackage.id,
        mapYear: initialData.activeMapYear,
        atlasId: draft.atlasId,
        title: draft.title,
        editionYear: Number(draft.editionYear),
        editionDate: draft.editionDate,
        volumeLabel: draft.volumeLabel,
        expectedPageCount: draft.expectedPageCount ? Number(draft.expectedPageCount) : null,
        sourceRecordId: draft.sourceRecordId || null,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; atlasId?: string; message?: string; savedAt?: string } | null;

    if (!response.ok || !payload?.ok || !payload.atlasId) {
      setSaveStatus("error");
      setSaveMessage(payload?.message ?? "Sanborn atlas save failed.");
      return;
    }

    setSelectedAtlasId(payload.atlasId);
    setSaveStatus("saved");
    setSaveMessage("Sanborn atlas saved.");
    setLastSavedAt(payload.savedAt ?? new Date().toISOString());
    router.refresh();
  }

  function assignAssetToAtlas(assetId: string) {
    if (!activeAtlas) {
      setSaveStatus("error");
      setSaveMessage("Create or select a Sanborn atlas before assigning uploads.");
      return;
    }

    if (activeAtlasPages.some((page) => page.sanbornSheetAssetId === assetId)) {
      return;
    }

    const asset = sheets.find((candidate) => candidate.assetId === assetId);

    if (!asset) {
      setSaveStatus("error");
      setSaveMessage("Uploaded sheet metadata is unavailable.");
      return;
    }

    const nextSequence = Math.max(0, ...activeAtlasPages.map((page) => page.pageSequence)) + 1;
    const pageType = asset.sheetNumber ? "numbered_sheet" : "unknown";
    const nextPage: SanbornAtlasPageRecord = {
      rowId: "",
      pageId: buildDefaultSanbornPageId({ atlasId: activeAtlas.atlasId, assetId: asset.assetId }),
      atlasRowId: activeAtlas.rowId,
      atlasId: activeAtlas.atlasId,
      sanbornSheetAssetId: asset.assetId,
      sanbornSheetAssetRowId: asset.rowId,
      pageSequence: nextSequence,
      pageType,
      sheetNumber: asset.sheetNumber,
      volumeLabel: activeAtlas.volumeLabel,
      displayLabel: asset.sheetNumber ? `Sheet ${asset.sheetNumber}` : asset.originalFilename,
      reviewStatus: "unknown",
      evidenceClassification: "unknown",
      updatedAt: null,
      isPersisted: false,
    };

    replaceActiveAtlasPages([...activeAtlasPages, nextPage]);
    setSelectedAtlasPageId(nextPage.pageId);
    changeAtlasWorkflowStep("page_classification");
    setSaveStatus("idle");
    setSaveMessage("Assigned upload to atlas page draft. Save page order to persist it.");
  }

  function patchAtlasPage(pageId: string, patch: Partial<SanbornAtlasPageRecord>) {
    const nextPages = activeAtlasPages.map((page) =>
      page.pageId === pageId
        ? {
            ...page,
            ...patch,
            displayLabel: patch.displayLabel !== undefined ? normalizeOptionalSanbornText(patch.displayLabel, 160) : page.displayLabel,
            volumeLabel: patch.volumeLabel !== undefined ? normalizeOptionalSanbornText(patch.volumeLabel, 80) : page.volumeLabel,
          }
        : page,
    );

    replaceActiveAtlasPages(nextPages);
  }

  function reorderAtlasPage(pageId: string, direction: "up" | "down") {
    const sorted = [...activeAtlasPages].sort((left, right) => left.pageSequence - right.pageSequence);
    const index = sorted.findIndex((page) => page.pageId === pageId);

    if (index < 0) {
      return;
    }

    const nextIndex = direction === "up" ? Math.max(0, index - 1) : Math.min(sorted.length - 1, index + 1);
    const [page] = sorted.splice(index, 1);
    sorted.splice(nextIndex, 0, page);
    replaceActiveAtlasPages(reorderAtlasPages(sorted));
  }

  async function saveAtlasPages(options: { continueToPieceInventory?: boolean } = {}) {
    if (!initialData.activeTownPackage || !activeAtlas || atlasReadOnly) {
      setSaveStatus("error");
      setSaveMessage("Atlas page save failed: active atlas or write access is unavailable.");
      return;
    }

    const selectedPageIdBeforeSave = selectedAtlasPage?.pageId ?? selectedAtlasPageId;
    const workflowStepAfterSave = options.continueToPieceInventory ? "piece_inventory" : atlasWorkflowStep;

    setSaveStatus("saving");
    setSaveMessage("Saving atlas pages...");
    const pagesToSave = reorderAtlasPages(activeAtlasPages);
    const response = await fetch("/api/community/historical-map-studio/atlas-pages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        townPackageId: initialData.activeTownPackage.id,
        atlasId: activeAtlas.atlasId,
        pages: pagesToSave.map((page) => ({
          pageId: page.pageId,
          assetId: page.sanbornSheetAssetId,
          pageSequence: page.pageSequence,
          pageType: page.pageType,
          sheetNumber: page.sheetNumber,
          volumeLabel: page.volumeLabel,
          displayLabel: page.displayLabel,
        })),
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; savedAt?: string } | null;

    if (!response.ok || !payload?.ok) {
      setSaveStatus("error");
      setSaveMessage(payload?.message ?? "Atlas page save failed.");
      return;
    }

    setSaveStatus("saved");
    setSaveMessage("Atlas pages saved.");
    setLastSavedAt(payload.savedAt ?? new Date().toISOString());
    if (selectedPageIdBeforeSave) {
      const selectedPageBeforeSave = pagesToSave.find((page) => page.pageId === selectedPageIdBeforeSave);

      pendingStudioSelectionRef.current = {
        atlasId: activeAtlas.atlasId,
        pageId: selectedPageIdBeforeSave,
        assetId: selectedPageBeforeSave?.sanbornSheetAssetId ?? selectedAssetId,
        workflowStep: workflowStepAfterSave,
      };
      setSelectedAtlasId(activeAtlas.atlasId);
      setSelectedAtlasPageId(selectedPageIdBeforeSave);
      setAtlasWorkflowStep(workflowStepAfterSave);
      if (workflowStepAfterSave !== "gps_alignment") {
        setLastNonGpsWorkflowStep(workflowStepAfterSave);
      }
    }
    router.refresh();
  }

  function patchMapPiece(pieceId: string, patch: Partial<SanbornMapPieceRecord>) {
    replaceSelectedPagePieces(selectedAtlasPagePieces.map((piece) => (piece.pieceId === pieceId ? { ...piece, ...patch } : piece)));
  }

  function reorderMapPiece(pieceId: string, direction: "up" | "down") {
    const sorted = [...selectedAtlasPagePieces].sort((left, right) => left.pieceSequence - right.pieceSequence);
    const index = sorted.findIndex((piece) => piece.pieceId === pieceId);

    if (index < 0) {
      return;
    }

    const nextIndex = direction === "up" ? Math.max(0, index - 1) : Math.min(sorted.length - 1, index + 1);
    const [piece] = sorted.splice(index, 1);
    sorted.splice(nextIndex, 0, piece);
    replaceSelectedPagePieces(reorderMapPieces(sorted));
  }

  function deleteMapPiece(pieceId: string) {
    replaceSelectedPagePieces(selectedAtlasPagePieces.filter((piece) => piece.pieceId !== pieceId));
    if (selectedMapPieceId === pieceId) {
      setSelectedMapPieceId("");
    }
  }

  async function saveMapPieces() {
    if (!selectedAtlasPage || !selectedAtlasPage.isPersisted) {
      setSaveStatus("error");
      setSaveMessage("Save atlas page assignments before saving map pieces.");
      return;
    }

    if (!initialData.activeTownPackage || atlasReadOnly) {
      setSaveStatus("error");
      setSaveMessage("Map piece save failed: active atlas page or write access is unavailable.");
      return;
    }

    setSaveStatus("saving");
    setSaveMessage("Saving map pieces...");
    const piecesToSave = reorderMapPieces(selectedAtlasPagePieces);
    const response = await fetch("/api/community/historical-map-studio/map-pieces", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        townPackageId: initialData.activeTownPackage.id,
        pageId: selectedAtlasPage.pageId,
        pieces: piecesToSave.map((piece) => ({
          pieceId: piece.pieceId,
          parentPieceId: piece.parentPieceId,
          pieceSequence: piece.pieceSequence,
          pieceType: piece.pieceType,
          blockNumberText: piece.blockNumberText,
          titleText: piece.titleText,
          sourcePolygon: piece.sourcePolygon,
          creationMethod: piece.creationMethod,
          inventoryStatus: piece.inventoryStatus,
          notes: piece.notes,
        })),
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; savedAt?: string } | null;

    if (!response.ok || !payload?.ok) {
      setSaveStatus("error");
      setSaveMessage(payload?.message ?? "Map piece save failed.");
      return;
    }

    setSaveStatus("saved");
    setSaveMessage("Map pieces saved.");
    setLastSavedAt(payload.savedAt ?? new Date().toISOString());
    pendingStudioSelectionRef.current = {
      atlasId: selectedAtlasPage.atlasId,
      pageId: selectedAtlasPage.pageId,
      pieceId: selectedMapPieceId || piecesToSave[0]?.pieceId,
      assetId: selectedAtlasPage.sanbornSheetAssetId,
      workflowStep: atlasWorkflowStep,
    };
    router.refresh();
  }

  function setGeoreferenceTarget(targetType: "sheet" | "workspace") {
    const targetAssetId = targetType === "sheet" ? selectedAsset?.assetId ?? sheets[0]?.assetId ?? null : null;
    setGeoreferenceDraft(createGeoreferenceDraft(initialData, targetAssetId));
  }

  function addHistoricalControlPoint(event: ReactMouseEvent<HTMLImageElement>) {
    const workspaceComposite = buildWorkspaceCompositeImage(sheets, present.placements);
    const reference =
      georeferenceDraft.targetType === "workspace"
        ? workspaceComposite
        : selectedAsset
          ? { width: selectedAsset.width, height: selectedAsset.height, offsetX: 0, offsetY: 0 }
          : null;

    if (!reference) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const imageX = reference.offsetX + ((event.clientX - rect.left) / rect.width) * reference.width;
    const imageY = reference.offsetY + ((event.clientY - rect.top) / rect.height) * reference.height;
    const controlPointId = `cp-${Date.now()}`;
    const point = normalizeControlPoint({
      controlPointId,
      label: `CP ${georeferenceDraft.controlPoints.length + 1}`,
      imageX,
      imageY,
      latitude: null,
      longitude: null,
      confidence: "draft",
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setGeoreferenceDraft({
      ...georeferenceDraft,
      controlPoints: [...georeferenceDraft.controlPoints, point],
      selectedControlPointId: controlPointId,
      status: "control_points_draft",
    });
    setHistoricalClickMode("idle");
  }

  function completeSelectedControlPoint(latitude: number, longitude: number) {
    const selectedId = georeferenceDraft.selectedControlPointId;

    if (selectedId) {
      setGeoreferenceDraft({
        ...georeferenceDraft,
        controlPoints: updateDraftPoint(georeferenceDraft.controlPoints, selectedId, {
          latitude,
          longitude,
          updatedAt: new Date().toISOString(),
        }),
      });
      return;
    }

    const controlPointId = `cp-${Date.now()}`;
    const point = normalizeControlPoint({
      controlPointId,
      label: `CP ${georeferenceDraft.controlPoints.length + 1}`,
      imageX: null,
      imageY: null,
      latitude,
      longitude,
      confidence: "draft",
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setGeoreferenceDraft({
      ...georeferenceDraft,
      controlPoints: [...georeferenceDraft.controlPoints, point],
      selectedControlPointId: controlPointId,
    });
  }

  function updateControlPoint(controlPointId: string, patch: Partial<HistoricalMapControlPoint>) {
    setGeoreferenceDraft({
      ...georeferenceDraft,
      controlPoints: updateDraftPoint(georeferenceDraft.controlPoints, controlPointId, { ...patch, updatedAt: new Date().toISOString() }),
    });
  }

  function deleteSelectedControlPoint() {
    if (!georeferenceDraft.selectedControlPointId) {
      return;
    }

    setGeoreferenceDraft({
      ...georeferenceDraft,
      controlPoints: georeferenceDraft.controlPoints.filter((point) => point.controlPointId !== georeferenceDraft.selectedControlPointId),
      selectedControlPointId: "",
    });
  }

  function clearDraftPoints() {
    if (!window.confirm("Clear all draft control points for this georeference?")) {
      return;
    }

    setGeoreferenceDraft({
      ...georeferenceDraft,
      controlPoints: [],
      selectedControlPointId: "",
      status: georeferenceDraft.bounds ? "bounding_box" : "not_started",
    });
  }

  function moveCorner(corner: keyof GeoCorners, latitude: number, longitude: number) {
    const corners = {
      ...georeferenceDraft.corners,
      [corner]: { latitude, longitude },
    };

    setGeoreferenceDraft({
      ...georeferenceDraft,
      corners,
      bounds: boundsFromCorners(corners),
      status: "bounding_box",
    });
  }

  function resetGeographicAlignment() {
    if (!window.confirm("Reset geographic bounds and control points for the current draft?")) {
      return;
    }

    const corners = createDefaultGeoCorners(getDefaultTownCenter(initialData));

    setGeoreferenceDraft({
      ...georeferenceDraft,
      corners,
      bounds: boundsFromCorners(corners),
      controlPoints: [],
      selectedControlPointId: "",
      status: "not_started",
    });
  }

  function calculateAlignment() {
    const completePoints = getCompleteControlPoints(georeferenceDraft.controlPoints);
    const transform = calculateAffineTransform(completePoints);

    setSaveStatus(transform.ok ? "saved" : "error");
    setSaveMessage(
      transform.ok
        ? `Affine alignment calculated from ${completePoints.length} control points. Estimated residual: ${transform.residualError.toExponential(3)} degrees.`
        : transform.error,
    );

    setGeoreferenceDraft({
      ...georeferenceDraft,
      status: deriveGeoreferenceStatus({ corners: georeferenceDraft.corners, controlPoints: georeferenceDraft.controlPoints }),
    });
  }

  async function saveGeoreference() {
    if (!initialData.activeTownPackage || !initialData.workspace) {
      setSaveStatus("error");
      setSaveMessage("A town package and workspace are required before saving georeferencing.");
      return;
    }

    const response = await fetch("/api/community/historical-map-studio/georeference", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        townPackageId: initialData.activeTownPackage.id,
        mapYear: initialData.activeMapYear,
        workspaceId: initialData.workspace.workspaceId,
        workspaceName: initialData.workspace.name,
        targetType: georeferenceDraft.targetType,
        targetAssetId: georeferenceDraft.targetAssetId,
        status: georeferenceDraft.status,
        bounds: georeferenceDraft.bounds,
        corners: georeferenceDraft.corners,
        controlPoints: georeferenceDraft.controlPoints,
        selectedBasemap: georeferenceDraft.selectedBasemap,
        overlayOpacity: georeferenceDraft.overlayOpacity,
        overlayVisible: georeferenceDraft.overlayVisible,
        showControlPoints: georeferenceDraft.showControlPoints,
        showSheetBoundaries: georeferenceDraft.showSheetBoundaries,
        notes: georeferenceDraft.notes,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; residualError?: number; transformWarning?: string } | null;

    if (!response.ok || !payload?.ok) {
      setSaveStatus("error");
      setSaveMessage(payload?.message ?? "Georeference save failed.");
      return;
    }

    setSaveStatus("saved");
    setSaveMessage(payload.transformWarning ? `Georeference saved for visual alignment. ${payload.transformWarning}` : "Georeference saved.");
    router.refresh();
  }

  const sortedPlacements = [...present.placements].sort((a, b) => a.layerOrder - b.layerOrder);
  const placementByAssetId = new Map(present.placements.map((placement) => [placement.assetId, placement]));
  const sheetGeoreferenceByAssetId = new Map(geoPresent.sheets.map((sheet) => [sheet.assetId, sheet]));
  const filteredSheets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return sheets.filter((sheet) => {
      const geoSheet = sheetGeoreferenceByAssetId.get(sheet.assetId);
      const placement = placementByAssetId.get(sheet.assetId);
      const warning = duplicateSheetNumbers.includes(sheet.sheetNumber ?? -1) || sheet.signedUrlError;
      const matchesFilter =
        sheetFilter === "all" ||
        (sheetFilter === "unplaced" && (!geoSheet || geoSheet.placementStatus === "unplaced")) ||
        (sheetFilter === "draft" && Boolean(geoSheet && ["bounding_box", "control_points_draft"].includes(geoSheet.georeferenceStatus))) ||
        (sheetFilter === "aligned" && geoSheet?.georeferenceStatus === "aligned_draft") ||
        (sheetFilter === "reviewed" && geoSheet?.georeferenceStatus === "reviewed") ||
        (sheetFilter === "hidden" && (geoSheet?.isVisible === false || placement?.isVisible === false)) ||
        (sheetFilter === "locked" && (geoSheet?.isLocked === true || placement?.isLocked === true)) ||
        (sheetFilter === "warnings" && Boolean(warning));

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return `${sheet.sheetNumber ?? ""} ${sheet.originalFilename} ${sheet.reviewStatus} ${sheet.sourceTitle ?? ""} ${geoSheet?.georeferenceStatus ?? ""}`.toLowerCase().includes(normalizedSearch);
    });
  }, [sheets, search, sheetFilter, geoPresent.sheets, duplicateSheetNumbers]);

  const historicalSheetLayers = geoPresent.sheets.reduce<HistoricalSheetMapLayer[]>((layers, geoSheet) => {
      const asset = sheets.find((candidate) => candidate.assetId === geoSheet.assetId);

      if (!asset || !hasOperationalSheetPlacement(geoSheet)) {
        return layers;
      }

      layers.push({
        ...geoSheet,
        imageUrl: showHistoricalLayers && comparisonMode !== "modern_only" ? asset.signedUrl : null,
        sheetNumber: asset.sheetNumber,
        originalFilename: asset.originalFilename,
        width: asset.width,
        height: asset.height,
        signedUrlError: asset.signedUrlError,
      });
      return layers;
    }, []);
  const sheetAssemblyBounds = useMemo(() => {
    const coordinates = historicalSheetLayers
      .filter((layer) => hasOperationalSheetPlacement(layer))
      .flatMap((layer) => [layer.corners.northwest, layer.corners.northeast, layer.corners.southeast, layer.corners.southwest])
      .filter((coordinate): coordinate is GeoCoordinate => Boolean(coordinate) && isOperationalMapCenter(coordinate));

    if (coordinates.length < 2) {
      return null;
    }

    return normalizeGeoBounds({
      northLatitude: Math.max(...coordinates.map((coordinate) => coordinate.latitude)),
      southLatitude: Math.min(...coordinates.map((coordinate) => coordinate.latitude)),
      eastLongitude: Math.max(...coordinates.map((coordinate) => coordinate.longitude)),
      westLongitude: Math.min(...coordinates.map((coordinate) => coordinate.longitude)),
    });
  }, [historicalSheetLayers]);
  const hasPlacedHistoricalSheets = historicalSheetLayers.some((layer) => hasOperationalSheetPlacement(layer));
  const mapSheetLayers = showReferenceSheetAlignment && hasPlacedHistoricalSheets
    ? historicalSheetLayers.map((layer) => ({
        ...layer,
        opacity: Math.min(layer.opacity, 0.28),
      }))
    : [];
  const selectedMapPieceLayer: HistoricalPieceMapLayer | null =
    selectedMapPiece && selectedMapPieceGeoreference && selectedAtlasPageAsset
      ? {
          ...selectedMapPieceGeoreference,
          imageUrl: showHistoricalLayers && comparisonMode !== "modern_only" ? selectedAtlasPageAsset.signedUrl : null,
          signedUrlError: selectedAtlasPageAsset.signedUrlError,
          sourcePolygon: selectedMapPiece.sourcePolygon,
          sourceBBox: selectedMapPiece.sourceBBox,
          sourceImageWidth: selectedAtlasPageAsset.width,
          sourceImageHeight: selectedAtlasPageAsset.height,
          pieceLabel: getMapPieceDisplayLabel(selectedMapPiece),
        }
      : null;
  const mapPieceLayers = selectedMapPieceLayer && hasOperationalMapPiecePlacement(selectedMapPieceLayer) ? [selectedMapPieceLayer] : [];
  const selectedMapPieceBounds = selectedMapPieceGeoreference && hasOperationalMapPiecePlacement(selectedMapPieceGeoreference)
    ? boundsFromCorners(selectedMapPieceGeoreference.corners)
    : null;
  const visibleGeographicSheets = historicalSheetLayers.filter((layer) => layer.isVisible).length;
  const unplacedGeographicSheets = geoPresent.sheets.filter((sheet) => sheet.placementStatus === "unplaced").length;
  const workspaceComposite = useMemo(() => buildWorkspaceCompositeImage(sheets, present.placements), [sheets, present.placements]);
  const selectedControlPoint: any = georeferenceDraft.controlPoints.find((point) => point.controlPointId === georeferenceDraft.selectedControlPointId) ?? null;
  const completeControlPoints = getCompleteControlPoints(georeferenceDraft.controlPoints);
  const calculatedTransform: any = calculateAffineTransform(completeControlPoints);
  const selectedOverlayAsset = georeferenceDraft.targetType === "sheet" ? sheets.find((sheet) => sheet.assetId === georeferenceDraft.targetAssetId) ?? selectedAsset : null;
  const activeTransform: any = studioMode === "stitching" ? selectedPlacement : selectedSheetGeoreference;
  const selectedImageState: any = selectedAssetId ? sheetImageStates[selectedAssetId] : null;
  const georeferenceDraftBounds: any = georeferenceDraft.bounds;
  const selectedHasInvalidZeroPlacement = Boolean(selectedSheetGeoreference && isAccidentalZeroSheetPlacement(selectedSheetGeoreference));
  const selectedCanEditOnMap = Boolean(
    selectedSheetGeoreference &&
      canEditHistoricalSheetOnMap({
        mode: geoEditMode,
        isVisible: selectedSheetGeoreference.isVisible,
        isLocked: selectedSheetGeoreference.isLocked,
      }),
  );
  const historicalReference: any =
    georeferenceDraft.targetType === "workspace"
      ? workspaceComposite
        ? {
            label: "Stitched workspace composite",
            signedUrl: workspaceComposite.url,
            width: workspaceComposite.width,
            height: workspaceComposite.height,
            offsetX: workspaceComposite.offsetX,
            offsetY: workspaceComposite.offsetY,
          }
        : null
      : selectedAsset?.signedUrl
        ? {
            label: `Historical sheet ${selectedAsset.sheetNumber ?? "unknown"}`,
            signedUrl: selectedAsset.signedUrl,
            width: selectedAsset.width,
            height: selectedAsset.height,
            offsetX: 0,
            offsetY: 0,
          }
        : null;
  const overlayImageUrl = georeferenceDraft.targetType === "workspace" ? workspaceComposite?.url ?? null : selectedOverlayAsset?.signedUrl ?? null;
  const selectedSheetPlaced = Boolean(selectedSheetGeoreference && hasOperationalSheetPlacement(selectedSheetGeoreference));
  const selectedOpacity = selectedSheetGeoreference?.opacity ?? 0.5;
  const selectedMapPieceHasGeographicFootprint = hasMapPieceGeographicFootprint(selectedMapPieceGeoreference);
  const selectedMapPiecePlaced = Boolean(selectedMapPieceGeoreference && hasOperationalMapPiecePlacement(selectedMapPieceGeoreference));
  const selectedMapPieceOpacity = selectedMapPieceGeoreference?.opacity ?? 0.72;
  const selectedMapPieceRotation = selectedMapPieceGeoreference?.rotation ?? 0;
  const selectedMapPiecePlacementLabel = getMapPiecePlacementLabel(selectedMapPieceGeoreference);
  const selectedMapPieceDisplayLabel = getMapPieceDisplayLabel(selectedMapPiece);
  const selectedPiecePreviewClipId = selectedMapPiece
    ? `sanborn-piece-preview-${selectedMapPiece.pieceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`
    : "";
  const saveStatusText =
    saveStatus === "saving"
      ? "Saving"
      : saveStatus === "error"
        ? saveMessage || "Save failed"
        : saveStatus === "saved"
          ? saveMessage || `Saved at ${lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : "database"}`
          : isDirty
            ? "Unsaved"
            : lastSavedAt
              ? `Saved at ${new Date(lastSavedAt).toLocaleTimeString()}`
              : "Unsaved";
  const latestUploadStatus = uploadStatuses.length > 0 ? uploadStatuses[uploadStatuses.length - 1] : null;
  const uploadStatusText = latestUploadStatus
    ? `${latestUploadStatus.status === "uploading" ? "Uploading" : latestUploadStatus.status === "saved" ? "Uploaded" : "Upload failed"}: ${latestUploadStatus.filename}`
    : "";
  const selectedBasemap = basemaps.find((basemap) => basemap.key === georeferenceDraft.selectedBasemap) ?? basemaps[0];
  const visibleLoadedTileCount = tileRuntimeDebug?.visibleLoadedTileCount ?? 0;
  const modernMapStatusText =
    visibleLoadedTileCount > 0
      ? `Modern map: ${selectedBasemap.label} ${visibleLoadedTileCount} visible tiles`
      : modernTileDiagnostics.status === "error"
        ? `Modern map failed: ${selectedBasemap.label} ${modernTileDiagnostics.failedTiles} tiles failed`
        : modernTileDiagnostics.successfulTiles > 0
          ? `Modern map: ${modernTileDiagnostics.successfulTiles} tiles loaded but not visibly painted`
        : `Modern map: loading ${selectedBasemap.label}`;
  const mapInteractionStatusText =
    mapInteractionStatus === "panning"
      ? "Panning map"
      : mapInteractionStatus === "zooming"
        ? "Zooming map"
        : mapInteractionStatus === "saved"
          ? "Map position saved"
          : "";
  const locationMarker = locationResult ? { latitude: locationResult.latitude, longitude: locationResult.longitude } : null;
  const activeTownCenter =
    typeof initialData.activeTownPackage?.centerLatitude === "number" && typeof initialData.activeTownPackage.centerLongitude === "number"
      ? `${formatCoordinate(initialData.activeTownPackage.centerLatitude)}, ${formatCoordinate(initialData.activeTownPackage.centerLongitude)}`
      : "unavailable";
  const isGpsAlignmentStep = atlasWorkflowStep === "gps_alignment";
  const toolbarSaveMessage = saveMessage ? `${saveMessage} Last saved: ${lastSavedAt ? formatDate(lastSavedAt) : "Not saved yet"}.` : "";

  return (
    <section className="minimal-sanborn-gps" aria-label="Historical Map Studio map placement tool">
      <header className="minimal-sanborn-gps__toolbar">
        <div className="minimal-sanborn-gps__toolbar-row minimal-sanborn-gps__toolbar-row--primary" aria-label="Primary navigation">
          <strong className="minimal-sanborn-gps__title">Historical Map Studio</strong>
          <div className="minimal-sanborn-gps__toolbar-group" aria-label="Town and year selectors">
            <select
              aria-label="Town package"
              className="minimal-sanborn-gps__select"
              value={initialData.activeTownPackage?.id ?? ""}
              onChange={(event) => router.push(`/community/historical-map-studio?town=${event.target.value}&year=${initialData.activeMapYear ?? ""}`)}
            >
              {initialData.townPackages.map((town) => (
                <option key={town.id} value={town.id}>{town.name}</option>
              ))}
            </select>
            <select
              aria-label="Map year"
              className="minimal-sanborn-gps__year"
              value={initialData.activeMapYear ?? ""}
              onChange={(event) => router.push(`/community/historical-map-studio?town=${initialData.activeTownPackage?.id ?? ""}&year=${event.target.value}`)}
            >
              {initialData.availableMapYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          {isGpsAlignmentStep ? (
            <div className="minimal-sanborn-gps__gps-workflow" aria-label="Map placement workflow navigation">
              <button className="sanborn-button sanborn-button--primary" onClick={backToLastNonGpsWorkflowStep} type="button">
                Back to {sanbornAtlasWorkflowSteps.find((step) => step.id === lastNonGpsWorkflowStep)?.label ?? "Piece inventory"}
              </button>
              <label className="minimal-sanborn-gps__workflow-select">
                <span>Workflow</span>
                <select
                  aria-label="Atlas workflow step"
                  value={atlasWorkflowStep}
                  onChange={(event) => changeAtlasWorkflowStep(event.target.value as SanbornAtlasWorkflowStep)}
                >
                  {sanbornAtlasWorkflowSteps.map((step, index) => (
                    <option key={step.id} value={step.id}>
                      {index + 1}. {step.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>

        <div className="minimal-sanborn-gps__toolbar-row minimal-sanborn-gps__toolbar-row--source" aria-label="Source and sheet controls">
          <input
            aria-label="Town, address, or ZIP"
            className="minimal-sanborn-gps__location"
            onChange={(event) => setLocationQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void findLocation(false);
              }
            }}
            placeholder="Town, address, or ZIP"
            value={locationQuery}
          />
          <button className="sanborn-button" disabled={locationStatus === "searching"} onClick={() => void findLocation(false)} type="button">
            Find location
          </button>
          {locationResult && initialData.activeTownPackage ? (
            <button className="sanborn-button" disabled={locationStatus === "searching"} onClick={() => void findLocation(true)} type="button">
              Use this location for {initialData.activeTownPackage.name} {initialData.activeMapYear}
            </button>
          ) : null}
          <button className="sanborn-button" onClick={() => uploadInputRef.current?.click()} type="button">
            Upload Sanborn sheets
          </button>
          <input
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            hidden
            multiple
            onChange={(event) => {
              void uploadSheets(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
            ref={uploadInputRef}
            type="file"
          />
          <select
            aria-label="Sanborn sheet"
            className="minimal-sanborn-gps__sheet"
            value={selectedAssetId}
            onChange={(event) => selectAndCenter(event.target.value)}
          >
            <option value="">Select sheet</option>
            {sheets.map((sheet) => (
              <option key={sheet.assetId} value={sheet.assetId}>
                Sheet {sheet.sheetNumber ?? "?"} - {sheet.originalFilename}
              </option>
            ))}
          </select>
        </div>

        {isGpsAlignmentStep ? (
          <div className="minimal-sanborn-gps__toolbar-row minimal-sanborn-gps__toolbar-row--gps" aria-label="Map placement controls">
            <span className={`minimal-sanborn-gps__selected-piece ${getMapPiecePlacementClass(selectedMapPieceGeoreference)}`}>
              Selected piece: <strong>{selectedMapPieceDisplayLabel}</strong>
              <span>{selectedMapPiecePlacementLabel}</span>
            </span>
            <button
              className="sanborn-button sanborn-button--primary"
              disabled={!selectedMapPiece?.isPersisted || atlasReadOnly}
              onClick={() => {
                if (!selectedMapPiece) return;
                setSelectedMapPieceId(selectedMapPiece.pieceId);
                setPiecePlacementAnchorId(selectedMapPiece.pieceId);
                setPlacementAnchorAssetId("");
                setGeoEditMode("pan_modern_map");
                commitGeographicMapSettings({ editMode: "pan_modern_map", globalHistoricalOpacity: 1 }, false);
                setSaveStatus("idle");
                setSaveMessage("Click the modern map to place the selected map piece.");
              }}
              type="button"
            >
              Place selected piece
            </button>
            <button className="sanborn-button" onClick={() => centerGpsOnActiveTown()} type="button">
              Center on {initialData.activeTownPackage?.name ?? "town"}
            </button>
            <div className="minimal-sanborn-gps__mode" role="group" aria-label="Map interaction mode">
              <button
                className={`sanborn-button${geoEditMode === "pan_modern_map" ? " sanborn-button--primary" : ""}`}
                onClick={() => {
                  setGeoEditMode("pan_modern_map");
                  setPiecePlacementAnchorId("");
                  commitGeographicMapSettings({ editMode: "pan_modern_map", globalHistoricalOpacity: 1 }, false);
                }}
                type="button"
              >
                Pan modern map
              </button>
              <button
                className={`sanborn-button${geoEditMode === "edit_historical_sheets" ? " sanborn-button--primary" : ""}`}
                disabled={!selectedMapPiecePlaced || selectedMapPieceGeoreference?.isLocked}
                onClick={() => {
                  setGeoEditMode("edit_historical_sheets");
                  setPiecePlacementAnchorId("");
                  commitGeographicMapSettings({ editMode: "edit_historical_sheets", globalHistoricalOpacity: 1 }, false);
                }}
                type="button"
              >
                Edit selected piece
              </button>
            </div>
            <label className="minimal-sanborn-gps__opacity">
              <span>Opacity</span>
              <input
                disabled={!selectedMapPieceGeoreference || selectedMapPieceGeoreference.isLocked}
                max="1"
                min="0.05"
                step="0.01"
                type="range"
                value={selectedMapPieceOpacity}
                onChange={(event) => selectedMapPiece ? commitMapPieceGeoreference(selectedMapPiece.pieceId, { opacity: Number(event.target.value) }) : undefined}
              />
              <output>{Math.round(selectedMapPieceOpacity * 100)}%</output>
            </label>
            <div className="minimal-sanborn-gps__quick-opacity" aria-label="Quick opacity">
              {[0.25, 0.5, 0.75, 1].map((opacity) => (
                <button
                  className="sanborn-button"
                  disabled={!selectedMapPieceGeoreference || selectedMapPieceGeoreference.isLocked}
                  key={opacity}
                  onClick={() => selectedMapPiece ? commitMapPieceGeoreference(selectedMapPiece.pieceId, { opacity }) : undefined}
                  type="button"
                >
                  {Math.round(opacity * 100)}%
                </button>
              ))}
            </div>
            <label className="minimal-sanborn-gps__rotation">
              <span>Rotate</span>
              <input
                disabled={!selectedMapPieceGeoreference || selectedMapPieceGeoreference.isLocked}
                max="180"
                min="-180"
                step="1"
                type="range"
                value={selectedMapPieceRotation}
                onChange={(event) => {
                  if (!selectedMapPiece || !selectedMapPieceGeoreference) return;
                  replaceMapPieceGeoreference(rotateMapPieceGeoreference(selectedMapPieceGeoreference, Number(event.target.value)));
                }}
              />
              <output>{Math.round(selectedMapPieceRotation)} deg</output>
            </label>
            <button className="sanborn-button sanborn-button--primary" disabled={!selectedMapPieceHasGeographicFootprint || saveStatus === "saving" || atlasReadOnly} onClick={() => void saveSelectedMapPiecePlacement()} type="button">
              Save placement
            </button>
            <button className="sanborn-button" disabled={!selectedMapPiece || saveStatus === "saving"} onClick={() => void reloadSelectedMapPiecePlacement()} type="button">
              Reload saved placement
            </button>
            <button className="sanborn-button" disabled={!selectedMapPieceGeoreference || selectedMapPieceGeoreference.isLocked} onClick={resetSelectedMapPiecePlacement} type="button">Reset piece</button>
            <button className="sanborn-button" disabled={!selectedMapPiecePlaced} onClick={fitSelectedMapPiece} type="button">Fit piece</button>
            <button
              className="sanborn-button"
              disabled={!selectedMapPiece || !selectedMapPieceGeoreference}
              onClick={() => selectedMapPiece && selectedMapPieceGeoreference ? commitMapPieceGeoreference(selectedMapPiece.pieceId, { isVisible: !selectedMapPieceGeoreference.isVisible }) : undefined}
              type="button"
            >
              {selectedMapPieceGeoreference?.isVisible ? "Hide piece" : "Show piece"}
            </button>
            <button
              className="sanborn-button"
              disabled={!selectedMapPiece || !selectedMapPieceGeoreference}
              onClick={() => selectedMapPiece && selectedMapPieceGeoreference ? commitMapPieceGeoreference(selectedMapPiece.pieceId, { isLocked: !selectedMapPieceGeoreference.isLocked }) : undefined}
              type="button"
            >
              {selectedMapPieceGeoreference?.isLocked ? "Unlock piece" : "Lock piece"}
            </button>
            <details className="minimal-sanborn-gps__reference-tools">
              <summary>Advanced whole-sheet reference</summary>
              <label className="minimal-sanborn-gps__toggle">
                <input checked={showReferenceSheetAlignment} onChange={(event) => setShowReferenceSheetAlignment(event.target.checked)} type="checkbox" />
                Show reference sheet overlays
              </label>
              <button className="sanborn-button" disabled={!selectedAssetId} onClick={() => selectedAssetId && addSheetToMap(selectedAssetId, mapCenter)} type="button">
                Place sheet
              </button>
              <button className="sanborn-button" disabled={!selectedSheetPlaced || saveStatus === "saving"} onClick={() => void saveSheetGeoreferences("manual", selectedAssetId)} type="button">
                Save sheet placement
              </button>
              <button className="sanborn-button" disabled={!initialData.workspace || saveStatus === "saving"} onClick={() => void reloadSavedPlacement()} type="button">
                Reload sheet placement
              </button>
              <button className="sanborn-button" disabled={!selectedSheetGeoreference} onClick={resetSelectedPlacementToTownCenter} type="button">Reset sheet</button>
              <button className="sanborn-button" disabled={!selectedAssetId} onClick={resetAllSheetPlacementsToCurrentTownLocation} type="button">Reset all sheets</button>
              <button className="sanborn-button" disabled={!selectedSheetGeoreference} onClick={fitSelectedSheet} type="button">Fit sheet</button>
              <button className={`sanborn-button${overlayRenderMode === "rectangular" ? " sanborn-button--primary" : ""}`} onClick={() => setOverlayRenderMode((mode) => (mode === "projective" ? "rectangular" : "projective"))} type="button">
                {overlayRenderMode === "projective" ? "Rectangular overlay" : "Projective overlay"}
              </button>
              <button className={`sanborn-button${plainMapTestMode ? " sanborn-button--primary" : ""}`} onClick={() => setPlainMapTestMode((current) => !current)} type="button">
                {plainMapTestMode ? "Studio map" : "Plain map test"}
              </button>
              <label className="minimal-sanborn-gps__opacity">
                <span>Sheet opacity</span>
                <input
                  disabled={!selectedSheetGeoreference || selectedSheetGeoreference.isLocked}
                  max="1"
                  min="0.05"
                  step="0.01"
                  type="range"
                  value={selectedOpacity}
                  onChange={(event) => selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { opacity: Number(event.target.value) }) : undefined}
                />
                <output>{Math.round(selectedOpacity * 100)}%</output>
              </label>
            </details>
          </div>
        ) : null}

        <div className="minimal-sanborn-gps__toolbar-row minimal-sanborn-gps__status-row" aria-live="polite" aria-label="Map and save status">
          <span className="minimal-sanborn-gps__map-status">{modernMapStatusText}</span>
          {mapInteractionStatusText ? <span className="minimal-sanborn-gps__map-status">{mapInteractionStatusText}</span> : null}
          <span className={`minimal-sanborn-gps__status is-${saveStatus}`}>{saveStatusText}</span>
          <div className="minimal-sanborn-gps__messages">
            {initialData.warningMessage ? <span className="minimal-sanborn-gps__message">{initialData.warningMessage}</span> : null}
            {locationMessage ? <span className={`minimal-sanborn-gps__message ${locationStatus === "error" ? "is-error" : ""}`}>{locationMessage}</span> : null}
            {autoFallbackNotice ? <span className="minimal-sanborn-gps__message is-warning">{autoFallbackNotice}</span> : null}
            {uploadStatusText ? <span className={`minimal-sanborn-gps__message ${latestUploadStatus?.status === "failed" ? "is-error" : ""}`}>{uploadStatusText}</span> : null}
            {toolbarSaveMessage ? <span className={`minimal-sanborn-gps__message ${saveStatus === "error" ? "is-error" : ""}`}>{toolbarSaveMessage}</span> : null}
          </div>
        </div>
      </header>

      <main className="minimal-sanborn-gps__map" ref={minimalMapRef}>
        {isGpsAlignmentStep ? (
          <>
        {!selectedMapPiece ? <p className="minimal-sanborn-gps__notice is-warning">Select a saved map piece before using Map placement.</p> : null}
        {selectedMapPiece && !selectedMapPiece.isPersisted ? <p className="minimal-sanborn-gps__notice is-warning">Save map pieces before geographic placement.</p> : null}
        {selectedMapPiece && !selectedMapPieceHasGeographicFootprint ? <p className="minimal-sanborn-gps__notice">Selected map piece is not on the map yet. Click Place selected piece.</p> : null}
        {selectedMapPieceHasGeographicFootprint && selectedAtlasPageAsset && !selectedAtlasPageAsset.signedUrl ? <p className="minimal-sanborn-gps__notice">Selected piece source image is waiting for a signed URL.</p> : null}
        {selectedAtlasPageAsset?.signedUrlError ? <p className="minimal-sanborn-gps__notice">Selected piece source image failed to get a signed URL: {selectedAtlasPageAsset.signedUrlError}</p> : null}
        {selectedImageState?.state === "failed" && showReferenceSheetAlignment ? <p className="minimal-sanborn-gps__notice">Selected Sanborn image failed to load. Retrying signed URL.</p> : null}
        {piecePlacementAnchorId ? <p className="minimal-sanborn-gps__notice">Click the modern map to place the selected map piece.</p> : null}
        {showReferenceSheetAlignment && placementAnchorAssetId ? <p className="minimal-sanborn-gps__notice">Click the modern map to place the selected reference sheet.</p> : null}
        {plainMapTestMode ? (
          <PlainLeafletMapTest
            basemapKey={defaultBasemapKey}
            onTileDiagnosticsChange={handleTileDiagnosticsChange}
            onTileRuntimeDebugChange={setTileRuntimeDebug}
          />
        ) : (
          <HistoricalMapLeaflet
            basemapKey={georeferenceDraft.selectedBasemap}
            bounds={selectedMapPieceBounds ?? (showReferenceSheetAlignment && hasPlacedHistoricalSheets ? sheetAssemblyBounds : null)}
            center={[mapCenter.latitude, mapCenter.longitude]}
            controlPoints={[]}
            corners={selectedMapPieceGeoreference?.corners ?? selectedSheetGeoreference?.corners ?? createDefaultGeoCorners(mapCenter)}
            fitBoundsEnabled={mapInteractionStatus !== "panning" && mapInteractionStatus !== "zooming" && (!requestedGeocodeCenter || Date.now() >= locationSearchGuardUntilRef.current)}
            fitBoundsRequest={fitOverlayRequest}
            globalHistoricalOpacity={1}
            imageUrl={null}
            locationMarker={selectedMapPieceHasGeographicFootprint || showReferenceSheetAlignment ? locationMarker : null}
            modernLayerVisible
            onCornerDrag={(corner, latitude, longitude) => {
              if (!selectedSheetGeoreference) return;
              const next = updateSheetGeographicCorner(selectedSheetGeoreference, corner, { latitude, longitude });
              commitSheetGeoreference(selectedSheetGeoreference.assetId, { corners: next.corners });
            }}
            onCursorMove={(latitude, longitude) => setMapCursor({ latitude, longitude })}
            onMapInteractionChange={handleMapInteractionChange}
            onMapClick={handleModernMapClick}
            onMapViewChange={handleLeafletViewChange}
            onMapViewMutation={handleMapViewMutation}
            onMarkerDrag={() => undefined}
            onPieceTransformCommit={(pieceId, patch) => commitMapPieceGeoreference(pieceId, patch)}
            onRefreshSheetSignedUrl={(assetId) => void refreshSignedUrl(assetId)}
            onSelectPiece={(pieceId) => setSelectedMapPieceId(pieceId)}
            onSelectSheet={(assetId) => {
              setSelectedAssetId(assetId);
              setGeoEditMode("edit_historical_sheets");
              commitGeographicMapSettings({ editMode: "edit_historical_sheets", globalHistoricalOpacity: 1 }, false);
            }}
            onSheetImageStateChange={(state) => setSheetImageStates((current) => ({ ...current, [state.assetId]: state }))}
            onSheetTransformCommit={(assetId, patch) => commitSheetGeoreference(assetId, patch)}
            onTileDiagnosticsChange={handleTileDiagnosticsChange}
            onTileRuntimeDebugChange={setTileRuntimeDebug}
            overlayRenderMode={overlayRenderMode}
            overlayOpacity={0.5}
            overlayVisible={false}
            pieceLayers={mapPieceLayers}
            plainTileOnly={!selectedMapPiecePlaced && !(showReferenceSheetAlignment && hasPlacedHistoricalSheets)}
            requestedViewSource={requestedViewSource}
            selectedControlPointId=""
            selectedPieceId={selectedMapPiece?.pieceId ?? selectedMapPieceId}
            selectedSheetAssetId={selectedAssetId}
            sheetEditMode={geoEditMode}
            sheetLayers={mapSheetLayers}
            showControlPoints={false}
            showSheetBoundaries={showReferenceSheetAlignment}
            showSheetLabels={showReferenceSheetAlignment}
            viewRefreshRequest={mapViewRefreshRequest}
            zoom={modernMapZoom}
          />
        )}
        <details
          className="minimal-sanborn-gps__details minimal-sanborn-gps__details--piece"
          onToggle={(event) => setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)}
          open={detailsOpen}
        >
          <summary>Piece placement inventory</summary>
          <div className="sanborn-piece-placement-panel">
            {selectedMapPiece && selectedAtlasPageAsset?.signedUrl ? (
              <figure className="sanborn-piece-placement-preview" aria-label="Selected piece preview">
                <svg viewBox={`0 0 ${selectedAtlasPageAsset.width} ${selectedAtlasPageAsset.height}`} role="img">
                  <defs>
                    <clipPath id={selectedPiecePreviewClipId}>
                      <polygon points={getSourcePolygonSvgPoints(selectedMapPiece, selectedAtlasPageAsset)} />
                    </clipPath>
                  </defs>
                  <image
                    clipPath={`url(#${selectedPiecePreviewClipId})`}
                    height={selectedAtlasPageAsset.height}
                    href={selectedAtlasPageAsset.signedUrl}
                    preserveAspectRatio="xMidYMid meet"
                    width={selectedAtlasPageAsset.width}
                  />
                </svg>
                <figcaption>{selectedMapPieceDisplayLabel}</figcaption>
              </figure>
            ) : (
              <p className="sanborn-atlas-empty">Select a saved piece with an available signed source image.</p>
            )}
            <dl className="sanborn-piece-placement-summary">
              <dt>Page</dt>
              <dd>{selectedAtlasPage?.displayLabel || selectedAtlasPage?.sheetNumber || "Unavailable"}</dd>
              <dt>Piece type</dt>
              <dd>{selectedMapPiece?.pieceType.replaceAll("_", " ") ?? "Unavailable"}</dd>
              <dt>Block</dt>
              <dd>{selectedMapPiece?.blockNumberText ?? "Unavailable"}</dd>
              <dt>Status</dt>
              <dd>{selectedMapPiecePlacementLabel}</dd>
              <dt>Review</dt>
              <dd>{selectedMapPieceGeoreference?.reviewStatus ?? selectedMapPiece?.reviewStatus ?? "unknown"}</dd>
              <dt>Visibility</dt>
              <dd>{selectedMapPieceGeoreference?.isVisible ? "Visible" : "Hidden"}</dd>
            </dl>
            <div className="sanborn-piece-placement-list" aria-label="Map pieces on selected page">
              {selectedAtlasPagePieces.length > 0 ? selectedAtlasPagePieces.map((piece) => {
                const placement = mapPieceGeoreferences.find((candidate) => candidate.pieceId === piece.pieceId) ?? null;
                const label = getMapPiecePlacementLabel(placement);

                return (
                  <button
                    className={`sanborn-piece-placement-list__item ${piece.pieceId === selectedMapPiece?.pieceId ? "is-selected" : ""} ${getMapPiecePlacementClass(placement)}`}
                    key={piece.pieceId}
                    onClick={() => {
                      setSelectedMapPieceId(piece.pieceId);
                      setPiecePlacementAnchorId("");
                      if (selectedAtlasPage?.sanbornSheetAssetId) {
                        setSelectedAssetId(selectedAtlasPage.sanbornSheetAssetId);
                      }
                    }}
                    type="button"
                  >
                    <strong>{getMapPieceDisplayLabel(piece)}</strong>
                    <span>{piece.pieceType.replaceAll("_", " ")}</span>
                    <span>{label}</span>
                    <span>{placement?.isVisible ? "Visible" : "Hidden"} | {placement?.reviewStatus ?? piece.reviewStatus}</span>
                  </button>
                );
              }) : <p className="sanborn-atlas-empty">No saved pieces are available on this atlas page.</p>}
            </div>
          </div>
        </details>
        <details className="minimal-sanborn-gps__diagnostics">
          <summary>Map diagnostics</summary>
          <dl>
            <dt>Current latitude</dt>
            <dd>{formatCoordinate(mapCenter.latitude)}</dd>
            <dt>Current longitude</dt>
            <dd>{formatCoordinate(mapCenter.longitude)}</dd>
            <dt>Current zoom</dt>
            <dd>{modernMapZoom}</dd>
            <dt>Requested geocode center</dt>
            <dd>{requestedGeocodeCenter ? `${formatCoordinate(requestedGeocodeCenter.latitude)}, ${formatCoordinate(requestedGeocodeCenter.longitude)}` : "none"}</dd>
            <dt>Actual Leaflet center</dt>
            <dd>{tileRuntimeDebug?.center ? `${formatCoordinate(tileRuntimeDebug.center.latitude)}, ${formatCoordinate(tileRuntimeDebug.center.longitude)}` : "unknown"}</dd>
            <dt>Last view source</dt>
            <dd>{lastViewChangeSource}</dd>
            <dt>Last center path</dt>
            <dd>{lastCenterChangePath}</dd>
            <dt>FitBounds active</dt>
            <dd>{fitBoundsActive ? "yes" : "no"}</dd>
            <dt>Stale view blocked</dt>
            <dd>{staleViewBlocked ? "yes" : "no"}</dd>
            <dt>Overlay render mode</dt>
            <dd>{overlayRenderMode}</dd>
            <dt>Selected basemap</dt>
            <dd>{selectedBasemap.label}</dd>
            <dt>TileLayer mounted</dt>
            <dd>{modernTileDiagnostics.tileLayerMounted ? "yes" : "no"}</dd>
            <dt>Successful tiles</dt>
            <dd>{modernTileDiagnostics.successfulTiles}</dd>
            <dt>Failed tiles</dt>
            <dd>{modernTileDiagnostics.failedTiles}</dd>
            <dt>Latest failed host</dt>
            <dd>{modernTileDiagnostics.latestFailedTileHost ?? "none"}</dd>
            <dt>.leaflet-tile count</dt>
            <dd>{tileRuntimeDebug?.tileCount ?? 0}</dd>
            <dt>Complete tile images</dt>
            <dd>{tileRuntimeDebug?.completeTileCount ?? 0}</dd>
            <dt>Visible loaded tiles</dt>
            <dd>{tileRuntimeDebug?.visibleLoadedTileCount ?? 0}</dd>
            <dt>Loaded natural sizes</dt>
            <dd>{tileRuntimeDebug && tileRuntimeDebug.loadedTileNaturalSizes.length > 0 ? tileRuntimeDebug.loadedTileNaturalSizes.map((size) => `${size.naturalWidth}x${size.naturalHeight}`).join(", ") : "none"}</dd>
            <dt>First tile host</dt>
            <dd>{tileRuntimeDebug?.firstTile?.srcHost ?? "none"}</dd>
            <dt>First tile style</dt>
            <dd>
              {tileRuntimeDebug?.firstTile
                ? `display=${tileRuntimeDebug.firstTile.display}; visibility=${tileRuntimeDebug.firstTile.visibility}; opacity=${tileRuntimeDebug.firstTile.opacity}; z=${tileRuntimeDebug.firstTile.zIndex}; transform=${tileRuntimeDebug.firstTile.transform}; pane=${tileRuntimeDebug.firstTile.parentPane}`
                : "none"}
            </dd>
            <dt>Tile pane rect</dt>
            <dd>{tileRuntimeDebug?.tilePaneRect ? `${tileRuntimeDebug.tilePaneRect.width} x ${tileRuntimeDebug.tilePaneRect.height} @ ${tileRuntimeDebug.tilePaneRect.left},${tileRuntimeDebug.tilePaneRect.top}` : "none"}</dd>
            <dt>Tile pane children</dt>
            <dd>{tileRuntimeDebug?.tilePaneChildCount ?? 0}</dd>
            <dt>Map container</dt>
            <dd>{tileRuntimeDebug?.mapContainerRect ? `${tileRuntimeDebug.mapContainerRect.width} x ${tileRuntimeDebug.mapContainerRect.height} @ ${tileRuntimeDebug.mapContainerRect.left},${tileRuntimeDebug.mapContainerRect.top}` : `${mapContainerSize.width} x ${mapContainerSize.height}`}</dd>
            <dt>Plain map test</dt>
            <dd>{plainMapTestMode ? "enabled" : "disabled"}</dd>
            <dt>Town package ID</dt>
            <dd>{initialData.activeTownPackage?.id ?? "none"}</dd>
            <dt>Town package center</dt>
            <dd>{activeTownCenter}</dd>
            <dt>Location source</dt>
            <dd>{resolvedLocationSource}</dd>
            <dt>Supabase</dt>
            <dd>{initialData.dataSource === "supabase" ? "connected" : "setup required"}</dd>
            <dt>Uploaded assets</dt>
            <dd>{sheets.length}</dd>
          </dl>
          <div className="minimal-sanborn-gps__diagnostics-actions">
            <button className="sanborn-button" disabled={georeferenceDraft.selectedBasemap !== defaultBasemapKey} onClick={() => setGeoreferenceDraft({ ...georeferenceDraft, selectedBasemap: "esri_world_street" })} type="button">
              Switch to Alternate streets
            </button>
            <button className="sanborn-button" disabled={georeferenceDraft.selectedBasemap === defaultBasemapKey} onClick={() => setGeoreferenceDraft({ ...georeferenceDraft, selectedBasemap: defaultBasemapKey })} type="button">
              Use OpenStreetMap
            </button>
          </div>
        </details>
          </>
        ) : (
          <div className="sanborn-atlas-workflow">
            <SanbornAtlasNavigator
              assets={sheets}
              fallbackYear={initialData.activeMapYear}
              inventory={atlasInventory}
              readOnly={atlasReadOnly}
              selectedAtlasId={selectedAtlasId}
              selectedPageId={selectedAtlasPage?.pageId ?? selectedAtlasPageId}
              sourceOptions={initialData.sourceOptions}
              workflowStep={atlasWorkflowStep}
              pieceInventoryBlocked={pieceInventoryBlocked}
              saveActionsDisabled={atlasSaveActionsDisabled}
              onAssignAsset={assignAssetToAtlas}
              onPatchPage={patchAtlasPage}
              onReorderPage={reorderAtlasPage}
              onSaveAtlas={(draft) => void saveAtlas(draft)}
              onSavePages={() => void saveAtlasPages()}
              onSavePagesAndContinue={() => void saveAtlasPages({ continueToPieceInventory: true })}
              onSelectAtlas={(atlasId) => {
                setSelectedAtlasId(atlasId);
                const nextPage = atlasInventory.pages
                  .filter((page) => page.atlasId === atlasId)
                  .sort((left, right) => left.pageSequence - right.pageSequence)[0];
                setSelectedAtlasPageId(nextPage?.pageId ?? "");
                if (nextPage?.sanbornSheetAssetId) {
                  setSelectedAssetId(nextPage.sanbornSheetAssetId);
                }
                setSelectedMapPieceId("");
              }}
              onSelectPage={(pageId) => {
                const nextPage = atlasInventory.pages.find((page) => page.pageId === pageId);
                setSelectedAtlasPageId(pageId);
                if (nextPage?.sanbornSheetAssetId) {
                  setSelectedAssetId(nextPage.sanbornSheetAssetId);
                }
                changeAtlasWorkflowStep("piece_inventory");
                setSelectedMapPieceId("");
              }}
              onWorkflowStepChange={(step) => {
                changeAtlasWorkflowStep(step);
              }}
            />
            <SanbornPageWorkbench
              asset={selectedAtlasPageAsset}
              page={selectedAtlasPage}
              pieces={selectedAtlasPagePieces}
              readOnly={atlasReadOnly || !selectedAtlasPage || !selectedAtlasPage.isPersisted}
              savePagesAndContinueDisabled={atlasReadOnly || atlasSaveActionsDisabled}
              selectedPieceId={selectedMapPieceId}
              onDeletePiece={deleteMapPiece}
              onPatchPiece={patchMapPiece}
              onPiecesChange={replaceSelectedPagePieces}
              onReorderPiece={reorderMapPiece}
              onSavePieces={() => void saveMapPieces()}
              onSavePagesAndContinue={() => void saveAtlasPages({ continueToPieceInventory: true })}
              onSelectPiece={setSelectedMapPieceId}
            />
          </div>
        )}
      </main>
    </section>
  );

  return (
    <section className="historical-map-studio">
      <header className="map-studio-topbar">
        <div>
          <p className="panel__eyebrow">Historical Map Studio</p>
          <h2>{initialData.activeTownPackage ? `${initialData.activeTownPackage?.name} ${initialData.activeMapYear}` : "No town package"}</h2>
          <p className="small-muted">{initialData.activeTownPackage ? `${initialData.activeTownPackage?.region} | ${initialData.activeTownPackage?.packageId}` : initialData.warningMessage}</p>
        </div>
        <div className="map-studio-topbar__metrics">
          <span className="tag state-ready">Sheets {sheets.length}</span>
          <span className={`tag state-${missingSheetNumbers.length > 0 ? "guarded" : "ready"}`}>Missing {missingSheetNumbers.length}</span>
          <span className={`tag state-${isDirty ? "reviewing" : "ready"}`}>{isDirty ? "Unsaved changes" : "Saved"}</span>
          <span className={`tag state-${saveStatus === "error" ? "blocked" : saveStatus === "saving" ? "reviewing" : "ready"}`}>{saveStatus}</span>
          <span className="tag state-guarded">Map {modernMapZoom}z</span>
          <span className="tag state-ready">Data source: {initialData.dataSource === "supabase" ? "Supabase" : "Setup required"}</span>
          <span className="tag state-reviewing">Workspace: {studioMode === "stitching" ? "Optional Prep Canvas" : studioMode === "georeferencing" ? "Georeference Sheets" : "Presentation Overlay"}</span>
        </div>
        <div className="map-studio-actions">
          <button className="sanborn-button sanborn-button--primary" disabled={!isDirty || saveStatus === "saving"} onClick={() => (studioMode === "stitching" ? void saveLayout("manual") : void saveSheetGeoreferences("manual"))} type="button">
            {studioMode === "stitching" ? "Save prep layout" : "Save geographic layout"}
          </button>
          <button className="sanborn-button" disabled={studioMode === "stitching" ? history.past.length === 0 : geoHistory.past.length === 0} onClick={undo} type="button">Undo</button>
          <button className="sanborn-button" disabled={studioMode === "stitching" ? history.future.length === 0 : geoHistory.future.length === 0} onClick={redo} type="button">Redo</button>
          <button className="sanborn-button" onClick={fitAllSheets} type="button">Fit all sheets</button>
          <button className="sanborn-button" onClick={resetView} type="button">Reset view</button>
          <button className="sanborn-button" onClick={() => setLeftPanelCollapsed((value) => !value)} title="Toggle sheet panel ([)" type="button">Sheets</button>
          <button className="sanborn-button" onClick={() => setRightPanelCollapsed((value) => !value)} title="Toggle inspector (])" type="button">Inspector</button>
          <button className="sanborn-button" onClick={copyStitchingLayoutIntoGeoreferencing} title="Optional: initialize geographic placements from the prep canvas" type="button">Copy prep to map</button>
          <button className="sanborn-button" onClick={() => uploadInputRef.current?.click()} type="button">Add sheets</button>
          <input accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden multiple onChange={(event) => void uploadSheets(event.target.files)} ref={uploadInputRef} type="file" />
        </div>
        <div className="map-studio-mode-switch" aria-label="Historical Map Studio modes">
          {[
            ["georeferencing", "Georeference Sheets"],
            ["modern_overlay", "Presentation Overlay"],
            ["stitching", "Optional Prep Canvas"],
          ].map(([mode, label]) => (
            <button className={`sanborn-button${studioMode === mode ? " sanborn-button--primary" : ""}`} key={mode} onClick={() => setStudioMode(mode as StudioWorkspaceMode)} type="button">
              {label}
            </button>
          ))}
          {studioMode !== "stitching" ? (
            <>
              <button className="sanborn-button" onClick={calculateAlignment} type="button">Calculate alignment</button>
              <button className="sanborn-button sanborn-button--primary" onClick={() => void saveGeoreference()} type="button">Save georeference</button>
            </>
          ) : null}
        </div>
      </header>

      {initialData.warningMessage ? <p className="map-studio-toast">{initialData.warningMessage}</p> : null}
      {saveMessage ? <p className={saveStatus === "error" ? "map-studio-toast is-error" : "map-studio-toast"}>{saveMessage} Last saved: {lastSavedAt ? formatDate(lastSavedAt) : "Not saved yet"}.</p> : null}

      <div className={`map-studio-layout${leftPanelCollapsed ? " is-left-collapsed" : ""}${rightPanelCollapsed ? " is-right-collapsed" : ""}`}>
        <aside className="map-studio-sidebar" hidden={leftPanelCollapsed}>
          <label>Town package<select value={initialData.activeTownPackage?.id ?? ""} onChange={(event) => router.push(`/community/historical-map-studio?town=${event.target.value}&year=${initialData.activeMapYear ?? ""}`)}>{initialData.townPackages.map((town) => <option key={town.id} value={town.id}>{town.name} {town.year}</option>)}</select></label>
          <label>Map year<select value={initialData.activeMapYear ?? ""} onChange={(event) => router.push(`/community/historical-map-studio?town=${initialData.activeTownPackage?.id ?? ""}&year=${event.target.value}`)}>{initialData.availableMapYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          <label>Search sheets<input onChange={(event) => setSearch(event.target.value)} placeholder="Sheet, filename, status..." value={search} /></label>
          <div className="map-studio-sidebar__summary">
            <span>Uploaded: {sheets.length}</span>
            <span>Missing: {missingSheetNumbers.length ? missingSheetNumbers.join(", ") : "None"}</span>
            <span>Duplicates: {duplicateSheetNumbers.length ? duplicateSheetNumbers.join(", ") : "None"}</span>
            <span>Hidden: {hiddenPlacements}</span>
            <span>Locked: {lockedPlacements}</span>
            <span>Geo visible: {visibleGeographicSheets}</span>
            <span>Geo unplaced: {unplacedGeographicSheets}</span>
          </div>
          {studioMode !== "stitching" ? (
            <div className="map-studio-georef-controls">
              <strong>Georeferencing workspace</strong>
              <div className="map-studio-mode-toggle" role="group" aria-label="Georeferencing interaction mode">
                <button className={`sanborn-button${geoEditMode === "pan_modern_map" ? " sanborn-button--primary" : ""}`} onClick={() => {
                  setGeoEditMode("pan_modern_map");
                  commitGeographicMapSettings({ editMode: "pan_modern_map" }, false);
                }} type="button">Pan Map</button>
                <button className={`sanborn-button${geoEditMode === "edit_historical_sheets" ? " sanborn-button--primary" : ""}`} onClick={() => {
                  setGeoEditMode("edit_historical_sheets");
                  commitGeographicMapSettings({ editMode: "edit_historical_sheets" }, false);
                }} type="button">Edit Sheet</button>
              </div>
              <label>Movement scope<select value={movementScope} onChange={(event) => {
                const nextScope = event.target.value as MovementScope;
                setMovementScope(nextScope);
                commitGeographicMapSettings({ movementScope: nextScope }, false);
              }}><option value="selected_sheet">Selected sheet</option><option value="entire_assembly">Entire historical assembly</option></select></label>
              <label>Global historical opacity<input max="1" min="0.1" step="0.05" type="range" value={globalHistoricalOpacity} onChange={(event) => {
                const nextOpacity = clampHistoricalOpacity(Number(event.target.value));
                setGlobalHistoricalOpacity(nextOpacity);
                commitGeographicMapSettings({ globalHistoricalOpacity: nextOpacity }, false);
              }} /></label>
              <label><input checked={showHistoricalLayers} onChange={(event) => setShowHistoricalLayers(event.target.checked)} type="checkbox" /> Historical layers visible</label>
              <label><input checked={showSheetLabels} onChange={(event) => setShowSheetLabels(event.target.checked)} type="checkbox" /> Sheet labels and boundaries</label>
              <label>Comparison view<select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value as typeof comparisonMode)}><option value="both">Both layers</option><option value="modern_only">Modern only</option><option value="historical_only">Historical only</option></select></label>
              <p className="small-muted">Rendering: four-corner projective sheet layers over Leaflet. GIS export remains deferred.</p>
            </div>
          ) : null}
          <div className="map-studio-filter-strip" aria-label="Sheet filters">
            {[
              ["all", "All"],
              ["unplaced", "Unplaced"],
              ["draft", "Draft"],
              ["aligned", "Aligned"],
              ["reviewed", "Reviewed"],
              ["hidden", "Hidden"],
              ["locked", "Locked"],
              ["warnings", "Warnings"],
            ].map(([value, label]) => (
              <button className={`sanborn-button${sheetFilter === value ? " sanborn-button--primary" : ""}`} key={value} onClick={() => setSheetFilter(value as typeof sheetFilter)} type="button">
                {label}
              </button>
            ))}
          </div>
          {studioMode !== "stitching" ? (
            <div className="map-studio-georef-controls">
              <label>Georeference target<select value={georeferenceDraft.targetType} onChange={(event) => setGeoreferenceTarget(event.target.value as "sheet" | "workspace")}><option value="sheet">Selected sheet</option><option value="workspace">Full stitched workspace</option></select></label>
              <label>Modern basemap<select value={georeferenceDraft.selectedBasemap} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, selectedBasemap: event.target.value })}>{basemaps.map((basemap) => <option key={basemap.key} value={basemap.key}>{basemap.label}</option>)}</select></label>
              <label>Overlay opacity<input max="1" min="0" step="0.05" type="range" value={georeferenceDraft.overlayOpacity} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, overlayOpacity: Number(event.target.value) })} /></label>
              <label><input checked={georeferenceDraft.overlayVisible} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, overlayVisible: event.target.checked })} type="checkbox" /> Historical overlay visible</label>
              <label><input checked={georeferenceDraft.showControlPoints} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, showControlPoints: event.target.checked })} type="checkbox" /> Show control points</label>
              <label><input checked={georeferenceDraft.showSheetBoundaries} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, showSheetBoundaries: event.target.checked })} type="checkbox" /> Show sheet boundaries</label>
              <button className="sanborn-button" onClick={() => setHistoricalClickMode("adding_point")} type="button">Add control point</button>
              <button className="sanborn-button" onClick={clearDraftPoints} type="button">Clear draft points</button>
              <button className="sanborn-button" onClick={resetGeographicAlignment} type="button">Reset geographic alignment</button>
              <button className="sanborn-button" onClick={() => setFitOverlayRequest((current) => current + 1)} type="button">Fit overlay bounds</button>
              <p className="small-muted">Manual placement is map-first. Control points can refine the four-corner warp but do not block visual alignment.</p>
            </div>
          ) : null}
          <div className="map-studio-sheet-list">
            {filteredSheets.length === 0 ? <p className="small-muted">No sheets match the current search.</p> : null}
            {filteredSheets.map((sheet) => {
              const placement = placementByAssetId.get(sheet.assetId);
              const geoSheet = sheetGeoreferenceByAssetId.get(sheet.assetId);
              const isUnplaced = !geoSheet || geoSheet.placementStatus === "unplaced" || geoSheet.georeferenceStatus === "not_started" || geoSheet.isVisible === false;
              const warning = duplicateSheetNumbers.includes(sheet.sheetNumber ?? -1) || sheet.signedUrlError;
              return (
                <div
                  className={`map-studio-sheet-row${selectedAssetId === sheet.assetId ? " is-selected" : ""}`}
                  key={sheet.assetId}
                  onClick={() => selectAndCenter(sheet.assetId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectAndCenter(sheet.assetId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {sheet.signedUrl ? <img alt="" src={sheet.signedUrl} /> : <span className="map-studio-thumb-fallback">No image</span>}
                  <span className="map-studio-sheet-row__main"><strong>{sheet.sheetNumber ?? "?"}</strong><small title={sheet.originalFilename}>{sheet.originalFilename}</small></span>
                  <span className="map-studio-sheet-row__icons" aria-label="Sheet status">
                    <span title={warning ? "Warning" : "No warning"}>{warning ? "!" : "ok"}</span>
                    <span title={geoSheet?.isVisible === false || placement?.isVisible === false ? "Hidden" : "Visible"}>{geoSheet?.isVisible === false || placement?.isVisible === false ? "hide" : "show"}</span>
                    <span title={geoSheet?.isLocked || placement?.isLocked ? "Locked" : "Unlocked"}>{geoSheet?.isLocked || placement?.isLocked ? "lock" : "open"}</span>
                    <span title={geoSheet?.georeferenceStatus ?? "not_started"}>{geoSheet?.placementStatus ?? "unplaced"}</span>
                  </span>
                  {isUnplaced ? (
                    <span className="map-studio-sheet-row__actions">
                      <button className="sanborn-button" onClick={(event) => {
                        event.stopPropagation();
                        addSheetToMap(sheet.assetId);
                      }} type="button">Center</button>
                      <button className="sanborn-button" onClick={(event) => {
                        event.stopPropagation();
                        setPlacementAnchorAssetId(sheet.assetId);
                        setStudioMode("georeferencing");
                        setGeoEditMode("pan_modern_map");
                      }} type="button">Click</button>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {uploadStatuses.length > 0 ? (
            <div className="map-studio-upload-status">
              {uploadStatuses.map((status) => <p key={`${status.filename}-${status.status}`}>{status.filename}: {status.message}</p>)}
            </div>
          ) : null}
        </aside>

        <main className={`map-studio-canvas-wrap mode-${studioMode}`} ref={containerRef}>
          {studioMode === "stitching" ? (
            <Stage
              draggable={isStagePanning}
              height={stageSize.height}
              onDragEnd={(event) => {
                if (isStagePanning) {
                  commitViewport({ ...present.viewport, x: event.target.x(), y: event.target.y() }, false);
                }
                setIsStagePanning(false);
                const stage = event.target.getStage();
                stage?.draggable(false);
                const container = stage?.container();
                if (container) container.style.cursor = "default";
              }}
              onMouseMove={() => {
                const pointer = stageRef.current?.getPointerPosition();
                if (pointer) setCanvasCoordinates({ x: Math.round((pointer.x - present.viewport.x) / present.viewport.scale), y: Math.round((pointer.y - present.viewport.y) / present.viewport.scale) });
              }}
              onPointerDown={(event) => {
                const stage = event.target.getStage();
                const targetIsStage = event.target === stage;
                const pointerButton = event.evt.button;

                if (shouldPanStudioStage({ isSpacePanning, pointerButton, targetIsStage })) {
                  event.evt.preventDefault();
                  setIsStagePanning(true);
                  stage?.draggable(true);
                  const container = stage?.container();
                  if (container) container.style.cursor = "grabbing";
                  return;
                }

                if (shouldClearStudioSelection({ targetIsStage, isStagePanning: false, pointerButton })) {
                  setSelectedAssetId("");
                }
              }}
              onPointerLeave={(event) => {
                if (isStagePanning) {
                  setIsStagePanning(false);
                  event.target.getStage()?.draggable(false);
                }
              }}
              onPointerUp={(event) => {
                if (isStagePanning) {
                  setIsStagePanning(false);
                  event.target.getStage()?.draggable(false);
                  const container = event.target.getStage()?.container();
                  if (container) container.style.cursor = "default";
                }
              }}
              onWheel={handleWheel}
              ref={stageRef}
              scaleX={present.viewport.scale}
              scaleY={present.viewport.scale}
              width={stageSize.width}
              x={present.viewport.x}
              y={present.viewport.y}
            >
              <Layer listening={false}>
                <Rect x={-5000} y={-5000} width={10000} height={10000} fill="#15100d" listening={false} />
                {showGrid
                  ? Array.from({ length: 81 }, (_, index) => index * 100 - 4000).flatMap((position) => [
                      <Line key={`v-${position}`} points={[position, -4000, position, 4000]} stroke="rgba(226,190,126,0.08)" strokeWidth={1 / present.viewport.scale} listening={false} />,
                      <Line key={`h-${position}`} points={[-4000, position, 4000, position]} stroke="rgba(226,190,126,0.08)" strokeWidth={1 / present.viewport.scale} listening={false} />,
                    ])
                  : null}
              </Layer>
              <Layer>
                {sortedPlacements.map((placement) => {
                  const asset = sheets.find((sheet) => sheet.assetId === placement.assetId);
                  if (!asset) return null;
                  return (
                    <StudioSheetNode
                      asset={asset}
                      isSelected={selectedAssetId === asset.assetId}
                      isDraggable={canDragStudioPlacement(placement)}
                      key={asset.assetId}
                      onCommit={(patch) => commitPlacement(asset.assetId, patch)}
                      onNode={(node) => {
                        if (node) sheetNodeRefs.current.set(asset.assetId, node);
                        else sheetNodeRefs.current.delete(asset.assetId);
                      }}
                      onRefreshSignedUrl={() => void refreshSignedUrl(asset.assetId)}
                      onSelect={() => setSelectedAssetId(asset.assetId)}
                      placement={placement}
                    />
                  );
                })}
              </Layer>
              <Layer>
                <Transformer
                  ref={transformerRef}
                  borderStroke="#e2be7e"
                  borderStrokeWidth={Math.max(1, 2 / present.viewport.scale)}
                  anchorFill="#f6e7cb"
                  anchorSize={Math.max(7, 12 / present.viewport.scale)}
                  anchorStroke="#1a120d"
                  anchorStrokeWidth={Math.max(1, 1.5 / present.viewport.scale)}
                  boundBoxFunc={(oldBox, newBox) => {
                    const renderedWidth = Math.abs(newBox.width) * present.viewport.scale;
                    const renderedHeight = Math.abs(newBox.height) * present.viewport.scale;

                    if (renderedWidth < minimumRenderedSheetSize || renderedHeight < minimumRenderedSheetSize) {
                      return oldBox;
                    }

                    return newBox;
                  }}
                  enabledAnchors={[...studioTransformerAnchors]}
                  flipEnabled={false}
                  keepRatio={false}
                  rotateAnchorOffset={Math.max(24, 44 / present.viewport.scale)}
                  rotateEnabled
                />
              </Layer>
            </Stage>
          ) : studioMode === "georeferencing" ? (
            <div className="map-studio-georef-split">
              <div className="map-studio-historical-point-pane">
                <div className="map-studio-georef-pane__header">
                  <strong>{historicalReference ? historicalReference.label : "No historical image available"}</strong>
                  <span className="small-muted">{historicalClickMode === "adding_point" ? "Click the sheet to place the historical point." : "Select Add control point to place a paired point."}</span>
                </div>
                {historicalReference ? (
                  <div className="map-studio-historical-image-frame">
                    <img alt={historicalReference.label} onClick={historicalClickMode === "adding_point" ? addHistoricalControlPoint : undefined} src={historicalReference.signedUrl} />
                    {georeferenceDraft.controlPoints
                      .filter((point) => typeof point.imageX === "number" && typeof point.imageY === "number")
                      .map((point) => {
                        const left = (((point.imageX ?? 0) - historicalReference.offsetX) / historicalReference.width) * 100;
                        const top = (((point.imageY ?? 0) - historicalReference.offsetY) / historicalReference.height) * 100;

                        return (
                          <button
                            className={`map-studio-image-point${point.controlPointId === georeferenceDraft.selectedControlPointId ? " is-selected" : ""}`}
                            key={point.controlPointId}
                            onClick={() => setGeoreferenceDraft({ ...georeferenceDraft, selectedControlPointId: point.controlPointId })}
                            style={{
                              left: `${left}%`,
                              top: `${top}%`,
                            }}
                            type="button"
                          >
                            {point.label}
                          </button>
                        );
                      })}
                  </div>
                ) : (
                  <div className="sanborn-empty-state"><strong>No signed image available.</strong><p className="small-muted">Refresh signed URLs, select a sheet, or place at least one visible sheet in the workspace.</p></div>
                )}
              </div>
              <div className="map-studio-modern-map-pane">
                <HistoricalMapLeaflet
                  basemapKey={georeferenceDraft.selectedBasemap}
                  bounds={sheetAssemblyBounds ?? georeferenceDraft.bounds}
                  center={[mapCenter.latitude, mapCenter.longitude]}
                  controlPoints={georeferenceDraft.controlPoints}
                  corners={georeferenceDraft.corners}
                  fitBoundsRequest={fitOverlayRequest}
                  globalHistoricalOpacity={globalHistoricalOpacity}
                  imageUrl={overlayImageUrl}
                  modernLayerVisible={comparisonMode !== "historical_only"}
                  onCornerDrag={moveCorner}
                  onCursorMove={(latitude, longitude) => setMapCursor({ latitude, longitude })}
                  onMapClick={handleModernMapClick}
                  onMapViewChange={(center, zoom) => {
                    setMapCenter({ latitude: center[0], longitude: center[1] });
                    setModernMapZoom(zoom);
                    commitGeographicMapSettings({ center: { latitude: center[0], longitude: center[1] }, zoom }, false);
                  }}
                  onMarkerDrag={(controlPointId, latitude, longitude) => updateControlPoint(controlPointId, { latitude, longitude })}
                  onRefreshSheetSignedUrl={(assetId) => void refreshSignedUrl(assetId)}
                  onSelectSheet={(assetId) => setSelectedAssetId(assetId)}
                  onSheetImageStateChange={(state) => setSheetImageStates((current) => ({ ...current, [state.assetId]: state }))}
                  onSheetTransformCommit={(assetId, patch) => commitSheetGeoreference(assetId, patch)}
                  overlayOpacity={georeferenceDraft.overlayOpacity}
                  overlayVisible={georeferenceDraft.overlayVisible}
                  selectedControlPointId={georeferenceDraft.selectedControlPointId}
                  selectedSheetAssetId={selectedAssetId}
                  sheetEditMode={geoEditMode}
                  sheetLayers={historicalSheetLayers}
                  showSheetLabels={showSheetLabels}
                  showControlPoints={georeferenceDraft.showControlPoints}
                  showSheetBoundaries={georeferenceDraft.showSheetBoundaries}
                  zoom={modernMapZoom}
                />
              </div>
            </div>
          ) : (
            <div className="map-studio-overlay-mode">
              <button className="sanborn-button sanborn-button--primary map-studio-edit-alignment" onClick={() => {
                setStudioMode("georeferencing");
                setGeoEditMode("edit_historical_sheets");
              }} type="button">Edit alignment</button>
              <HistoricalMapLeaflet
                basemapKey={georeferenceDraft.selectedBasemap}
                bounds={sheetAssemblyBounds ?? georeferenceDraft.bounds}
                center={[mapCenter.latitude, mapCenter.longitude]}
                controlPoints={georeferenceDraft.controlPoints}
                corners={georeferenceDraft.corners}
                fitBoundsRequest={fitOverlayRequest}
                globalHistoricalOpacity={globalHistoricalOpacity}
                imageUrl={overlayImageUrl}
                modernLayerVisible={comparisonMode !== "historical_only"}
                onCornerDrag={moveCorner}
                onCursorMove={(latitude, longitude) => setMapCursor({ latitude, longitude })}
                onMapClick={handleModernMapClick}
                onMapViewChange={(center, zoom) => {
                  setMapCenter({ latitude: center[0], longitude: center[1] });
                  setModernMapZoom(zoom);
                  commitGeographicMapSettings({ center: { latitude: center[0], longitude: center[1] }, zoom }, false);
                }}
                onMarkerDrag={(controlPointId, latitude, longitude) => updateControlPoint(controlPointId, { latitude, longitude })}
                onRefreshSheetSignedUrl={(assetId) => void refreshSignedUrl(assetId)}
                onSelectSheet={(assetId) => setSelectedAssetId(assetId)}
                onSheetImageStateChange={(state) => setSheetImageStates((current) => ({ ...current, [state.assetId]: state }))}
                overlayOpacity={georeferenceDraft.overlayOpacity}
                overlayVisible={georeferenceDraft.overlayVisible}
                selectedControlPointId={georeferenceDraft.selectedControlPointId}
                selectedSheetAssetId={selectedAssetId}
                sheetEditMode="preview"
                sheetLayers={historicalSheetLayers}
                showSheetLabels={showSheetLabels}
                showControlPoints={georeferenceDraft.showControlPoints}
                showSheetBoundaries={georeferenceDraft.showSheetBoundaries}
                zoom={modernMapZoom}
              />
            </div>
          )}
        </main>

        <aside className="map-studio-inspector" hidden={rightPanelCollapsed}>
          {!selectedAsset || !activeTransform ? (
            <div className="sanborn-empty-state"><strong>No sheet selected.</strong><p className="small-muted">Select a sheet from the gallery or canvas.</p></div>
          ) : (
            <>
              <h3>Sheet inspector</h3>
              <div className="map-studio-inspector-primary">
                <div>
                  <strong>Sheet {selectedAsset.sheetNumber ?? "unknown"}</strong>
                  <p className="small-muted">{selectedAsset.originalFilename}</p>
                </div>
                <div className="map-studio-mode-toggle map-studio-mode-toggle--compact" role="group" aria-label="Selected sheet interaction mode">
                  <button className={`sanborn-button${geoEditMode === "pan_modern_map" ? " sanborn-button--primary" : ""}`} onClick={() => {
                    setGeoEditMode("pan_modern_map");
                    commitGeographicMapSettings({ editMode: "pan_modern_map" }, false);
                  }} type="button">Pan Map</button>
                  <button className={`sanborn-button${geoEditMode === "edit_historical_sheets" ? " sanborn-button--primary" : ""}`} onClick={() => {
                    setGeoEditMode("edit_historical_sheets");
                    commitGeographicMapSettings({ editMode: "edit_historical_sheets" }, false);
                  }} type="button">Edit Sheet</button>
                </div>
                <div className="map-studio-inspector__grid">
                  <label>Opacity<input disabled={activeTransform.isLocked} max="1" min="0.1" step="0.05" type="number" value={Number(activeTransform.opacity.toFixed(2))} onChange={(event) => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { opacity: Number(event.target.value) }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { opacity: Number(event.target.value) }) : undefined} /></label>
                  <label>Locked<input type="checkbox" checked={activeTransform.isLocked} onChange={(event) => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { isLocked: event.target.checked }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { isLocked: event.target.checked }) : undefined} /></label>
                </div>
                <div className="map-studio-layer-actions">
                  <button className="sanborn-button" onClick={resetSelectedPlacementToTownCenter} type="button">Reset to town center</button>
                  <button className="sanborn-button" onClick={fitSelectedSheet} type="button">Fit selected sheet</button>
                </div>
                <div className={`map-studio-image-diagnostics${selectedImageState?.state === "failed" || selectedAsset.signedUrlError ? " is-error" : ""}`}>
                  <span>Signed URL: {selectedAsset.signedUrlError ? "failed" : selectedAsset.signedUrl ? "ready" : "missing"}</span>
                  <span>Image: {selectedImageState?.state ?? "not loaded yet"}</span>
                  <span>Interaction: {selectedCanEditOnMap ? "editable" : geoEditMode === "pan_modern_map" ? "pan mode" : "locked or hidden"}</span>
                  <span>Natural size: {selectedImageState?.naturalWidth && selectedImageState.naturalHeight ? `${selectedImageState.naturalWidth} x ${selectedImageState.naturalHeight}` : "unknown"}</span>
                  <span>Transform: {selectedImageState?.transformValid === false ? "rectangular fallback" : "projective"}</span>
                  <span>Asset ID: {selectedAsset.assetId}</span>
                </div>
                {selectedHasInvalidZeroPlacement ? (
                  <p className="map-studio-toast is-error">This placement appears to be an invalid legacy 0,0 placement. Use Reset to town center before saving.</p>
                ) : null}
              </div>
              <div className="map-studio-inspector__grid">
                <label>Sheet number<input value={metadataDraft.sheetNumber} onChange={(event) => setMetadataDraft({ ...metadataDraft, sheetNumber: event.target.value })} /></label>
                <label>Source record<select value={metadataDraft.sourceRecordId} onChange={(event) => {
                  const source = initialData.sourceOptions.find((option) => option.sourceRecordId === event.target.value);
                  setMetadataDraft({ ...metadataDraft, sourceRecordId: event.target.value, sourceUrl: source?.sourceUrl ?? metadataDraft.sourceUrl, archiveName: source?.archiveName ?? metadataDraft.archiveName, rightsNote: source?.rightsNote ?? metadataDraft.rightsNote });
                }}><option value="">Source unavailable</option>{initialData.sourceOptions.map((source) => <option key={source.sourceRecordId} value={source.sourceRecordId}>{source.sourceId} - {source.title}</option>)}</select></label>
                <label>Source URL<input value={metadataDraft.sourceUrl} onChange={(event) => setMetadataDraft({ ...metadataDraft, sourceUrl: event.target.value })} /></label>
                <label>Archive name<input value={metadataDraft.archiveName} onChange={(event) => setMetadataDraft({ ...metadataDraft, archiveName: event.target.value })} /></label>
                <label>Rights note<textarea value={metadataDraft.rightsNote} onChange={(event) => setMetadataDraft({ ...metadataDraft, rightsNote: event.target.value })} /></label>
                <label>Intake notes<textarea value={metadataDraft.intakeNotes} onChange={(event) => setMetadataDraft({ ...metadataDraft, intakeNotes: event.target.value })} /></label>
                <label>Evidence classification<select value={metadataDraft.evidenceClassification} onChange={(event) => setMetadataDraft({ ...metadataDraft, evidenceClassification: event.target.value })}>{reviewStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                <label>Review status<select value={metadataDraft.reviewStatus} onChange={(event) => setMetadataDraft({ ...metadataDraft, reviewStatus: event.target.value })}>{reviewStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
              </div>

              <button className="sanborn-button sanborn-button--primary" onClick={() => void updateMetadata()} type="button">Update metadata</button>

              <div className="map-studio-inspector__grid">
                <label>{studioMode === "stitching" ? "X" : "Center latitude"}<input disabled={activeTransform.isLocked} step={studioMode === "stitching" ? "1" : "0.000001"} type="number" value={studioMode === "stitching" ? Number((selectedPlacement?.x ?? 0).toFixed(2)) : Number((selectedSheetGeoreference?.centerLatitude ?? 0).toFixed(6))} onChange={(event) => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { x: Number(event.target.value) }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { centerLatitude: Number(event.target.value) }) : undefined} /></label>
                <label>{studioMode === "stitching" ? "Y" : "Center longitude"}<input disabled={activeTransform.isLocked} step={studioMode === "stitching" ? "1" : "0.000001"} type="number" value={studioMode === "stitching" ? Number((selectedPlacement?.y ?? 0).toFixed(2)) : Number((selectedSheetGeoreference?.centerLongitude ?? 0).toFixed(6))} onChange={(event) => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { y: Number(event.target.value) }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { centerLongitude: Number(event.target.value) }) : undefined} /></label>
                {studioMode !== "stitching" && selectedSheetGeoreference ? (
                  <>
                    <label>Longitude span<input disabled={activeTransform.isLocked} min="0.000001" step="0.000001" type="number" value={Number(selectedSheetGeoreference.longitudeSpan.toFixed(6))} onChange={(event) => commitSheetGeoreference(selectedSheetGeoreference.assetId, { longitudeSpan: Number(event.target.value) })} /></label>
                    <label>Latitude span<input disabled={activeTransform.isLocked} min="0.000001" step="0.000001" type="number" value={Number(selectedSheetGeoreference.latitudeSpan.toFixed(6))} onChange={(event) => commitSheetGeoreference(selectedSheetGeoreference.assetId, { latitudeSpan: Number(event.target.value) })} /></label>
                  </>
                ) : null}
                <label>Scale X<input disabled={activeTransform.isLocked} max={maxStudioScale} min={minStudioScale} step="0.01" type="number" value={Number(activeTransform.scaleX.toFixed(3))} onChange={(event) => updateSelectedScale("x", Number(event.target.value))} /></label>
                <label>Scale Y<input disabled={activeTransform.isLocked} max={maxStudioScale} min={minStudioScale} step="0.01" type="number" value={Number(activeTransform.scaleY.toFixed(3))} onChange={(event) => updateSelectedScale("y", Number(event.target.value))} /></label>
                <label>Uniform scale<input type="checkbox" checked={uniformScale} onChange={(event) => {
                  setUniformScale(event.target.checked);
                  if (event.target.checked) {
                    if (studioMode === "stitching" && selectedPlacement) commitPlacement(selectedPlacement.assetId, { scaleY: selectedPlacement.scaleX });
                    if (studioMode !== "stitching" && selectedSheetGeoreference) commitSheetGeoreference(selectedSheetGeoreference.assetId, { scaleY: selectedSheetGeoreference.scaleX });
                  }
                }} /></label>
                <label>Rotation<input disabled={activeTransform.isLocked} step="1" type="number" value={Number(activeTransform.rotation.toFixed(2))} onChange={(event) => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { rotation: Number(event.target.value) }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { rotation: Number(event.target.value) }) : undefined} /></label>
                <label>Skew X<input disabled={activeTransform.isLocked} max="45" min="-45" step="0.5" type="number" value={Number(activeTransform.skewX.toFixed(2))} onChange={(event) => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { skewX: Number(event.target.value) }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { skewX: Number(event.target.value) }) : undefined} /></label>
                <label>Skew Y<input disabled={activeTransform.isLocked} max="45" min="-45" step="0.5" type="number" value={Number(activeTransform.skewY.toFixed(2))} onChange={(event) => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { skewY: Number(event.target.value) }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { skewY: Number(event.target.value) }) : undefined} /></label>
                {studioMode !== "stitching" && selectedSheetGeoreference ? (
                  <>
                    <label>Pivot X<input disabled={activeTransform.isLocked} max="1" min="0" step="0.01" type="number" value={Number(selectedSheetGeoreference.pivotX.toFixed(2))} onChange={(event) => commitSheetGeoreference(selectedSheetGeoreference.assetId, { pivotX: Number(event.target.value) })} /></label>
                    <label>Pivot Y<input disabled={activeTransform.isLocked} max="1" min="0" step="0.01" type="number" value={Number(selectedSheetGeoreference.pivotY.toFixed(2))} onChange={(event) => commitSheetGeoreference(selectedSheetGeoreference.assetId, { pivotY: Number(event.target.value) })} /></label>
                  </>
                ) : null}
                <label>Layer order<input type="number" value={activeTransform.layerOrder} onChange={(event) => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { layerOrder: Number(event.target.value) }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { layerOrder: Number(event.target.value) }) : undefined} /></label>
                <label>Visible<input type="checkbox" checked={activeTransform.isVisible} onChange={(event) => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { isVisible: event.target.checked }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { isVisible: event.target.checked }) : undefined} /></label>
              </div>

              {studioMode !== "stitching" && selectedSheetGeoreference ? (
                <details className="map-studio-inspector-section" open>
                  <summary>Corners</summary>
                  <div className="map-studio-inspector__grid">
                    {([
                      ["NW", "northwest"],
                      ["NE", "northeast"],
                      ["SE", "southeast"],
                      ["SW", "southwest"],
                    ] as const).map(([label, corner]) => (
                      <label key={corner}>{label}
                        <input
                          disabled={activeTransform.isLocked}
                          step="0.000001"
                          type="text"
                          value={`${formatCoordinate(selectedSheetGeoreference.corners[corner]?.latitude)}, ${formatCoordinate(selectedSheetGeoreference.corners[corner]?.longitude)}`}
                          onChange={(event) => {
                            const [latitude, longitude] = event.target.value.split(",").map((value) => Number(value.trim()));
                            if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
                              const next = updateSheetGeographicCorner(selectedSheetGeoreference, corner, { latitude, longitude });
                              commitSheetGeoreference(selectedSheetGeoreference.assetId, { corners: next.corners });
                            }
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </details>
              ) : null}

              <div className="map-studio-layer-actions">
                <button className="sanborn-button" disabled={activeTransform.isLocked} onClick={() => rotateSelectedSheet(-1)} type="button">Rotate left 1</button>
                <button className="sanborn-button" disabled={activeTransform.isLocked} onClick={() => rotateSelectedSheet(1)} type="button">Rotate right 1</button>
                <button className="sanborn-button" disabled={activeTransform.isLocked} onClick={() => rotateSelectedSheet(-90)} type="button">Rotate left 90</button>
                <button className="sanborn-button" disabled={activeTransform.isLocked} onClick={() => rotateSelectedSheet(90)} type="button">Rotate right 90</button>
                <button className="sanborn-button" disabled={activeTransform.isLocked} onClick={() => flipSelectedSheet("horizontal")} type="button">Flip horizontal</button>
                <button className="sanborn-button" disabled={activeTransform.isLocked} onClick={() => flipSelectedSheet("vertical")} type="button">Flip vertical</button>
              </div>

              <div className="map-studio-layer-actions">
                <button className="sanborn-button" onClick={() => setLayerOrder("forward")} type="button">Bring forward</button>
                <button className="sanborn-button" onClick={() => setLayerOrder("backward")} type="button">Send backward</button>
                <button className="sanborn-button" onClick={() => setLayerOrder("front")} type="button">Bring to front</button>
                <button className="sanborn-button" onClick={() => setLayerOrder("back")} type="button">Send to back</button>
              </div>

              <div className="map-studio-layer-actions">
                <button className="sanborn-button" onClick={centerSelectedSheet} type="button">Center selected sheet</button>
                <button className="sanborn-button" onClick={fitSelectedSheet} type="button">Fit selected sheet</button>
                <button className="sanborn-button" disabled={activeTransform.isLocked} onClick={resetSelectedTransform} type="button">Reset transform</button>
                <button className="sanborn-button" onClick={() => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { isLocked: !selectedPlacement.isLocked }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { isLocked: !selectedSheetGeoreference.isLocked }) : undefined} type="button">Lock/unlock</button>
                <button className="sanborn-button" onClick={() => studioMode === "stitching" && selectedPlacement ? commitPlacement(selectedPlacement.assetId, { isVisible: !selectedPlacement.isVisible }) : selectedSheetGeoreference ? commitSheetGeoreference(selectedSheetGeoreference.assetId, { isVisible: !selectedSheetGeoreference.isVisible }) : undefined} type="button">Show/hide</button>
                {studioMode !== "stitching" ? <button className="sanborn-button" onClick={removeSelectedGeographicPlacement} type="button">Remove placement</button> : null}
                <button className="sanborn-button" onClick={() => replaceInputRef.current?.click()} type="button">Replace image</button>
                <button className="sanborn-button" onClick={() => void deleteSelectedSheet()} type="button">Delete sheet</button>
                <input accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden onChange={(event) => void replaceSelectedImage(event)} ref={replaceInputRef} type="file" />
              </div>

              <div className="map-studio-readonly">
                <p><strong>Asset ID:</strong> {selectedAsset.assetId}</p>
                <p><strong>Storage:</strong> Private sanborn-sheets bucket; path is validated server-side.</p>
                <p><strong>MIME:</strong> {selectedAsset.mimeType}</p>
                <p><strong>Size:</strong> {formatBytes(selectedAsset.byteSize)}</p>
                <p><strong>Dimensions:</strong> {selectedAsset.width} x {selectedAsset.height}</p>
                <p><strong>Checksum:</strong> {selectedAsset.checksum}</p>
                <p><strong>Uploaded:</strong> {formatDate(selectedAsset.uploadedAt)}</p>
                <p><strong>Last modified:</strong> {formatDate(selectedAsset.updatedAt)}</p>
              </div>

              {studioMode !== "stitching" ? (
                <div className="map-studio-georef-inspector">
                  <h3>Georeferencing</h3>
                  <p className="small-muted">Sheet geographic status: {selectedSheetGeoreference?.georeferenceStatus ?? "not_started"}</p>
                  <p className="small-muted">Center: {selectedSheetGeoreference ? `${formatCoordinate(selectedSheetGeoreference.centerLatitude)}, ${formatCoordinate(selectedSheetGeoreference.centerLongitude)}` : "unavailable"}</p>
                  <p className="small-muted">Corners: {selectedSheetGeoreference?.corners.northwest ? `NW ${formatCoordinate(selectedSheetGeoreference.corners.northwest.latitude)}, ${formatCoordinate(selectedSheetGeoreference.corners.northwest.longitude)}` : "unavailable"}</p>
                  <p className="small-muted">Rendering: browser four-corner projective warp for visual alignment, not survey-grade GIS output.</p>
                  <p className="small-muted">Control-point target status: {georeferenceDraft.status}</p>
                  <p className="small-muted">Control points: {completeControlPoints.length} complete / {georeferenceDraft.controlPoints.length} total</p>
                  <p className="small-muted">Estimated error: {calculatedTransform.ok ? calculatedTransform.residualError.toExponential(3) : calculatedTransform.error}</p>
                  <p className="small-muted">Overlay bounds: {georeferenceDraftBounds ? `${formatCoordinate(georeferenceDraftBounds.northLatitude)}, ${formatCoordinate(georeferenceDraftBounds.westLongitude)} to ${formatCoordinate(georeferenceDraftBounds.southLatitude)}, ${formatCoordinate(georeferenceDraftBounds.eastLongitude)}` : "unavailable"}</p>
                  <label>Georeference notes<textarea value={georeferenceDraft.notes} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, notes: event.target.value })} /></label>
                  {selectedControlPoint ? (
                    <div className="map-studio-control-point-editor">
                      <h4>Selected point</h4>
                      <label>Label<input value={selectedControlPoint.label} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { label: event.target.value })} /></label>
                      <label>Image X<input type="number" value={selectedControlPoint.imageX ?? ""} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { imageX: Number(event.target.value) })} /></label>
                      <label>Image Y<input type="number" value={selectedControlPoint.imageY ?? ""} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { imageY: Number(event.target.value) })} /></label>
                      <label>Latitude<input step="0.000001" type="number" value={selectedControlPoint.latitude ?? ""} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { latitude: Number(event.target.value) })} /></label>
                      <label>Longitude<input step="0.000001" type="number" value={selectedControlPoint.longitude ?? ""} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { longitude: Number(event.target.value) })} /></label>
                      <label>Confidence<input value={selectedControlPoint.confidence} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { confidence: event.target.value })} /></label>
                      <label>Notes<textarea value={selectedControlPoint.notes ?? ""} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { notes: event.target.value })} /></label>
                      <button className="sanborn-button" onClick={deleteSelectedControlPoint} type="button">Delete point</button>
                    </div>
                  ) : (
                    <p className="small-muted">No control point selected.</p>
                  )}
                </div>
              ) : null}
            </>
          )}
        </aside>
      </div>

      <footer className="map-studio-statusbar">
        <span>Selected: {selectedAsset ? `Sheet ${selectedAsset.sheetNumber ?? "unknown"}` : "None"}</span>
        <span>Canvas: {canvasCoordinates.x}, {canvasCoordinates.y}</span>
        <span>Zoom: {Math.round(present.viewport.scale * 100)}%</span>
        <span>Unsaved: {isDirty ? "yes" : "no"}</span>
        <span>Duplicate sheets: {duplicateSheetNumbers.length ? duplicateSheetNumbers.join(", ") : "none"}</span>
        <span>Missing sheets: {missingSheetNumbers.length ? missingSheetNumbers.join(", ") : "none"}</span>
        <span>Save: {saveStatus}</span>
        <span>Status: {workspaceStatus}</span>
        <span>Map center: {formatCoordinate(mapCenter.latitude)}, {formatCoordinate(mapCenter.longitude)}</span>
        <span>Cursor GPS: {mapCursor ? `${formatCoordinate(mapCursor.latitude)}, ${formatCoordinate(mapCursor.longitude)}` : "outside map"}</span>
        <span>Selected GPS: {selectedControlPoint ? `${formatCoordinate(selectedControlPoint.latitude)}, ${formatCoordinate(selectedControlPoint.longitude)}` : "none"}</span>
        <span>Map zoom: {modernMapZoom}</span>
        <span>Geo edit: {geoEditMode}</span>
        <span>Move scope: {movementScope}</span>
        <span>Geo sheets: {visibleGeographicSheets}/{geoPresent.sheets.length}</span>
        <label><input checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} type="checkbox" /> Grid</label>
        <label><input checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} type="checkbox" /> Snap</label>
      </footer>
    </section>
  );
}
