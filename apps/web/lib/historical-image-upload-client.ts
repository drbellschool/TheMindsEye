"use client";

import * as tus from "tus-js-client";
import type { HistoricalImageUploadKind } from "./historical-image-upload";
import { buildSupabaseResumableUploadEndpoint, type HistoricalUploadAuthenticationMode } from "./historical-image-upload-endpoint.ts";

export const clientBirdsEyeMaxBytes = 50 * 1024 * 1024;
export const clientSanbornMaxBytes = 25 * 1024 * 1024;

export type HistoricalUploadPhase = "queued" | "validating" | "preparing" | "uploading" | "paused" | "retrying" | "verifying" | "registering" | "complete" | "failed" | "canceled";
export type HistoricalUploadProgress = { phase: HistoricalUploadPhase; bytesUploaded: number; bytesTotal: number; message?: string };
export type HistoricalUploadPreparation = { projectId: string; endpoint: string; authenticationMode: HistoricalUploadAuthenticationMode; bucket: string; objectPath: string; uploadToken: string; finalizationToken: string; expiresAt: number; assetId: string; kind: HistoricalImageUploadKind; maxBytes: number };

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

function safeStorageDetail(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const detail = value.replace(/x-signature|authorization|service[- ]?role|bearer\s+[^\s]+/gi, "credential").trim();
  return detail && detail.length <= 240 ? detail : detail.slice(0, 240);
}

export function normalizeHistoricalTusError(error: unknown, input: { bytesUploaded: number; phase: "starting" | "uploading" }): Error {
  const candidate = error as { message?: unknown; originalResponse?: { getStatus?: () => number; getBody?: () => string } } | null;
  const response = candidate?.originalResponse;
  const status = response?.getStatus?.();
  let body: Record<string, unknown> | null = null;
  const rawBody = response?.getBody?.();
  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch { /* TUS may return a plain-text body. */ }
  }
  const detail = safeStorageDetail(body?.message) ?? safeStorageDetail(body?.error_description) ?? safeStorageDetail(body?.error) ?? safeStorageDetail(candidate?.message) ?? "The upload connection failed.";
  const prefix = input.phase === "starting" ? "Starting signed resumable upload failed" : "Uploading to storage failed";
  const statusText = typeof status === "number" ? `Supabase Storage returned ${status}: ` : "";
  const normalized = new Error(`${prefix}. ${statusText}${detail}`);
  Object.assign(normalized, { status, bytesUploaded: input.bytesUploaded, storageCode: typeof body?.code === "string" ? body.code : undefined });
  return normalized;
}

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
  let hasReportedUploadProgress = false;
  let finalizeUpload: (() => Promise<void>) | null = null;
  let resolvePromise: (value: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((resolve) => { resolvePromise = resolve; });
  const start = async () => {
    try {
      const immediateError = validateHistoricalImageFileBeforeUpload(input.file, input.kind);
      if (immediateError) throw new Error(immediateError);
      prepared = prepared ?? await prepareHistoricalImageUpload(input);
      const expectedEndpoint = buildSupabaseResumableUploadEndpoint({ projectId: prepared.projectId, authenticationMode: prepared.authenticationMode });
      if (prepared.authenticationMode !== "signed_tus" || prepared.endpoint !== expectedEndpoint) throw new Error("Secure upload preparation returned an unsupported resumable upload endpoint.");
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
        onError: (error) => { const normalized = normalizeHistoricalTusError(error, { bytesUploaded: lastBytesUploaded, phase: hasReportedUploadProgress ? "uploading" : "starting" }); phase(input, { phase: "failed", bytesUploaded: lastBytesUploaded, bytesTotal: input.file.size, message: normalized.message }); input.onError?.(normalized); },
        onProgress: (bytesUploaded, bytesTotal) => { hasReportedUploadProgress = true; lastBytesUploaded = bytesUploaded; phase(input, { phase: "uploading", bytesUploaded, bytesTotal }); },
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
      const compatiblePrevious = previous.find((candidate) => candidate.uploadUrl?.startsWith(prepared?.endpoint ?? ""));
      for (const stale of previous.filter((candidate) => candidate !== compatiblePrevious)) {
        await tus.defaultOptions.urlStorage?.removeUpload(stale.urlStorageKey);
      }
      if (compatiblePrevious) activeUpload.resumeFromPreviousUpload(compatiblePrevious);
      phase(input, { phase: "uploading", bytesUploaded: 0, bytesTotal: input.file.size });
      activeUpload.start();
    } catch (error) {
      phase(input, { phase: "failed", bytesUploaded: 0, bytesTotal: input.file.size, message: error instanceof Error ? error.message : "Secure upload preparation failed." });
      input.onError?.(error instanceof Error ? error : new Error("Secure upload preparation failed."));
    }
  };
  void start();
  return { promise, pause: () => { void activeUpload?.abort(); phase(input, { phase: "paused", bytesUploaded: lastBytesUploaded, bytesTotal: input.file.size }); }, resume: () => { phase(input, { phase: "uploading", bytesUploaded: lastBytesUploaded, bytesTotal: input.file.size }); activeUpload?.start(); }, cancel: () => { void activeUpload?.abort(); phase(input, { phase: "canceled", bytesUploaded: lastBytesUploaded, bytesTotal: input.file.size }); }, retry: () => { if (prepared && lastBytesUploaded >= input.file.size && finalizeUpload) { phase(input, { phase: "retrying", bytesUploaded: input.file.size, bytesTotal: input.file.size }); void finalizeUpload().catch((error) => { phase(input, { phase: "failed", bytesUploaded: input.file.size, bytesTotal: input.file.size, message: error instanceof Error ? error.message : "Asset registration failed; retry registration." }); input.onError?.(error instanceof Error ? error : new Error("Asset registration failed; retry registration.")); }); } else { prepared = null; activeUpload = null; lastBytesUploaded = 0; hasReportedUploadProgress = false; phase(input, { phase: "retrying", bytesUploaded: 0, bytesTotal: input.file.size }); void start(); } } };
}
