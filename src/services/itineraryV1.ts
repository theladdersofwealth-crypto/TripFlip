// 권역 추천 결과(상위 N곳)를 날짜별 일정과 하루 타임테이블로 펼친다.
// 이동·체류 시간은 실측 전 예상값이다. 화면에 "예상"으로 표시할 것.
import { GRADE_SCORE } from "@/data/regionsV1";
import type { PlaceV1 } from "@/data/regionsV1";
import type { RegionQuery, RegionResult } from "@/services/regionScore";
import { ALL_PLACES, tripDays } from "@/services/regionScore";
import type { DayPrefs, Transport } from "@/lib/flow";
import { PLACE_ATTRS } from "@/data/placeAttrs";
import { openDuring } from "@/data/seasonal";
import { dayVisitCapacity } from "@/lib/travelParty";
import { addCalendarDays } from "@/lib/travelDates";

export const SLOT_LABELS: Record<number, string[]> = { 1: ["하루"], 2: ["오전", "오후"], 3: ["오전", "오후", "저녁"] };

export interface DayPlan {
  day: number;
  date: string; // YYYY-MM-DD
  slots: { label: string; place: PlaceV1; extra?: boolean }[];
  fullDay: boolean;
  /** 일정판에서 칸별로 고른 식당 (있으면 이 값을 쓴다) */
  meals?: { 점심?: PlaceV1; 저녁?: PlaceV1 };
  dessert?: PlaceV1;
  arrival?: boolean;
  departure?: boolean;
}

// 시간대·체류·아이친화는 GPT·제미나이 추정값(PLACE_ATTRS). 없으면 태그로 판단한다.
const slotOf = (p: PlaceV1) => PLACE_ATTRS[p.id]?.[0];
export const kidFit = (p: PlaceV1) => PLACE_ATTRS[p.id]?.[2];
const isNight = (p: PlaceV1) => slotOf(p) === "저녁" || (!slotOf(p) && p.tags.includes("야경·야시장"));
const ORDER = { 오전: 0, 아무때나: 1, 오후: 2, 저녁: 3, 종일: 1 } as const;
/** 테마파크·먼 당일 명소는 하루를 통째로 쓴다 */
export const isFullDay = (p: PlaceV1) => slotOf(p) === "종일" || p.penalty > 0 || p.travel.includes("페리") || (!slotOf(p) && p.tags.includes("테마파크"));

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function fmtDate(d: string) {
  const x = new Date(`${d}T00:00:00Z`);
  return `${x.getUTCMonth() + 1}/${x.getUTCDate()}(${WEEK[x.getUTCDay()]})`;
}

export function addDays(date: string, n: number) {
  return addCalendarDays(date, n);
}

/**
 * 장소가 모자랄 때 고객이 고르는 방식
 * - spread: 있는 장소를 날짜에 고루 퍼뜨려 빈 날을 없앤다 (하루 개수가 줄어든다)
 * - fill: 고른 컨셉 밖 장소까지 등급 순으로 더해 하루 개수를 채운다 (점수에는 안 들어간다)
 */
export type FillMode = "spread" | "fill";

/** 컨셉 밖이지만 같은 권역에 있는 장소 (등급 높은 순) */
function extraPlaces(r: RegionResult, need: number, q: RegionQuery): PlaceV1[] {
  const used = new Set([...r.top.map((t) => t.place.id), ...r.excluded.map((e) => e.place.id)]);
  return ALL_PLACES.filter((p) => p.region === r.region.id && !used.has(p.id))
    .filter((p) => p.grade != null && openDuring(p, q.startDate, q.endDate))
    .sort((a, b) => (b.grade == null ? 0 : GRADE_SCORE[b.grade]) - b.penalty - ((a.grade == null ? 0 : GRADE_SCORE[a.grade]) - a.penalty))
    .slice(0, need);
}

