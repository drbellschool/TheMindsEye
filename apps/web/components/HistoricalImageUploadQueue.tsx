"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { uploadHistoricalImage, type HistoricalUploadController, type HistoricalUploadInput, type HistoricalUploadPhase, type HistoricalUploadProgress } from "@/lib/historical-image-upload-client";

export type HistoricalImageUploadTask = Omit<HistoricalUploadInput, "onProgress" | "file"> & { file: File; id?: string };
export type HistoricalImageUploadQueueHandle = { enqueue: (tasks: HistoricalImageUploadTask[]) => void };
type Entry = { id: string; task: HistoricalImageUploadTask; progress: HistoricalUploadProgress; controller?: HistoricalUploadController; error?: string; result?: unknown };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function label(phase: HistoricalUploadPhase): string { return phase.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase()); }

export const HistoricalImageUploadQueue = forwardRef<HistoricalImageUploadQueueHandle, { onCompleted?: (task: HistoricalImageUploadTask, result: unknown) => void }>(({ onCompleted }, ref) => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const pendingRef = useRef<HistoricalImageUploadTask[]>([]);
  const controllersRef = useRef(new Map<string, HistoricalUploadController>());
  const activeRef = useRef(0);

  function patchEntry(id: string, patch: Partial<Entry>) { setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch, progress: patch.progress ?? entry.progress } : entry)); }

  function pump() {
    while (activeRef.current < 2 && pendingRef.current.length > 0) {
      const task = pendingRef.current.shift()!;
      const id = task.id ?? `${task.file.name}-${task.file.lastModified}-${Math.random().toString(16).slice(2)}`;
      activeRef.current += 1;
      const controller = uploadHistoricalImage({ ...task, onProgress: (progress) => patchEntry(id, { progress }) });
      controllersRef.current.set(id, controller);
      patchEntry(id, { controller, progress: { phase: "preparing", bytesUploaded: 0, bytesTotal: task.file.size } });
      void controller.promise.then((result) => { patchEntry(id, { result, progress: { phase: "complete", bytesUploaded: task.file.size, bytesTotal: task.file.size } }); onCompleted?.(task, result); }).catch((error) => patchEntry(id, { error: error instanceof Error ? error.message : "Upload failed.", progress: { phase: "failed", bytesUploaded: 0, bytesTotal: task.file.size, message: error instanceof Error ? error.message : "Upload failed." } })).finally(() => { activeRef.current -= 1; controllersRef.current.delete(id); pump(); });
    }
  }

  useImperativeHandle(ref, () => ({ enqueue: (tasks) => { const next = tasks.map((task) => ({ id: task.id ?? `${task.file.name}-${task.file.lastModified}-${Math.random().toString(16).slice(2)}`, task, progress: { phase: "queued" as const, bytesUploaded: 0, bytesTotal: task.file.size } })); setEntries((current) => [...current, ...next]); pendingRef.current.push(...tasks); pump(); } }), []);

  if (entries.length === 0) return null;
  const totalBytes = entries.reduce((sum, entry) => sum + entry.task.file.size, 0);
  const uploadedBytes = entries.reduce((sum, entry) => sum + Math.min(entry.progress.bytesUploaded, entry.task.file.size), 0);
  const completed = entries.filter((entry) => entry.progress.phase === "complete").length;
  const percent = totalBytes ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
  return <aside className="historical-image-upload-queue" aria-label="Historical image upload progress"><header><strong>Historical image uploads</strong><span>{completed} of {entries.length} complete · {formatBytes(uploadedBytes)} of {formatBytes(totalBytes)} · {percent}%</span></header><div className="historical-image-upload-queue__overall"><span style={{ width: `${percent}%` }} /></div>{entries.map((entry) => { const itemPercent = entry.progress.bytesTotal ? Math.round((entry.progress.bytesUploaded / entry.progress.bytesTotal) * 100) : 0; return <article key={entry.id}><div className="historical-image-upload-queue__line"><strong>{entry.task.file.name}</strong><span>{label(entry.progress.phase)}</span></div><div className="historical-image-upload-queue__bar"><span style={{ width: `${itemPercent}%` }} /></div><div className="historical-image-upload-queue__detail"><span>{formatBytes(entry.progress.bytesUploaded)} of {formatBytes(entry.task.file.size)} · {itemPercent}%</span>{entry.progress.message || entry.error ? <span>{entry.progress.message || entry.error}</span> : null}</div><div className="historical-image-upload-queue__actions">{entry.progress.phase === "uploading" ? <button className="sanborn-button" onClick={() => entry.controller?.pause()} type="button">Pause</button> : null}{entry.progress.phase === "paused" ? <button className="sanborn-button" onClick={() => entry.controller?.resume()} type="button">Resume</button> : null}{entry.progress.phase === "failed" ? <button className="sanborn-button" onClick={() => entry.controller?.retry()} type="button">Retry</button> : null}{entry.progress.phase !== "complete" && entry.progress.phase !== "canceled" ? <button className="sanborn-button" onClick={() => entry.controller?.cancel()} type="button">Cancel</button> : null}{entry.progress.phase === "complete" ? <button className="sanborn-button" onClick={() => setEntries((current) => current.filter((candidate) => candidate.id !== entry.id))} type="button">Remove</button> : null}</div></article>; })}</aside>;
});

HistoricalImageUploadQueue.displayName = "HistoricalImageUploadQueue";

