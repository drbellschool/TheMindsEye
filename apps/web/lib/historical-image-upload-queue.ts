import type { HistoricalUploadInput } from "./historical-image-upload-client.ts";

export type HistoricalImageUploadTask = Omit<HistoricalUploadInput, "onProgress" | "onError" | "file"> & { file: File; id?: string };

let uploadTaskSequence = 0;

export function createHistoricalUploadTaskId(task: Pick<HistoricalImageUploadTask, "file" | "id">, existingIds: ReadonlySet<string> = new Set()): string {
  if (task.id && !existingIds.has(task.id)) return task.id;
  const file = task.file;
  const fingerprint = `${file.name}-${file.size}-${file.lastModified}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
  let id = `historical-upload-${fingerprint}-${++uploadTaskSequence}`;
  while (existingIds.has(id)) id = `historical-upload-${fingerprint}-${++uploadTaskSequence}`;
  return id;
}

export function normalizeHistoricalImageUploadTasks(tasks: readonly HistoricalImageUploadTask[], existingIds: ReadonlySet<string> = new Set()): HistoricalImageUploadTask[] {
  const ids = new Set(existingIds);
  return tasks.map((task) => {
    const id = createHistoricalUploadTaskId(task, ids);
    ids.add(id);
    return { ...task, id };
  });
}

export function historicalUploadEntryIdMatchesTask(entryId: string, task: Pick<HistoricalImageUploadTask, "id">): boolean {
  return Boolean(task.id) && entryId === task.id;
}
