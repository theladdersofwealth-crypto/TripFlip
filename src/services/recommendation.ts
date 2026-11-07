// =====================================================================
// 추천 엔진 (rule-based, 클라이언트 실행)
// - generateRecommendation: 조건 → TripRecommendation
// - 재최적화 함수들: 기존 사용자의 선택을 보존하고 영향을 받는 구간만 수정한다.
// 추후 AI 추천 API 로 교체할 때도 동일한 입출력(TripRecommendation / Trip)을 유지한다.
// =====================================================================
import type { Day, Intensity, ItineraryItem, Place, Restaurant, Trip, TripProfile, TripRecommendation, MealKind } from "@/lib/types";
import { getPlaces, getRestaurants } from "@/data/repository";
import { estimateTravel } from "./routing";
import { getDailyWeather, isRainy } from "./weather";
import { addDays, daysBetween, round5, toHHMM, toMin, uid } from "@/lib/time";
import { INTENSITY } from "@/lib/labels";

// ---------- 설정 ----------
const INTENSITY_CFG: Record<Intensity, { maxPlaces: number; budget: number; dayStart: number }> = {
  relaxed: { maxPlaces: 2, budget: 240, dayStart: 9 * 60 + 30 },
  normal: { maxPlaces: 3, budget: 360, dayStart: 9 * 60 },
  packed: { maxPlaces: 5, budget: 540, dayStart: 8 * 60 + 30 },
};
const MAX_CLUSTER_TRAVEL = 25; // 하루 동선에서 허용하는 지역 간 최대 이동(분)
const MIN_IDLE_WINDOW = 60; // 이 이상 비면 "빈 시간"으로 보고 추천 버튼 노출
const NAP_END = 15 * 60;
const MIN_NAP = 90;
const RANK: Record<Intensity, number> = { relaxed: 0, normal: 1, packed: 2 };
const LONG_STAY = 180; // 반나절 이상 장소

// ---------- 컨텍스트 ----------
interface Ctx {
  destinationId: string;
  profile: TripProfile;
  places: Place[];
  restaurants: Restaurant[];
  hotelZone: string | null;
  hasKids: boolean;
  youngestKid: number | null;
  hasYoungKid: boolean;
}

function makeCtx(destinationId: string, profile: TripProfile): Ctx {
  const ages = profile.conditions.party.childAges.slice(0, profile.conditions.party.children);
  const youngest = profile.conditions.party.children > 0 ? (ages.length ? Math.min(...ages) : 0) : null;
  return {
    destinationId,
    profile,
    places: getPlaces(destinationId),
    restaurants: getRestaurants(destinationId),
    hotelZone: profile.hotel.zoneId,
    hasKids: profile.conditions.party.children > 0,
    youngestKid: youngest,
    hasYoungKid: youngest !== null && youngest <= 3,
  };
}

const travel = (ctx: Ctx, from: string | null, to: string | null) =>
  estimateTravel(ctx.destinationId, from, to, ctx.profile.transport);

const travelMin = (ctx: Ctx, from: string | null, to: string | null) => travel(ctx, from, to).minutes ?? 20;

function itemZone(ctx: Ctx, item: ItineraryItem): string | null {
  if (item.type === "place") return ctx.places.find((p) => p.id === item.placeId)?.zoneId ?? null;
  if (item.type === "meal") return ctx.restaurants.find((r) => r.id === item.restaurantId)?.zoneId ?? null;
  if (item.type === "hotel" || item.type === "rest") return ctx.hotelZone;
  return null;
}

export function itemName(item: ItineraryItem, places: Place[], restaurants: Restaurant[]): string {
  if (item.type === "place") return places.find((p) => p.id === item.placeId)?.name ?? "방문지";
  if (item.type === "meal") return restaurants.find((r) => r.id === item.restaurantId)?.name ?? "식사";
  return item.title ?? "";
}

// ---------- 점수 ----------
export function placeScore(ctx: Ctx, p: Place, rainy = false): number {
  const prof = ctx.profile;
  if (prof.exclude.includes(p.id)) return -Infinity;
  const must = prof.mustVisit.includes(p.id);
  if (!must && ctx.youngestKid !== null && p.minKidAge !== null && ctx.youngestKid < p.minKidAge) return -Infinity;
  const prefs = prof.conditions.prefs;
  let s = (p.grade ?? 2) * 2 + p.prefs.filter((x) => prefs.includes(x)).length * 3;
  if (ctx.hasKids) {
    s += ((p.kidScore ?? 2) - 3) * 2.5;
    s -= ((p.fatigue ?? 3) - 2) * (ctx.hasYoungKid ? 2 : 1);
    if (prof.conditions.stroller && p.stroller === false) s -= 4;
  }
  if (prof.conditions.intensity === "relaxed") s -= (p.fatigue ?? 3) - 2;
  if ((p.grade ?? 0) >= 5) s += 4; // 대표 장소
  if (rainy) s += p.indoor === "indoor" || p.rainOk === true ? 6 : p.indoor === "outdoor" ? -8 : 0;
  if (must) s += 100;
  return s;
}

function restaurantScore(ctx: Ctx, r: Restaurant, kind: MealKind, fromZone: string | null, used: Set<string>): number {
  if (!r.mealTypes.includes(kind)) return -Infinity;
  let s = 0;
  if (ctx.hasKids) {
    s += r.kidsChair === true ? 4 : r.kidsChair === false ? -6 : 0;
    s += r.kidsMenu === true ? 2 : 0;
    s += r.spicy === "mild" ? 3 : r.spicy === "hot" ? -6 : 0;
    s += r.aircon === true ? 1 : 0;
  }
  const people = ctx.profile.conditions.party.adults + ctx.profile.conditions.party.children;
  if (people >= 6) s += r.seats6 === true ? 3 : r.seats6 === false ? -8 : 0;
  if (used.has(r.id)) s -= 12; // 같은 식당 반복 지양
  s -= travelMin(ctx, fromZone, r.zoneId) * 0.6;
  return s;
}

function pickRestaurant(ctx: Ctx, kind: MealKind, fromZone: string | null, used: Set<string>, exclude: string[] = []): Restaurant | null {
  const list = ctx.restaurants
    .filter((r) => !exclude.includes(r.id))
    .map((r) => ({ r, s: restaurantScore(ctx, r, kind, fromZone, used) }))
    .filter((x) => x.s > -Infinity)
    .sort((a, b) => b.s - a.s);
  return list[0]?.r ?? null;
}

