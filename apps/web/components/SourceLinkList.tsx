import Link from "next/link";

import type { CommunitySourceLink } from "@/lib/community-source-links";

type SourceLinkListProps = {
  links: CommunitySourceLink[];
  emptyLabel?: string;
};

export function SourceLinkList({ links, emptyLabel = "No linked source" }: SourceLinkListProps) {
  if (links.length === 0) {
    return <p className="small-muted">{emptyLabel}</p>;
  }

  return (
    <div className="source-link-list">
      {links.map((link) => (
        <Link className="source-link-card" href={link.href} key={link.sourceId}>
          <span className="source-link-card__label">Source</span>
          <strong>{link.title}</strong>
          <span className="small-muted">{link.detail}</span>
          <span className="source-link-card__id">{link.sourceId}</span>
        </Link>
      ))}
    </div>
  );
}
