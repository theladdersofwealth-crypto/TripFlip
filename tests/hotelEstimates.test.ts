import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_REGIONS, PILOT_TWIN_OF, estimateTripCost, hotelEstimated, scoreRegions } from "../src/services/regionScore";
import { HOTEL_ESTIMATE_USD } from "../src/data/hotelEstimates";
import { HOTEL_MEDIAN_USD } from "../src/data/worldPrices";
import { HOTELS } from "../src/data/worldHotels";
import { DEFAULT_QUERY } from "../src/lib/flow";

const q = { ...DEFAULT_QUERY, startDate: "2027-03-10", endDate: "2027-03-14", maxFlightHours: null };

test("숙소 자료 없던 권역은 4곳(나라 물가 없음)만 빼고 모두 1박 추정가가 있다", () => {
  const missing = ALL_REGIONS.filter((r) => {
    const k = PILOT_TWIN_OF[r.id] ?? r.id;
    return HOTEL_MEDIAN_USD[k] == null && !HOTELS[k]?.length && HOTEL_ESTIMATE_USD[k] == null;
  }).map((r) => r.id);
  // 수집 서버 실측 권역은 실행 중에 live 값으로 채워진다
  assert.ok(missing.length <= 10, missing.join(","));
  for (const id of ["cub-havana", "new-noumea", "fre-borabora", "coo-rarotonga"]) assert.equal(HOTEL_ESTIMATE_USD[id], undefined);
});

test("추정 권역은 1박 값이 나오고, 미확인 감점은 그대로 받는다", () => {
  const id = Object.keys(HOTEL_ESTIMATE_USD).find((k) => ALL_REGIONS.some((r) => r.id === k))!;
  const region = ALL_REGIONS.find((r) => r.id === id)!;
  assert.ok(hotelEstimated(id));
  const stay = estimateTripCost(region, q);
  assert.ok(stay.hotelNightUsd != null && stay.hotelNightUsd > 10 && stay.hotelNightUsd < 1500);
  const r = scoreRegions(q).find((x) => x.region.id === id);
  assert.equal(r?.status, "ranked");
  assert.ok(r!.flags.some((f) => f.includes("숙소") && f.includes("추정값")));
});

test("추정가는 상식 범위(USD 20~600)", () => {
  for (const [id, v] of Object.entries(HOTEL_ESTIMATE_USD)) assert.ok(v >= 20 && v <= 600, `${id} ${v}`);
});
