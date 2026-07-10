import Link from "next/link";

import { KeyValueList } from "@/components/KeyValueList";
import { Panel } from "@/components/Panel";
import { SourceLinkList } from "@/components/SourceLinkList";
import { loadCommunityData } from "@/lib/community-data";

export const metadata = {
  title: "Source / Provenance Inspector | The Mind's Eye",
};

export default async function SourceProvenanceInspectorPage() {
  const { data: communityData } = await loadCommunityData();
  const { sourceProvenanceInspector } = communityData;
  const primarySourceLink = sourceProvenanceInspector.source.sourceLinks[0];

  return (
    <div className="content-grid content-grid--split">
      <Panel
        action={
          primarySourceLink ? (
            <Link className="dashboard-panel-link" href={primarySourceLink.href}>
              Open source detail
            </Link>
          ) : null
        }
        eyebrow="Source"
        title={sourceProvenanceInspector.source.title}
        subtitle={sourceProvenanceInspector.source.subtitle}
        tone="paper"
      >
        <KeyValueList
          items={sourceProvenanceInspector.source.fields.map((item) => ({
            label: item.label,
            value: item.value,
            detail: item.detail,
          }))}
        />
        <SourceLinkList links={sourceProvenanceInspector.source.sourceLinks} emptyLabel="Source unavailable" />
      </Panel>

      <Panel eyebrow="OCR" title="Page text" subtitle="OCR is an aid, not the canonical record." tone="map">
        <div className="callout">
          <p className="small-muted">{sourceProvenanceInspector.ocr.quote}</p>
        </div>
      </Panel>

      <Panel eyebrow="Rights" title="Access and rights" subtitle="Keep permission notes visible on every source." tone="dark">
        <KeyValueList
          items={sourceProvenanceInspector.rights.fields.map((item) => ({
            label: item.label,
            value: item.value,
            detail: item.detail,
          }))}
        />
      </Panel>

      <Panel eyebrow="Linked Records" title="Downstream review trail" subtitle="Buildings, people, businesses, and claims linked from the source." tone="dark">
        <div className="panel-grid panel-grid--2">
          {sourceProvenanceInspector.linkedRecords.map((record) => (
            <div className="small-card" key={record.label}>
              <p className="muted">{record.label}</p>
              <strong>{record.value}</strong>
              <p className="small-muted">{record.detail}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="Provenance Trail" title="Review chain" subtitle="Source to normalized record to review decision." tone="dark">
        <div className="small-muted">
          {sourceProvenanceInspector.trail.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="History" title="Inspector notes" subtitle="Audit and export controls remain human-readable." tone="dark">
        <div className="small-muted">
          {sourceProvenanceInspector.history.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </Panel>
    </div>
  );
}
