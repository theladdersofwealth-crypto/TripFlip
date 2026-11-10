// 권역 추천 정의서 V1 (§1-1, §1-4, §3) 점수 계산.
import { GRADE_SCORE, PLACES_V1, REGIONS_V1, WEATHER_V1 } from "@/data/regionsV1";
import type { Concept, MonthWeather, PlaceV1, RegionV1, WeatherJudge } from "@/data/regionsV1";
import { WORLD_PLACES, WORLD_REGIONS } from "@/data/worldV1";
import { applyWikiBoost } from "@/data/wikiBoost";
import { openDuring } from "@/data/seasonal";
import { WORLD_WEATHER, WORLD_WEATHER_SOURCE } from "@/data/worldWeather";
import { COUNTRY_PRICE_LEVEL, FLIGHT_KRW, FOOD_USD_US, HOTEL_MEDIAN_USD, KRW_PER_USD } from "@/data/worldPrices";
import { HOTELS } from "@/data/worldHotels";
import { liveFlightKrw, liveHotelPrices, liveSummary } from "@/lib/livePrices";
import { applyApprovedFacts } from "@/data/approvedCatalog";
import { DINING_PLACES } from "@/data/dining";
import { conceptWeight, coreInterests, membersOf, normalizeParty, partyFlags, personalFit, plannedVisitCount, roomEstimate } from "@/lib/travelParty";
import type { TravelMember } from "@/lib/travelParty";

// 시범 5개 권역은 날씨·도보 정보가 있는 regionsV1을 쓰고, 나머지는 전 세계 데이터(worldV1)를 붙인다.
export const PILOT_TWIN_OF: Record<string, string> = { OS: "jap-osaka", NT: "vie-nhatrang", HK: "hon-hongkong", DN: "vie-danang", PQ: "vie-phuquoc" };
const PILOT_TWINS = new Set(Object.values(PILOT_TWIN_OF));
const TONES = ["#00ACB8", "#102F54", "#f2994a", "#2d9cdb", "#eb5757", "#27ae60", "#9b51e0"];
export const ALL_REGIONS: RegionV1[] = [
  ...REGIONS_V1,
  ...WORLD_REGIONS.filter((r) => !PILOT_TWINS.has(r.id)).map((r, i) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    base: `${r.name} 시내`,
    airport: "미확인",
    airportToBase: "미확인",
    priceLevel: null,
    tone: `linear-gradient(135deg,${TONES[i % TONES.length]},${TONES[(i + 3) % TONES.length]})`,
    airportCode: r.airportCode,
    searchName: r.searchName,
    tier: r.tier,
  })),
];
// 시범 권역은 손으로 넣은 장소(PLACES_V1)가 기본이고, 전세계 데이터의 같은 권역 장소 중 이름이 겹치지 않는 곳을 더한다
const PILOT_OF = Object.fromEntries(Object.entries(PILOT_TWIN_OF).map(([k, v]) => [v, k]));
const pilotKeys = new Set(PLACES_V1.map((p) => `${p.region}|${p.en.toLowerCase()}`));
// 컨셉 태그가 관광 위주로 빈약해서, 장소 태그로 빠진 컨셉을 보충한다 (예: 쇼핑몰·시장 → 쇼핑)
const TAG_CONCEPT: Record<string, Concept[]> = {
  "쇼핑몰·아웃렛": ["쇼핑"], 시장: ["쇼핑", "미식"], "야경·야시장": ["쇼핑", "미식"], 핫플: ["쇼핑", "미식"],
  로컬푸드: ["미식"], "카페·디저트": ["미식"],
  "해변·섬": ["휴양"], 온천: ["휴양"], "마사지·스파": ["휴양"],
  체험: ["액티비티"], 테마파크: ["액티비티"], 해양: ["액티비티"], "트레킹·하이킹": ["액티비티"], 스키: ["액티비티"], 골프: ["액티비티"],
};
const withConcepts = (p: PlaceV1): PlaceV1 => {
  const add = p.tags.flatMap((t) => TAG_CONCEPT[t] ?? []).filter((c) => !p.concepts.includes(c));
  return add.length ? { ...p, concepts: [...p.concepts, ...new Set(add)] } : p;
};
export const ALL_PLACES: PlaceV1[] = [
  ...PLACES_V1,
  ...WORLD_PLACES.flatMap((p) => {
    const pilot = PILOT_OF[p.region];
    if (!pilot) return [p];
    if (pilotKeys.has(`${pilot}|${p.en.toLowerCase()}`)) return [];
    if (PLACES_V1.some((q) => q.region === pilot && (q.name.startsWith(p.name) || p.name.startsWith(q.name)))) return [];
    return [{ ...p, region: pilot }];
  }),
  ...DINING_PLACES,
].map(withConcepts).map(applyApprovedFacts).map(applyWikiBoost);