function mealReason(ctx: Ctx, r: Restaurant): string {
  const bits: string[] = [];
  if (ctx.hasKids && r.kidsChair) bits.push("아기의자");
  if (ctx.hasKids && r.spicy === "mild") bits.push("맵지 않은 메뉴");
  const people = ctx.profile.conditions.party.adults + ctx.profile.conditions.party.children;
  if (people >= 6 && r.seats6) bits.push(`${people}인 착석`);
  return bits.length ? `동선 근처 · ${bits.join(" · ")}` : "동선 근처 식당";
}

function placeReason(ctx: Ctx, p: Place, from: string | null): string {
  const bits: string[] = [];
  const t = travel(ctx, from, p.zoneId).minutes;
  if (t !== null && t <= 15) bits.push("이전 일정과 가까움");
  const prefs = ctx.profile.conditions.prefs;
  const matched = p.prefs.filter((x) => prefs.includes(x));
  if (matched.length) bits.push("취향 일치");
  if (ctx.hasKids && (p.kidScore ?? 0) >= 4) bits.push("아이 적합");
  if (ctx.profile.mustVisit.includes(p.id)) bits.unshift("반드시 방문");
  return bits.length ? bits.join(" · ") : p.reason;
}

// ---------- 일정 생성 ----------
type DayKind = "first" | "last" | "full" | "single";

interface DayPlan {
  kind: DayKind;
  date: string;
  maxPlaces: number;
  budget: number;
  places: Place[];
  zone: string | null;
  used: number;
}

function capsFor(ctx: Ctx, kind: DayKind) {
  const cfg = INTENSITY_CFG[ctx.profile.conditions.intensity];
  const kidFactor = ctx.hasYoungKid ? 0.85 : 1;
  const half = kind === "first" || kind === "last";
  return {
    maxPlaces: half ? Math.max(1, Math.ceil(cfg.maxPlaces / 2)) : cfg.maxPlaces,
    budget: Math.round(cfg.budget * kidFactor * (half ? 0.5 : 1)),
  };
}

function distributePlaces(ctx: Ctx, plans: DayPlan[], rainyDays: Set<number>) {
  const pool = ctx.places
    .map((p) => ({ p, s: placeScore(ctx, p) }))
    .filter((x) => x.s > -Infinity)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);

  const take = (p: Place) => pool.splice(pool.indexOf(p), 1);
  const add = (plan: DayPlan, p: Place) => {
    plan.places.push(p);
    plan.used += p.stayMinutes;
    plan.zone = plan.zone ?? p.zoneId;
    take(p);
  };
  const fits = (plan: DayPlan, p: Place) => plan.places.length < plan.maxPlaces && plan.used + p.stayMinutes <= plan.budget;
  // 테마파크처럼 긴 장소는 온전한 날의 유일한 핵심 일정이면 예산을 조금 넘어도 허용
  const fitsAnchor = (plan: DayPlan, p: Place) =>
    fits(plan, p) || (plan.places.length === 0 && (plan.kind === "full" || plan.kind === "single") && p.stayMinutes <= plan.budget * 1.5);

  // 1) 앵커 배정: 반나절(첫날/마지막날)보다 온전한 날을 먼저. 반나절은 숙소 근처만.
  const order = plans.map((_, i) => i).sort((a, b) => Number(plans[a].kind === "full" || plans[a].kind === "single") > Number(plans[b].kind === "full" || plans[b].kind === "single") ? -1 : 1);
  for (const i of order) {
    const plan = plans[i];
    const half = plan.kind === "first" || plan.kind === "last";
    const anchor = pool.find(
      (p) =>
        fitsAnchor(plan, p) &&
        p.bestTime !== "evening" &&
        (!half || travelMin(ctx, ctx.hotelZone, p.zoneId) <= MAX_CLUSTER_TRAVEL) &&
        (!rainyDays.has(i) || p.indoor !== "outdoor"),
    );
    if (anchor) add(plan, anchor);
  }

  // 2) 라운드로빈 채우기: 하루에 몰아넣지 않도록 하루씩 번갈아 1개씩 추가
  let added = true;
  while (added) {
    added = false;
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const cand = pool
        .filter((p) => fits(plan, p) && travelMin(ctx, plan.zone ?? ctx.hotelZone, p.zoneId) <= MAX_CLUSTER_TRAVEL)
        .filter((p) => p.bestTime !== "evening" || plan.kind !== "last")
        .map((p) => ({ p, s: placeScore(ctx, p, rainyDays.has(i)) - travelMin(ctx, plan.zone ?? ctx.hotelZone, p.zoneId) * 0.4 }))
        .sort((a, b) => b.s - a.s)[0];
      if (cand) {
        add(plan, cand.p);
        added = true;
      }
    }
  }
}

interface BuildInput {
  dayNumber: number;
  date: string;
  kind: DayKind;
  places: Place[];
  usedRestaurants: Set<string>;
}

