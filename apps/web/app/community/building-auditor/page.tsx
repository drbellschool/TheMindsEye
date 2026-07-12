import { KeyValueList } from "@/components/KeyValueList";
import { Panel } from "@/components/Panel";
import { SourceLinkList } from "@/components/SourceLinkList";
import { loadCommunityData } from "@/lib/community-data";

export const metadata = {
  title: "Building Auditor | The Mind's Eye",
};

export default async function BuildingAuditorPage() {
  const { data: communityData } = await loadCommunityData();
  const { buildingAuditor } = communityData;

  return (
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
  );
}
