"use client";
// 소셜 회원. 기존 Stats Worker 세션 및 여행 저장 구조를 사용.
// 로그인하면 이 기기의 화면 이동이 계정 이용 기록으로 묶인다. 가입 없이도 앱은 모두 쓸 수 있다.
import { STATS_URL, deviceId } from "./analytics";

export const AUTH_KEY = "tripflip:auth";
export const SIGNUP_LATER_KEY = "tripflip:signup-later";
export const AUTH_EVENT = "tripflip:auth";

export interface Auth { token: string; nick: string; uid?: string }
export type SocialProvider = "google" | "kakao" | "naver";
export const SOCIAL_PROVIDERS: readonly SocialProvider[] = ["google", "kakao", "naver"];
const AUTH_URLS = {google:"https://accounts.google.com/o/oauth2/v2/auth",kakao:"https://kauth.kakao.com/oauth/authorize",naver:"https://nid.naver.com/oauth2/authorize"};
export type SocialIntent = "login" | "withdraw";
const SOCIAL_PENDING = "tripflip:social-pending";
const SOCIAL_ORIGINS = ["https://tripflip.co.kr", "https://www.tripflip.co.kr"] as const;
const allowedSocialOrigin = (origin: string) => SOCIAL_ORIGINS.some(o => o === origin);
const SOCIAL_FAILURE = "소셜 로그인에 실패했어요. 다시 시도해 주세요.";

/** 원인 코드: 서버 사유(reason) 또는 브라우저 쪽 사유. 비밀값 없음. */
function failureCode(outcome: string, reason: string | null | undefined, pending: { origin?: string } | null) {
  const code = outcome === "error" ? (reason && /^[a-z0-9_]{1,40}$/.test(reason) ? reason : "server") : !pending ? "no_pending" : pending.origin !== location.origin ? "origin_mismatch" : "client";
  return " (원인 코드: " + code + ")";
}

export function loadAuth(): Auth | null {
  try {
    const a = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return a && typeof a.token === "string" && typeof a.nick === "string" ? a : null;
  } catch {
    return null;
  }
}

function saveAuth(a: Auth | null) {
  try { a ? localStorage.setItem(AUTH_KEY, JSON.stringify(a)) : localStorage.removeItem(AUTH_KEY); } catch {}
  window.dispatchEvent(new Event(AUTH_EVENT));
}

