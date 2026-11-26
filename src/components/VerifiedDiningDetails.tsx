import type { PlaceV1 } from "@/data/regionsV1";

export function diningMapUrl(place: PlaceV1): string | null {
  const verified = place.dining?.verified;
  if (!verified) return null;
  const query = [verified.nameLocal, verified.area].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function VerifiedDiningDetails({ place }: { place: PlaceV1 }) {
  const dining = place.dining;
  const verified = dining?.verified;
  if (!verified) return null;
  const names = [...new Set([verified.nameLocal, verified.nameEn, verified.nameKo])].filter((name) => name && name !== place.name);
  return <>
    {names.length > 0 && <div className="faint">{names.join(" · ")}</div>}
    <div>동네 {verified.area ?? "미확인"} · 음식 종류 {dining.cuisine ?? "미확인"}</div>
    <div>대표 메뉴 {verified.signature.join(" · ") || "미확인"} · 가격대 {verified.priceLevel ?? "미확인"}</div>
    <div>지도 확인일 {dining.checkedAt} · 자료 신뢰도 {verified.confidence ?? "미확인"}</div>
    {dining.sourceUrl ? <div><a href={dining.sourceUrl} target="_blank" rel="noopener noreferrer">출처 보기</a></div> : <div>출처 링크 미확인</div>}
    <a href={diningMapUrl(place) ?? undefined} target="_blank" rel="noopener noreferrer">지도에서 보기 ›</a>
  </>;
}
