import assert from "node:assert/strict";
import test from "node:test";
import { REGIONS_V1 } from "../src/data/regionsV1";
import { FLIGHT_KRW } from "../src/data/worldPrices";
import { liveFlightKrw, liveHotelPrices, setLiveSummary } from "../src/lib/livePrices";
import type { LiveSummary } from "../src/lib/livePrices";
import { estimateTripCost } from "../src/services/regionScore";
import type { RegionQuery } from "../src/services/regionScore";
// @ts-expect-error 수집 Worker의 순수 JS 모듈
import { buildSummary, mergeFlightAgg, mergeHotelAgg } from "../workers/collector/src/summary.js";

const q: RegionQuery = { startDate: "2027-01-07", endDate: "2027-01-10", adults: 2, children: [], elders: false, pet: false,
  main: "휴양", subs: [], perDay: 2, price: "상관없음", stay: "가심비" };
const NT = REGIONS_V1.find((r) => r.id === "NT")!;

test("수집 회차 합계 → 평균가 요약", () => {
  const snap = (p: number) => ({ world: { months: { "2027-01": [["NHA", "", "", p], ["NHA", "", "", p + 50000]] } }, routes: {} });
  const day = mergeFlightAgg(mergeFlightAgg(null, snap(200000)), snap(300000));
  const hotel = mergeHotelAgg(mergeHotelAgg(null, [["NT", "k1", "2026-11-24", 40], ["NT", "k2", "2026-11-24", null]]), [["NT", "k1", "2026-12-10", 60]]);
  const s = buildSummary([day], [hotel], new Date("2026-11-10T00:00:00Z"));
  assert.deepEqual(s.flights.NHA["2027-01"], [250000, 2]);
  assert.deepEqual(s.hotels.NT, [[50, 2]]);
  assert.equal(s.v, 2);
  assert.equal(s.counts.flightSnapshots, 2);
});

test("평균가가 있으면 예상 경비에 쓰고, 없으면 앱 자료로 돌아간다", () => {
  setLiveSummary(null);
  const before = estimateTripCost(NT, q);
  assert.equal(before.priceSource.flight, "static");
  assert.equal(before.flightKrw, FLIGHT_KRW["vie-nhatrang"]);

  const live: LiveSummary = { v: 2, updatedAt: "2026-11-10T02:15:00Z", windowDays: 14, days: { flight: 3, hotel: 3 }, counts: { flightSnapshots: 9, hotelBatches: 66 },
    flights: { NHA: { "2027-01": [389000, 9], "2026-12": [245000, 9] } },
    hotels: { NT: [30, 40, 50, 60, 70, 80].map((usd) => [usd, 3] as [number, number]) } };
  setLiveSummary(live);
  assert.equal(liveFlightKrw("vie-nhatrang", "2027-01-07"), 389000);
  assert.equal(liveFlightKrw("vie-nhatrang", "2027-09-01"), 317000);
  assert.deepEqual(liveHotelPrices("vie-nhatrang"), [30, 40, 50, 60, 70, 80]);
  const after = estimateTripCost(NT, q);
  assert.equal(after.flightKrw, 389000);
  assert.equal(after.priceSource.flight, "live");
  assert.equal(after.priceSource.hotel, "live");
  assert.ok(after.hotelNightUsd! >= 30 && after.hotelNightUsd! <= 80);
  // 시범 외 권역(권역 id 그대로)도 같은 방식으로 읽는다
  setLiveSummary({ ...live, hotels: { "vie-hoian": [20, 25, 30, 35, 40].map((usd) => [usd, 2] as [number, number]) } });
  assert.deepEqual(liveHotelPrices("vie-hoian"), [20, 25, 30, 35, 40]);
  assert.equal(liveHotelPrices("vie-nhatrang"), null, "5곳 미만이면 쓰지 않는다");
  setLiveSummary(null);
});

test("숙소 목록이 없는 권역도 숙소 수준에 따라 1박 가격이 달라진다", () => {
  setLiveSummary(null);
  const region = REGIONS_V1.find((r) => r.id === "NT")!;
  const world = { ...region, id: "vie-halong", country: "베트남" };
  const cheap = estimateTripCost(world, { ...q, stay: "가성비" }).hotelNightUsd!;
  const high = estimateTripCost(world, { ...q, stay: "하이엔드" }).hotelNightUsd!;
  assert.ok(high > cheap * 3, `${cheap} → ${high}`);
});
