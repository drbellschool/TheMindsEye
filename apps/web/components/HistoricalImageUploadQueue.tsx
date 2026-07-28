"use client";

import type { HistoricalImageUploadManager, HistoricalImageUploadManagerEntry } from "@/lib/use-historical-image-upload-manager";
import type { HistoricalUploadPhase } from "@/lib/historical-image-upload-client";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function phaseLabel(phase: HistoricalUploadPhase): string { return phase.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase()); }

export function HistoricalImageUploadQueue({ manager }: { manager: HistoricalImageUploadManager }) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  if (!portalReady || manager.entries.length === 0) return null;
  const renderEntry = (entry: HistoricalImageUploadManagerEntry) => {
    const itemPercent = entry.progress.bytesTotal ? Math.round(entry.progress.bytesUploaded / entry.progress.bytesTotal * 100) : 0;
    const isActive = !["complete", "canceled", "failed"].includes(entry.progress.phase);
    return <article key={entry.id}><div className="historical-image-upload-queue__line"><strong>{entry.task.file.name}</strong><span>{phaseLabel(entry.progress.phase)}</span></div><div className="historical-image-upload-queue__bar"><span style={{ width: `${itemPercent}%` }} /></div><div className="historical-image-upload-queue__detail"><span>{formatBytes(entry.progress.bytesUploaded)} of {formatBytes(entry.task.file.size)} · {itemPercent}%</span>{entry.progress.message || entry.error ? <span>{entry.progress.message || entry.error}</span> : null}</div><div className="historical-image-upload-queue__actions">{entry.progress.phase === "uploading" ? <button className="sanborn-button" onClick={() => manager.pause(entry.id)} type="button">Pause</button> : null}{entry.progress.phase === "paused" ? <button className="sanborn-button" onClick={() => manager.resume(entry.id)} type="button">Resume</button> : null}{entry.progress.phase === "failed" ? <button className="sanborn-button" onClick={() => manager.retry(entry.id)} type="button">{entry.registrationRetry ? "Retry registration" : "Retry"}</button> : null}{isActive ? <button className="sanborn-button" onClick={() => manager.cancel(entry.id)} type="button">Cancel</button> : null}{entry.progress.phase === "complete" ? <button className="sanborn-button" onClick={() => manager.remove(entry.id)} type="button">Remove</button> : null}</div></article>;
  };
  const statusLabel = manager.aggregate.failed > 0
    ? `Uploads ${manager.aggregate.failed} failed`
    : manager.aggregate.active > 0
      ? `Uploads ${manager.aggregate.active} active · ${manager.aggregate.percent}%`
      : `Uploads Complete · ${manager.aggregate.percent}%`;
  if (!manager.expanded) return createPortal(<button className="historical-image-upload-queue historical-image-upload-queue--collapsed" onClick={manager.expand} type="button" aria-label="Expand uploads">{statusLabel}</button>, document.body);
  return createPortal(<aside className="historical-image-upload-queue" aria-label="Historical image upload progress" aria-live="polite"><header><strong>Historical image uploads</strong><span>{manager.aggregate.completed} of {manager.entries.length} complete · {formatBytes(manager.aggregate.uploadedBytes)} of {formatBytes(manager.aggregate.totalBytes)} · {manager.aggregate.percent}%</span><button className="sanborn-button" onClick={manager.collapse} type="button">Collapse</button></header><div className="historical-image-upload-queue__overall"><span style={{ width: `${manager.aggregate.percent}%` }} /></div>{manager.entries.map(renderEntry)}<footer><button className="sanborn-button" onClick={manager.collapse} type="button">Collapse</button><button className="sanborn-button" onClick={manager.clearCompleted} type="button">Close completed</button></footer></aside>, document.body);
}
