"use client";

import { useEffect, useMemo, useState } from "react";

import {
  sanbornPageTypes,
  type SanbornAtlasInventoryState,
  type SanbornAtlasPageRecord,
  type SanbornAtlasRecord,
  type SanbornPageType,
} from "@/lib/sanborn-atlas";
import type { StudioSheetAsset, StudioSourceOption } from "@/lib/historical-map-studio";

export type SanbornAtlasWorkflowStep =
  | "source"
  | "page_classification"
  | "town_index"
  | "numbered_sheets"
  | "piece_inventory"
  | "gps_alignment";

export const sanbornAtlasWorkflowSteps: Array<{ id: SanbornAtlasWorkflowStep; label: string }> = [
  { id: "source", label: "Source and edition" },
  { id: "page_classification", label: "Page classification" },
  { id: "town_index", label: "Town index / key map" },
  { id: "numbered_sheets", label: "Numbered sheets" },
  { id: "piece_inventory", label: "Piece inventory" },
  { id: "gps_alignment", label: "GPS alignment" },
];

type AtlasDraft = {
  atlasId?: string;
  title: string;
  editionYear: string;
  editionDate: string;
  volumeLabel: string;
  expectedPageCount: string;
  sourceRecordId: string;
};

type SanbornAtlasNavigatorProps = {
  inventory: SanbornAtlasInventoryState;
  assets: StudioSheetAsset[];
  sourceOptions: StudioSourceOption[];
  fallbackYear: number | null;
  selectedAtlasId: string;
  selectedPageId: string;
  workflowStep: SanbornAtlasWorkflowStep;
  readOnly: boolean;
  onSelectAtlas: (atlasId: string) => void;
  onSelectPage: (pageId: string) => void;
  onWorkflowStepChange: (step: SanbornAtlasWorkflowStep) => void;
  onSaveAtlas: (draft: AtlasDraft) => void;
  onAssignAsset: (assetId: string) => void;
  onPatchPage: (pageId: string, patch: Partial<SanbornAtlasPageRecord>) => void;
  onReorderPage: (pageId: string, direction: "up" | "down") => void;
  onSavePages: () => void;
  onSavePagesAndContinue: () => void;
  pieceInventoryBlocked: boolean;
  saveActionsDisabled: boolean;
};

function createDraft(atlas: SanbornAtlasRecord | null, fallbackYear: number | null): AtlasDraft {
  return {
    atlasId: atlas?.atlasId,
    title: atlas?.title ?? "",
    editionYear: String(atlas?.editionYear ?? fallbackYear ?? ""),
    editionDate: atlas?.editionDate ?? "",
    volumeLabel: atlas?.volumeLabel ?? "",
    expectedPageCount: atlas?.expectedPageCount ? String(atlas.expectedPageCount) : "",
    sourceRecordId: atlas?.sourceRecordId ?? "",
  };
}

function assetLabel(asset: StudioSheetAsset): string {
  return `Sheet ${asset.sheetNumber ?? "?"} - ${asset.originalFilename}`;
}

