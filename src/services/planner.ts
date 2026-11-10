// 나트랑 가족 플래너 구조를 전 권역에 옮긴 일정판.
// 일자별 오전·점심·오후·저녁 칸, 칸마다 후보 점수순, 고정·재최적화.
// 점수는 실측이 아니라 등급·동행 적합·이동·날씨·컨디션으로 낸 추정값이다.
import { GRADE_SCORE } from "@/data/regionsV1";
import type { PlaceV1 } from "@/data/regionsV1";
import { PLACE_ATTRS } from "@/data/placeAttrs";
import { PLACE_FIT } from "@/data/placeFit";
import { openOn } from "@/data/seasonal";
import { WORLD_REGIONS } from "@/data/worldV1";
import { verifiedRegionCenter } from "@/data/approvedCatalog";
import { ALL_PLACES, PILOT_TWIN_OF, tripDays } from "@/services/regionScore";
import type { Companion, RegionQuery } from "@/services/regionScore";
import { addDays, rainFit } from "@/services/itineraryV1";
import type { DayPlan } from "@/services/itineraryV1";
import { conceptWeight, coreInterests, dayVisitCapacity, normalizeParty, personalFit } from "@/lib/travelParty";

export type SlotKey = "오전" | "점심" | "오후" | "저녁" | "야간" | "디저트";
export const SLOT_KEYS: SlotKey[] = ["오전", "점심", "오후", "저녁", "디저트", "야간"];
export type MealStyle = "any" | "local" | "asian" | "western" | "fastfood";
export const MEAL_STYLES: { value: MealStyle; label: string }[] = [{ value: "any", label: "종류 무관" }, { value: "local", label: "현지식" }, { value: "asian", label: "아시아식" }, { value: "western", label: "서양식" }, { value: "fastfood", label: "패스트푸드" }];
export type Condition = "보통" | "피곤" | "매우 피곤";
export type DayWeather = "맑음" | "비" | "강풍";

/** 장소가 아닌 칸 값 */
export const REST = "rest"; // 숙소 휴식
export const ARRIVE = "arrive"; // 도착·체크인
export const LEAVE = "leave"; // 공항 이동
export const NEARBY_MEAL = "meal"; // 주변 식당 (식당 데이터 없음)

export interface Cell { v: string | null; lock: boolean; cont?: boolean } // cont = 종일 장소의 오후 이어짐
export interface BoardDay { date: string; condition: Condition; weather: DayWeather; cells: Record<SlotKey, Cell>; mealStyle?: MealStyle; dessert?: boolean }
export interface Board { key: string; days: BoardDay[] }

const isDessert = (p: PlaceV1) => p.tags.includes("카페·디저트");
const isFood = (p: PlaceV1) => isDessert(p) || p.tags.includes("로컬푸드") || /레스토랑|식당|씨푸드|Restaurant|Seafood/i.test(p.name + p.en);
const isAllDay = (p: PlaceV1) => PLACE_ATTRS[p.id]?.[0] === "종일" || p.penalty > 0 || p.tags.includes("테마파크");

