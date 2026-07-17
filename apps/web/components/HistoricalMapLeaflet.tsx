"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { ImageOverlay, MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLngExpression, LatLngTuple } from "leaflet";

import {
  basemaps,
  createTileDiagnostics,
  getBasemap,
  getModernTileLayerOpacity,
  leafletPaneStack,
  type TileDiagnostics,
  updateTileDiagnostics,
} from "@/lib/historical-map-basemap";
import { boundsFromCorners, getGeoCornerLabel, type GeoBounds, type GeoCoordinate, type GeoCorners, type HistoricalMapControlPoint } from "@/lib/historical-map-georeference";
import {
  normalizeSheetGeographicTransform,
  type GeoEditMode,
  type SheetGeographicTransform,
} from "@/lib/historical-map-sheet-georeference";
import {
  normalizeSanbornMapPieceGeoreference,
  type SanbornMapPieceGeoreference,
} from "@/lib/sanborn-map-piece-georeference";
import type { SanbornNormalizedPoint, SanbornSourceBBox } from "@/lib/sanborn-atlas";

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
  pieceLayers?: HistoricalPieceMapLayer[];
  selectedSheetAssetId?: string;
  selectedPieceId?: string;
  sheetEditMode?: GeoEditMode | "preview";
  globalHistoricalOpacity?: number;
  showSheetLabels?: boolean;
  modernLayerVisible?: boolean;
  onMapClick: (latitude: number, longitude: number) => void;
  onMarkerDrag: (controlPointId: string, latitude: number, longitude: number) => void;
  onCornerDrag: (corner: keyof GeoCorners, latitude: number, longitude: number) => void;
  onCursorMove: (latitude: number, longitude: number) => void;
  onMapViewChange: (center: LatLngTuple, zoom: number, source?: string) => void;
  onMapViewMutation?: (source: string) => void;
  onSelectSheet?: (assetId: string) => void;
  onSheetTransformCommit?: (assetId: string, patch: Partial<SheetGeographicTransform>) => void;
  onPieceTransformCommit?: (pieceId: string, patch: Partial<SanbornMapPieceGeoreference>) => void;
  onRefreshSheetSignedUrl?: (assetId: string) => void;
  onSelectPiece?: (pieceId: string) => void;
  onSheetImageStateChange?: (state: SheetImageLoadState) => void;
  onTileDiagnosticsChange?: (diagnostics: TileDiagnostics & { basemapKey: string; tileLayerMounted: boolean }) => void;
  onTileRuntimeDebugChange?: (debug: LeafletTileRuntimeDebug) => void;
  locationMarker?: GeoCoordinate | null;
  plainTileOnly?: boolean;
  viewRefreshRequest?: number;
  fitBoundsEnabled?: boolean;
  overlayRenderMode?: "projective" | "rectangular";
  requestedViewSource?: string;
  onMapInteractionChange?: (state: "idle" | "panning" | "zooming", source: string) => void;
};

export type HistoricalSheetMapLayer = SheetGeographicTransform & {
  imageUrl: string | null;
  sheetNumber: number | null;
  originalFilename: string;
  width: number;
  height: number;
  signedUrlError?: string;
};

export type HistoricalPieceMapLayer = SanbornMapPieceGeoreference & {
  imageUrl: string | null;
  signedUrlError?: string;
  sourcePolygon: SanbornNormalizedPoint[];
  sourceBBox: SanbornSourceBBox;
  sourceImageWidth: number;
  sourceImageHeight: number;
  pieceLabel: string;
};

export type SheetImageLoadState = {
  assetId: string;
  state: "idle" | "loading" | "loaded" | "failed";
  naturalWidth: number | null;
  naturalHeight: number | null;
  transformValid: boolean;
  message: string;
};

type RuntimeRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type FirstTileRuntimeStyle = {
  display: string;
  visibility: string;
  opacity: string;
  zIndex: string;
  transform: string;
  parentPane: string;
  srcHost: string;
};

export type LeafletTileRuntimeDebug = {
  tileCount: number;
  completeTileCount: number;
  loadedTileNaturalSizes: Array<{ naturalWidth: number; naturalHeight: number }>;
  firstTile: FirstTileRuntimeStyle | null;
  tilePaneRect: RuntimeRect | null;
  mapContainerRect: RuntimeRect | null;
  tilePaneChildCount: number;
  successfulTileloadCount: number;
  failedTileCount: number;
  selectedBasemap: string;
  center: { latitude: number; longitude: number };
  zoom: number;
  visibleLoadedTileCount: number;
};

