import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreRegions } from "../src/services/regionScore";
import { DEFAULT_QUERY } from "../src/lib/flow";
import { normalizeParty } from "../src/lib/travelParty";
import { openDuring, openOn } from "../src/data/seasonal";

const sapporo = (startDate: string, endDate: string) => scoreRegions(normalizeParty({ ...DEFAULT_QUERY, startDate, endDate, main: "관광", subs: ["액티비티"], maxFlightHours: null })).find((r) => r.region.id === "jap-sapporo")!;

test("5월 여행에는 삿포로 눈축제가 추천 근거에 나오지 않는다", () => {
  const may = sapporo("2027-05-07", "2027-05-17");
  assert.ok(!may.top.some((t) => t.place.id === "jap-sapporo-x13"));
  assert.ok(!may.reasons.join(" ").includes("눈축제"));
  const feb = sapporo("2027-02-03", "2027-02-08");
  assert.ok(feb.top.some((t) => t.place.id === "jap-sapporo-x13"));
});

test("기간 한정 판정은 여행 기간 중 하루라도 걸리면 운영으로 본다", () => {
  assert.equal(openDuring({ id: "jap-sapporo-x13" }, "2027-01-28", "2027-02-01"), true);
  assert.equal(openDuring({ id: "jap-sapporo-x13" }, "2027-01-20", "2027-01-31"), false);
  assert.equal(openOn({ id: "jap-sapporo-x13" }, "2027-05-07"), false);
  assert.equal(openOn({ id: "아무장소" }, "2027-05-07"), true);
});

test("식당 자료가 없는 권역은 일정 준비 '보완 필요'로 표시된다", () => {
  const rs = scoreRegions(normalizeParty({ ...DEFAULT_QUERY, startDate: "2027-05-07", endDate: "2027-05-17", maxFlightHours: null })).filter((r) => r.status === "ranked");
  const noMeals = rs.find((r) => r.readiness.meals === 0);
  assert.ok(noMeals && !noMeals.readiness.ready);
  assert.ok(rs.every((r) => r.readiness.mealsNeeded === 22));
});