/** 예전 4칸 저장본도 읽는다. 추가된 칸은 비어 있는 상태로 시작한다. */
export function completeBoard(board: Board): Board {
  return { ...board, days: board.days.map((d) => ({ ...d, cells: Object.fromEntries(SLOT_KEYS.map((k) => [k, d.cells[k] ? { ...d.cells[k] } : { v: null, lock: false }])) as Record<SlotKey, Cell> })) };
}
export const slotsForDay = (d: BoardDay, q: RegionQuery) => SLOT_KEYS.filter((k) => k === "디저트" ? (d.dessert && d.cells["오후"].v !== LEAVE) || d.cells[k]?.lock : k === "야간" ? (q.perDay === 3 && d.cells["오후"].v !== LEAVE) || d.cells[k]?.lock : true);
const culinaryStyle = (p: PlaceV1): MealStyle | null => {
  const text = `${p.name} ${p.en} ${p.tags.join(" ")}`;
  if (/패스트푸드|fast.?food|burger|버거|맥도날드|McDonald|KFC/i.test(text)) return "fastfood";
  if (/스테이크|steak|이탈리안|italian|pasta|피자|pizza|프렌치|french/i.test(text)) return "western";
  if (p.tags.includes("로컬푸드")) return "local";
  return null;
};
const fitsCuisine = (p: PlaceV1, style: MealStyle) => {
  if (style === "any") return true;
  if (p.dining) return p.dining.styles.includes(style);
  const actual = culinaryStyle(p);
  if (actual === style) return true;
  // 아시아 권역의 현지식만 아시아식으로 함께 취급한다. 그 밖의 미확인 분류는 추정하지 않는다.
  return style === "asian" && actual === "local" && /베트남|일본|한국|태국|홍콩|중국|대만|싱가포르|말레이시아|인도네시아|필리핀|인도|캄보디아|라오스/.test(WORLD_REGIONS.find((r) => r.id === (PILOT_TWIN_OF[p.region] ?? p.region))?.country ?? "");
};

// ---------- 거리·피로·동행 적합 ----------
const center = (regionId: string) => verifiedRegionCenter(PILOT_TWIN_OF[regionId] ?? regionId) ?? WORLD_REGIONS.find((r) => r.id === (PILOT_TWIN_OF[regionId] ?? regionId));
const km = (a: number, b: number, c: number, d: number) => {
  const t = Math.PI / 180;
  const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
};
/** 거점(권역 중심) → 장소 편도 분. 좌표가 없으면 거리 감점 단계로 추정 */
export function travelMin(p: PlaceV1): number {
  const c = center(p.region);
  const { lat, lon } = p as PlaceV1 & { lat?: number; lon?: number };
  if (c && lat != null && lon != null) return Math.round((10 + km(c.lat, c.lon, lat, lon) * 1.6) / 5) * 5;
  return p.penalty >= 1 ? 150 : p.penalty > 0 ? 90 : 25;
}
/** 피로 1~5. 데이터 없으면 체류시간·태그로 추정 */
export function fatigue(p: PlaceV1): number {
  const f = PLACE_FIT[p.id]?.[0];
  if (f) return f;
  if (p.tags.some((t) => ["트레킹·하이킹", "스키"].includes(t))) return 4;
  const stay = PLACE_ATTRS[p.id]?.[1] ?? 120;
  return stay >= 300 ? 4 : stay >= 180 ? 3 : stay >= 90 ? 2 : 1;
}
export function companionsOf(q: RegionQuery): Companion[] {
  if (q.members?.length) return normalizeParty(q).companions ?? [];
  if (q.companions?.length) return q.companions;
  const out: Companion[] = [q.adults === 1 && !q.children.length ? "혼자" : "부부"];
  if (q.elders) out.push("부모님");
  if (q.children.some((c) => c.band === "영아")) out.push("영유아");
  if (q.children.some((c) => c.band === "유아" || c.band === "초등")) out.push("아이");
  if (q.children.some((c) => c.band === "중고등")) out.push("10대");
  return out;
}

// ---------- 점수 (나트랑앱 100점제 구조) ----------
export interface Eval { total: number; label: string; blockedBy?: Companion; parts: string[] }
export function diningDistance(p: PlaceV1, day: Partial<BoardDay>, slot?: SlotKey): { km: number | null; from: "일정" | "거점" } {
  if (p.lat == null || p.lon == null) return { km: null, from: "일정" };
  const order = slot === "점심" ? ["오전", "오후"] as const : ["오후", "오전"] as const;
  const anchors = order.map((k) => ALL_PLACES.find((place) => place.id === day.cells?.[k]?.v)).filter((a): a is PlaceV1 => a?.lat != null && a.lon != null);
  const anchor = anchors[0];
  if (anchor?.lat != null && anchor.lon != null) return { km: km(p.lat, p.lon, anchor.lat, anchor.lon), from: "일정" };
  const c = center(p.region);
  return c ? { km: km(p.lat, p.lon, c.lat, c.lon), from: "거점" } : { km: null, from: "거점" };
}

