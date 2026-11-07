import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, DEFAULT_QUERY, loadLegacyTrips, loadPlans, loadPrefs, loadQuery, parsePlanFile, resetStorageFallback, savePlan, savePrefs, saveQuery } from "../src/lib/flow";
import type { SavedPlan } from "../src/lib/flow";
import { weatherMonth } from "../src/services/regionScore";

const values = new Map<string, string>();
let failWrites = false;
beforeEach(() => {
  values.clear();
  failWrites = false;
  resetStorageFallback();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { if (failWrites) throw new Error("QuotaExceededError"); values.set(k, v); },
  } });
});

const plan = (id: string): SavedPlan => ({ id, regionId: "NT", regionName: "나트랑", query: { ...DEFAULT_QUERY, startDate: "2027-05-07", endDate: "2027-05-17" }, display: 70, booked: { flight: false, hotel: false }, createdAt: "2026-11-06" });

test("조건 저장이 실패해도 다음 화면은 방금 입력한 조건(10박)을 읽는다", () => {
  saveQuery({ ...DEFAULT_QUERY, startDate: "2027-01-01", endDate: "2027-01-04" }); // 예전 저장값
  failWrites = true;
  assert.equal(saveQuery({ ...DEFAULT_QUERY, startDate: "2027-05-07", endDate: "2027-05-17" }), false);
  const q = loadQuery();
  assert.equal(q.startDate, "2027-05-07");
  assert.equal(q.endDate, "2027-05-17");
});

test("시간 설정·계획 저장이 실패해도 편집값이 사라지지 않는다", () => {
  assert.equal(savePlan(plan("p1")), true);
  failWrites = true;
  assert.equal(savePrefs("NT", { ...DEFAULT_PREFS, wake: "06:00" }, "p1"), false);
  assert.equal(loadPrefs("NT", "p1").wake, "06:00");
  assert.equal(savePrefs("NT", { ...DEFAULT_PREFS, wake: "09:00" }), false);
  assert.equal(loadPrefs("NT").wake, "09:00");
});

test("계획 파일 가져오기: 형식·버전·날짜를 검사한다", () => {
  const ok = parsePlanFile(JSON.stringify({ format: "tripflip-plan", version: 2, plan: plan("p2") }));
  assert.ok("plan" in ok && ok.plan.id === "p2");
  assert.ok("error" in parsePlanFile("not json"));
  assert.ok("error" in parsePlanFile(JSON.stringify({ format: "other", version: 2, plan: plan("x") })));
  assert.ok("error" in parsePlanFile(JSON.stringify({ format: "tripflip-plan", version: 9, plan: plan("x") })));
  assert.ok("error" in parsePlanFile(JSON.stringify({ format: "tripflip-plan", version: 2, plan: { ...plan("x"), query: { ...plan("x").query, endDate: "2027-05-01" } } })));
  assert.equal(loadPlans().length, 0); // 검사만 하고 저장하지 않음
});

test("예전 형식(tripflip:v1) 계획도 원본 그대로 목록에 나온다", () => {
  const raw = JSON.stringify({ conditions: null, trips: [{ id: "old-1", title: "다낭 가족여행", createdAt: "2026-10-27T00:00:00Z" }], destinationFavorites: [] });
  values.set("tripflip:v1", raw);
  assert.deepEqual(loadLegacyTrips().map((t) => t.title), ["다낭 가족여행"]);
  assert.equal(values.get("tripflip:v1"), raw);
});

test("날씨 월은 시간대와 관계없이 달력 날짜로 센다", () => {
  const tz = process.env.TZ;
  try {
    for (const z of ["Asia/Seoul", "America/Los_Angeles", "UTC"]) {
      process.env.TZ = z;
      assert.equal(weatherMonth("2027-05-01", "2027-05-02"), 5, z);
      assert.equal(weatherMonth("2027-12-30", "2028-01-03"), 1, z);
      assert.equal(weatherMonth("2027-04-29", "2027-05-01"), 4, z);
    }
  } finally { process.env.TZ = tz; }
});
