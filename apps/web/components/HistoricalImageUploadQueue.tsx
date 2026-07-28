"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { normalizeHistoricalImageUploadTasks, type HistoricalImageUploadTask } from "@/lib/historical-image-upload-queue";
import { uploadHistoricalImage, type HistoricalUploadController, type HistoricalUploadPhase, type HistoricalUploadProgress } from "@/lib/historical-image-upload-client";

export type { HistoricalImageUploadTask } from "@/lib/historical-image-upload-queue";
export type HistoricalImageUploadQueueHandle = { enqueue: (tasks: HistoricalImageUploadTask[]) => boolean };
type Entry = { id: string; task: HistoricalImageUploadTask; progress: HistoricalUploadProgress; controller?: HistoricalUploadController; error?: string; result?: unknown; registrationRetry?: boolean };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function phaseLabel(phase: HistoricalUploadPhase): string { return phase.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase()); }

export const HistoricalImageUploadQueue = forwardRef<HistoricalImageUploadQueueHandle, { onCompleted?: (task: HistoricalImageUploadTask, result: unknown) => void; onActiveChange?: (progress: HistoricalUploadProgress | null, filename: string | null, kind: HistoricalImageUploadTask["kind"] | null) => void }>(({ onCompleted, onActiveChange }, ref) => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState(true);
  const entriesRef = useRef<Entry[]>([]);
  const pendingRef = useRef<HistoricalImageUploadTask[]>([]);
  const activeRef = useRef(0);
  const activeIdsRef = useRef(new Set<string>());

  function patchEntry(id: string, patch: Partial<Entry>) {
    setEntries((current) => {
      const next = current.map((entry) => entry.id === id ? { ...entry, ...patch, progress: patch.progress ?? entry.progress } : entry);
      entriesRef.current = next;
      return next;
    });
    if (patch.progress && patch.progress.phase !== "complete" && patch.progress.phase !== "canceled") {
      const task = entriesRef.current.find((entry) => entry.id === id)?.task;
      onActiveChange?.(patch.progress, task?.file.name ?? null, task?.kind ?? null);
    }
  }

  function releaseSlot(id: string) {
    pendingRef.current = pendingRef.current.filter((task) => task.id !== id);
    if (!activeIdsRef.current.delete(id)) return false;
    activeRef.current = Math.max(0, activeRef.current - 1);
    return true;
  }

  function pump() {
    while (activeRef.current < 2 && pendingRef.current.length > 0) startTask(pendingRef.current.shift()!);
  }

  function startTask(task: HistoricalImageUploadTask) {
    const id = task.id!;
    activeIdsRef.current.add(id);
    activeRef.current += 1;
    const controller = uploadHistoricalImage({
      ...task,
      onProgress: (progress) => patchEntry(id, { progress }),
      onError: (error) => {
        const registrationRetry = task.file.size === (entriesRef.current.find((entry) => entry.id === id)?.progress.bytesUploaded ?? 0);
        patchEntry(id, { error: error.message, registrationRetry, progress: { phase: "failed", bytesUploaded: registrationRetry ? task.file.size : 0, bytesTotal: task.file.size, message: error.message } });
        releaseSlot(id);
        pump();
      },
    });
    patchEntry(id, { controller, progress: { phase: "preparing", bytesUploaded: 0, bytesTotal: task.file.size }, error: undefined });
    void controller.promise.then((result) => {
      patchEntry(id, { result, error: undefined, registrationRetry: false, progress: { phase: "complete", bytesUploaded: task.file.size, bytesTotal: task.file.size } });
      onCompleted?.(task, result);
      onActiveChange?.(null, null, null);
      releaseSlot(id);
      pump();
    });
  }

  function enqueue(tasks: HistoricalImageUploadTask[]): boolean {
    const normalized = normalizeHistoricalImageUploadTasks(tasks, new Set(entriesRef.current.map((entry) => entry.id)));
    if (normalized.length === 0) return false;
    const nextEntries = normalized.map((task) => ({ id: task.id!, task, progress: { phase: "queued" as const, bytesUploaded: 0, bytesTotal: task.file.size } }));
    setEntries((current) => { const next = [...current, ...nextEntries]; entriesRef.current = next; return next; });
    setExpanded(true);
    pendingRef.current.push(...normalized);
    pump();
    return true;
  }

  function retryEntry(entry: Entry) {
    patchEntry(entry.id, { progress: { phase: "retrying", bytesUploaded: entry.progress.bytesUploaded, bytesTotal: entry.task.file.size }, error: undefined });
    if (entry.registrationRetry && entry.controller) {
      if (activeRef.current >= 2) { pendingRef.current.push(entry.task); return; }
      activeIdsRef.current.add(entry.id);
      activeRef.current += 1;
      entry.controller.retry();
      return;
    }
    if (activeRef.current >= 2) pendingRef.current.push(entry.task);
    else startTask(entry.task);
  }

  useImperativeHandle(ref, () => ({ enqueue }), []);

  if (entries.length === 0) return null;
  const totalBytes = entries.reduce((sum, entry) => sum + entry.task.file.size, 0);
  const uploadedBytes = entries.reduce((sum, entry) => sum + Math.min(entry.progress.bytesUploaded, entry.task.file.size), 0);
  const completed = entries.filter((entry) => entry.progress.phase === "complete").length;
  const active = entries.filter((entry) => !["complete", "canceled"].includes(entry.progress.phase)).length;
  const percent = totalBytes ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
  if (!expanded) return <button className="historical-image-upload-queue historical-image-upload-queue--collapsed" onClick={() => setExpanded(true)} type="button" aria-label="Expand uploads">Uploads {active} active · {percent}%</button>;
  return <aside className="historical-image-upload-queue" aria-label="Historical image upload progress" aria-live="polite"><header><strong>Historical image uploads</strong><span>{completed} of {entries.length} complete · {formatBytes(uploadedBytes)} of {formatBytes(totalBytes)} · {percent}%</span><button className="sanborn-button" onClick={() => setExpanded(false)} type="button">Collapse</button></header><div className="historical-image-upload-queue__overall"><span style={{ width: `${percent}%` }} /></div>{entries.map((entry) => { const itemPercent = entry.progress.bytesTotal ? Math.round((entry.progress.bytesUploaded / entry.progress.bytesTotal) * 100) : 0; const isActive = !["complete", "canceled"].includes(entry.progress.phase); return <article key={entry.id}><div className="historical-image-upload-queue__line"><strong>{entry.task.file.name}</strong><span>{phaseLabel(entry.progress.phase)}</span></div><div className="historical-image-upload-queue__bar"><span style={{ width: `${itemPercent}%` }} /></div><div className="historical-image-upload-queue__detail"><span>{formatBytes(entry.progress.bytesUploaded)} of {formatBytes(entry.task.file.size)} · {itemPercent}%</span>{entry.progress.message || entry.error ? <span>{entry.progress.message || entry.error}</span> : null}</div><div className="historical-image-upload-queue__actions">{entry.progress.phase === "uploading" ? <button className="sanborn-button" onClick={() => entry.controller?.pause()} type="button">Pause</button> : null}{entry.progress.phase === "paused" ? <button className="sanborn-button" onClick={() => entry.controller?.resume()} type="button">Resume</button> : null}{entry.progress.phase === "failed" ? <button className="sanborn-button" onClick={() => retryEntry(entry)} type="button">{entry.registrationRetry ? "Retry registration" : "Retry"}</button> : null}{isActive ? <button className="sanborn-button" onClick={() => { entry.controller?.cancel(); patchEntry(entry.id, { progress: { phase: "canceled", bytesUploaded: entry.progress.bytesUploaded, bytesTotal: entry.task.file.size }, error: "Upload canceled." }); releaseSlot(entry.id); pump(); }} type="button">Cancel</button> : null}{entry.progress.phase === "complete" ? <button className="sanborn-button" onClick={() => setEntries((current) => current.filter((candidate) => candidate.id !== entry.id))} type="button">Remove</button> : null}</div></article>; })}<footer><button className="sanborn-button" onClick={() => setExpanded(false)} type="button">Collapse</button><button className="sanborn-button" onClick={() => setEntries((current) => current.filter((entry) => entry.progress.phase !== "complete"))} type="button">Close completed</button></footer></aside>;
});

HistoricalImageUploadQueue.displayName = "HistoricalImageUploadQueue";
