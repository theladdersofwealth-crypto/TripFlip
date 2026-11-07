import catalog from "../../public/dining/catalog.json";
import type { PlaceV1 } from "./regionsV1";

export const DINING_CATALOG = catalog;
/** 공개 가이드의 상호·위치만 사용한다. 영업·품질·가족 편의시설을 추정해 채우지 않는다. */
export const DINING_PLACES: PlaceV1[] = catalog.places.map((row) => ({
  id: row.id, region: row.region, name: row.name, en: row.name,
  concepts: ["미식"], tags: row.kind === "cafe" ? ["카페·디저트"] : ["로컬푸드"],
  travel: row.lat == null ? "위치 확인 필요" : "이동시간 추정", penalty: 0, grade: null,
  ...(row.lat == null || row.lon == null ? {} : { lat: row.lat, lon: row.lon }),
  dining: { kind: row.kind as "restaurant" | "cafe", styles: row.styles, cuisine: row.cuisine, address: row.address,
    source: row.source, sourceUrl: row.sourceUrl, checkedAt: row.checkedAt, license: row.license, website: row.website },
}));
