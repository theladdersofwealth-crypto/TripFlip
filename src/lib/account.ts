"use client";
// 간편 회원(닉네임·생년월일·성별 + PIN 6자리). 서버: workers/stats (tripflip-stats Worker).
// 로그인하면 이 기기의 화면 이동이 계정 이용 기록으로 묶인다. 가입 없이도 앱은 모두 쓸 수 있다.
import { STATS_URL, deviceId } from "./analytics";

export const AUTH_KEY = "tripflip:auth";
export const SIGNUP_LATER_KEY = "tripflip:signup-later";
export const AUTH_EVENT = "tripflip:auth";

export interface Auth { token: string; nick: string }

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

async function post(path: string, body: object): Promise<{ ok: boolean; error?: string; token?: string; nick?: string }> {
  try {
    const res = await fetch(`${STATS_URL}${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, cache: "no-store" });
    return await res.json();
  } catch {
    return { ok: false, error: "서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요." };
  }
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
  if (r.ok && r.token && r.nick) saveAuth({ token: r.token, nick: r.nick });
  return r;
}

export async function login(nick: string, pin: string) {
  const v = deviceId();
  if (!v) return { ok: false, error: "이 브라우저는 저장이 막혀 있어 로그인할 수 없어요." };
  const r = await post("/login", { nick, pin, v });
  if (r.ok && r.token && r.nick) saveAuth({ token: r.token, nick: r.nick });
  return r;
}

export async function logout() {
  const a = loadAuth();
  saveAuth(null);
  if (a) await post("/logout", { token: a.token });
}

/** 앱을 열 때 로그인 상태 확인(서버에서 지워진 계정이면 로그아웃) */
export async function refreshAuth() {
  const a = loadAuth();
  if (!a) return;
  const r = await post("/me", { token: a.token });
  if (!r.ok && r.error !== undefined && !/연결하지 못했/.test(r.error)) saveAuth(null);
}
