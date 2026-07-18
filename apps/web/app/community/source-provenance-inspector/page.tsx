import Link from "next/link";

import { KeyValueList } from "@/components/KeyValueList";
import { Panel } from "@/components/Panel";
import { ReconstructionContextBar } from "@/components/ReconstructionContextBar";
import { SourceLinkList } from "@/components/SourceLinkList";
import { loadCommunityData } from "@/lib/community-data";
import { loadHistoricalMapStudioData } from "@/lib/historical-map-studio-data";
import { buildReconstructionModelFromStudioState } from "@/lib/town-reconstruction";

export const metadata = {
  title: "Source / Provenance Inspector | The Mind's Eye",
};

type SourceProvenanceInspectorPageProps = {
  searchParams?: Promise<{
    atlas?: string;
    atlasId?: string;
    page?: string;
    atlasPageId?: string;
    piece?: string;
    mapPieceId?: string;
    sheet?: string;
    sheetAssetId?: string;
    town?: string;
    townPackageId?: string;
    year?: string;
    mapYear?: string;
  }>;
};

export default async function SourceProvenanceInspectorPage({ searchParams }: SourceProvenanceInspectorPageProps) {
  const params = (await searchParams) ?? {};
  const { data: communityData } = await loadCommunityData();
  const studioState = await loadHistoricalMapStudioData({
    townPackageId: params.townPackageId ?? params.town,
    mapYear: params.mapYear ?? params.year,
  });
  const reconstructionModel = buildReconstructionModelFromStudioState({
    state: studioState,
    selectedAtlasId: params.atlasId ?? params.atlas,
    selectedPageId: params.atlasPageId ?? params.page,
    selectedPieceId: params.mapPieceId ?? params.piece,
  });
  const selectedPieceProgress = reconstructionModel.pieceProgress.find((piece) => piece.pieceId === (params.mapPieceId ?? params.piece)) ?? null;
  const context = {
    townPackageId: studioState.activeTownPackage?.id ?? params.townPackageId ?? params.town,
    mapYear: studioState.activeMapYear ?? params.mapYear ?? params.year,
    atlasId: params.atlasId ?? params.atlas ?? reconstructionModel.activeAtlas?.atlasId,
    atlasPageId: params.atlasPageId ?? params.page,
    sheetAssetId: params.sheetAssetId ?? params.sheet,
    mapPieceId: params.mapPieceId ?? params.piece,
    blockId: selectedPieceProgress?.blockNumber ?? null,
    workflow: "evidence_review",
  };
  const { sourceProvenanceInspector } = communityData;
  const primarySourceLink = sourceProvenanceInspector.source.sourceLinks[0];

  return (
    <div className="reconstruction-route-shell">
      <ReconstructionContextBar
        context={context}
        currentRoute="sources"
        editionProgress={reconstructionModel.edition}
        pieces={reconstructionModel.pieceProgress}
        sheets={reconstructionModel.sheetProgress}
        sourceOptions={studioState.sourceOptions}
        townProgress={reconstructionModel.town}
        towns={studioState.townPackages}
        years={studioState.availableMapYears}
      />
      <Panel eyebrow="Sources & Evidence" title="Durable provenance" subtitle="Source records remain the canonical source identity for sheets, map pieces, claims, and later reconstruction records." tone="paper">
        <p className="small-muted">This PR adds the workflow shell and source identity foundation without adding OCR, automatic interpretation, or structured feature inventory.</p>
      </Panel>
      <div className="content-grid content-grid--split">
      <Panel
        action={
          primarySourceLink ? (
            <Link className="dashboard-panel-link" href={primarySourceLink.href}>
              Open source detail
            </Link>
          ) : null
        }
        eyebrow="Source"
        title={sourceProvenanceInspector.source.title}
        subtitle={sourceProvenanceInspector.source.subtitle}
        tone="paper"
      >
        <KeyValueList
          items={sourceProvenanceInspector.source.fields.map((item) => ({
            label: item.label,
            value: item.value,
            detail: item.detail,
          }))}
        />
        <SourceLinkList links={sourceProvenanceInspector.source.sourceLinks} emptyLabel="Source unavailable" />
      </Panel>

      <Panel eyebrow="OCR" title="Page text" subtitle="OCR is an aid, not the canonical record." tone="map">
        <div className="callout">
          <p className="small-muted">{sourceProvenanceInspector.ocr.quote}</p>
        </div>
      </Panel>

      <Panel eyebrow="Rights" title="Access and rights" subtitle="Keep permission notes visible on every source." tone="dark">
        <KeyValueList
          items={sourceProvenanceInspector.rights.fields.map((item) => ({
            label: item.label,
            value: item.value,
            detail: item.detail,
          }))}
        />
      </Panel>

      <Panel eyebrow="Linked Records" title="Downstream review trail" subtitle="Buildings, people, businesses, and claims linked from the source." tone="dark">
        <div className="panel-grid panel-grid--2">
          {sourceProvenanceInspector.linkedRecords.map((record) => (
            <div className="small-card" key={record.label}>
              <p className="muted">{record.label}</p>
              <strong>{record.value}</strong>
              <p className="small-muted">{record.detail}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="Provenance Trail" title="Review chain" subtitle="Source to normalized record to review decision." tone="dark">
        <div className="small-muted">
          {sourceProvenanceInspector.trail.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="History" title="Inspector notes" subtitle="Audit and export controls remain human-readable." tone="dark">
        <div className="small-muted">
          {sourceProvenanceInspector.history.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </Panel>
      </div>
    </div>
  );
}
