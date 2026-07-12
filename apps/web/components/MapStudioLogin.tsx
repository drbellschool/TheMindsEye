"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Panel } from "@/components/Panel";
import type { HistoricalMapStudioState } from "@/lib/historical-map-studio";

export function MapStudioLogin({ studioState }: { studioState: HistoricalMapStudioState }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [message, setMessage] = useState(studioState.warningMessage ?? "");
  const canSubmit = studioState.mode === "login_required";

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setStatus("submitting");
    setMessage("");

    const response = await fetch("/api/community/historical-map-studio/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

    if (!response.ok || !payload?.ok) {
      setStatus("error");
      setMessage(payload?.message ?? "Historical Map Studio login failed.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="map-studio-login">
      <Panel
        eyebrow="Owner Workspace"
        title="Historical Map Studio"
        subtitle="This write-enabled studio is protected while the broader Community pages remain public."
        tone="blueprint"
      >
        <form className="map-studio-login__form" onSubmit={(event) => void submitPassword(event)}>
          {message ? <p className={status === "error" ? "sanborn-intake__warning" : "small-muted"}>{message}</p> : null}
          <label>
            Owner password
            <input
              autoComplete="current-password"
              disabled={!canSubmit || status === "submitting"}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={canSubmit ? "Enter owner password" : "MAP_STUDIO_OWNER_PASSWORD is required"}
              type="password"
              value={password}
            />
          </label>
          <button className="sanborn-button sanborn-button--primary" disabled={!canSubmit || status === "submitting" || password.length === 0} type="submit">
            {status === "submitting" ? "Signing in..." : "Enter studio"}
          </button>
        </form>
      </Panel>
    </div>
  );
}
