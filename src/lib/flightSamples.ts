"use client";
// 수집 서버에 쌓인 가장 최근 항공 수집본(Travelpayouts, 최근 48시간 검색 캐시)에서
// 이 여행지·출발월의 실제 항공편 예시(항공사·출발/귀국 시각·경유·가격)를 꺼낸다.
// 경비 계산에는 쓰지 않는다. "경비의 항공 값이 어떤 표에서 나왔는지" 보여 주는 용도.
import { flightCodes } from "@/lib/livePrices";

const BASE = "https://tripflip-collector.ohysky0127.workers.dev";

/** [도착, 출발시각, 귀국시각, 가격(원), 항공사 코드, 가는 편 경유, 오는 편 경유, 왕복 비행 분] */
type Row = [string, string, string, number, string, number, number, number];
interface Snapshot { collectedAt: string; routes: Record<string, { months: Record<string, Row[]> }>; world: { months: Record<string, Row[]> } }

export interface FlightSample {
  airline: string;
  airlineCode: string;
  depart: string; // 출발지 현지 시각 "2026-12-10T21:50"
  ret: string; // 귀국편 출발 현지 시각
  stops: number; // 가는 편 경유 횟수
  retStops: number;
  minutes: number | null; // 왕복 비행 합계(분)
  krw: number;
  /** 내 출발·귀국일과 며칠 차이(합) */
  gap: number;
}

const AIRLINES: Record<string, string> = {
  KE: "대한항공", OZ: "아시아나항공", "7C": "제주항공", LJ: "진에어", TW: "티웨이항공", BX: "에어부산", RS: "에어서울", ZE: "이스타항공", YP: "에어프레미아", RF: "에어로케이", "4V": "플라이강원", "4H": "하이에어",
  VJ: "비엣젯항공", VN: "베트남항공", QH: "뱀부항공", VU: "비엣트래블항공",
  CX: "캐세이퍼시픽", UO: "홍콩익스프레스", HX: "홍콩항공", HB: "그레이터베이항공", NX: "에어마카오",
  JL: "일본항공", NH: "전일본공수(ANA)", MM: "피치항공", GK: "젯스타재팬", BC: "스카이마크", "7G": "스타플라이어", NU: "일본트랜스오션항공", ZG: "집에어",
  CI: "중화항공", BR: "에바항공", IT: "타이거에어 타이완", JX: "스타럭스항공",
  CA: "중국국제항공", MU: "중국동방항공", CZ: "중국남방항공", FM: "상하이항공", HO: "준야오항공", "9C": "춘추항공", SC: "산둥항공", ZH: "선전항공", MF: "샤먼항공", "3U": "쓰촨항공", QW: "칭다오항공", HU: "하이난항공", GS: "톈진항공", KN: "중국연합항공", DZ: "둥하이항공",
  TG: "타이항공", FD: "타이 에어아시아", XJ: "타이 에어아시아 X", SL: "타이 라이언에어", WE: "타이 스마일", DD: "녹에어", PG: "방콕에어웨이즈", VZ: "타이 비엣젯",
  PR: "필리핀항공", "5J": "세부퍼시픽", Z2: "필리핀 에어아시아",
  SQ: "싱가포르항공", TR: "스쿠트", MH: "말레이시아항공", AK: "에어아시아", D7: "에어아시아 X", OD: "바틱에어 말레이시아",
  GA: "가루다인도네시아", QZ: "인도네시아 에어아시아", JT: "라이언에어(인니)", ID: "바틱에어",
  KC: "에어아스타나", OM: "몽골항공(MIAT)", UL: "스리랑칸항공", AI: "에어인디아", "6E": "인디고",
  EK: "에미레이트항공", QR: "카타르항공", EY: "에티하드항공", TK: "튀르키예항공", SV: "사우디아항공", MS: "이집트항공", ET: "에티오피아항공",
  LH: "루프트한자", AF: "에어프랑스", KL: "KLM", BA: "영국항공", AY: "핀에어", LO: "LOT 폴란드항공", OS: "오스트리아항공", LX: "스위스항공", AZ: "ITA항공", IB: "이베리아항공", TP: "TAP 포르투갈항공", SK: "스칸디나비아항공",
  DL: "델타항공", UA: "유나이티드항공", AA: "아메리칸항공", AC: "에어캐나다", HA: "하와이안항공", AS: "알래스카항공", WS: "웨스트젯",
  QF: "콴타스", JQ: "젯스타", VA: "버진오스트레일리아", NZ: "에어뉴질랜드", FJ: "피지항공",
  AM: "아에로멕시코", CM: "코파항공", LA: "라탐항공",
};
export const airlineName = (code: string) => AIRLINES[code] ?? `항공사 코드 ${code}`;

let latest: Promise<Snapshot | null> | null = null;
function loadLatest(): Promise<Snapshot | null> {
  latest ??= fetch(`${BASE}/flight-latest`, { signal: AbortSignal.timeout(12000) })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((s) => { if (!s) latest = null; return s; }); // 실패하면 다음에 다시 시도
  return latest;
}

const day = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z") / 864e5;

/** 같은 출발월 항공편 중 내 날짜와 가까운 순(같으면 싼 순). 수집 시각도 함께 */
export function pickSamples(snap: Snapshot, regionKey: string, startDate: string, endDate: string, limit = 5): { collectedAt: string; cheapest: FlightSample | null; near: FlightSample[] } {
  const codes = flightCodes(regionKey);
  const month = startDate.slice(0, 7);
  const want = new Set(codes ? [codes.airport, codes.city] : []);
  const rows: Row[] = [];
  if (codes) {
    rows.push(...(snap.routes?.[codes.airport]?.months?.[month] ?? []));
    rows.push(...(snap.world?.months?.[month] ?? []).filter((r) => want.has(r[0])));
  }
  const seen = new Set<string>();
  const list: FlightSample[] = [];
  for (const r of rows) {
    const [, dep, ret, krw, code, stops, retStops, minutes] = r;
    if (typeof krw !== "number" || krw <= 0 || typeof dep !== "string" || typeof ret !== "string" || !dep || !ret) continue;
    const id = `${dep}|${ret}|${code}|${krw}`;
    if (seen.has(id)) continue;
    seen.add(id);
    list.push({ airline: airlineName(code), airlineCode: code, depart: dep.slice(0, 16), ret: ret.slice(0, 16), stops: stops ?? 0, retStops: retStops ?? 0, minutes: typeof minutes === "number" && minutes > 0 ? minutes : null, krw, gap: Math.abs(day(dep) - day(startDate)) + Math.abs(day(ret) - day(endDate)) });
  }
  const cheapest = list.reduce<FlightSample | null>((a, b) => (!a || b.krw < a.krw ? b : a), null);
  const near = [...list].sort((a, b) => a.gap - b.gap || a.krw - b.krw).slice(0, limit);
  return { collectedAt: snap.collectedAt, cheapest, near };
}

export async function loadFlightSamples(regionKey: string, startDate: string, endDate: string) {
  const snap = await loadLatest();
  return snap ? pickSamples(snap, regionKey, startDate, endDate) : null;
}
