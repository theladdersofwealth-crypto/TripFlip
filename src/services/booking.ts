import type { RegionV1 } from "@/data/regionsV1";
import type { RegionQuery, StayTier } from "@/services/regionScore";
import { childBandOf, membersOf, roomEstimate } from "@/lib/travelParty";

export const STAY_TIERS: StayTier[] = ["가성비", "가심비", "프리미엄", "하이엔드"];

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
  const params = new URLSearchParams({ textToSearch: name ?? region.searchName, checkIn: q.startDate, checkOut: q.endDate, rooms: String(roomEstimate(q).rooms), adults: String(q.adults), children: String(q.children.length) });
  const ages = childAgesForBooking(q);
  if (ages?.length) params.set("childAges", ages.join(","));
  return `https://www.agoda.com/ko-kr/search?${params}`;
}
