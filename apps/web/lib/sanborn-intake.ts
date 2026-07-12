import { normalizeReviewStatus, type ReviewStatus } from "./community-status.ts";

export const sanbornSheetBucket = "sanborn-sheets";
export const sanbornDefaultEvidenceClassification: ReviewStatus = "unknown";
export const sanbornDefaultReviewStatus: ReviewStatus = "unknown";
export const sanbornDefaultMaxUploadBytes = 25 * 1024 * 1024;

export const sanbornAllowedMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export const sanbornAllowedExtensions = [".png", ".jpg", ".jpeg", ".webp"] as const;

export type SanbornMimeType = (typeof sanbornAllowedMimeTypes)[number];
export type SanbornIntakeMode = "write_enabled" | "read_only";

export type SanbornDimension = {
  width: number;
  height: number;
};

export type SanbornFileValidationInput = {
  filename: string;
  mimeType: string | null | undefined;
  byteSize: number;
  maxBytes?: number;
};

export type SanbornFileValidationResult =
  | {
      ok: true;
      mimeType: SanbornMimeType;
      extension: string;
    }
  | {
      ok: false;
      reason: string;
    };

export type SanbornStoragePathInput = {
  townPackageId: string;
  assetId: string;
  originalFilename: string;
};

export type SanbornSheetAssetSummary = {
  assetId: string;
  sheetNumber: number | null;
  originalFilename: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  checksum: string | null;
  sourceRecordId: string | null;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  archiveName: string | null;
  rightsNote: string | null;
  evidenceClassification: ReviewStatus;
  reviewStatus: ReviewStatus;
  intakeNotes: string | null;
  uploadedAt: string | null;
};

export type SanbornSourceOption = {
  sourceRecordId: string;
  sourceId: string;
  title: string;
  sourceUrl: string | null;
  archiveName: string | null;
  rightsNote: string | null;
};

export type SanbornIntakeState = {
  mode: SanbornIntakeMode;
  warningMessage?: string;
  bucketName: string;
  maxUploadBytes: number;
  townPackage: {
    id: string | null;
    packageId: string;
    name: string;
    region: string;
    year: number | null;
  };
  activeMapYear: number | null;
  expectedSheetCount: number;
  uploadedSheetCount: number;
  existingAssets: SanbornSheetAssetSummary[];
  sourceOptions: SanbornSourceOption[];
  duplicateSheetNumbers: number[];
  missingSheetNumbers: number[];
};

export function isAllowedSanbornMimeType(value: string | null | undefined): value is SanbornMimeType {
  return sanbornAllowedMimeTypes.includes(value as SanbornMimeType);
}

export function getSanbornFileExtension(filename: string): string {
  const safeFilename = filename.trim().toLowerCase();
  const dotIndex = safeFilename.lastIndexOf(".");

  return dotIndex >= 0 ? safeFilename.slice(dotIndex) : "";
}

export function sanitizeSanbornFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).pop() ?? "";
  const normalized = basename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "-")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120);

  return normalized.length > 0 ? normalized : "sanborn-sheet";
}

export function sanitizeStoragePathSegment(value: string, fallback: string): string {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return sanitized.length > 0 ? sanitized : fallback;
}

export function buildSanbornStoragePath(input: SanbornStoragePathInput): string {
  const townSegment = sanitizeStoragePathSegment(input.townPackageId, "unknown-town");
  const assetSegment = sanitizeStoragePathSegment(input.assetId, "unknown-asset");
  const filename = sanitizeSanbornFilename(input.originalFilename);

  return `${townSegment}/sanborn-sheets/${assetSegment}/${filename}`;
}

export function buildSanbornReplacementStoragePath(input: SanbornStoragePathInput & { replacementId: string }): string {
  const townSegment = sanitizeStoragePathSegment(input.townPackageId, "unknown-town");
  const assetSegment = sanitizeStoragePathSegment(input.assetId, "unknown-asset");
  const replacementSegment = sanitizeStoragePathSegment(input.replacementId, "replacement");
  const filename = sanitizeSanbornFilename(input.originalFilename);

  return `${townSegment}/sanborn-sheets/${assetSegment}/replacements/${replacementSegment}-${filename}`;
}

export function validateSanbornFileInput(input: SanbornFileValidationInput): SanbornFileValidationResult {
  const maxBytes = input.maxBytes ?? sanbornDefaultMaxUploadBytes;
  const extension = getSanbornFileExtension(input.filename);

  if (!sanbornAllowedExtensions.includes(extension as (typeof sanbornAllowedExtensions)[number])) {
    return {
      ok: false,
      reason: "Unsupported file extension. Use PNG, JPEG, or WebP.",
    };
  }

  if (!isAllowedSanbornMimeType(input.mimeType)) {
    return {
      ok: false,
      reason: "Unsupported file type. Use PNG, JPEG, or WebP.",
    };
  }

  if (input.mimeType === "image/png" && extension !== ".png") {
    return { ok: false, reason: "The file extension does not match the detected PNG type." };
  }

  if (input.mimeType === "image/jpeg" && extension !== ".jpg" && extension !== ".jpeg") {
    return { ok: false, reason: "The file extension does not match the detected JPEG type." };
  }

  if (input.mimeType === "image/webp" && extension !== ".webp") {
    return { ok: false, reason: "The file extension does not match the detected WebP type." };
  }

  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return {
      ok: false,
      reason: "The selected file is empty.",
    };
  }

  if (input.byteSize > maxBytes) {
    return {
      ok: false,
      reason: `The selected file is larger than the ${formatBytes(maxBytes)} limit.`,
    };
  }

  return {
    ok: true,
    mimeType: input.mimeType,
    extension,
  };
}

export function detectSanbornMimeType(bytes: Uint8Array): SanbornMimeType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) + bytes[offset + 1];
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
}

