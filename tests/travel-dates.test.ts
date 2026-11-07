import { test } from "node:test";
import assert from "node:assert/strict";
import { addCalendarDays, calendarDays, travelDateError, tripWindows } from "../src/lib/travelDates";

test("10박은 11일이고, 가능 기간 안에서만 후보를 만든다", () => {
  const dateWindow = { earliest: "2027-05-07", latest: "2027-05-20", nights: 10 };
  const options = tripWindows(dateWindow);
  assert.equal(options.length, 4);
  assert.deepEqual(options[3], { startDate: "2027-05-10", endDate: "2027-05-20" });
  assert.equal(travelDateError({ ...options[0], dateWindow }), null);
  assert.notEqual(travelDateError({ startDate: "2027-05-11", endDate: "2027-05-21", dateWindow }), null);
});

test("잘못된 날짜와 모자라는 기간은 조회 전에 차단한다", () => {
  assert.ok(Number.isNaN(calendarDays("2027-02-30", "2027-03-03")));
  assert.equal(tripWindows({ earliest: "2027-05-07", latest: "2027-05-10", nights: 10 }).length, 0);
  assert.notEqual(travelDateError({ startDate: "", endDate: "2027-05-20" }), null);
});

test("윤년과 월 경계를 UTC 달력으로 처리한다", () => {
  assert.equal(addCalendarDays("2028-02-28", 2), "2028-03-01");
  assert.equal(calendarDays("2027-03-13", "2027-03-15"), 3);
});
