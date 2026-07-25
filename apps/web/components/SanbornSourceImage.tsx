"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  advanceSanbornSourceImageLifecycle,
  getSanbornSourceImageAspectRatio,
  resetSanbornSourceImageLifecycle,
  type SanbornSourceImageLifecycle,
} from "@/lib/sanborn-source-image";

type SanbornSourceImageAsset = {
  assetId: string;
  signedUrl: string | null;
  originalFilename: string;
  width: number;
  height: number;
};

type SanbornSourceImageStateProps = {
  asset: SanbornSourceImageAsset | null;
  onLoad?: () => void;
};

export function useSanbornSourceImageState({ asset, onLoad }: SanbornSourceImageStateProps) {
  const sourceKey = `${asset?.assetId ?? "none"}:${asset?.signedUrl ?? "none"}`;
  const [lifecycle, setLifecycle] = useState<SanbornSourceImageLifecycle>(resetSanbornSourceImageLifecycle);
  const [lifecycleSourceKey, setLifecycleSourceKey] = useState(sourceKey);

  useEffect(() => {
    setLifecycleSourceKey(sourceKey);
    setLifecycle(resetSanbornSourceImageLifecycle());
  }, [sourceKey]);

  const imageKey = useMemo(() => `${sourceKey}:${lifecycle.retryToken}`, [lifecycle.retryToken, sourceKey]);
  const aspectRatio = getSanbornSourceImageAspectRatio(asset?.width, asset?.height);
  const state = lifecycleSourceKey === sourceKey ? lifecycle.state : "loading";

  return {
    ...lifecycle,
    state,
    aspectRatio,
    imageKey,
    isLoaded: state === "loaded",
    isLoading: state === "loading" || state === "retrying",
    onLoad: () => {
      setLifecycle((current) => advanceSanbornSourceImageLifecycle(current, "load"));
      window.requestAnimationFrame(() => onLoad?.());
    },
    onError: () => setLifecycle((current) => advanceSanbornSourceImageLifecycle(current, "error")),
    retryImage: () => setLifecycle((current) => advanceSanbornSourceImageLifecycle(current, "manual_retry")),
  };
}

export function SanbornSourceImageStatus({ state, filename, onRetry }: { state: SanbornSourceImageLifecycle["state"]; filename: string; onRetry: () => void }): ReactNode {
  if (state === "loaded") return null;
  if (state === "failed") {
    return (
      <div className="sanborn-source-image__status is-failed" role="alert">
        <strong>Sanborn source image could not be loaded.</strong>
        <span>{filename}</span>
        <button className="sanborn-button sanborn-button--primary" onClick={onRetry} type="button">Retry image</button>
      </div>
    );
  }
  return (
    <div aria-live="polite" className="sanborn-source-image__status">
      {state === "retrying" ? "Retrying Sanborn source image" : "Loading Sanborn source image"}
    </div>
  );
}
