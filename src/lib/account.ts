"use client";
// 간편 회원(닉네임·생년월일·성별 + PIN 6자리). 서버: workers/stats (tripflip-stats Worker).
// 로그인하면 이 기기의 화면 이동이 계정 이용 기록으로 묶인다. 가입 없이도 앱은 모두 쓸 수 있다.
import { STATS_URL, deviceId } from "./analytics";

export const AUTH_KEY = "tripflip:auth";
export const SIGNUP_LATER_KEY = "tripflip:signup-later";
export const AUTH_EVENT = "tripflip:auth";

export interface Auth { token: string; nick: string; uid?: string; hasPin?: boolean }
export type GoogleIntent = "login" | "link" | "withdraw";
const GOOGLE_PENDING = "tripflip:google-pending";
const GOOGLE_ORIGIN = "https://tripflip.co.kr";
const GOOGLE_FAILURE = "구글 로그인에 실패했어요. 기존 로그인 방식으로 다시 시도해 주세요.";

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

async function post(path: string, body: object): Promise<{ ok: boolean; error?: string; token?: string; nick?: string; uid?: string; hasPin?: boolean }> {
  try {
    const res = await fetch(`${STATS_URL}${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, cache: "no-store" });
    return await res.json();
  } catch {
    return { ok: false, error: "서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요." };
  }
}

async function googlePost(path: string, body: object): Promise<{ ok: boolean; url?: string; error?: string; token?: string; nick?: string; uid?: string; hasPin?: boolean; withdrawn?: boolean }> {
  try {
    const res = await fetch("/auth/google/" + path, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), credentials: "same-origin", cache: "no-store" });
    if (!res.headers.get("content-type")?.includes("application/json")) return { ok: false, error: GOOGLE_FAILURE };
    return await res.json();
  } catch { return { ok: false, error: GOOGLE_FAILURE }; }
}

export async function startGoogle(intent: GoogleIntent, agree: boolean) {
  if (location.origin !== GOOGLE_ORIGIN) return { ok: false, error: "구글 로그인은 tripflip.co.kr에서 이용해 주세요. 기존 로그인은 계속 사용할 수 있어요." };
  const v = deviceId(), a = loadAuth();
  if (!agree || !v || (intent === "login" ? !!a : !a)) return { ok: false, error: GOOGLE_FAILURE };
  try { sessionStorage.removeItem(GOOGLE_PENDING); } catch { return { ok: false, error: GOOGLE_FAILURE }; }
  const r = await googlePost("start", { v, intent, agree, token: a?.token ?? null });
  if (r.ok && r.url) {
    try {
      const url = new URL(r.url);
      if (url.origin === "https://accounts.google.com" && url.pathname === "/o/oauth2/v2/auth" && (loadAuth()?.token ?? null) === (a?.token ?? null)) {
        const state = url.searchParams.get("state");
        if (!state || !/^[a-f0-9]{64}$/.test(state)) return { ok: false, error: GOOGLE_FAILURE };
        sessionStorage.setItem(GOOGLE_PENDING, JSON.stringify({ intent, state }));
        location.assign(url.href);
        return { ok: true };
      }
    } catch {}
  }
  try { sessionStorage.removeItem(GOOGLE_PENDING); } catch {}
  return { ok: false, error: r.error ?? GOOGLE_FAILURE };
}

/** OAuth redirects contain no tokens. Consume the HttpOnly cookie exactly once with same-origin POST. */
export async function finishGoogle(outcome: string) {
  let pending: { intent?: string; state?: string } | null = null;
  try {
    const raw = sessionStorage.getItem(GOOGLE_PENDING);
    sessionStorage.removeItem(GOOGLE_PENDING);
    pending = JSON.parse(raw ?? "null");
  } catch {}
  const intent = pending?.intent, state = pending?.state;
  if (outcome !== "done" || !["login", "link", "withdraw"].includes(intent ?? "") || typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) return { ok: false, error: GOOGLE_FAILURE };
  const v = deviceId(), a = loadAuth();
  if (!v || (intent === "login" ? !!a : !a)) return { ok: false, error: GOOGLE_FAILURE };
  const r = await googlePost("complete", { v, intent, state, token: a?.token ?? null });
  if ((loadAuth()?.token ?? null) !== (a?.token ?? null)) return { ok: false, error: "계정이 변경됐어요. 다시 시도해 주세요." };
  if (r.ok && intent === "withdraw" && r.withdrawn) {
    if (a?.uid) { try { localStorage.removeItem(`tripflip.acct.${a.uid}.plans`); localStorage.removeItem(`tripflip.acct.${a.uid}.pending`); } catch {} }
    saveAuth(null);
    return { ok: true };
  }
  if (r.ok && intent !== "withdraw" && r.token && r.nick && r.uid && typeof r.hasPin === "boolean") {
    if (intent === "link" && a?.uid && r.uid !== a.uid) return { ok: false, error: GOOGLE_FAILURE };
    saveAuth({ token: r.token, nick: r.nick, uid: r.uid, hasPin: r.hasPin });
    return { ok: true };
  }
  return { ok: false, error: r.error ?? GOOGLE_FAILURE };
}

/** 생년월일 8자리(19850127) → 1985-01-27. 틀리면 null */
export function birthFrom8(s: string): string | null {
  const m = s.replace(/\D/g, "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(+d) && d.toISOString().slice(0, 10) === iso && +m[1] >= 1900 ? iso : null;
}

export async function signup(f: { nick: string; birth: string; gender: "M" | "F"; pin: string; agree: boolean }) {
  const v = deviceId();
  if (!v) return { ok: false, error: "이 브라우저는 저장이 막혀 있어 가입할 수 없어요." };
  const r = await post("/signup", { ...f, v });
  if (r.ok && r.token && r.nick) saveAuth({ token: r.token, nick: r.nick, uid: r.uid });
  return r;
}

export async function login(nick: string, pin: string) {
  const v = deviceId();
  if (!v) return { ok: false, error: "이 브라우저는 저장이 막혀 있어 로그인할 수 없어요." };
  const r = await post("/login", { nick, pin, v });
  if (r.ok && r.token && r.nick) saveAuth({ token: r.token, nick: r.nick, uid: r.uid });
  return r;
}

/** 로그아웃. 그 계정 여행은 이 기기 화면에서 바로 숨김(서버 사본 삭제). 아직 안 올라간 변경은 남겨 두고 같은 계정으로 다시 로그인할 때만 재시도 */
export async function logout(beforeLeave?: () => Promise<unknown>) {
  const a = loadAuth();
  if (a && beforeLeave) await Promise.race([beforeLeave(), new Promise((r) => setTimeout(r, 4000))]);
  if (a?.uid) { try { localStorage.removeItem(`tripflip.acct.${a.uid}.plans`); } catch {} }
  saveAuth(null);
  if (a) await post("/logout", { token: a.token });
}

/** 본인 탈퇴: 서버에서 계정·내 여행·이용 기록을 지우고 이 기기에서도 로그아웃 */
export async function withdraw(pin: string) {
  const a = loadAuth();
  if (!a) return { ok: false, error: "로그인 상태가 아니에요." };
  const r = await post("/withdraw", { token: a.token, pin });
  if (r.ok) {
    if (a.uid) { try { localStorage.removeItem(`tripflip.acct.${a.uid}.plans`); localStorage.removeItem(`tripflip.acct.${a.uid}.pending`); } catch {} }
    saveAuth(null);
  }
  return r;
}

/** 만 나이 (YYYY-MM-DD, 오늘은 한국 날짜) */
export function ageOn(birth: string, today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)) {
  const [by, bm, bd] = birth.split("-").map(Number), [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** 앱을 열 때 로그인 상태 확인(서버에서 지워진 계정이면 로그아웃) */
export async function refreshAuth() {
  const a = loadAuth();
  if (!a) return;
  const r = await post("/me", { token: a.token });
  if (loadAuth()?.token !== a.token) return; // 늦은 응답이 다른 계정을 덮지 않도록
  if (r.ok && r.uid && (r.uid !== a.uid || (typeof r.hasPin === "boolean" && r.hasPin !== a.hasPin) || (r.nick && r.nick !== a.nick))) {
    saveAuth({ ...a, uid: r.uid, nick: r.nick ?? a.nick, ...(typeof r.hasPin === "boolean" ? { hasPin: r.hasPin } : {}) });
  } else if (!r.ok && r.error !== undefined && !/연결하지 못했/.test(r.error)) saveAuth(null);
}