export function SanbornAtlasNavigator({
  inventory,
  assets,
  sourceOptions,
  fallbackYear,
  selectedAtlasId,
  selectedPageId,
  workflowStep,
  readOnly,
  onSelectAtlas,
  onSelectPage,
  onWorkflowStepChange,
  onSaveAtlas,
  onAssignAsset,
  onPatchPage,
  onReorderPage,
  onSavePages,
  onSavePagesAndContinue,
  pieceInventoryBlocked,
  saveActionsDisabled,
}: SanbornAtlasNavigatorProps) {
  const activeAtlas = inventory.atlases.find((atlas) => atlas.atlasId === selectedAtlasId) ?? null;
  const activePages = useMemo(
    () => inventory.pages.filter((page) => page.atlasId === selectedAtlasId).sort((left, right) => left.pageSequence - right.pageSequence),
    [inventory.pages, selectedAtlasId],
  );
  const unassignedAssets = assets.filter((asset) => inventory.unassignedAssetIds.includes(asset.assetId));
  const [draft, setDraft] = useState<AtlasDraft>(createDraft(activeAtlas, fallbackYear));
  const showSaveAtlas = workflowStep === "source";
  const showSavePagesAndContinue = workflowStep === "piece_inventory" && pieceInventoryBlocked;
  const showSavePageOrder = activePages.length > 0 && workflowStep !== "source" && !showSavePagesAndContinue;

  useEffect(() => {
    setDraft(createDraft(activeAtlas, fallbackYear));
  }, [activeAtlas?.atlasId, activeAtlas?.updatedAt, fallbackYear]);

  return (
    <aside className="sanborn-atlas-navigator">
      <nav className="sanborn-atlas-navigator__steps" aria-label="Sanborn atlas workflow">
        {sanbornAtlasWorkflowSteps.map((step) => (
          <button
            className={`sanborn-atlas-navigator__step${workflowStep === step.id ? " is-active" : ""}`}
            key={step.id}
            onClick={() => onWorkflowStepChange(step.id)}
            type="button"
          >
            <span>{sanbornAtlasWorkflowSteps.indexOf(step) + 1}</span>
            {step.label}
          </button>
        ))}
      </nav>

      <div className="sanborn-atlas-navigator__scroll">
        {inventory.warningMessage ? <p className="sanborn-atlas-warning">{inventory.warningMessage}</p> : null}

        <section className="sanborn-atlas-navigator__section">
          <h3>Atlas / edition</h3>
          <label>
            Select atlas
            <select disabled={readOnly || inventory.atlases.length === 0} value={selectedAtlasId} onChange={(event) => onSelectAtlas(event.target.value)}>
              <option value="">No atlas selected</option>
              {inventory.atlases.map((atlas) => (
                <option key={atlas.atlasId} value={atlas.atlasId}>
                  {atlas.title}
                </option>
              ))}
            </select>
          </label>
          <div className="sanborn-atlas-navigator__form">
            <label>
              Title
              <input disabled={readOnly} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label>
              Edition year
              <input disabled={readOnly} inputMode="numeric" value={draft.editionYear} onChange={(event) => setDraft({ ...draft, editionYear: event.target.value })} />
            </label>
            <label>
              Edition date
              <input disabled={readOnly} placeholder="YYYY-MM-DD" value={draft.editionDate} onChange={(event) => setDraft({ ...draft, editionDate: event.target.value })} />
            </label>
            <label>
              Volume label
              <input disabled={readOnly} value={draft.volumeLabel} onChange={(event) => setDraft({ ...draft, volumeLabel: event.target.value })} />
            </label>
            <label>
              Expected pages
              <input disabled={readOnly} inputMode="numeric" value={draft.expectedPageCount} onChange={(event) => setDraft({ ...draft, expectedPageCount: event.target.value })} />
            </label>
            <label>
              Source record
              <select disabled={readOnly} value={draft.sourceRecordId} onChange={(event) => setDraft({ ...draft, sourceRecordId: event.target.value })}>
                <option value="">No linked source record</option>
                {sourceOptions.map((source) => (
                  <option key={source.sourceRecordId} value={source.sourceRecordId}>
                    {source.sourceId} - {source.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="sanborn-atlas-navigator__section">
          <h3>Unassigned uploads</h3>
          {unassignedAssets.length === 0 ? (
            <p className="sanborn-atlas-empty">All uploaded Sanborn sheets are assigned to an atlas page.</p>
          ) : (
            <div className="sanborn-atlas-upload-list">
              {unassignedAssets.map((asset) => (
                <div className="sanborn-atlas-upload-list__item" key={asset.assetId}>
                  <span>{assetLabel(asset)}</span>
                  <button className="sanborn-button" disabled={readOnly || !selectedAtlasId} onClick={() => onAssignAsset(asset.assetId)} type="button">
                    Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="sanborn-atlas-navigator__section">
          <h3>Atlas pages</h3>
          {activePages.length === 0 ? (
            <p className="sanborn-atlas-empty">No pages are assigned to this atlas yet.</p>
          ) : (
            <div className="sanborn-atlas-page-list">
              {activePages.map((page, index) => {
                const asset = assets.find((candidate) => candidate.assetId === page.sanbornSheetAssetId) ?? null;
                return (
                  <article className={`sanborn-atlas-page-list__item${page.pageId === selectedPageId ? " is-selected" : ""}`} key={page.pageId}>
                    <button className="sanborn-atlas-page-list__select" onClick={() => onSelectPage(page.pageId)} type="button">
                      <strong>{page.displayLabel || `Page ${page.pageSequence}`}</strong>
                      <span>{asset ? assetLabel(asset) : page.sanbornSheetAssetId}</span>
                      <span className={`sanborn-atlas-page-list__state${page.isPersisted ? " is-saved" : " is-draft"}`}>
                        {page.isPersisted ? "Saved page" : "Draft assignment"}
                      </span>
                    </button>
                    <div className="sanborn-atlas-page-list__fields">
                      <label>
                        Sequence
                        <input disabled={readOnly} inputMode="numeric" value={page.pageSequence} onChange={(event) => onPatchPage(page.pageId, { pageSequence: Number(event.target.value) })} />
                      </label>
                      <label>
                        Type
                        <select disabled={readOnly} value={page.pageType} onChange={(event) => onPatchPage(page.pageId, { pageType: event.target.value as SanbornPageType })}>
                          {sanbornPageTypes.map((type) => (
                            <option key={type} value={type}>
                              {type.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Sheet number
                        <input disabled={readOnly} inputMode="numeric" value={page.sheetNumber ?? ""} onChange={(event) => onPatchPage(page.pageId, { sheetNumber: event.target.value ? Number(event.target.value) : null })} />
                      </label>
                      <label>
                        Volume
                        <input disabled={readOnly} value={page.volumeLabel ?? ""} onChange={(event) => onPatchPage(page.pageId, { volumeLabel: event.target.value })} />
                      </label>
                      <label>
                        Display label
                        <input disabled={readOnly} value={page.displayLabel ?? ""} onChange={(event) => onPatchPage(page.pageId, { displayLabel: event.target.value })} />
                      </label>
                    </div>
                    <div className="sanborn-atlas-page-list__actions">
                      <button className="sanborn-button" disabled={readOnly || index === 0} onClick={() => onReorderPage(page.pageId, "up")} type="button">
                        Move up
                      </button>
                      <button className="sanborn-button" disabled={readOnly || index === activePages.length - 1} onClick={() => onReorderPage(page.pageId, "down")} type="button">
                        Move down
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <footer className="sanborn-atlas-navigator__footer" aria-label="Atlas workflow actions">
        {showSaveAtlas ? (
          <button className="sanborn-button sanborn-button--primary" disabled={readOnly || saveActionsDisabled || !draft.editionYear} onClick={() => onSaveAtlas(draft)} type="button">
            Save atlas
          </button>
        ) : null}
        {showSavePageOrder ? (
          <button className="sanborn-button sanborn-button--primary" disabled={readOnly || saveActionsDisabled || !selectedAtlasId} onClick={onSavePages} type="button">
            Save page order
          </button>
        ) : null}
        {showSavePagesAndContinue ? (
          <button className="sanborn-button sanborn-button--primary" disabled={readOnly || saveActionsDisabled || !selectedAtlasId} onClick={onSavePagesAndContinue} type="button">
            Save pages and continue
          </button>
        ) : null}
        {!showSaveAtlas && !showSavePageOrder && !showSavePagesAndContinue ? (
          <span className="sanborn-atlas-navigator__footer-note">Select or assign a page to continue.</span>
        ) : null}
      </footer>
    </aside>
  );
}
