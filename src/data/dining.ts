import catalog from "../../public/dining/catalog.json";
import verifiedDining from "./verifiedDining.json";
import pendingDining from "./pendingDining.json";
import type { PlaceV1 } from "./regionsV1";

export const DINING_CATALOG = catalog;
export const isPendingDining = (place: PlaceV1) => place.dining?.mapRecord?.status === "pending";
export const pendingDiningLast = (a: PlaceV1, b: PlaceV1) => Number(isPendingDining(a)) - Number(isPendingDining(b));
/** 공개 가이드의 상호·위치만 사용한다. 영업·품질·가족 편의시설을 추정해 채우지 않는다. */
export const DINING_PLACES: PlaceV1[] = catalog.places.map((row) => ({
  id: row.id, region: row.region, name: row.name, en: row.name,
  concepts: ["미식"], tags: row.kind === "cafe" ? ["카페·디저트"] : ["로컬푸드"],
  travel: row.lat == null ? "위치 확인 필요" : "이동시간 추정", penalty: 0, grade: null,
  ...(row.lat == null || row.lon == null ? {} : { lat: row.lat, lon: row.lon }),
  dining: { kind: row.kind as "restaurant" | "cafe", styles: row.styles, cuisine: row.cuisine, address: row.address,
    source: row.source, sourceUrl: row.sourceUrl, checkedAt: row.checkedAt, license: row.license, website: row.website },
}));

export function withMapDining(places: PlaceV1[]): PlaceV1[] {
  const merged = [...places];
  const indexById = new Map(places.map((place, index) => [place.id, index]));
  const rows = [
    ...verifiedDining.map((row) => ({ ...row, status: "confirmed" as const })),
    ...pendingDining.map((row) => ({ ...row, status: "pending" as const })),
  ];
  for (const row of rows) {
    const index = indexById.get(row.id);
    const existing = index == null ? undefined : merged[index];
    const kind = row.kind === "cafe" ? "cafe" : "restaurant";
    const name = row.nameKo ?? row.nameLocal;
    const place: PlaceV1 = existing ?? {
      id: row.id, region: row.region, name, en: row.nameEn,
      concepts: ["미식"], tags: [kind === "cafe" ? "카페·디저트" : "로컬푸드"],
      travel: "위치 확인 필요", penalty: 0, grade: null,
    };
    // 기존 시장의 관광 분류와 저장된 장소 ID, 좌표 및 등급은 유지한다.
    const guide = place.dining;
    const updated: PlaceV1 = {
      ...place,
      dining: {
        kind, styles: row.styles, cuisine: row.cuisine, address: null,
        source: row.status === "confirmed" ? "구글 지도 존재·영업 확인 자료" : "구글 지도 확인 중 자료",
        sourceUrl: row.sourceUrl,
        checkedAt: row.checkedAt, license: null, website: null,
        mapRecord: {
          status: row.status,
          nameLocal: row.nameLocal, nameEn: row.nameEn, nameKo: row.nameKo,
          area: row.area ?? null,
          signature: row.signature, priceLevel: row.priceLevel,
          confidence: row.confidence ?? null,
          ...(guide?.sourceUrl && guide.license ? {
            guideSource: { name: guide.source, url: guide.sourceUrl, license: guide.license, checkedAt: guide.checkedAt },
          } : {}),
        },
      },
    };
    if (index == null) merged.push(updated);
    else merged[index] = updated;
  }
  return merged;
}
