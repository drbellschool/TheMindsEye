"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { ImageOverlay, MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLngExpression, LatLngTuple } from "leaflet";

import {
  basemaps,
  createTileDiagnostics,
  getBasemap,
  getModernTileLayerOpacity,
  leafletPaneStack,
  updateTileDiagnostics,
} from "@/lib/historical-map-basemap";
import { boundsFromCorners, getGeoCornerLabel, type GeoBounds, type GeoCorners, type HistoricalMapControlPoint } from "@/lib/historical-map-georeference";
import {
  normalizeSheetGeographicTransform,
  type GeoEditMode,
  type SheetGeographicTransform,
} from "@/lib/historical-map-sheet-georeference";

export { basemaps };

type HistoricalMapLeafletProps = {
  center: LatLngTuple;
  zoom: number;
  basemapKey: string;
  imageUrl: string | null;
  bounds: GeoBounds | null;
  corners: GeoCorners;
  controlPoints: HistoricalMapControlPoint[];
  selectedControlPointId: string;
  overlayVisible: boolean;
  overlayOpacity: number;
  showControlPoints: boolean;
  showSheetBoundaries: boolean;
  fitBoundsRequest: number;
  sheetLayers?: HistoricalSheetMapLayer[];
  selectedSheetAssetId?: string;
  sheetEditMode?: GeoEditMode | "preview";
  globalHistoricalOpacity?: number;
  showSheetLabels?: boolean;
  modernLayerVisible?: boolean;
  onMapClick: (latitude: number, longitude: number) => void;
  onMarkerDrag: (controlPointId: string, latitude: number, longitude: number) => void;
  onCornerDrag: (corner: keyof GeoCorners, latitude: number, longitude: number) => void;
  onCursorMove: (latitude: number, longitude: number) => void;
  onMapViewChange: (center: LatLngTuple, zoom: number) => void;
  onSelectSheet?: (assetId: string) => void;
  onSheetTransformCommit?: (assetId: string, patch: Partial<SheetGeographicTransform>) => void;
  onRefreshSheetSignedUrl?: (assetId: string) => void;
  onSheetImageStateChange?: (state: SheetImageLoadState) => void;
};

export type HistoricalSheetMapLayer = SheetGeographicTransform & {
  imageUrl: string | null;
  sheetNumber: number | null;
  originalFilename: string;
  width: number;
  height: number;
  signedUrlError?: string;
};

export type SheetImageLoadState = {
  assetId: string;
  state: "idle" | "loading" | "loaded" | "failed";
  naturalWidth: number | null;
  naturalHeight: number | null;
  transformValid: boolean;
  message: string;
};

