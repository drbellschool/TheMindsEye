"use client";

import { useEffect, useRef, useState } from "react";

import { getBasemap } from "@/lib/historical-map-basemap";
import { projectBirdsEyeThroughSolve, type BirdsEyeStagedSolve } from "@/lib/birds-eye-calibration";

type Props = {
  basemapKey: string;
  center: readonly [number, number, number?];
  height: number;
  opacity: number;
  solve: BirdsEyeStagedSolve;
  width: number;
  zoom: number;
};

type Point = { x: number; y: number };
type TileImage = HTMLImageElement | "error";

const tileSize = 256;
const meshResolution = 4;

function tileUrl(template: string, z: number, x: number, y: number): string {
  const count = 2 ** z;
  const wrappedX = ((x % count) + count) % count;
  return template
    .replace("{s}", ["a", "b", "c"][Math.abs(x + y) % 3])
    .replace("{z}", String(z))
    .replace("{x}", String(wrappedX))
    .replace("{y}", String(y));
}

function longitudeLatitudeToTile(longitude: number, latitude: number, zoom: number): Point {
  const scale = 2 ** zoom;
  const latitudeRadians = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale,
  };
}

function tileToLongitudeLatitude(x: number, y: number, zoom: number): [number, number] {
  const scale = 2 ** zoom;
  const longitude = x / scale * 360 - 180;
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI;
  return [longitude, latitude];
}

function drawMappedTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: [Point, Point, Point],
  target: [Point, Point, Point],
  sourceRect: { x: number; y: number; width: number; height: number },
) {
  const sourceWidth = source[1].x - source[0].x;
  const sourceHeight = source[2].y - source[0].y;
  if (Math.abs(sourceWidth) < 0.01 || Math.abs(sourceHeight) < 0.01) return;
  const a = (target[1].x - target[0].x) / sourceWidth;
  const b = (target[1].y - target[0].y) / sourceWidth;
  const c = (target[2].x - target[0].x) / sourceHeight;
  const d = (target[2].y - target[0].y) / sourceHeight;
  if (![a, b, c, d].every(Number.isFinite)) return;
  context.save();
  context.transform(a, b, c, d, target[0].x, target[0].y);
  context.beginPath();
  context.moveTo(source[0].x, source[0].y);
  context.lineTo(source[1].x, source[1].y);
  context.lineTo(source[2].x, source[2].y);
  context.closePath();
  context.clip();
  context.drawImage(image, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height, 0, 0, sourceRect.width, sourceRect.height);
  context.restore();
}

function signedTriangleArea(points: [Point, Point, Point]): number {
  return (points[1].x - points[0].x) * (points[2].y - points[0].y) - (points[1].y - points[0].y) * (points[2].x - points[0].x);
}

function isStableTriangle(source: [Point, Point, Point], target: [Point, Point, Point]): boolean {
  const sourceArea = signedTriangleArea(source);
  const targetArea = signedTriangleArea(target);
  return Math.abs(targetArea) > 0.01 && sourceArea * targetArea > 0;
}

