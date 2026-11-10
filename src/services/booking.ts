import type { RegionV1 } from "@/data/regionsV1";
import type { RegionQuery, StayTier } from "@/services/regionScore";
import { childBandOf, membersOf, roomEstimate } from "@/lib/travelParty";
import { HOTELS } from "@/data/worldHotels";
import type { HotelRow } from "@/data/worldHotels";
import { PILOT_TWIN_OF } from "@/services/regionScore";

export const STAY_TIERS: StayTier[] = ["가성비", "가심비", "프리미엄", "하이엔드"];

/** 권역 내 품질 기준(4.5↑·후기 300↑) 통과 숙소를 가격 순으로 나눈 숙소 수준별 후보(평점 순 최대 3곳) */
const TIER_RANGE: Record<StayTier, [number, number]> = { 가성비: [0, 0.3], 가심비: [0.3, 0.7], 프리미엄: [0.7, 0.9], 하이엔드: [0.9, 1.01] };
export function hotelCandidates(regionId: string, tier: StayTier): HotelRow[] {
  const sorted = [...(HOTELS[PILOT_TWIN_OF[regionId] ?? regionId] ?? [])].filter((h) => h[1] >= 4.5 && h[2] >= 300).sort((a, b) => a[3] + a[4] - b[3] - b[4]);
  const [from, to] = TIER_RANGE[tier];
  return sorted.filter((_, i) => i / sorted.length >= from && i / sorted.length < to).sort((a, b) => b[1] - a[1] || b[2] - a[2]).slice(0, 3);
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

export function hotelSearchUrl(region: RegionV1, q: RegionQuery, name?: string) {
  // 아고다 검색 페이지는 체크인(checkIn)과 숙박일수(los)로 날짜를 받는다. checkOut 만으로는 날짜가 빠지는 경우가 있어 둘 다 넣는다.
  const los = Math.max(1, Math.round((Date.parse(q.endDate) - Date.parse(q.startDate)) / 864e5) || 1);
  const params = new URLSearchParams({ textToSearch: name ?? region.searchName, checkIn: q.startDate, checkOut: q.endDate, los: String(los), rooms: String(roomEstimate(q).rooms), adults: String(q.adults), children: String(q.children.length) });
  const ages = childAgesForBooking(q);
  if (ages?.length) params.set("childages", ages.join(","));
  return `https://www.agoda.com/ko-kr/search?${params}`;
}
