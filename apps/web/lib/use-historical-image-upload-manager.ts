"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { uploadHistoricalImage, type HistoricalUploadController, type HistoricalUploadInput, type HistoricalUploadPhase, type HistoricalUploadProgress } from "./historical-image-upload-client.ts";
import { normalizeHistoricalImageUploadTasks, type HistoricalImageUploadTask } from "./historical-image-upload-queue.ts";

export type HistoricalImageUploadManagerEntry = {
  id: string;
  task: HistoricalImageUploadTask;
  progress: HistoricalUploadProgress;
  controller?: HistoricalUploadController;
  error?: string;
  result?: unknown;
  registrationRetry?: boolean;
};

export type HistoricalImageUploadManagerAggregate = {
  totalBytes: number;
  uploadedBytes: number;
  percent: number;
  completed: number;
  active: number;
};

export type HistoricalImageUploadManager = {
  entries: HistoricalImageUploadManagerEntry[];
  expanded: boolean;
  aggregate: HistoricalImageUploadManagerAggregate;
  activeBirdsEyeUpload: { filename: string; progress: HistoricalUploadProgress } | null;
  enqueue: (tasks: HistoricalImageUploadTask[]) => boolean;
  pause: (id: string) => void;
  resume: (id: string) => void;
  retry: (id: string) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
  collapse: () => void;
  expand: () => void;
};

type ManagerOptions = { onCompleted?: (task: HistoricalImageUploadTask, result: unknown) => void };

function isActivePhase(phase: HistoricalUploadPhase): boolean {
  return !["complete", "canceled"].includes(phase);
}

