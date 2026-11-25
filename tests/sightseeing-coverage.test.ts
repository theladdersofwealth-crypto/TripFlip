import assert from "node:assert/strict";
import test from "node:test";
import { ALL_PLACES, scoreRegions, sightseeingCoverage, tripDays } from "../src/services/regionScore";
import type { RegionQuery } from "../src/services/regionScore";
import { admissionEvidence } from "../src/data/approvedCatalog";
import type { CatalogRecord } from "../src/data/approvedCatalog";
import type { PlaceV1 } from "../src/data/regionsV1";
import { PLACE_FIT } from "../src/data/placeFit";

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

test("6일·볼거리 3곳이면 테마 일치 1곳으로도 통과하고, 확인된 입장 제한은 집계에서 뺀다", (t) => {
  const regionId = "mad-morondava";
  const places = ALL_PLACES.filter((p) => p.region === regionId);
  const fixture = (i: number): PlaceV1 => ({
    id: `gate-fixture-${i}`, region: regionId, name: `테스트 명소 ${i}`, en: `Fixture ${i}`,
    concepts: [i < 3 ? "관광" : "쇼핑"], tags: i < 3 ? [] : ["로컬푸드"], travel: "미확인", penalty: 0, grade: "A",
  });
  const indices = places.map((p) => ALL_PLACES.indexOf(p));
  indices.forEach((index, i) => { ALL_PLACES[index] = fixture(i); });
  t.after(() => indices.forEach((index, i) => { ALL_PLACES[index] = places[i]; }));
  const place = ALL_PLACES[indices[0]];
  const q: RegionQuery = {
    startDate: "2027-05-10", endDate: "2027-05-15", adults: 2, children: [],
    elders: false, pet: false, main: "관광", subs: [], perDay: 2, price: "상관없음", stay: "가심비",
    members: [
      { id: "a", name: "성인", relationship: "self", age: 38, mobility: "limited", stroller: false, preferences: [] },
      { id: "b", name: "성인", relationship: "spouse", age: 38, mobility: "standard", stroller: false, preferences: [] },
      { id: "c", name: "아이", relationship: "child", age: 8, mobility: "standard", stroller: false, preferences: [] },
    ],
  };
  const result = (query = q) => scoreRegions(query).find((r) => r.region.id === regionId)!;
  const fields = (key: string, value: number, status = "verified"): CatalogRecord["fields"] => ({
    [key]: { value, status, useAsHardConstraint: true, sourceIds: ["fixture"] },
  });
  const evidence = (value: CatalogRecord["fields"], kind = "official") => admissionEvidence({
    id: place.id, regionId, kind: "place", aliases: [], fields: value,
    sources: [{ id: "fixture", kind, checkedAt: "2027-05-01", note: "단위 테스트 전용 입장 조건" }],
  });
  const original = result();
  assert.equal(original.status, "ranked");
  assert.equal(original.sightseeing.eligible, 3);
  assert.equal(original.admissionNeedsCheck, false);

  place.admission = evidence(fields("minimumAge", 18));
  const restricted = result();
  assert.equal(restricted.status, "볼거리 부족");
  assert.equal(restricted.sightseeing.eligible, 2);
  assert.equal(restricted.score, original.score);
  assert.deepEqual(restricted.readiness, original.readiness);
  const adults = result({ ...q, members: q.members!.slice(0, 2) });
  assert.equal(adults.sightseeing.eligible, 3);
  assert.equal(adults.admissionNeedsCheck, false);
  const ageUnknown = result({ ...q, members: q.members!.map((m) => m.id === "c" ? { ...m, age: null } : m) });
  assert.equal(ageUnknown.sightseeing.eligible, 3);
  assert.equal(ageUnknown.admissionNeedsCheck, true);

  place.admission = evidence(fields("minimumHeightCm", 120));
  assert.equal(result().sightseeing.eligible, 3);
  assert.equal(result().admissionNeedsCheck, true);
  const shortChild = result({ ...q, members: q.members!.map((m) => m.id === "c" ? { ...m, height: 110 } : m) });
  assert.equal(shortChild.sightseeing.eligible, 2);

  place.admission = evidence(fields("minimumAge", 18, "unverified"));
  assert.equal(result().status, "ranked");
  assert.equal(result().admissionNeedsCheck, true);
  place.admission = evidence(fields("minimumAge", 18), "ai");
  place.adultOnly = "check";
  place.longWalk = true;
  place.note = "키 제한은 확인 필요";
  PLACE_FIT[place.id] = Array(9).fill(0);
  t.after(() => { delete PLACE_FIT[place.id]; });
  const estimated = result();
  assert.equal(estimated.sightseeing.eligible, 3);
  assert.equal(estimated.status, "ranked");
  assert.equal(estimated.admissionNeedsCheck, true);
  assert.ok(estimated.score < original.score);

  // 한 곳만 관광 테마에 맞는다. 다른 두 곳은 쇼핑 장소이고, 그중 하나는 등급도 없다.
  const nonMatching = ALL_PLACES[indices[1]];
  const ungraded = ALL_PLACES[indices[2]];
  nonMatching.concepts = ["쇼핑"];
  ungraded.concepts = ["쇼핑"];
  ungraded.grade = null;
  const enoughSightseeing = result();
  assert.equal(enoughSightseeing.sightseeing.minimum, 3);
  assert.equal(enoughSightseeing.sightseeing.eligible, 3);
  assert.equal(enoughSightseeing.status, "ranked");
  assert.deepEqual(enoughSightseeing.top.map(({ place }) => place.id), [place.id]);

  nonMatching.tags = ["로컬푸드"];
  ungraded.tags = ["로컬푸드"];
  const notEnoughSightseeing = result();
  assert.equal(notEnoughSightseeing.sightseeing.eligible, 1);
  assert.equal(notEnoughSightseeing.status, "볼거리 부족");
  assert.deepEqual(notEnoughSightseeing.top, enoughSightseeing.top);
  assert.equal(notEnoughSightseeing.score, enoughSightseeing.score);
  assert.equal(notEnoughSightseeing.readiness.ready, enoughSightseeing.readiness.ready);
  nonMatching.tags = [];
  ungraded.tags = [];

  // 볼거리가 충분해도 기존 추천 주제의 점수 후보가 없으면 기존대로 순위에 넣지 않는다.
  const noTheme = result({ ...q, main: "휴양" });
  assert.equal(noTheme.sightseeing.eligible, 3);
  assert.equal(noTheme.status, "조건 충족 장소 없음");
});
