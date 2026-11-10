import test from "node:test";
import assert from "node:assert/strict";
import { stepForPath } from "../src/lib/analytics";
// @ts-expect-error 순수 JS Worker 모듈
import { parseEvent, kstDay } from "../workers/stats/src/lib.js";

test("주소를 퍼널 단계로 바꾼다", () => {
  assert.equal(stepForPath("/"), null);
  assert.deepEqual(stepForPath("/results/"), { s: "results" });
  assert.deepEqual(stepForPath("/r/vie-nhatrang"), { s: "region", r: "vie-nhatrang" });
  assert.deepEqual(stepForPath("/r/vie-nhatrang/day/2/"), { s: "day", r: "vie-nhatrang" });
  assert.deepEqual(stepForPath("/book/jap-osaka"), { s: "book", r: "jap-osaka" });
  assert.deepEqual(stepForPath("/r/NT/day/1"), { s: "day", r: "NT" });
  assert.equal(stepForPath("/admin"), null);
});

test("통계 서버는 정해진 모양의 익명 이벤트만 받는다", () => {
  assert.deepEqual(parseEvent('{"v":"abc12345","s":"visit"}'), { v: "abc12345", s: "visit", r: "" });
  assert.deepEqual(parseEvent({ v: "abc12345", s: "save", r: "vie-nhatrang" }), { v: "abc12345", s: "save", r: "vie-nhatrang" });
  assert.equal(parseEvent('{"v":"abc12345","s":"hack"}'), null);
  assert.deepEqual(parseEvent({ v: "abc12345", s: "region", r: "NT" }), { v: "abc12345", s: "region", r: "NT" });
  assert.equal(parseEvent('{"v":"A B","s":"visit"}'), null);
  assert.equal(parseEvent('{"v":"abc12345","s":"visit","r":"<script>"}'), null);
  assert.equal(parseEvent("not json"), null);
});

test("날짜는 한국 시간 기준", () => {
  assert.equal(kstDay(Date.parse("2026-11-10T15:30:00Z")), "2026-11-11");
  assert.equal(kstDay(Date.parse("2026-11-10T14:59:00Z")), "2026-11-10");
});
