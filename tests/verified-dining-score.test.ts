import assert from "node:assert/strict";
import test from "node:test";
import { ALL_PLACES, scoreRegions, type RegionQuery } from "../src/services/regionScore";

const query: RegionQuery = {
  startDate: "2027-05-10", endDate: "2027-05-15",
  adults: 2, children: [], elders: false, pet: false,
  main: "미식", subs: [], interests: ["미식"],
  perDay: 2, price: "상관없음", stay: "가심비",
};
const paris = "fra-paris";
const parisResult = (input: RegionQuery) => scoreRegions(input).find((row) => row.region.id === paris)!;

test("검증 식당의 미식 가산점은 업체 수만큼 늘다가 상한에 도달한다", (t) => {
  const region = "chi-harbin";
  const locations = ALL_PLACES.map((place, index) => ({ place, index }))
    .filter(({ place }) => place.region === region && place.dining?.verified);
  t.after(() => locations.forEach(({ place, index }) => { ALL_PLACES[index] = place; }));
  const result = () => scoreRegions(query).find((row) => row.region.id === region)!;
  const full = result();

  const leaveVerified = (count: number) => {
    locations.forEach(({ place, index }, i) => {
      ALL_PLACES[index] = i < count ? place : { ...place, dining: { ...place.dining!, verified: undefined } };
    });
    return result();
  };
  const few = leaveVerified(2);
  const unknown = leaveVerified(0);

  assert.ok(locations.length > 15);
  assert.deepEqual(full.diningFit, { verifiedCount: locations.length, bonus: 0.375 });
  assert.deepEqual(few.diningFit, { verifiedCount: 2, bonus: 0.05 });
  assert.deepEqual(unknown.diningFit, { verifiedCount: null, bonus: 0 });
  assert.equal(full.score, unknown.score + 0.375);
  assert.equal(few.score, unknown.score + 0.05);
  assert.deepEqual(full.readiness, unknown.readiness);
  assert.deepEqual(full.sightseeing, unknown.sightseeing);
  assert.match(unknown.reasons[0], /검증 식당 자료가 아직 없어요/);
});

test("기존 가이드만 있는 권역은 검증 식당 자료 없음으로 처리한다", () => {
  const row = scoreRegions({ ...query, interests: ["관광", "미식"] }).find((r) => r.region.id === "NT")!;
  assert.ok(row.readiness.meals > 0);
  assert.deepEqual(row.diningFit, { verifiedCount: null, bonus: 0 });
});

test("미식을 선택하지 않으면 검증 정보 유무가 전체 추천 결과를 바꾸지 않는다", (t) => {
  const input: RegionQuery = { ...query, main: "관광", interests: ["관광"] };
  const before = scoreRegions(input);
  const locations = ALL_PLACES.map((place, index) => ({ place, index }))
    .filter(({ place }) => place.dining?.verified);
  t.after(() => locations.forEach(({ place, index }) => { ALL_PLACES[index] = place; }));
  locations.forEach(({ place, index }) => {
    ALL_PLACES[index] = { ...place, dining: { ...place.dining!, verified: undefined } };
  });
  assert.ok(before.every((row) => !("diningFit" in row)));
  const summary = (rows: ReturnType<typeof scoreRegions>) => rows.map(({ top, ...rest }) => ({
    ...rest,
    top: top.map(({ place, ...scored }) => ({ ...scored, id: place.id })),
  }));
  assert.deepEqual(summary(scoreRegions(input)), summary(before));
});

test("미식이 두 번째 취향이면 기존 취향 가중치를 적용한다", () => {
  assert.equal(parisResult({ ...query, interests: ["관광", "미식"] }).diningFit?.bonus, 11 * 0.025 * 0.8);
});
