import { KeyValueList } from "@/components/KeyValueList";
import { LegendList } from "@/components/LegendList";
import { Panel } from "@/components/Panel";
import { loadCommunityData } from "@/lib/community-data";

export const metadata = {
  title: "Map Auditor | The Mind's Eye",
};

export default async function MapAuditorPage() {
  const { data: communityData } = await loadCommunityData();
  const { mapAuditor } = communityData;

  return (
    <div className="content-grid content-grid--three">
      <Panel eyebrow="Sheet Strip" title="Sanborn sheets" subtitle="Select a sheet in the stitching workspace." tone="map">
        <div className="panel-grid">
          {mapAuditor.sheetStrip.map((sheet) => (
            <div className="small-card" key={sheet.label}>
              <p className="muted">{sheet.label}</p>
              <strong>{sheet.status}</strong>
              <p className="small-muted">{sheet.notes}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="Workspace" title="Stitching surface" subtitle={mapAuditor.workspace.subtitle} tone="blueprint">
        <div className="map-workspace">
          <div className="callout">
            <p className="muted">{mapAuditor.workspace.calloutLabel}</p>
            <strong>{mapAuditor.workspace.calloutValue}</strong>
            <p className="small-muted">{mapAuditor.workspace.calloutDetail}</p>
          </div>
          <div className="map-grid map-grid--nested">
            <div className="footprint-box" aria-label="Stitched map placeholder" />
            <div className="panel-grid">
              <div className="callout">
                <p className="muted">Georeference status</p>
                <strong>{mapAuditor.georeference.status}</strong>
                <p className="small-muted">{mapAuditor.georeference.detail}</p>
              </div>
              <div className="callout">
                <p className="muted">Control points</p>
                <strong>{mapAuditor.controlPoints.length}</strong>
                <p className="small-muted">{mapAuditor.georeference.warning}</p>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="content-grid">
        <Panel eyebrow="Controls" title="Map tools" subtitle="Toggle the layers and review the seam work." tone="dark">
          <div className="tag-row">
            {mapAuditor.controls.map((control) => (
              <span className={`tag state-${control.state}`} key={control.label}>
                {control.label}
              </span>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Layer Stack" title="Render order" subtitle="Base map, roads, footprints, art, labels, markers, provenance." tone="dark">
          <div className="panel-grid">
            {mapAuditor.layerStack.map((layer) => (
              <div className="small-card" key={layer.label}>
                <p className="muted">{layer.label}</p>
                <strong>{layer.status}</strong>
                <p className="small-muted">{layer.note}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Control Points" title="Review trail" subtitle="Prep-only local alignment does not imply final georeferencing." tone="dark">
          <KeyValueList
            items={mapAuditor.controlPoints.map((point) => ({
              label: point.label,
              value: point.value,
              detail: point.detail,
            }))}
          />
        </Panel>
      </div>

      <aside className="content-grid">
        <Panel eyebrow="Evidence" title="Source trail" subtitle="Map alignment evidence and sheet context." tone="dark">
          <KeyValueList
            items={mapAuditor.evidence.fields.map((item) => ({
              label: item.label,
              value: item.value,
              detail: item.detail,
            }))}
          />
        </Panel>

        <Panel eyebrow="Legend" title="Review states" subtitle="Align map decisions with provenance labels." tone="dark">
          <LegendList items={communityData.reviewLegend} />
        </Panel>

        <Panel eyebrow="History" title="Recent actions" subtitle="Alignment history and unresolved items." tone="dark">
          <div className="small-muted">
            {mapAuditor.history.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}
