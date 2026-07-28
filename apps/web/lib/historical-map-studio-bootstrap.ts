import type { HistoricalMapStudioState } from "./historical-map-studio.ts";

export type HistoricalMapStudioBootstrapIdentity = { townPackageId: string; mapYear: number; atlasId?: string | null };

export function historicalMapStudioEditionKey(identity: HistoricalMapStudioBootstrapIdentity): string {
  return `${identity.townPackageId}:${identity.mapYear}:${identity.atlasId ?? ""}`;
}

export function isAuthoritativeHistoricalMapStudioBootstrap(state: HistoricalMapStudioState, identity: HistoricalMapStudioBootstrapIdentity): boolean {
  return state.activeTownPackage?.id === identity.townPackageId && state.activeMapYear === identity.mapYear;
}

export function applyHistoricalMapStudioBootstrap(current: HistoricalMapStudioState, incoming: HistoricalMapStudioState): HistoricalMapStudioState {
  if (!incoming.activeTownPackage || current.activeTownPackage?.id !== incoming.activeTownPackage.id || current.activeMapYear !== incoming.activeMapYear) return current;
  return incoming;
}
