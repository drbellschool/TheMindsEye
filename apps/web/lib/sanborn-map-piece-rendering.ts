import type { SanbornNormalizedPoint } from "./sanborn-atlas.ts";

export const maxMapPieceMaskRasterDimension = 3072;
export const maxMapPieceMaskSourcePixels = 500_000_000;

export type PlainPoint = {
  x: number;
  y: number;
};

export type PlainRect = {
  left: number;
  top: number;
};

export type MapPieceMaskRasterPlan = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  scale: number;
  clipPolygon: PlainPoint[];
};

function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function calculateMapPieceMaskRasterPlan(input: {
  sourceImageWidth: number;
  sourceImageHeight: number;
  sourcePolygon: SanbornNormalizedPoint[];
  maxDimension?: number;
}): MapPieceMaskRasterPlan {
  const sourceImageWidth = Math.floor(input.sourceImageWidth);
  const sourceImageHeight = Math.floor(input.sourceImageHeight);
  const maxDimension = Math.max(1, Math.floor(input.maxDimension ?? maxMapPieceMaskRasterDimension));

  if (!Number.isFinite(sourceImageWidth) || !Number.isFinite(sourceImageHeight) || sourceImageWidth <= 0 || sourceImageHeight <= 0) {
    throw new Error("Unsupported source image dimensions.");
  }

  if (sourceImageWidth * sourceImageHeight > maxMapPieceMaskSourcePixels) {
    throw new Error("Source image is too large to mask in the browser.");
  }

  if (input.sourcePolygon.length < 3) {
    throw new Error("Source polygon is unavailable for masking.");
  }

  const pixelPoints = input.sourcePolygon.map((point) => ({
    x: clampNormalized(point.x) * sourceImageWidth,
    y: clampNormalized(point.y) * sourceImageHeight,
  }));
  const minX = Math.max(0, Math.floor(Math.min(...pixelPoints.map((point) => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...pixelPoints.map((point) => point.y))));
  const maxX = Math.min(sourceImageWidth, Math.ceil(Math.max(...pixelPoints.map((point) => point.x))));
  const maxY = Math.min(sourceImageHeight, Math.ceil(Math.max(...pixelPoints.map((point) => point.y))));
  const sourceWidth = maxX - minX;
  const sourceHeight = maxY - minY;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Source polygon has no drawable area.");
  }

  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
  const clipPolygon = pixelPoints.map((point) => ({
    x: (point.x - minX) * scale,
    y: (point.y - minY) * scale,
  }));

  return {
    sourceX: minX,
    sourceY: minY,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
    scale,
    clipPolygon,
  };
}

export function clientPointToContainerPoint(clientX: number, clientY: number, containerRect: PlainRect): PlainPoint {
  return {
    x: clientX - containerRect.left,
    y: clientY - containerRect.top,
  };
}

export function calculateRotationDeltaDegrees(startPoint: PlainPoint, currentPoint: PlainPoint, centerPoint: PlainPoint): number {
  const startAngle = Math.atan2(startPoint.y - centerPoint.y, startPoint.x - centerPoint.x);
  const nextAngle = Math.atan2(currentPoint.y - centerPoint.y, currentPoint.x - centerPoint.x);

  return ((nextAngle - startAngle) * 180) / Math.PI;
}