function buildDay(ctx: Ctx, input: BuildInput): Day {
  const prof = ctx.profile;
  const cfg = INTENSITY_CFG[prof.conditions.intensity];
  const items: ItineraryItem[] = [];
  const [L1, L2] = prof.meals.lunch.map(toMin);
  const [D1, D2] = prof.meals.dinner.map(toMin);
  const hotelName = prof.hotel.name || "숙소";
  const push = (it: Omit<ItineraryItem, "id" | "travelMinutes" | "travelEstimated" | "confidence"> & Partial<ItineraryItem>) =>
    items.push({ id: uid("it"), travelMinutes: null, travelEstimated: true, confidence: "DEMO", ...it });

  let cursor = cfg.dayStart;
  let zone = ctx.hotelZone;
  let includeLunch = true;
  let includeDinner = true;
  let endLimit = 21 * 60;

  if (input.kind === "first") {
    const ci = toMin(prof.checkIn);
    push({ type: "hotel", title: `${hotelName} 체크인`, restKind: "checkin", startTime: toHHMM(ci), endTime: toHHMM(ci + 30), reason: "체크인 후 짐 정리" });
    cursor = ci + 30;
    includeLunch = L1 >= cursor;
  } else if (input.kind === "last") {
    const co = toMin(prof.checkOut);
    if (co - cfg.dayStart >= 60) {
      push({ type: "rest", title: "조식 · 숙소 자유시간", restKind: "free", startTime: toHHMM(cfg.dayStart), endTime: toHHMM(co - 15), reason: "마지막 날 오전은 체크아웃 준비" });
    }
    push({ type: "hotel", title: `${hotelName} 체크아웃`, restKind: "checkout", startTime: toHHMM(Math.max(co - 15, cfg.dayStart)), endTime: toHHMM(co + 15), reason: "짐 보관 여부는 숙소에 확인 필요" });
    cursor = co + 15;
    includeDinner = false;
    endLimit = 16 * 60;
    includeLunch = L2 > cursor;
  } else {
    push({ type: "hotel", title: `${hotelName} 출발`, startTime: toHHMM(cursor), endTime: toHHMM(cursor), reason: "" });
  }

  const evening = input.places.filter((p) => p.bestTime === "evening");
  const queue = input.places.filter((p) => p.bestTime !== "evening");
  const morningOrder = (p: Place) => (p.bestTime === "morning" ? 0 : p.bestTime === "any" ? 1 : 2);

  const fillPhase = (limit: number, phase: "am" | "pm") => {
    while (queue.length) {
      const reserve = 15; // 다음 식사 장소 이동 여유
      const options = queue
        .map((p) => ({ p, t: travelMin(ctx, zone, p.zoneId) }))
        .filter(({ p, t }) => cursor + t + p.stayMinutes + reserve <= limit)
        .sort((a, b) => (phase === "am" ? morningOrder(a.p) - morningOrder(b.p) : morningOrder(b.p) - morningOrder(a.p)) || a.t - b.t);
      const next = options[0];
      if (!next) break;
      const start = round5(cursor + next.t);
      push({ type: "place", placeId: next.p.id, startTime: toHHMM(start), endTime: toHHMM(start + next.p.stayMinutes), reason: placeReason(ctx, next.p, zone) + (phase === "pm" ? napNote : ""), locked: prof.mustVisit.includes(next.p.id) || undefined });
      cursor = start + next.p.stayMinutes;
      zone = next.p.zoneId;
      queue.splice(queue.indexOf(next.p), 1);
    }
  };

  const addMeal = (kind: MealKind, s: number, e: number) => {
    const r = pickRestaurant(ctx, kind, zone, input.usedRestaurants);
    if (!r) return;
    const t = travelMin(ctx, zone, r.zoneId);
    const start = round5(Math.max(s, cursor + t));
    push({ type: "meal", restaurantId: r.id, mealKind: kind, startTime: toHHMM(start), endTime: toHHMM(start + (e - s)), reason: mealReason(ctx, r) });
    input.usedRestaurants.add(r.id);
    cursor = start + (e - s);
    zone = r.zoneId;
  };

  // 반나절 이상 걸리는 장소(테마파크 등): 점심을 그 안에서 해결하고 오전/오후로 나눠 표시
  let longDay = false;
  let napNote = "";
  const long = queue.find((p) => p.stayMinutes >= LONG_STAY);
  if (long && includeLunch && (input.kind === "full" || input.kind === "single")) {
    queue.splice(queue.indexOf(long), 1);
    const t = travelMin(ctx, zone, long.zoneId);
    const start = round5(cursor + t);
    const lunchR = pickRestaurant(ctx, "lunch", long.zoneId, input.usedRestaurants);
    const inner = lunchR ? travelMin(ctx, long.zoneId, lunchR.zoneId) : 0;
    const p1End = Math.max(start + 60, L1 - (inner > 10 ? inner : 0));
    const lunchDur = L2 - L1;
    push({ type: "place", placeId: long.id, startTime: toHHMM(start), endTime: toHHMM(p1End), reason: placeReason(ctx, long, zone) + " · 오전", locked: prof.mustVisit.includes(long.id) || undefined });
    cursor = p1End;
    zone = long.zoneId;
    if (lunchR) {
      const ls = Math.max(L1, cursor);
      push({ type: "meal", restaurantId: lunchR.id, mealKind: "lunch", startTime: toHHMM(ls), endTime: toHHMM(ls + lunchDur), reason: "방문지 안·근처에서 점심 · " + mealReason(ctx, lunchR) });
      input.usedRestaurants.add(lunchR.id);
      cursor = ls + lunchDur;
      zone = lunchR.zoneId;
    }
    const remain = long.stayMinutes - (p1End - start);
    const p2Start = round5(cursor + (lunchR ? travelMin(ctx, zone, long.zoneId) : 0));
    const p2End = Math.min(p2Start + Math.max(remain, 60), D1 - travelMin(ctx, long.zoneId, ctx.hotelZone) - 10);
    push({ type: "place", placeId: long.id, startTime: toHHMM(p2Start), endTime: toHHMM(p2End), reason: "오후 이어서 · 아이 컨디션에 따라 일찍 마무리 가능", locked: prof.mustVisit.includes(long.id) || undefined });
    cursor = p2End;
    zone = long.zoneId;
    includeLunch = false;
    longDay = true;
  }

  // 오전
  if (!longDay) fillPhase(includeLunch ? L1 : includeDinner ? D1 : endLimit, "am");
  if (includeLunch) addMeal("lunch", L1, L2);

  // 어린 아이: 낮잠·숙소 휴식 (알차게 모드는 생략)
  // 낮잠 때문에 오후 핵심 장소가 통째로 빠지면 낮잠 블록을 생략(유모차·현장 휴식)
  const napBlocks = queue.some((p) => {
    const t = travelMin(ctx, zone, p.zoneId);
    return cursor + t + p.stayMinutes + 15 <= D1 && NAP_END + 2 * t + p.stayMinutes + 15 > D1 && p.stayMinutes >= 120;
  });
  if (ctx.hasYoungKid && napBlocks) napNote = " · 이 날 낮잠은 이동 중·현장 휴식으로";
  if (ctx.hasYoungKid && !napBlocks && !longDay && prof.conditions.intensity !== "packed" && includeDinner && input.kind !== "first") {
    const t = travelMin(ctx, zone, ctx.hotelZone);
    const s = round5(cursor + t);
    const e = Math.max(s + MIN_NAP, NAP_END);
    push({ type: "rest", title: "숙소 휴식 · 아이 낮잠", restKind: "nap", startTime: toHHMM(s), endTime: toHHMM(e), reason: `${ctx.youngestKid}세 아이 낮잠 시간 확보` });
    cursor = e;
    zone = ctx.hotelZone;
  }

  // 오후
  const pmLimit = includeDinner ? D1 : endLimit;
  fillPhase(pmLimit, "pm");

  // 오후가 크게 비면 한 번만 자유시간 (휴식으로 하루를 도배하지 않는다)
  const idle = pmLimit - cursor - travelMin(ctx, zone, ctx.hotelZone);
  const relaxy = prof.conditions.prefs.includes("relax") || ctx.hasKids;
  if (idle >= 120 && relaxy && input.kind !== "last") {
    const t = travelMin(ctx, zone, ctx.hotelZone);
    const s = round5(cursor + t);
    const e = Math.min(s + 120, pmLimit - 30);
    if (e - s >= 60) {
      push({ type: "rest", title: "숙소 수영장 · 자유시간", restKind: "free", startTime: toHHMM(s), endTime: toHHMM(e), reason: "휴양 취향 · 오후 여유" });
      cursor = e;
      zone = ctx.hotelZone;
    }
  }

  if (includeDinner) {
    addMeal("dinner", D1, D2);
    // 저녁 이후 일정 (야시장 등)
    for (const p of evening) {
      const t = travelMin(ctx, zone, p.zoneId);
      if (cursor + t + p.stayMinutes > endLimit) continue;
      const start = round5(cursor + t);
      push({ type: "place", placeId: p.id, startTime: toHHMM(start), endTime: toHHMM(start + p.stayMinutes), reason: placeReason(ctx, p, zone) });
      cursor = start + p.stayMinutes;
      zone = p.zoneId;
    }
  }

  const back = round5(cursor + travelMin(ctx, zone, ctx.hotelZone));
  push({
    type: "hotel",
    title: input.kind === "last" ? "여행 종료 · 공항 이동은 항공편 시간에 맞춰 확인" : `${hotelName} 복귀`,
    restKind: "return",
    startTime: toHHMM(back),
    endTime: toHHMM(back),
    reason: "",
  });

  const day: Day = {
    dayNumber: input.dayNumber,
    date: input.date,
    weather: getDailyWeather(ctx.destinationId, input.date),
    items,
  };
  return applyBooked(ctx, finalizeDay(ctx, day));
}

