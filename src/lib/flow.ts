// 추천 흐름(조건 → 결과 → 일정 → 예약 → 내 여행) 상태. 이 기기 localStorage에만 저장한다.
"use client";
import { useEffect, useState } from "react";
import type { RegionQuery } from "@/services/regionScore";
import type { Board } from "@/services/planner";
import { normalizeParty } from "@/lib/travelParty";
import { addCalendarDays, calendarDays, travelDateError } from "@/lib/travelDates";

export type Transport = "택시·그랩" | "대중교통" | "렌터카" | "도보";
export const TRANSPORTS: Transport[] = ["택시·그랩", "대중교통", "렌터카", "도보"];

export interface DayPrefs {
  wake: string; // HH:MM
  breakfast: string; // HH:MM
  breakfastMin: number;
  transport: Transport;
  breakfastEnabled?: boolean;
}

export interface SavedPlan {
  id: string;
  regionId: string;
  regionName: string;
  query: RegionQuery;
  display: number;
  booked: { flight: boolean; hotel: boolean };
  createdAt: string;
  schemaVersion?: 2;
  board?: Board;
  prefs?: DayPrefs;
  flightPreference?: "any" | "lowcost" | "fullservice";
}

export const DEFAULT_PREFS: DayPrefs = { wake: "07:30", breakfast: "08:00", breakfastMin: 45, transport: "택시·그랩", breakfastEnabled: true };

export const DEFAULT_QUERY: RegionQuery = {
  startDate: "2026-12-20",
  endDate: "2026-12-23",
  adults: 2,
  children: [],
  elders: false,
  pet: false,
  main: "관광",
  subs: ["휴양"],
  perDay: 2,
  price: "상관없음",
  stay: "가심비",
  maxFlightHours: 8,
};

const K = { query: "tripflip.flow.query", prefs: "tripflip.flow.prefs", plans: "tripflip.flow.plans", boards: "tripflip.flow.boards" };

// 브라우저 저장이 실패한 값은 이 탭 메모리에 들고 있다가 읽을 때 우선 사용한다.
// (저장 실패 후 예전 저장값·기본값으로 조용히 되돌아가는 문제 방지. 새로고침하면 사라진다.)
const mem = new Map<string, unknown>();
export const STORAGE_FAIL_EVENT = "tripflip:storage-fail";
/** 테스트용: 메모리 대체 저장 비우기 */
export const resetStorageFallback = () => mem.clear();

function read<T>(key: string, fallback: T): T {
  if (mem.has(key)) return mem.get(key) as T;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    mem.delete(key);
    return true;
  } catch {
    mem.set(key, JSON.parse(JSON.stringify(v)));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(STORAGE_FAIL_EVENT));
    return false;
  }
}

export function loadQuery(): RegionQuery {
  const raw = read<RegionQuery | null>(K.query, null);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.children) || !Array.isArray(raw.subs) || travelDateError(raw)) return normalizeParty(DEFAULT_QUERY);
  return normalizeParty({ ...DEFAULT_QUERY, ...raw });
}
export const saveQuery = (q: RegionQuery) => write(K.query, q);
export const loadPrefs = (regionId: string, planId?: string | null) => ({ ...DEFAULT_PREFS, ...((planId ? loadPlans().find((p) => p.id === planId)?.prefs : undefined) ?? read<Record<string, DayPrefs>>(K.prefs, {})[regionId]) });
export function savePrefs(regionId: string, p: DayPrefs, planId?: string | null) {
  if (planId) {
    const plan = loadPlans().find((x) => x.id === planId);
    if (plan) return savePlan({ ...plan, prefs: p });
  }
  return write(K.prefs, { ...read<Record<string, DayPrefs>>(K.prefs, {}), [regionId]: p });
}
/** 일정판(일자별 4칸)은 권역별로 저장. 조건이 바뀌면 key가 달라져 새로 만든다 */
export const loadBoard = (regionId: string, key: string, planId?: string | null) => {
  const saved = planId ? loadPlans().find((p) => p.id === planId)?.board : undefined;
  const b = saved ?? read<Record<string, Board>>(K.boards, {})[regionId];
  if (!b || typeof b.key !== "string") return null;
  if (b.key === key) return b;
  // V2의 짧은 키를 사용하던 저장본도 동일한 조건·날짜일 때 고정 칸을 보존한다.
  const prefix = `v3|${regionId}|`;
  if (!key.startsWith(prefix)) return null;
  try {
    const q = JSON.parse(key.slice(prefix.length)) as RegionQuery;
    if (!q || !Array.isArray(q.children) || !Array.isArray(q.subs) || travelDateError(q)) return null;
    const companions = q.companions?.length ? q.companions : [
      q.adults === 1 && !q.children.length ? "혼자" : "부부",
      ...(q.elders ? ["부모님"] : []),
      ...(q.children.some((c) => c.band === "영아") ? ["영유아"] : []),
      ...(q.children.some((c) => c.band === "유아" || c.band === "초등") ? ["아이"] : []),
      ...(q.children.some((c) => c.band === "중고등") ? ["10대"] : []),
    ];
    const legacyKey = [regionId, q.startDate, q.endDate, companions.join(","), q.main, q.subs.join(","), q.perDay].join("|");
    if (b.key !== legacyKey || !Array.isArray(b.days) || b.days.length !== calendarDays(q.startDate, q.endDate)) return null;
    if (!b.days.every((day, i) => day.date === addCalendarDays(q.startDate, i))) return null;
    return { ...b, key };
  } catch { return null; }
};
export function saveBoard(regionId: string, b: Board, planId?: string | null) {
  if (planId) {
    const plan = loadPlans().find((x) => x.id === planId);
    if (plan) return savePlan({ ...plan, board: b });
  }
  return write(K.boards, { ...read<Record<string, Board>>(K.boards, {}), [regionId]: b });
}
const validPlans = (plans: unknown): SavedPlan[] => (Array.isArray(plans) ? plans.filter((p) => p && typeof p.id === "string" && p.query && Array.isArray(p.query.children) && Array.isArray(p.query.subs) && !travelDateError(p.query)) : []);

