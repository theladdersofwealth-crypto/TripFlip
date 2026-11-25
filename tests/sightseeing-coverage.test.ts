import assert from "node:assert/strict";
import test from "node:test";
import { ALL_PLACES, scoreRegions, sightseeingCoverage, tripDays } from "../src/services/regionScore";
import type { RegionQuery } from "../src/services/regionScore";

test("5박 6일은 2곳에서 탈락하고 3곳에서 통과한다", () => {
  const days = tripDays("2027-05-10", "2027-05-15");
  assert.equal(days, 6);
  assert.equal(sightseeingCoverage(days, 2).passes, false);
  assert.equal(sightseeingCoverage(days, 3).passes, true);
});

test("10일은 4곳에서 탈락하고 5곳에서 통과한다", () => {
  const days = tripDays("2027-05-10", "2027-05-19");
  assert.equal(days, 10);
  assert.equal(sightseeingCoverage(days, 4).passes, false);
  assert.equal(sightseeingCoverage(days, 5).passes, true);
});

test("추천 숙소의 확인된 시설만 최대 하루로 인정한다", () => {
  const unknown = { facility: "워터파크", status: "unknown" } as const;
  const waterPark = { facility: "워터파크", status: "verified" } as const;
  const kidsClub = { facility: "키즈클럽", status: "verified" } as const;
  assert.equal(sightseeingCoverage(6, 2).hotelDays, 0);
  assert.equal(sightseeingCoverage(6, 2, [unknown]).passes, false);
  assert.equal(sightseeingCoverage(6, 2, [waterPark]).passes, true);
  assert.equal(sightseeingCoverage(6, 2, [waterPark]).relaxed, true);
  assert.equal(sightseeingCoverage(6, 2, [waterPark, kidsClub]).hotelDays, 1);
  assert.equal(sightseeingCoverage(6, 1, [waterPark, kidsClub]).passes, false);
});

test("등록 명소 5곳인 모론다바는 10일 추천에 남고 11일 추천에는 빠진다", () => {
  const regionId = "mad-morondava";
  const q: RegionQuery = {
    startDate: "2027-05-10", endDate: "2027-05-19",
    adults: 2, children: [], elders: false, pet: false,
    main: "관광", subs: [], interests: ["관광", "휴양", "액티비티", "미식", "쇼핑"],
    perDay: 1, price: "상관없음", stay: "가심비",
  };
  assert.equal(ALL_PLACES.filter((p) => p.region === regionId).length, 5);
  const atBoundary = scoreRegions(q).find((r) => r.region.id === regionId);
  assert.equal(atBoundary?.status, "ranked");
  assert.equal(atBoundary?.sightseeing.eligible, 5);
  assert.equal(atBoundary?.sightseeing.relaxed, true);
  assert.equal(atBoundary?.readiness.ready, false);
  const tooLong = scoreRegions({ ...q, endDate: "2027-05-20" }).find((r) => r.region.id === regionId);
  assert.equal(tooLong?.status, "볼거리 부족");
  assert.equal(tooLong?.sightseeing.eligible, 5);
  assert.equal(tooLong?.rank, 0);
  assert.equal(sightseeingCoverage(10, 10).relaxed, false);
});
