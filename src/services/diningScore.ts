import type { PlaceV1 } from "@/data/regionsV1";

// 등록·확인된 미식 선택지의 충실도(0~5). 음식 품질이나 평점의 추정값이 아니다.
export const DINING_SCORE = { countCap: 15, cuisineCap: 6, signatureCap: 8, share: 0.6, minimum: 3 } as const;
export interface DiningEvidence {
  verifiedCount: number | null;
  pendingCount: number;
  cuisineCount: number;
  signatureCount: number;
  priceCounts: [number, number, number]; // 저·중·고
  components: { count: number; cuisine: number; signature: number; price: number };
  score: number | null;
  enough: boolean;
}
const usefulLabel = (value: string | null | undefined): string => {
  const key = typeof value === "string" ? value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ") : "";
  return ["", "미확인", "확인 중", "확인중", "unknown", "n/a", "-"].includes(key) ? "" : key;
};

/** 확인 중·가이드만 있는 업체는 점수에 포함하지 않는다. 미확인은 0점이 아니다. */
export function scoreVerifiedDining(places: readonly PlaceV1[], days: number): DiningEvidence {
  const unique = [...new Map(places.map((p) => [p.id, p])).values()];
  const confirmed = unique.filter((p) => p.dining?.mapRecord?.status === "confirmed");
  const n = confirmed.length;
  const pendingCount = unique.filter((p) => p.dining?.mapRecord?.status === "pending").length;
  const cuisines = new Set(confirmed.map((p) => usefulLabel(p.dining?.cuisine)).filter(Boolean));
  const signatures = new Set(confirmed.flatMap((p) => (p.dining?.mapRecord?.signature ?? []).map(usefulLabel)).filter(Boolean));
  const priceCounts: [number, number, number] = [
    confirmed.filter((p) => p.dining?.mapRecord?.priceLevel === "저").length,
    confirmed.filter((p) => p.dining?.mapRecord?.priceLevel === "중").length,
    confirmed.filter((p) => p.dining?.mapRecord?.priceLevel === "고").length,
  ];
  const known = priceCounts.reduce((sum, count) => sum + count, 0);
  // 세 가격대가 균형적일수록 높게. 가격 미확인 비율만큼 신뢰도 축소.
  const price = known && n
    ? 0.5 * Math.min(1, (1 - priceCounts.reduce((sum, count) => sum + (count / known) ** 2, 0)) / (2 / 3)) * known / n
    : 0;
  const components = {
    count: 2.5 * Math.min(1, n / DINING_SCORE.countCap),
    cuisine: Math.min(1, cuisines.size / DINING_SCORE.cuisineCap),
    signature: Math.min(1, signatures.size / DINING_SCORE.signatureCap),
    price,
  };
  return {
    verifiedCount: n || null, pendingCount, cuisineCount: cuisines.size, signatureCount: signatures.size, priceCounts, components,
    score: n >= DINING_SCORE.minimum ? components.count + components.cuisine + components.signature + components.price : null,
    enough: n >= Math.max(DINING_SCORE.minimum, days),
  };
}