function evaluateDining(p: PlaceV1, q: RegionQuery, day: Partial<BoardDay>, slot?: SlotKey): Eval {
  const distance = diningDistance(p, day, slot);
  // 식당 품질·가족 편의시설 점수는 만들지 않는다. 내부 배치는 거리와 명시한 음식 종류만 사용한다.
  const total = distance.km == null ? 25 : Math.max(10, Math.min(95, 85 - distance.km * 5 + (day.mealStyle && day.mealStyle !== "any" && fitsCuisine(p, day.mealStyle) ? 10 : 0)));
  return { total: Math.round(total), label: distance.km == null ? "위치 확인 필요" : "동선 후보", parts: ["영업시간·가격 확인 필요", ...(q.children.length ? ["아기의자·키즈메뉴 미확인"] : []), ...(q.pet ? ["반려동물 출입 미확인"] : [])] };
}
export function scoreLabel(t: number) {
  return t >= 85 ? "매우 적합" : t >= 75 ? "적합" : t >= 60 ? "가능" : t >= 45 ? "비추천" : "현재조건 부적합";
}
export function evaluate(p: PlaceV1, q: RegionQuery, day: Pick<BoardDay, "condition" | "weather"> & Partial<BoardDay>): Eval {
  if (isFood(p)) return evaluateDining(p, q, day);
  const fit = personalFit(p, q);
  const parts: string[] = [...fit.flags];
  const exp = (p.grade == null ? 0 : GRADE_SCORE[p.grade] / 5) * 30;
  const comp = fit.factor * 25;
  const weight = conceptWeight(p.concepts, q);
  const concept = weight > 0 ? Math.round(5 + 10 * weight) : 4; // 메인 15 · 서브 순서대로 줄어듦
  const tm = travelMin(p);
  const move = tm <= 20 ? 15 : tm <= 40 ? 12 : tm <= 60 ? 8 : tm <= 100 ? 4 : 0;
  const rain = rainFit(p);
  let weather = 10;
  if (day.weather === "비") weather = rain === "○" ? 10 : rain === "△" ? 5 : 0;
  if (day.weather === "강풍" && (p.tags.includes("해양") || p.tags.includes("해변·섬"))) weather = 0;
  const fat = fatigue(p);
  let cond = 5;
  if (day.condition === "피곤" && fat >= 4) cond = -10;
  if (day.condition === "매우 피곤" && fat >= 3) cond = -20;
  let total = exp + comp + concept + move + weather + cond;
  if (tm > 60) total -= 4;
  if (tm > 100) total -= 8;
  if (weather === 0) parts.push(day.weather === "비" ? "비 오면 실외라 감점" : "강풍 시 바다 감점");
  if (cond < 0) parts.push("컨디션 대비 힘듦");
  if (tm > 60) parts.push(`이동 약 ${tm}분`);
  // AI 추정 0점은 이용 금지가 아니다. 확인된 제한이 없는 현재 데이터에서는 점수·안내에만 반영한다.
  total = Math.max(0, Math.min(100, Math.round(total)));
  return { total, label: scoreLabel(total), parts };
}
/** S/A/B/C 가족 등급 = 이번 동행·보통 컨디션·맑음 기준 점수 */
export function familyGrade(p: PlaceV1, q: RegionQuery) {
  const e = evaluate(p, q, { condition: "보통", weather: "맑음" });
  return e.blockedBy ? "불가" : e.total >= 85 ? "S" : e.total >= 75 ? "A" : e.total >= 60 ? "B" : "C";
}

