"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";

import { basemaps, getBasemap } from "@/lib/historical-map-basemap";
import type { BirdsEyeControlPoint } from "@/lib/birds-eye-calibration";
import type { BirdsEyeCanonicalMapPiece } from "@/lib/birds-eye-map-pieces";
import { getBirdsEyePlacedGeometryCoordinates } from "@/lib/birds-eye-scene";
import type { SheetGeographicTransform } from "@/lib/historical-map-sheet-georeference";
import { centeredBirdsEyeMarkerAnchor } from "@/lib/birds-eye-interaction";

export type BirdsEyeSourceMapFitMode = "town" | "pieces" | "selected_point";

type Props = {
  activeToken: number;
  basemapKey: string;
  center: LatLngTuple;
  controlPoints: BirdsEyeControlPoint[];
  fitRequest: { mode: BirdsEyeSourceMapFitMode; token: number };
  onBasemapChange: (key: string) => void;
  onCursorMove: (latitude: number, longitude: number) => void;
  onMapClick: (latitude: number, longitude: number, zoom: number) => void;
  onMapViewChange: (center: LatLngTuple, zoom: number) => void;
  onPointMove: (sequence: number, latitude: number, longitude: number, zoom: number) => void;
  onSelectPoint: (sequence: number) => void;
  mapPieces: BirdsEyeCanonicalMapPiece[];
  readOnly: boolean;
  selectedSequence: number | null;
  sheetBoundaries?: SheetGeographicTransform[];
  showControlPoints: boolean;
  showMapPieces: boolean;
  showSheetBoundaries: boolean;
  townCenter: LatLngTuple | null;
  zoom: number;
};

function pointIcon(sequence: number, selected: boolean, complete: boolean) {
  const size = 30;
  return L.divIcon({
    className: `birds-eye-map-point${selected ? " is-selected" : ""}${complete ? " is-complete" : " is-incomplete"}`,
    html: `<span aria-hidden="true">${sequence}</span>`,
    iconAnchor: centeredBirdsEyeMarkerAnchor(size),
    iconSize: [size, size],
  });
}

function SourceMapEvents({ onCursorMove, onMapClick, onMapViewChange }: Pick<Props, "onCursorMove" | "onMapClick" | "onMapViewChange">) {
  const map = useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng, map.getZoom());
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

function SourceMapController({
  activeToken,
  center,
  fitRequest,
  pieces,
  points,
  selectedSequence,
  zoom,
}: {
  activeToken: number;
  center: LatLngTuple;
  fitRequest: Props["fitRequest"];
  pieces: BirdsEyeCanonicalMapPiece[];
  points: BirdsEyeControlPoint[];
  selectedSequence: number | null;
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    const invalidate = () => map.invalidateSize({ pan: false });
    const frame = window.requestAnimationFrame(invalidate);
    const container = map.getContainer();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(invalidate);
    observer?.observe(container);
    window.addEventListener("resize", invalidate);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", invalidate);
    };
  }, [activeToken, map]);
  useEffect(() => {
    if (fitRequest.token === 0) return;
    if (fitRequest.mode === "town") {
      map.setView(center, zoom);
      return;
    }
    if (fitRequest.mode === "selected_point") {
      const selected = points.find((point) => point.sequence === selectedSequence && point.latitude !== null && point.longitude !== null);
      if (selected) map.flyTo([selected.latitude!, selected.longitude!], Math.max(map.getZoom(), 17));
      return;
    }
    const coordinates = pieces.flatMap(getBirdsEyePlacedGeometryCoordinates);
    if (coordinates.length > 0) {
      const bounds: LatLngBoundsExpression = coordinates.map((coordinate) => [coordinate.latitude, coordinate.longitude] as LatLngTuple);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 });
    }
    // A fit request is an explicit viewport command. Keeping this effect tied
    // to that request object prevents ordinary point or geometry edits from
    // resetting the user's current Leaflet pan and zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest, map]);
  return null;
}

function pieceColor(pieceId: string, selectedSequence: number | null, points: BirdsEyeControlPoint[]): string {
  return points.find((point) => point.sequence === selectedSequence)?.linkedMapPieceId === pieceId ? "#f6c65b" : "#6d4fb3";
}