export function buildDays(r: RegionResult, q: RegionQuery, mode: FillMode = "spread"): { days: DayPlan[]; unplaced: PlaceV1[] } {
  const D = tripDays(q.startDate, q.endDate);
  const per = q.perDay;
  const days: DayPlan[] = Array.from({ length: D }, (_, i) => ({ day: i + 1, date: addDays(q.startDate, i), slots: [], fullDay: false }));
  const pool: PlaceV1[] = [];
  const unplaced: PlaceV1[] = [];

  // 하루짜리를 먼저 빈 날에 배치 (첫날·마지막 날은 이동일이라 가능한 피한다)
  const order = days.length > 2 ? [...days.slice(1, -1), days[0], days[days.length - 1]] : days;
  for (const { place } of r.top) {
    if (!isFullDay(place)) {
      pool.push(place);
      continue;
    }
    const free = order.find((d) => d.day > 1 && d.day < D && !d.fullDay && d.slots.length === 0);
    if (free) {
      free.fullDay = true;
      free.slots.push({ label: "하루", place });
    } else unplaced.push(place);
  }
  const extra = new Set<PlaceV1>();
  if (mode === "fill") {
    const room = days.filter((d) => !d.fullDay).reduce((n, d) => n + dayVisitCapacity(per, d.day - 1, D), 0) - pool.length;
    for (const p of extraPlaces(r, room, q).filter((p) => !isFullDay(p))) {
      pool.push(p);
      extra.add(p);
    }
  }
  for (const place of pool) {
    // 채우기: 앞에서부터 하루 개수만큼 / 퍼뜨리기: 가장 덜 찬 날에 하나씩
    const open = days.filter((x) => !x.fullDay && x.slots.length < dayVisitCapacity(per, x.day - 1, D));
    const d = mode === "fill" ? open[0] : open.reduce<DayPlan | undefined>((a, b) => (!a || b.slots.length < a.slots.length ? b : a), undefined);
    if (d) d.slots.push({ label: "", place, extra: extra.has(place) });
    else unplaced.push(place);
  }
  // 야경 장소는 그날 마지막 순서로, 시간대 라벨 붙이기
  for (const d of days) {
    if (d.fullDay) continue;
    d.slots.sort((a, b) => (isNight(a.place) ? 3 : ORDER[slotOf(a.place) ?? "아무때나"]) - (isNight(b.place) ? 3 : ORDER[slotOf(b.place) ?? "아무때나"]));
    // 하루를 통째로 쓰지 않는 장소 하나만 있는 날은 "하루"가 아니라 오전 일정 + 자유 시간이다
    d.slots.forEach((s, i) => (s.label = d.day === 1 ? i === 0 ? "오후" : "저녁" : d.slots.length === 1 ? (isNight(s.place) ? "저녁" : "오전") : (SLOT_LABELS[per][i] ?? "")));
    d.arrival = d.day === 1;
    d.departure = d.day === D;
  }
  return { days, unplaced };
}

// ---------- 타임테이블 ----------

export interface TimeRow {
  time: string;
  end?: string;
  kind: "wake" | "meal" | "move" | "visit" | "rest";
  title: string;
  sub?: string;
}

const FACTOR: Record<Transport, number> = { "택시·그랩": 1, 대중교통: 1.5, 렌터카: 1.1, 도보: 2.5 };

/** 숙소(거점) → 장소 편도 예상 분 */
export function baseMinutes(p: PlaceV1) {
  if (p.penalty === 1) return 240;
  if (p.penalty === 0.5) return 150;
  if (p.travel.includes("페리")) return 90;
  return 30;
}

/** 비 오는 날 적합도: 태그로 판정 (○ 실내 위주 / △ 반반 / × 실외) */
const RAIN_OK = ["쇼핑몰·아웃렛", "카페·디저트", "로컬푸드", "마사지·스파"];
const RAIN_NO = ["해변·섬", "자연경관", "트레킹·하이킹", "해양", "스키", "골프"];
export function rainFit(p: PlaceV1): "○" | "△" | "×" {
  if (p.tags.some((t) => RAIN_NO.includes(t))) return "×";
  if (p.tags.some((t) => RAIN_OK.includes(t))) return "○";
  return "△";
}

