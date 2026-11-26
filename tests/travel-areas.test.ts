import assert from "node:assert/strict";
import test from "node:test";
import { ALL_REGIONS, scoreRegions } from "../src/services/regionScore";
import { DEFAULT_QUERY } from "../src/lib/flow";
import { TRAVEL_AREAS, normalizeTravelAreas, travelAreaOf } from "../src/data/travelAreas";
import type { RegionQuery } from "../src/services/regionScore";

test("358개 실제 앱 권역을 14개 지역에 중복·누락 없이 배정한다", () => {
  assert.equal(ALL_REGIONS.length, 358);
  assert.equal(new Set(ALL_REGIONS.map((r) => r.id)).size, 358);
  assert.equal(TRAVEL_AREAS.length, 14);
  const counts = TRAVEL_AREAS.map((a) => ALL_REGIONS.filter((r) => travelAreaOf(r.country) === a.id).length);
  assert.deepEqual(counts, [54, 60, 13, 6, 18, 21, 55, 27, 9, 34, 7, 10, 26, 18]);
  assert.equal(counts.reduce((a, b) => a + b, 0), 358);
  assert.equal(travelAreaOf("toString"), undefined);
});

test("지역 미선택·빈 배열·구버전은 동일한 358권역 점수·순위·사유", () => {
  const q = { ...DEFAULT_QUERY };
  const all = scoreRegions(q);
  assert.equal(all.length, 358);
  assert.deepEqual(scoreRegions({ ...q, preferredAreas: [] }), all);
  assert.deepEqual(scoreRegions({ ...q, preferredAreas: undefined }), all);
  assert.deepEqual(normalizeTravelAreas(["invalid", "northern-europe", "northern-europe"]), ["northern-europe"]);
  const ranked = all.filter((r) => r.status === "ranked");
  const firstOver = ranked.findIndex((r) => r.overFlight);
  assert.ok(firstOver > 0);
  assert.ok(ranked.slice(firstOver).every((r) => r.overFlight));
});

test("선택 지역만 남고 12시간 초과 권역도 점수순으로 경쟁한다", () => {
  const q: RegionQuery = { ...DEFAULT_QUERY, startDate: "2026-12-20", endDate: "2026-12-25", main: "관광", subs: [], interests: ["관광"], maxFlightHours: 12 };
  const all = scoreRegions(q);
  const selected = scoreRegions({ ...q, preferredAreas: ["central-eastern-europe"] });
  assert.equal(selected.length, 27);
  assert.ok(selected.every((r) => travelAreaOf(r.region.country) === "central-eastern-europe"));
  const ranked = selected.filter((r) => r.status === "ranked");
  const expected = all.filter((r) => r.status === "ranked" && travelAreaOf(r.region.country) === "central-eastern-europe");
  assert.deepEqual(ranked.map((r) => r.region.id).sort(), expected.map((r) => r.region.id).sort());
  assert.deepEqual(ranked.map((r) => r.score), expected.map((r) => r.score).sort((a, b) => b - a));
  assert.ok(ranked.every((r, i) => i === 0 || ranked[i - 1].score >= r.score));
  assert.ok(ranked.some((r, i) => r.overFlight && ranked.slice(i + 1).some((x) => !x.overFlight)));
  for (const r of selected) {
    const original = all.find((x) => x.region.id === r.region.id)!;
    assert.equal(r.score, original.score);
    assert.equal(r.stay.tier, original.stay.tier);
    assert.equal(r.status, original.status);
    if (r.overFlight) assert.match(r.reasons[0], /선택 지역 안에서는 점수순/);
  }
});

test("복수 선택의 합집합만 추천하며 상세 직접 링크는 선택 밖도 열 수 있다", () => {
  const q: RegionQuery = { ...DEFAULT_QUERY, preferredAreas: ["east-asia", "southeast-asia"] };
  const rows = scoreRegions(q);
  assert.equal(rows.length, 114);
  assert.ok(rows.every((r) => ["east-asia", "southeast-asia"].includes(travelAreaOf(r.region.country)!)));
  const detail = scoreRegions(q, { includeOutsideAreas: true });
  assert.equal(detail.length, 358);
  assert.equal(detail.find((r) => r.region.id === "fra-paris")?.rank, 0);
});
