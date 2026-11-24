import type { RegionV1 } from "@/data/regionsV1";
import type { RegionQuery, StayTier } from "@/services/regionScore";
import { childBandOf, membersOf, roomEstimate } from "@/lib/travelParty";
import { HOTELS } from "@/data/worldHotels";
import type { HotelRow } from "@/data/worldHotels";
import { PILOT_TWIN_OF } from "@/services/regionScore";
import { agodaFlightsUrl, aviasalesSearchUrl, CJ, cjLink, klookHotelDetailUrl, klookHotelPrefilled, klookHotelUrl } from "@/services/affiliate";
import { liveHotelEntries } from "@/lib/livePrices";
import { HOTEL_NAMES } from "@/data/hotelNames";
import { HOTEL_KO } from "@/data/hotelKo";

export const STAY_TIERS: StayTier[] = ["가성비", "가심비", "프리미엄", "하이엔드"];

/** 권역 내 품질 기준(4.5↑·후기 300↑) 통과 숙소를 가격 순으로 나눈 숙소 수준별 후보 */
const TIER_RANGE: Record<StayTier, [number, number]> = { 가성비: [0, 0.3], 가심비: [0.3, 0.7], 프리미엄: [0.7, 0.9], 하이엔드: [0.9, 1.01] };

export interface HotelPick {
  name: string;
  key: string | null; // 트립어드바이저 숙소 키
  rating: number | null;
  reviews: number | null;
  /** 최근 2주 수집한 1박 최저가 평균(USD). 10/31 자료만 있으면 null */
  nightUsd: number | null;
  samples: number | null;
  /** 10/31 수집 1박 가격대(USD) */
  lo: number | null;
  hi: number | null;
}

const inBand = <T,>(sorted: T[], tier: StayTier) => {
  const [from, to] = TIER_RANGE[tier];
  return sorted.filter((_, i) => i / sorted.length >= from && i / sorted.length < to);
};

/**
 * 숙소 수준별 추천 숙소 최대 3곳. 경비에 넣는 1박 값(구간 중간값)과 가까운 숙소부터.
 * 최근 수집 가격(숙소 키 포함)이 있으면 그 목록에서 고르고 — 경비 계산과 같은 목록이라 값이 맞는다 —, 없으면 10/31 자료에서 고른다.
 */
export function hotelCandidates(regionId: string, tier: StayTier): HotelPick[] {
  const key = PILOT_TWIN_OF[regionId] ?? regionId;
  const statics = (HOTELS[key] ?? []).filter((h) => h[1] >= 4.5 && h[2] >= 300);
  const byName = new Map(statics.map((h) => [h[0], h]));
  const live = liveHotelEntries(key);
  if (live && live.length >= 5) {
    const band = inBand(live, tier);
    if (band.length) {
      const m = Math.floor(band.length / 2);
      const center = band.length % 2 ? band[m].usd : (band[m - 1].usd + band[m].usd) / 2;
      return band.filter((h) => HOTEL_NAMES[h.key]).sort((a, b) => Math.abs(a.usd - center) - Math.abs(b.usd - center) || b.samples - a.samples).slice(0, 3).map((h) => {
        const name = HOTEL_NAMES[h.key];
        const s = byName.get(name);
        return { name, key: h.key, rating: s?.[1] ?? null, reviews: s?.[2] ?? null, nightUsd: h.usd, samples: h.samples, lo: s?.[3] ?? null, hi: s?.[4] ?? null };
      });
    }
  }
  const sorted = [...statics].sort((a, b) => a[3] + a[4] - b[3] - b[4]);
  const band = inBand(sorted, tier);
  const mid = (h: HotelRow) => (h[3] + h[4]) / 2;
  const center = band.length ? mid(band[Math.floor(band.length / 2)]) : 0;
  return band.sort((a, b) => Math.abs(mid(a) - center) - Math.abs(mid(b) - center) || b[1] - a[1]).slice(0, 3)
    .map(([name, rating, reviews, lo, hi]) => ({ name, key: HOTEL_KO[name]?.[1] || null, rating, reviews, nightUsd: null, samples: null, lo, hi }));
}

