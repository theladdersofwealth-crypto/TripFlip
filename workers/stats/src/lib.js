// 순수 함수(테스트용으로 분리). Worker 전용 모듈을 쓰지 않는다.
export const STEPS = ["visit", "search", "results", "region", "day", "book", "flight", "hotel", "save"];
export const KEEP_DAYS = 400;

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
  return p ? { v, s, r, p } : { v, s, r };
}

// ── 간편 회원 ──────────────────────────────────────────────
export const PIN_ITER = 100000; // Workers PBKDF2 최대치
export const LOCK_AFTER = 5; // PIN 5번 틀리면 잠금
export const LOCK_MIN = 15; // 잠금 시간(분). 반복되면 두 배씩 (최대 24시간)

/** 닉네임 비교용: 앞뒤 공백 제거·소문자 */
export const nickKey = (s) => String(s ?? "").normalize("NFC").trim().toLowerCase();

/** 가입 입력 검사 → { nick, birth, gender, pin } 또는 { error } */
export function validateSignup(b, today = kstDay()) {
  if (!b || typeof b !== "object") return { error: "입력값이 없어요." };
  const nick = String(b.nick ?? "").normalize("NFC").trim();
  if (!/^[가-힣A-Za-z0-9_]{2,12}$/.test(nick)) return { error: "닉네임은 한글·영문·숫자 2~12자로 정해 주세요." };
  const birth = String(b.birth ?? "");
  const m = birth.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || !d || d.toISOString().slice(0, 10) !== birth || +m[1] < 1900 || birth > today) return { error: "생년월일을 다시 확인해 주세요." };
  const gender = b.gender === "M" || b.gender === "F" ? b.gender : null;
  if (!gender) return { error: "성별을 골라 주세요." };
  const pin = validPin(b.pin);
  if (!pin) return { error: "PIN은 숫자 6자리예요." };
  if (b.agree !== true) return { error: "개인정보 수집에 동의해 주세요." };
  return { nick, birth, gender, pin };
}

export const validPin = (p) => (typeof p === "string" && /^\d{6}$/.test(p) ? p : null);

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

/** PIN 해시 (PBKDF2-SHA256 + 계정별 무작위 솔트). PIN 자체는 저장하지 않는다 */
export async function hashPin(pin, saltHex, iter = PIN_ITER) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}

/** 로그인 토큰 저장용 해시 */
export async function sha256(s) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** n번째 연속 잠금의 길이(ms) */
export const lockMs = (times) => Math.min(LOCK_MIN * 2 ** Math.max(times - 1, 0), 24 * 60) * 60000;
