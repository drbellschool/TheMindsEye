import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { historicalUploadEntryIdMatchesTask, normalizeHistoricalImageUploadTasks } from "./historical-image-upload-queue.ts";

function file(name: string, lastModified = 1): File { return new File([new Uint8Array([1])], name, { type: "image/jpeg", lastModified }); }

test("normalizes one stable ID for visible entries and pending tasks", () => {
  const [task] = normalizeHistoricalImageUploadTasks([{ file: file("map.jpg"), kind: "birds_eye_reference", townPackageId: "town" }]);
  assert.ok(task.id);
  assert.equal(historicalUploadEntryIdMatchesTask(task.id!, task), true);
});

test("reselecting the same file receives a deliberate distinct queue ID", () => {
  const first = normalizeHistoricalImageUploadTasks([{ file: file("map.jpg"), kind: "birds_eye_reference", townPackageId: "town" }]);
  const second = normalizeHistoricalImageUploadTasks([{ file: file("map.jpg"), kind: "birds_eye_reference", townPackageId: "town" }], new Set([first[0].id!]));
  assert.notEqual(first[0].id, second[0].id);
});

test("Historical Map Studio owns the manager and the dock is presentational", () => {
  const studio = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const queue = readFileSync("components/HistoricalImageUploadQueue.tsx", "utf8");
  assert.match(studio, /useHistoricalImageUploadManager/);
  assert.match(studio, /historicalUploads\.enqueue/);
  assert.doesNotMatch(studio, /historicalUploadQueueRef|HistoricalImageUploadQueueHandle|enqueueHistoricalImageUploads/);
  assert.doesNotMatch(queue, /forwardRef|useImperativeHandle/);
});