// ---------- 후보 ----------
export const placesOf = (regionId: string) => ALL_PLACES.filter((p) => p.region === regionId);
export const byId = (id: string) => ALL_PLACES.find((p) => p.id === id);
export function candidates(regionId: string, slot: SlotKey, q: RegionQuery, day: BoardDay) {
  const meal = slot === "점심" || slot === "저녁" || slot === "디저트";
  const normalize = (name: string) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const freshNames = new Set(placesOf(regionId).filter((p) => p.dining).flatMap((p) => [normalize(p.name), normalize(p.en)]));
  return placesOf(regionId)
    .filter((p) => !day.date || openOn(p, day.date))
    .filter((p) => !meal || p.dining || !freshNames.has(normalize(p.name)) && !freshNames.has(normalize(p.en)))
    .filter((p) => slot === "디저트" ? isDessert(p) : meal ? isFood(p) && !isDessert(p) && fitsCuisine(p, day.mealStyle ?? "any") : !isFood(p))
    .filter((p) => slot !== "야간" || PLACE_ATTRS[p.id]?.[0] === "저녁" || PLACE_ATTRS[p.id]?.[0] === "아무때나" || p.tags.includes("야경·야시장"))
    .map((p) => {
      const e = meal ? evaluateDining(p, q, day, slot) : evaluate(p, q, day);
      if (meal) e.parts.push("음식 분류·편의시설은 방문 전 확인");
      if (slot === "야간") e.parts.push("야간 운영시간 확인 필요");
      return { p, e, allDay: isAllDay(p), distance: meal ? diningDistance(p, day, slot) : undefined };
    })
    .sort((a, b) => (meal ? Number(a.distance?.km == null) - Number(b.distance?.km == null) : 0) || b.e.total - a.e.total);
}

// ---------- 일정판 만들기·재최적화 (나트랑앱 smartOptimize 이식) ----------
export function boardKey(regionId: string, q: RegionQuery) {
  return `v3|${regionId}|${JSON.stringify(normalizeParty(q))}`;
}
export function emptyBoard(regionId: string, q: RegionQuery): Board {
  const D = tripDays(q.startDate, q.endDate);
  const days: BoardDay[] = Array.from({ length: D }, (_, i) => {
    const cells = Object.fromEntries(SLOT_KEYS.map((k) => [k, { v: null, lock: false }])) as Record<SlotKey, Cell>;
    if (i === 0) cells["오전"] = { v: ARRIVE, lock: true };
    if (i === D - 1) {
      cells["오후"] = { v: LEAVE, lock: true };
      cells["저녁"] = { v: LEAVE, lock: true, cont: true };
    }
    return { date: addDays(q.startDate, i), condition: "보통", weather: "맑음", cells };
  });
  return optimize({ key: boardKey(regionId, q), days }, regionId, q);
}

