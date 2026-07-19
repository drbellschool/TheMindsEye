"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { StudioSourceOption, StudioTownPackage } from "@/lib/historical-map-studio";
import {
  buildReconstructionUrl,
  buildStandardSanbornCitation,
  getSourceDisplayId,
  getSourcePersistentUrl,
  getSourceRepositoryLabel,
  reconstructionRouteTabs,
  type EditionReconstructionProgress,
  type MapPieceReconstructionProgress,
  type ReconstructionContextQuery,
  type ReconstructionRouteId,
  type SheetReconstructionProgress,
  type TownReconstructionProgress,
} from "@/lib/town-reconstruction";

type ReconstructionContextBarProps = {
  currentRoute: ReconstructionRouteId;
  context: ReconstructionContextQuery;
  towns: StudioTownPackage[];
  years: number[];
  sheets: SheetReconstructionProgress[];
  pieces: MapPieceReconstructionProgress[];
  sourceOptions: StudioSourceOption[];
  activeSourceRecordId?: string | null;
  townProgress: TownReconstructionProgress;
  editionProgress?: EditionReconstructionProgress | null;
  compact?: boolean;
  onTownChange?: (townPackageId: string) => void;
  onYearChange?: (mapYear: number) => void;
  onAddEdition?: () => void;
  onSheetChange?: (sheetAssetId: string) => void;
  onPieceChange?: (mapPieceId: string) => void;
};

const addEditionSelectValue = "__add_sanborn_edition__";

const recentTownStorageKey = "mindseye.reconstruction.recentTownIds";

function numericYear(value: string | number | null | undefined): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readRecentTownIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(recentTownStorageKey);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeRecentTownIds(ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(recentTownStorageKey, JSON.stringify(ids.slice(0, 5)));
  } catch {
    // Recent towns are only a convenience; failing storage should not block work.
  }
}

function copyText(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(value);
}

function sourceOptionToRecord(source: StudioSourceOption | null | undefined) {
  return source
    ? {
        sourceRecordId: source.sourceRecordId,
        sourceId: source.sourceId,
        internalSourceId: source.internalSourceId,
        title: source.title,
        repositoryName: source.repositoryName,
        collectionName: source.collectionName,
        repositoryExternalId: source.repositoryExternalId,
        persistentUrl: source.persistentUrl,
        itemPageUrl: source.itemPageUrl,
        iiifManifestUrl: source.iiifManifestUrl,
        imageServiceUrl: source.imageServiceUrl,
        itemResourceId: source.itemResourceId,
        town: source.townName,
        county: source.countyName,
        state: source.stateName,
        editionYear: source.editionYear,
        sheetNumber: source.sheetNumber,
        mapPublisher: source.mapPublisher,
        publicationDate: source.publicationDate,
        downloadedAt: source.downloadedAt,
        importedBy: source.importedBy,
        rightsStatement: source.rightsStatement,
        rightsUrl: source.rightsUrl,
        accessNote: source.accessNote,
        accessDate: source.accessDate,
        citationNote: source.citationNote,
        sourceStatus: source.sourceStatus,
        archiveName: source.archiveName,
        sourceUrl: source.sourceUrl,
        rightsNote: source.rightsNote,
      }
    : null;
}

function getTownOptionLabel(town: StudioTownPackage): string {
  return town.region ? `${town.name} - ${town.region}` : town.name;
}

