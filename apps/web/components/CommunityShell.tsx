"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { StatusChip } from "@/components/StatusChip";
import type { CommunityDemoData } from "@/lib/demo-data";

type CommunityShellProps = {
  dataSource: "supabase" | "demo_fallback";
  demo: CommunityDemoData;
  warningMessage?: string;
  children: ReactNode;
};

export function CommunityShell({ dataSource, demo, warningMessage, children }: CommunityShellProps) {
  const pathname = usePathname();
  const title = demo.town.year > 0 ? `${demo.town.name} ${demo.town.year}` : demo.town.name;
  const topbarChips = demo.statusChips.filter((chip) => ["Release", "Sources", "Sheets", "Buildings"].includes(chip.label));
  const isHistoricalMapStudio = pathname === "/community/historical-map-studio";
  const compactRouteLabels: Record<string, string> = {
    "/community/historical-map-studio": "Map",
    "/community/building-auditor": "Buildings",
    "/community/people-auditor": "People",
    "/community/source-provenance-inspector": "Sources",
  };

  return (
    <div className="page-root">
      <div className={`community-shell${isHistoricalMapStudio ? " community-shell--studio-focus" : ""}`}>
        <div className="community-shell__frame">
          {isHistoricalMapStudio ? (
            <header className="community-shell__topbar community-shell__topbar--studio-app">
              <div className="community-shell__compact-brand" aria-label="Product identity">
                <strong>Minds Eye / Community</strong>
                <span>{title}</span>
              </div>
              <nav className="community-shell__nav community-shell__nav--compact" aria-label="Community routes">
                {demo.routeLinks
                  .filter((route) => compactRouteLabels[route.href])
                  .map((route) => {
                    const isActive = pathname === route.href;
                    return (
                      <Link className={`nav-pill${isActive ? " is-active" : ""}`} href={route.href} key={route.href}>
                        {compactRouteLabels[route.href]}
                      </Link>
                    );
                  })}
              </nav>
              <div className="community-shell__status community-shell__status--compact">
                <span className={`source-indicator ${dataSource === "supabase" ? "source-indicator--supabase" : "source-indicator--fallback"}`}>
                  Data source: {dataSource === "supabase" ? "Supabase" : "Demo fallback"}
                </span>
                {warningMessage ? <p className="source-warning">{warningMessage}</p> : null}
              </div>
            </header>
          ) : (
            <header className="community-shell__topbar">
              <div className="community-shell__brand">
                <div>
                  <p className="community-shell__eyebrow">Community Verification Console</p>
                  <h1 className="community-shell__title">{title}</h1>
                  <p className="community-shell__subtitle">
                    {demo.town.packageId} | {demo.town.stateRegion} | {demo.town.scope}
                  </p>
                </div>
                <div className="community-shell__meta" aria-label="Town summary">
                  {topbarChips.map((chip) => (
                    <StatusChip key={chip.label} label={chip.label} state={chip.state} value={chip.value} />
                  ))}
                </div>
              </div>

              <div className="community-shell__status">
                <div className="source-indicator-row">
                  <span className={`source-indicator ${dataSource === "supabase" ? "source-indicator--supabase" : "source-indicator--fallback"}`}>
                    Data source: {dataSource === "supabase" ? "Supabase" : "Demo fallback"}
                  </span>
                </div>
                {warningMessage ? <p className="source-warning">{warningMessage}</p> : null}
              </div>

              <nav className="community-shell__nav" aria-label="Community routes">
                {demo.routeLinks.map((route) => {
                  const isActive = pathname === route.href;
                  return (
                    <Link className={`nav-pill${isActive ? " is-active" : ""}`} href={route.href} key={route.href}>
                      {route.label}
                    </Link>
                  );
                })}
              </nav>
            </header>
          )}

          <main className="community-shell__main">{children}</main>
        </div>
      </div>
    </div>
  );
}