const SPECIAL = new Set([REST, ARRIVE, LEAVE, NEARBY_MEAL]);
export function optimize(board: Board, regionId: string, q: RegionQuery): Board {
  const days = completeBoard(board).days;
  const free = (c: Cell) => !c.lock;
  // 고정 칸은 그대로 두고, 고정 안 한 칸은 비운 뒤 다시 채운다
  days.forEach((d) => SLOT_KEYS.forEach((k) => free(d.cells[k]) && (d.cells[k] = { v: null, lock: false })));
  const used = new Set<string>();
  const usedFood = new Set<string>();
  const usedCuisine = new Set<string>();
  const allDayOn = days.map((d) => d.cells["오후"].cont === true && !SPECIAL.has(d.cells["오후"].v ?? ""));
  days.forEach((d) => SLOT_KEYS.forEach((k) => {
    const v = d.cells[k].v;
    if (v && !SPECIAL.has(v)) (k === "점심" || k === "저녁" || k === "디저트" ? usedFood : used).add(v);
  }));
  const goals = coreInterests(q);
  const covered = new Map(goals.map((g) => [g, 0]));
  const cover = (p: PlaceV1) => p.concepts.forEach((g) => { if (covered.has(g)) covered.set(g, covered.get(g)! + 1); });
  for (const id of used) { const p = byId(id); if (p) cover(p); }
  const usePlace = (p: PlaceV1) => { if (!used.has(p.id)) cover(p); used.add(p.id); };
  let allCount = allDayOn.filter(Boolean).length;
  const last = days.length - 1;
  const light = q.perDay === 1;

  const dayPick = (di: number, slot: SlotKey, anchors: PlaceV1[]) => {
    const d = days[di];
    const normal = d.weather === "맑음" && d.condition !== "매우 피곤";
    return candidates(regionId, slot, q, d)
      .filter((x) => !x.e.blockedBy && !x.allDay && !used.has(x.p.id))
      .map((x) => {
        let adj = x.e.total;
        // 내부 배치 점수에서 아직 덜 반영된 구성원의 핵심 취향을 보완한다.
        // 이 보너스는 화면의 0~100 적합도에 더하지 않는다.
        adj += Math.max(0, ...goals.filter((g) => x.p.concepts.includes(g)).map((g) => 12 / (1 + covered.get(g)!)));
        if (di === last && travelMin(x.p) > 35) adj -= 25;
        if (di === 0 && travelMin(x.p) > 35) adj -= 15;
        // 오후는 오전 장소와 가까운 곳을 우선 (동선)
        const a = anchors[0] as (PlaceV1 & { lat?: number; lon?: number }) | undefined;
        const b = x.p as PlaceV1 & { lat?: number; lon?: number };
        if (a?.lat != null && b.lat != null && a.lon != null && b.lon != null) adj += km(a.lat, a.lon, b.lat, b.lon) <= 5 ? 8 : 0;
        if (!normal && fatigue(x.p) >= 3) adj -= 10;
        return { ...x, adj };
      })
      .sort((a, b) => b.adj - a.adj)[0];
  };
  const mealPick = (di: number, slot: SlotKey, anchors: PlaceV1[]) =>
    candidates(regionId, slot, q, days[di])
      .filter((x) => !x.e.blockedBy)
      .filter((x) => x.distance?.km != null && x.distance.km <= 8)
      .map((x) => {
        let adj = x.e.total;
        if (usedFood.has(x.p.id)) adj -= 25;
        const cuisine = x.p.dining?.cuisine ?? x.p.tags[0] ?? "";
        if (usedCuisine.has(cuisine)) adj -= 8;
        const a = anchors[anchors.length - 1] as (PlaceV1 & { lat?: number; lon?: number }) | undefined;
        const b = x.p as PlaceV1 & { lat?: number; lon?: number };
        if (a?.lat != null && b.lat != null && a.lon != null && b.lon != null) adj += km(a.lat, a.lon, b.lat, b.lon) <= 3 ? 15 : km(a.lat, a.lon, b.lat, b.lon) <= 8 ? 6 : 0;
        return { ...x, adj, cuisine };
      })
      .sort((a, b) => b.adj - a.adj)[0];

  for (let di = 0; di < days.length; di++) {
    const d = days[di];
    const c = d.cells;
    const anchors: PlaceV1[] = [];
    (["오전", "오후", "야간"] as SlotKey[]).forEach((k) => {
      const p = c[k].v && !SPECIAL.has(c[k].v!) ? byId(c[k].v!) : undefined;
      if (p) anchors.push(p);
    });
    // 종일: 가운데 날만, 최대 2번, 연속 금지(고정된 종일 포함), 매우 피곤·강풍이면 안 함
    const middle = di > 0 && di < last;
    const prevAll = di > 0 && allDayOn[di - 1];
    const nextAll = di < last && allDayOn[di + 1];
    if (free(c["오전"]) && free(c["오후"]) && middle && !light && allCount < 2 && !prevAll && !nextAll && d.condition !== "매우 피곤" && d.weather !== "강풍") {
      const best = candidates(regionId, "오전", q, d).filter((x) => x.allDay && !x.e.blockedBy && !used.has(x.p.id))[0];
      if (best && best.e.total >= 70) {
        c["오전"] = { v: best.p.id, lock: false };
        c["오후"] = { v: best.p.id, lock: false, cont: true };
        usePlace(best.p);
        anchors.push(best.p);
        allDayOn[di] = true;
        allCount++;
      }
    }
    if (free(c["오전"]) && !c["오전"].v) {
      if (d.condition === "매우 피곤") c["오전"] = { v: REST, lock: false };
      else {
        const p = dayPick(di, "오전", anchors);
        c["오전"] = { v: p?.p.id ?? REST, lock: false };
        if (p) (usePlace(p.p), anchors.push(p.p));
      }
    }
    if (free(c["오후"]) && !c["오후"].v) {
      if ((light && di !== 0) || d.condition !== "보통") c["오후"] = { v: REST, lock: false };
      else {
        const p = dayPick(di, "오후", anchors);
        c["오후"] = { v: p?.p.id ?? REST, lock: false };
        if (p) (usePlace(p.p), anchors.push(p.p));
      }
    }
    // 저녁 식사와 분리한 세 번째 관광 칸. 첫날은 오후+야간, 마지막 날은 오전만 쓴다.
    if (free(c["야간"]) && !c["야간"].v) {
      const selected = new Set(anchors.map((p) => p.id)).size;
      const capacity = dayVisitCapacity(q.perDay, di, days.length);
      if (q.perDay === 3 && di < last && d.condition === "보통" && !allDayOn[di] && selected < capacity) {
        const p = dayPick(di, "야간", anchors);
        c["야간"] = { v: p?.p.id ?? null, lock: false };
        if (p) (usePlace(p.p), anchors.push(p.p));
      }
    }
    (["점심", "저녁"] as SlotKey[]).forEach((k) => {
      if (!free(c[k]) || c[k].v) return;
      if (di === last && k === "저녁") return;
      const p = mealPick(di, k, anchors);
      if (p && p.adj >= 40) {
        c[k] = { v: p.p.id, lock: false };
        usedFood.add(p.p.id);
        usedCuisine.add(p.cuisine);
      } else c[k] = { v: NEARBY_MEAL, lock: false };
    });
    if (d.dessert && di < last && free(c["디저트"])) {
      const p = mealPick(di, "디저트", anchors);
      c["디저트"] = { v: p && p.adj >= 40 ? p.p.id : null, lock: false };
      if (p && p.adj >= 40) usedFood.add(p.p.id);
    }
  }
  return { ...board, days };
}