/** 사용자가 이미 예약한 일정을 해당 날짜에 넣고, 겹치는 비고정 일정만 비운다. */
function applyBooked(ctx: Ctx, day: Day): Day {
  const booked = ctx.profile.booked.filter((b) => b.date === day.date);
  if (!booked.length) return day;
  let items = [...day.items];
  for (const b of booked) {
    const s = toMin(b.start);
    const e = toMin(b.end);
    items = items.filter((it) => it.locked || it.type === "hotel" || toMin(it.endTime) <= s || toMin(it.startTime) >= e);
    items.push({ id: uid("it"), type: "booked", title: b.title, startTime: b.start, endTime: b.end, travelMinutes: null, travelEstimated: true, reason: "사용자가 예약한 일정", confidence: "USER", locked: true });
  }
  return finalizeDay(ctx, { ...day, items });
}

function finalizeDay(ctx: Ctx, day: Day): Day {
  const items = [...day.items].sort((a, b) => toMin(a.startTime) - toMin(b.startTime) || toMin(a.endTime) - toMin(b.endTime));
  let prevZone: string | null = null;
  const out = items.map((it, i) => {
    if (it.type === "gap") return { ...it, travelMinutes: null };
    const z = itemZone(ctx, it);
    if (i === 0 || it.type === "booked") {
      prevZone = z;
      return { ...it, travelMinutes: null };
    }
    const t = prevZone && z ? travel(ctx, prevZone, z) : { minutes: null, estimated: true };
    prevZone = z ?? prevZone;
    // 같은 숙소 안에서의 이동(숙소→숙소)은 0
    const sameHotel = (it.type === "hotel" || it.type === "rest") && items[i - 1] && (items[i - 1].type === "hotel" || items[i - 1].type === "rest");
    return { ...it, travelMinutes: sameHotel ? 0 : t.minutes, travelEstimated: t.estimated };
  });
  return { ...day, items: out };
}

export function generateRecommendation(destinationId: string, profile: TripProfile): TripRecommendation {
  const ctx = makeCtx(destinationId, profile);
  const { startDate, endDate } = profile.conditions;
  const n = Math.max(1, daysBetween(startDate, endDate) + 1);
  const plans: DayPlan[] = Array.from({ length: n }, (_, i) => {
    const kind: DayKind = n === 1 ? "single" : i === 0 ? "first" : i === n - 1 ? "last" : "full";
    return { kind, date: addDays(startDate, i), ...capsFor(ctx, kind), places: [], zone: null, used: 0 };
  });
  const rainy = new Set(plans.map((p, i) => (isRainy(getDailyWeather(destinationId, p.date)) ? i : -1)).filter((i) => i >= 0));
  distributePlaces(ctx, plans, rainy);
  const usedRestaurants = new Set<string>();
  const days = plans.map((p, i) => buildDay(ctx, { dayNumber: i + 1, date: p.date, kind: p.kind, places: p.places, usedRestaurants }));
  return { destination: destinationId, dates: { start: startDate, end: endDate }, profile, days };
}

// =====================================================================
// 검증
// =====================================================================
export interface DayWarning {
  level: "info" | "warn";
  text: string;
}

export function validateDay(trip: Trip, day: Day): DayWarning[] {
  const ctx = makeCtx(trip.destination, trip.profile);
  const w: DayWarning[] = [];
  const items = day.items.filter((i) => i.type !== "gap");
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    if (toMin(prev.endTime) + (cur.travelMinutes ?? 0) > toMin(cur.startTime) + 5) {
      w.push({ level: "warn", text: `${itemName(cur, ctx.places, ctx.restaurants)}: 이전 일정과 시간이 겹치거나 이동시간이 부족해요` });
    }
  }
  const unknownHours = day.items.filter((i) => i.type === "place" && !ctx.places.find((p) => p.id === i.placeId)?.hours).length;
  if (unknownHours) w.push({ level: "info", text: `운영시간 미확인 장소 ${unknownHours}곳 · 방문 전 확인 필요` });
  if (ctx.hasKids) {
    const fatigue = day.items.reduce((s, i) => s + (i.type === "place" ? ctx.places.find((p) => p.id === i.placeId)?.fatigue ?? 0 : 0), 0);
    if (fatigue >= 9) w.push({ level: "warn", text: "아이에게 체력 소모가 큰 하루예요. ‘오늘 가볍게’를 고려해 보세요" });
  }
  return w;
}

