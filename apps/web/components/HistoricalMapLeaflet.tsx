"use client";

import { useEffect, useMemo, useRef } from "react";
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
  overlayMoveEnabled: boolean;
  showControlPoints: boolean;
  showSheetBoundaries: boolean;
  fitBoundsRequest: number;
  onMapClick: (latitude: number, longitude: number) => void;
  onMarkerDrag: (controlPointId: string, latitude: number, longitude: number) => void;
  onCornerDrag: (corner: keyof GeoCorners, latitude: number, longitude: number) => void;
  onOverlayTranslate: (deltaLatitude: number, deltaLongitude: number) => void;
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
  overlayMoveEnabled,
  onMapClick,
  onCursorMove,
  onMapViewChange,
}: Pick<HistoricalMapLeafletProps, "overlayMoveEnabled" | "onMapClick" | "onCursorMove" | "onMapViewChange">) {
  const map = useMapEvents({
    click(event) {
      if (overlayMoveEnabled) {
        L.DomEvent.stop(event.originalEvent);
        return;
      }

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

function OverlayDragController({
  enabled,
  onOverlayTranslate,
}: {
  enabled: boolean;
  onOverlayTranslate: HistoricalMapLeafletProps["onOverlayTranslate"];
}) {
  const lastLatLngRef = useRef<L.LatLng | null>(null);
  const map = useMapEvents({
    mousedown(event) {
      if (!enabled) {
        return;
      }

      L.DomEvent.stop(event.originalEvent);
      lastLatLngRef.current = event.latlng;
      map.getContainer().style.cursor = "grabbing";
    },
    mousemove(event) {
      if (!enabled || !lastLatLngRef.current) {
        return;
      }

      L.DomEvent.stop(event.originalEvent);
      const previous = lastLatLngRef.current;
      const deltaLatitude = event.latlng.lat - previous.lat;
      const deltaLongitude = event.latlng.lng - previous.lng;

      if (Number.isFinite(deltaLatitude) && Number.isFinite(deltaLongitude) && (deltaLatitude !== 0 || deltaLongitude !== 0)) {
        onOverlayTranslate(deltaLatitude, deltaLongitude);
      }

      lastLatLngRef.current = event.latlng;
    },
    mouseup(event) {
      if (!enabled) {
        return;
      }

      L.DomEvent.stop(event.originalEvent);
      lastLatLngRef.current = null;
      map.getContainer().style.cursor = "grab";
    },
    mouseout() {
      if (enabled) {
        lastLatLngRef.current = null;
      }
    },
  });

  useEffect(() => {
    if (enabled) {
      map.dragging.disable();
      map.getContainer().style.cursor = "grab";
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = "";
      lastLatLngRef.current = null;
    }

    return () => {
      map.dragging.enable();
      map.getContainer().style.cursor = "";
    };
  }, [enabled, map]);

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
      <MapEvents overlayMoveEnabled={props.overlayMoveEnabled} onCursorMove={props.onCursorMove} onMapClick={props.onMapClick} onMapViewChange={props.onMapViewChange} />
      <OverlayDragController enabled={props.overlayMoveEnabled} onOverlayTranslate={props.onOverlayTranslate} />
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
            draggable={!props.overlayMoveEnabled}
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
                draggable={!props.overlayMoveEnabled}
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
