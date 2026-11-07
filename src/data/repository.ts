// 데이터 접근 계층. UI 는 이 파일의 함수만 사용한다.
// 실제 DB/API 로 교체할 때는 이 함수들의 구현만 바꾸면 된다.
import type { Continent, Destination, Place, Restaurant, Zone } from "@/lib/types";
import { DESTINATIONS } from "./destinations";
import { GEOGRAPHY } from "./geography";
import { NHA_TRANG_PLACES, NHA_TRANG_RESTAURANTS, NHA_TRANG_ZONES, NHA_TRANG_ZONE_MATRIX } from "./nhaTrang";

export function getDestinations(): Destination[] {
  return DESTINATIONS;
}

export function getDestination(id: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.id === id);
}

export function getGeography(): Continent[] {
  return GEOGRAPHY;
}

export function getZones(destinationId: string): Zone[] {
  return NHA_TRANG_ZONES.filter((z) => z.destinationId === destinationId);
}

export function getPlaces(destinationId: string): Place[] {
  return NHA_TRANG_PLACES.filter((p) => p.destinationId === destinationId);
}

export function getRestaurants(destinationId: string): Restaurant[] {
  return NHA_TRANG_RESTAURANTS.filter((r) => r.destinationId === destinationId);
}

export function getZoneMatrix(destinationId: string): Record<string, Record<string, number>> | null {
  return destinationId === "nha-trang" ? NHA_TRANG_ZONE_MATRIX : null;
}
