"use client";
import { STATS_URL, NO_TRACK_KEY } from "./analytics";
import { loadAuth } from "./account";

export const USAGE_CHANGED = "tripflip:usage-consent";
type UsageType = "active" | "access" | "click" | "flight" | "hotel" | "outbound";
type UsageReply = { ok: boolean; enabled?: boolean; available?: boolean };

export async function memberUsage(token: string, action: "status" | "consent" | "revoke"): Promise<UsageReply> {
  try {
    const res = await fetch(`${STATS_URL}/usage`, {
      method: "POST", headers: { "content-type": "text/plain" },
      body: JSON.stringify({ token, action, ...(action === "consent" ? { version: 1 } : {}) }),
      cache: "no-store",
    });
    if (res.status === 404) return { ok: false, available: false };
    if (!res.ok) return { ok: false };
    const result = await res.json();
    return typeof result.enabled === "boolean" ? result : { ok: false, available: false };
  } catch { return { ok: false }; }
}

export function sendUsage(token: string, kind: UsageType) {
  if (navigator.webdriver || !/^https?:$/.test(location.protocol) || /^(localhost|127\.)/.test(location.hostname)) return;
  try {
    if (loadAuth()?.token !== token || localStorage.getItem(NO_TRACK_KEY) === "1") return;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, "0")).join("");
    void fetch(`${STATS_URL}/usage`, {
      method: "POST", headers: { "content-type": "text/plain" }, cache: "no-store", keepalive: true,
      body: JSON.stringify({ token, action: "event", kind, id }),
    }).catch(() => {});
  } catch {}
}

// Only recognise existing booking buttons by static link metadata, not the address or URL arguments.
export function outboundKind(anchor: HTMLAnchorElement): "outbound" | "flight" | "hotel" | null {
  const kind = anchor.getAttribute("data-usage-outbound");
  if (kind === "flight" || kind === "hotel") return kind;
  return kind === "outbound" ? kind : null;
}
