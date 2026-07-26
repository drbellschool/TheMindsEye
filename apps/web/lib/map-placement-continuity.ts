import type { SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";
import type { MapPiecePlacementQueueItem } from "./map-piece-placement-queue.ts";

export type PlacementSaveResult =
  | { ok: true; placement: SanbornMapPieceGeoreference; workspaceId: string | null; pieceId: string }
  | { ok: false; message: string };

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Merge a server payload without allowing an older transition payload to erase a confirmed local save. */
export function mergePlacementStateFromServer(
  local: readonly SanbornMapPieceGeoreference[],
  incoming: readonly SanbornMapPieceGeoreference[],
): SanbornMapPieceGeoreference[] {
  const merged = new Map(local.map((placement) => [placement.pieceId, placement]));

  for (const serverPlacement of incoming) {
    const localPlacement = merged.get(serverPlacement.pieceId);
    if (!localPlacement) {
      merged.set(serverPlacement.pieceId, serverPlacement);
      continue;
    }

    const localTime = timestamp(localPlacement.updatedAt);
    const serverTime = timestamp(serverPlacement.updatedAt);
    const localConfirmed = localPlacement.isPersisted;
    const serverIsOlder = localTime !== null && serverTime !== null && serverTime <= localTime;

    if (localConfirmed && (!serverPlacement.isPersisted || serverIsOlder)) {
      continue;
    }

    merged.set(serverPlacement.pieceId, serverPlacement);
  }

  return [...merged.values()].sort((left, right) => left.layerOrder - right.layerOrder || left.pieceId.localeCompare(right.pieceId));
}

export function findNextUnplacedPlacementItem(input: {
  items: readonly MapPiecePlacementQueueItem[];
  currentPieceId: string;
}): MapPiecePlacementQueueItem | null {
  const unresolved = input.items.filter((item) => item.status === "not_placed");
  if (unresolved.length === 0) return null;

  const currentIndex = unresolved.findIndex((item) => item.pieceId === input.currentPieceId);
  const candidates = currentIndex >= 0
    ? [...unresolved.slice(currentIndex + 1), ...unresolved.slice(0, currentIndex)]
    : unresolved;

  return candidates.find((item) => item.pieceId !== input.currentPieceId) ?? null;
}