/** 정확한 나이가 없는 기존 연령대 정보는 외부 예약처에 임의 나이로 전달하지 않는다. */
export function childAgesForBooking(q: RegionQuery): number[] | null {
  const children = membersOf(q).filter((m) => childBandOf(m) !== null);
  return children.some((m) => m.age == null) ? null : children.map((m) => m.age!);
}

export function flightSearchUrl(region: RegionV1, q: RegionQuery) {
  if (!/^[a-z]{3}$/i.test(region.airportCode)) return "https://www.skyscanner.co.kr/transport/flights/";
  const ymd = (date: string) => date.slice(2).replaceAll("-", "");
  const ages = childAgesForBooking(q);
  const params = new URLSearchParams({ adultsv2: String(q.adults) });
  if (ages?.length) params.set("childrenv2", ages.join("|"));
  return `https://www.skyscanner.co.kr/transport/flights/icn/${region.airportCode.toLowerCase()}/${ymd(q.startDate)}/${ymd(q.endDate)}/?${params}`;
}

/** 항공권 주 버튼: 아고다 항공(한국어, CJ 제휴). 날짜·인원은 아직 못 넘겨 첫 화면으로 연다. */
export function agodaFlightUrl() {
  return agodaFlightsUrl();
}

/** 항공권 보조: Aviasales(Travelpayouts 제휴) 왕복 검색 */
export function flightAffiliateUrl(region: RegionV1, q: RegionQuery) {
  return aviasalesSearchUrl({ from: "ICN", to: region.airportCode, startDate: q.startDate, endDate: q.endDate, adults: q.adults, childAges: childAgesForBooking(q), childCount: q.children.length });
}

/** 부킹닷컴 한국어 검색: 숙소 이름·날짜·인원·객실이 입력된 채로 열린다 */
export function bookingComUrl(region: RegionV1, q: RegionQuery, name?: string) {
  const params = new URLSearchParams({ ss: name ?? region.searchName, checkin: q.startDate, checkout: q.endDate, group_adults: String(Math.max(1, q.adults)), group_children: String(q.children.length), no_rooms: String(roomEstimate(q).rooms), lang: "ko" });
  for (const a of childAgesForBooking(q) ?? []) params.append("age", String(a));
  return `https://www.booking.com/searchresults.ko.html?${params}`;
}

export function hotelSearchUrl(region: RegionV1, q: RegionQuery, name?: string) {
  // 아고다 검색 페이지는 체크인(checkIn)과 숙박일수(los)로 날짜를 받는다. checkOut 만으로는 날짜가 빠지는 경우가 있어 둘 다 넣는다.
  const los = Math.max(1, Math.round((Date.parse(q.endDate) - Date.parse(q.startDate)) / 864e5) || 1);
  const params = new URLSearchParams({ textToSearch: name ?? region.searchName, checkIn: q.startDate, checkOut: q.endDate, los: String(los), rooms: String(roomEstimate(q).rooms), adults: String(q.adults), children: String(q.children.length) });
  const ages = childAgesForBooking(q);
  if (ages?.length) params.set("childages", ages.join(","));
  // CJ 아고다 설정이 채워지면 CJ 딥링크로 감싼다(비어 있으면 원래 주소).
  return cjLink(`https://www.agoda.com/ko-kr/search?${params}`, CJ.agoda);
}

/** 클룩 호텔(제휴). 도시 번호를 아는 권역은 날짜·인원·객실이 채워져 열린다. */
export function klookStayUrl(region: RegionV1, q: RegionQuery) {
  return klookHotelUrl(region.id, { startDate: q.startDate, endDate: q.endDate, adults: q.adults, children: q.children.length, rooms: roomEstimate(q).rooms });
}
/** 그 숙소의 클룩 상세(제휴). 클룩 번호를 모르는 숙소는 null. */
export function klookHotelStayUrl(name: string, q: RegionQuery) {
  return klookHotelDetailUrl(name, { startDate: q.startDate, endDate: q.endDate, adults: q.adults, children: q.children.length, rooms: roomEstimate(q).rooms });
}
export const klookStayPrefilled = (region: RegionV1) => klookHotelPrefilled(region.id);
