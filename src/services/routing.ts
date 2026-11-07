// 이동시간 Provider 계층.
// 현재는 DEMO 지역 매트릭스(추정치)만 있다. Google Maps / Mapbox / Naver / Kakao 등은
// RoutingProvider 를 구현해 setRoutingProvider 로 교체한다.
import { getZoneMatrix } from "@/data/repository";

export interface TravelEstimate {
  minutes: number | null; // null = 산출 불가(미확인)
  estimated: boolean; // true = 실제 경로 계산이 아닌 추정치
  source: "DEMO_ZONE_MATRIX" | "API" | "NONE";
}

export interface TransportOptions {
  rentalCar: boolean;
  publicTransit: boolean;
  taxi: boolean;
}

export interface RoutingProvider {
  estimate(destinationId: string, fromZone: string | null, toZone: string | null, transport: TransportOptions): TravelEstimate;
}

const demoZoneProvider: RoutingProvider = {
  estimate(destinationId, fromZone, toZone, transport) {
    const matrix = getZoneMatrix(destinationId);
    if (!matrix || !fromZone || !toZone) return { minutes: null, estimated: true, source: "NONE" };
    const base = matrix[fromZone]?.[toZone] ?? matrix[toZone]?.[fromZone];
    if (base == null) return { minutes: null, estimated: true, source: "NONE" };
    // 택시/렌터카가 없고 대중교통만 쓰는 경우 더 오래 걸린다고 가정 (DEMO 계수)
    const factor = !transport.taxi && !transport.rentalCar && transport.publicTransit ? 1.6 : 1;
    return { minutes: Math.round((base * factor) / 5) * 5 || 5, estimated: true, source: "DEMO_ZONE_MATRIX" };
  },
};

let provider: RoutingProvider = demoZoneProvider;

export function setRoutingProvider(p: RoutingProvider) {
  provider = p;
}

export function estimateTravel(destinationId: string, from: string | null, to: string | null, transport: TransportOptions): TravelEstimate {
  return provider.estimate(destinationId, from, to, transport);
}
