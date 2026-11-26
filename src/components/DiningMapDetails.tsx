import type { PlaceV1 } from "@/data/regionsV1";

export function DiningStatusBadge({ place }: { place: PlaceV1 }) {
  const status = place.dining?.mapRecord?.status;
  if (!status) return null;
  return status === "pending"
    ? <span className="badge badge-warn">확인 중</span>
    : <span className="badge badge-ok">확인됨</span>;
}

export function diningMapUrl(place: PlaceV1): string | null {
  const mapRecord = place.dining?.mapRecord;
  if (!mapRecord) return null;
  const query = [mapRecord.nameLocal, mapRecord.area].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function DiningMapDetails({ place }: { place: PlaceV1 }) {
  const dining = place.dining;
  const mapRecord = dining?.mapRecord;
  if (!mapRecord) return null;
  const names = [...new Set([mapRecord.nameLocal, mapRecord.nameEn, mapRecord.nameKo])].filter((name) => name && name !== place.name);
  return <>
    {names.length > 0 && <div className="faint">{names.join(" · ")}</div>}
    <div>동네 {mapRecord.area ?? "미확인"} · 음식 종류 {dining.cuisine ?? "미확인"}</div>
    <div>대표 메뉴 {mapRecord.signature.join(" · ") || "미확인"} · 가격대 {mapRecord.priceLevel ?? "미확인"}</div>
    <div>{mapRecord.status === "pending" ? "지도 확인 시도일" : "지도 확인일"} {dining.checkedAt} · 자료 신뢰도 {mapRecord.confidence ?? "미확인"}</div>
    {mapRecord.status === "confirmed" && (dining.sourceUrl ? <div><a href={dining.sourceUrl} target="_blank" rel="noopener noreferrer">출처 보기</a></div> : <div>출처 링크 미확인</div>)}
    {mapRecord.guideSource && <div><a href={mapRecord.guideSource.url} target="_blank" rel="noopener noreferrer">{mapRecord.guideSource.name} 기존 자료</a> · {mapRecord.guideSource.checkedAt} · {mapRecord.guideSource.license}</div>}
    <a href={diningMapUrl(place) ?? undefined} target="_blank" rel="noopener noreferrer">지도에서 보기 ›</a>
  </>;
}
