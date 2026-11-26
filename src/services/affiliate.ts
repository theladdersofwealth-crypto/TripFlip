/**
 * Travelpayouts 제휴 링크.
 * 값은 형님 계정 Travelpayouts → Programs → (프로그램) → Generate links 로 만든 링크에서 가져온다.
 * 링크 안의 marker(파트너 번호)·trs(프로젝트 번호)·p(프로그램 번호)·campaign_id 를 넣는다.
 * 값이 비어 있으면 제휴 없이 원래 주소로 보낸다(링크가 깨지지 않게).
 */
import { KLOOK_CITY } from "@/data/klookCities";
import { KLOOK_HOTEL } from "@/data/klookHotels";
import { bookingDates, calendarDays } from "@/lib/travelDates";

export type TpProgram = { p: string; campaignId: string };

export const TP = {
  marker: "798059", // 형님 파트너 번호
  trs: "605929", // 프로젝트 Tripflip (tripflip.co.kr, 11/24 새로 만듦. 옛 605469는 삭제 예정)
  klook: { p: "4110", campaignId: "137" } as TpProgram,
  kkday: { p: "9074", campaignId: "633" } as TpProgram,
  aviasales: { p: "4114", campaignId: "100" } as TpProgram,
  welcomePickups: { p: "8919", campaignId: "627" } as TpProgram,
};

export function tpLink(url: string, prog: TpProgram, tp: { marker: string; trs: string } = TP): string {
  if (!tp.marker || !prog.p) return url;
  const params = new URLSearchParams({ marker: tp.marker, p: prog.p, u: url });
  if (tp.trs) params.set("trs", tp.trs);
  if (prog.campaignId) params.set("campaign_id", prog.campaignId);
  return `https://tp.media/r?${params}`;
}

/** 클룩 한국어 검색(투어·입장권·교통) */
export function klookSearchUrl(searchName: string, tp?: { marker: string; trs: string }, prog: TpProgram = TP.klook): string {
  return tpLink(`https://www.klook.com/ko/search/result/?query=${encodeURIComponent(searchName)}`, prog, tp);
}

/** KKday 한국어 검색(투어·입장권) */
export function kkdaySearchUrl(searchName: string, tp?: { marker: string; trs: string }, prog: TpProgram = TP.kkday): string {
  return tpLink(`https://www.kkday.com/ko/product/productlist?keyword=${encodeURIComponent(searchName)}`, prog, tp);
}

export { KLOOK_CITY };

export type KlookStay = { startDate: string; endDate: string; adults: number; children: number; rooms: number };

/** 클룩 호텔(한국어). 도시 번호를 알면 날짜·인원·객실이 채워진 검색 결과로, 모르면 호텔 첫 화면으로. */
export function klookHotelUrl(regionId?: string, stay?: KlookStay, tp?: { marker: string; trs: string }, prog: TpProgram = TP.klook): string {
  const city = regionId ? KLOOK_CITY[regionId] : undefined;
  const dates = stay && bookingDates(stay.startDate, stay.endDate);
  if (!city || !stay || !dates) return tpLink("https://www.klook.com/ko/hotels/", prog, tp);
  const params = new URLSearchParams({
    city_id: String(city), stype: "city", svalue: String(city),
    check_in: dates.startDate, check_out: dates.endDate,
    adult_num: String(Math.max(1, stay.adults)), child_num: String(Math.max(0, stay.children)), room_num: String(Math.max(1, stay.rooms)),
  });
  return tpLink(`https://www.klook.com/ko/hotels/searchresult/?${params}`, prog, tp);
}

const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 -]/g, "").trim().replace(/ /g, "-");

/** 클룩 호텔 상세(그 숙소). 번호를 모르면 null. 날짜가 맞으면 체크인·체크아웃·인원·객실도 넣는다. */
export function klookHotelDetailUrl(hotelName: string, stay?: KlookStay, tp?: { marker: string; trs: string }, prog: TpProgram = TP.klook): string | null {
  const id = KLOOK_HOTEL[hotelName];
  if (!id) return null;
  const base = `https://www.klook.com/ko/hotels/detail/${id}-${slug(hotelName)}/`;
  const dates = stay && bookingDates(stay.startDate, stay.endDate);
  if (!stay || !dates) return tpLink(base, prog, tp);
  const params = new URLSearchParams({ check_in: dates.startDate, check_out: dates.endDate, room_num: String(Math.max(1, stay.rooms)), adult_num: String(Math.max(1, stay.adults)), child_num: String(Math.max(0, stay.children)) });
  return tpLink(`${base}?${params}`, prog, tp);
}

/** 클룩 호텔 버튼이 날짜·인원까지 채워 여는지 */
export const klookHotelPrefilled = (regionId?: string) => !!(regionId && KLOOK_CITY[regionId]);

/**
 * Aviasales 왕복 검색. 주소 형식: /search/{출발}{DDMM}{도착}{DDMM}{성인}{어린이}{유아}
 * 나이를 모르는 자녀는 어린이(2세 이상)로 넣는다. 숫자 한 자리라 각 9명까지.
 */
