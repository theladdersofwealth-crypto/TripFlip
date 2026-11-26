// 권역 추천 정의서 V1 (§1-1, §1-4, §3) 점수 계산.
import { GRADE_SCORE, PLACES_V1, REGIONS_V1, WEATHER_V1 } from "@/data/regionsV1";
import type { Concept, MonthWeather, PlaceV1, RegionV1, WeatherJudge } from "@/data/regionsV1";
import { WORLD_PLACES, WORLD_REGIONS } from "@/data/worldV1";
import { applyWikiBoost } from "@/data/wikiBoost";
import { openDuring } from "@/data/seasonal";
import { WORLD_WEATHER, WORLD_WEATHER_SOURCE } from "@/data/worldWeather";
import { COUNTRY_PRICE_LEVEL as WB_PRICE_LEVEL, FLIGHT_ESTIMATED, FLIGHT_KRW, FOOD_USD_US, HOTEL_ESTIMATED, HOTEL_MEDIAN_USD, KRW_PER_USD } from "@/data/worldPrices";
import { HOTELS } from "@/data/worldHotels";
import { EXTRA_PRICE_LEVEL, HOTEL_ESTIMATE_USD } from "@/data/hotelEstimates";
import { liveFlightKrw, liveHotelPrices, liveSummary } from "@/lib/livePrices";
import { applyApprovedFacts } from "@/data/approvedCatalog";
import { DINING_PLACES, isPendingDining, withMapDining } from "@/data/dining";
import { DINING_SCORE, scoreVerifiedDining, type DiningEvidence } from "@/services/diningScore";
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
  "쇼핑몰·아웃렛": ["쇼핑"], 시장: ["쇼핑", "미식"], "야경·야시장": ["쇼핑"], 핫플: ["쇼핑"],
  로컬푸드: ["미식"], "카페·디저트": ["미식"],
  "해변·섬": ["휴양"], 온천: ["휴양"], "마사지·스파": ["휴양"],
  체험: ["액티비티"], 테마파크: ["액티비티"], 해양: ["액티비티"], "트레킹·하이킹": ["액티비티"], 스키: ["액티비티"], 골프: ["액티비티"],
};
/** 복합 태그에서 실제 시장/음식점만 미식으로 보강. 기존 명시 컨셉과 쇼핑 분류는 유지한다. */
export function withConcepts(p: PlaceV1): PlaceV1 {
  const inferred = p.tags.flatMap((t) => TAG_CONCEPT[t] ?? []);
  const ambiguous = p.tags.includes("야경·야시장") || p.tags.includes("핫플");
  const namedMarket = /야시장|나이트\s*마켓|\bnight[\s-]*market\b|어시장|\bfish\s+market\b/i.test(p.name + " " + p.en);
  if (ambiguous && (namedMarket || isMealPlace(p))) inferred.push("미식");
  const add = inferred.filter((c) => !p.concepts.includes(c));
  return add.length ? { ...p, concepts: [...p.concepts, ...new Set(add)] } : p;
}
export const ALL_PLACES: PlaceV1[] = withMapDining([
  ...PLACES_V1,
  ...WORLD_PLACES.flatMap((p) => {
    const pilot = PILOT_OF[p.region];
    if (!pilot) return [p];
    if (pilotKeys.has(`${pilot}|${p.en.toLowerCase()}`)) return [];
    if (PLACES_V1.some((q) => q.region === pilot && (q.name.startsWith(p.name) || p.name.startsWith(q.name)))) return [];
    return [{ ...p, region: pilot }];
  }),
  ...DINING_PLACES,
]).map(withConcepts).map(applyApprovedFacts).map(applyWikiBoost);

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
  weight: number;
}