export function useHistoricalImageUploadManager(options: ManagerOptions = {}): HistoricalImageUploadManager {
  const [entries, setEntries] = useState<HistoricalImageUploadManagerEntry[]>([]);
  const [expanded, setExpanded] = useState(true);
  const entriesRef = useRef<HistoricalImageUploadManagerEntry[]>([]);
  const pendingRef = useRef<HistoricalImageUploadTask[]>([]);
  const activeIdsRef = useRef(new Set<string>());
  const controllersRef = useRef(new Map<string, HistoricalUploadController>());
  const completionIdsRef = useRef(new Set<string>());
  const onCompletedRef = useRef(options.onCompleted);
  onCompletedRef.current = options.onCompleted;

  const updateEntries = useCallback((updater: (current: HistoricalImageUploadManagerEntry[]) => HistoricalImageUploadManagerEntry[]) => {
    setEntries((current) => {
      const next = updater(current);
      entriesRef.current = next;
      return next;
    });
  }, []);

  const patch = useCallback((id: string, changes: Partial<HistoricalImageUploadManagerEntry>) => {
    updateEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...changes, progress: changes.progress ?? entry.progress } : entry));
  }, [updateEntries]);

  const releaseSlot = useCallback((id: string) => {
    pendingRef.current = pendingRef.current.filter((task) => task.id !== id);
    if (!activeIdsRef.current.delete(id)) return false;
    controllersRef.current.delete(id);
    return true;
  }, []);

  const pumpRef = useRef<() => void>(() => undefined);

  const startTask = useCallback((task: HistoricalImageUploadTask) => {
    const id = task.id!;
    if (activeIdsRef.current.has(id)) return;
    activeIdsRef.current.add(id);
    const controller = uploadHistoricalImage({
      ...task,
      onProgress: (progress) => patch(id, { progress }),
      onError: (error) => {
        const previous = entriesRef.current.find((entry) => entry.id === id);
        const registrationRetry = task.file.size === (previous?.progress.bytesUploaded ?? 0);
        patch(id, { error: error.message, registrationRetry, progress: { phase: "failed", bytesUploaded: registrationRetry ? task.file.size : 0, bytesTotal: task.file.size, message: error.message } });
        releaseSlot(id);
        pumpRef.current();
      },
    });
    controllersRef.current.set(id, controller);
    patch(id, { controller, error: undefined, registrationRetry: false, progress: { phase: "preparing", bytesUploaded: 0, bytesTotal: task.file.size } });
    void controller.promise.then((result) => {
      if (completionIdsRef.current.has(id)) return;
      completionIdsRef.current.add(id);
      patch(id, { result, error: undefined, registrationRetry: false, progress: { phase: "complete", bytesUploaded: task.file.size, bytesTotal: task.file.size } });
      onCompletedRef.current?.(task, result);
      releaseSlot(id);
      pumpRef.current();
    });
  }, [patch, releaseSlot]);

  const pump = useCallback(() => {
    while (activeIdsRef.current.size < 2 && pendingRef.current.length > 0) startTask(pendingRef.current.shift()!);
  }, [startTask]);
  pumpRef.current = pump;

  const enqueue = useCallback((tasks: HistoricalImageUploadTask[]) => {
    const normalized = normalizeHistoricalImageUploadTasks(tasks, new Set(entriesRef.current.map((entry) => entry.id)));
    if (normalized.length === 0) return false;
    updateEntries((current) => [...current, ...normalized.map((task) => ({ id: task.id!, task, progress: { phase: "queued" as const, bytesUploaded: 0, bytesTotal: task.file.size } }))]);
    setExpanded(true);
    pendingRef.current.push(...normalized);
    pump();
    return true;
  }, [pump, updateEntries]);

  const pause = useCallback((id: string) => { entriesRef.current.find((entry) => entry.id === id)?.controller?.pause(); }, []);
  const resume = useCallback((id: string) => { entriesRef.current.find((entry) => entry.id === id)?.controller?.resume(); }, []);

  const retry = useCallback((id: string) => {
    const entry = entriesRef.current.find((candidate) => candidate.id === id);
    if (!entry || entry.progress.phase !== "failed") return;
    patch(id, { error: undefined, progress: { phase: "retrying", bytesUploaded: entry.progress.bytesUploaded, bytesTotal: entry.task.file.size } });
    if (entry.registrationRetry && entry.controller && activeIdsRef.current.size < 2) {
      activeIdsRef.current.add(id);
      entry.controller.retry();
      return;
    }
    pendingRef.current.push(entry.task);
    pump();
  }, [patch, pump]);

  const cancel = useCallback((id: string) => {
    const entry = entriesRef.current.find((candidate) => candidate.id === id);
    if (!entry || !isActivePhase(entry.progress.phase)) return;
    entry.controller?.cancel();
    patch(id, { error: "Upload canceled.", progress: { phase: "canceled", bytesUploaded: entry.progress.bytesUploaded, bytesTotal: entry.task.file.size } });
    releaseSlot(id);
    pump();
  }, [patch, pump, releaseSlot]);

  const remove = useCallback((id: string) => updateEntries((current) => current.filter((entry) => entry.id !== id)), [updateEntries]);
  const clearCompleted = useCallback(() => updateEntries((current) => current.filter((entry) => entry.progress.phase !== "complete")), [updateEntries]);
  const collapse = useCallback(() => setExpanded(false), []);
  const expand = useCallback(() => setExpanded(true), []);

  const aggregate = useMemo<HistoricalImageUploadManagerAggregate>(() => {
    const totalBytes = entries.reduce((sum, entry) => sum + entry.task.file.size, 0);
    const uploadedBytes = entries.reduce((sum, entry) => sum + Math.min(entry.progress.bytesUploaded, entry.task.file.size), 0);
    return { totalBytes, uploadedBytes, percent: totalBytes ? Math.round(uploadedBytes / totalBytes * 100) : 0, completed: entries.filter((entry) => entry.progress.phase === "complete").length, active: entries.filter((entry) => isActivePhase(entry.progress.phase)).length };
  }, [entries]);

  const activeBirdsEyeUpload = useMemo(() => {
    const entry = entries.find((candidate) => candidate.task.kind === "birds_eye_reference" && isActivePhase(candidate.progress.phase));
    return entry ? { filename: entry.task.file.name, progress: entry.progress } : null;
  }, [entries]);

  return { entries, expanded, aggregate, activeBirdsEyeUpload, enqueue, pause, resume, retry, cancel, remove, clearCompleted, collapse, expand };
}
