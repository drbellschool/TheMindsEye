export type HistoricalUploadAuthenticationMode = "signed_tus" | "bearer_tus";

export function buildSupabaseResumableUploadEndpoint(input: {
  projectId: string;
  authenticationMode: HistoricalUploadAuthenticationMode;
}): string {
  const suffix = input.authenticationMode === "signed_tus"
    ? "/storage/v1/upload/resumable/sign"
    : "/storage/v1/upload/resumable";
  return `https://${input.projectId}.storage.supabase.co${suffix}`;
}

export function inspectCompactSignedUploadToken(token: unknown): { valid: boolean; segmentCount: number; tokenLength: number } {
  const value = typeof token === "string" ? token : "";
  const segments = value.split(".");
  return {
    valid: segments.length === 3 && segments.every((segment) => segment.length > 0),
    segmentCount: value ? segments.length : 0,
    tokenLength: value.length,
  };
}