export type ChildBand = "영아" | "유아" | "초등" | "중고등";
export type IntensityV1 = 1 | 2 | 3;
export type PriceLevel = "저렴" | "보통" | "높음" | "상관없음";
export type StayTier = "가성비" | "가심비" | "프리미엄" | "하이엔드";

/** 예전 저장 자료와 입력 편의용 동행 분류. 실제 구성은 members로 표현한다. */
export type Companion = "부부" | "연인" | "친구" | "부모님" | "영유아" | "아이" | "10대" | "혼자";
export const COMPANIONS: Companion[] = ["부부", "연인", "친구", "부모님", "영유아", "아이", "10대", "혼자"];

export interface RegionQuery {
  /** 희망 편도 비행시간 상한(시간). null·없음 = 상관없음. 넘는 권역은 순위 맨 뒤로 */
  maxFlightHours?: number | null;
  members?: TravelMember[];
  interests?: Concept[]; // 동등한 핵심 취향. 없으면 기존 메인/서브 방식 유지
  roomCount?: number | null; // 사용자가 원하는 객실 수. 미정이면 비용 가정만 사용
  totalBudgetKrw?: number | null; // 일행 전체 예산
  budgetMode?: "flexible" | "cap";
  dateWindow?: { earliest: string; latest: string; nights: number };
  companions?: Companion[];
  startDate: string;
  endDate: string;
  adults: number;
  children: { band: ChildBand; height: number | null; actualAge?: number | null }[];
  elders: boolean; // 부모님 또는 배우자 부모님 동행
  pet: boolean;
  main: Concept;
  subs: Concept[];
  perDay: IntensityV1;
  price: PriceLevel;
  stay: StayTier;
}

export interface ScoredPlace {
  place: PlaceV1;
  score: number;
  weight: 1 | 0.5;
}

export interface RegionResult {
  region: RegionV1;
  status: "ranked" | "데이터 부족" | "조건 충족 장소 없음" | "예산 밖" | "물가 미확인";
  /** 희망 비행시간 초과: 순위 맨 뒤로 */
  overFlight: boolean;
  /** 인천→거점 편도 비행시간(추정, 시간). 좌표가 없으면 null */
  flightHours: number | null;
  score: number; // 권역 점수
  display: number; // 0~100
  rank: number;
  top: ScoredPlace[];
  filled: number;
  N: number;
  /** 일정 준비 상태: 등록된 식당·카페 수와, 관광·식사 모두 여행 기간을 채울 수 있는지 */
  readiness: { meals: number; mealsNeeded: number; ready: boolean };
  weather: { month: number; judge: WeatherJudge; adj: number; source: string; tmax?: number; rainDays?: number };
  excluded: { place: PlaceV1; reason: string }[];
  flags: string[];
  reasons: string[];
  // 숙박은 박수, 식비는 일수로 계산. 실제 날짜별 요금·아동 요금은 미확인이다.
  stay: {
    usd: number | null;
    flightKrw: number | null;
    totalKrw: number | null; // 1인 예상 경비 (기존 화면 호환)
    partyTotalKrw: number | null;
    tier: Exclude<PriceLevel, "상관없음"> | null; // 나라 물가 기준, 항공비와 별개
    estimated: boolean;
    rooms: number;
    roomEstimated: boolean;
    nights: number;
    hotelNightUsd: number | null;
    foodPerDayUsd: number | null;
    budgetStatus: "unset" | "within" | "over" | "unknown";
    /** 항공·숙소 가격이 최근 수집 평균(live)인지, 앱에 들어 있는 10/31 자료(static)인지 */
    priceSource: { flight: "live" | "static"; hotel: "live" | "static"; updatedAt: string | null };
  };
}

