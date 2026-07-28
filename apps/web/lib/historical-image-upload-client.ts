"use client";

import * as tus from "tus-js-client";
import type { HistoricalImageUploadKind } from "./historical-image-upload";

export const clientBirdsEyeMaxBytes = 50 * 1024 * 1024;
export const clientSanbornMaxBytes = 25 * 1024 * 1024;

export type HistoricalUploadPhase = "queued" | "validating" | "preparing" | "uploading" | "paused" | "retrying" | "verifying" | "registering" | "complete" | "failed" | "canceled";
export type HistoricalUploadProgress = { phase: HistoricalUploadPhase; bytesUploaded: number; bytesTotal: number; message?: string };
export type HistoricalUploadPreparation = { projectId: string; endpoint: string; bucket: string; objectPath: string; uploadToken: string; finalizationToken: string; expiresAt: number; assetId: string; kind: HistoricalImageUploadKind; maxBytes: number };

export type HistoricalUploadInput = {
  file: File;
  kind: HistoricalImageUploadKind;
  townPackageId: string;
  atlasId?: string | null;
  sourceRecordId?: string | null;
  sheetNumber?: number | null;
  sourceUrl?: string | null;
  archiveName?: string | null;
  rightsNote?: string | null;
  intakeNotes?: string | null;
  replacementAssetId?: string | null;
  onProgress?: (progress: HistoricalUploadProgress) => void;
  onError?: (error: Error) => void;
};

export type HistoricalUploadController = { promise: Promise<unknown>; pause: () => void; resume: () => void; cancel: () => void; retry: () => void };

function phase(input: HistoricalUploadInput, next: HistoricalUploadProgress) { input.onProgress?.(next); }

export function validateHistoricalImageFileBeforeUpload(file: File, kind: HistoricalImageUploadKind, maxBytes = kind === "birds_eye_reference" ? clientBirdsEyeMaxBytes : clientSanbornMaxBytes): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "This image type is not supported. Use JPEG, PNG, or WebP.";
  if (file.size <= 0) return "The image file is empty.";
  if (file.size > maxBytes) return `File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`;
  return null;
}

export function prepareHistoricalImageUpload(input: HistoricalUploadInput): Promise<HistoricalUploadPreparation> {
  phase(input, { phase: "validating", bytesUploaded: 0, bytesTotal: input.file.size });
  return fetch("/api/community/historical-map-studio/image-uploads/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: input.kind, townPackageId: input.townPackageId, atlasId: input.atlasId ?? null, sourceRecordId: input.sourceRecordId ?? null, sheetNumber: input.sheetNumber ?? null, sourceUrl: input.sourceUrl ?? null, archiveName: input.archiveName ?? null, rightsNote: input.rightsNote ?? null, intakeNotes: input.intakeNotes ?? null, replacementAssetId: input.replacementAssetId ?? null, filename: input.file.name, mimeType: input.file.type, byteSize: input.file.size }) }).then(async (response) => {
    const result = await response.json().catch(() => null) as { ok?: boolean; message?: string; upload?: HistoricalUploadPreparation } | null;
    if (!response.ok || !result?.ok || !result.upload) throw new Error(result?.message ?? "Secure upload preparation failed.");
    return result.upload;
  });
}