async function post(path: string, body: object): Promise<{ ok: boolean; error?: string; token?: string; nick?: string; uid?: string }> {
  try {
    const res = await fetch(`${STATS_URL}${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, cache: "no-store" });
    return await res.json();
  } catch {
    return { ok: false, error: "서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요." };
  }
}

async function socialPost(provider: SocialProvider, path: string, body: object): Promise<{ ok: boolean; url?: string; error?: string; token?: string; nick?: string; uid?: string; withdrawn?: boolean }> {
  try {
    const res = await fetch("/auth/" + provider + "/" + path, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), credentials: "same-origin", cache: "no-store" });
    if (!res.headers.get("content-type")?.includes("application/json")) return { ok: false, error: SOCIAL_FAILURE };
    return await res.json();
  } catch { return { ok: false, error: SOCIAL_FAILURE }; }
}

export async function startSocial(provider: SocialProvider, intent: SocialIntent, agree: boolean) {
  const origin = location.origin;
  if (!allowedSocialOrigin(origin)) return { ok: false, error: "소셜 로그인은 tripflip.co.kr 또는 www.tripflip.co.kr에서 이용해 주세요." };
  const v = deviceId(), a = loadAuth();
  if (!agree || !v || (intent === "login" ? !!a : !a)) return { ok: false, error: SOCIAL_FAILURE };
  try { sessionStorage.removeItem(SOCIAL_PENDING); } catch { return { ok: false, error: SOCIAL_FAILURE }; }
  const r = await socialPost(provider, "start", { v, intent, agree, token: a?.token ?? null });
  if (r.ok && r.url) {
    try {
      const url = new URL(r.url);
      if (url.origin + url.pathname === AUTH_URLS[provider] && url.searchParams.get("redirect_uri") === origin + "/auth/" + provider + "/callback" && location.origin === origin && (loadAuth()?.token ?? null) === (a?.token ?? null)) {
        const state = url.searchParams.get("state");
        if (!state || !/^[a-f0-9]{64}$/.test(state)) return { ok: false, error: SOCIAL_FAILURE };
        sessionStorage.setItem(SOCIAL_PENDING, JSON.stringify({ provider, intent, state, origin }));
        location.assign(url.href);
        return { ok: true };
      }
    } catch {}
  }
  try { sessionStorage.removeItem(SOCIAL_PENDING); } catch {}
  return { ok: false, error: r.error ?? SOCIAL_FAILURE };
}

/** OAuth redirects contain no tokens. Consume the HttpOnly cookie exactly once with same-origin POST. */
export async function finishSocial(outcome: string, reason?: string | null) {
  let pending: { provider?: SocialProvider; intent?: string; state?: string; origin?: string } | null = null;
  try {
    const raw = sessionStorage.getItem(SOCIAL_PENDING);
    sessionStorage.removeItem(SOCIAL_PENDING);
    pending = JSON.parse(raw ?? "null");
  } catch {}
  const intent = pending?.intent, state = pending?.state, provider = pending?.provider;
  if (!allowedSocialOrigin(location.origin) || pending?.origin !== location.origin || outcome !== "done" || !provider || !SOCIAL_PROVIDERS.includes(provider) || !["login", "withdraw"].includes(intent ?? "") || typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) return { ok: false, error: SOCIAL_FAILURE + failureCode(outcome, reason, pending) };
  const v = deviceId(), a = loadAuth();
  if (!v || (intent === "login" ? !!a : !a)) return { ok: false, error: SOCIAL_FAILURE };
  const r = await socialPost(provider, "complete", { v, intent, state, token: a?.token ?? null });
  if ((loadAuth()?.token ?? null) !== (a?.token ?? null)) return { ok: false, error: "계정이 변경됐어요. 다시 시도해 주세요." };
  if (r.ok && intent === "withdraw" && r.withdrawn) {
    if (a?.uid) { try { localStorage.removeItem(`tripflip.acct.${a.uid}.plans`); localStorage.removeItem(`tripflip.acct.${a.uid}.pending`); } catch {} }
    saveAuth(null);
    return { ok: true };
  }
  if (r.ok && intent !== "withdraw" && r.token && r.nick && r.uid) {
    saveAuth({ token: r.token, nick: r.nick, uid: r.uid });
    return { ok: true };
  }
  return { ok: false, error: r.error ?? SOCIAL_FAILURE };
}

/** 로그아웃. 그 계정 여행은 이 기기 화면에서 바로 숨김(서버 사본 삭제). 아직 안 올라간 변경은 남겨 두고 같은 계정으로 다시 로그인할 때만 재시도 */
export async function logout(beforeLeave?: () => Promise<unknown>) {
  const a = loadAuth();
  if (a && beforeLeave) await Promise.race([beforeLeave(), new Promise((r) => setTimeout(r, 4000))]);
  if (a?.uid) { try { localStorage.removeItem(`tripflip.acct.${a.uid}.plans`); } catch {} }
  saveAuth(null);
  if (a) await post("/logout", { token: a.token });
}

/** 앱을 열 때 로그인 상태 확인(서버에서 지워진 계정이면 로그아웃) */
export async function refreshAuth() {
  const a = loadAuth();
  if (!a) return;
  const r = await post("/me", { token: a.token });
  if (loadAuth()?.token !== a.token) return; // 늦은 응답이 다른 계정을 덮지 않도록
  if (r.ok && r.uid && (r.uid !== a.uid || (r.nick && r.nick !== a.nick))) {
    saveAuth({ ...a, uid: r.uid, nick: r.nick ?? a.nick });
  } else if (!r.ok && r.error !== undefined && !/연결하지 못했/.test(r.error)) saveAuth(null);
}
