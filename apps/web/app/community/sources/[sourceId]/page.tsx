import Link from "next/link";
import { notFound } from "next/navigation";

import { KeyValueList } from "@/components/KeyValueList";
import { Panel } from "@/components/Panel";
import { ReviewTimeline } from "@/components/ReviewTimeline";
import { StatusChip } from "@/components/StatusChip";
import { toChipState } from "@/lib/community-status";
import { loadCommunitySourceDetail, type CommunitySourceLinkedClaim, type CommunitySourceLinkedRecord } from "@/lib/community-source-detail";

export const metadata = {
  title: "Source Detail | The Mind's Eye",
};

type CommunitySourceDetailPageProps = {
  params: Promise<{
    sourceId: string;
  }>;
};

function formatStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function LinkedClaimList({ claims }: { claims: CommunitySourceLinkedClaim[] }) {
  if (claims.length === 0) {
    return <p className="small-muted">No linked claims are stored for this source record yet.</p>;
  }

  return (
    <div className="record-list">
      {claims.map((claim) => (
        <article className="record-list__item" key={claim.claimId}>
          <div className="record-list__header">
            <div>
              <p className="record-list__eyebrow">Claim ID</p>
              <strong className="record-list__title">{claim.claimId}</strong>
            </div>
            <div className="record-list__chips">
              <StatusChip label="Evidence" value={formatStatusLabel(claim.evidenceClassification)} state={toChipState(claim.evidenceClassification)} />
              <StatusChip label="Review" value={formatStatusLabel(claim.reviewStatus)} state={toChipState(claim.reviewStatus)} />
              <span className="tag">Certainty: {claim.certainty}</span>
            </div>
          </div>
          <p className="record-list__body">{claim.claimText}</p>
        </article>
      ))}
    </div>
  );
}

function LinkedRecordList({
  emptyState,
  records,
}: {
  emptyState: string;
  records: CommunitySourceLinkedRecord[];
}) {
  if (records.length === 0) {
    return <p className="small-muted">{emptyState}</p>;
  }

  return (
    <div className="record-list">
      {records.map((record) => (
        <article className="record-list__item" key={record.id}>
          <div className="record-list__header">
            <div>
              <p className="record-list__eyebrow">{record.id}</p>
              <strong className="record-list__title">{record.title}</strong>
            </div>
            <div className="record-list__chips">
              <StatusChip label="Review" value={formatStatusLabel(record.reviewStatus)} state={toChipState(record.reviewStatus)} />
              <span className="tag">Certainty: {record.certainty}</span>
            </div>
          </div>
          <p className="record-list__body">{record.detail}</p>
          <p className="small-muted">{record.note}</p>
        </article>
      ))}
    </div>
  );
}