export function stayMinutes(p: PlaceV1, fullDay: boolean) {
  const m = PLACE_ATTRS[p.id]?.[1];
  if (m) return fullDay ? Math.max(m, 240) : Math.min(m, 300);
  if (fullDay) return p.tags.includes("테마파크") ? 420 : 240;
  if (p.tags.some((t) => ["해변·섬", "골프", "해양", "온천"].includes(t))) return 180;
  return 120;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const round5 = (m: number) => Math.round(m / 5) * 5;

export function buildTimetable(day: DayPlan, prefs: DayPrefs): TimeRow[] {
  const rows: TimeRow[] = [];
  const f = FACTOR[prefs.transport];
  const wake = toMin(prefs.wake);
  let t = wake + 30;
  rows.push({ time: prefs.wake, kind: "wake", title: "기상" });
  if (prefs.breakfastEnabled !== false) {
    const start = Math.max(toMin(prefs.breakfast), wake + 15);
    rows.push({ time: toTime(start), end: toTime(start + prefs.breakfastMin), kind: "meal", title: "조식", sub: "조식 제공 여부·식사 장소는 별도 확인" });
    t = start + prefs.breakfastMin + 30;
  }
  if (day.arrival) {
    rows.push({ time: toTime(t), end: toTime(Math.max(t, 13 * 60)), kind: "move", title: "도착·체크인 시간 확보", sub: "항공편 미확정: 오전 이동·오후 관광을 가정한 초안" });
    t = Math.max(t, 13 * 60);
  }
  let lunch = false;
  let dinner = false;
  let dessert = false;
  let visitCount = 0;
  let previousReturn = 30;
  const isFood = (p: PlaceV1) => p.tags.includes("로컬푸드") || p.tags.includes("카페·디저트") || /레스토랑|식당|씨푸드|Restaurant|Seafood/i.test(p.name + p.en);
  const food = day.slots.filter((s) => isFood(s.place)).map((s) => s.place);
  const meal = (title: "점심" | "저녁", near = "동선 주변 식당 · 영업·메뉴 확인 필요") => {
    const restaurant = day.meals ? day.meals[title] : food.shift();
    rows.push({ time: toTime(t), end: toTime(t + 60), kind: "meal", title: restaurant ? `${title} · ${restaurant.name}` : `${title} · 식당 미정`, sub: restaurant ? restaurant.dining && restaurant.lat == null ? "주소만 등록된 후보 · 위치·이동시간·영업 확인 필요" : "추천 후보 · 운영시간·편의시설 확인 필요" : near });
    t += 60;
    if (title === "점심") lunch = true;
    else dinner = true;
  };
  const addDessert = () => {
    if (!day.dessert || dessert || day.departure) return;
    rows.push({ time: toTime(t), end: toTime(t + 15), kind: "move", title: `디저트 가게 이동 · ${prefs.transport}`, sub: "약 15분 (동선 확인 전 예상)" });
    t += 15;
    rows.push({ time: toTime(t), end: toTime(t + 30), kind: "meal", title: `디저트 · ${day.dessert.name}`, sub: "선택한 카페·디저트 후보 · 운영시간 확인 필요" });
    t += 30;
    dessert = true;
  };
  for (const slot of day.slots.filter((s) => !isFood(s.place))) {
    const night = slot.label === "저녁" || slot.label === "야간";
    if (!lunch && (t >= 11 * 60 + 30 || slot.label === "오후" || night)) {
      t = Math.max(t, 11 * 60 + 30);
      meal("점심");
    }
    if (slot.label === "오후") t = Math.max(t, 13 * 60);
    if (night && !dinner) {
      if (t < 17 * 60 + 30) rows.push({ time: toTime(t), end: "17:30", kind: "rest", title: "자유 시간", sub: "휴식·산책 등 선택" });
      t = Math.max(t, 17 * 60 + 30);
      meal("저녁");
      addDessert();
    }
    const move = round5((visitCount === 0 ? baseMinutes(slot.place) : 30) * f);
    const stay = stayMinutes(slot.place, day.fullDay);
    const deadline = day.departure ? 13 * 60 : 22 * 60 + 30;
    if (t + move + stay + (day.fullDay && !lunch ? 60 : 0) > deadline) {
      rows.push({ time: toTime(t), kind: "rest", title: `${slot.place.name} · 시간 재조정 필요`, sub: "예상 이동·체류시간이 가용시간을 넘어 배치를 보류했어요. 장소를 바꾸거나 시작시간을 조정해 주세요." });
      continue;
    }
    rows.push({ time: toTime(t), end: toTime(t + move), kind: "move", title: `이동 · ${prefs.transport}`, sub: `약 ${move}분 (예상)` });
    t += move;
    const details = `${slot.label} · ${slot.place.tags.join(" · ")} · 체류 ${stay}분 (예상) · 운영시간 미확인`;
    if (day.fullDay && !lunch && t < 12 * 60) {
      const morning = Math.min(stay, 12 * 60 - t);
      rows.push({ time: toTime(t), end: toTime(t + morning), kind: "visit", title: slot.place.name, sub: details });
      t += morning;
      meal("점심", "종일 장소 안·주변 식당 확인 필요");
      if (stay > morning) {
        rows.push({ time: toTime(t), end: toTime(t + stay - morning), kind: "visit", title: `${slot.place.name} · 계속`, sub: "종일 일정의 오후 구간" });
        t += stay - morning;
      }
    } else {
      rows.push({ time: toTime(t), end: toTime(t + stay), kind: "visit", title: slot.place.name, sub: details });
      t += stay;
    }
    visitCount++;
    previousReturn = day.fullDay ? baseMinutes(slot.place) : 30;
  }
  if (!visitCount) rows.push({ time: toTime(t), kind: "rest", title: "자유 일정", sub: "이날 배정된 관광이 없거나 시간 조정이 필요해요." });
  if (!lunch) {
    t = Math.max(t, 11 * 60 + 30);
    meal("점심");
  }
  if (day.departure) {
    rows.push({ time: toTime(Math.max(t, 13 * 60 + 30)), kind: "move", title: "공항 이동 시간 확보", sub: "항공편 미확정: 오후 출국 이동을 가정한 초안 · 실제 출발시간에 맞춰 조정 필요" });
    return rows;
  }
  const back = round5(previousReturn * f);
  const returnHotel = () => {
    rows.push({ time: toTime(t), end: toTime(t + back), kind: "move", title: `숙소 복귀 · ${prefs.transport}`, sub: `약 ${back}분 (예상)` });
    t += back;
  };
  if (dinner) {
    addDessert();
    returnHotel();
    return rows;
  }
  if (17 * 60 + 30 - (t + back) >= 30) {
    returnHotel();
    rows.push({ time: toTime(t), end: "17:30", kind: "rest", title: "숙소 휴식", sub: "수영장·휴식 등 자유 시간" });
    t = 17 * 60 + 30;
    meal("저녁", "숙소 주변 식당 확인 필요");
    addDessert();
    return rows;
  }
  t = Math.max(t, 17 * 60 + 30);
  meal("저녁");
  addDessert();
  returnHotel();
  return rows;
}
