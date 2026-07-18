import { KeyValueList } from "@/components/KeyValueList";
import { LegendList } from "@/components/LegendList";
import { Panel } from "@/components/Panel";
import { ReconstructionContextBar } from "@/components/ReconstructionContextBar";
import { SourceLinkList } from "@/components/SourceLinkList";
import { loadCommunityData } from "@/lib/community-data";
import { loadHistoricalMapStudioData } from "@/lib/historical-map-studio-data";
import { buildReconstructionModelFromStudioState } from "@/lib/town-reconstruction";

export const metadata = {
  title: "People Auditor | The Mind's Eye",
};

type PeopleAuditorPageProps = {
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

export default async function PeopleAuditorPage({ searchParams }: PeopleAuditorPageProps) {
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
    workflow: "people_activity",
  };
  const { peopleAuditor } = communityData;

  return (
    <div className="reconstruction-route-shell">
      <ReconstructionContextBar
        context={context}
        currentRoute="people"
        editionProgress={reconstructionModel.edition}
        pieces={reconstructionModel.pieceProgress}
        sheets={reconstructionModel.sheetProgress}
        sourceOptions={studioState.sourceOptions}
        townProgress={reconstructionModel.town}
        towns={studioState.townPackages}
        years={studioState.availableMapYears}
      />
      <Panel eyebrow="People & Activity" title="Coming next" subtitle="People, businesses, and activity will attach to the same town, sheet, and block context." tone="paper">
        <p className="small-muted">No automatic people identification or gameplay workflow is added in this PR. Current people review content is preserved below.</p>
      </Panel>
      <div className="content-grid content-grid--three">
      <Panel eyebrow="Source issues" title="Review queue" subtitle="People and business candidates stay separate." tone="paper">
        <div className="panel-grid">
          {peopleAuditor.sourceIssues.map((issue) => (
            <div className="small-card" key={issue.label}>
              <p className="muted">{issue.label}</p>
              <strong>{issue.value}</strong>
              <p className="small-muted">{issue.detail}</p>
            </div>
          ))}
        </div>
        <SourceLinkList links={peopleAuditor.sourceLinks} emptyLabel="No linked source" />
      </Panel>

      <Panel eyebrow="Person review" title={peopleAuditor.personReview.title} subtitle={peopleAuditor.personReview.subtitle} tone="dark">
        <KeyValueList
          items={peopleAuditor.personReview.fields.map((item) => ({
            label: item.label,
            value: item.value,
            detail: item.detail,
          }))}
        />
        <SourceLinkList links={peopleAuditor.personReview.sourceLinks} emptyLabel="No linked source" />
      </Panel>

      <Panel eyebrow="Business review" title={peopleAuditor.businessReview.title} subtitle={peopleAuditor.businessReview.subtitle} tone="dark">
        <KeyValueList
          items={peopleAuditor.businessReview.fields.map((item) => ({
            label: item.label,
            value: item.value,
            detail: item.detail,
          }))}
        />
        <SourceLinkList links={peopleAuditor.businessReview.sourceLinks} emptyLabel="No linked source" />
      </Panel>

      <aside className="content-grid">
        <Panel eyebrow="Legend" title="Confidence and state" subtitle="Keep identity evidence visible." tone="paper">
          <LegendList items={peopleAuditor.legend} />
        </Panel>

        <Panel eyebrow="Unresolved" title="Open items" subtitle="These remain in the review queue." tone="dark">
          {peopleAuditor.unresolved.length > 0 ? (
            <div className="blocker-list">
              {peopleAuditor.unresolved.map((item) => (
                <span className="tag state-blocked" key={item}>
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <p className="small-muted">No unresolved people or business review events are currently loaded.</p>
          )}
        </Panel>

        <Panel eyebrow="History" title="Recent activity" subtitle="Human review and source linkage changes." tone="dark">
          <div className="small-muted">
            {peopleAuditor.history.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </Panel>
      </aside>
      </div>
    </div>
  );
}
