/**
 * Travelpayouts 제휴 링크.
 * 값은 형님 계정 Travelpayouts → Programs → (프로그램) → Generate links 로 만든 링크에서 가져온다.
 * 링크 안의 marker(파트너 번호)·trs(프로젝트 번호)·p(프로그램 번호)·campaign_id 를 넣는다.
 * 값이 비어 있으면 제휴 없이 원래 주소로 보낸다(링크가 깨지지 않게).
 */
export type TpProgram = { p: string; campaignId: string };

export const TP = {
  marker: "798059", // 형님 파트너 번호
  trs: "605469", // 프로젝트 Tripflip (tripflip.pages.dev)
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

/** 클룩 호텔(한국어). 도시별 번호를 몰라 호텔 첫 화면으로 보내고, 도시·날짜는 클룩에서 고른다. */
export function klookHotelUrl(tp?: { marker: string; trs: string }, prog: TpProgram = TP.klook): string {
  return tpLink("https://www.klook.com/ko/hotels/", prog, tp);
}

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
  if (!/^[a-z]{3}$/i.test(o.to) || !/^\d{4}-\d{2}-\d{2}$/.test(o.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(o.endDate)) return tpLink(base, prog, tp);
  const ddmm = (d: string) => d.slice(8, 10) + d.slice(5, 7);
  const infants = o.childAges ? o.childAges.filter((a) => a < 2).length : 0;
  const kids = o.childCount - infants;
  const n = (x: number) => String(Math.min(9, Math.max(0, x)));
  const tail = n(Math.max(1, o.adults)) + (kids || infants ? n(kids) : "") + (infants ? n(infants) : "");
  const url = `${base}search/${o.from.toUpperCase()}${ddmm(o.startDate)}${o.to.toUpperCase()}${ddmm(o.endDate)}${tail}?currency=krw`;
  return tpLink(url, prog, tp);
}

/** Welcome Pickups 공항 픽업 */
export function welcomePickupsUrl(tp?: { marker: string; trs: string }, prog: TpProgram = TP.welcomePickups): string {
  return tpLink("https://www.welcomepickups.com/", prog, tp);
}