function readPngDimensions(bytes: Uint8Array): SanbornDimension | null {
  if (bytes.length < 24) {
    return null;
  }

  return {
    width: ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0,
    height: ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0,
  };
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    marker === 0xc0 ||
    marker === 0xc1 ||
    marker === 0xc2 ||
    marker === 0xc3 ||
    marker === 0xc5 ||
    marker === 0xc6 ||
    marker === 0xc7 ||
    marker === 0xc9 ||
    marker === 0xca ||
    marker === 0xcb ||
    marker === 0xcd ||
    marker === 0xce ||
    marker === 0xcf
  );
}

function readJpegDimensions(bytes: Uint8Array): SanbornDimension | null {
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }

    while (bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xda || marker === 0xd9) {
      return null;
    }

    if (offset + 1 >= bytes.length) {
      return null;
    }

    const segmentLength = readUint16BigEndian(bytes, offset);

    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null;
    }

    if (isJpegStartOfFrame(marker) && segmentLength >= 7) {
      return {
        height: readUint16BigEndian(bytes, offset + 3),
        width: readUint16BigEndian(bytes, offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function readWebpDimensions(bytes: Uint8Array): SanbornDimension | null {
  if (bytes.length < 30) {
    return null;
  }

  const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (chunkType === "VP8X" && bytes.length >= 30) {
    return {
      width: readUint24LittleEndian(bytes, 24) + 1,
      height: readUint24LittleEndian(bytes, 27) + 1,
    };
  }

  if (chunkType === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const byte0 = bytes[21];
    const byte1 = bytes[22];
    const byte2 = bytes[23];
    const byte3 = bytes[24];

    return {
      width: 1 + (((byte1 & 0x3f) << 8) | byte0),
      height: 1 + (((byte3 & 0x0f) << 10) | (byte2 << 2) | ((byte1 & 0xc0) >> 6)),
    };
  }

  if (chunkType === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: readUint16LittleEndian(bytes, 26) & 0x3fff,
      height: readUint16LittleEndian(bytes, 28) & 0x3fff,
    };
  }

  return null;
}

export function readSanbornImageDimensions(bytes: Uint8Array, mimeType: SanbornMimeType): SanbornDimension | null {
  const dimensions =
    mimeType === "image/png" ? readPngDimensions(bytes) : mimeType === "image/jpeg" ? readJpegDimensions(bytes) : readWebpDimensions(bytes);

  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return null;
  }

  return dimensions;
}

export function normalizeSanbornSheetNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function findDuplicateChecksums(checksums: Array<string | null | undefined>): string[] {
  const counts = new Map<string, number>();

  for (const checksum of checksums) {
    if (!checksum) {
      continue;
    }

    counts.set(checksum, (counts.get(checksum) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([checksum]) => checksum)
    .sort();
}

export function findDuplicateSheetNumbers(sheetNumbers: Array<string | number | null | undefined>): number[] {
  const counts = new Map<number, number>();

  for (const sheetNumber of sheetNumbers) {
    const normalized = normalizeSanbornSheetNumber(sheetNumber);

    if (normalized === null) {
      continue;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([sheetNumber]) => sheetNumber)
    .sort((a, b) => a - b);
}

export function findMissingSheetNumbers(sheetNumbers: Array<string | number | null | undefined>, expectedSheetCount: number): number[] {
  if (!Number.isInteger(expectedSheetCount) || expectedSheetCount <= 0) {
    return [];
  }

  const presentSheetNumbers = new Set(
    sheetNumbers
      .map((sheetNumber) => normalizeSanbornSheetNumber(sheetNumber))
      .filter((sheetNumber): sheetNumber is number => sheetNumber !== null),
  );
  const missingSheetNumbers: number[] = [];

  for (let sheetNumber = 1; sheetNumber <= expectedSheetCount; sheetNumber += 1) {
    if (!presentSheetNumbers.has(sheetNumber)) {
      missingSheetNumbers.push(sheetNumber);
    }
  }

  return missingSheetNumbers;
}

export function hasExistingChecksum(existingAssets: SanbornSheetAssetSummary[], checksum: string | null | undefined): boolean {
  return Boolean(checksum && existingAssets.some((asset) => asset.checksum === checksum));
}

export function createEmptySanbornIntakeState(input?: Partial<Pick<SanbornIntakeState, "warningMessage" | "maxUploadBytes">>): SanbornIntakeState {
  return {
    mode: "read_only",
    warningMessage: input?.warningMessage,
    bucketName: sanbornSheetBucket,
    maxUploadBytes: input?.maxUploadBytes ?? sanbornDefaultMaxUploadBytes,
    townPackage: {
      id: null,
      packageId: "No town package loaded",
      name: "Community Review",
      region: "Unknown region",
      year: null,
    },
    activeMapYear: null,
    expectedSheetCount: 0,
    uploadedSheetCount: 0,
    existingAssets: [],
    sourceOptions: [],
    duplicateSheetNumbers: [],
    missingSheetNumbers: [],
  };
}

export function buildSanbornIntakeState(input: Omit<SanbornIntakeState, "uploadedSheetCount" | "duplicateSheetNumbers" | "missingSheetNumbers">): SanbornIntakeState {
  const sheetNumbers = input.existingAssets.map((asset) => asset.sheetNumber);

  return {
    ...input,
    uploadedSheetCount: input.existingAssets.length,
    duplicateSheetNumbers: findDuplicateSheetNumbers(sheetNumbers),
    missingSheetNumbers: findMissingSheetNumbers(sheetNumbers, input.expectedSheetCount),
  };
}

export function normalizeSanbornEvidenceClassification(value: string | null | undefined): ReviewStatus {
  return normalizeReviewStatus(value);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
