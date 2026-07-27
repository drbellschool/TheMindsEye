import { mergePlacementStateFromServer } from "./map-placement-continuity.ts";
import type { SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";

export type HistoricalMapStudioHydrationSnapshot = {
  editionKey: string | null;
  mapPieceGeoreferences: readonly SanbornMapPieceGeoreference[];
  loadedAt: string;
};

/** Reconciles the edition-wide placement collection as one payload. */
export function hydrateHistoricalMapStudioState(
  current: HistoricalMapStudioHydrationSnapshot,
  incoming: HistoricalMapStudioHydrationSnapshot,
): HistoricalMapStudioHydrationSnapshot {
  if (current.editionKey !== incoming.editionKey) return { ...incoming, mapPieceGeoreferences: [...incoming.mapPieceGeoreferences] };
  return {
    ...incoming,
    mapPieceGeoreferences: mergePlacementStateFromServer(current.mapPieceGeoreferences, incoming.mapPieceGeoreferences),
  };
}