const MAX_SCORE = 5.5;

const TIER_RANGE: Record<StayTier, [number, number]> = { 가성비: [0, 0.3], 가심비: [0.3, 0.7], 프리미엄: [0.7, 0.9], 하이엔드: [0.9, 1.01] };

/** 예약 화면과 같은 권역 내 가격 순 구간. 시설의 실제 서비스 등급을 보증하지 않는다. */
function hotelPrice(key: string, tier: StayTier): number | null {
  const prices = liveHotelPrices(key) ?? (HOTELS[key] ?? [])
    .filter((h) => h[1] >= 4.5 && h[2] >= 300 && h[3] > 0 && h[4] >= h[3])
    .map((h) => (h[3] + h[4]) / 2).sort((a, b) => a - b);
  if (!prices.length) return HOTEL_MEDIAN_USD[key] ?? null;
  const [from, to] = TIER_RANGE[tier];
  const selected = prices.filter((_, i) => i / prices.length >= from && i / prices.length < to);
  if (!selected.length) return HOTEL_MEDIAN_USD[key] ?? null;
  const mid = Math.floor(selected.length / 2);
  return selected.length % 2 ? selected[mid] : (selected[mid - 1] + selected[mid]) / 2;
}

export function estimateTripCost(region: RegionV1, input: RegionQuery): RegionResult["stay"] {
  const q = normalizeParty(input);
  const key = PILOT_TWIN_OF[region.id] ?? region.id;
  const { rooms, estimated: roomEstimated } = roomEstimate(q);
  const people = Math.max(1, membersOf(q).length);
  const days = tripDays(q.startDate, q.endDate);
  const nights = Math.max(0, days - 1);
  const hotelNightUsd = hotelPrice(key, q.stay);
  const level = COUNTRY_PRICE_LEVEL[region.country];
  const foodPerDayUsd = level == null ? null : FOOD_USD_US * level;
  const liveFlight = liveFlightKrw(key, q.startDate);
  const flightKrw = liveFlight ?? FLIGHT_KRW[key] ?? null;
  const priceSource = { flight: liveFlight != null ? "live" as const : "static" as const, hotel: liveHotelPrices(key) ? "live" as const : "static" as const, updatedAt: liveSummary()?.updatedAt ?? null };
  const usd = hotelNightUsd != null && foodPerDayUsd != null ? hotelNightUsd * rooms / people + foodPerDayUsd : null;
  const partyTotalKrw = hotelNightUsd != null && foodPerDayUsd != null && flightKrw != null && days >= 2
    ? Math.round(flightKrw * people + (hotelNightUsd * rooms * nights + foodPerDayUsd * people * days) * KRW_PER_USD) : null;
  const totalKrw = partyTotalKrw == null ? null : Math.round(partyTotalKrw / people);
  const budget = q.totalBudgetKrw != null && Number.isFinite(q.totalBudgetKrw) && q.totalBudgetKrw > 0 ? q.totalBudgetKrw : null;
  const budgetStatus = budget == null ? "unset" : partyTotalKrw == null ? "unknown" : partyTotalKrw <= budget ? "within" : "over";
  // 과거 가격대와 식비 가정의 합계. 수집값이 있어도 해당 날짜의 예약 견적은 아니다.
  return { usd, flightKrw, totalKrw, partyTotalKrw, tier: null, estimated: true, rooms, roomEstimated, nights, hotelNightUsd, foodPerDayUsd, budgetStatus, priceSource };
}

/** 지역 물가는 나라 물가 수준으로 구분한다. 인원·객실·항공비에 따라 물가가 바뀌지 않는다. */
function stayTiers(rs: RegionResult[]) {
  const vals = rs.map((r) => COUNTRY_PRICE_LEVEL[r.region.country]).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (!vals.length) return;
  const cut1 = vals[Math.ceil(vals.length / 3) - 1];
  const cut2 = vals[Math.ceil((vals.length * 2) / 3) - 1];
  for (const r of rs) {
    const level = COUNTRY_PRICE_LEVEL[r.region.country];
    if (level != null) r.stay.tier = level <= cut1 ? "저렴" : level <= cut2 ? "보통" : "높음";
  }
}

