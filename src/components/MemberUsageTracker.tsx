"use client";
import { useEffect, useState } from "react";
import { AUTH_EVENT, AUTH_KEY, loadAuth } from "@/lib/account";
import { memberUsage, outboundKind, sendUsage, USAGE_CHANGED } from "@/lib/memberUsage";

export function MemberUsageTracker({ path }: { path: string }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (navigator.webdriver || /^(localhost|127\.)/.test(location.hostname)) return;
    let seq = 0;
    const sync = async () => {
      const version = ++seq;
      const next = loadAuth()?.token;
      setToken(null);
      if (!next) return;
      const result = await memberUsage(next, "status");
      if (version === seq && loadAuth()?.token === next && result.ok && result.enabled) setToken(next);
    };
    const otherTab = (e: StorageEvent) => { if (e.key === AUTH_KEY) void sync(); };
    void sync();
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener(USAGE_CHANGED, sync);
    window.addEventListener("storage", otherTab);
    return () => {
      seq++;
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener(USAGE_CHANGED, sync);
      window.removeEventListener("storage", otherTab);
    };
  }, []);
  useEffect(() => {
    if (!token || path.startsWith("/admin")) return;
    sendUsage(token, "access");
    let lastInput = performance.now();
    let visibleSince = document.hidden ? Infinity : performance.now();
    const activity = () => { lastInput = performance.now(); };
    const visibility = () => {
      visibleSince = document.hidden ? Infinity : performance.now();
      if (!document.hidden) activity();
    };
    const click = (e: MouseEvent) => {
      if (!e.isTrusted || document.hidden || !(e.target instanceof Element)) return;
      const target = e.target.closest("button:not(:disabled),a[href],[role=button],[role=tab]");
      if (!target) return;
      if (e.type === "click") sendUsage(token, "click");
      if (target instanceof HTMLAnchorElement && (e.type === "click" || e.button === 1)) {
        const kind = outboundKind(target);
        if (kind) sendUsage(token, kind);
      }
    };
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden && now - visibleSince >= 14900 && now - lastInput < 60_000) sendUsage(token, "active");
    }, 15_000);
    const inputs = ["pointerdown", "keydown", "scroll"] as const;
    for (const event of inputs) document.addEventListener(event, activity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("click", click, true);
    document.addEventListener("auxclick", click, true);
    return () => {
      window.clearInterval(timer);
      for (const event of inputs) document.removeEventListener(event, activity, true);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("click", click, true);
      document.removeEventListener("auxclick", click, true);
    };
  }, [path, token]);

  return null;
}
