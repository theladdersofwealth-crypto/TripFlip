// TripFlip 도메인 타입.
// 원칙: 값을 모르면 null 로 두고 UI 에서 "미확인"으로 표시한다. 절대 추측해서 채우지 않는다.

/** true/false = 확인됨, null = 미확인 */
export type Tri = boolean | null;

/** 데이터 출처. DEMO = 시연용 샘플(SAMPLE_DATA), USER = 사용자 입력, API = 실제 연동 */
export type DataSource = "DEMO" | "USER" | "API";

export type Intensity = "relaxed" | "normal" | "packed";
export type Budget = "value" | "balanced" | "premium";
export type Pref =
  | "sightseeing"
  | "nature"
  | "relax"
  | "food"
  | "shopping"
  | "culture"
  | "history"
  | "activity"
  | "kids"
  | "photo"
  | "night";

export interface Party {
  adults: number;
  children: number;
  childAges: number[];
}

export interface TripConditions {
  origin: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  party: Party;
  budget: Budget;
  intensity: Intensity;
  prefs: Pref[];
  stroller: boolean;
}

// ---------- Geography (TripFlip Travel Master 구조) ----------
export interface TourismArea {
  id: string;
  name: string;
  nameEn: string;
  administrativeDivision: string | null;
  geographicCoverage: string | null;
  duplicateNote: string | null; // 데이터 관리용, UI 비노출
  destinationId: string | null; // 일정 데이터가 연결된 경우
}
export interface Country {
  id: string;
  name: string;
  nameEn: string;
  areas: TourismArea[];
}
export interface Subregion {
  id: string;
  name: string;
  countries: Country[];
}
export interface Continent {
  id: string;
  name: string;
  subregions: Subregion[];
}

// ---------- Destination (발견 카드) ----------
export interface Destination {
  id: string;
  name: string;
  nameEn: string;
  country: string;
  character: string[]; // 여행 성격 태그
  prefs: Pref[];
  reason: string;
  expectedIntensity: string;
  highlights: string[];
  season: string | null; // 추천 시기 (모르면 null)
  flightFromKorea: string | null;
  budgetFit: Budget[];
  kidFriendly: Tri;
  hasItineraryData: boolean;
  tone: string; // 이미지 대체 배경색
  scores: Record<string, number> | null; // 데이터에 점수가 있을 때만
  source: DataSource;
}

// ---------- 숙박 지역 ----------
export interface Zone {
  id: string;
  destinationId: string;
  name: string;
  description: string;
  goodFor: Pref[];
  kidFriendly: Tri;
  note: string;
  source: DataSource;
}

// ---------- POI ----------
export type IndoorType = "indoor" | "outdoor" | "mixed";
export type BestTime = "morning" | "afternoon" | "evening" | "any";

export interface Place {
  id: string;
  destinationId: string;
  name: string;
  nameEn: string;
  category: string;
  prefs: Pref[];
  zoneId: string;
  indoor: IndoorType;
  rainOk: Tri;
  grade: number | null; // 추천 등급 1~5
  kidScore: number | null; // 아이 적합도 1~5
  fatigue: number | null; // 피로도 1~5
  stayMinutes: number; // 예상 체류시간(계획용 추정치)
  minKidAge: number | null;
  bestTime: BestTime;
  hours: string | null; // 운영시간 — 확인 전 null
  reservation: Tri;
  stroller: Tri;
  address: string | null;
  reason: string;
  source: DataSource;
}

// ---------- Restaurant ----------
export type MealKind = "lunch" | "dinner";

export interface Restaurant {
  id: string;
  destinationId: string;
  name: string;
  cuisine: string;
  zoneId: string;
  signature: string | null;
  priceLevel: string | null;
  hours: string | null;
  reservation: Tri;
  kidsChair: Tri;
  kidsMenu: Tri;
  kidFriendlyMenu: string | null;
  spicy: "mild" | "medium" | "hot" | null;
  clean: string | null;
  aircon: Tri;
  card: Tri;
  rainOk: Tri;
  seats6: Tri;
  negativeSummary: string | null;
  confidence: string | null;
  lastVerified: string | null;
  mealTypes: MealKind[];
  source: DataSource;
}

// ---------- Trip / Itinerary ----------
export type ItemType = "hotel" | "place" | "meal" | "rest" | "gap" | "booked";

export interface ItineraryItem {
  id: string;
  type: ItemType;
  placeId?: string;
  restaurantId?: string;
  title?: string; // rest / booked / hotel 표시명
  startTime: string; // HH:MM
  endTime: string;
  travelMinutes: number | null; // 이전 일정에서 이동시간
  travelEstimated: boolean; // true = DEMO 추정치
  reason: string;
  confidence: "DEMO" | "USER" | "HIGH" | "LOW";
  mealKind?: MealKind;
  restKind?: "nap" | "free" | "checkin" | "checkout" | "return";
  favorite?: boolean;
  locked?: boolean; // 반드시 방문 / 예약 일정 → 재최적화 시 보존
  gapOf?: string; // 삭제된 항목 이름 (빈 시간 표시용)
  gapRef?: string; // 삭제된 장소/식당 id (재추천에서 제외)
}

export interface DayWeather {
  min: number | null;
  max: number | null;
  rain: "low" | "mid" | "high" | null;
  wind: "none" | "some" | "strong" | null;
  source: "none" | "demo-simulation" | "api";
}

export interface Day {
  dayNumber: number;
  date: string;
  weather: DayWeather;
  items: ItineraryItem[];
}

export interface BookedEvent {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
}

export interface TripProfile {
  conditions: TripConditions;
  hotel: { name: string; zoneId: string | null };
  checkIn: string; // HH:MM (1일차 체크인)
  checkOut: string; // HH:MM (마지막날 체크아웃)
  meals: { lunch: [string, string]; dinner: [string, string] };
  mustVisit: string[];
  exclude: string[];
  booked: BookedEvent[];
  transport: { rentalCar: boolean; publicTransit: boolean; taxi: boolean };
}

/** 추천 엔진이 반환하는 구조 (추후 AI 추천 API 응답과 동일하게 맞춘다) */
export interface TripRecommendation {
  destination: string;
  dates: { start: string; end: string };
  profile: TripProfile;
  days: Day[];
}

export interface Trip extends TripRecommendation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  favorites: string[]; // place / restaurant id
  demo: boolean;
}
