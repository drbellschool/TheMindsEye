export const georeferenceStatuses = ["not_started", "bounding_box", "control_points_draft", "aligned_draft", "reviewed"] as const;
export const georeferenceTargetTypes = ["sheet", "workspace"] as const;
export const transformationTypes = ["none", "bounding_box", "affine"] as const;
export const defaultBasemapKey = "osm";

export type GeoreferenceStatus = (typeof georeferenceStatuses)[number];
export type GeoreferenceTargetType = (typeof georeferenceTargetTypes)[number];
export type TransformationType = (typeof transformationTypes)[number];

export type GeoCoordinate = {
  latitude: number;
  longitude: number;
};

export type GeoBounds = {
  northLatitude: number;
  southLatitude: number;
  eastLongitude: number;
  westLongitude: number;
};

export type GeoCorners = {
  northwest: GeoCoordinate | null;
  northeast: GeoCoordinate | null;
  southeast: GeoCoordinate | null;
  southwest: GeoCoordinate | null;
};

export const geoCornerLabels: Record<keyof GeoCorners, string> = {
  northwest: "NW",
  northeast: "NE",
  southeast: "SE",
  southwest: "SW",
};

export function getGeoCornerLabel(corner: keyof GeoCorners): string {
  return geoCornerLabels[corner];
}

export type HistoricalMapControlPoint = {
  controlPointId: string;
  targetAssetId: string | null;
  label: string;
  imageX: number | null;
  imageY: number | null;
  latitude: number | null;
  longitude: number | null;
  confidence: string;
  residualError: number | null;
  isComplete: boolean;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type HistoricalMapGeoreference = {
  georeferenceId: string;
  targetType: GeoreferenceTargetType;
  targetAssetId: string | null;
  status: GeoreferenceStatus;
  transformationType: TransformationType;
  bounds: GeoBounds | null;
  corners: GeoCorners;
  transformMatrix: AffineTransformMatrix | null;
  residualError: number | null;
  controlPointCount: number;
  reviewStatus: string;
  evidenceClassification: string;
  notes: string | null;
  overlayOpacity: number;
  overlayVisible: boolean;
  selectedBasemap: string;
  showControlPoints: boolean;
  showSheetBoundaries: boolean;
  renderingMode: "rectangular_preview" | "warped_preview";
  updatedAt: string | null;
  controlPoints: HistoricalMapControlPoint[];
};

export type AffineTransformMatrix = {
  latitude: [number, number, number];
  longitude: [number, number, number];
};

export type PairedControlPoint = {
  imageX: number;
  imageY: number;
  latitude: number;
  longitude: number;
};

export function normalizeGeoreferenceStatus(value: string | null | undefined): GeoreferenceStatus {
  return georeferenceStatuses.includes(value as GeoreferenceStatus) ? (value as GeoreferenceStatus) : "not_started";
}

export function normalizeGeoreferenceTargetType(value: string | null | undefined): GeoreferenceTargetType {
  return georeferenceTargetTypes.includes(value as GeoreferenceTargetType) ? (value as GeoreferenceTargetType) : "sheet";
}

export function normalizeTransformationType(value: string | null | undefined): TransformationType {
  return transformationTypes.includes(value as TransformationType) ? (value as TransformationType) : "none";
}

export function clampOverlayOpacity(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return 0.65;
  }

  return Math.max(0, Math.min(1, Number(value)));
}

export function isValidLatitude(value: number | null | undefined): value is number {
  return Number.isFinite(value) && Number(value) >= -90 && Number(value) <= 90;
}

export function isValidLongitude(value: number | null | undefined): value is number {
  return Number.isFinite(value) && Number(value) >= -180 && Number(value) <= 180;
}

export function isFiniteImageCoordinate(value: number | null | undefined): value is number {
  return Number.isFinite(value);
}

export function validateGeoCoordinate(coordinate: GeoCoordinate): { ok: true } | { ok: false; error: string } {
  if (!isValidLatitude(coordinate.latitude)) {
    return { ok: false, error: "Latitude must be between -90 and 90." };
  }

  if (!isValidLongitude(coordinate.longitude)) {
    return { ok: false, error: "Longitude must be between -180 and 180." };
  }

  return { ok: true };
}