// ── 내 여행 저장소 ───────────────────────────────────────────
// 비회원: tripflip.guest.plans (이 기기에서 비회원으로 만든 것) + 예전 공용 저장소 tripflip.flow.plans(소유자 불분명, 자동 업로드·삭제 안 함)
// 회원: 계정별로 분리. 서버가 확인한 목록(cache)과 아직 서버 확인 전인 변경(pending)을 따로 둔다.
//   tripflip.acct.<uid>.plans   서버 원본의 사본
//   tripflip.acct.<uid>.pending { puts: {id: {plan, state}}, dels: {id: {state}} }  state = waiting(동기화 대기) | failed(저장 실패)
// 로그아웃·계정 전환하면 그 계정 것은 바로 안 보이고, 대기 변경은 지우지 않고 같은 계정으로 다시 로그인할 때만 재시도한다.
export const GUEST_PLANS_KEY = "tripflip.guest.plans";
export type PendingState = "waiting" | "failed";
export interface Pending { puts: Record<string, { plan: SavedPlan; state: PendingState; error?: string }>; dels: Record<string, { state: PendingState; error?: string }> }
export type PlanState = "synced" | PendingState | "local";
const acctKey = (uid: string, part: "plans" | "pending") => `tripflip.acct.${uid}.${part}`;

/** 지금 로그인한 계정(uid·token). 비회원이면 null, 계정 확인 중이면 { uid: "" } */
export function currentAccount(): { uid: string; token: string } | null {
  try {
    const a = JSON.parse(localStorage.getItem("tripflip:auth") || "null");
    if (!a || typeof a.token !== "string") return null;
    return { uid: typeof a.uid === "string" && /^[a-f0-9]{16}$/.test(a.uid) ? a.uid : "", token: a.token };
  } catch {
    return null;
  }
}

export const loadAccountCache = (uid: string) => validPlans(read<SavedPlan[]>(acctKey(uid, "plans"), []));
export const saveAccountCache = (uid: string, plans: SavedPlan[]) => write(acctKey(uid, "plans"), plans);
export const clearAccountCache = (uid: string) => { try { localStorage.removeItem?.(acctKey(uid, "plans")); } catch {} mem.delete(acctKey(uid, "plans")); };
export function loadPending(uid: string): Pending {
  const p = read<Pending>(acctKey(uid, "pending"), { puts: {}, dels: {} });
  return { puts: p && typeof p.puts === "object" && p.puts ? p.puts : {}, dels: p && typeof p.dels === "object" && p.dels ? p.dels : {} };
}
export const savePending = (uid: string, p: Pending) => write(acctKey(uid, "pending"), p);

export const loadGuestPlans = () => validPlans(read<SavedPlan[]>(GUEST_PLANS_KEY, []));
export const loadLegacyPlans = () => validPlans(read<SavedPlan[]>(K.plans, []));

const byNewest = (a: SavedPlan, b: SavedPlan) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0);

/** 지금 보이는 '내 여행' (회원이면 그 계정 것만) */
export function loadPlans(): SavedPlan[] {
  const acct = currentAccount();
  if (acct) {
    if (!acct.uid) return []; // 계정 확인 전에는 아무것도 보이지 않게
    const pend = loadPending(acct.uid);
    const puts = Object.values(pend.puts).map((x) => x.plan);
    const ids = new Set(puts.map((p) => p.id));
    return validPlans([...puts, ...loadAccountCache(acct.uid).filter((p) => !ids.has(p.id) && !pend.dels[p.id])]).sort(byNewest);
  }
  const guest = loadGuestPlans();
  const ids = new Set(guest.map((p) => p.id));
  return [...guest, ...loadLegacyPlans().filter((p) => !ids.has(p.id))].sort(byNewest);
}

/** 계획 하나의 저장 상태: synced(계정에 저장됨) · waiting(동기화 대기) · failed(저장 실패) · local(비회원 기기 저장) */
export function planState(id: string): { state: PlanState; error?: string } {
  const acct = currentAccount();
  if (!acct?.uid) return { state: "local" };
  const pend = loadPending(acct.uid);
  const x = pend.puts[id];
  return x ? { state: x.state, error: x.error } : { state: "synced" };
}