export interface RegionResult {
  region: RegionV1;
  status: "ranked" | "데이터 부족" | "조건 충족 장소 없음" | "볼거리 부족" | "예산 밖" | "물가 미확인";
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
  sightseeing: ReturnType<typeof sightseeingCoverage>;
  admissionNeedsCheck: boolean;
  /** 일정 준비 상태: 등록된 식당·카페 수와, 관광·식사 모두 여행 기간을 채울 수 있는지 */
  readiness: { meals: number; mealsNeeded: number; ready: boolean };
  /** 미식 선택 시에만 제공. score=null은 검증 자료 부족, share=0은 기존 볼거리 대체. */
  diningFit?: DiningEvidence & { weight: number; share: number };
  weather: { month: number; judge: WeatherJudge; adj: number; source: string; tmax?: number; rainDays?: number };
  excluded: { place: PlaceV1; reason: string }[];
  flags: string[];
  reasons: string[];
  /** 선택 테마별 대표 명소 (추천 이유 맨 위) */
  themes?: { theme: Concept; icon: string; names: string[]; count: number }[];
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

// 나라 물가: 10/31 자료 + 새 권역 나라(세계은행 PLI, 11/24 추가)
const COUNTRY_PRICE_LEVEL: Record<string, number> = { ...WB_PRICE_LEVEL, ...EXTRA_PRICE_LEVEL };
/** 숙소 1박이 실측이 아니라 나라 물가로 추정한 값인 권역인지 (권역 키 = 시범 5곳은 세계 id) */
export function hotelEstimated(key: string) {
  return HOTEL_ESTIMATED.has(key) || HOTEL_ESTIMATE_USD[key] != null;
}

const TIER_RANGE: Record<StayTier, [number, number]> = { 가성비: [0, 0.3], 가심비: [0.3, 0.7], 프리미엄: [0.7, 0.9], 하이엔드: [0.9, 1.01] };
const TIER_FACTOR: Record<StayTier, number> = { 가성비: 0.67, 가심비: 1, 프리미엄: 1.67, 하이엔드: 2.78 };

/** 예약 화면과 같은 권역 내 가격 순 구간. 시설의 실제 서비스 등급을 보증하지 않는다. */
function hotelPrice(key: string, tier: StayTier): number | null {
  const prices = liveHotelPrices(key) ?? (HOTELS[key] ?? [])
    .filter((h) => h[1] >= 4.5 && h[2] >= 300 && h[3] > 0 && h[4] >= h[3])
    .map((h) => (h[3] + h[4]) / 2).sort((a, b) => a - b);
  // 숙소 목록이 없는 권역은 중간값에 숙소 수준 배수를 곱한다(목록 있는 51개 권역의 수준별 중간값 ÷ 전체 중간값)
  const base = HOTEL_MEDIAN_USD[key] ?? HOTEL_ESTIMATE_USD[key];
  const byTier = () => base != null ? Math.round(base * TIER_FACTOR[tier]) : null;
  if (!prices.length) return byTier();
  const [from, to] = TIER_RANGE[tier];
  const selected = prices.filter((_, i) => i / prices.length >= from && i / prices.length < to);
  if (!selected.length) return byTier();
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

type HotelActivityEvidence = {
  facility: "워터파크" | "키즈클럽";
  status: "verified" | "unknown";
};

/** 추천 숙소에 확인된 즐길거리가 있으면 시설 수에 관계없이 하루만 인정한다. */
export function sightseeingCoverage(days: number, eligible: number, hotelActivities: readonly HotelActivityEvidence[] = []) {
  const hotelDays = hotelActivities.some((activity) => activity.status === "verified") ? 1 : 0;
  const minimum = Math.ceil(days / 2);
  return { eligible, hotelDays, minimum, passes: eligible + hotelDays >= minimum, relaxed: eligible < days };
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
  if (w.tmax < 5) hits.push({ judge: "혹한기", adj: -1 }); // 낮 최고 5℃ 미만 (11/24 추가: 4월 홉스골 3℃가 "무난"으로 1위 되던 문제)
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

/** 확인된 제한을 실제 인원 정보에 적용한다. 미입력은 입장 금지 근거로 쓰지 않는다. */
function admissionFor(p: PlaceV1, members: TravelMember[]): "blocked" | "check" | "no-block" {
  const evidence = p.admission;
  let needsCheck = evidence?.needsCheck ?? false;
  for (const member of members) {
    for (const [value, minimum] of [[member.age, evidence?.minimumAge], [member.height, evidence?.minimumHeightCm]]) {
      if (minimum == null) continue;
      if (value == null || !Number.isFinite(value)) needsCheck = true;
      else if (value < minimum) return "blocked";
    }
  }
  return needsCheck ? "check" : "no-block";
}

export function scoreRegions(input: RegionQuery): RegionResult[] {
  const q = normalizeParty(input);
  const N = plannedVisitCount(q);
  const days = tripDays(q.startDate, q.endDate);
  const month = weatherMonth(q.startDate, q.endDate);
  const interests = coreInterests(q);
  const diningWeight = interests.includes("미식") ? conceptWeight(["미식"], q) : 0;
  const minors = q.children.length > 0;
  const members = membersOf(q);

  const results = ALL_REGIONS.map((region): RegionResult => {
    const places = ALL_PLACES.filter((p) => p.region === region.id && !isMealPlace(p));
    const excluded: RegionResult["excluded"] = [];
    const flags = new Set<string>(partyFlags(q));
    const scored: ScoredPlace[] = [];
    let eligible = 0;
    let admissionNeedsCheck = false;

    for (const p of places) {
      if (!openDuring(p, q.startDate, q.endDate)) continue;
      // 방문 가능한 볼거리는 추천 취향·등급과 별개로 센다.
      const admission = admissionFor(p, members);
      if (admission === "blocked") {
        excluded.push({ place: p, reason: "확인된 입장 조건을 충족하지 못해 추천 후보에서 제외" });
        continue;
      }
      eligible++;
      if (admission === "check" || (minors && (p.adultOnly || p.note?.includes("키 제한")))) admissionNeedsCheck = true;
      if (p.grade == null) continue;
      const weight = conceptWeight(p.concepts, q);
      if (!weight) continue;
      const fit = personalFit(p, q);
      fit.flags.forEach((f) => flags.add(f));
      if (minors && p.adultOnly) flags.add(`${p.name}: 미성년 동반 가능 여부 확인 필요`);
      if (members.some((m) => m.mobility === "limited") && p.steep === null) flags.add(`${p.name}: 급경사 여부 확인 필요`);
      if (minors && p.note?.includes("키 제한") && q.children.some((c) => c.height === null)) flags.add("키 제한 확인 필요");
      if (q.pet) flags.add("반려동물 출입 미확인");
      // 동행 적합은 전체 중 일부에만 반영한다. AI의 0점으로 이용 불가를 만들지 않는다.
      scored.push({ place: p, weight, score: (GRADE_SCORE[p.grade] - p.penalty) * weight * (0.5 + fit.factor * 0.5) });
    }

    const w = WEATHER_V1[region.id] ?? (WORLD_WEATHER[region.id] ? { source: WORLD_WEATHER_SOURCE, months: WORLD_WEATHER[region.id] } : undefined);
    const wj = w?.months[month] ? judgeWeather(w.months[month], month, Number(q.startDate.slice(0, 4))) : { judge: "미확인" as const, adj: 0 };
    const mw = w?.months[month];
    const weather = { month, ...wj, source: w?.source ?? "날씨 데이터 없음", tmax: mw?.tmax, rainDays: mw?.rainDays };
    const flightHours = estimateFlightHours(region.id);
    const top = balancedTop(scored, N, interests);

    const mealPlaces = ALL_PLACES.filter((p) => p.region === region.id && (isMealPlace(p) || !!p.dining));
    const meals = mealPlaces.filter((p) => !isPendingDining(p)).length;
    const mealsNeeded = days * 2; // 점심·저녁
    const readiness = { meals, mealsNeeded, ready: top.length >= N && meals >= Math.ceil(mealsNeeded / 2) };
    // 현재 추천 숙소 데이터는 이름·평점·후기·가격만 제공해 확인된 시설이 없다.
    const sightseeing = sightseeingCoverage(days, eligible);
    const dining = diningWeight ? scoreVerifiedDining(mealPlaces, days) : undefined;
    const diningFit = dining ? {
      ...dining, weight: diningWeight,
      share: dining.score == null ? 0 : top.length ? DINING_SCORE.share : 1,
    } : undefined;
    const diningKnown = diningFit?.score != null;
    const diningEnough = diningKnown && !!diningFit?.enough;
    const diningReason = diningFit
      ? diningFit.score == null
        ? "검증 식당 자료 미확인 · 기존 볼거리 기반 점수로 평가"
        : `검증 식당·카페 등 ${diningFit.verifiedCount}곳 · 미식 선택지 점수 ${diningFit.score.toFixed(2)}/5 · 확인 중 제외`
      : null;
    const base = { region, rank: 0, N, weather, readiness, sightseeing, admissionNeedsCheck, excluded, flags: [...flags], stay: estimateTripCost(region, q), flightHours, overFlight: false,
      ...(diningFit && { diningFit }) };
    if (!places.length && !diningEnough) return { ...base, status: "데이터 부족", score: 0, display: 0, top: [], filled: 0, reasons: diningReason ? [diningReason] : [] };
    if (!top.length && !diningEnough) return { ...base, status: "조건 충족 장소 없음", score: 0, display: 0, top: [], filled: 0, reasons: diningReason ? [diningReason] : [] };

    const coverage = interests.length ? interests.filter((c) => (c === "미식" && diningKnown) || top.some((t) => t.place.concepts.includes(c))).length / interests.length : 1;
    // 미조사 자리를 0점으로 채우지 않는다. 비미식/미확인은 기존 평균 그대로.
    const sightMean = top.length ? top.reduce((s, x) => s + x.score, 0) / top.length : 0;
    const themeMean = diningFit && diningFit.score != null
      ? (1 - diningFit.share) * sightMean + diningFit.share * diningFit.score * diningFit.weight
      : sightMean;
    let score = themeMean * (0.6 + 0.4 * coverage) + wj.adj;
    if (base.stay.budgetStatus === "over" && q.budgetMode !== "cap" && q.totalBudgetKrw && base.stay.partyTotalKrw) {
      score -= Math.min(1, base.stay.partyTotalKrw / q.totalBudgetKrw - 1);
      base.flags.push("예상 경비가 희망 예산을 넘어 적합도를 낮췄어요");
    }
    if (base.stay.budgetStatus === "unknown") base.flags.push("예상 총경비 미확인: 예산 안에 드는지 판단할 수 없어요");
    base.flags.push("경비는 항공·숙박·식비 추정 합계이며 현지 교통·입장료·보험은 별도예요");
    // 비행 부담: 여행 기간 중 왕복 비행에 쓰는 시간 비율만큼 낮춘다 (형님 11/24, 짧은 일정에 장거리 1위 방지)
    const transit = flightHours != null ? Math.min(0.5, (flightHours * 2) / (tripDays(q.startDate, q.endDate) * 24)) : 0;
    if (transit >= 0.1) base.flags.push(`왕복 비행 약 ${Math.round(flightHours! * 2)}시간이 일정의 ${Math.round(transit * 100)}%라 적합도를 낮췄어요`);
    score *= 1 - transit;
    // 미확인 감점(형님 11/24): 항공·숙소·날씨 중 실제 자료 없이 추정한 칸 하나당 10%, 최대 30%. 제외하지는 않는다.
    const key = PILOT_TWIN_OF[region.id] ?? region.id;
    const unknown = [
      base.stay.flightKrw == null || (base.stay.priceSource.flight !== "live" && FLIGHT_ESTIMATED.has(key)) ? "항공" : "",
      base.stay.hotelNightUsd == null || (base.stay.priceSource.hotel !== "live" && hotelEstimated(key)) ? "숙소" : "",
      weather.judge === "미확인" ? "날씨" : "",
    ].filter(Boolean);
    if (unknown.length) {
      score *= 1 - 0.1 * unknown.length;
      base.flags.push(`${unknown.join("·")} 자료가 없어 추정값이라 적합도를 ${unknown.length * 10}% 낮췄어요`);
    }
    const reasons = buildReasons(q, region, top, scored, weather, N, flightHours, diningKnown);
    if (diningReason) reasons.unshift(diningReason);
    if (diningEnough && !sightseeing.passes) reasons.push("검증 식당은 충분하지만 볼거리 자료는 부족해요");
    const display = Math.min(100, Math.max(0, (score / MAX_SCORE) * 100));
    return { ...base, status: "ranked", score, display, top, filled: top.length, reasons, themes: themeHighlights(coreInterests(q), scored).map((h) => ({ ...h, icon: THEME_ICON[h.theme] })) };
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

  for (const r of results) {
    if (r.status === "ranked" && !r.sightseeing.passes && !r.diningFit?.enough) r.status = "볼거리 부족";
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
const THEME_ICON: Record<Concept, string> = { 관광: "🏛️", 휴양: "🏖️", 액티비티: "🎢", 미식: "🍜", 쇼핑: "🛍️" };

/** 테마별 대표 명소: 그 테마가 첫 번째(주된) 성격인 곳, 등급 높은 곳, 위키 조회수 상위, 거점에서 가까운 곳 순. 테마끼리 겹치지 않게 */
export function themeHighlights(interests: Concept[], scored: ScoredPlace[], per = 2): { theme: Concept; names: string[]; count: number }[] {
  const used = new Set<string>();
  const fame = (p: PlaceV1, c: Concept) => GRADE_SCORE[p.grade ?? "D"] - p.penalty + (p.concepts[0] === c ? 0.5 : 0) + (p.wikiBoost ? 0.3 : 0) - 0.1 * (p.concepts.length - 1);
  return interests.map((theme) => {
    const pool = scored.filter((x) => x.place.concepts.includes(theme)).map((x) => x.place);
    const picks = pool.filter((p) => !used.has(p.id)).sort((a, b) => fame(b, theme) - fame(a, theme)).slice(0, per);
    picks.forEach((p) => used.add(p.id));
    return { theme, names: picks.map((p) => p.name), count: pool.length };
  }).filter((h) => h.names.length);
}

function buildReasons(q: RegionQuery, region: RegionV1, top: ScoredPlace[], scored: ScoredPlace[], w: RegionResult["weather"], N: number, flightHours: number | null, diningKnown = false): string[] {
  const out: string[] = [];
  const interests = coreInterests(q);
  const days = tripDays(q.startDate, q.endDate);
  const fits = interests.filter((c) => (c === "미식" && diningKnown) || top.some((t) => t.place.concepts.includes(c)));
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
