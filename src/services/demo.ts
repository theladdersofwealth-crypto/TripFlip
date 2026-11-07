// SAMPLE_DATA — 기본 Demo 시나리오 (나트랑 · 성인 4 + 어린이 2 · 보통 강도 · 리조트)
import type { TripConditions, TripProfile } from "@/lib/types";

export const DEMO_CONDITIONS: TripConditions = {
  origin: "인천",
  startDate: "2027-01-12",
  endDate: "2027-01-16",
  party: { adults: 4, children: 2, childAges: [4, 2] },
  budget: "balanced",
  intensity: "normal",
  prefs: ["relax", "sightseeing", "food", "kids"],
  stroller: true,
};

export const DEMO_PROFILE: TripProfile = {
  conditions: DEMO_CONDITIONS,
  hotel: { name: "DEMO 리조트", zoneId: "nt-north" },
  checkIn: "15:00",
  checkOut: "11:00",
  meals: { lunch: ["11:30", "12:30"], dinner: ["17:00", "18:00"] },
  mustVisit: [],
  exclude: [],
  booked: [],
  transport: { rentalCar: false, publicTransit: false, taxi: true },
};

export function defaultConditions(): TripConditions {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const start = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 4);
  return { ...DEMO_CONDITIONS, startDate: start, endDate: d.toISOString().slice(0, 10), party: { adults: 2, children: 0, childAges: [] }, prefs: [] };
}