export default async function CommunitySourceDetailPage({ params }: CommunitySourceDetailPageProps) {
  const { sourceId } = await params;
  const { record, source, warningMessage } = await loadCommunitySourceDetail(sourceId);
  const backLink = (
    <Link className="dashboard-panel-link dashboard-panel-link--dark" href="/community/source-provenance-inspector">
      Back to inspector
    </Link>
  );

  if (!record && !warningMessage) {
    notFound();
  }

  if (!record) {
    return (
      <div className="source-detail-page">
        <Panel
          action={backLink}
          eyebrow="Source Detail"
          title="Source detail unavailable"
          subtitle="Supabase could not return this source record, and no safe demo fallback exists for the requested ID."
          tone="dark"
        >
          <div className="source-indicator-row">
            <span className={`source-indicator ${source === "supabase" ? "source-indicator--supabase" : "source-indicator--fallback"}`}>
              Source detail: {source === "supabase" ? "Supabase" : "Demo fallback"}
            </span>
          </div>
          {warningMessage ? <p className="source-warning">{warningMessage}</p> : null}
          <KeyValueList
            items={[
              {
                label: "Requested source ID",
                value: sourceId,
                detail: "The route parameter did not resolve to a source detail record.",
              },
              {
                label: "Status",
                value: "Unavailable",
                detail: "No fabricated placeholder values are shown when the source detail query fails.",
              },
            ]}
          />
        </Panel>
      </div>
    );
  }

  return (
    <div className="source-detail-page">
      <Panel action={backLink} eyebrow="Source Detail" title={record.title} subtitle={`${record.sourceId} | ${record.archiveName}`} tone="dark">
        <div className="source-detail-hero">
          <div className="source-detail-hero__status">
            <span className={`source-indicator ${source === "supabase" ? "source-indicator--supabase" : "source-indicator--fallback"}`}>
              Source detail: {source === "supabase" ? "Supabase" : "Demo fallback"}
            </span>
            <StatusChip label="Review" value={formatStatusLabel(record.reviewStatus)} state={toChipState(record.reviewStatus)} />
            <StatusChip
              label="Evidence"
              value={formatStatusLabel(record.evidenceClassification)}
              state={toChipState(record.evidenceClassification)}
            />
            <span className="tag">Certainty: {record.certainty}</span>
          </div>

          <div className="callout source-detail-link-panel">
            <p className="dashboard-section-label">Source URL</p>
            {record.sourceUrl ? (
              <a className="source-detail-link" href={record.sourceUrl} rel="noreferrer" target="_blank">
                {record.sourceUrl}
              </a>
            ) : (
              <p className="small-muted">Unavailable</p>
            )}
          </div>
        </div>

        {warningMessage ? <p className="source-warning">{warningMessage}</p> : null}
      </Panel>

      <div className="content-grid content-grid--split">
        <Panel eyebrow="Metadata" title="Source record fields" subtitle="Stored source metadata remains visible and read-only." tone="paper">
          <KeyValueList
            items={[
              {
                label: "Source title",
                value: record.title,
                detail: "Current title stored on the source record.",
              },
              {
                label: "Source ID",
                value: record.sourceId,
                detail: "Stable source identifier used by the Community read model.",
              },
              {
                label: "Archive",
                value: record.archiveName,
                detail: "Owning or describing archive, when recorded.",
              },
              {
                label: "Source date",
                value: record.sourceDate,
                detail: "Source date remains unknown or unavailable until a record stores it.",
              },
              {
                label: "Page / issue",
                value: record.pageReference,
                detail: "Sheet, page, or issue reference stored on the source record.",
              },
              {
                label: "Rights note",
                value: record.rightsNote,
                detail: "Rights and usage notes remain attached to the source.",
              },
            ]}
          />
        </Panel>

        <Panel eyebrow="Classification" title="Evidence and review state" subtitle="Evidence classification stays separate from workflow status." tone="paper">
          <KeyValueList
            items={[
              {
                label: "Review status",
                value: record.reviewStatus,
                detail: "Workflow state from the Supabase source record.",
              },
              {
                label: "Evidence classification",
                value: record.evidenceClassification,
                detail: "Missing or invalid evidence classifications normalize to unknown.",
              },
              {
                label: "Certainty",
                value: record.certainty,
                detail: "Stored certainty value, or unknown when unavailable.",
              },
              {
                label: "Source URL",
                value: record.sourceUrl ?? "Unavailable",
                detail: "The page stays read-only and never exposes secret keys.",
              },
            ]}
          />
        </Panel>
      </div>

      <Panel eyebrow="OCR Excerpt" title="Text and excerpt trail" subtitle="OCR is a review aid and not the canonical historical record." tone="map">
        <div className="callout">
          <p className="small-muted">{record.ocrExcerpt}</p>
        </div>
      </Panel>

      <Panel eyebrow="Linked Claims" title="Claims stored against this source" subtitle="Claims are shown only when the `claims.source_record_id` relationship exists." tone="paper">
        <LinkedClaimList claims={record.linkedClaims} />
      </Panel>

      <div className="content-grid content-grid--three">
        <Panel eyebrow="Linked Buildings" title="Building records" subtitle="No building is shown unless the stored claim relationship points to it." tone="dark">
          <LinkedRecordList emptyState="No linked buildings are stored for this source record yet." records={record.linkedBuildings} />
        </Panel>

        <Panel eyebrow="Linked People" title="People records" subtitle="People links remain explicit and review-bound." tone="dark">
          <LinkedRecordList emptyState="No linked people are stored for this source record yet." records={record.linkedPeople} />
        </Panel>

        <Panel eyebrow="Linked Businesses" title="Business records" subtitle="Business links remain separate from person links until reviewed." tone="dark">
          <LinkedRecordList emptyState="No linked businesses are stored for this source record yet." records={record.linkedBusinesses} />
        </Panel>
      </div>

      <Panel eyebrow="Review Notes" title="Source-specific review timeline" subtitle="Append-only source review events remain visible when present." tone="paper">
        <ReviewTimeline emptyState={record.reviewTimelineEmptyState} events={record.reviewTimeline} />
      </Panel>
    </div>
  );
}
