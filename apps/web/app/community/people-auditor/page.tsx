import { KeyValueList } from "@/components/KeyValueList";
import { LegendList } from "@/components/LegendList";
import { Panel } from "@/components/Panel";
import { communityDemo } from "@/lib/demo-data";

export const metadata = {
  title: "People Auditor | The Mind's Eye",
};

export default function PeopleAuditorPage() {
  const { peopleAuditor } = communityDemo;

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
      </Panel>

      <Panel eyebrow="Person review" title={peopleAuditor.personReview.title} subtitle={peopleAuditor.personReview.subtitle} tone="dark">
        <KeyValueList
          items={peopleAuditor.personReview.fields.map((item) => ({
            label: item.label,
            value: item.value,
            detail: item.detail,
          }))}
        />
      </Panel>

      <Panel eyebrow="Business review" title={peopleAuditor.businessReview.title} subtitle={peopleAuditor.businessReview.subtitle} tone="dark">
        <KeyValueList
          items={peopleAuditor.businessReview.fields.map((item) => ({
            label: item.label,
            value: item.value,
            detail: item.detail,
          }))}
        />
      </Panel>

      <aside className="content-grid">
        <Panel eyebrow="Legend" title="Confidence and state" subtitle="Keep identity evidence visible." tone="paper">
          <LegendList items={peopleAuditor.legend} />
        </Panel>

        <Panel eyebrow="Unresolved" title="Open items" subtitle="These remain in the review queue." tone="dark">
          <div className="blocker-list">
            {peopleAuditor.unresolved.map((item) => (
              <span className="tag state-blocked" key={item}>
                {item}
              </span>
            ))}
          </div>
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