export function aviasalesSearchUrl(
  o: { from: string; to: string; startDate: string; endDate: string; adults: number; childAges: number[] | null; childCount: number },
  tp?: { marker: string; trs: string },
  prog: TpProgram = TP.aviasales,
): string {
  const base = "https://www.aviasales.com/";
  const dates = bookingDates(o.startDate, o.endDate);
  if (!/^[a-z]{3}$/i.test(o.from) || !/^[a-z]{3}$/i.test(o.to) || !dates) return tpLink(base, prog, tp);
  const ddmm = (d: string) => d.slice(8, 10) + d.slice(5, 7);
  const infants = o.childAges ? o.childAges.filter((a) => a < 2).length : 0;
  const kids = o.childCount - infants;
  const n = (x: number) => String(Math.min(9, Math.max(0, x)));
  const tail = n(Math.max(1, o.adults)) + (kids || infants ? n(kids) : "") + (infants ? n(infants) : "");
  const url = `${base}search/${o.from.toUpperCase()}${ddmm(dates.startDate)}${o.to.toUpperCase()}${ddmm(dates.endDate)}${tail}?currency=krw`;
  return tpLink(url, prog, tp);
}

/** Welcome Pickups 공항 픽업 */
export function welcomePickupsUrl(tp?: { marker: string; trs: string }, prog: TpProgram = TP.welcomePickups): string {
  return tpLink("https://www.welcomepickups.com/", prog, tp);
}

/**
 * CJ Affiliate 딥링크(아고다 APAC 등). 형님 CJ → Links → Deep Link Generator 로 만든 샘플 링크에서 값을 옮긴다.
 * 링크 모양: https://{domain}/click-{pid}-{linkId}?url={원래 주소 인코딩}
 *  - pid: 홍보 사이트(tripflip.co.kr) 번호 101921886
 *  - domain·linkId: 샘플 링크에서 확인(추측 금지). 비어 있으면 감싸지 않고 원래 주소로 보낸다.
 */
export type CjProgram = { domain: string; linkId: string };

export const CJ = {
  publisherId: "8119812", // 형님 CJ 퍼블리셔(계정) 번호 — 링크에는 안 들어감, 기록용
  pid: "101921886", // 홍보 사이트 tripflip.co.kr
  agoda: { domain: "www.tkqlhce.com", linkId: "17095166" } as CjProgram, // Agoda APAC(광고주 7538034) 텍스트 링크, 11/24 형님 CJ 화면
};

/**
 * 아고다 항공(한국어). 링크는 숙소에서 이미 쓰는 아고다 CJ 딥링크(17095166)로 감싼다.
 * 공항코드·출발일·귀국일이 맞으면 왕복 검색 결과 주소로, 아니면 첫 화면으로 보낸다.
 * 주소 형식은 형님이 11/25 준 샘플(왕복·이코노미·성인)에서 확인한 값만 쓴다:
 *   /ko-kr/flights/results?searchType=2&cabinType=Economy&adults=1&departureFrom=ICN&departureFromType=1
 *     &departDate=2026-11-26&arrivalTo=CXR&arrivalToType=1&returnDate=2026-12-02&sort=8
 * 편도·어린이·유아 인원 파라미터는 확인 못 해 넣지 않는다(어린이는 아고다 화면에서 직접 추가).
 * 주의: 아고다 CJ 수수료(6%)는 숙박 완료 건 기준이라 항공은 수수료가 없을 수 있다.
 */
export const AGODA_FLIGHTS_KO = "https://www.agoda.com/ko-kr/flights";
export type AgodaFlightQuery = { from: string; to: string; startDate: string; endDate: string; adults: number };

/** 왕복 검색 결과로 바로 열 수 있는지(공항코드 3글자·날짜 형식·귀국일이 출발일 뒤) */
export function agodaFlightsPrefilled(o?: AgodaFlightQuery): o is AgodaFlightQuery {
  return !!o && /^[a-z]{3}$/i.test(o.from) && /^[a-z]{3}$/i.test(o.to) && calendarDays(o.startDate, o.endDate) >= 2;
}

export function agodaFlightsUrl(o?: AgodaFlightQuery, prog: CjProgram = CJ.agoda): string {
  if (!agodaFlightsPrefilled(o)) return cjLink(AGODA_FLIGHTS_KO, prog);
  const dates = bookingDates(o.startDate, o.endDate);
  if (!dates) return cjLink(AGODA_FLIGHTS_KO, prog);
  const params = new URLSearchParams({
    searchType: "2", cabinType: "Economy", adults: String(Math.min(9, Math.max(1, Math.round(o.adults) || 1))),
    departureFrom: o.from.toUpperCase(), departureFromType: "1", departDate: dates.startDate,
    arrivalTo: o.to.toUpperCase(), arrivalToType: "1", returnDate: dates.endDate, sort: "8",
  });
  return cjLink(`${AGODA_FLIGHTS_KO}/results?${params}`, prog);
}

export function cjLink(url: string, prog: CjProgram, pid: string = CJ.pid): string {
  if (!pid || !prog.domain || !prog.linkId) return url;
  return `https://${prog.domain}/click-${pid}-${prog.linkId}?url=${encodeURIComponent(url)}`;
}
