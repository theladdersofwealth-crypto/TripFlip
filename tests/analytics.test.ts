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

test("화면 주소는 서버가 받는 모양으로만 보낸다", async () => {
  const { cleanPath, activityLabel } = await import("../src/lib/analytics");
  assert.equal(cleanPath("/r/NT/day/2/"), "/r/NT/day/2");
  assert.equal(cleanPath("/"), "/");
  assert.equal(cleanPath("/검색"), undefined);
  assert.deepEqual(parseEvent({ v: "abc12345", s: "visit", p: "/r/NT" }), { v: "abc12345", s: "visit", r: "", p: "/r/NT" });
  assert.equal(parseEvent({ v: "abc12345", s: "visit", p: "/<x>" }), null);
  const nm = (id: string) => (id === "NT" ? "나트랑" : id);
  assert.equal(activityLabel("visit", "", "/r/NT/day/2", nm), "나트랑 2일차 타임테이블");
  assert.equal(activityLabel("hotel", "NT", "", nm), "🏨 숙소 예약 버튼 (나트랑)");
  assert.equal(activityLabel("visit", "", "/results", nm), "추천 목록");
});

test("간편 가입 입력 검사와 PIN 해시", async () => {
  // @ts-expect-error 순수 JS Worker 모듈
  const { validateSignup, hashPin, nickKey, lockMs } = await import("../workers/stats/src/lib.js");
  const ok = { nick: " 준서아빠 ", birth: "1985-01-27", gender: "M", pin: "012345", agree: true };
  assert.deepEqual(validateSignup(ok, "2026-11-24"), { nick: "준서아빠", birth: "1985-01-27", gender: "M", pin: "012345" });
  assert.match(validateSignup({ ...ok, pin: "12345" }).error, /6자리/);
  assert.match(validateSignup({ ...ok, pin: "12345a" }).error, /6자리/);
  assert.match(validateSignup({ ...ok, birth: "1985-02-30" }).error, /생년월일/);
  assert.match(validateSignup({ ...ok, birth: "2030-01-01" }, "2026-11-24").error, /생년월일/);
  assert.match(validateSignup({ ...ok, gender: "X" }).error, /성별/);
  assert.match(validateSignup({ ...ok, nick: "a" }).error, /닉네임/);
  assert.match(validateSignup({ ...ok, nick: "<b>" }).error, /닉네임/);
  assert.match(validateSignup({ ...ok, agree: false }).error, /동의/);
  assert.equal(nickKey(" AbC "), "abc");
  const h1 = await hashPin("123456", "00112233445566778899aabbccddeeff", 1000);
  assert.equal(h1.length, 64);
  assert.notEqual(h1, "123456");
  assert.equal(await hashPin("123456", "00112233445566778899aabbccddeeff", 1000), h1);
  assert.notEqual(await hashPin("123456", "ff112233445566778899aabbccddeeff", 1000), h1);
  assert.equal(lockMs(1), 15 * 60000);
  assert.equal(lockMs(2), 30 * 60000);
  assert.equal(lockMs(20), 24 * 3600000);
});

test("생년월일 8자리 입력", async () => {
  const { birthFrom8 } = await import("../src/lib/account");
  assert.equal(birthFrom8("19850127"), "1985-01-27");
  assert.equal(birthFrom8("19850230"), null);
  assert.equal(birthFrom8("1985012"), null);
});

test("계정에 올릴 여행 모양 검사", async () => {
  // @ts-expect-error 순수 JS Worker 모듈
  const { planOk } = await import("../workers/stats/src/lib.js");
  const p = { id: "NT-2026-12-20-abc", regionId: "NT", regionName: "나트랑", query: {}, createdAt: "2026-11-24T00:00:00Z" };
  assert.equal(planOk(p), true);
  assert.equal(planOk({ ...p, id: "a b" }), false);
  assert.equal(planOk({ ...p, query: null }), false);
  assert.equal(planOk(null), false);
});
