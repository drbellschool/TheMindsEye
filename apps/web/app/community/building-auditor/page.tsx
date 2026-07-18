import { KeyValueList } from "@/components/KeyValueList";
import { Panel } from "@/components/Panel";
import { ReconstructionContextBar } from "@/components/ReconstructionContextBar";
import { SourceLinkList } from "@/components/SourceLinkList";
import { loadCommunityData } from "@/lib/community-data";
import { loadHistoricalMapStudioData } from "@/lib/historical-map-studio-data";
import { buildReconstructionModelFromStudioState } from "@/lib/town-reconstruction";

export const metadata = {
  title: "Building Auditor | The Mind's Eye",
};

type BuildingAuditorPageProps = {
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

export default async function BuildingAuditorPage({ searchParams }: BuildingAuditorPageProps) {
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
    workflow: "building_reconstruction",
  };
  const { buildingAuditor } = communityData;

  return (
    <div className="reconstruction-route-shell">
      <ReconstructionContextBar
        context={context}
        currentRoute="buildings"
        editionProgress={reconstructionModel.edition}
        pieces={reconstructionModel.pieceProgress}
        sheets={reconstructionModel.sheetProgress}
        sourceOptions={studioState.sourceOptions}
        townProgress={reconstructionModel.town}
        towns={studioState.townPackages}
        years={studioState.availableMapYears}
      />
      <Panel eyebrow="Building Reconstruction" title="Coming next" subtitle="This engine will use the shared Town / Edition / Sheet / Block context established by Historical Map Studio." tone="paper">
        <p className="small-muted">Structured building extraction remains out of scope for this PR. Current building review content is preserved below.</p>
      </Panel>
      <div className="content-grid content-grid--three">
      <div className="content-grid">
        <Panel eyebrow="Building" title={buildingAuditor.selectedBuilding.title} subtitle={buildingAuditor.selectedBuilding.subtitle} tone="paper">
          <KeyValueList
            items={buildingAuditor.selectedBuilding.fields.map((item) => ({
              label: item.label,
              value: item.value,
              detail: item.detail,
            }))}
          />
        </Panel>

        <Panel eyebrow="Footprint" title="Placement review" subtitle="Footprint and anchor relationship." tone="map">
          <div className="footprint-box" aria-label="Building footprint placeholder" />
          <p className="small-muted">{buildingAuditor.footprint.note}</p>
        </Panel>
      </div>

      <Panel eyebrow="Art" title="Building art preview" subtitle="Transparent background, layered fit, and visual detail state." tone="dark">
        <div className="art-preview">
          <div className="art-preview__label">
            <strong>{buildingAuditor.artPreview.title}</strong>
            <p className="small-muted">{buildingAuditor.artPreview.detail}</p>
          </div>
        </div>
        <div className="tag-row" style={{ marginTop: 16 }}>
          {buildingAuditor.artPreview.tags.map((tag) => (
            <span className={`tag state-${tag.state}`} key={tag.label}>
              {tag.label}
            </span>
          ))}
        </div>
      </Panel>

      <aside className="content-grid">
        <Panel eyebrow="Labels" title="Extracted text" subtitle="Approve visible labels before review promotion." tone="dark">
          <div className="panel-grid">
            {buildingAuditor.extractedLabels.map((label) => (
              <div className="small-card" key={label.label}>
                <p className="muted">{label.label}</p>
                <strong>{label.value}</strong>
                <p className="small-muted">{label.detail}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Provenance" title="Source trail" subtitle="Every building detail must point back to evidence." tone="dark">
          <KeyValueList
            items={buildingAuditor.provenance.fields.map((item) => ({
              label: item.label,
              value: item.value,
              detail: item.detail,
            }))}
          />
          <SourceLinkList links={buildingAuditor.provenance.sourceLinks} emptyLabel="No linked source" />
        </Panel>

        <Panel eyebrow="Review" title="Current state" subtitle="Verified, inferred, illustrative, or unknown." tone="dark">
          <div className="tag-row">
            {buildingAuditor.reviewStates.map((state) => (
              <span className={`tag state-${state.state}`} key={state.label}>
                {state.label}
              </span>
            ))}
          </div>
        </Panel>
      </aside>
      </div>
    </div>
  );
}
