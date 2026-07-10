import { KeyValueList } from "@/components/KeyValueList";
import { LegendList } from "@/components/LegendList";
import { Panel } from "@/components/Panel";
import { SourceLinkList } from "@/components/SourceLinkList";
import { loadCommunityData } from "@/lib/community-data";

export const metadata = {
  title: "People Auditor | The Mind's Eye",
};

export default async function PeopleAuditorPage() {
  const { data: communityData } = await loadCommunityData();
  const { peopleAuditor } = communityData;

  return (
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
  );
}
