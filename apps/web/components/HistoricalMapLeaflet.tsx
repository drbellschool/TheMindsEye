"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { ImageOverlay, MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLngExpression, LatLngTuple } from "leaflet";

import { boundsFromCorners, type GeoBounds, type GeoCorners, type HistoricalMapControlPoint } from "@/lib/historical-map-georeference";
import {
  deriveSheetGeoCorners,
  normalizeSheetGeographicTransform,
  type GeoEditMode,
  type SheetGeographicTransform,
} from "@/lib/historical-map-sheet-georeference";

type BasemapConfig = {
  key: string;
  label: string;
  url: string;
  attribution: string;
};

export const basemaps: BasemapConfig[] = [
  {
    key: "osm",
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
];

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
};

export type HistoricalSheetMapLayer = SheetGeographicTransform & {
  imageUrl: string | null;
  sheetNumber: number | null;
  originalFilename: string;
  width: number;
  height: number;
  signedUrlError?: string;
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

function getSheetBasePixelSize(map: L.Map, sheet: SheetGeographicTransform) {
  const center = L.latLng(sheet.centerLatitude, sheet.centerLongitude);
  const west = L.latLng(sheet.centerLatitude, sheet.centerLongitude - sheet.longitudeSpan / 2);
  const east = L.latLng(sheet.centerLatitude, sheet.centerLongitude + sheet.longitudeSpan / 2);
  const north = L.latLng(sheet.centerLatitude + sheet.latitudeSpan / 2, sheet.centerLongitude);
  const south = L.latLng(sheet.centerLatitude - sheet.latitudeSpan / 2, sheet.centerLongitude);
  const centerPoint = map.latLngToLayerPoint(center);
  const westPoint = map.latLngToLayerPoint(west);
  const eastPoint = map.latLngToLayerPoint(east);
  const northPoint = map.latLngToLayerPoint(north);
  const southPoint = map.latLngToLayerPoint(south);

  return {
    centerPoint,
    width: Math.max(24, Math.abs(eastPoint.x - westPoint.x)),
    height: Math.max(24, Math.abs(southPoint.y - northPoint.y)),
  };
}

function TransformedSheetLayer({
  layer,
  isSelected,
  mode,
  globalOpacity,
  showLabel,
  onSelect,
  onCommit,
}: {
  layer: HistoricalSheetMapLayer;
  isSelected: boolean;
  mode: HistoricalMapLeafletProps["sheetEditMode"];
  globalOpacity: number;
  showLabel: boolean;
  onSelect?: (assetId: string) => void;
  onCommit?: (assetId: string, patch: Partial<SheetGeographicTransform>) => void;
}) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestRef = useRef({ layer, isSelected, mode, globalOpacity, showLabel, onSelect, onCommit });
  latestRef.current = { layer, isSelected, mode, globalOpacity, showLabel, onSelect, onCommit };

  useEffect(() => {
    const pane = map.getPanes().overlayPane;
    const element = L.DomUtil.create("div", "map-studio-sheet-overlay", pane);
    const image = L.DomUtil.create("img", "map-studio-sheet-overlay__image", element);
    const label = L.DomUtil.create("span", "map-studio-sheet-overlay__label", element);
    const boundary = L.DomUtil.create("span", "map-studio-sheet-overlay__boundary", element);
    const handles = [
      ["rotate", "rotate"],
      ["top-left", "scale"],
      ["top-center", "scale"],
      ["top-right", "scale"],
      ["middle-left", "scale"],
      ["middle-right", "scale"],
      ["bottom-left", "scale"],
      ["bottom-center", "scale"],
      ["bottom-right", "scale"],
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
    containerRef.current = element;

    function effectiveLayer() {
      return draft ?? latestRef.current.layer;
    }

    function setElementTransform(sheet: SheetGeographicTransform) {
      const { centerPoint, width, height } = getSheetBasePixelSize(map, sheet);
      const selected = latestRef.current.isSelected;
      const currentMode = latestRef.current.mode;
      const editMode = currentMode === "edit_historical_sheets";
      const visibleHandles = selected && editMode && !sheet.isLocked;
      const signedScaleX = sheet.scaleX * (sheet.isFlippedHorizontally ? -1 : 1);
      const signedScaleY = sheet.scaleY * (sheet.isFlippedVertically ? -1 : 1);

      element.style.left = `${centerPoint.x}px`;
      element.style.top = `${centerPoint.y}px`;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.opacity = String(sheet.opacity * latestRef.current.globalOpacity);
      element.style.pointerEvents = editMode || selected ? "auto" : "none";
      element.style.zIndex = String(400 + sheet.layerOrder + (selected ? 1000 : 0));
      element.style.transform = `translate(-50%, -50%) rotate(${sheet.rotation}deg) skew(${sheet.skewX}deg, ${sheet.skewY}deg) scale(${signedScaleX}, ${signedScaleY})`;
      element.classList.toggle("is-selected", selected);
      element.classList.toggle("is-locked", sheet.isLocked);
      element.classList.toggle("is-hidden", !sheet.isVisible);
      image.src = latestRef.current.layer.imageUrl ?? "";
      image.alt = `Sanborn sheet ${latestRef.current.layer.sheetNumber ?? "unknown"}`;
      label.textContent = latestRef.current.showLabel ? `Sheet ${latestRef.current.layer.sheetNumber ?? "unknown"}` : "";
      label.style.display = latestRef.current.showLabel ? "block" : "none";
      boundary.style.display = selected || latestRef.current.showLabel ? "block" : "none";
      handles.forEach((handle) => {
        handle.style.display = visibleHandles ? "block" : "none";
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
        corners: deriveSheetGeoCorners(nextDraft),
      });

      latestRef.current.onCommit?.(committed.assetId, {
        centerLatitude: committed.centerLatitude,
        centerLongitude: committed.centerLongitude,
        latitudeSpan: committed.latitudeSpan,
        longitudeSpan: committed.longitudeSpan,
        rotation: committed.rotation,
        scaleX: committed.scaleX,
        scaleY: committed.scaleY,
        corners: committed.corners,
      });
    }

    function startPointerInteraction(event: PointerEvent) {
      const current = latestRef.current;
      const sheet = current.layer;
      const action = (event.target as HTMLElement).dataset.action ?? "drag";

      if (current.mode !== "edit_historical_sheets") {
        return;
      }

      L.DomEvent.stop(event);
      event.preventDefault();
      current.onSelect?.(sheet.assetId);

      if (sheet.isLocked) {
        return;
      }

      map.dragging.disable();
      const start = {
        x: event.clientX,
        y: event.clientY,
        sheet,
        centerPoint: map.latLngToLayerPoint([sheet.centerLatitude, sheet.centerLongitude]),
        rotation: sheet.rotation,
        scaleX: sheet.scaleX,
        scaleY: sheet.scaleY,
      };

      function handleMove(moveEvent: PointerEvent) {
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;

        if (action === "rotate") {
          const center = getSheetBasePixelSize(map, start.sheet).centerPoint;
          const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
          const nextAngle = Math.atan2(moveEvent.clientY - center.y, moveEvent.clientX - center.x);
          draft = normalizeSheetGeographicTransform({
            ...start.sheet,
            rotation: start.rotation + ((nextAngle - startAngle) * 180) / Math.PI,
          });
        } else if (action === "scale") {
          const position = (event.target as HTMLElement).dataset.position ?? "";
          const directionX = position.includes("left") ? -1 : position.includes("right") ? 1 : 0;
          const directionY = position.includes("top") ? -1 : position.includes("bottom") ? 1 : 0;
          const { width, height } = getSheetBasePixelSize(map, start.sheet);
          const scaleX = directionX === 0 ? start.scaleX : start.scaleX + (dx * directionX) / Math.max(width, 80);
          const scaleY = directionY === 0 ? start.scaleY : start.scaleY + (dy * directionY) / Math.max(height, 80);
          draft = normalizeSheetGeographicTransform({
            ...start.sheet,
            scaleX,
            scaleY,
          });
        } else {
          const nextPoint = L.point(start.centerPoint.x + dx, start.centerPoint.y + dy);
          const nextLatLng = map.layerPointToLatLng(nextPoint);
          draft = normalizeSheetGeographicTransform({
            ...start.sheet,
            centerLatitude: nextLatLng.lat,
            centerLongitude: nextLatLng.lng,
          });
        }

        updateFromMap();
      }

      function handleUp() {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        map.dragging.enable();
        finishInteraction(draft);
        draft = null;
        updateFromMap();
      }

      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
      dragCleanup = () => {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
      };
    }

    element.addEventListener("pointerdown", startPointerInteraction);
    map.on("move zoom viewreset", updateFromMap);
    updateFromMap();

    return () => {
      dragCleanup?.();
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

    const sheet = latestRef.current.layer;
    const { centerPoint, width, height } = getSheetBasePixelSize(map, sheet);
    const signedScaleX = sheet.scaleX * (sheet.isFlippedHorizontally ? -1 : 1);
    const signedScaleY = sheet.scaleY * (sheet.isFlippedVertically ? -1 : 1);

    element.style.left = `${centerPoint.x}px`;
    element.style.top = `${centerPoint.y}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.opacity = String(sheet.opacity * latestRef.current.globalOpacity);
    element.style.display = sheet.isVisible ? "block" : "none";
    element.style.pointerEvents = latestRef.current.mode === "edit_historical_sheets" || latestRef.current.isSelected ? "auto" : "none";
    element.style.zIndex = String(400 + sheet.layerOrder + (latestRef.current.isSelected ? 1000 : 0));
    element.style.transform = `translate(-50%, -50%) rotate(${sheet.rotation}deg) skew(${sheet.skewX}deg, ${sheet.skewY}deg) scale(${signedScaleX}, ${signedScaleY})`;
    element.classList.toggle("is-selected", latestRef.current.isSelected);
    element.classList.toggle("is-locked", sheet.isLocked);
    element.classList.toggle("is-hidden", !sheet.isVisible);
    element.querySelectorAll<HTMLElement>(".map-studio-sheet-overlay__handle").forEach((handle) => {
      handle.style.display = latestRef.current.isSelected && latestRef.current.mode === "edit_historical_sheets" && !sheet.isLocked ? "block" : "none";
    });
    const label = element.querySelector<HTMLElement>(".map-studio-sheet-overlay__label");
    if (label) {
      label.textContent = latestRef.current.showLabel ? `Sheet ${latestRef.current.layer.sheetNumber ?? "unknown"}` : "";
      label.style.display = latestRef.current.showLabel ? "block" : "none";
    }
    const img = element.querySelector<HTMLImageElement>(".map-studio-sheet-overlay__image");
    if (img && latestRef.current.layer.imageUrl) {
      img.src = latestRef.current.layer.imageUrl;
    }
  }, [layer, isSelected, mode, globalOpacity, showLabel, map]);

  return null;
}

export function HistoricalMapLeaflet(props: HistoricalMapLeafletProps) {
  const basemap = basemaps.find((candidate) => candidate.key === props.basemapKey) ?? basemaps[0];
  const derivedBounds = props.bounds ?? boundsFromCorners(props.corners);
  const polygon = useMemo(() => getCornerPolygon(props.corners), [props.corners]);
  const sheetLayers = props.sheetLayers ?? [];

  return (
    <MapContainer center={props.center} className="map-studio-leaflet-map" scrollWheelZoom zoom={props.zoom}>
      <TileLayer attribution={basemap.attribution} opacity={props.modernLayerVisible === false ? 0 : 1} url={basemap.url} />
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
            onSelect={props.onSelectSheet}
            showLabel={props.showSheetLabels ?? true}
          />
        ))}

      {sheetLayers.length === 0 && props.overlayVisible && props.imageUrl && derivedBounds ? (
        <ImageOverlay bounds={boundsToLeaflet(derivedBounds)} opacity={props.overlayOpacity} url={props.imageUrl} />
      ) : null}

      {props.showSheetBoundaries && polygon.length >= 3 ? <Polygon pathOptions={{ color: "#e2be7e", weight: 2, fill: false }} positions={polygon} /> : null}

      {(["northwest", "northeast", "southeast", "southwest"] as Array<keyof GeoCorners>).map((corner) => {
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
            icon={markerIcon("is-corner", corner.slice(0, 2).toUpperCase())}
            key={corner}
            position={[coordinate.latitude, coordinate.longitude]}
          />
        );
      })}

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
    </MapContainer>
  );
}