// =====================================================================
// 재최적화
// =====================================================================
export interface Candidate {
  kind: "place" | "meal" | "rest";
  placeId?: string;
  restaurantId?: string;
  title: string;
  start: number;
  end: number;
  travelIn: number | null;
  reason: string;
}

const usedPlaceIds = (trip: Trip) => new Set(trip.days.flatMap((d) => d.items.filter((i) => i.type === "place").map((i) => i.placeId!)));
const usedRestaurantIds = (trip: Trip) => new Set(trip.days.flatMap((d) => d.items.filter((i) => i.type === "meal").map((i) => i.restaurantId!)));

function neighbours(ctx: Ctx, day: Day, index: number) {
  let prev: ItineraryItem | null = null;
  let next: ItineraryItem | null = null;
  for (let i = index - 1; i >= 0; i--) if (day.items[i].type !== "gap") { prev = day.items[i]; break; }
  for (let i = index + 1; i < day.items.length; i++) if (day.items[i].type !== "gap") { next = day.items[i]; break; }
  return {
    prevZone: prev ? itemZone(ctx, prev) : ctx.hotelZone,
    nextZone: next ? itemZone(ctx, next) : ctx.hotelZone,
    windowStart: prev ? toMin(prev.endTime) : INTENSITY_CFG[ctx.profile.conditions.intensity].dayStart,
    windowEnd: next ? toMin(next.startTime) : 21 * 60,
  };
}

/** 주어진 시간 창에 들어갈 후보를 추천한다. 하루 전체가 아니라 해당 시간대만 본다. */
export function suggestForWindow(
  trip: Trip,
  dayIndex: number,
  win: { start: number; end: number; prevZone: string | null; nextZone: string | null },
  kind: "place" | "meal",
  mealKind?: MealKind,
  excludeIds: string[] = [],
): Candidate[] {
  const ctx = makeCtx(trip.destination, trip.profile);
  const day = trip.days[dayIndex];
  const rainy = isRainy(day.weather);
  const span = win.end - win.start;

  if (kind === "meal" && mealKind) {
    const used = usedRestaurantIds(trip);
    return ctx.restaurants
      .filter((r) => !excludeIds.includes(r.id))
      .map((r) => ({ r, s: restaurantScore(ctx, r, mealKind, win.prevZone, used) }))
      .filter((x) => x.s > -Infinity)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map(({ r }) => {
        const t = travelMin(ctx, win.prevZone, r.zoneId);
        const start = round5(Math.max(win.start + t, toMin(trip.profile.meals[mealKind][0])));
        const dur = toMin(trip.profile.meals[mealKind][1]) - toMin(trip.profile.meals[mealKind][0]);
        return { kind: "meal" as const, restaurantId: r.id, title: r.name, start, end: Math.min(start + dur, win.end), travelIn: t, reason: mealReason(ctx, r) };
      });
  }

  const used = usedPlaceIds(trip);
  const out: Candidate[] = ctx.places
    .filter((p) => !used.has(p.id) && !excludeIds.includes(p.id))
    .map((p) => {
      const tin = travelMin(ctx, win.prevZone, p.zoneId);
      const tout = travelMin(ctx, p.zoneId, win.nextZone);
      // 체류시간이 창보다 길면 최대 25%까지 줄여서 맞춘다
      const room = span - tin - tout;
      const stay = p.stayMinutes <= room ? p.stayMinutes : room >= p.stayMinutes * 0.75 ? round5(room) : -1;
      const evening = p.bestTime === "evening";
      const eveningOk = !evening || win.start >= 17 * 60;
      return { p, tin, tout, stay, s: placeScore(ctx, p, rainy) - (tin + tout) * 0.3, eveningOk };
    })
    .filter((x) => x.s > -Infinity && x.stay > 0 && x.eveningOk)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map(({ p, tin, stay }) => {
      const start = round5(win.start + tin);
      const reasonBits = [`이전 일정에서 ${tin}분(추정)`, `빈 ${span}분에 맞춤`];
      if (ctx.hasKids && (p.kidScore ?? 0) >= 4) reasonBits.push("아이 적합");
      if (rainy && (p.indoor === "indoor" || p.rainOk)) reasonBits.push("우천 가능");
      return { kind: "place" as const, placeId: p.id, title: p.name, start, end: start + stay, travelIn: tin, reason: reasonBits.join(" · ") };
    });

  if (span >= 60) {
    out.push({ kind: "rest", title: "숙소 휴식", start: win.start + travelMin(ctx, win.prevZone, ctx.hotelZone), end: win.end - travelMin(ctx, ctx.hotelZone, win.nextZone), travelIn: null, reason: "적당한 장소 대신 쉬어가기" });
  }
  return out.filter((c) => c.end - c.start >= 30);
}

function candidateToItem(c: Candidate, ctxReasonPrefix = ""): ItineraryItem {
  return {
    id: uid("it"),
    type: c.kind === "rest" ? "rest" : c.kind,
    placeId: c.placeId,
    restaurantId: c.restaurantId,
    mealKind: undefined,
    title: c.kind === "rest" ? c.title : undefined,
    restKind: c.kind === "rest" ? "free" : undefined,
    startTime: toHHMM(c.start),
    endTime: toHHMM(c.end),
    travelMinutes: c.travelIn,
    travelEstimated: true,
    reason: ctxReasonPrefix + c.reason,
    confidence: "DEMO",
  };
}

function withDay(trip: Trip, dayIndex: number, fn: (ctx: Ctx, day: Day) => Day): Trip {
  const ctx = makeCtx(trip.destination, trip.profile);
  const days = trip.days.map((d, i) => (i === dayIndex ? finalizeDay(ctx, fn(ctx, d)) : d));
  return { ...trip, days, updatedAt: new Date().toISOString() };
}

