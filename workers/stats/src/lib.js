// 순수 함수(테스트용으로 분리). Worker 전용 모듈을 쓰지 않는다.
export const STEPS = ["visit", "search", "results", "region", "day", "book", "flight", "hotel", "save"];
export const KEEP_DAYS = 400;

/** KST 날짜 YYYY-MM-DD */
export function kstDay(ms = Date.now()) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 받은 이벤트 검사. 틀리면 null */
export function parseEvent(raw) {
  let e;
  try { e = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
  if (!e || typeof e !== "object") return null;
  const v = typeof e.v === "string" && /^[a-z0-9]{8,32}$/.test(e.v) ? e.v : null;
  const s = STEPS.includes(e.s) ? e.s : null;
  const r = e.r == null || e.r === "" ? "" : typeof e.r === "string" && /^[A-Za-z0-9-]{2,40}$/.test(e.r) ? e.r : null;
  if (!v || !s || r === null) return null;
  return { v, s, r };
}