export function isNearZeroCoordinate(coordinate: GeoCoordinate | null | undefined, tolerance = 0.000001): boolean {
  return Boolean(coordinate && Math.abs(coordinate.latitude) <= tolerance && Math.abs(coordinate.longitude) <= tolerance);
}

export function isOperationalMapCenter(coordinate: GeoCoordinate | null | undefined, allowZeroZero = false): coordinate is GeoCoordinate {
  if (!coordinate || !validateGeoCoordinate(coordinate).ok) {
    return false;
  }

  return allowZeroZero || !isNearZeroCoordinate(coordinate);
}

export function normalizeGeoBounds(input: Partial<GeoBounds> | null | undefined): GeoBounds | null {
  if (
    !isValidLatitude(input?.northLatitude) ||
    !isValidLatitude(input?.southLatitude) ||
    !isValidLongitude(input?.eastLongitude) ||
    !isValidLongitude(input?.westLongitude)
  ) {
    return null;
  }

  const northLatitude = Math.max(input.northLatitude, input.southLatitude);
  const southLatitude = Math.min(input.northLatitude, input.southLatitude);
  const eastLongitude = Math.max(input.eastLongitude, input.westLongitude);
  const westLongitude = Math.min(input.eastLongitude, input.westLongitude);

  if (northLatitude === southLatitude || eastLongitude === westLongitude) {
    return null;
  }

  return {
    northLatitude,
    southLatitude,
    eastLongitude,
    westLongitude,
  };
}

export function boundsFromCorners(corners: GeoCorners): GeoBounds | null {
  const coordinates = [corners.northwest, corners.northeast, corners.southeast, corners.southwest].filter(
    (coordinate): coordinate is GeoCoordinate => Boolean(coordinate),
  );

  if (coordinates.length < 2 || coordinates.some((coordinate) => !validateGeoCoordinate(coordinate).ok)) {
    return null;
  }

  return normalizeGeoBounds({
    northLatitude: Math.max(...coordinates.map((coordinate) => coordinate.latitude)),
    southLatitude: Math.min(...coordinates.map((coordinate) => coordinate.latitude)),
    eastLongitude: Math.max(...coordinates.map((coordinate) => coordinate.longitude)),
    westLongitude: Math.min(...coordinates.map((coordinate) => coordinate.longitude)),
  });
}

export function cornersFromBounds(bounds: GeoBounds | null): GeoCorners {
  if (!bounds) {
    return {
      northwest: null,
      northeast: null,
      southeast: null,
      southwest: null,
    };
  }

  return {
    northwest: { latitude: bounds.northLatitude, longitude: bounds.westLongitude },
    northeast: { latitude: bounds.northLatitude, longitude: bounds.eastLongitude },
    southeast: { latitude: bounds.southLatitude, longitude: bounds.eastLongitude },
    southwest: { latitude: bounds.southLatitude, longitude: bounds.westLongitude },
  };
}

export function normalizeControlPoint(input: Partial<HistoricalMapControlPoint> & { controlPointId: string }): HistoricalMapControlPoint {
  return {
    controlPointId: input.controlPointId,
    targetAssetId: input.targetAssetId ?? null,
    label: input.label?.trim().slice(0, 120) || input.controlPointId,
    imageX: isFiniteImageCoordinate(input.imageX) ? Number(input.imageX) : null,
    imageY: isFiniteImageCoordinate(input.imageY) ? Number(input.imageY) : null,
    latitude: isValidLatitude(input.latitude) ? Number(input.latitude) : null,
    longitude: isValidLongitude(input.longitude) ? Number(input.longitude) : null,
    confidence: input.confidence?.trim().slice(0, 40) || "draft",
    residualError: Number.isFinite(input.residualError) && Number(input.residualError) >= 0 ? Number(input.residualError) : null,
    isComplete:
      input.isComplete ??
      (isFiniteImageCoordinate(input.imageX) && isFiniteImageCoordinate(input.imageY) && isValidLatitude(input.latitude) && isValidLongitude(input.longitude)),
    notes: input.notes?.trim().slice(0, 2000) || null,
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null,
  };
}

export function isCompleteControlPoint(point: HistoricalMapControlPoint): point is HistoricalMapControlPoint & PairedControlPoint {
  return isFiniteImageCoordinate(point.imageX) && isFiniteImageCoordinate(point.imageY) && isValidLatitude(point.latitude) && isValidLongitude(point.longitude);
}