/** 일정 삭제 → 같은 시간대를 '빈 시간'으로 남긴다 (다른 일정은 그대로) */
export function deleteItem(trip: Trip, dayIndex: number, itemId: string): Trip {
  const ctx = makeCtx(trip.destination, trip.profile);
  return withDay(trip, dayIndex, (_, day) => ({
    ...day,
    items: day.items.map((it) =>
      it.id === itemId
        ? { id: uid("gap"), type: "gap", startTime: it.startTime, endTime: it.endTime, travelMinutes: null, travelEstimated: true, reason: "", confidence: "DEMO", mealKind: it.mealKind, gapOf: itemName(it, ctx.places, ctx.restaurants), gapRef: it.placeId ?? it.restaurantId }
        : it,
    ),
  }));
}

export function gapWindow(trip: Trip, dayIndex: number, itemId: string) {
  const ctx = makeCtx(trip.destination, trip.profile);
  const day = trip.days[dayIndex];
  const idx = day.items.findIndex((i) => i.id === itemId);
  const n = neighbours(ctx, day, idx);
  return { start: n.windowStart, end: n.windowEnd, prevZone: n.prevZone, nextZone: n.nextZone };
}

const isMovable = (it: ItineraryItem) => it.type === "place" && !it.locked && !it.favorite;

/**
 * 빈 시간 바로 뒤의 방문지들을 뒤로 밀 수 있으면(다음 고정 일정 — 식사·숙소·예약 — 전까지 여유가 있으면)
 * 그 여유까지 포함한 창을 돌려준다. 뒤 일정은 삭제·교체하지 않고 시간만 민다.
 */
export function flexibleGapWindow(trip: Trip, dayIndex: number, itemId: string) {
  const ctx = makeCtx(trip.destination, trip.profile);
  const day = trip.days[dayIndex];
  const idx = day.items.findIndex((i) => i.id === itemId);
  const base = gapWindow(trip, dayIndex, itemId);
  let j = idx + 1;
  let need = 0;
  let zone: string | null = null;
  while (j < day.items.length && isMovable(day.items[j])) {
    const it = day.items[j];
    const z = itemZone(ctx, it);
    need += toMin(it.endTime) - toMin(it.startTime) + (zone ? travelMin(ctx, zone, z) : 0);
    zone = z;
    j++;
  }
  if (j === idx + 1) return base;
  const anchor = day.items[j];
  const anchorStart = anchor ? toMin(anchor.startTime) - (anchor.travelMinutes ?? 15) : 21 * 60;
  const end = anchorStart - need;
  return end > base.end ? { ...base, end } : base;
}

/** 교체/삽입 후 겹치는 뒤 방문지들을 순서대로 뒤로 민다 */
function repack(ctx: Ctx, day: Day): Day {
  const items = [...day.items].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  for (let i = 1; i < items.length; i++) {
    const cur = items[i];
    if (!isMovable(cur)) continue;
    const prev = items[i - 1];
    const earliest = round5(toMin(prev.endTime) + travelMin(ctx, itemZone(ctx, prev), itemZone(ctx, cur)));
    if (earliest > toMin(cur.startTime)) {
      const dur = toMin(cur.endTime) - toMin(cur.startTime);
      items[i] = { ...cur, startTime: toHHMM(earliest), endTime: toHHMM(earliest + dur) };
    }
  }
  return { ...day, items };
}

/** 빈 시간(삭제된 자리) 후보 */
export function suggestForGap(trip: Trip, dayIndex: number, gapId: string): Candidate[] {
  const gap = trip.days[dayIndex].items.find((i) => i.id === gapId)!;
  const win = gap.mealKind ? gapWindow(trip, dayIndex, gapId) : flexibleGapWindow(trip, dayIndex, gapId);
  return suggestForWindow(trip, dayIndex, win, gap.mealKind ? "meal" : "place", gap.mealKind, gap.gapRef ? [gap.gapRef] : []);
}

/** 기존 항목을 다른 장소로 바꿀 후보 */
export function alternativesFor(trip: Trip, dayIndex: number, itemId: string): Candidate[] {
  const item = trip.days[dayIndex].items.find((i) => i.id === itemId)!;
  const win = item.type === "meal" ? gapWindow(trip, dayIndex, itemId) : flexibleGapWindow(trip, dayIndex, itemId);
  if (item.type === "meal") return suggestForWindow(trip, dayIndex, win, "meal", item.mealKind, [item.restaurantId!]);
  return suggestForWindow(trip, dayIndex, win, "place", undefined, [item.placeId!]).filter((c) => c.kind !== "rest");
}

/** 특정 항목(빈 시간 포함)을 후보로 교체 */
export function replaceWithCandidate(trip: Trip, dayIndex: number, itemId: string, c: Candidate): Trip {
  return withDay(trip, dayIndex, (ctx, day) =>
    repack(ctx, {
      ...day,
      items: day.items.map((it) => (it.id === itemId ? { ...candidateToItem(c), mealKind: it.mealKind, favorite: false } : it)),
    }),
  );
}

/** 일정 사이 여유 시간 (60분 이상) */
export function idleWindows(trip: Trip, dayIndex: number): { afterId: string; start: number; end: number; prevZone: string | null; nextZone: string | null }[] {
  const ctx = makeCtx(trip.destination, trip.profile);
  const day = trip.days[dayIndex];
  const out = [];
  for (let i = 0; i < day.items.length - 1; i++) {
    const a = day.items[i];
    const b = day.items[i + 1];
    if (a.type === "gap" || b.type === "gap") continue;
    const s = toMin(a.endTime);
    const e = toMin(b.startTime);
    if (e - s - (b.travelMinutes ?? 0) >= MIN_IDLE_WINDOW) out.push({ afterId: a.id, start: s, end: e, prevZone: itemZone(ctx, a), nextZone: itemZone(ctx, b) });
  }
  return out;
}

export function insertCandidate(trip: Trip, dayIndex: number, c: Candidate): Trip {
  return withDay(trip, dayIndex, (_, day) => ({ ...day, items: [...day.items, candidateToItem(c)] }));
}

