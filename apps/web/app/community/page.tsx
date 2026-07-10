import Link from "next/link";

import { KeyValueList } from "@/components/KeyValueList";
import { Panel } from "@/components/Panel";
import { RouteCard } from "@/components/RouteCard";
import { StatusChip } from "@/components/StatusChip";
import { reviewStatuses, toChipState } from "@/lib/community-status";
import { loadCommunityData } from "@/lib/community-data";

export const metadata = {
  title: "Community Dashboard | The Mind's Eye",
};

function formatLastSync(source: "supabase" | "demo_fallback", history: string[]) {
  if (source === "demo_fallback") {
    return {
      value: "Demo snapshot",
      detail: "Supabase is unavailable, so the dashboard is using the safe demo fallback.",
    };
  }

  const datedEntry = history.find((entry) => /\b\d{4}-\d{2}-\d{2}\b/.test(entry));
  const match = datedEntry?.match(/\b\d{4}-\d{2}-\d{2}\b/);

  return {
    value: match?.[0] ?? "Live Supabase read",
    detail: datedEntry ?? "Supabase data loaded, but no dated review history is available yet.",
  };
}

function formatStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function CommunityDashboardPage() {
  const { data: communityData, source } = await loadCommunityData();
  const { communityDashboard, routeCards, summary, town, statusSummaries } = communityData;
  const routeCardsByHref = new Map(routeCards.map((route) => [route.href, route]));
  const primaryRouteCards = [
    routeCardsByHref.get("/community/map-auditor"),
    routeCardsByHref.get("/community/building-auditor"),
    routeCardsByHref.get("/community/people-auditor"),
  ].filter((route): route is NonNullable<typeof route> => Boolean(route));
  const sourceInspectorRoute = routeCardsByHref.get("/community/source-provenance-inspector");
  const releaseGateRoute = routeCardsByHref.get("/community/release-gate");
  const dashboardStatusChips = [
    { label: "Sources", value: String(statusSummaries.sourceRecords.total), state: statusSummaries.sourceRecords.state },
    { label: "Map layers", value: String(statusSummaries.mapLayers.total), state: statusSummaries.mapLayers.state },
    { label: "Buildings", value: String(statusSummaries.buildings.total), state: statusSummaries.buildings.state },
    { label: "People", value: String(statusSummaries.people.total), state: statusSummaries.people.state },
    { label: "Businesses", value: String(statusSummaries.businesses.total), state: statusSummaries.businesses.state },
    {
      label: "Unresolved",
      value: String(statusSummaries.unresolvedReviewEvents),
      state: statusSummaries.unresolvedReviewEvents > 0 ? "blocked" : "ready",
    },
    { label: "Release", value: communityDashboard.releaseGate.state, state: communityDashboard.releaseGate.state },
  ];
  const reviewStatusFamilies = [
    statusSummaries.sourceRecords,
    statusSummaries.mapLayers,
    statusSummaries.buildings,
    statusSummaries.people,
    statusSummaries.businesses,
    statusSummaries.claims,
  ];
  const reviewStatusSummaryItems = reviewStatusFamilies.map((family) => {
    const groupedCounts = reviewStatuses
      .filter((status) => family.counts[status] > 0)
      .map((status) => `${formatStatusLabel(status)}: ${family.counts[status]}`)
      .join(" | ");

    return {
      label: family.label,
      value: String(family.total),
      detail: groupedCounts.length > 0 ? groupedCounts : "No records loaded from Supabase yet.",
    };
  });
  const summaryBreakdownChips = reviewStatuses.map((status) => {
    const total =
      statusSummaries.sourceRecords.counts[status] +
      statusSummaries.mapLayers.counts[status] +
      statusSummaries.buildings.counts[status] +
      statusSummaries.people.counts[status] +
      statusSummaries.businesses.counts[status] +
      statusSummaries.claims.counts[status];

    return {
      label: formatStatusLabel(status),
      value: String(total),
      state: total > 0 ? toChipState(status) : "guarded",
    };
  });
  const activeYear = town.year > 0 ? town.year : null;
  const yearGateStart = activeYear ? activeYear - 10 : null;
  const yearGateEnd = activeYear ? activeYear + 10 : null;
  const lastSync = formatLastSync(source, communityDashboard.history);
  const packageFields = [
    {
      label: "Town package",
      value: town.name,
      detail: "Active Community verification surface.",
    },
    {
      label: "Package ID",
      value: town.packageId,
      detail: "Reusable town-package identifier.",
    },
    {
      label: "Region",
      value: town.stateRegion,
      detail: "Regional scope for the active package.",
    },
    {
      label: "Active year",
      value: activeYear ? String(activeYear) : "unknown",
      detail: "Historical year centered in the review band.",
    },
    {
      label: "Release state",
      value: communityDashboard.releaseGate.state,
      detail: communityDashboard.releaseGate.reason,
    },
    {
      label: "Last sync",
      value: lastSync.value,
      detail: lastSync.detail,
    },
  ];

  return (
    <div className="community-dashboard">
      <Panel
        className="dashboard-hero"
        eyebrow={communityDashboard.hero.eyebrow}
        title={communityDashboard.hero.title}
        subtitle={communityDashboard.hero.subtitle}
        tone="dark"
      >
        <div className="dashboard-hero__grid">
          <div className="dashboard-hero__copy">
            <div className="dashboard-package-grid">
              {packageFields.map((field) => (
                <div className="dashboard-package-card" key={field.label}>
                  <p className="dashboard-package-card__label">{field.label}</p>
                  <strong>{field.value}</strong>
                  <p className="small-muted">{field.detail}</p>
                </div>
              ))}
            </div>

            <div className="dashboard-status-strip">
              {dashboardStatusChips.map((chip) => (
                <StatusChip key={chip.label} label={chip.label} value={chip.value} state={chip.state} />
              ))}
            </div>
          </div>

          <div className="dashboard-gate-stack">
            <div className="dashboard-year-band">
              <div className="dashboard-year-band__header">
                <div>
                  <p className="dashboard-section-label">Year Gate</p>
                  <strong>{activeYear ? `${yearGateStart}-${yearGateEnd}` : "Historical year unavailable"}</strong>
                  <p className="small-muted">{communityDashboard.yearGate.detail}</p>
                </div>
                <span className="dashboard-year-band__badge">{activeYear ? `${activeYear} center year` : "Awaiting year"}</span>
              </div>

              {activeYear ? (
                <div className="dashboard-year-band__track" aria-label={`20-year evidence band centered on ${activeYear}`}>
                  <span className="dashboard-year-band__edge">{yearGateStart}</span>
                  <div className="dashboard-year-band__rail">
                    <span className="dashboard-year-band__fill" />
                    <span className="dashboard-year-band__marker" />
                    <div className="dashboard-year-band__ticks" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                  <span className="dashboard-year-band__edge">{yearGateEnd}</span>
                </div>
              ) : (
                <p className="small-muted">A 20-year evidence band will appear after the active historical year is loaded.</p>
              )}
            </div>

            <div className="dashboard-release-callout">
              <div className="dashboard-release-callout__row">
                <div>
                  <p className="dashboard-section-label">Release Gate</p>
                  <strong>{communityDashboard.releaseGate.state}</strong>
                </div>
                <span className={`tag state-${communityDashboard.releaseGate.state}`}>{summary.progressPercent}% reviewed</span>
              </div>
              <p className="small-muted">{communityDashboard.releaseGate.reason}</p>
              <div className="progress">
                <span style={{ width: `${summary.progressPercent}%` }} />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <section className="dashboard-route-grid" aria-label="Primary community auditor routes">
        {primaryRouteCards.map((route) => (
          <RouteCard className="route-card--feature" key={route.href} {...route} />
        ))}
      </section>

      <Panel
        eyebrow="Review Status Summary"
        title="Real grouped counts from the Community read model"
        subtitle="These totals come from the shared Supabase-backed loader. Missing or invalid statuses normalize to unknown, and empty tables stay at zero without triggering fallback."
        tone="paper"
      >
        <div className="dashboard-status-strip">
          {summaryBreakdownChips.map((chip) => (
            <StatusChip key={chip.label} label={chip.label} value={chip.value} state={chip.state} />
          ))}
        </div>
        <KeyValueList items={reviewStatusSummaryItems} />
      </Panel>

      <div className="dashboard-summary-grid">
        <Panel
          action={
            sourceInspectorRoute ? (
              <Link className="dashboard-panel-link" href={sourceInspectorRoute.href}>
                Open inspector
              </Link>
            ) : null
          }
          className="dashboard-summary-panel"
          eyebrow="Source / Provenance Inspector"
          title={communityDashboard.evidenceInspector.title}
          subtitle={communityDashboard.evidenceInspector.summary}
          tone="paper"
        >
          <div className="callout">
            <p className="muted">{communityDashboard.evidenceInspector.sourceId}</p>
            <strong>{sourceInspectorRoute?.title ?? "Provenance drill-down"}</strong>
            <p className="small-muted">{sourceInspectorRoute?.text ?? "Review the raw source trail, OCR, rights, and linked records."}</p>
          </div>
          <KeyValueList
            items={communityDashboard.evidenceInspector.fields.map((item) => ({
              label: item.label,
              value: item.value,
              detail: item.detail,
            }))}
          />
        </Panel>

        <Panel
          action={
            releaseGateRoute ? (
              <Link className="dashboard-panel-link dashboard-panel-link--dark" href={releaseGateRoute.href}>
                Open release gate
              </Link>
            ) : null
          }
          className="dashboard-summary-panel"
          eyebrow="Release Gate Summary"
          title={releaseGateRoute?.title ?? "Handoff report"}
          subtitle={releaseGateRoute?.text ?? "Blockers, criteria, and readiness status."}
          tone="dark"
        >
          <div className="release-banner">
            <div className="release-banner__state">{communityDashboard.releaseGate.state}</div>
            <div className="progress">
              <span style={{ width: `${summary.progressPercent}%` }} />
            </div>
            <p className="small-muted">{communityDashboard.releaseGate.reason}</p>
          </div>
          <KeyValueList
            items={communityData.releaseGate.criteria.map((criterion) => ({
              label: criterion.label,
              value: criterion.value,
              detail: criterion.detail,
            }))}
          />
        </Panel>
      </div>

      <div className="dashboard-summary-grid">
        <Panel eyebrow="Recent Review History" title="Latest review events" subtitle="Keep recent community decisions visible." tone="paper">
          <div className="dashboard-history-list">
            {communityDashboard.history.map((item, index) => (
              <div className="dashboard-history-item" key={`${item}-${index}`}>
                <span className="dashboard-history-item__marker" aria-hidden="true" />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Unresolved Blockers" title="What still blocks release" subtitle="These items stay visible until the release gate is satisfied." tone="dark">
          <div className="dashboard-blocker-summary">
            <div className="dashboard-blocker-summary__count">
              <p className="dashboard-section-label">Open blockers</p>
              <strong>{summary.unresolved}</strong>
              <p className="small-muted">Items still blocking the town package handoff.</p>
            </div>

            {communityDashboard.blockers.length > 0 ? (
              <div className="blocker-list">
                {communityDashboard.blockers.map((blocker) => (
                  <span className="tag state-blocked" key={blocker}>
                    {blocker}
                  </span>
                ))}
              </div>
            ) : (
              <p className="small-muted">No unresolved review events are currently blocking release.</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
