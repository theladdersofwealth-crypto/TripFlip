// 순수 함수(테스트용으로 분리). Worker 전용 모듈을 쓰지 않는다.
export const STEPS = ["visit", "search", "results", "region", "day", "book", "flight", "hotel", "save"];
export const KEEP_DAYS = 400;
// 고정 허용 목록. 앱 TRAVEL_AREAS와 일치하는지 회귀 테스트로 확인한다.
export const SEARCH_AREAS = ["east-asia", "southeast-asia", "south-asia", "central-asia", "middle-east", "western-europe", "southern-europe", "central-eastern-europe", "northern-europe", "north-america", "central-america", "south-america", "oceania", "africa"];

/** KST 날짜 YYYY-MM-DD */
export function kstDay(ms = Date.now()) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 받은 이벤트 검사. 틀리면 null. p=화면 주소(선택) */
export function parseEvent(raw) {
  let e;
  try { e = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
  if (!e || typeof e !== "object") return null;
  const v = typeof e.v === "string" && /^[a-z0-9]{8,32}$/.test(e.v) ? e.v : null;
  const s = STEPS.includes(e.s) ? e.s : null;
  const r = e.r == null || e.r === "" ? "" : typeof e.r === "string" && /^[A-Za-z0-9-]{2,40}$/.test(e.r) ? e.r : null;
  const p = e.p == null || e.p === "" ? "" : typeof e.p === "string" && /^\/[A-Za-z0-9/_-]{0,80}$/.test(e.p) ? e.p : null;
  if (!v || !s || r === null || p === null) return null;
  const base = p ? { v, s, r, p } : { v, s, r };
  if (e.g === undefined) return base; // 구버전 이벤트에는 지역 기록 없음
  if (s !== "search" || !Array.isArray(e.g) || e.g.length > SEARCH_AREAS.length || !e.g.every((a) => SEARCH_AREAS.includes(a))) return null;
  return { ...base, g: SEARCH_AREAS.filter((a) => e.g.includes(a)) };
}

// Member display names are used only for administrator hide-list matching.
export const nickKey = s => String(s ?? "").normalize("NFC").trim().toLowerCase();

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

/** 로그인 토큰 저장용 해시 */
export async function sha256(s) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

// ── 회원 '내 여행' 저장 ─────────────────────────────────────
export const PLAN_MAX = 300000; // 계획 1개 최대 크기(글자)
export const PLANS_PER_USER = 100;
export const PLANS_BODY_MAX = 3000000;

/** 저장 계획 최소 모양 검사 */
export function planOk(p) {
  return !!p && typeof p === "object" && typeof p.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(p.id) && typeof p.regionId === "string" && typeof p.regionName === "string" && !!p.query && typeof p.query === "object" && typeof p.createdAt === "string";
}

// ── 관리자 통계에서 뺄 회원(운영자 본인 테스트 계정 등) ──────────
/** wrangler.toml 의 HIDE_NICKS("닉1,닉2") → 비교용 닉네임 목록 */
export function hiddenNickKeys(raw) {
  return [...new Set(String(raw ?? "").split(",").map(nickKey).filter(Boolean))];
}