export function BirdsEyeSourceMap(props: Props) {
  const basemap = getBasemap(props.basemapKey);
  const completePoints = useMemo(() => props.controlPoints.filter((point) => point.latitude !== null && point.longitude !== null), [props.controlPoints]);
  const visiblePieces = useMemo(() => props.mapPieces.filter((piece) => piece.isEligible && piece.isVisible !== false), [props.mapPieces]);

  return (
    <section className="birds-eye-source-map" aria-label="Flat Geographic Map">
      <div className="birds-eye-source-map__toolbar">
        <label>
          Basemap
          <select aria-label="Flat map basemap" value={basemap.key} onChange={(event) => props.onBasemapChange(event.target.value)}>
            {basemaps.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
          </select>
        </label>
        <span>{props.showMapPieces ? `${visiblePieces.length} eligible Map Pieces` : "Map Pieces hidden"}</span>
      </div>
      <MapContainer
        center={props.center}
        className="birds-eye-source-map__leaflet"
        maxZoom={basemap.maxZoom}
        scrollWheelZoom
        zoom={props.zoom}
        zoomDelta={0.5}
        zoomSnap={0.25}
      >
        <TileLayer
          attribution={basemap.attribution}
          key={basemap.key}
          maxNativeZoom={basemap.maxNativeZoom}
          maxZoom={basemap.maxZoom}
          url={basemap.url}
        />
        <SourceMapEvents onCursorMove={props.onCursorMove} onMapClick={props.onMapClick} onMapViewChange={props.onMapViewChange} />
        <SourceMapController
          activeToken={props.activeToken}
          center={props.center}
          fitRequest={props.fitRequest}
          pieces={visiblePieces}
          points={props.controlPoints}
          selectedSequence={props.selectedSequence}
          zoom={props.zoom}
        />
        {props.townCenter ? (
          <CircleMarker
            center={props.townCenter}
            pathOptions={{ color: "#234f5e", dashArray: "2 3", fillColor: "#fff8e9", fillOpacity: 0.75, weight: 2 }}
            radius={7}
          >
            <Tooltip>Town center</Tooltip>
          </CircleMarker>
        ) : null}
        {props.showSheetBoundaries ? (props.sheetBoundaries ?? []).filter((sheet) => sheet.placementStatus !== "unplaced" && sheet.isVisible).map((sheet) => {
          const positions = [sheet.corners.northwest, sheet.corners.northeast, sheet.corners.southeast, sheet.corners.southwest]
            .filter((coordinate): coordinate is NonNullable<typeof coordinate> => Boolean(coordinate))
            .map((coordinate) => [coordinate.latitude, coordinate.longitude] as LatLngTuple);
          return positions.length >= 3 ? <Polygon fill={false} key={sheet.assetId} pathOptions={{ color: "#a97335", dashArray: "5 5", weight: 1.5 }} positions={positions}><Tooltip>{sheet.assetId}</Tooltip></Polygon> : null;
        }) : null}
        {props.showMapPieces ? visiblePieces.map((piece) => {
          const coordinates = getBirdsEyePlacedGeometryCoordinates(piece);
          const positions = coordinates.map((coordinate) => [coordinate.latitude, coordinate.longitude] as LatLngTuple);
          const color = pieceColor(piece.id, props.selectedSequence, props.controlPoints);
          if (positions.length >= 3 && (piece.geometry?.geometryType ?? "polygon") === "polygon") {
            return <Polygon key={piece.id} pathOptions={{ color, fillColor: color, fillOpacity: 0.18, weight: 2 }} positions={positions}><Tooltip>{piece.label}</Tooltip></Polygon>;
          }
          if (positions.length >= 2) return <Polyline key={piece.id} pathOptions={{ color, weight: 3 }} positions={positions}><Tooltip>{piece.label}</Tooltip></Polyline>;
          if (positions.length === 1) return <CircleMarker center={positions[0]} key={piece.id} pathOptions={{ color, fillColor: color, fillOpacity: 0.7 }} radius={6}><Tooltip>{piece.label}</Tooltip></CircleMarker>;
          return null;
        }) : null}
        {props.showControlPoints ? completePoints.map((point) => (
          <Marker
            draggable={!props.readOnly}
            eventHandlers={{
              click: () => props.onSelectPoint(point.sequence),
              dragend: (event) => {
                if (props.readOnly) return;
                const marker = event.target as L.Marker;
                const coordinate = marker.getLatLng();
                props.onPointMove(point.sequence, coordinate.lat, coordinate.lng, props.zoom);
              },
            }}
            icon={pointIcon(point.sequence, point.sequence === props.selectedSequence, point.imageX !== null && point.imageY !== null)}
            key={point.id || point.sequence}
            position={[point.latitude!, point.longitude!]}
            title={`${point.sequence}. ${point.label}`}
          >
            <Tooltip>{point.sequence}. {point.label}</Tooltip>
          </Marker>
        )) : null}
      </MapContainer>
    </section>
  );
}
