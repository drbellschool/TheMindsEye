"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { ImageOverlay, MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLngExpression, LatLngTuple } from "leaflet";

import { boundsFromCorners, type GeoBounds, type GeoCorners, type HistoricalMapControlPoint } from "@/lib/historical-map-georeference";

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
  onMapClick: (latitude: number, longitude: number) => void;
  onMarkerDrag: (controlPointId: string, latitude: number, longitude: number) => void;
  onCornerDrag: (corner: keyof GeoCorners, latitude: number, longitude: number) => void;
  onCursorMove: (latitude: number, longitude: number) => void;
  onMapViewChange: (center: LatLngTuple, zoom: number) => void;
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

function FitBounds({ bounds, request }: { bounds: GeoBounds | null; request: number }) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(boundsToLeaflet(bounds), { padding: [40, 40] });
    }
  }, [bounds, map, request]);

  return null;
}

export function HistoricalMapLeaflet(props: HistoricalMapLeafletProps) {
  const basemap = basemaps.find((candidate) => candidate.key === props.basemapKey) ?? basemaps[0];
  const derivedBounds = props.bounds ?? boundsFromCorners(props.corners);
  const polygon = useMemo(() => getCornerPolygon(props.corners), [props.corners]);

  return (
    <MapContainer center={props.center} className="map-studio-leaflet-map" scrollWheelZoom zoom={props.zoom}>
      <TileLayer attribution={basemap.attribution} url={basemap.url} />
      <MapEvents onCursorMove={props.onCursorMove} onMapClick={props.onMapClick} onMapViewChange={props.onMapViewChange} />
      <FitBounds bounds={derivedBounds} request={props.fitBoundsRequest} />

      {props.overlayVisible && props.imageUrl && derivedBounds ? (
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
