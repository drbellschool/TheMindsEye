"use client";

import { useEffect, useRef, useState } from "react";

import { Panel } from "@/components/Panel";
import {
  findDuplicateChecksums,
  findDuplicateSheetNumbers,
  findMissingSheetNumbers,
  formatBytes,
  hasExistingChecksum,
  normalizeSanbornSheetNumber,
  sanbornAllowedExtensions,
  sanbornAllowedMimeTypes,
  sanbornDefaultEvidenceClassification,
  sanbornDefaultReviewStatus,
  validateSanbornFileInput,
  type SanbornIntakeState,
  type SanbornSourceOption,
} from "@/lib/sanborn-intake";

type LocalStatus = "ready" | "uploading" | "saved" | "failed" | "unsupported";

type LocalSanbornSheet = {
  localId: string;
  file: File;
  status: LocalStatus;
  previewUrl: string;
  originalFilename: string;
  byteSize: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  checksum: string | null;
  sheetNumber: string;
  sourceRecordId: string;
  sourceUrl: string;
  archiveName: string;
  rightsNote: string;
  intakeNotes: string;
  validationError?: string;
  serverMessage?: string;
};

type UploadResponse =
  | { ok: true; asset: { checksum: string; width: number; height: number; uploadedAt: string } }
  | { ok: false; message: string };

function getStatusState(status: LocalStatus): "ready" | "reviewing" | "blocked" | "guarded" {
  if (status === "saved") return "ready";
  if (status === "uploading") return "reviewing";
  if (status === "failed" || status === "unsupported") return "blocked";
  return "guarded";
}

function getNextSheetNumber(intake: SanbornIntakeState, localItems: LocalSanbornSheet[]): string {
  const used = new Set(
    [...intake.existingAssets.map((asset) => asset.sheetNumber), ...localItems.map((item) => normalizeSanbornSheetNumber(item.sheetNumber))]
      .filter((sheetNumber): sheetNumber is number => sheetNumber !== null),
  );
  const expected = Math.max(intake.expectedSheetCount, used.size + 1, 1);
  for (let sheetNumber = 1; sheetNumber <= expected; sheetNumber += 1) {
    if (!used.has(sheetNumber)) return String(sheetNumber);
  }
  return String(expected + 1);
}

async function calculateFileChecksum(file: File): Promise<string | null> {
  if (!window.crypto?.subtle) return null;
  const digest = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readBrowserImageDimensions(previewUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = previewUrl;
  });
}

function getSourceOption(sourceOptions: SanbornSourceOption[], sourceRecordId: string): SanbornSourceOption | null {
  return sourceOptions.find((sourceOption) => sourceOption.sourceRecordId === sourceRecordId) ?? null;
}

function renderSheetRange(sheetNumbers: number[]): string {
  return sheetNumbers.length > 0 ? sheetNumbers.join(", ") : "None";
}