export function tripDays(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 86400000) + 1 : 0;
}

/** 여행일이 가장 많이 포함된 월 (동률이면 출발월) */
export function weatherMonth(start: string, end: string) {
  // 달력 날짜(YYYY-MM-DD) 기준. new Date("YYYY-MM-DD")는 UTC라 로컬 월로 읽으면 시간대마다 달라진다.
  const count = new Map<number, number>();
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    const m = d.getUTCMonth() + 1;
    count.set(m, (count.get(m) ?? 0) + 1);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const first = Number(start.slice(5, 7));
  let best = first;
  count.forEach((n, m) => {
    if (n > (count.get(best) ?? 0)) best = m;
  });
  return best;
}

export function judgeWeather(w: MonthWeather, month: number, year = 2026): { judge: WeatherJudge; adj: number } {
  const days = new Date(year, month, 0).getDate();
  const hits: { judge: WeatherJudge; adj: number }[] = [];
  if (w.tmax >= 33) hits.push({ judge: "혹서기", adj: -1 });
  // 일조 미확인으로 지속형 우기를 단정하지 않는다.
  if (w.rainDays >= 15 && w.sunHours !== null) hits.push(w.sunHours / days >= 6 ? { judge: "스콜성 우기", adj: -0.5 } : { judge: "지속형 우기", adj: -1 });
  if (hits.length) return hits.reduce((a, b) => (b.adj < a.adj ? b : a));
  if (w.rainDays >= 15 && w.sunHours === null) return { judge: "미확인", adj: 0 };
  if (w.rainDays <= 7 && w.tmax >= 18 && w.tmax <= 28) return { judge: "좋음", adj: 0.5 };
  return { judge: "보통", adj: 0 };
}

export function isMealPlace(p: PlaceV1): boolean {
  return p.tags.includes("로컬푸드") || p.tags.includes("카페·디저트") || /레스토랑|식당|씨푸드|Restaurant|Seafood/i.test(p.name + p.en);
}

/** 핵심 취향이 하나만 높은 점수의 장소에 밀리지 않도록 먼저 고르게 선택한다. */
function balancedTop(scored: ScoredPlace[], n: number, interests: Concept[]): ScoredPlace[] {
  const pool = [...scored].sort((a, b) => b.score - a.score);
  const out: ScoredPlace[] = [];
  const uncovered = new Set(interests);
  while (out.length < n && pool.length) {
    pool.sort((a, b) => b.place.concepts.filter((c) => uncovered.has(c)).length - a.place.concepts.filter((c) => uncovered.has(c)).length || b.score - a.score);
    const next = pool.shift()!;
    out.push(next);
    next.place.concepts.forEach((c) => uncovered.delete(c));
  }
  return out;
}

// 인천 → 거점 편도 비행시간 추정 (정의서 V3 §4-3, 2026-11-05). 실제 노선·경유 데이터가 아니라 직선거리 추정이다.
const ICN = { lat: 37.46, lon: 126.44 };
const COORD = new Map(WORLD_REGIONS.map((r) => [r.id, { lat: r.lat, lon: r.lon }]));
export function estimateFlightHours(regionId: string): number | null {
  const c = COORD.get(PILOT_TWIN_OF[regionId] ?? regionId);
  if (!c) return null;
  const rad = Math.PI / 180;
  const a = Math.sin(((c.lat - ICN.lat) * rad) / 2) ** 2 + Math.cos(ICN.lat * rad) * Math.cos(c.lat * rad) * Math.sin(((c.lon - ICN.lon) * rad) / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(a));
  // 항로 우회 10% + 순항 800km/h + 이착륙 0.5시간. 경유·제트기류는 반영 못 함(±2시간 오차 가능)
  const h = (km * 1.1) / 800 + 0.5;
  return Math.round(h * 2) / 2;
}

