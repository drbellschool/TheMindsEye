import { KeyValueList } from "@/components/KeyValueList";
import { LegendList } from "@/components/LegendList";
import { Panel } from "@/components/Panel";
import { RouteCard } from "@/components/RouteCard";
import { StatusChip } from "@/components/StatusChip";
import { communityDemo } from "@/lib/demo-data";

export const metadata = {
  title: "Community Dashboard | The Mind's Eye",
};

export default function CommunityDashboardPage() {
  const { communityDashboard, reviewLegend, routeCards } = communityDemo;

  return (
    <div className="shell-grid shell-grid--dashboard">
      <div className="content-grid">
        <Panel
          eyebrow={communityDashboard.hero.eyebrow}
          title={communityDashboard.hero.title}
          subtitle={communityDashboard.hero.subtitle}
          tone="paper"
        >
          <div className="panel-grid panel-grid--2">
            <div className="callout">
              <p className="muted">Year gate</p>
              <strong>{communityDashboard.yearGate.value}</strong>
              <p className="small-muted">{communityDashboard.yearGate.detail}</p>
            </div>
            <div className="callout">
              <p className="muted">Release gate</p>
              <strong>{communityDashboard.releaseGate.state}</strong>
              <p className="small-muted">{communityDashboard.releaseGate.reason}</p>
            </div>
          </div>
          <div className="status-strip" style={{ marginTop: 16 }}>
            {communityDemo.statusChips.map((chip) => (
              <StatusChip key={chip.label} label={chip.label} value={chip.value} state={chip.state} />
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Primary Routes" title="Route cards" subtitle="Jump into the specialized community auditors." tone="paper">
          <div className="panel-grid panel-grid--2">
            {routeCards.map((route) => (
              <RouteCard key={route.href} {...route} />
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Coverage" title="Review status overview" subtitle="Community readiness and scope gates." tone="paper">
          <KeyValueList
            items={communityDashboard.overviewCards.map((item) => ({
              label: item.label,
              value: item.value,
              detail: item.detail,
            }))}
          />
          <div className="progress" style={{ marginTop: 16 }}>
            <span style={{ width: `${communityDemo.summary.progressPercent}%` }} />
          </div>
        </Panel>

        <Panel eyebrow="Scope" title="Town ladder" subtitle="Community review sits upstream of classroom systems." tone="paper">
          <div className="panel-grid panel-grid--3">
            {communityDashboard.scopeLadder.map((item) => (
              <div className="small-card" key={item.label}>
                <p className="muted">{item.label}</p>
                <strong>{item.value}</strong>
                <p className="small-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <aside className="content-grid">
        <Panel eyebrow="Release Gate" title="Blockers" subtitle="These keep the town in guarded status." tone="dark">
          <div className="blocker-list">
            {communityDashboard.blockers.map((blocker) => (
              <span className="tag state-blocked" key={blocker}>
                {blocker}
              </span>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Evidence" title="Inspector" subtitle="Raw source trail and review state." tone="dark">
          <div className="callout">
            <p className="muted">{communityDashboard.evidenceInspector.sourceId}</p>
            <strong>{communityDashboard.evidenceInspector.title}</strong>
            <p className="small-muted">{communityDashboard.evidenceInspector.summary}</p>
          </div>
          <KeyValueList
            items={communityDashboard.evidenceInspector.fields.map((item) => ({
              label: item.label,
              value: item.value,
              detail: item.detail,
            }))}
          />
        </Panel>

        <Panel eyebrow="Legend" title="Review states" subtitle="Verified, inferred, illustrative, unknown, rejected." tone="dark">
          <LegendList items={reviewLegend} />
        </Panel>

        <Panel eyebrow="History" title="Recent activity" subtitle="Town changes and review actions." tone="dark">
          <div className="small-muted">
            {communityDashboard.history.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}