export function SanbornSheetIntake({ intake }: { intake: SanbornIntakeState }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const [localItems, setLocalItems] = useState<LocalSanbornSheet[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
  }, []);

  const acceptedDescription = sanbornAllowedExtensions.map((extension) => extension.replace(".", "").toUpperCase()).join(", ");
  const acceptList = [...sanbornAllowedMimeTypes, ...sanbornAllowedExtensions].join(",");
  const existingSheetNumbers = intake.existingAssets.map((asset) => asset.sheetNumber);
  const localSheetNumbers = localItems.map((item) => item.sheetNumber);
  const duplicateSheetNumbers = findDuplicateSheetNumbers([...existingSheetNumbers, ...localSheetNumbers]);
  const missingSheetNumbers = findMissingSheetNumbers([...existingSheetNumbers, ...localSheetNumbers], intake.expectedSheetCount);
  const duplicateChecksums = findDuplicateChecksums([...intake.existingAssets.map((asset) => asset.checksum), ...localItems.map((item) => item.checksum)]);
  const savedItems = localItems.filter((item) => item.status === "saved");
  const failedItems = localItems.filter((item) => item.status === "failed" || item.status === "unsupported");

  async function addFiles(files: FileList | File[]) {
    const preparedItems: LocalSanbornSheet[] = [];
    for (const file of Array.from(files)) {
      const previewUrl = URL.createObjectURL(file);
      const validation = validateSanbornFileInput({ filename: file.name, mimeType: file.type, byteSize: file.size, maxBytes: intake.maxUploadBytes });
      const dimensions = validation.ok ? await readBrowserImageDimensions(previewUrl) : null;
      const checksum = validation.ok ? await calculateFileChecksum(file) : null;
      const randomId = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      preparedItems.push({
        localId: `${file.name}-${file.lastModified}-${randomId}`,
        file,
        status: validation.ok ? "ready" : "unsupported",
        previewUrl,
        originalFilename: file.name,
        byteSize: file.size,
        mimeType: file.type || "unknown",
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        checksum,
        sheetNumber: validation.ok ? getNextSheetNumber(intake, [...localItems, ...preparedItems]) : "",
        sourceRecordId: "",
        sourceUrl: "",
        archiveName: "",
        rightsNote: "",
        intakeNotes: "",
        validationError: validation.ok ? undefined : validation.reason,
      });
      previewUrlsRef.current.push(previewUrl);
    }
    setLocalItems((currentItems) => [...currentItems, ...preparedItems]);
  }

  function updateItem(localId: string, patch: Partial<LocalSanbornSheet>) {
    setLocalItems((currentItems) => currentItems.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }

  function handleSourceChange(localId: string, sourceRecordId: string) {
    const sourceOption = getSourceOption(intake.sourceOptions, sourceRecordId);
    updateItem(localId, {
      sourceRecordId,
      sourceUrl: sourceOption?.sourceUrl ?? "",
      archiveName: sourceOption?.archiveName ?? "",
      rightsNote: sourceOption?.rightsNote ?? "",
    });
  }

  function getItemWarnings(item: LocalSanbornSheet): string[] {
    const warnings: string[] = [];
    const normalizedSheetNumber = normalizeSanbornSheetNumber(item.sheetNumber);
    if (item.validationError) warnings.push(item.validationError);
    if (!normalizedSheetNumber && item.status !== "unsupported") warnings.push("Assign a positive sheet number before saving.");
    if (normalizedSheetNumber && duplicateSheetNumbers.includes(normalizedSheetNumber)) warnings.push(`Duplicate sheet number ${normalizedSheetNumber}.`);
    if (item.checksum && (hasExistingChecksum(intake.existingAssets, item.checksum) || duplicateChecksums.includes(item.checksum))) {
      warnings.push("Probable duplicate image checksum.");
    }
    return warnings;
  }

  function canUpload(item: LocalSanbornSheet): boolean {
    return intake.mode === "write_enabled" && item.status !== "uploading" && item.status !== "saved" && getItemWarnings(item).length === 0;
  }

  async function uploadItem(localId: string) {
    const item = localItems.find((candidate) => candidate.localId === localId);
    if (!item || !canUpload(item)) return;

    updateItem(localId, { status: "uploading", serverMessage: undefined });
    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("sheetNumber", item.sheetNumber);
    formData.append("sourceRecordId", item.sourceRecordId);
    formData.append("sourceUrl", item.sourceUrl);
    formData.append("archiveName", item.archiveName);
    formData.append("rightsNote", item.rightsNote);
    formData.append("intakeNotes", item.intakeNotes);

    try {
      const response = await fetch("/api/community/sanborn-sheets", { method: "POST", body: formData });
      const payload = (await response.json()) as UploadResponse;
      if (!response.ok || !payload.ok) {
        updateItem(localId, { status: "failed", serverMessage: payload.ok ? "Sanborn upload failed." : payload.message });
        return;
      }
      updateItem(localId, {
        status: "saved",
        checksum: payload.asset.checksum,
        width: payload.asset.width,
        height: payload.asset.height,
        serverMessage: `Stored at ${new Date(payload.asset.uploadedAt).toLocaleString()}.`,
      });
    } catch {
      updateItem(localId, { status: "failed", serverMessage: "Sanborn upload failed before the server returned a response." });
    }
  }

  async function uploadReadyItems() {
    for (const item of localItems) if (canUpload(item)) await uploadItem(item.localId);
  }

  return (
    <Panel
      eyebrow="Sanborn Sheet Intake"
      title="Upload and organize original Sanborn sheets"
      subtitle="Select files, confirm sheet numbers, and save them directly to Supabase Storage."
      tone="blueprint"
      className="sanborn-intake"
      action={<span className={`tag state-${intake.mode === "write_enabled" ? "ready" : "guarded"}`}>{intake.mode === "write_enabled" ? "Storage writes enabled" : "Demo/read-only mode"}</span>}
    >
      <div className="sanborn-intake__summary">
        <div className="sanborn-intake__stat"><span>Town package</span><strong>{intake.townPackage.packageId}</strong><small>{intake.townPackage.name} | {intake.townPackage.region}</small></div>
        <div className="sanborn-intake__stat"><span>Active map year</span><strong>{intake.activeMapYear ?? "unknown"}</strong><small>Year remains town-package metadata.</small></div>
        <div className="sanborn-intake__stat"><span>Uploaded sheets</span><strong>{intake.uploadedSheetCount} / {intake.expectedSheetCount}</strong><small>Bucket: {intake.bucketName}</small></div>
        <div className="sanborn-intake__stat"><span>Missing sheet warning</span><strong>{renderSheetRange(missingSheetNumbers)}</strong><small>Expected numbering is derived from map layers.</small></div>
      </div>

      {intake.warningMessage ? <p className="sanborn-intake__warning">{intake.warningMessage}</p> : null}
      {duplicateSheetNumbers.length > 0 ? <p className="sanborn-intake__warning">Duplicate sheet numbers: {renderSheetRange(duplicateSheetNumbers)}.</p> : null}

      <div
        className={`sanborn-dropzone${isDragging ? " is-dragging" : ""}${intake.mode === "read_only" ? " is-disabled" : ""}`}
        onDragOver={(event) => { event.preventDefault(); if (intake.mode === "write_enabled") setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => { event.preventDefault(); setIsDragging(false); if (intake.mode === "write_enabled") void addFiles(event.dataTransfer.files); }}
      >
        <input
          accept={acceptList}
          disabled={intake.mode === "read_only"}
          hidden
          multiple
          onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.currentTarget.value = ""; }}
          ref={inputRef}
          type="file"
        />
        <p className="panel__eyebrow">Drag and drop sheets here</p>
        <strong>{acceptedDescription} files up to {formatBytes(intake.maxUploadBytes)}</strong>
        <p className="small-muted">{intake.mode === "read_only" ? "Uploads are disabled until the live Supabase configuration is available." : "Choose one or many original Sanborn sheets. No token entry is required."}</p>
        <button className="sanborn-button" disabled={intake.mode === "read_only"} onClick={() => inputRef.current?.click()} type="button">Select Sanborn images</button>
      </div>

      {intake.mode === "write_enabled" && localItems.length > 0 ? (
        <div className="sanborn-token-row">
          <p className="small-muted">Uploads use the secure server configuration already stored in Vercel.</p>
          <button className="sanborn-button sanborn-button--primary" disabled={!localItems.some((item) => canUpload(item))} onClick={() => void uploadReadyItems()} type="button">Save all ready sheets</button>
        </div>
      ) : null}

      {localItems.length === 0 ? (
        <div className="sanborn-empty-state"><strong>No Sanborn sheet images selected yet.</strong><p className="small-muted">Select files above to begin.</p></div>
      ) : (
        <div className="sanborn-file-list" aria-label="Selected Sanborn sheets">
          {localItems.map((item) => {
            const warnings = getItemWarnings(item);
            return (
              <article className="sanborn-file-card" key={item.localId}>
                <div className="sanborn-file-card__preview"><img alt={`Preview of ${item.originalFilename}`} src={item.previewUrl} /></div>
                <div className="sanborn-file-card__body">
                  <div className="record-list__header">
                    <div><p className="record-list__eyebrow">Original filename</p><strong className="record-list__title">{item.originalFilename}</strong><p className="small-muted">{formatBytes(item.byteSize)} | {item.mimeType} | {item.width && item.height ? `${item.width} x ${item.height}` : "dimensions unavailable"}</p></div>
                    <span className={`tag state-${getStatusState(item.status)}`}>{item.status}</span>
                  </div>

                  <div className="sanborn-file-card__metadata">
                    <label>Sheet number<input inputMode="numeric" onChange={(event) => updateItem(item.localId, { sheetNumber: event.target.value })} value={item.sheetNumber} /></label>
                    <label>Source record association<select onChange={(event) => handleSourceChange(item.localId, event.target.value)} value={item.sourceRecordId}><option value="">Source unavailable / no linked source</option>{intake.sourceOptions.map((sourceOption) => <option key={sourceOption.sourceRecordId} value={sourceOption.sourceRecordId}>{sourceOption.sourceId} - {sourceOption.title}</option>)}</select></label>
                    <label>Source URL<input onChange={(event) => updateItem(item.localId, { sourceUrl: event.target.value })} placeholder="Unknown or unavailable" value={item.sourceUrl} /></label>
                    <label>Archive name<input onChange={(event) => updateItem(item.localId, { archiveName: event.target.value })} placeholder="Unknown or unavailable" value={item.archiveName} /></label>
                    <label>Rights note<input onChange={(event) => updateItem(item.localId, { rightsNote: event.target.value })} placeholder="Unknown or unavailable" value={item.rightsNote} /></label>
                    <label>Evidence classification<select disabled value={sanbornDefaultEvidenceClassification}><option value={sanbornDefaultEvidenceClassification}>{sanbornDefaultEvidenceClassification}</option></select></label>
                    <label>Review status<select disabled value={sanbornDefaultReviewStatus}><option value={sanbornDefaultReviewStatus}>{sanbornDefaultReviewStatus}</option></select></label>
                    <label className="sanborn-file-card__wide">Intake notes<textarea onChange={(event) => updateItem(item.localId, { intakeNotes: event.target.value })} placeholder="Describe scan quality, source context, or sheet-number uncertainty." value={item.intakeNotes} /></label>
                  </div>

                  <div className="sanborn-checksum"><span>SHA-256 checksum</span><code>{item.checksum ?? "Unavailable until server save."}</code></div>
                  {warnings.length > 0 ? <div className="sanborn-warning-list">{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
                  {item.serverMessage ? <p className={item.status === "failed" ? "sanborn-intake__warning" : "small-muted"}>{item.serverMessage}</p> : null}
                  <button className="sanborn-button sanborn-button--primary" disabled={!canUpload(item)} onClick={() => void uploadItem(item.localId)} type="button">{item.status === "uploading" ? "Saving..." : item.status === "saved" ? "Saved" : "Save original sheet"}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="sanborn-result-grid">
        <div className="small-card"><p className="muted">Successful uploads this session</p><strong>{savedItems.length}</strong><p className="small-muted">{savedItems.length > 0 ? savedItems.map((item) => item.originalFilename).join(", ") : "No successful uploads yet."}</p></div>
        <div className="small-card"><p className="muted">Failed or rejected uploads</p><strong>{failedItems.length}</strong><p className="small-muted">{failedItems.length > 0 ? failedItems.map((item) => item.originalFilename).join(", ") : "No failed uploads yet."}</p></div>
      </div>

      <div className="sanborn-existing-list">
        <h3>Stored intake records</h3>
        {intake.existingAssets.length === 0 ? <p className="small-muted">No Sanborn sheet assets are stored yet.</p> : intake.existingAssets.map((asset) => (
          <div className="small-card" key={asset.assetId}><p className="muted">Sheet {asset.sheetNumber ?? "unknown"}</p><strong>{asset.originalFilename}</strong><p className="small-muted">{formatBytes(asset.byteSize)} | {asset.width && asset.height ? `${asset.width} x ${asset.height}` : "dimensions unavailable"} | {asset.reviewStatus}</p><p className="small-muted">Source: {asset.sourceId ?? "Source unavailable"}</p><p className="small-muted">Checksum: {asset.checksum ?? "unavailable"}</p></div>
        ))}
      </div>
    </Panel>
  );
}