/** 저장·삭제가 생기면 알림 → 로그인 회원은 계정에 올림(planSync) */
export const PLANS_CHANGED_EVENT = "tripflip:plans-changed";
const changed = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(PLANS_CHANGED_EVENT)); };

export function savePlan(p: SavedPlan): boolean {
  const acct = currentAccount();
  let ok: boolean;
  if (acct) {
    if (!acct.uid) return false;
    const pend = loadPending(acct.uid);
    pend.puts[p.id] = { plan: p, state: "waiting" };
    delete pend.dels[p.id];
    ok = savePending(acct.uid, pend);
  } else if (loadLegacyPlans().some((x) => x.id === p.id) && !loadGuestPlans().some((x) => x.id === p.id)) {
    ok = write(K.plans, [p, ...loadLegacyPlans().filter((x) => x.id !== p.id)]); // 예전 저장소 계획은 제자리에서 고침
  } else {
    ok = write(GUEST_PLANS_KEY, [p, ...loadGuestPlans().filter((x) => x.id !== p.id)]);
  }
  changed();
  return ok;
}

export function removePlan(id: string): boolean {
  const acct = currentAccount();
  let ok: boolean;
  if (acct) {
    if (!acct.uid) return false;
    const pend = loadPending(acct.uid);
    const onlyLocal = !!pend.puts[id] && !loadAccountCache(acct.uid).some((p) => p.id === id);
    delete pend.puts[id];
    if (!onlyLocal) pend.dels[id] = { state: "waiting" };
    ok = savePending(acct.uid, pend);
  } else {
    ok = write(GUEST_PLANS_KEY, loadGuestPlans().filter((x) => x.id !== id));
    if (loadLegacyPlans().some((x) => x.id === id)) ok = write(K.plans, loadLegacyPlans().filter((x) => x.id !== id)) && ok; // 사용자가 직접 지운 것만
  }
  changed();
  return ok;
}

/** 비회원으로 만든 여행을 지금 계정으로 옮김(사용자가 '옮기기'를 눌렀을 때만). 예전 공용 저장소 것은 대상 아님 */
export function moveGuestPlansToAccount(ids?: string[]): number {
  const acct = currentAccount();
  if (!acct?.uid) return 0;
  const guest = loadGuestPlans();
  const moving = guest.filter((p) => !ids || ids.includes(p.id));
  if (!moving.length) return 0;
  const pend = loadPending(acct.uid);
  for (const p of moving) { pend.puts[p.id] = { plan: p, state: "waiting" }; delete pend.dels[p.id]; }
  if (!savePending(acct.uid, pend)) return 0;
  write(GUEST_PLANS_KEY, guest.filter((p) => !moving.includes(p)));
  changed();
  return moving.length;
}

/** 저장된 계획(?plan=)이 있으면 그 조건을, 없으면 마지막 입력 조건을 쓴다 */
export function useFlowQuery(planId?: string | null) {
  const [q, setQ] = useState<RegionQuery | null>(null);
  useEffect(() => {
    const plan = planId ? loadPlans().find((p) => p.id === planId) : undefined;
    setQ(plan ? normalizeParty(plan.query) : loadQuery());
  }, [planId]);
  return q;
}

/** 예전 화면(/trips)에서 만든 계획. 변환·삭제하지 않고 목록에만 함께 보여준다. */
export interface LegacyTrip { id: string; title: string; createdAt: string; updatedAt?: string }
export function loadLegacyTrips(): LegacyTrip[] {
  const s = read<{ trips?: unknown } | null>("tripflip:v1", null);
  const trips = Array.isArray(s?.trips) ? s.trips : [];
  return trips.filter((t): t is LegacyTrip => !!t && typeof (t as LegacyTrip).id === "string")
    .map((t) => ({ id: t.id, title: typeof t.title === "string" ? t.title : "이전 형식 계획", createdAt: t.createdAt, updatedAt: t.updatedAt }));
}

/** 계획 파일(JSON) 검사. 통과하면 계획을, 아니면 이유를 돌려준다. 저장은 하지 않는다. */
export function parsePlanFile(text: string): { plan: SavedPlan } | { error: string } {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return { error: "JSON 파일이 아니에요." }; }
  const o = j as { format?: unknown; version?: unknown; plan?: SavedPlan };
  if (o?.format !== "tripflip-plan") return { error: "TripFlip 계획 파일이 아니에요." };
  if (o.version !== 2) return { error: `지원하지 않는 파일 버전이에요(${String(o.version)}).` };
  const p = o.plan;
  if (!p || typeof p.id !== "string" || typeof p.regionId !== "string" || !p.query || !Array.isArray(p.query.children) || !Array.isArray(p.query.subs)) return { error: "계획 내용이 비어 있거나 손상됐어요." };
  const dateError = travelDateError(p.query);
  if (dateError) return { error: `날짜가 올바르지 않아요: ${dateError}` };
  return { plan: { ...p, booked: { flight: !!p.booked?.flight, hotel: !!p.booked?.hotel } } };
}