function rectSummary(rect: DOMRect): RuntimeRect {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function rectsIntersect(a: RuntimeRect | null, b: RuntimeRect | null): boolean {
  if (!a || !b || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) {
    return false;
  }

  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function getElementHost(element: HTMLImageElement | null): string {
  const source = element?.currentSrc || element?.src;

  if (!source) {
    return "none";
  }

  try {
    return new URL(source).hostname;
  } catch {
    return "invalid";
  }
}

function createEmptyTileRuntimeDebug(selectedBasemap: string): LeafletTileRuntimeDebug {
  return {
    tileCount: 0,
    completeTileCount: 0,
    loadedTileNaturalSizes: [],
    firstTile: null,
    tilePaneRect: null,
    mapContainerRect: null,
    tilePaneChildCount: 0,
    successfulTileloadCount: 0,
    failedTileCount: 0,
    selectedBasemap,
    center: { latitude: 0, longitude: 0 },
    zoom: 0,
    visibleLoadedTileCount: 0,
  };
}

function collectLeafletTileRuntimeDebug(map: L.Map, selectedBasemap: string, diagnostics: TileDiagnostics): LeafletTileRuntimeDebug {
  const tiles = Array.from(document.querySelectorAll<HTMLImageElement>(".leaflet-tile"));
  const completeTiles = tiles.filter((tile) => tile.complete);
  const loadedTiles = completeTiles.filter((tile) => tile.naturalWidth > 0 && tile.naturalHeight > 0);
  const firstTile = tiles[0] ?? null;
  const firstTileStyle = firstTile ? window.getComputedStyle(firstTile) : null;
  const firstTilePane = firstTile?.closest(".leaflet-pane");
  const tilePane = map.getPane("tilePane") ?? map.getContainer().querySelector<HTMLElement>(".leaflet-tile-pane");
  const mapContainer = map.getContainer();
  const tilePaneRect = tilePane ? rectSummary(tilePane.getBoundingClientRect()) : null;
  const mapContainerRect = rectSummary(mapContainer.getBoundingClientRect());
  const visibleLoadedTileCount = loadedTiles.filter((tile) => {
    const style = window.getComputedStyle(tile);
    const tileRect = rectSummary(tile.getBoundingClientRect());
    const opacity = Number.parseFloat(style.opacity || "1");

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      (!Number.isFinite(opacity) || opacity > 0) &&
      rectsIntersect(tileRect, mapContainerRect)
    );
  }).length;
  const center = map.getCenter();

  return {
    tileCount: tiles.length,
    completeTileCount: completeTiles.length,
    loadedTileNaturalSizes: loadedTiles.map((tile) => ({ naturalWidth: tile.naturalWidth, naturalHeight: tile.naturalHeight })),
    firstTile: firstTile && firstTileStyle
      ? {
          display: firstTileStyle.display,
          visibility: firstTileStyle.visibility,
          opacity: firstTileStyle.opacity,
          zIndex: firstTileStyle.zIndex,
          transform: firstTileStyle.transform,
          parentPane: firstTilePane?.className || "none",
          srcHost: getElementHost(firstTile),
        }
      : null,
    tilePaneRect,
    mapContainerRect,
    tilePaneChildCount: tilePane?.childElementCount ?? 0,
    successfulTileloadCount: diagnostics.successfulTiles,
    failedTileCount: diagnostics.failedTiles,
    selectedBasemap,
    center: { latitude: center.lat, longitude: center.lng },
    zoom: map.getZoom(),
    visibleLoadedTileCount,
  };
}

function getTileHost(details?: unknown): string | null {
  const tile = (details as { tile?: HTMLImageElement } | undefined)?.tile;
  const source = tile?.currentSrc || tile?.src;

  if (!source) {
    return null;
  }

  try {
    return new URL(source).hostname;
  } catch {
    return null;
  }
}

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
  onMapInteractionChange,
  onMapViewChange,
}: Pick<HistoricalMapLeafletProps, "onMapClick" | "onCursorMove" | "onMapInteractionChange" | "onMapViewChange">) {
  const map = useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng);
    },
    dragstart() {
      onMapInteractionChange?.("panning", "dragstart");
    },
    dragend() {
      const center = map.getCenter();
      onMapInteractionChange?.("idle", "dragend");
      onMapViewChange([center.lat, center.lng], map.getZoom(), "user_pan");
    },
    mousemove(event) {
      onCursorMove(event.latlng.lat, event.latlng.lng);
    },
    zoomstart() {
      onMapInteractionChange?.("zooming", "zoomstart");
    },
    zoomend() {
      const center = map.getCenter();
      onMapInteractionChange?.("idle", "zoomend");
      onMapViewChange([center.lat, center.lng], map.getZoom(), "user_zoom");
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

function FitBounds({
  bounds,
  enabled,
  onViewMutation,
  request,
}: {
  bounds: GeoBounds | null;
  enabled: boolean;
  onViewMutation?: (source: string) => void;
  request: number;
}) {
  const map = useMap();
  const lastRequest = useRef(0);

  useEffect(() => {
    if (enabled && bounds && request > 0 && lastRequest.current !== request) {
      lastRequest.current = request;
      onViewMutation?.("fit_bounds");
      map.fitBounds(boundsToLeaflet(bounds), { padding: [40, 40] });
    }
  }, [bounds, enabled, map, onViewMutation, request]);

  return null;
}

function SyncMapView({
  center,
  onViewMutation,
  request,
  source,
  zoom,
}: {
  center: LatLngTuple;
  onViewMutation?: (source: string) => void;
  request: number;
  source: string;
  zoom: number;
}) {
  const map = useMap();
  const lastRequest = useRef(0);

  useEffect(() => {
    if (request <= 0 || lastRequest.current === request) {
      return;
    }

    lastRequest.current = request;
    onViewMutation?.(source);
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const centerChanged = Math.abs(currentCenter.lat - center[0]) > 0.0000001 || Math.abs(currentCenter.lng - center[1]) > 0.0000001;

    if (centerChanged || currentZoom !== zoom) {
      map.setView(center, zoom, { animate: false });
    }
  }, [center, map, onViewMutation, request, source, zoom]);

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

function ForceLeafletTileRedraw({
  onViewMutation,
  request,
}: {
  onViewMutation?: (source: string) => void;
  request: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (request <= 0) {
      return undefined;
    }

    onViewMutation?.("force_tile_redraw");
    map.invalidateSize({ animate: false });
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        layer.redraw();
      }
    });

    const timeouts = [100, 500].map((delay) =>
      window.setTimeout(() => {
        map.invalidateSize({ animate: false });
        map.eachLayer((layer) => {
          if (layer instanceof L.TileLayer) {
            layer.redraw();
          }
        });
      }, delay),
    );

    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, [map, onViewMutation, request]);

  return null;
}

