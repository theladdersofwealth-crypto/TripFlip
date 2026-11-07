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
export function loadPlans(): SavedPlan[] {
  const plans = read<SavedPlan[]>(K.plans, []);
  return Array.isArray(plans) ? plans.filter((p) => p && typeof p.id === "string" && p.query && Array.isArray(p.query.children) && Array.isArray(p.query.subs) && !travelDateError(p.query)) : [];
}
export const savePlan = (p: SavedPlan) => write(K.plans, [p, ...loadPlans().filter((x) => x.id !== p.id)]);
export const removePlan = (id: string) => write(K.plans, loadPlans().filter((x) => x.id !== id));

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