export function getCompleteControlPoints(points: HistoricalMapControlPoint[]): PairedControlPoint[] {
  return points.filter(isCompleteControlPoint).map((point) => ({
    imageX: point.imageX,
    imageY: point.imageY,
    latitude: point.latitude,
    longitude: point.longitude,
  }));
}

export function hasMinimumControlPoints(points: HistoricalMapControlPoint[], minimum = 3): boolean {
  return getCompleteControlPoints(points).length >= minimum;
}

function solveLinear3(matrix: number[][], values: number[]): [number, number, number] | null {
  const a = matrix.map((row, index) => [...row, values[index]]);

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let maxRow = pivot;

    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(a[row][pivot]) > Math.abs(a[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(a[maxRow][pivot]) < 1e-12) {
      return null;
    }

    [a[pivot], a[maxRow]] = [a[maxRow], a[pivot]];

    const divisor = a[pivot][pivot];

    for (let column = pivot; column < 4; column += 1) {
      a[pivot][column] /= divisor;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = a[row][pivot];

      for (let column = pivot; column < 4; column += 1) {
        a[row][column] -= factor * a[pivot][column];
      }
    }
  }

  return [a[0][3], a[1][3], a[2][3]];
}

function solveAffineCoefficients(points: PairedControlPoint[], key: "latitude" | "longitude"): [number, number, number] | null {
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atb = [0, 0, 0];

  for (const point of points) {
    const row = [point.imageX, point.imageY, 1];
    const value = point[key];

    for (let i = 0; i < 3; i += 1) {
      atb[i] += row[i] * value;

      for (let j = 0; j < 3; j += 1) {
        ata[i][j] += row[i] * row[j];
      }
    }
  }

  return solveLinear3(ata, atb);
}

export function calculateAffineTransform(points: PairedControlPoint[]):
  | {
      ok: true;
      matrix: AffineTransformMatrix;
      residualError: number;
      controlPointCount: number;
    }
  | { ok: false; error: string } {
  if (points.length < 3) {
    return { ok: false, error: "At least three complete control-point pairs are required." };
  }

  const latitude = solveAffineCoefficients(points, "latitude");
  const longitude = solveAffineCoefficients(points, "longitude");

  if (!latitude || !longitude || [...latitude, ...longitude].some((value) => !Number.isFinite(value))) {
    return { ok: false, error: "Affine transform could not be solved from the supplied control points." };
  }

  let residualSum = 0;

  for (const point of points) {
    const predictedLatitude = latitude[0] * point.imageX + latitude[1] * point.imageY + latitude[2];
    const predictedLongitude = longitude[0] * point.imageX + longitude[1] * point.imageY + longitude[2];
    residualSum += Math.hypot(predictedLatitude - point.latitude, predictedLongitude - point.longitude);
  }

  return {
    ok: true,
    matrix: { latitude, longitude },
    residualError: residualSum / points.length,
    controlPointCount: points.length,
  };
}

export function deriveGeoreferenceStatus(input: {
  corners: GeoCorners;
  controlPoints: HistoricalMapControlPoint[];
  reviewed?: boolean;
}): GeoreferenceStatus {
  if (input.reviewed) {
    return "reviewed";
  }

  const completeCount = getCompleteControlPoints(input.controlPoints).length;

  if (completeCount >= 3) {
    return "aligned_draft";
  }

  if (completeCount > 0) {
    return "control_points_draft";
  }

  if (boundsFromCorners(input.corners)) {
    return "bounding_box";
  }

  return "not_started";
}

export function deleteControlPoint(points: HistoricalMapControlPoint[], controlPointId: string): HistoricalMapControlPoint[] {
  return points.filter((point) => point.controlPointId !== controlPointId);
}

export function createDefaultGeoCorners(center: GeoCoordinate): GeoCorners {
  const latitudeDelta = 0.006;
  const longitudeDelta = 0.008;

  return {
    northwest: { latitude: center.latitude + latitudeDelta, longitude: center.longitude - longitudeDelta },
    northeast: { latitude: center.latitude + latitudeDelta, longitude: center.longitude + longitudeDelta },
    southeast: { latitude: center.latitude - latitudeDelta, longitude: center.longitude + longitudeDelta },
    southwest: { latitude: center.latitude - latitudeDelta, longitude: center.longitude - longitudeDelta },
  };
}