export function scoreRegions(input: RegionQuery): RegionResult[] {
  const q = normalizeParty(input);
  const N = plannedVisitCount(q);
  const month = weatherMonth(q.startDate, q.endDate);
  const interests = coreInterests(q);
  const minors = q.children.length > 0;

  const results = ALL_REGIONS.map((region): RegionResult => {
    const places = ALL_PLACES.filter((p) => p.region === region.id && !isMealPlace(p));
    const excluded: RegionResult["excluded"] = [];
    const flags = new Set<string>(partyFlags(q));
    const scored: ScoredPlace[] = [];

    for (const p of places) {
      if (p.grade == null) continue;
      if (!openDuring(p, q.startDate, q.endDate)) continue; // 기간 한정 행사·시즌이 여행 날짜와 안 맞음
      // 미식은 선택했을 때만 후보 (§1-3)
      const weight = conceptWeight(p.concepts, q);
      if (!weight) continue;
      const fit = personalFit(p, q);
      fit.flags.forEach((f) => flags.add(f));
      if (minors && p.adultOnly) flags.add(`${p.name}: 미성년 동반 가능 여부 확인 필요`);
      if (membersOf(q).some((m) => m.mobility === "limited") && p.steep === null) flags.add(`${p.name}: 급경사 여부 확인 필요`);
      if (minors && p.note?.includes("키 제한") && q.children.some((c) => c.height === null)) flags.add("키 제한 확인 필요");
      if (q.pet) flags.add("반려동물 출입 미확인");
      // 동행 적합은 전체 중 일부에만 반영한다. AI의 0점으로 이용 불가를 만들지 않는다.
      scored.push({ place: p, weight, score: (GRADE_SCORE[p.grade] - p.penalty) * weight * (0.75 + fit.factor * 0.25) });
    }

    const w = WEATHER_V1[region.id] ?? (WORLD_WEATHER[region.id] ? { source: WORLD_WEATHER_SOURCE, months: WORLD_WEATHER[region.id] } : undefined);
    const wj = w?.months[month] ? judgeWeather(w.months[month], month, Number(q.startDate.slice(0, 4))) : { judge: "미확인" as const, adj: 0 };
    const mw = w?.months[month];
    const weather = { month, ...wj, source: w?.source ?? "날씨 데이터 없음", tmax: mw?.tmax, rainDays: mw?.rainDays };
    const flightHours = estimateFlightHours(region.id);
    const top = balancedTop(scored, N, interests);

    const meals = ALL_PLACES.filter((p) => p.region === region.id && (isMealPlace(p) || !!p.dining)).length;
    const mealsNeeded = tripDays(q.startDate, q.endDate) * 2; // 점심·저녁
    const readiness = { meals, mealsNeeded, ready: top.length >= N && meals >= Math.ceil(mealsNeeded / 2) };
    const base = { region, rank: 0, N, weather, readiness, excluded, flags: [...flags], stay: estimateTripCost(region, q), flightHours, overFlight: false };
    if (!places.length) return { ...base, status: "데이터 부족", score: 0, display: 0, top: [], filled: 0, reasons: [] };
    if (!top.length) return { ...base, status: "조건 충족 장소 없음", score: 0, display: 0, top: [], filled: 0, reasons: [] };

    const coverage = interests.length ? interests.filter((c) => top.some((t) => t.place.concepts.includes(c))).length / interests.length : 1;
    // 미조사 자리를 0점으로 채우지 않는다. 데이터 충실도는 별도 사유로 알린다.
    let score = top.reduce((s, x) => s + x.score, 0) / top.length * (0.6 + 0.4 * coverage) + wj.adj;
    if (base.stay.budgetStatus === "over" && q.budgetMode !== "cap" && q.totalBudgetKrw && base.stay.partyTotalKrw) {
      score -= Math.min(1, base.stay.partyTotalKrw / q.totalBudgetKrw - 1);
      base.flags.push("예상 경비가 희망 예산을 넘어 적합도를 낮췄어요");
    }
    if (base.stay.budgetStatus === "unknown") base.flags.push("예상 총경비 미확인: 예산 안에 드는지 판단할 수 없어요");
    base.flags.push("경비는 항공·숙박·식비 추정 합계이며 현지 교통·입장료·보험은 별도예요");
    const display = Math.min(100, Math.max(0, (score / MAX_SCORE) * 100));
    return { ...base, status: "ranked", score, display, top, filled: top.length, reasons: buildReasons(q, region, top, weather, N, flightHours) };
  });

  // 현지 물가 선택과 일행 전체 예산 상한을 서로 독립적으로 적용한다.
  stayTiers(results);
  if (q.price !== "상관없음")
    for (const r of results) if (r.status === "ranked" && r.stay.tier !== q.price) r.status = r.stay.tier ? "예산 밖" : "물가 미확인";
  if (q.budgetMode === "cap") for (const r of results) {
    if (r.status !== "ranked") continue;
    if (r.stay.budgetStatus === "over") r.status = "예산 밖";
    if (r.stay.budgetStatus === "unknown") r.status = "물가 미확인";
  }

  // 희망 비행시간을 넘는 곳은 빼지 않고 순위 맨 뒤로 보낸다 (형님 결정 2026-11-05)
  const maxH = q.maxFlightHours ?? null;
  for (const r of results) {
    if (r.status !== "ranked" || maxH == null || r.flightHours == null || r.flightHours <= maxH) continue;
    r.overFlight = true;
    r.reasons.unshift(`희망 비행시간 초과: 편도 약 ${r.flightHours}시간(추정)으로 희망 ${maxH}시간을 넘어 순위를 뒤로 내렸어요`);
  }

  // 희망 비행시간 안쪽 먼저, 그 안에서 높은 점수 순, 동점은 공동 순위
  const ranked = results.filter((r) => r.status === "ranked").sort((a, b) => Number(a.overFlight) - Number(b.overFlight) || b.score - a.score);
  ranked.forEach((r, i) => (r.rank = i > 0 && r.score === ranked[i - 1].score && r.overFlight === ranked[i - 1].overFlight ? ranked[i - 1].rank : i + 1));
  return [...ranked, ...results.filter((r) => r.status !== "ranked")];
}

