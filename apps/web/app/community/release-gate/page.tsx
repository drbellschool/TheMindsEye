import { KeyValueList } from "@/components/KeyValueList";
import { Panel } from "@/components/Panel";
import { SourceLinkList } from "@/components/SourceLinkList";
import { loadCommunityData } from "@/lib/community-data";

export const metadata = {
  title: "Release Gate | The Mind's Eye",
};

export default async function ReleaseGatePage() {
  const { data: communityData } = await loadCommunityData();
  const { releaseGate } = communityData;

  return (
    <div className="content-grid content-grid--split">
      <Panel eyebrow="Release" title="Gate status" subtitle={releaseGate.reason} tone="dark">
        <div className="release-banner">
          <div className="release-banner__state">{releaseGate.state}</div>
          <div className="progress">
            <span style={{ width: `${releaseGate.progressPercent}%` }} />
          </div>
          <p className="small-muted">{releaseGate.progressDetail}</p>
        </div>
      </Panel>

      <Panel eyebrow="Blockers" title="Why it is not ready" subtitle="These items must remain visible until reviewed." tone="paper">
        {releaseGate.blockers.length > 0 ? (
          <div className="blocker-list">
            {releaseGate.blockers.map((blocker) => (
              <span className="tag state-blocked" key={blocker}>
                {blocker}
              </span>
            ))}
          </div>
        ) : (
          <p className="small-muted">No unresolved review events are currently blocking release.</p>
        )}
      </Panel>

      <Panel eyebrow="Criteria" title="Readiness matrix" subtitle="The gate is more than a single status chip." tone="paper">
        <KeyValueList
          items={releaseGate.criteria.map((criterion) => ({
            label: criterion.label,
            value: criterion.value,
            detail: criterion.detail,
          }))}
        />
        <SourceLinkList links={releaseGate.sourceLinks} emptyLabel="No linked source" />
      </Panel>

      <Panel eyebrow="Export" title="Human handoff" subtitle="Preview, summarize, and export the current review state." tone="dark">
        <div className="tag-row">
          {releaseGate.actions.map((action) => (
            <span className={`tag state-${action.state}`} key={action.label}>
              {action.label}
            </span>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="History" title="Recent gate events" subtitle="A release decision should always have a trail." tone="dark">
        <div className="small-muted">
          {releaseGate.history.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </Panel>
    </div>
  );
}
