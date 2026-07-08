"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { StatusChip } from "@/components/StatusChip";
import type { CommunityDemoData } from "@/lib/demo-data";

type CommunityShellProps = {
  demo: CommunityDemoData;
  children: ReactNode;
};

export function CommunityShell({ demo, children }: CommunityShellProps) {
  const pathname = usePathname();

  return (
    <div className="page-root">
      <div className="community-shell">
        <div className="community-shell__frame">
          <header className="community-shell__topbar">
            <div className="community-shell__brand">
              <div>
                <p className="community-shell__eyebrow">Community Verification Console</p>
                <h1 className="community-shell__title">
                  {demo.town.name} {demo.town.year}
                </h1>
                <p className="community-shell__subtitle">
                  {demo.town.packageId} · {demo.town.stateRegion} · {demo.town.scope}
                </p>
              </div>
              <div className="community-shell__meta" aria-label="Town summary">
                <StatusChip label="Release" value={demo.town.releaseState} state={demo.town.releaseState} />
                <StatusChip label="Sources" value={String(demo.summary.sources)} state="ready" />
                <StatusChip label="Sheets" value={String(demo.summary.sheets)} state="reviewing" />
                <StatusChip label="Buildings" value={String(demo.summary.buildings)} state="partial" />
              </div>
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

          <main className="community-shell__main">{children}</main>
        </div>
      </div>
    </div>
  );
}