/** 카드에 보여줄 사유: 점수에 실제로 들어간 요소만, 사람이 읽는 말로 쓴다 */
function buildReasons(q: RegionQuery, region: RegionV1, top: ScoredPlace[], w: RegionResult["weather"], N: number, flightHours: number | null): string[] {
  const out: string[] = [];
  const s = top.filter((t) => t.place.grade === "S").map((t) => t.place.name);
  const a = top.filter((t) => t.place.grade === "A").map((t) => t.place.name);
  if (s.length) out.push(`${s.slice(0, 2).join("·")}: 이것 보러 ${region.country}에 가는 곳`);
  else if (a.length) out.push(`${a.slice(0, 2).join("·")}: 가면 일정을 바꿔서라도 들르는 곳`);
  const days = tripDays(q.startDate, q.endDate);
  const interests = coreInterests(q);
  const fits = interests.filter((c) => top.some((t) => t.place.concepts.includes(c)));
  if (top.length >= N && fits.length) out.push(`${fits.join("·")} 위주로 ${days}일을 꽉 채울 만큼 갈 곳이 있어요`);
  for (const c of interests.filter((c) => !fits.includes(c))) out.push(`${c}에 맞는 곳은 아직 부족해요`);
  if (w.tmax != null && w.rainDays != null) {
    const feel = w.adj > 0 ? "다니기 좋아요" : w.adj < 0 ? `${w.judge}라 감점했어요` : "무난해요";
    out.push(`${w.month}월 낮 최고 ${Math.round(w.tmax)}℃, 비 오는 날 월 ${Math.round(w.rainDays)}일 안팎으로 ${feel}`);
  } else if (w.adj !== 0) out.push(`${w.month}월 ${w.judge}`);
  if (flightHours != null) out.push(`인천에서 편도 약 ${flightHours}시간 (거리로 추정)`);
  if (top.length < N) out.push(`일정 ${N}칸에 비해 등록된 곳이 ${top.length}곳뿐이에요`);
  const far = top.filter((t) => t.place.penalty > 0);
  if (far.length) out.push(`${far.map((t) => t.place.name).join("·")}은 거점에서 멀어 감점`);
  return out;
}