export function uploadHistoricalImage(input: HistoricalUploadInput): HistoricalUploadController {
  let activeUpload: tus.Upload | null = null;
  let prepared: HistoricalUploadPreparation | null = null;
  let lastBytesUploaded = 0;
  let finalizeUpload: (() => Promise<void>) | null = null;
  let resolvePromise: (value: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((resolve) => { resolvePromise = resolve; });
  const start = async () => {
    try {
      const immediateError = validateHistoricalImageFileBeforeUpload(input.file, input.kind);
      if (immediateError) throw new Error(immediateError);
      prepared = prepared ?? await prepareHistoricalImageUpload(input);
      phase(input, { phase: "preparing", bytesUploaded: 0, bytesTotal: input.file.size });
      finalizeUpload = async () => {
        if (!prepared) throw new Error("Secure upload preparation failed.");
        phase(input, { phase: "registering", bytesUploaded: input.file.size, bytesTotal: input.file.size });
        const response = await fetch("/api/community/historical-map-studio/image-uploads/finalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ finalizationToken: prepared.finalizationToken }) });
        const result = await response.json().catch(() => null) as { ok?: boolean; message?: string; [key: string]: unknown } | null;
        if (!response.ok || !result?.ok) throw new Error(result?.message ?? "Asset registration failed; retry registration.");
        phase(input, { phase: "complete", bytesUploaded: input.file.size, bytesTotal: input.file.size });
        resolvePromise(result);
      };
      activeUpload = new tus.Upload(input.file, {
        endpoint: prepared.endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        chunkSize: 6 * 1024 * 1024,
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        headers: { "x-signature": prepared.uploadToken, "x-upsert": "false" },
        metadata: { bucketName: prepared.bucket, objectName: prepared.objectPath, contentType: input.file.type, cacheControl: "3600" },
        onError: (error) => { const normalized = error instanceof Error ? error : new Error("The upload connection failed."); phase(input, { phase: "failed", bytesUploaded: lastBytesUploaded, bytesTotal: input.file.size, message: normalized.message || "The upload connection failed." }); input.onError?.(normalized); },
        onProgress: (bytesUploaded, bytesTotal) => { lastBytesUploaded = bytesUploaded; phase(input, { phase: "uploading", bytesUploaded, bytesTotal }); },
        onSuccess: async () => {
          phase(input, { phase: "verifying", bytesUploaded: input.file.size, bytesTotal: input.file.size });
          try {
            await finalizeUpload?.();
          } catch (error) {
            phase(input, { phase: "failed", bytesUploaded: input.file.size, bytesTotal: input.file.size, message: error instanceof Error ? error.message : "Asset registration failed; retry registration." });
            input.onError?.(error instanceof Error ? error : new Error("Asset registration failed; retry registration."));
          }
        },
      });
      const previous = await activeUpload.findPreviousUploads();
      if (previous.length > 0) activeUpload.resumeFromPreviousUpload(previous[0]);
      phase(input, { phase: "uploading", bytesUploaded: 0, bytesTotal: input.file.size });
      activeUpload.start();
    } catch (error) {
      phase(input, { phase: "failed", bytesUploaded: 0, bytesTotal: input.file.size, message: error instanceof Error ? error.message : "Secure upload preparation failed." });
      input.onError?.(error instanceof Error ? error : new Error("Secure upload preparation failed."));
    }
  };
  void start();
  return { promise, pause: () => { activeUpload?.abort(); phase(input, { phase: "paused", bytesUploaded: lastBytesUploaded, bytesTotal: input.file.size }); }, resume: () => { phase(input, { phase: "uploading", bytesUploaded: lastBytesUploaded, bytesTotal: input.file.size }); activeUpload?.start(); }, cancel: () => { activeUpload?.abort(); phase(input, { phase: "canceled", bytesUploaded: lastBytesUploaded, bytesTotal: input.file.size }); }, retry: () => { if (prepared && lastBytesUploaded >= input.file.size && finalizeUpload) { phase(input, { phase: "retrying", bytesUploaded: input.file.size, bytesTotal: input.file.size }); void finalizeUpload().catch((error) => { phase(input, { phase: "failed", bytesUploaded: input.file.size, bytesTotal: input.file.size, message: error instanceof Error ? error.message : "Asset registration failed; retry registration." }); input.onError?.(error instanceof Error ? error : new Error("Asset registration failed; retry registration.")); }); } else if (activeUpload) { phase(input, { phase: "retrying", bytesUploaded: lastBytesUploaded, bytesTotal: input.file.size }); activeUpload.start(); } else void start(); } };
}