export function cellLabel(v: string | null): string {
  if (!v) return "선택 필요";
  if (v === REST) return "숙소 휴식";
  if (v === ARRIVE) return "도착·체크인";
  if (v === LEAVE) return "공항 이동";
  if (v === NEARBY_MEAL) return "식당 추천 필요";
  return byId(v)?.name ?? "알 수 없는 장소";
}
export const isSpecial = (v: string | null) => !v || SPECIAL.has(v);

/** 일정판 하루 → 시간표용 DayPlan (식당은 점심·저녁 칸 그대로) */
export function toDayPlan(d: BoardDay, dayNo: number): DayPlan {
  const pl = (v: string | null) => (v && !SPECIAL.has(v) ? byId(v) : undefined);
  const am = pl(d.cells["오전"].v);
  const pm = d.cells["오후"].cont ? undefined : pl(d.cells["오후"].v);
  const fullDay = !!(am && d.cells["오후"].cont && d.cells["오후"].v === d.cells["오전"].v);
  const slots: DayPlan["slots"] = [];
  if (am) slots.push({ label: fullDay ? "하루" : "오전", place: am });
  if (pm) slots.push({ label: "오후", place: pm });
  const night = pl(d.cells["야간"]?.v ?? null);
  if (night) slots.push({ label: "저녁", place: night });
  return { day: dayNo, date: d.date, slots, fullDay, arrival: d.cells["오전"].v === ARRIVE, departure: d.cells["오후"].v === LEAVE, meals: { 점심: pl(d.cells["점심"].v), 저녁: pl(d.cells["저녁"].v) }, dessert: pl(d.cells["디저트"]?.v ?? null) };
}