export function ReconstructionContextBar({
  currentRoute,
  context,
  towns,
  years,
  sheets,
  pieces,
  sourceOptions,
  activeSourceRecordId,
  townProgress,
  editionProgress,
  compact = false,
  onTownChange,
  onYearChange,
  onAddEdition,
  onSheetChange,
  onPieceChange,
}: ReconstructionContextBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [recentTownIds, setRecentTownIds] = useState<string[]>([]);
  const [townQuery, setTownQuery] = useState("");
  const [sourceDraft, setSourceDraft] = useState({
    title: "",
    repositoryName: "Library of Congress",
    collectionName: "Sanborn Fire Insurance Maps",
    repositoryExternalId: "",
    persistentUrl: "",
    sheetNumber: "",
  });
  const [sourceSaveMessage, setSourceSaveMessage] = useState("");
  const activeTown = towns.find((town) => town.id === context.townPackageId || town.packageId === context.townPackageId) ?? towns[0] ?? null;
  const activeYear = numericYear(context.mapYear);
  const activeYearValue = activeYear && years.includes(activeYear) ? activeYear : "";
  const activeSheet = sheets.find((sheet) => sheet.sheetAssetId === context.sheetAssetId || sheet.pageId === context.atlasPageId) ?? sheets[0] ?? null;
  const activePiece = pieces.find((piece) => piece.pieceId === context.mapPieceId) ?? pieces[0] ?? null;
  const activeSource =
    sourceOptions.find((source) => source.sourceRecordId === activeSourceRecordId) ??
    (activeSheet ? sourceOptions.find((source) => source.sourceRecordId === activeSheet.sourceRecordId) : null) ??
    sourceOptions[0] ??
    null;
  const sourceRecord = sourceOptionToRecord(activeSource);
  const citation = sourceRecord ? buildStandardSanbornCitation(sourceRecord, new Date()) : "";
  const sourceUrl = getSourcePersistentUrl(sourceRecord);
  const sortedTowns = useMemo(() => [...towns].sort((left, right) => left.name.localeCompare(right.name) || right.year - left.year), [towns]);
  const recentTowns = recentTownIds
    .map((townId) => towns.find((town) => town.id === townId))
    .filter((town): town is StudioTownPackage => Boolean(town));

  useEffect(() => {
    setRecentTownIds(readRecentTownIds());
  }, []);

  useEffect(() => {
    setTownQuery(activeTown?.name ?? "");
  }, [activeTown?.name]);

  useEffect(() => {
    if (!activeTown?.id) {
      return;
    }

    setRecentTownIds((current) => {
      const next = [activeTown.id, ...current.filter((townId) => townId !== activeTown.id)].slice(0, 5);
      writeRecentTownIds(next);
      return next;
    });
  }, [activeTown?.id]);

  function navigate(patch: Partial<ReconstructionContextQuery>) {
    const nextContext = { ...context, ...patch };
    router.push(buildReconstructionUrl(pathname, nextContext));
  }

  async function createSourceRecord() {
    if (!context.townPackageId) {
      setSourceSaveMessage("Select a town before creating a source record.");
      return;
    }

    setSourceSaveMessage("Creating source record...");
    let response: Response;
    let payload: { ok?: boolean; message?: string } | null;

    try {
      response = await fetch("/api/community/source-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          townPackageId: context.townPackageId,
          title: sourceDraft.title,
          repositoryName: sourceDraft.repositoryName,
          collectionName: sourceDraft.collectionName,
          repositoryExternalId: sourceDraft.repositoryExternalId,
          persistentUrl: sourceDraft.persistentUrl,
          sheetNumber: sourceDraft.sheetNumber,
          editionYear: context.mapYear,
        }),
      });
      payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    } catch {
      setSourceSaveMessage("Source record request failed. Check the network connection and Supabase service-role configuration.");
      return;
    }

    if (!response.ok || !payload?.ok) {
      setSourceSaveMessage(payload?.message ?? "Source record could not be created.");
      return;
    }

    setSourceSaveMessage("Source record created.");
    router.refresh();
  }

  return (
    <section className={`reconstruction-context${compact ? " reconstruction-context--compact" : ""}`} aria-label="Town reconstruction context">
      <div className="reconstruction-context__selectors">
        <div className="reconstruction-context__identity">
          <span>Town Reconstruction</span>
          <strong>{activeTown ? `${activeTown.name} ${activeYearValue || "No edition"}` : "No town selected"}</strong>
        </div>

        <label>
          <span>Town</span>
          <input
            aria-label="Searchable town selector"
            list="reconstruction-town-options"
            onChange={(event) => {
              const value = event.target.value;
              setTownQuery(value);
              const selected = sortedTowns.find((town) => town.id === value || town.name === value || getTownOptionLabel(town) === value || `${town.name} ${town.year}` === value);
              if (!selected) return;
              if (onTownChange) {
                onTownChange(selected.id);
              } else {
                navigate({ townPackageId: selected.id, mapYear: null, atlasId: null, atlasPageId: null, sheetAssetId: null, mapPieceId: null, blockId: null });
              }
            }}
            placeholder="Search towns"
            value={townQuery}
          />
          <datalist id="reconstruction-town-options">
            {sortedTowns.map((town) => (
              <option key={town.id} value={getTownOptionLabel(town)} />
            ))}
          </datalist>
        </label>

        <label>
          <span>Edition</span>
          <select
            aria-label="Edition year"
            value={activeYearValue}
            onChange={(event) => {
              if (event.target.value === addEditionSelectValue) {
                onAddEdition?.();
                return;
              }
              const year = numericYear(event.target.value);
              if (!year) return;
              if (onYearChange) {
                onYearChange(year);
              } else {
                navigate({ mapYear: year });
              }
            }}
          >
            {years.length === 0 ? <option value="">No editions loaded</option> : null}
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
            {onAddEdition ? <option value={addEditionSelectValue}>+ Add year</option> : null}
          </select>
        </label>

        <label>
          <span>Sheet</span>
          <select
            aria-label="Active sheet or page"
            value={activeSheet?.sheetAssetId ?? ""}
            onChange={(event) => {
              const selected = sheets.find((sheet) => sheet.sheetAssetId === event.target.value);
              if (!selected) return;
              if (onSheetChange) {
                onSheetChange(selected.sheetAssetId);
              } else {
                navigate({ sheetAssetId: selected.sheetAssetId, atlasPageId: selected.pageId });
              }
            }}
          >
            {sheets.length === 0 ? <option value="">No sheets loaded</option> : null}
            {sheets.map((sheet) => (
              <option key={sheet.sheetAssetId} value={sheet.sheetAssetId}>
                {sheet.displayLabel} - {sheet.status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Block / Piece</span>
          <select
            aria-label="Active block or map piece"
            value={activePiece?.pieceId ?? ""}
            onChange={(event) => {
              if (onPieceChange) {
                onPieceChange(event.target.value);
              } else {
                navigate({ mapPieceId: event.target.value });
              }
            }}
          >
            {pieces.length === 0 ? <option value="">No pieces identified</option> : null}
            {pieces.map((piece) => (
              <option key={piece.pieceId} value={piece.pieceId}>
                {piece.label} - {piece.status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="reconstruction-context__progress" aria-label="Reconstruction progress">
        <div className="reconstruction-progress" role="progressbar" aria-label="Overall town reconstruction progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={townProgress.completionPercent}>
          <span style={{ width: `${townProgress.completionPercent}%` }} />
        </div>
        <span>Town reconstruction: {townProgress.completionPercent}%</span>
        {editionProgress ? <span>{editionProgress.editionYear ?? activeYear ?? "Edition"} edition: {editionProgress.completionPercent}%</span> : null}
      </div>

      <nav className="reconstruction-context__tabs" aria-label="Reconstruction engines">
        {reconstructionRouteTabs.map((tab) => (
          <Link className={`reconstruction-context__tab${tab.id === currentRoute ? " is-active" : ""}`} href={buildReconstructionUrl(tab.href, context)} key={tab.id}>
            {tab.label}
          </Link>
        ))}
        <details className="reconstruction-context__source">
          <summary>Source Info</summary>
          <div className="reconstruction-source-drawer">
            {sourceRecord ? (
              <>
                <dl>
                  <dt>Source ID</dt>
                  <dd>{getSourceDisplayId(sourceRecord)}</dd>
                  <dt>Repository</dt>
                  <dd>{getSourceRepositoryLabel(sourceRecord)}</dd>
                  <dt>Collection</dt>
                  <dd>{sourceRecord.collectionName ?? "Collection unavailable"}</dd>
                  <dt>External record</dt>
                  <dd>{sourceRecord.repositoryExternalId ?? "External record unavailable"}</dd>
                  <dt>Rights</dt>
                  <dd>{sourceRecord.rightsStatement ?? sourceRecord.rightsNote ?? "Rights unavailable"}</dd>
                  <dt>Source status</dt>
                  <dd>{sourceRecord.sourceStatus ?? "unknown"}</dd>
                </dl>
                <p className="reconstruction-source-drawer__citation">
                  <strong>Standard historical citation</strong>
                  <span>{citation}</span>
                </p>
                <div className="reconstruction-source-drawer__actions">
                  <button type="button" onClick={() => copyText(citation)}>
                    Copy citation
                  </button>
                  <button type="button" onClick={() => copyText(getSourceDisplayId(sourceRecord))}>
                    Copy source ID
                  </button>
                  {sourceUrl ? (
                    <a href={sourceUrl} rel="noreferrer" target="_blank">
                      Open repository record
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <p>Missing source record. Uploads can continue, but provenance should be linked before review.</p>
            )}
            <div className="reconstruction-source-drawer__create" aria-label="Create source record">
              <strong>Create source record</strong>
              <label>
                <span>Title</span>
                <input value={sourceDraft.title} onChange={(event) => setSourceDraft({ ...sourceDraft, title: event.target.value })} placeholder="Sanborn Fire Insurance Map from..." />
              </label>
              <label>
                <span>Repository</span>
                <input value={sourceDraft.repositoryName} onChange={(event) => setSourceDraft({ ...sourceDraft, repositoryName: event.target.value })} />
              </label>
              <label>
                <span>Collection</span>
                <input value={sourceDraft.collectionName} onChange={(event) => setSourceDraft({ ...sourceDraft, collectionName: event.target.value })} />
              </label>
              <label>
                <span>External record</span>
                <input value={sourceDraft.repositoryExternalId} onChange={(event) => setSourceDraft({ ...sourceDraft, repositoryExternalId: event.target.value })} />
              </label>
              <label>
                <span>Persistent URL</span>
                <input value={sourceDraft.persistentUrl} onChange={(event) => setSourceDraft({ ...sourceDraft, persistentUrl: event.target.value })} />
              </label>
              <label>
                <span>Sheet</span>
                <input value={sourceDraft.sheetNumber} onChange={(event) => setSourceDraft({ ...sourceDraft, sheetNumber: event.target.value })} />
              </label>
              <button type="button" onClick={() => void createSourceRecord()}>
                Create source record
              </button>
              {sourceSaveMessage ? <p>{sourceSaveMessage}</p> : null}
            </div>
          </div>
        </details>
      </nav>

      {recentTowns.length > 0 ? (
        <div className="reconstruction-context__recent" aria-label="Recent towns">
          <span>Recent</span>
          {recentTowns.map((town) => (
            <button
              key={town.id}
              type="button"
              onClick={() => {
                if (onTownChange) {
                  onTownChange(town.id);
                } else {
                  navigate({ townPackageId: town.id, mapYear: null, atlasId: null, atlasPageId: null, sheetAssetId: null, mapPieceId: null, blockId: null });
                }
              }}
            >
              {getTownOptionLabel(town)}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
