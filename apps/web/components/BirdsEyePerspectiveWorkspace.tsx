"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBirdsEyeGlobalTransform, defaultBirdsEyeGlobalParameters, birdsEyeCalibrationQuality, completeBirdsEyeControlPointCount, solveBirdsEyeLocalWarp, warpBirdsEyeForward, warpBirdsEyeInverse, type BirdsEyeCalibration, type BirdsEyeControlPoint, type BirdsEyePerspectiveState } from "@/lib/birds-eye-calibration";
import type { SanbornMapPieceGeoreference } from "@/lib/sanborn-map-piece-georeference";
import { SanbornSourceImageStatus, useSanbornSourceImageState } from "@/components/SanbornSourceImage";

type Props = {
  state: BirdsEyePerspectiveState;
  townPackageId: string;
  atlasId: string;
  centerLatitude: number;
  centerLongitude: number;
  readOnly: boolean;
  placedGeometries: Array<{ id: string; label: string; geometry: SanbornMapPieceGeoreference["geographicGeometry"] }>;
  onStateChange: (state: BirdsEyePerspectiveState) => void;
};

const referenceWidth = 1000;
const referenceHeight = 700;

function safeNumber(value: string, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }

export function BirdsEyePerspectiveWorkspace({ state, townPackageId, atlasId, centerLatitude, centerLongitude, readOnly, placedGeometries, onStateChange }: Props) {
  const reference = state.assets.find((asset) => asset.assetId === state.designatedAssetId) ?? null;
  const initialParameters = state.calibration?.globalParameters ?? { ...defaultBirdsEyeGlobalParameters, centerLatitude, centerLongitude };
  const [parameters, setParameters] = useState(initialParameters);
  const [points, setPoints] = useState<BirdsEyeControlPoint[]>(state.controlPoints);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const referenceRef = useRef<SVGSVGElement | null>(null);
  const reconstructionRef = useRef<SVGSVGElement | null>(null);
  const transform = useMemo(() => createBirdsEyeGlobalTransform(parameters), [parameters]);
  const warpModel = useMemo(() => solveBirdsEyeLocalWarp(points, transform), [points, transform]);
  const completePoints = completeBirdsEyeControlPointCount(points);
  const quality = birdsEyeCalibrationQuality(points, state.calibration?.quality.solvedAt ?? null, state.calibration?.quality.savedAt ?? null);
  const selectedPoint = points.find((point) => point.sequence === selectedSequence) ?? null;
  const imageLifecycle = useSanbornSourceImageState({ asset: reference ? { assetId: reference.assetId, signedUrl: reference.signedUrl, originalFilename: reference.originalFilename, width: reference.width, height: reference.height } : null });

  useEffect(() => {
    setParameters(state.calibration?.globalParameters ?? { ...defaultBirdsEyeGlobalParameters, centerLatitude, centerLongitude });
    setPoints(state.controlPoints);
    setSelectedSequence(null);
  }, [centerLatitude, centerLongitude, state.calibration?.id, state.calibration?.updatedAt, state.designatedAssetId]);

  function imagePoint(event: React.MouseEvent<SVGSVGElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * (reference?.width || referenceWidth), y: ((event.clientY - rect.top) / rect.height) * (reference?.height || referenceHeight) };
  }

  function geographicPoint(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = { x: ((event.clientX - rect.left) / rect.width) * referenceWidth, y: ((event.clientY - rect.top) / rect.height) * referenceHeight };
    const unwarped = warpBirdsEyeInverse(screen, warpModel);
    return transform.inverse(unwarped);
  }

  function addOrCompletePoint(event: React.MouseEvent<SVGSVGElement>, side: "reference" | "reconstruction") {
    if (readOnly) return;
    if (selectedSequence === null) {
      const sequence = points.length === 0 ? 1 : Math.max(...points.map((point) => point.sequence)) + 1;
      setSelectedSequence(sequence);
      setPoints((current) => [...current, { id: `draft-${sequence}`, sequence, label: `Point ${sequence}`, note: "", anchorType: "other", linkedMapPieceId: null, longitude: null, latitude: null, imageX: null, imageY: null, enabled: true, deletedAt: null }]);
      setMessage("Point created. Click the reconstruction and reference panes to complete the pair.");
      return;
    }
    setPoints((current) => current.map((point) => {
      if (point.sequence !== selectedSequence) return point;
      if (side === "reference") { const pixel = imagePoint(event); return { ...point, imageX: pixel.x, imageY: pixel.y }; }
      const geo = geographicPoint(event); return geo ? { ...point, longitude: geo.longitude, latitude: geo.latitude } : point;
    }));
  }

  async function saveCalibration() {
    if (readOnly || saving) return;
    setSaving(true); setMessage("");
    const calibration: Partial<BirdsEyeCalibration> & Record<string, unknown> = { referenceAssetId: state.designatedAssetId, title: state.calibration?.title ?? "Birds-Eye Perspective Calibration", status: completePoints >= 4 ? "saved" : "draft", unavailableReason: null, globalParameters: parameters, warpType: "delaunay_piecewise_affine", solverVersion: "birds-eye-v1", warpModel, qualitySummary: { ...quality, averageResidualPixels: warpModel.averageResidualPixels, maximumResidualPixels: warpModel.maximumResidualPixels, worstPointSequence: warpModel.worstPointSequence, savedAt: new Date().toISOString() }, notes: state.calibration?.notes ?? "" };
    const response = await fetch("/api/community/historical-map-studio/birds-eye-calibration", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ townPackageId, atlasId, calibration, controlPoints: points }) });
    const result = await response.json().catch(() => null) as { ok?: boolean; calibrationId?: string } | null;
    if (!response.ok || !result?.ok) { setMessage("Birds-Eye calibration could not be saved. Your draft remains local."); setSaving(false); return; }
    const saved: BirdsEyeCalibration = { id: result.calibrationId ?? state.calibration?.id ?? null, townPackageId, atlasId, referenceAssetId: state.designatedAssetId, title: String(calibration.title), status: calibration.status as BirdsEyeCalibration["status"], unavailableReason: null, globalParameters: parameters, warpType: "delaunay_piecewise_affine", solverVersion: "birds-eye-v1", warpModel, quality: { ...quality, averageResidualPixels: warpModel.averageResidualPixels, maximumResidualPixels: warpModel.maximumResidualPixels, worstPointSequence: warpModel.worstPointSequence, savedAt: new Date().toISOString() }, notes: String(calibration.notes ?? ""), updatedAt: new Date().toISOString() };
    onStateChange({ ...state, calibration: saved, controlPoints: points }); setMessage("Birds-Eye calibration saved."); setSaving(false);
  }

  async function markUnavailable() {
    if (readOnly || saving) return;
    const reason = window.prompt("Why is Birds-Eye Perspective unavailable or not applicable for this edition?");
    if (!reason?.trim()) return;
    setSaving(true);
    const response = await fetch("/api/community/historical-map-studio/birds-eye-calibration", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ townPackageId, atlasId, calibration: { referenceAssetId: state.designatedAssetId, title: "Birds-Eye Perspective Calibration", status: "unavailable", unavailableReason: reason.trim(), globalParameters: parameters, warpType: "delaunay_piecewise_affine", solverVersion: "birds-eye-v1", warpModel: {}, qualitySummary: {}, notes: reason.trim() }, controlPoints: [] }) });
    const result = await response.json().catch(() => null) as { ok?: boolean; calibrationId?: string } | null;
    if (!response.ok || !result?.ok) { setMessage("The unavailable status could not be saved."); setSaving(false); return; }
    onStateChange({ ...state, calibration: { id: result.calibrationId ?? null, townPackageId, atlasId, referenceAssetId: state.designatedAssetId, title: "Birds-Eye Perspective Calibration", status: "unavailable", unavailableReason: reason.trim(), globalParameters: parameters, warpType: "delaunay_piecewise_affine", solverVersion: "birds-eye-v1", warpModel: {}, quality: birdsEyeCalibrationQuality(points), notes: reason.trim(), updatedAt: new Date().toISOString() }, controlPoints: [] });
    setMessage("Birds-Eye Perspective marked unavailable."); setSaving(false);
  }

  if (!reference) return <section className="birds-eye-workspace birds-eye-workspace--empty"><h2>Birds-Eye Perspective Calibration</h2><p>Designate a Birds-Eye Reference in Town &amp; Edition before calibrating.</p><button className="sanborn-button" disabled={readOnly || saving} onClick={() => void markUnavailable()} type="button">Mark unavailable / not applicable</button></section>;

  return <section className="birds-eye-workspace" aria-label="Birds-Eye Perspective Calibration">
    <header className="birds-eye-workspace__header"><div><span className="panel__eyebrow">Step 7</span><h2>Birds-Eye Perspective Calibration</h2><p>{reference.originalFilename} · {reference.width} × {reference.height}px</p></div><div className="birds-eye-workspace__actions"><button className="sanborn-button" disabled={readOnly || saving} onClick={() => void saveCalibration()} type="button">{saving ? "Saving calibration" : "Save calibration"}</button><button className="sanborn-button" disabled={readOnly} onClick={() => { setParameters({ ...defaultBirdsEyeGlobalParameters, centerLatitude, centerLongitude }); setPoints(state.controlPoints); setMessage("Local draft reset."); }} type="button">Discard changes</button></div></header>
    <div className="birds-eye-workspace__panes">
      <div className="birds-eye-pane"><header><strong>Historical Reference</strong><span>Click to place the selected reference point</span></header><div className="birds-eye-pane__image-status"><SanbornSourceImageStatus filename={reference.originalFilename} onRetry={imageLifecycle.retryImage} state={imageLifecycle.state} /></div><svg ref={referenceRef} className="birds-eye-pane__svg" onClick={(event) => addOrCompletePoint(event, "reference")} viewBox={`0 0 ${reference.width} ${reference.height}`} role="img" aria-label="Historical Birds-Eye reference"><image key={imageLifecycle.imageKey} href={reference.signedUrl ?? ""} height={reference.height} width={reference.width} preserveAspectRatio="xMidYMid meet" onLoad={imageLifecycle.onLoad} onError={imageLifecycle.onError} /><g className="birds-eye-points">{points.filter((point) => point.imageX !== null && point.imageY !== null).map((point) => <g key={point.sequence} className={selectedSequence === point.sequence ? "is-selected" : ""} onClick={(event) => { event.stopPropagation(); setSelectedSequence(point.sequence); }}><circle cx={point.imageX!} cy={point.imageY!} r={Math.max(reference.width / 180, 8)} /><text x={point.imageX! + 10} y={point.imageY! - 10}>{point.sequence}</text></g>)}</g></svg></div>
      <div className="birds-eye-pane"><header><strong>Distorted Reconstruction</strong><span>Click to place the selected geographic anchor</span></header><svg ref={reconstructionRef} className="birds-eye-pane__svg birds-eye-pane__svg--reconstruction" onClick={(event) => addOrCompletePoint(event, "reconstruction")} viewBox={`0 0 ${referenceWidth} ${referenceHeight}`} role="img" aria-label="Distorted placed reconstruction"><rect fill="#d8ccb7" height={referenceHeight} width={referenceWidth} /><g className="birds-eye-geometry">{placedGeometries.map((item) => { const coordinates = item.geometry?.coordinates ?? []; const rendered = coordinates.map((coordinate) => warpBirdsEyeForward(transform.forward(coordinate.longitude, coordinate.latitude), warpModel)); if (rendered.length === 0) return null; const pointsText = rendered.map((point) => `${point.x},${point.y}`).join(" "); return <g key={item.id}><polyline fill="rgba(98,81,138,.2)" points={pointsText} stroke="#554175" strokeWidth="3" /><text x={rendered[0].x + 8} y={rendered[0].y - 8}>{item.label}</text></g>; })}</g><g className="birds-eye-points">{points.filter((point) => point.longitude !== null && point.latitude !== null).map((point) => { const projected = warpBirdsEyeForward(transform.forward(point.longitude!, point.latitude!), warpModel); return <g key={point.sequence} className={selectedSequence === point.sequence ? "is-selected" : ""} onClick={(event) => { event.stopPropagation(); setSelectedSequence(point.sequence); }}><circle cx={projected.x} cy={projected.y} r="8" /><text x={projected.x + 10} y={projected.y - 10}>{point.sequence}</text></g>; })}</g></svg></div>
    </div>
    <div className="birds-eye-workspace__controls"><section><h3>Global perspective</h3><div className="birds-eye-parameter-grid">{(["bearing", "pitch", "fieldOfView", "perspectiveStrength", "horizon", "scaleX", "scaleY", "offsetX", "offsetY"] as const).map((key) => <label key={key}>{key.replaceAll(/([A-Z])/g, " $1")}<input type="number" step="any" value={parameters[key]} onChange={(event) => setParameters((current) => ({ ...current, [key]: safeNumber(event.target.value, current[key]) }))} /></label>)}</div></section><section><h3>Control points</h3><p>{points.length} total · {completePoints} complete enabled · {quality.disabledPoints} disabled · {quality.incompletePoints} incomplete</p><button className="sanborn-button sanborn-button--primary" disabled={readOnly} onClick={() => { const sequence = points.length === 0 ? 1 : Math.max(...points.map((point) => point.sequence)) + 1; setSelectedSequence(sequence); setPoints((current) => [...current, { id: `draft-${sequence}`, sequence, label: `Point ${sequence}`, note: "", anchorType: "other", linkedMapPieceId: null, longitude: null, latitude: null, imageX: null, imageY: null, enabled: true, deletedAt: null }]); }} type="button">Add control point</button>{selectedPoint ? <div className="birds-eye-selected-point"><label>Label<input value={selectedPoint.label} onChange={(event) => setPoints((current) => current.map((point) => point.sequence === selectedPoint.sequence ? { ...point, label: event.target.value } : point))} /></label><label>Anchor type<select value={selectedPoint.anchorType} onChange={(event) => setPoints((current) => current.map((point) => point.sequence === selectedPoint.sequence ? { ...point, anchorType: event.target.value as BirdsEyeControlPoint["anchorType"] } : point))}>{["intersection", "railroad_crossing", "block_corner", "building_landmark", "church", "depot", "school", "courthouse", "water_feature", "road_bend", "other"].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label><label><input checked={selectedPoint.enabled} onChange={(event) => setPoints((current) => current.map((point) => point.sequence === selectedPoint.sequence ? { ...point, enabled: event.target.checked } : point))} type="checkbox" /> Enabled</label><div><button className="sanborn-button" disabled={!points.some((point) => point.sequence < selectedPoint.sequence)} onClick={() => setSelectedSequence([...points].reverse().find((point) => point.sequence < selectedPoint.sequence)?.sequence ?? selectedPoint.sequence)} type="button">Previous</button><button className="sanborn-button" disabled={!points.some((point) => point.sequence > selectedPoint.sequence)} onClick={() => setSelectedSequence(points.find((point) => point.sequence > selectedPoint.sequence)?.sequence ?? selectedPoint.sequence)} type="button">Next</button><button className="sanborn-button" disabled={readOnly} onClick={() => { if (window.confirm(`Delete control point ${selectedPoint.sequence}?`)) { setPoints((current) => current.filter((point) => point.sequence !== selectedPoint.sequence)); setSelectedSequence(null); } }} type="button">Delete</button></div></div> : null}<div className="birds-eye-point-list">{points.map((point) => <button className={selectedSequence === point.sequence ? "is-selected" : ""} key={point.sequence} onClick={() => setSelectedSequence(point.sequence)} type="button">{point.sequence}. {point.label} {point.longitude !== null && point.imageX !== null ? "· complete" : "· incomplete"}</button>)}</div></section></div>
    <section className="birds-eye-global-secondary"><label>Center latitude<input type="number" step="any" value={parameters.centerLatitude} onChange={(event) => setParameters((current) => ({ ...current, centerLatitude: safeNumber(event.target.value, current.centerLatitude) }))} /></label><label>Center longitude<input type="number" step="any" value={parameters.centerLongitude} onChange={(event) => setParameters((current) => ({ ...current, centerLongitude: safeNumber(event.target.value, current.centerLongitude) }))} /></label><label>Skew X<input type="number" step="any" value={parameters.skewX} onChange={(event) => setParameters((current) => ({ ...current, skewX: safeNumber(event.target.value, current.skewX) }))} /></label><label>Skew Y<input type="number" step="any" value={parameters.skewY} onChange={(event) => setParameters((current) => ({ ...current, skewY: safeNumber(event.target.value, current.skewY) }))} /></label></section>
    <p className="birds-eye-workspace__message" aria-live="polite">{message || (completePoints < 4 ? "Not enough points for a perspective solve." : completePoints < 6 ? "Rough alignment: add at least six pairs for local warp refinement." : `Visual calibration error: ${warpModel.averageResidualPixels === null ? "not solved" : `${warpModel.averageResidualPixels.toFixed(1)} reference pixels average`}.`)}</p>
  </section>;
}