function LeafletTileRuntimeDebugPanel({
  basicOnly = false,
  diagnostics,
  onChange,
  selectedBasemap,
}: {
  basicOnly?: boolean;
  diagnostics: TileDiagnostics;
  onChange?: (debug: LeafletTileRuntimeDebug) => void;
  selectedBasemap: string;
}) {
  const map = useMap();
  const [debug, setDebug] = useState<LeafletTileRuntimeDebug>(() => createEmptyTileRuntimeDebug(selectedBasemap));

  useEffect(() => {
    let cancelled = false;

    function refresh() {
      if (cancelled) {
        return;
      }

      const next = collectLeafletTileRuntimeDebug(map, selectedBasemap, diagnostics);
      setDebug(next);
      onChange?.(next);
    }

    refresh();
    const interval = window.setInterval(refresh, 750);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [diagnostics, map, onChange, selectedBasemap]);

  if (basicOnly) {
    return (
      <div className="map-studio-plain-tile-counts">
        Plain map tiles: {debug.successfulTileloadCount} loaded / {debug.failedTileCount} failed / {debug.visibleLoadedTileCount} visible
      </div>
    );
  }

  return (
    <details className="map-studio-runtime-debug" open>
      <summary>Leaflet tile paint debug</summary>
      <dl>
        <dt>.leaflet-tile count</dt>
        <dd>{debug.tileCount}</dd>
        <dt>Complete tiles</dt>
        <dd>{debug.completeTileCount}</dd>
        <dt>Loaded natural sizes</dt>
        <dd>{debug.loadedTileNaturalSizes.length > 0 ? debug.loadedTileNaturalSizes.map((size) => `${size.naturalWidth}x${size.naturalHeight}`).join(", ") : "none"}</dd>
        <dt>First tile host</dt>
        <dd>{debug.firstTile?.srcHost ?? "none"}</dd>
        <dt>First tile style</dt>
        <dd>
          {debug.firstTile
            ? `display=${debug.firstTile.display}; visibility=${debug.firstTile.visibility}; opacity=${debug.firstTile.opacity}; z=${debug.firstTile.zIndex}; transform=${debug.firstTile.transform}; pane=${debug.firstTile.parentPane}`
            : "none"}
        </dd>
        <dt>Tile pane rect</dt>
        <dd>{debug.tilePaneRect ? `${debug.tilePaneRect.width}x${debug.tilePaneRect.height} @ ${debug.tilePaneRect.left},${debug.tilePaneRect.top}` : "none"}</dd>
        <dt>Map rect</dt>
        <dd>{debug.mapContainerRect ? `${debug.mapContainerRect.width}x${debug.mapContainerRect.height} @ ${debug.mapContainerRect.left},${debug.mapContainerRect.top}` : "none"}</dd>
        <dt>Tile pane children</dt>
        <dd>{debug.tilePaneChildCount}</dd>
        <dt>tileload / tileerror</dt>
        <dd>{debug.successfulTileloadCount} / {debug.failedTileCount}</dd>
        <dt>Visible loaded tiles</dt>
        <dd>{debug.visibleLoadedTileCount}</dd>
        <dt>Basemap</dt>
        <dd>{debug.selectedBasemap}</dd>
        <dt>Center / zoom</dt>
        <dd>{debug.center.latitude.toFixed(6)}, {debug.center.longitude.toFixed(6)} / {debug.zoom}</dd>
      </dl>
    </details>
  );
}

type PlainLeafletMapTestProps = {
  basemapKey?: string;
  onTileDiagnosticsChange?: (diagnostics: TileDiagnostics & { basemapKey: string; tileLayerMounted: boolean }) => void;
  onTileRuntimeDebugChange?: (debug: LeafletTileRuntimeDebug) => void;
};

export function PlainLeafletMapTest({
  basemapKey = "osm",
  onTileDiagnosticsChange,
  onTileRuntimeDebugChange,
}: PlainLeafletMapTestProps) {
  const basemap = getBasemap(basemapKey);
  const center: LatLngTuple = [33.425, -94.047];
  const [tileDiagnostics, setTileDiagnostics] = useState(createTileDiagnostics);
  const [tileRetry, setTileRetry] = useState(0);

  useEffect(() => {
    setTileDiagnostics(createTileDiagnostics());
  }, [basemap.key, tileRetry]);

  useEffect(() => {
    onTileDiagnosticsChange?.({
      ...tileDiagnostics,
      basemapKey: basemap.key,
      tileLayerMounted: true,
    });
  }, [basemap.key, onTileDiagnosticsChange, tileDiagnostics]);

  function recordTileEvent(event: "loading" | "tileload" | "tileerror" | "load", details?: unknown) {
    const failedHost = event === "tileerror" ? getTileHost(details) : null;

    setTileDiagnostics((current) => updateTileDiagnostics(current, event, { failedHost }));
  }

  return (
    <MapContainer center={center} className="map-studio-leaflet-map" scrollWheelZoom zoom={14}>
      <TileLayer
        attribution={basemap.attribution}
        eventHandlers={{
          loading: () => recordTileEvent("loading"),
          load: () => recordTileEvent("load"),
          tileerror: (event) => recordTileEvent("tileerror", event),
          tileload: () => recordTileEvent("tileload"),
        }}
        key={`plain-${basemap.key}-${tileRetry}`}
        opacity={1}
        url={basemap.url}
      />
      <ForceLeafletTileRedraw request={tileRetry} />
      <LeafletTileRuntimeDebugPanel
        basicOnly
        diagnostics={tileDiagnostics}
        onChange={onTileRuntimeDebugChange}
        selectedBasemap={basemap.key}
      />
      {tileDiagnostics.status === "error" ? (
        <div className="map-studio-tile-status is-error">
          <span>Plain map failed to load.</span>
          <button
            type="button"
            onClick={() => {
              setTileDiagnostics((current) => updateTileDiagnostics(current, "retry"));
              setTileRetry((value) => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
    </MapContainer>
  );
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

function getPieceCornerPoints(map: L.Map, piece: SanbornMapPieceGeoreference): QuadPoints {
  return {
    northwest: map.latLngToLayerPoint([piece.corners.northwest?.latitude ?? piece.centerLatitude, piece.corners.northwest?.longitude ?? piece.centerLongitude]),
    northeast: map.latLngToLayerPoint([piece.corners.northeast?.latitude ?? piece.centerLatitude, piece.corners.northeast?.longitude ?? piece.centerLongitude]),
    southeast: map.latLngToLayerPoint([piece.corners.southeast?.latitude ?? piece.centerLatitude, piece.corners.southeast?.longitude ?? piece.centerLongitude]),
    southwest: map.latLngToLayerPoint([piece.corners.southwest?.latitude ?? piece.centerLatitude, piece.corners.southwest?.longitude ?? piece.centerLongitude]),
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

function getPieceSourcePixelBounds(layer: HistoricalPieceMapLayer) {
  const minX = Math.max(0, Math.floor(layer.sourceBBox.minX * layer.sourceImageWidth));
  const minY = Math.max(0, Math.floor(layer.sourceBBox.minY * layer.sourceImageHeight));
  const maxX = Math.min(layer.sourceImageWidth, Math.ceil(layer.sourceBBox.maxX * layer.sourceImageWidth));
  const maxY = Math.min(layer.sourceImageHeight, Math.ceil(layer.sourceBBox.maxY * layer.sourceImageHeight));

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

async function createMaskedPieceImageUrl(layer: HistoricalPieceMapLayer): Promise<{ url: string; width: number; height: number }> {
  if (!layer.imageUrl) {
    throw new Error("Source image URL is unavailable.");
  }

  const sourceBounds = getPieceSourcePixelBounds(layer);
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Source image failed to load."));
  });
  image.src = layer.imageUrl;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = sourceBounds.width;
  canvas.height = sourceBounds.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.beginPath();
  layer.sourcePolygon.forEach((point, index) => {
    const x = point.x * layer.sourceImageWidth - sourceBounds.x;
    const y = point.y * layer.sourceImageHeight - sourceBounds.y;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.closePath();
  context.clip();
  context.drawImage(image, sourceBounds.x, sourceBounds.y, sourceBounds.width, sourceBounds.height, 0, 0, sourceBounds.width, sourceBounds.height);
  context.restore();

  return { url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
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

      element.style.left = "0";
      element.style.top = "0";
      element.style.width = `${bounds.width}px`;
      element.style.height = `${bounds.height}px`;
      L.DomUtil.setPosition(element, offset);
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

    let animationFrame = 0;

    function scheduleUpdateFromMap() {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateFromMap();
      });
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
    map.on("moveend zoomend viewreset resize", scheduleUpdateFromMap);
    updateFromMap();

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      dragCleanup?.();
      interactionCleanupRef.current = null;
      element.removeEventListener("pointerdown", startPointerInteraction);
      map.off("moveend zoomend viewreset resize", scheduleUpdateFromMap);
      element.remove();
      containerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    map.fire("moveend");
  }, [layer, isSelected, mode, globalOpacity, showLabel, map]);

  return null;
}

function TransformedPieceLayer({
  layer,
  isSelected,
  mode,
  onSelect,
  onCommit,
}: {
  layer: HistoricalPieceMapLayer;
  isSelected: boolean;
  mode: HistoricalMapLeafletProps["sheetEditMode"];
  onSelect?: (pieceId: string) => void;
  onCommit?: (pieceId: string, patch: Partial<SanbornMapPieceGeoreference>) => void;
}) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestRef = useRef({ layer, isSelected, mode, onSelect, onCommit });
  latestRef.current = { layer, isSelected, mode, onSelect, onCommit };
  const [maskedImage, setMaskedImage] = useState<{ url: string; width: number; height: number } | null>(null);
  const [maskError, setMaskError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setMaskedImage(null);
    setMaskError("");
    if (!layer.imageUrl) {
      setMaskError("Source image signed URL is unavailable.");
      return;
    }

    void createMaskedPieceImageUrl(layer)
      .then((image) => {
        if (!cancelled) {
          setMaskedImage(image);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMaskError(error instanceof Error ? error.message : "Masked piece image could not be generated.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [layer.imageUrl, layer.pieceId, JSON.stringify(layer.sourcePolygon), layer.sourceImageWidth, layer.sourceImageHeight]);

  useEffect(() => {
    const pane = map.getPane("historical-sheet-pane") ?? map.createPane("historical-sheet-pane");
    pane.style.zIndex = String(leafletPaneStack.historicalSheetPane);
    pane.style.background = "transparent";
    pane.style.opacity = "1";
    pane.style.pointerEvents = "auto";
    const element = L.DomUtil.create("div", "map-studio-piece-overlay", pane);
    const image = L.DomUtil.create("img", "map-studio-piece-overlay__image", element);
    const boundary = L.DomUtil.create("span", "map-studio-piece-overlay__boundary", element);
    const label = L.DomUtil.create("span", "map-studio-piece-overlay__label", element);
    const diagnostics = L.DomUtil.create("span", "map-studio-piece-overlay__diagnostics", element);
    const handles = [
      ["rotate", "rotate"],
      ["center", "drag"],
      ["top-left", "corner"],
      ["top-right", "corner"],
      ["bottom-left", "corner"],
      ["bottom-right", "corner"],
    ].map(([position, action]) => {
      const handle = L.DomUtil.create("button", `map-studio-piece-overlay__handle handle-${position}`, element);
      handle.type = "button";
      handle.dataset.action = action;
      handle.dataset.position = position;
      handle.setAttribute("aria-label", `${action} ${position}`);
      return handle;
    });
    let draft: SanbornMapPieceGeoreference | null = null;
    let dragCleanup: (() => void) | null = null;
    containerRef.current = element;
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);

    function effectiveLayer() {
      return draft ?? latestRef.current.layer;
    }

    function getImageSize() {
      return {
        width: Math.max(1, maskedImage?.width ?? getPieceSourcePixelBounds(latestRef.current.layer).width),
        height: Math.max(1, maskedImage?.height ?? getPieceSourcePixelBounds(latestRef.current.layer).height),
      };
    }

    function setElementTransform(piece: SanbornMapPieceGeoreference) {
      const points = getPieceCornerPoints(map, piece);
      const bounds = getTransformedQuadBounds(points);
      const selected = latestRef.current.isSelected;
      const editMode = latestRef.current.mode === "edit_historical_sheets";
      const visibleHandles = selected && editMode && !piece.isLocked;
      const offset = L.point(bounds.minX, bounds.minY);
      const imageSize = getImageSize();
      const projectiveTransform = getProjectiveTransform(imageSize.width, imageSize.height, points, offset);
      const centerPoint = getPointCenter(points);
      const handlePositions: Record<string, L.Point> = {
        "top-left": points.northwest,
        "top-right": points.northeast,
        "bottom-right": points.southeast,
        "bottom-left": points.southwest,
        center: centerPoint,
        rotate: L.point((points.northwest.x + points.northeast.x) / 2, (points.northwest.y + points.northeast.y) / 2 - 34),
      };

      element.style.left = "0";
      element.style.top = "0";
      element.style.width = `${bounds.width}px`;
      element.style.height = `${bounds.height}px`;
      L.DomUtil.setPosition(element, offset);
      element.style.opacity = String(Math.max(0.05, Math.min(1, piece.opacity)));
      element.style.pointerEvents = editMode ? "auto" : "none";
      element.style.zIndex = String(580 + piece.layerOrder + (selected ? 1000 : 0));
      element.style.cursor = piece.isLocked ? "not-allowed" : editMode ? "grab" : "default";
      element.classList.toggle("is-selected", selected);
      element.classList.toggle("is-locked", piece.isLocked);
      element.classList.toggle("is-hidden", !piece.isVisible);
      element.classList.toggle("has-image-error", Boolean(maskError || latestRef.current.layer.signedUrlError));
      element.classList.toggle("has-invalid-transform", !projectiveTransform.valid);
      image.src = maskedImage?.url ?? "";
      image.alt = latestRef.current.layer.pieceLabel;
      image.style.display = maskedImage?.url ? "block" : "none";
      image.style.width = `${imageSize.width}px`;
      image.style.height = `${imageSize.height}px`;
      image.style.pointerEvents = editMode ? "auto" : "none";
      image.style.transform = projectiveTransform.transform;
      boundary.style.clipPath = `polygon(${points.northwest.x - offset.x}px ${points.northwest.y - offset.y}px, ${points.northeast.x - offset.x}px ${points.northeast.y - offset.y}px, ${points.southeast.x - offset.x}px ${points.southeast.y - offset.y}px, ${points.southwest.x - offset.x}px ${points.southwest.y - offset.y}px)`;
      boundary.style.display = selected ? "block" : "none";
      label.textContent = latestRef.current.layer.pieceLabel;
      label.style.display = selected ? "block" : "none";
      diagnostics.style.display = selected && Boolean(maskError || latestRef.current.layer.signedUrlError || !projectiveTransform.valid) ? "block" : "none";
      diagnostics.textContent = latestRef.current.layer.signedUrlError
        ? `Image: signed URL failed (${latestRef.current.layer.signedUrlError})`
        : maskError
          ? `Piece mask: ${maskError}`
          : !projectiveTransform.valid
            ? "Transform: rectangular fallback"
            : "";
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
      const piece = effectiveLayer();
      if (piece.isVisible) {
        element.style.display = "block";
        setElementTransform(piece);
      } else {
        element.style.display = "none";
      }
    }

    let animationFrame = 0;
    function scheduleUpdateFromMap() {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateFromMap();
      });
    }

    function finishInteraction(nextDraft: SanbornMapPieceGeoreference | null) {
      if (!nextDraft) {
        return;
      }

      const committed = normalizeSanbornMapPieceGeoreference({
        ...nextDraft,
        placementStatus: nextDraft.placementStatus === "aligned" || nextDraft.placementStatus === "reviewed" ? nextDraft.placementStatus : "draft",
      });

      latestRef.current.onCommit?.(committed.pieceId, {
        centerLatitude: committed.centerLatitude,
        centerLongitude: committed.centerLongitude,
        rotation: committed.rotation,
        opacity: committed.opacity,
        placementStatus: committed.placementStatus,
        isVisible: committed.isVisible,
        isLocked: committed.isLocked,
        corners: committed.corners,
      });
    }

    function startPointerInteraction(event: PointerEvent) {
      const current = latestRef.current;
      const piece = current.layer;
      const target = event.target as HTMLElement;
      const action = target.dataset.action ?? "drag";

      if (current.mode !== "edit_historical_sheets") {
        return;
      }

      L.DomEvent.stop(event);
      event.preventDefault();
      event.stopPropagation();
      current.onSelect?.(piece.pieceId);

      if (piece.isLocked) {
        return;
      }

      map.dragging.disable();
      try {
        target.setPointerCapture?.(event.pointerId);
      } catch {
        // Some transformed DOM nodes cannot capture every pointer.
      }
      const startPoints = getPieceCornerPoints(map, piece);
      const start = {
        x: event.clientX,
        y: event.clientY,
        piece,
        points: startPoints,
        centerPoint: getPointCenter(startPoints),
        rotation: piece.rotation,
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
          draft = normalizeSanbornMapPieceGeoreference({ ...start.piece, corners: pointsToCorners(map, nextPoints), placementStatus: "draft" });
        } else if (action === "rotate") {
          const startAngle = Math.atan2(start.y - start.centerPoint.y, start.x - start.centerPoint.x);
          const nextAngle = Math.atan2(moveEvent.clientY - start.centerPoint.y, moveEvent.clientX - start.centerPoint.x);
          const deltaDegrees = ((nextAngle - startAngle) * 180) / Math.PI;
          const nextPoints = rotatePoints(start.points, start.centerPoint, deltaDegrees);
          draft = normalizeSanbornMapPieceGeoreference({ ...start.piece, rotation: start.rotation + deltaDegrees, corners: pointsToCorners(map, nextPoints), placementStatus: "draft" });
        } else {
          const nextPoints = translatePoints(start.points, dx, dy);
          draft = normalizeSanbornMapPieceGeoreference({ ...start.piece, corners: pointsToCorners(map, nextPoints), placementStatus: "draft" });
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
          // Pointer capture may already be released.
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
      }

      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
      document.addEventListener("pointercancel", handleUp);
      dragCleanup = () => {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        document.removeEventListener("pointercancel", handleUp);
      };
    }

    element.addEventListener("pointerdown", startPointerInteraction);
    map.on("moveend zoomend viewreset resize", scheduleUpdateFromMap);
    updateFromMap();

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      dragCleanup?.();
      element.removeEventListener("pointerdown", startPointerInteraction);
      map.off("moveend zoomend viewreset resize", scheduleUpdateFromMap);
      element.remove();
      containerRef.current = null;
    };
  }, [map, maskedImage, maskError]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    map.fire("moveend");
  }, [layer, isSelected, mode, maskedImage, maskError, map]);

  return null;
}

export function HistoricalMapLeaflet(props: HistoricalMapLeafletProps) {
  const basemap = getBasemap(props.basemapKey);
  const derivedBounds = props.plainTileOnly ? null : props.bounds ?? boundsFromCorners(props.corners);
  const polygon = useMemo(() => getCornerPolygon(props.corners), [props.corners]);
  const sheetLayers = props.plainTileOnly ? [] : props.sheetLayers ?? [];
  const pieceLayers = props.plainTileOnly ? [] : props.pieceLayers ?? [];
  const [tileDiagnostics, setTileDiagnostics] = useState(createTileDiagnostics);
  const [tileRetry, setTileRetry] = useState(0);
  const showLegacyOverlayControls = !props.plainTileOnly && sheetLayers.length === 0 && props.overlayVisible;
  const tileStatus = tileDiagnostics.status;
  const overlayRenderMode = props.overlayRenderMode ?? "projective";

  useEffect(() => {
    setTileDiagnostics(createTileDiagnostics());
  }, [basemap.key, tileRetry]);

  useEffect(() => {
    props.onTileDiagnosticsChange?.({
      ...tileDiagnostics,
      basemapKey: basemap.key,
      tileLayerMounted: true,
    });
  }, [basemap.key, props.onTileDiagnosticsChange, tileDiagnostics]);

  function recordTileEvent(event: "loading" | "tileload" | "tileerror" | "load", details?: unknown) {
    const failedHost = event === "tileerror" ? getTileHost(details) : null;

    if (event === "tileerror" && process.env.NODE_ENV !== "production") {
      const tile = (details as { tile?: HTMLImageElement } | undefined)?.tile;
      console.warn("Historical Map Studio basemap tile failed", {
        basemap: basemap.key,
        source: tile?.currentSrc || tile?.src || "unknown",
      });
    }

    setTileDiagnostics((current) => updateTileDiagnostics(current, event, { failedHost }));
  }

  return (
    <MapContainer center={props.center} className="map-studio-leaflet-map" scrollWheelZoom zoom={props.zoom}>
      {props.plainTileOnly ? null : <ConfigureLeafletPanes request={props.fitBoundsRequest + tileRetry} />}
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
      <SyncMapView center={props.center} onViewMutation={props.onMapViewMutation} request={props.viewRefreshRequest ?? 0} source={props.requestedViewSource ?? "requested_view"} zoom={props.zoom} />
      <InvalidateMapSize request={props.fitBoundsRequest} />
      <ForceLeafletTileRedraw onViewMutation={props.onMapViewMutation} request={props.viewRefreshRequest ?? 0} />
      {props.plainTileOnly ? null : <MapInteractionMode mode={props.sheetEditMode ?? "pan_modern_map"} />}
      <MapEvents onCursorMove={props.onCursorMove} onMapClick={props.onMapClick} onMapInteractionChange={props.onMapInteractionChange} onMapViewChange={props.onMapViewChange} />
      <FitBounds bounds={derivedBounds} enabled={props.fitBoundsEnabled ?? true} onViewMutation={props.onMapViewMutation} request={props.fitBoundsRequest} />

      {pieceLayers
        .filter((piece) => piece.imageUrl && piece.isVisible)
        .sort((a, b) => a.layerOrder - b.layerOrder)
        .map((piece) => (
          <TransformedPieceLayer
            isSelected={props.selectedPieceId === piece.pieceId}
            key={piece.pieceId}
            layer={piece}
            mode={props.sheetEditMode ?? "pan_modern_map"}
            onCommit={props.onPieceTransformCommit}
            onSelect={props.onSelectPiece}
          />
        ))}

      {overlayRenderMode === "projective" ? sheetLayers
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
        )) : null}

      {overlayRenderMode === "rectangular" ? sheetLayers
        .filter((sheet) => sheet.imageUrl && sheet.isVisible)
        .sort((a, b) => a.layerOrder - b.layerOrder)
        .map((sheet) => {
          const bounds = boundsFromCorners(sheet.corners);
          const polygon = getCornerPolygon(sheet.corners);

          if (!bounds) {
            return null;
          }

          return (
            <Fragment key={sheet.assetId}>
              <ImageOverlay bounds={boundsToLeaflet(bounds)} opacity={Math.max(0.05, Math.min(1, sheet.opacity * (props.globalHistoricalOpacity ?? 1)))} url={sheet.imageUrl!} />
              {props.showSheetBoundaries && polygon.length >= 3 ? <Polygon pathOptions={{ color: "#e2be7e", weight: props.selectedSheetAssetId === sheet.assetId ? 3 : 1, fill: false }} positions={polygon} /> : null}
            </Fragment>
          );
        }) : null}

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

      {!props.plainTileOnly && props.locationMarker ? (
        <Marker icon={markerIcon("is-location", "LOC")} position={[props.locationMarker.latitude, props.locationMarker.longitude]} />
      ) : null}

      <LeafletTileRuntimeDebugPanel
        diagnostics={tileDiagnostics}
        onChange={props.onTileRuntimeDebugChange}
        selectedBasemap={basemap.key}
      />

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
