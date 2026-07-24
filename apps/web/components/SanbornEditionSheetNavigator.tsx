"use client";

import type { SanbornAtlasPageRecord } from "@/lib/sanborn-atlas";
import type { SheetReconstructionProgress } from "@/lib/town-reconstruction";

type Props = {
  pages: SanbornAtlasPageRecord[];
  progress: SheetReconstructionProgress[];
  selectedPageId: string;
  indexPageId?: string | null;
  onSelectPage: (pageId: string) => void;
  onSelectIndex: () => void;
};

function statusForPage(page: SanbornAtlasPageRecord, progress: SheetReconstructionProgress[]) {
  return progress.find((item) => item.pageId === page.pageId)?.status ?? "not_started";
}

export function SanbornEditionSheetNavigator({ pages, progress, selectedPageId, indexPageId, onSelectPage, onSelectIndex }: Props) {
  return (
    <nav className="sanborn-edition-sheet-navigator" aria-label="Edition sheet navigator">
      <button className={`sanborn-edition-sheet-navigator__index${selectedPageId === indexPageId ? " is-active" : ""}`} onClick={onSelectIndex} type="button">
        Index
      </button>
      {pages.map((page, index) => {
        const status = statusForPage(page, progress);
        const label = page.sheetNumber ?? page.displayLabel ?? String(index + 1);
        return (
          <button
            aria-current={selectedPageId === page.pageId ? "page" : undefined}
            aria-label={`${label}: ${status.replaceAll("_", " ")}`}
            className={`sanborn-edition-sheet-navigator__page is-${status}${selectedPageId === page.pageId ? " is-active" : ""}`}
            key={page.pageId}
            onClick={() => onSelectPage(page.pageId)}
            title={`${label} — ${status.replaceAll("_", " ")}`}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
