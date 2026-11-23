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
