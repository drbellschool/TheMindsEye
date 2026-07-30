export type BirdsEyeImageView = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BirdsEyeImageViewport = {
  cssWidth: number;
  cssHeight: number;
  imageWidth: number;
  imageHeight: number;
  view: BirdsEyeImageView;
};

export type BirdsEyeScreenPoint = { x: number; y: number };
export type BirdsEyeNormalizedPoint = { x: number; y: number };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function viewportTransform(input: BirdsEyeImageViewport) {
  const scale = Math.min(
    input.cssWidth / Math.max(1, input.view.width),
    input.cssHeight / Math.max(1, input.view.height),
  );
  const renderedWidth = input.view.width * scale;
  const renderedHeight = input.view.height * scale;
  return {
    scale,
    offsetX: (input.cssWidth - renderedWidth) / 2,
    offsetY: (input.cssHeight - renderedHeight) / 2,
  };
}

/** Convert CSS pixels in the SVG pane to normalized original-image coordinates. */
export function birdsEyeScreenToNormalized(
  screen: BirdsEyeScreenPoint,
  input: BirdsEyeImageViewport,
): BirdsEyeNormalizedPoint | null {
  const transform = viewportTransform(input);
  const imageX = input.view.x + (screen.x - transform.offsetX) / transform.scale;
  const imageY = input.view.y + (screen.y - transform.offsetY) / transform.scale;
  if (screen.x < transform.offsetX || screen.x > transform.offsetX + input.view.width * transform.scale ||
    screen.y < transform.offsetY || screen.y > transform.offsetY + input.view.height * transform.scale) {
    return null;
  }
  return {
    x: clamp01(imageX / Math.max(1, input.imageWidth)),
    y: clamp01(imageY / Math.max(1, input.imageHeight)),
  };
}

/** Convert normalized original-image coordinates to CSS pixels in the SVG pane. */
export function birdsEyeNormalizedToScreen(
  normalized: BirdsEyeNormalizedPoint,
  input: BirdsEyeImageViewport,
): BirdsEyeScreenPoint {
  const transform = viewportTransform(input);
  const imageX = clamp01(normalized.x) * input.imageWidth;
  const imageY = clamp01(normalized.y) * input.imageHeight;
  return {
    x: transform.offsetX + (imageX - input.view.x) * transform.scale,
    y: transform.offsetY + (imageY - input.view.y) * transform.scale,
  };
}

export function birdsEyeImageRoundTripError(
  normalized: BirdsEyeNormalizedPoint,
  input: BirdsEyeImageViewport,
): number {
  const screen = birdsEyeNormalizedToScreen(normalized, input);
  const roundTrip = birdsEyeScreenToNormalized(screen, input);
  if (!roundTrip) return Number.POSITIVE_INFINITY;
  return Math.hypot(
    (roundTrip.x - normalized.x) * input.imageWidth,
    (roundTrip.y - normalized.y) * input.imageHeight,
  );
}

export function centeredBirdsEyeMarkerAnchor(size: number): [number, number] {
  const half = Math.max(0, size / 2);
  return [half, half];
}

export function mapClickRoundTripError(
  clickedContainerPoint: BirdsEyeScreenPoint,
  renderedContainerPoint: BirdsEyeScreenPoint,
): number {
  return Math.hypot(
    clickedContainerPoint.x - renderedContainerPoint.x,
    clickedContainerPoint.y - renderedContainerPoint.y,
  );
}