/** 시간 변경 */
export function changeTime(trip: Trip, dayIndex: number, itemId: string, start: string, end: string): Trip {
  return withDay(trip, dayIndex, (_, day) => ({
    ...day,
    items: day.items.map((it) => (it.id === itemId ? { ...it, startTime: start, endTime: end, confidence: "USER" as const } : it)),
  }));
}

/** 순서 변경: 인접한 방문지끼리 자리를 바꾸고 시간을 다시 계산한다 */
export function moveItem(trip: Trip, dayIndex: number, itemId: string, dir: -1 | 1): { trip: Trip; message: string } {
  const ctx = makeCtx(trip.destination, trip.profile);
  const day = trip.days[dayIndex];
  const idx = day.items.findIndex((i) => i.id === itemId);
  const j = idx + dir;
  const other = day.items[j];
  if (!other || other.type !== "place" || day.items[idx].type !== "place") {
    return { trip, message: "식사·휴식·숙소 일정과는 순서를 바꿀 수 없어요. 인접한 방문지끼리만 바꿀 수 있어요." };
  }
  const [a, b] = dir === 1 ? [day.items[idx], other] : [other, day.items[idx]];
  const dur = (x: ItineraryItem) => toMin(x.endTime) - toMin(x.startTime);
  const aZone = itemZone(ctx, a);
  const bZone = itemZone(ctx, b);
  const prevIdx = Math.min(idx, j) - 1;
  const prev = day.items[prevIdx];
  const start1 = prev ? round5(toMin(prev.endTime) + travelMin(ctx, prev ? itemZone(ctx, prev) : ctx.hotelZone, bZone)) : toMin(a.startTime);
  const end1 = start1 + dur(b);
  const start2 = round5(end1 + travelMin(ctx, bZone, aZone));
  const end2 = start2 + dur(a);
  const nextItem = day.items[Math.max(idx, j) + 1];
  const overflow = nextItem ? end2 > toMin(nextItem.startTime) : false;
  const next = withDay(trip, dayIndex, (_, d) => ({
    ...d,
    items: d.items.map((it) =>
      it.id === b.id ? { ...it, startTime: toHHMM(start1), endTime: toHHMM(end1) } : it.id === a.id ? { ...it, startTime: toHHMM(start2), endTime: toHHMM(end2) } : it,
    ),
  }));
  return { trip: next, message: overflow ? "순서를 바꿨어요. 다음 일정과 시간이 겹치니 시간을 확인해 주세요." : "순서를 바꾸고 이동시간을 다시 계산했어요." };
}

export function toggleFavorite(trip: Trip, dayIndex: number, itemId: string): Trip {
  const item = trip.days[dayIndex].items.find((i) => i.id === itemId);
  const ref = item?.placeId ?? item?.restaurantId;
  const fav = !item?.favorite;
  const favorites = ref ? (fav ? Array.from(new Set([...trip.favorites, ref])) : trip.favorites.filter((f) => f !== ref)) : trip.favorites;
  return { ...withDay(trip, dayIndex, (_, d) => ({ ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, favorite: fav } : it)) })), favorites };
}

export function toggleFavoriteRef(trip: Trip, ref: string): Trip {
  const on = !trip.favorites.includes(ref);
  return {
    ...trip,
    favorites: on ? [...trip.favorites, ref] : trip.favorites.filter((f) => f !== ref),
    days: trip.days.map((d) => ({ ...d, items: d.items.map((it) => (it.placeId === ref || it.restaurantId === ref ? { ...it, favorite: on } : it)) })),
    updatedAt: new Date().toISOString(),
  };
}

const isCore = (trip: Trip, it: ItineraryItem) => it.favorite || it.locked || trip.profile.mustVisit.includes(it.placeId ?? "");

function lowestNonCorePlace(ctx: Ctx, trip: Trip, day: Day, filter: (it: ItineraryItem) => boolean = () => true) {
  return day.items
    .filter((it) => it.type === "place" && !isCore(trip, it) && filter(it))
    .map((it) => ({ it, s: placeScore(ctx, ctx.places.find((p) => p.id === it.placeId)!) }))
    .sort((a, b) => a.s - b.s)[0]?.it;
}

function toRest(it: ItineraryItem, title: string, reason: string): ItineraryItem {
  return { ...it, type: "rest", placeId: undefined, title, restKind: "free", reason, confidence: "DEMO", favorite: false };
}

/** 방문지를 빼고 휴식으로 바꾼다. 하루 첫 일정이면 휴식 대신 출발 시간을 늦춘다. */
function dropPlace(ctx: Ctx, day: Day, victimId: string, title: string, reason: string): Day {
  const idx = day.items.findIndex((i) => i.id === victimId);
  const prev = day.items[idx - 1];
  const next = day.items[idx + 1];
  if (prev && prev.type === "hotel" && prev.restKind === undefined && next) {
    const depart = round5(toMin(next.startTime) - travelMin(ctx, ctx.hotelZone, itemZone(ctx, next)));
    const items = day.items.filter((i) => i.id !== victimId).map((i) => (i.id === prev.id ? { ...i, startTime: toHHMM(depart), endTime: toHHMM(depart), title: i.title?.includes("늦은 출발") ? i.title : `${i.title} (여유 있게 늦은 출발)` } : i));
    return { ...day, items };
  }
  return { ...day, items: day.items.map((it) => (it.id === victimId ? toRest(it, title, reason) : it)) };
}

/** 연속된 자유시간은 하나로 합친다 */
function mergeRests(day: Day): Day {
  const items: ItineraryItem[] = [];
  for (const it of day.items) {
    const last = items[items.length - 1];
    if (last && last.type === "rest" && it.type === "rest" && last.restKind === "free" && it.restKind === "free") {
      items[items.length - 1] = { ...last, endTime: it.endTime };
    } else items.push(it);
  }
  return { ...day, items };
}

