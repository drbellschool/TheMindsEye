export type BasemapConfig = {
  key: string;
  label: string;
  url: string;
  attribution: string;
};

export type TileDiagnosticStatus = "idle" | "loading" | "loaded" | "error";

export type TileDiagnostics = {
  status: TileDiagnosticStatus;
  successfulTiles: number;
  failedTiles: number;
  retryToken: number;
};

export const defaultBasemapKey = "osm";

export const basemaps: BasemapConfig[] = [
  {
    key: defaultBasemapKey,
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    key: "esri_world_street",
    label: "Alternate streets",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom',
  },
];

export const leafletPaneStack = {
  tilePane: 200,
  overlayPane: 400,
  historicalSheetPane: 450,
  markerPane: 600,
  tooltipPane: 650,
  popupPane: 700,
  mapDiagnostics: 760,
};

export const contentSecurityPolicyImageSources = [
  "'self'",
  "data:",
  "blob:",
  "https://*.tile.openstreetmap.org",
  "https://tile.openstreetmap.org",
  "https://server.arcgisonline.com",
  "https://*.supabase.co",
];

export function getBasemap(key: string | null | undefined): BasemapConfig {
  return basemaps.find((candidate) => candidate.key === key) ?? basemaps[0];
}

export function createTileDiagnostics(): TileDiagnostics {
  return {
    status: "idle",
    successfulTiles: 0,
    failedTiles: 0,
    retryToken: 0,
  };
}

export function updateTileDiagnostics(current: TileDiagnostics, event: "loading" | "tileload" | "tileerror" | "load" | "retry"): TileDiagnostics {
  if (event === "retry") {
    return {
      status: "loading",
      successfulTiles: 0,
      failedTiles: 0,
      retryToken: current.retryToken + 1,
    };
  }

  if (event === "loading") {
    return {
      ...current,
      status: current.successfulTiles > 0 ? "loaded" : "loading",
    };
  }

  if (event === "tileload") {
    return {
      ...current,
      status: "loaded",
      successfulTiles: current.successfulTiles + 1,
    };
  }

  if (event === "tileerror") {
    const failedTiles = current.failedTiles + 1;

    return {
      ...current,
      status: current.successfulTiles > 0 ? "loaded" : "error",
      failedTiles,
    };
  }

  return {
    ...current,
    status: current.successfulTiles > 0 ? "loaded" : current.failedTiles > 0 ? "error" : "loading",
  };
}

export function getModernTileLayerOpacity(): 1 {
  return 1;
}

export function isConfiguredImageSourceAllowed(value: string): boolean {
  if (value.startsWith("data:") || value.startsWith("blob:")) {
    return true;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return value.startsWith("'self'");
  }

  if (url.hostname === "tile.openstreetmap.org" || url.hostname.endsWith(".tile.openstreetmap.org")) {
    return true;
  }

  if (url.hostname === "server.arcgisonline.com") {
    return true;
  }

  return url.hostname.endsWith(".supabase.co");
}
