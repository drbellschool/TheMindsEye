import { KeyValueList } from "@/components/KeyValueList";
import { Panel } from "@/components/Panel";
import { communityDemo } from "@/lib/demo-data";

export const metadata = {
  title: "Source / Provenance Inspector | The Mind's Eye",
};

export default function SourceProvenanceInspectorPage() {
  const { sourceProvenanceInspector } = communityDemo;

  return (
    <div className="content-grid content-grid--split">
      <Panel eyebrow="Source" title={sourceProvenanceInspector.source.title} subtitle={sourceProvenanceInspector.source.subtitle} tone="paper">
        <KeyValueList
          items={sourceProvenanceInspector.source.fields.map((item) => ({
            label: item.label,
            value: item.value,
            detail: item.detail,
          }))}
        />
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
