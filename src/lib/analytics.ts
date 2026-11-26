"use client";
// 관리자 통계용 익명 이벤트. 기기마다 무작위 번호 하나만 쓰고 이름·IP·위치는 보내지 않는다.
// 받는 곳: workers/stats (tripflip-stats Worker). 실패해도 앱 동작에는 영향 없음.

import { normalizeTravelAreas, type TravelArea } from "@/data/travelAreas";

export const STATS_URL = "https://tripflip-stats.ohysky0127.workers.dev";
export const VID_KEY = "tripflip:vid";
export const NO_TRACK_KEY = "tripflip:no-track";

export type StatStep = "visit" | "search" | "results" | "region" | "day" | "book" | "flight" | "hotel" | "save";

/** 주소 → 퍼널 단계와 권역 id. 통계 대상이 아니면 null */
export function stepForPath(path: string): { s: StatStep; r?: string } | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p.startsWith("/admin")) return null;
  if (p === "/results") return { s: "results" };
  let m = p.match(/^\/r\/([A-Za-z0-9-]+)\/day\/\d+$/);
  if (m) return { s: "day", r: m[1] };
  m = p.match(/^\/r\/([A-Za-z0-9-]+)$/);
  if (m) return { s: "region", r: m[1] };
  m = p.match(/^\/book\/([A-Za-z0-9-]+)$/);
  if (m) return { s: "book", r: m[1] };
  return null;
}

function visitorId(): string | null {
  try {
    if (localStorage.getItem(NO_TRACK_KEY) === "1") return null;
  } catch {
    return null;
  }
  return deviceId();
}

/** 이 브라우저의 무작위 번호(없으면 만듦). 저장이 막혔으면 null */
export function deviceId(): string | null {
  try {
    let v = localStorage.getItem(VID_KEY);
    if (!v || !/^[a-z0-9]{8,32}$/.test(v)) {
      v = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join("");
      localStorage.setItem(VID_KEY, v);
    }
    return v;
  } catch {
    return null; // 저장이 막힌 브라우저는 세지 않음
  }
}

/** g는 검색 선택 지역(빈 배열=전체). Worker에서 지역별 일별 합계에만 사용. */
export function track(s: StatStep, r?: string, p?: string, areas?: readonly TravelArea[]) {
  if (typeof window === "undefined" || navigator.webdriver) return; // 자동 테스트·로봇 제외
  if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.)/.test(location.hostname)) return; // 개발 중 제외
  const v = visitorId();
  if (!v) return;
  const body = JSON.stringify({ v, s, ...(r ? { r } : {}), ...(p ? { p } : {}), ...(s === "search" && areas !== undefined ? { g: normalizeTravelAreas(areas) } : {}) });
  try {
    if (navigator.sendBeacon?.(`${STATS_URL}/e`, new Blob([body], { type: "text/plain" }))) return;
  } catch {}
  fetch(`${STATS_URL}/e`, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
}

/** 화면이 바뀔 때마다: 방문 1회 + 해당 퍼널 단계 */
export function trackPage(path: string) {
  if (path.startsWith("/admin")) return;
  track("visit", undefined, cleanPath(path));
  const st = stepForPath(path);
  if (st) track(st.s, st.r);
}

/** 서버가 받는 모양의 화면 주소(영문·숫자·/·-·_ 80자) */
export function cleanPath(path: string): string | undefined {
  const p = (path.replace(/\/+$/, "") || "/").slice(0, 81);
  return /^\/[A-Za-z0-9/_-]{0,80}$/.test(p) ? p : undefined;
}

/** 기록 한 줄 → 사람이 읽는 말 */
export function activityLabel(step: string, region: string, path: string, rName: (id: string) => string = (id) => id): string {
  if (step === "search") return "조건 넣고 추천 찾기";
  if (step === "flight") return `✈ 항공 예약 버튼 (${rName(region)})`;
  if (step === "hotel") return `🏨 숙소 예약 버튼 (${rName(region)})`;
  if (step === "save") return `💾 내 여행에 저장 (${rName(region)})`;
  const p = path || "/";
  if (p === "/") return "첫 화면";
  if (p === "/results") return "추천 목록";
  if (p === "/my-trips") return "내 여행";
  if (p === "/account") return "가입·로그인 화면";
  let m = p.match(/^\/r\/([^/]+)\/day\/(\d+)$/);
  if (m) return `${rName(m[1])} ${m[2]}일차 타임테이블`;
  m = p.match(/^\/r\/([^/]+)$/);
  if (m) return `${rName(m[1])} 일정`;
  m = p.match(/^\/book\/([^/]+)$/);
  if (m) return `${rName(m[1])} 항공·숙소 화면`;
  return p;
}
