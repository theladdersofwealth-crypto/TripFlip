"use client";
// 수집 서버(tripflip-collector)가 매번 다시 계산하는 최근 평균가를 앱이 열릴 때 읽어 온다.
// 못 읽으면(오프라인·서버 오류) 앱에 들어 있는 10/31 자료(worldPrices·worldHotels)를 그대로 쓴다.
import { useEffect, useState } from "react";
import { WORLD_REGIONS } from "@/data/worldV1";

export const SUMMARY_URL = "https://tripflip-collector.ohysky0127.workers.dev/summary";
const CACHE_KEY = "tripflip:live-prices:v1";
const FRESH_MS = 60 * 60 * 1000;

export interface LiveSummary {
  updatedAt: string;
  windowDays: number;
  days: { flight: number; hotel: number };
  counts: { flightSnapshots: number; hotelBatches: number };
  /** 도착 도시코드 → { "YYYY-MM": [원, 표본수] } */
  flights: Record<string, Record<string, [number, number]>>;
  /** 권역(시범 5곳 NT·HK·OS·DN·PQ, 나머지는 권역 id) → [[USD, 표본수]] 숙소별 평균, 싼 순. 품질 기준 통과 숙소만 */
  hotels: Record<string, [number, number][]>;
  v?: number;
}

let live: LiveSummary | null = null;
let request: Promise<LiveSummary | null> | null = null; // 화면을 옮겨도 한 번만 요청
export function setLiveSummary(s: LiveSummary | null) {
  live = s && typeof s === "object" && s.v === 2 && s.flights && s.hotels ? s : null;
}
export function liveSummary() {
  return live;
}

// 공항 → 여행사 도시 코드 (scripts/build-world-prices.mjs 와 같은 표)
const CITY: Record<string, string> = { hnd: "TYO", nrt: "TYO", kix: "OSA", cxr: "NHA", pvg: "SHA", pek: "BJS", jfk: "NYC", cdg: "PAR", fco: "ROM", lhr: "LON", cgk: "JKT", mxp: "MIL", yyz: "YTO", yul: "YMQ", sai: "REP", kti: "PNH", cts: "SPK", mfm: "MFM" };
const AIRPORT = new Map(WORLD_REGIONS.map((r) => [r.id, r.airportCode]));
const PILOT_CODE: Record<string, string> = { "jap-osaka": "OS", "vie-nhatrang": "NT", "hon-hongkong": "HK", "vie-danang": "DN", "vie-phuquoc": "PQ" };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** 인천발 1인 왕복 평균 최저가(원). 출발월 값이 있으면 그 달, 없으면 수집된 달들의 중간값 */
export function liveFlightKrw(regionKey: string, startDate?: string): number | null {
  const ap = AIRPORT.get(regionKey);
  const months = ap && live?.flights[CITY[ap] ?? ap.toUpperCase()];
  if (!months) return null;
  const m = startDate?.slice(0, 7);
  if (m && months[m]) return months[m][0];
  const vals = Object.values(months).map((v) => v[0]);
  return vals.length ? Math.round(median(vals) / 1000) * 1000 : null;
}

/** 권역의 품질 기준(총점 4.5↑·리뷰 300↑) 통과 숙소 1박 평균 최저가(USD), 싼 순. 5곳 미만이면 null */
export function liveHotelPrices(regionKey: string): number[] | null {
  const list = live?.hotels[PILOT_CODE[regionKey] ?? regionKey];
  if (!list) return null;
  const prices = list.map(([usd]) => usd).filter((usd) => usd > 0).sort((a, b) => a - b);
  return prices.length >= 5 ? prices : null;
}

function readCache(): { at: number; data: LiveSummary } | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    return v && typeof v.at === "number" && v.data ? v : null;
  } catch {
    return null;
  }
}

/** 최근 평균가를 불러오고, 바뀌면 숫자가 올라간다(useMemo 의존값으로 쓴다) */
export function useLivePrices(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    const cached = readCache();
    if (cached && !live) {
      setLiveSummary(cached.data);
      setVersion((v) => v + 1);
    }
    if (cached && Date.now() - cached.at < FRESH_MS) return;
    request ??= fetch(SUMMARY_URL, { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LiveSummary | null) => {
        if (!data) return null;
        setLiveSummary(data);
        if (live) try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch {}
        return live;
      })
      .catch(() => null);
    request.then((data) => { if (alive && data) setVersion((v) => v + 1); });
    return () => { alive = false; };
  }, []);
  return version;
}