function markerIcon(className: string, label: string) {
  return L.divIcon({
    className: `map-studio-leaflet-marker ${className}`,
    html: `<span>${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function boundsToLeaflet(bounds: GeoBounds): [LatLngTuple, LatLngTuple] {
  return [
    [bounds.southLatitude, bounds.westLongitude],
    [bounds.northLatitude, bounds.eastLongitude],
  ];
}

function getCornerPolygon(corners: GeoCorners): LatLngExpression[] {
  return [corners.northwest, corners.northeast, corners.southeast, corners.southwest]
    .filter((corner): corner is { latitude: number; longitude: number } => Boolean(corner))
    .map((corner) => [corner.latitude, corner.longitude] as LatLngTuple);
}

function MapEvents({
  onMapClick,
  onCursorMove,
  onMapViewChange,
}: Pick<HistoricalMapLeafletProps, "onMapClick" | "onCursorMove" | "onMapViewChange">) {
  const map = useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng);
    },
    mousemove(event) {
      onCursorMove(event.latlng.lat, event.latlng.lng);
    },
    moveend() {
      const center = map.getCenter();
      onMapViewChange([center.lat, center.lng], map.getZoom());
    },
    zoomend() {
      const center = map.getCenter();
      onMapViewChange([center.lat, center.lng], map.getZoom());
    },
  });

  return null;
}

function MapInteractionMode({ mode }: { mode: HistoricalMapLeafletProps["sheetEditMode"] }) {
  const map = useMap();

  useEffect(() => {
    if (mode === "edit_historical_sheets") {
      map.dragging.disable();
      return () => {
        map.dragging.enable();
      };
    }

    map.dragging.enable();
    return undefined;
  }, [map, mode]);

  return null;
}

function FitBounds({ bounds, request }: { bounds: GeoBounds | null; request: number }) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(boundsToLeaflet(bounds), { padding: [40, 40] });
    }
  }, [bounds, map, request]);

  return null;
}

function SyncMapView({ center, zoom }: { center: LatLngTuple; zoom: number }) {
  const map = useMap();
  const lastRequestedView = useRef<string>("");

  useEffect(() => {
    const key = `${center[0].toFixed(7)},${center[1].toFixed(7)},${zoom}`;

    if (lastRequestedView.current === key) {
      return;
    }

    lastRequestedView.current = key;
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const centerChanged = Math.abs(currentCenter.lat - center[0]) > 0.0000001 || Math.abs(currentCenter.lng - center[1]) > 0.0000001;

    if (centerChanged || currentZoom !== zoom) {
      map.setView(center, zoom, { animate: false });
    }
  }, [center, map, zoom]);

  return null;
}

function InvalidateMapSize({ request }: { request: number }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize({ animate: false });
    const timeout = window.setTimeout(() => map.invalidateSize({ animate: false }), 120);

    return () => window.clearTimeout(timeout);
  }, [map, request]);

  return null;
}

function ConfigureLeafletPanes({ request }: { request: number }) {
  const map = useMap();

  useEffect(() => {
    const tilePane = map.getPane("tilePane");
    const overlayPane = map.getPane("overlayPane");
    const markerPane = map.getPane("markerPane");
    const tooltipPane = map.getPane("tooltipPane");
    const popupPane = map.getPane("popupPane");
    const historicalPane = map.getPane("historical-sheet-pane") ?? map.createPane("historical-sheet-pane");

    if (tilePane) {
      tilePane.style.zIndex = String(leafletPaneStack.tilePane);
      tilePane.style.opacity = "1";
      tilePane.style.display = "block";
      tilePane.style.visibility = "visible";
    }

    if (overlayPane) {
      overlayPane.style.zIndex = String(leafletPaneStack.overlayPane);
    }

    if (markerPane) {
      markerPane.style.zIndex = String(leafletPaneStack.markerPane);
    }

    if (tooltipPane) {
      tooltipPane.style.zIndex = String(leafletPaneStack.tooltipPane);
    }

    if (popupPane) {
      popupPane.style.zIndex = String(leafletPaneStack.popupPane);
    }

    historicalPane.style.zIndex = String(leafletPaneStack.historicalSheetPane);
    historicalPane.style.background = "transparent";
    historicalPane.style.pointerEvents = "auto";
    historicalPane.style.opacity = "1";

    map.invalidateSize({ animate: false });
    const timeout = window.setTimeout(() => map.invalidateSize({ animate: false }), 150);

    return () => window.clearTimeout(timeout);
  }, [map, request]);

  return null;
}

type QuadPoints = {
  northwest: L.Point;
  northeast: L.Point;
  southeast: L.Point;
  southwest: L.Point;
};

function getSheetCornerPoints(map: L.Map, sheet: SheetGeographicTransform): QuadPoints {
  return {
    northwest: map.latLngToLayerPoint([sheet.corners.northwest?.latitude ?? sheet.centerLatitude, sheet.corners.northwest?.longitude ?? sheet.centerLongitude]),
    northeast: map.latLngToLayerPoint([sheet.corners.northeast?.latitude ?? sheet.centerLatitude, sheet.corners.northeast?.longitude ?? sheet.centerLongitude]),
    southeast: map.latLngToLayerPoint([sheet.corners.southeast?.latitude ?? sheet.centerLatitude, sheet.corners.southeast?.longitude ?? sheet.centerLongitude]),
    southwest: map.latLngToLayerPoint([sheet.corners.southwest?.latitude ?? sheet.centerLatitude, sheet.corners.southwest?.longitude ?? sheet.centerLongitude]),
  };
}

function getPointCenter(points: QuadPoints) {
  const values = [points.northwest, points.northeast, points.southeast, points.southwest];

  return L.point(values.reduce((sum, point) => sum + point.x, 0) / values.length, values.reduce((sum, point) => sum + point.y, 0) / values.length);
}

function getPivotPoint(points: QuadPoints, sheet: SheetGeographicTransform) {
  return L.point(
    points.northwest.x + (points.northeast.x - points.northwest.x) * sheet.pivotX + (points.southwest.x - points.northwest.x) * sheet.pivotY,
    points.northwest.y + (points.northeast.y - points.northwest.y) * sheet.pivotX + (points.southwest.y - points.northwest.y) * sheet.pivotY,
  );
}

function pointToCoordinate(map: L.Map, point: L.Point) {
  const latLng = map.layerPointToLatLng(point);

  return { latitude: latLng.lat, longitude: latLng.lng };
}

function pointsToCorners(map: L.Map, points: QuadPoints): GeoCorners {
  return {
    northwest: pointToCoordinate(map, points.northwest),
    northeast: pointToCoordinate(map, points.northeast),
    southeast: pointToCoordinate(map, points.southeast),
    southwest: pointToCoordinate(map, points.southwest),
  };
}

function getTransformedQuadBounds(points: QuadPoints) {
  const values = [points.northwest, points.northeast, points.southeast, points.southwest];
  const minX = Math.min(...values.map((point) => point.x));
  const minY = Math.min(...values.map((point) => point.y));
  const maxX = Math.max(...values.map((point) => point.x));
  const maxY = Math.max(...values.map((point) => point.y));

  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;

    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][column]) < 1e-9) {
      return null;
    }

    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    const pivot = augmented[column][column];

    for (let col = column; col <= size; col += 1) {
      augmented[column][col] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];

      for (let col = column; col <= size; col += 1) {
        augmented[row][col] -= factor * augmented[column][col];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function getRectangularFallbackTransform(width: number, height: number, points: QuadPoints): string {
  const bounds = getTransformedQuadBounds(points);
  const scaleX = bounds.width / Math.max(width, 1);
  const scaleY = bounds.height / Math.max(height, 1);

  return `matrix3d(${scaleX},0,0,0,0,${scaleY},0,0,0,0,1,0,0,0,0,1)`;
}

function getProjectiveTransform(width: number, height: number, points: QuadPoints, offset: L.Point): { transform: string; valid: boolean } {
  const source = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const target = [points.northwest, points.northeast, points.southeast, points.southwest].map((point) => [point.x - offset.x, point.y - offset.y]);
  const matrix: number[][] = [];
  const vector: number[] = [];

  source.forEach(([x, y], index) => {
    const [u, v] = target[index];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  });

  const solved = solveLinearSystem(matrix, vector);

  if (!solved) {
    return { transform: getRectangularFallbackTransform(width, height, points), valid: false };
  }

  const [a, b, c, d, e, f, g, h] = solved;
  const cssMatrix = [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, 1];

  if (cssMatrix.some((value) => !Number.isFinite(value))) {
    return { transform: getRectangularFallbackTransform(width, height, points), valid: false };
  }

  return { transform: `matrix3d(${cssMatrix.map((value) => Number(value.toFixed(12))).join(",")})`, valid: true };
}

function rotatePoints(points: QuadPoints, center: L.Point, degrees: number): QuadPoints {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotate = (point: L.Point) => {
    const x = point.x - center.x;
    const y = point.y - center.y;

    return L.point(center.x + x * cos - y * sin, center.y + x * sin + y * cos);
  };

  return {
    northwest: rotate(points.northwest),
    northeast: rotate(points.northeast),
    southeast: rotate(points.southeast),
    southwest: rotate(points.southwest),
  };
}

function scalePoints(points: QuadPoints, center: L.Point, scaleX: number, scaleY: number): QuadPoints {
  const scale = (point: L.Point) => L.point(center.x + (point.x - center.x) * scaleX, center.y + (point.y - center.y) * scaleY);

  return {
    northwest: scale(points.northwest),
    northeast: scale(points.northeast),
    southeast: scale(points.southeast),
    southwest: scale(points.southwest),
  };
}

function translatePoints(points: QuadPoints, dx: number, dy: number): QuadPoints {
  return {
    northwest: L.point(points.northwest.x + dx, points.northwest.y + dy),
    northeast: L.point(points.northeast.x + dx, points.northeast.y + dy),
    southeast: L.point(points.southeast.x + dx, points.southeast.y + dy),
    southwest: L.point(points.southwest.x + dx, points.southwest.y + dy),
  };
}

function setEdge(points: QuadPoints, edge: string, nextPoint: L.Point): QuadPoints {
  if (edge === "top-center") {
    const current = L.point((points.northwest.x + points.northeast.x) / 2, (points.northwest.y + points.northeast.y) / 2);
    return { ...points, northwest: L.point(points.northwest.x + nextPoint.x - current.x, points.northwest.y + nextPoint.y - current.y), northeast: L.point(points.northeast.x + nextPoint.x - current.x, points.northeast.y + nextPoint.y - current.y) };
  }
  if (edge === "middle-right") {
    const current = L.point((points.northeast.x + points.southeast.x) / 2, (points.northeast.y + points.southeast.y) / 2);
    return { ...points, northeast: L.point(points.northeast.x + nextPoint.x - current.x, points.northeast.y + nextPoint.y - current.y), southeast: L.point(points.southeast.x + nextPoint.x - current.x, points.southeast.y + nextPoint.y - current.y) };
  }
  if (edge === "bottom-center") {
    const current = L.point((points.southwest.x + points.southeast.x) / 2, (points.southwest.y + points.southeast.y) / 2);
    return { ...points, southwest: L.point(points.southwest.x + nextPoint.x - current.x, points.southwest.y + nextPoint.y - current.y), southeast: L.point(points.southeast.x + nextPoint.x - current.x, points.southeast.y + nextPoint.y - current.y) };
  }
  if (edge === "middle-left") {
    const current = L.point((points.northwest.x + points.southwest.x) / 2, (points.northwest.y + points.southwest.y) / 2);
    return { ...points, northwest: L.point(points.northwest.x + nextPoint.x - current.x, points.northwest.y + nextPoint.y - current.y), southwest: L.point(points.southwest.x + nextPoint.x - current.x, points.southwest.y + nextPoint.y - current.y) };
  }

  return points;
}

function TransformedSheetLayer({
  layer,
  isSelected,
  mode,
  globalOpacity,
  showLabel,
  onSelect,
  onCommit,
  onRefreshSignedUrl,
  onImageStateChange,
}: {
  layer: HistoricalSheetMapLayer;
  isSelected: boolean;
  mode: HistoricalMapLeafletProps["sheetEditMode"];
  globalOpacity: number;
  showLabel: boolean;
  onSelect?: (assetId: string) => void;
  onCommit?: (assetId: string, patch: Partial<SheetGeographicTransform>) => void;
  onRefreshSignedUrl?: (assetId: string) => void;
  onImageStateChange?: (state: SheetImageLoadState) => void;
}) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const interactionCleanupRef = useRef<(() => void) | null>(null);
  const latestRef = useRef({ layer, isSelected, mode, globalOpacity, showLabel, onSelect, onCommit, onRefreshSignedUrl, onImageStateChange });
  latestRef.current = { layer, isSelected, mode, globalOpacity, showLabel, onSelect, onCommit, onRefreshSignedUrl, onImageStateChange };

  useEffect(() => {
    interactionCleanupRef.current?.();
    interactionCleanupRef.current = null;
  }, [layer.assetId, mode]);

  useEffect(() => {
    const pane = map.getPane("historical-sheet-pane") ?? map.createPane("historical-sheet-pane");
    pane.style.zIndex = String(leafletPaneStack.historicalSheetPane);
    pane.style.background = "transparent";
    pane.style.opacity = "1";
    pane.style.pointerEvents = "auto";
    const element = L.DomUtil.create("div", "map-studio-sheet-overlay", pane);
    const image = L.DomUtil.create("img", "map-studio-sheet-overlay__image", element);
    const boundary = L.DomUtil.create("span", "map-studio-sheet-overlay__boundary", element);
    const label = L.DomUtil.create("span", "map-studio-sheet-overlay__label", element);
    const pivot = L.DomUtil.create("span", "map-studio-sheet-overlay__pivot", element);
    const diagnostics = L.DomUtil.create("span", "map-studio-sheet-overlay__diagnostics", element);
    const handles = [
      ["rotate", "rotate"],
      ["center", "drag"],
      ["top-left", "corner"],
      ["top-center", "edge"],
      ["top-right", "corner"],
      ["middle-left", "edge"],
      ["middle-right", "edge"],
      ["bottom-left", "corner"],
      ["bottom-center", "edge"],
      ["bottom-right", "corner"],
    ].map(([position, action]) => {
      const handle = L.DomUtil.create("button", `map-studio-sheet-overlay__handle handle-${position}`, element);
      handle.type = "button";
      handle.dataset.action = action;
      handle.dataset.position = position;
      handle.setAttribute("aria-label", `${action} ${position}`);
      return handle;
    });
    let draft: SheetGeographicTransform | null = null;
    let dragCleanup: (() => void) | null = null;
    let naturalSize: { width: number; height: number } | null = null;
    let imageLoadState: SheetImageLoadState["state"] = latestRef.current.layer.imageUrl ? "loading" : "idle";
    let transformValid = true;
    containerRef.current = element;
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);

    function emitImageState(state: SheetImageLoadState["state"], message: string) {
      imageLoadState = state;
      const width = naturalSize?.width ?? null;
      const height = naturalSize?.height ?? null;
      diagnostics.textContent = latestRef.current.isSelected
        ? `Image: ${state}${width && height ? ` (${width}x${height})` : ""}${transformValid ? "" : " | rectangular fallback"}`
        : "";
      latestRef.current.onImageStateChange?.({
        assetId: latestRef.current.layer.assetId,
        state,
        naturalWidth: width,
        naturalHeight: height,
        transformValid,
        message,
      });
    }

    function effectiveLayer() {
      return draft ?? latestRef.current.layer;
    }

    function getImageSize() {
      const configuredWidth = Number(latestRef.current.layer.width);
      const configuredHeight = Number(latestRef.current.layer.height);

      return {
        width: Number.isFinite(configuredWidth) && configuredWidth > 0 ? configuredWidth : naturalSize?.width ?? 1000,
        height: Number.isFinite(configuredHeight) && configuredHeight > 0 ? configuredHeight : naturalSize?.height ?? 800,
      };
    }

    function setElementTransform(sheet: SheetGeographicTransform) {
      const points = getSheetCornerPoints(map, sheet);
      const bounds = getTransformedQuadBounds(points);
      const selected = latestRef.current.isSelected;
      const editMode = latestRef.current.mode === "edit_historical_sheets";
      const visibleHandles = selected && editMode && !sheet.isLocked;
      const offset = L.point(bounds.minX, bounds.minY);
      const imageSize = getImageSize();
      const projectiveTransform = getProjectiveTransform(imageSize.width, imageSize.height, points, offset);
      const centerPoint = getPointCenter(points);
      const handlePositions: Record<string, L.Point> = {
        "top-left": points.northwest,
        "top-center": L.point((points.northwest.x + points.northeast.x) / 2, (points.northwest.y + points.northeast.y) / 2),
        "top-right": points.northeast,
        "middle-left": L.point((points.northwest.x + points.southwest.x) / 2, (points.northwest.y + points.southwest.y) / 2),
        "middle-right": L.point((points.northeast.x + points.southeast.x) / 2, (points.northeast.y + points.southeast.y) / 2),
        "bottom-left": points.southwest,
        "bottom-center": L.point((points.southwest.x + points.southeast.x) / 2, (points.southwest.y + points.southeast.y) / 2),
        "bottom-right": points.southeast,
        center: centerPoint,
        rotate: L.point((points.northwest.x + points.northeast.x) / 2, (points.northwest.y + points.northeast.y) / 2 - 38),
      };
      const pivotPoint = getPivotPoint(points, sheet);

      element.style.left = `${bounds.minX}px`;
      element.style.top = `${bounds.minY}px`;
      element.style.width = `${bounds.width}px`;
      element.style.height = `${bounds.height}px`;
      element.style.opacity = String(Math.max(0.1, Math.min(1, sheet.opacity * latestRef.current.globalOpacity)));
      element.style.pointerEvents = editMode ? "auto" : "none";
      element.style.zIndex = String(400 + sheet.layerOrder + (selected ? 1000 : 0));
      element.style.cursor = sheet.isLocked ? "not-allowed" : editMode ? "grab" : "default";
      element.classList.toggle("is-selected", selected);
      element.classList.toggle("is-locked", sheet.isLocked);
      element.classList.toggle("is-hidden", !sheet.isVisible);
      element.classList.toggle("has-image-error", imageLoadState === "failed" || Boolean(latestRef.current.layer.signedUrlError));
      element.classList.toggle("has-invalid-transform", !projectiveTransform.valid);
      transformValid = projectiveTransform.valid;
      if (latestRef.current.layer.imageUrl && image.src !== latestRef.current.layer.imageUrl) {
        emitImageState("loading", "Loading signed Sanborn image.");
        image.src = latestRef.current.layer.imageUrl;
      }
      image.alt = `Sanborn sheet ${latestRef.current.layer.sheetNumber ?? "unknown"}`;
      image.style.display = latestRef.current.layer.imageUrl ? "block" : "none";
      image.style.width = `${imageSize.width}px`;
      image.style.height = `${imageSize.height}px`;
      image.style.pointerEvents = editMode ? "auto" : "none";
      image.style.transform = projectiveTransform.transform;
      label.textContent = latestRef.current.showLabel ? `Sheet ${latestRef.current.layer.sheetNumber ?? "unknown"}` : "";
      label.style.display = latestRef.current.showLabel ? "block" : "none";
      boundary.style.clipPath = `polygon(${points.northwest.x - offset.x}px ${points.northwest.y - offset.y}px, ${points.northeast.x - offset.x}px ${points.northeast.y - offset.y}px, ${points.southeast.x - offset.x}px ${points.southeast.y - offset.y}px, ${points.southwest.x - offset.x}px ${points.southwest.y - offset.y}px)`;
      boundary.style.display = selected || latestRef.current.showLabel ? "block" : "none";
      diagnostics.style.display = selected && (imageLoadState === "failed" || latestRef.current.layer.signedUrlError || !projectiveTransform.valid) ? "block" : "none";
      diagnostics.textContent = latestRef.current.layer.signedUrlError
        ? `Image: signed URL failed (${latestRef.current.layer.signedUrlError})`
        : imageLoadState === "failed"
          ? "Image: failed to load. Retrying signed URL."
          : !projectiveTransform.valid
            ? "Transform: rectangular fallback"
            : diagnostics.textContent;
      pivot.style.left = `${pivotPoint.x - offset.x}px`;
      pivot.style.top = `${pivotPoint.y - offset.y}px`;
      pivot.style.display = visibleHandles ? "block" : "none";
      handles.forEach((handle) => {
        const point = handlePositions[handle.dataset.position ?? ""];
        handle.style.display = visibleHandles ? "block" : "none";
        if (point) {
          handle.style.left = `${point.x - offset.x}px`;
          handle.style.top = `${point.y - offset.y}px`;
        }
      });
    }

    function updateFromMap() {
      const sheet = effectiveLayer();
      if (sheet.isVisible) {
        element.style.display = "block";
        setElementTransform(sheet);
      } else {
        element.style.display = "none";
      }
    }

    function finishInteraction(nextDraft: SheetGeographicTransform | null) {
      if (!nextDraft) {
        return;
      }

      const committed = normalizeSheetGeographicTransform({
        ...nextDraft,
        warpType: "projective",
        placementStatus: nextDraft.placementStatus === "aligned" || nextDraft.placementStatus === "reviewed" ? nextDraft.placementStatus : "draft",
      });

      latestRef.current.onCommit?.(committed.assetId, {
        centerLatitude: committed.centerLatitude,
        centerLongitude: committed.centerLongitude,
        latitudeSpan: committed.latitudeSpan,
        longitudeSpan: committed.longitudeSpan,
        rotation: committed.rotation,
        scaleX: committed.scaleX,
        scaleY: committed.scaleY,
        skewX: committed.skewX,
        skewY: committed.skewY,
        pivotX: committed.pivotX,
        pivotY: committed.pivotY,
        warpType: committed.warpType,
        placementStatus: committed.placementStatus,
        corners: committed.corners,
      });
    }

    function startPointerInteraction(event: PointerEvent) {
      const current = latestRef.current;
      const sheet = current.layer;
      const target = event.target as HTMLElement;
      const action = target.dataset.action ?? "drag";

      if (current.mode !== "edit_historical_sheets") {
        return;
      }

      L.DomEvent.stop(event);
      event.preventDefault();
      event.stopPropagation();
      current.onSelect?.(sheet.assetId);

      if (sheet.isLocked) {
        return;
      }

      map.dragging.disable();
      try {
        target.setPointerCapture?.(event.pointerId);
      } catch {
        // Some browsers do not allow capture on every transformed child node.
      }
      const startPoints = getSheetCornerPoints(map, sheet);
      const start = {
        x: event.clientX,
        y: event.clientY,
        sheet,
        points: startPoints,
        centerPoint: getPointCenter(startPoints),
        pivotPoint: getPivotPoint(startPoints, sheet),
        rotation: sheet.rotation,
        scaleX: sheet.scaleX,
        scaleY: sheet.scaleY,
      };

      function handleMove(moveEvent: PointerEvent) {
        if (latestRef.current.mode !== "edit_historical_sheets") {
          handleUp(moveEvent);
          return;
        }

        moveEvent.preventDefault();
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;

        if (action === "corner") {
          const position = target.dataset.position ?? "";
          const cornerByPosition: Record<string, keyof QuadPoints> = {
            "top-left": "northwest",
            "top-right": "northeast",
            "bottom-right": "southeast",
            "bottom-left": "southwest",
          };
          const corner = cornerByPosition[position];
          if (!corner) {
            return;
          }
          const nextPoints = { ...start.points, [corner]: L.point(start.points[corner].x + dx, start.points[corner].y + dy) };
          draft = normalizeSheetGeographicTransform({ ...start.sheet, corners: pointsToCorners(map, nextPoints), warpType: "projective", placementStatus: "draft" });
        } else if (action === "edge") {
          const nextPoints = setEdge(start.points, target.dataset.position ?? "", L.point(start.centerPoint.x + dx, start.centerPoint.y + dy));
          draft = normalizeSheetGeographicTransform({ ...start.sheet, corners: pointsToCorners(map, nextPoints), warpType: "projective", placementStatus: "draft" });
        } else if (action === "rotate") {
          const startAngle = Math.atan2(start.y - start.pivotPoint.y, start.x - start.pivotPoint.x);
          const nextAngle = Math.atan2(moveEvent.clientY - start.pivotPoint.y, moveEvent.clientX - start.pivotPoint.x);
          const deltaDegrees = ((nextAngle - startAngle) * 180) / Math.PI;
          const nextPoints = rotatePoints(start.points, start.pivotPoint, deltaDegrees);
          draft = normalizeSheetGeographicTransform({ ...start.sheet, rotation: start.rotation + deltaDegrees, corners: pointsToCorners(map, nextPoints) });
        } else if (action === "scale") {
          const bounds = getTransformedQuadBounds(start.points);
          const scaleX = Math.max(0.1, start.scaleX + dx / Math.max(bounds.width, 80));
          const scaleY = Math.max(0.1, start.scaleY + dy / Math.max(bounds.height, 80));
          const nextPoints = scalePoints(start.points, start.pivotPoint, scaleX / start.scaleX, scaleY / start.scaleY);
          draft = normalizeSheetGeographicTransform({ ...start.sheet, scaleX, scaleY, corners: pointsToCorners(map, nextPoints) });
        } else {
          const nextPoints = translatePoints(start.points, dx, dy);
          draft = normalizeSheetGeographicTransform({
            ...start.sheet,
            corners: pointsToCorners(map, nextPoints),
            placementStatus: "draft",
          });
        }

        updateFromMap();
      }

      function handleUp(upEvent: PointerEvent | Event = event) {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        document.removeEventListener("pointercancel", handleUp);
        const pointerId = "pointerId" in upEvent ? upEvent.pointerId : event.pointerId;
        try {
          target.releasePointerCapture?.(pointerId);
        } catch {
          // Pointer capture may already be released if the browser cancels the gesture.
        }
        if (latestRef.current.mode === "edit_historical_sheets") {
          map.dragging.disable();
        } else {
          map.dragging.enable();
        }
        finishInteraction(draft);
        draft = null;
        updateFromMap();
        dragCleanup = null;
        interactionCleanupRef.current = null;
      }

      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
      document.addEventListener("pointercancel", handleUp);
      dragCleanup = () => {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        document.removeEventListener("pointercancel", handleUp);
        try {
          target.releasePointerCapture?.(event.pointerId);
        } catch {
          // Pointer capture may already be released if the browser cancels the gesture.
        }
      };
      interactionCleanupRef.current = dragCleanup;
    }

    image.onload = () => {
      naturalSize = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      emitImageState("loaded", "Signed Sanborn image loaded.");
      updateFromMap();
    };
    image.onerror = () => {
      naturalSize = null;
      emitImageState("failed", "Signed Sanborn image failed to load.");
      latestRef.current.onRefreshSignedUrl?.(latestRef.current.layer.assetId);
      updateFromMap();
    };
    element.addEventListener("pointerdown", startPointerInteraction);
    map.on("move zoom viewreset", updateFromMap);
    updateFromMap();

    return () => {
      dragCleanup?.();
      interactionCleanupRef.current = null;
      element.removeEventListener("pointerdown", startPointerInteraction);
      map.off("move zoom viewreset", updateFromMap);
      element.remove();
      containerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    map.fire("move");
  }, [layer, isSelected, mode, globalOpacity, showLabel, map]);

  return null;
}

export function HistoricalMapLeaflet(props: HistoricalMapLeafletProps) {
  const basemap = getBasemap(props.basemapKey);
  const derivedBounds = props.bounds ?? boundsFromCorners(props.corners);
  const polygon = useMemo(() => getCornerPolygon(props.corners), [props.corners]);
  const sheetLayers = props.sheetLayers ?? [];
  const [tileDiagnostics, setTileDiagnostics] = useState(createTileDiagnostics);
  const [tileRetry, setTileRetry] = useState(0);
  const showLegacyOverlayControls = sheetLayers.length === 0 && props.overlayVisible;
  const tileStatus = tileDiagnostics.status;

  useEffect(() => {
    setTileDiagnostics(createTileDiagnostics());
  }, [basemap.key, tileRetry]);

  function recordTileEvent(event: "loading" | "tileload" | "tileerror" | "load", details?: unknown) {
    if (event === "tileerror" && process.env.NODE_ENV !== "production") {
      const tile = (details as { tile?: HTMLImageElement } | undefined)?.tile;
      console.warn("Historical Map Studio basemap tile failed", {
        basemap: basemap.key,
        source: tile?.currentSrc || tile?.src || "unknown",
      });
    }

    setTileDiagnostics((current) => updateTileDiagnostics(current, event));
  }

  return (
    <MapContainer center={props.center} className="map-studio-leaflet-map" scrollWheelZoom zoom={props.zoom}>
      <ConfigureLeafletPanes request={props.fitBoundsRequest + tileRetry} />
      <TileLayer
        attribution={basemap.attribution}
        eventHandlers={{
          loading: () => recordTileEvent("loading"),
          load: () => recordTileEvent("load"),
          tileerror: (event) => recordTileEvent("tileerror", event),
          tileload: () => recordTileEvent("tileload"),
        }}
        key={`${basemap.key}-${tileRetry}`}
        opacity={getModernTileLayerOpacity()}
        url={basemap.url}
      />
      <SyncMapView center={props.center} zoom={props.zoom} />
      <InvalidateMapSize request={props.fitBoundsRequest} />
      <MapInteractionMode mode={props.sheetEditMode ?? "pan_modern_map"} />
      <MapEvents onCursorMove={props.onCursorMove} onMapClick={props.onMapClick} onMapViewChange={props.onMapViewChange} />
      <FitBounds bounds={derivedBounds} request={props.fitBoundsRequest} />

      {sheetLayers
        .filter((sheet) => sheet.imageUrl && sheet.isVisible)
        .sort((a, b) => a.layerOrder - b.layerOrder)
        .map((sheet) => (
          <TransformedSheetLayer
            globalOpacity={props.globalHistoricalOpacity ?? 1}
            isSelected={props.selectedSheetAssetId === sheet.assetId}
            key={sheet.assetId}
            layer={sheet}
            mode={props.sheetEditMode ?? "pan_modern_map"}
            onCommit={props.onSheetTransformCommit}
            onImageStateChange={props.onSheetImageStateChange}
            onRefreshSignedUrl={props.onRefreshSheetSignedUrl}
            onSelect={props.onSelectSheet}
            showLabel={props.showSheetLabels ?? true}
          />
        ))}

      {showLegacyOverlayControls && props.imageUrl && derivedBounds ? (
        <ImageOverlay bounds={boundsToLeaflet(derivedBounds)} opacity={props.overlayOpacity} url={props.imageUrl} />
      ) : null}

      {showLegacyOverlayControls && props.showSheetBoundaries && polygon.length >= 3 ? <Polygon pathOptions={{ color: "#e2be7e", weight: 2, fill: false }} positions={polygon} /> : null}

      {showLegacyOverlayControls ? (["northwest", "northeast", "southeast", "southwest"] as Array<keyof GeoCorners>).map((corner) => {
        const coordinate = props.corners[corner];

        if (!coordinate) {
          return null;
        }

        return (
          <Marker
            draggable
            eventHandlers={{
              dragend(event) {
                const latlng = event.target.getLatLng();
                props.onCornerDrag(corner, latlng.lat, latlng.lng);
              },
            }}
            icon={markerIcon("is-corner", getGeoCornerLabel(corner))}
            key={corner}
            position={[coordinate.latitude, coordinate.longitude]}
          />
        );
      }) : null}

      {props.showControlPoints
        ? props.controlPoints
            .filter((point) => typeof point.latitude === "number" && typeof point.longitude === "number")
            .map((point) => (
              <Marker
                draggable
                eventHandlers={{
                  dragend(event) {
                    const latlng = event.target.getLatLng();
                    props.onMarkerDrag(point.controlPointId, latlng.lat, latlng.lng);
                  },
                }}
                icon={markerIcon(point.controlPointId === props.selectedControlPointId ? "is-selected" : "is-control-point", point.label.slice(0, 2).toUpperCase())}
                key={point.controlPointId}
                position={[point.latitude!, point.longitude!]}
              />
            ))
        : null}

      <div className={`map-studio-tile-status is-${tileStatus}`}>
        {tileStatus === "idle" ? "Loading modern map" : null}
        {tileStatus === "loading" ? "Loading modern map" : null}
        {tileStatus === "loaded" ? "Modern map loaded" : null}
        <span className="map-studio-tile-status__counts">
          Tiles {tileDiagnostics.successfulTiles} loaded / {tileDiagnostics.failedTiles} failed
        </span>
        {tileStatus === "error" ? (
          <>
            <span>Modern map failed to load.</span>
            <button
              type="button"
              onClick={() => {
                setTileDiagnostics((current) => updateTileDiagnostics(current, "retry"));
                setTileRetry((value) => value + 1);
              }}
            >
              Retry
            </button>
          </>
        ) : null}
      </div>
    </MapContainer>
  );
}