export function BirdsEyeWarpedBasemapCanvas({ basemapKey, center, height, opacity, solve, width, zoom }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cacheRef = useRef(new Map<string, TileImage>());
  const [renderVersion, setRenderVersion] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [foldoverCount, setFoldoverCount] = useState(0);
  const basemap = getBasemap(basemapKey);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const devicePixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
    canvas.height = Math.max(1, Math.round(height * devicePixelRatio));
    canvas.style.aspectRatio = `${width} / ${height}`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#e2d6bf";
    context.fillRect(0, 0, width, height);
    context.globalAlpha = Math.max(0, Math.min(1, opacity));

    const tileZoom = Math.max(1, Math.min(basemap.maxNativeZoom, Math.round(zoom)));
    const centerTile = longitudeLatitudeToTile(center[1], center[0], tileZoom);
    const firstTileX = Math.floor(centerTile.x) - 2;
    const firstTileY = Math.floor(centerTile.y) - 2;
    const tileKeys: string[] = [];
    let loaded = 0;
    let failed = 0;
    let invalidTriangles = 0;

    for (let tileY = firstTileY; tileY <= firstTileY + 4; tileY += 1) {
      for (let tileX = firstTileX; tileX <= firstTileX + 4; tileX += 1) {
        const key = `${basemap.key}:${tileZoom}:${tileX}:${tileY}`;
        tileKeys.push(key);
        const existing = cacheRef.current.get(key);
        if (existing === "error") {
          failed += 1;
          continue;
        }
        if (existing) {
          loaded += 1;
          continue;
        }
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          cacheRef.current.set(key, image);
          setRenderVersion((value) => value + 1);
        };
        image.onerror = () => {
          cacheRef.current.set(key, "error");
          setRenderVersion((value) => value + 1);
        };
        image.src = tileUrl(basemap.url, tileZoom, tileX, tileY);
      }
    }

    if (loaded === 0 && failed === tileKeys.length) setStatus("error");
    else if (loaded > 0) setStatus("ready");
    else setStatus("loading");

    for (let tileY = firstTileY; tileY <= firstTileY + 4; tileY += 1) {
      for (let tileX = firstTileX; tileX <= firstTileX + 4; tileX += 1) {
        const key = `${basemap.key}:${tileZoom}:${tileX}:${tileY}`;
        const image = cacheRef.current.get(key);
        if (!image || image === "error") continue;
        for (let row = 0; row < meshResolution; row += 1) {
          for (let column = 0; column < meshResolution; column += 1) {
            const sourceX = column * tileSize / meshResolution;
            const sourceY = row * tileSize / meshResolution;
            const sourceX2 = (column + 1) * tileSize / meshResolution;
            const sourceY2 = (row + 1) * tileSize / meshResolution;
            const geographic = (x: number, y: number): Point => {
              const [longitude, latitude] = tileToLongitudeLatitude(tileX + x / tileSize, tileY + y / tileSize, tileZoom);
              return projectBirdsEyeThroughSolve(longitude, latitude, solve);
            };
            const topLeft = geographic(sourceX, sourceY);
            const topRight = geographic(sourceX2, sourceY);
            const bottomLeft = geographic(sourceX, sourceY2);
            const bottomRight = geographic(sourceX2, sourceY2);
            const sourceRect = { x: sourceX, y: sourceY, width: sourceX2 - sourceX, height: sourceY2 - sourceY };
            const sourceWidth = sourceRect.width;
            const sourceHeight = sourceRect.height;
            const sourceTriangleA: [Point, Point, Point] = [{ x: 0, y: 0 }, { x: sourceWidth, y: 0 }, { x: 0, y: sourceHeight }];
            const targetTriangleA: [Point, Point, Point] = [topLeft, topRight, bottomLeft];
            const sourceTriangleB: [Point, Point, Point] = [{ x: sourceWidth, y: sourceHeight }, { x: 0, y: sourceHeight }, { x: sourceWidth, y: 0 }];
            const targetTriangleB: [Point, Point, Point] = [bottomRight, bottomLeft, topRight];
            if (isStableTriangle(sourceTriangleA, targetTriangleA)) drawMappedTriangle(context, image, sourceTriangleA, targetTriangleA, sourceRect);
            else invalidTriangles += 1;
            if (isStableTriangle(sourceTriangleB, targetTriangleB)) drawMappedTriangle(context, image, sourceTriangleB, targetTriangleB, sourceRect);
            else invalidTriangles += 1;
          }
        }
      }
    }
    setFoldoverCount(invalidTriangles);
    context.globalAlpha = 1;
  }, [basemap.key, basemap.maxNativeZoom, basemap.url, center, height, opacity, renderVersion, solve, width, zoom]);

  return (
    <div className="birds-eye-warped-basemap" aria-label={`Warped ${basemap.label} basemap preview`}>
      <canvas ref={canvasRef} aria-hidden="true" />
      {status === "error" ? <p className="birds-eye-warped-basemap__fallback">This basemap could not be used in the preview. Geometry remains available.</p> : null}
      {foldoverCount > 0 ? <p className="birds-eye-warped-basemap__fallback">{foldoverCount} unstable mesh triangles were skipped. Add better-spread control points.</p> : null}
      <span className="birds-eye-warped-basemap__attribution" dangerouslySetInnerHTML={{ __html: basemap.attribution }} />
    </div>
  );
}
