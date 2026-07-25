export const sanbornSourceImageStates = ["loading", "loaded", "retrying", "failed"] as const;
export type SanbornSourceImageState = (typeof sanbornSourceImageStates)[number];

export type SanbornSourceImageLifecycle = {
  state: SanbornSourceImageState;
  automaticRetryUsed: boolean;
  retryToken: number;
};

export function getSanbornSourceImageAspectRatio(width: number | null | undefined, height: number | null | undefined): number {
  return Number.isFinite(width) && Number.isFinite(height) && Number(width) > 0 && Number(height) > 0 ? Number(width) / Number(height) : 1;
}

export function resetSanbornSourceImageLifecycle(): SanbornSourceImageLifecycle {
  return { state: "loading", automaticRetryUsed: false, retryToken: 0 };
}

export function advanceSanbornSourceImageLifecycle(
  lifecycle: SanbornSourceImageLifecycle,
  event: "load" | "error" | "manual_retry" | "asset_change",
): SanbornSourceImageLifecycle {
  if (event === "asset_change") return resetSanbornSourceImageLifecycle();
  if (event === "load") return { ...lifecycle, state: "loaded" };
  if (event === "manual_retry") return { state: "retrying", automaticRetryUsed: false, retryToken: lifecycle.retryToken + 1 };
  if (!lifecycle.automaticRetryUsed) return { state: "retrying", automaticRetryUsed: true, retryToken: lifecycle.retryToken + 1 };
  return { ...lifecycle, state: "failed" };
}