/** 여행 강도 변경: 핵심 일정(즐겨찾기·반드시 방문·예약)은 유지하고 일정 수와 휴식만 조정 */
export function changeIntensity(trip: Trip, intensity: Intensity): { trip: Trip; message: string } {
  const prev = trip.profile.conditions.intensity;
  const profile = { ...trip.profile, conditions: { ...trip.profile.conditions, intensity } };
  let next: Trip = { ...trip, profile };
  let removed = 0;
  let addedCount = 0;
  const n = next.days.length;
  for (let di = 0; di < n; di++) {
    const ctx = makeCtx(next.destination, next.profile);
    const kind: DayKind = n === 1 ? "single" : di === 0 ? "first" : di === n - 1 ? "last" : "full";
    const cap = capsFor(ctx, kind).maxPlaces;
    let day = next.days[di];
    // 줄이기
    while (day.items.filter((i) => i.type === "place").length > cap) {
      const victim = lowestNonCorePlace(ctx, next, day);
      if (!victim) break;
      day = dropPlace(ctx, day, victim.id, "숙소 휴식 · 자유시간", `여행 강도 '${INTENSITY[intensity].label}'로 조정`);
      removed++;
    }
    day = mergeRests(day);
    next = { ...next, days: next.days.map((d, i) => (i === di ? finalizeDay(ctx, day) : d)) };
    // 늘리기: 강도를 올렸을 때만, 자유시간·여유시간 자리에 추가
    let guard = RANK[intensity] > RANK[prev] ? 0 : 99;
    if (guard === 0) {
      // 늦춘 출발 시간을 되돌려 오전 여유 시간을 확보
      const start = INTENSITY_CFG[intensity].dayStart;
      next = {
        ...next,
        days: next.days.map((d, i) =>
          i === di ? { ...d, items: d.items.map((it) => (it.type === "hotel" && it.title?.includes("늦은 출발") ? { ...it, title: it.title.replace(" (여유 있게 늦은 출발)", ""), startTime: toHHMM(start), endTime: toHHMM(start) } : it)) } : d,
        ),
      };
    }
    while (next.days[di].items.filter((i) => i.type === "place").length < cap && guard++ < 4) {
      const d = next.days[di];
      const freeRest = d.items.find((i) => i.type === "rest" && i.restKind === "free");
      if (freeRest) {
        const c = suggestForWindow(next, di, gapWindow(next, di, freeRest.id), "place").find((x) => x.kind === "place");
        if (!c) break;
        next = replaceWithCandidate(next, di, freeRest.id, { ...c, reason: `강도 '${INTENSITY[intensity].label}' · ${c.reason}` });
        addedCount++;
        continue;
      }
      const w = idleWindows(next, di)[0];
      if (!w) break;
      const c = suggestForWindow(next, di, w, "place").find((x) => x.kind === "place");
      if (!c) break;
      next = insertCandidate(next, di, { ...c, reason: `강도 '${INTENSITY[intensity].label}' · ${c.reason}` });
      addedCount++;
    }
  }
  next.updatedAt = new Date().toISOString();
  const head = `여행 강도: ${INTENSITY[prev].label} → ${INTENSITY[intensity].label}.`;
  const body =
    removed || addedCount
      ? ` ${removed ? `방문지 ${removed}곳을 빼고 휴식을 늘렸고` : ""}${removed && addedCount ? " " : ""}${addedCount ? `방문지 ${addedCount}곳을 추가했어요` : "었어요"}. 즐겨찾기·반드시 방문 일정은 유지했어요.`
      : " 기존 일정이 이미 새 강도에 맞아서 바꾸지 않았어요.";
  return { trip: next, message: head + body.replace("늘렸고었어요", "늘렸어요") };
}

/** "오늘 너무 빡세요" / "아이 때문에 오후 줄여줘": 해당 날짜에서 우선순위 낮은 오후 방문지 하나를 휴식으로 */
export function lightenDay(trip: Trip, dayIndex: number): { trip: Trip; message: string } {
  const ctx = makeCtx(trip.destination, trip.profile);
  const day = trip.days[dayIndex];
  const victim =
    lowestNonCorePlace(ctx, trip, day, (it) => toMin(it.startTime) >= 12 * 60) ?? lowestNonCorePlace(ctx, trip, day);
  if (!victim) return { trip, message: "줄일 수 있는 일정이 없어요. 즐겨찾기·반드시 방문 일정은 유지해요." };
  const name = itemName(victim, ctx.places, ctx.restaurants);
  const next = withDay(trip, dayIndex, (c, d) => mergeRests(dropPlace(c, d, victim.id, "숙소 휴식", "일정을 가볍게 조정")));
  return { trip: next, message: `${day.dayNumber}일차에서 '${name}'을(를) 빼고 휴식으로 바꿨어요. 나머지 일정은 그대로예요.` };
}

/** 비 예보 대응: 실외 방문지만 같은 시간대의 실내 후보로 교체 */
export function adaptForRain(trip: Trip, dayIndex: number): { trip: Trip; message: string } {
  const ctx = makeCtx(trip.destination, trip.profile);
  let next = trip;
  let changed = 0;
  let rested = 0;
  const targets = trip.days[dayIndex].items.filter((it) => {
    if (it.type !== "place" || isCore(trip, it)) return false;
    const p = ctx.places.find((x) => x.id === it.placeId)!;
    return p.indoor === "outdoor" || p.rainOk === false;
  });
  for (const t of targets) {
    const cands = suggestForWindow(next, dayIndex, gapWindow(next, dayIndex, t.id), "place", undefined, [t.placeId!]);
    const indoor = cands.find((c) => {
      if (c.kind !== "place") return false;
      const p = ctx.places.find((x) => x.id === c.placeId)!;
      return p.indoor === "indoor" || p.rainOk === true;
    });
    if (indoor) {
      next = replaceWithCandidate(next, dayIndex, t.id, { ...indoor, reason: `우천 대응 · ${indoor.reason}` });
      changed++;
    } else {
      next = withDay(next, dayIndex, (_, d) => ({ ...d, items: d.items.map((it) => (it.id === t.id ? toRest(it, "실내 휴식(숙소)", "우천 대응") : it)) }));
      rested++;
    }
  }
  if (!targets.length) return { trip, message: "이 날은 이미 실내 위주 일정이에요. (즐겨찾기·반드시 방문 일정은 유지)" };
  return { trip: next, message: `실외 일정 ${targets.length}곳 중 ${changed}곳을 실내 장소로${rested ? `, ${rested}곳을 숙소 휴식으로` : ""} 바꿨어요.` };
}

export function setDayWeather(trip: Trip, dayIndex: number, weather: Day["weather"]): Trip {
  return { ...trip, days: trip.days.map((d, i) => (i === dayIndex ? { ...d, weather } : d)), updatedAt: new Date().toISOString() };
}
