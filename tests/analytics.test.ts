import test from "node:test";
import assert from "node:assert/strict";
import { stepForPath } from "../src/lib/analytics";
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

test("계정에 올릴 여행 모양 검사", async () => {
  const { planOk } = await import("../workers/stats/src/lib.js");
  const p = { id: "NT-2026-12-20-abc", regionId: "NT", regionName: "나트랑", query: {}, createdAt: "2026-11-24T00:00:00Z" };
  assert.equal(planOk(p), true);
  assert.equal(planOk({ ...p, id: "a b" }), false);
  assert.equal(planOk({ ...p, query: null }), false);
  assert.equal(planOk(null), false);
});

test("관리자 통계에서 뺄 닉네임 목록", async () => {
  const { hiddenNickKeys, nickKey } = await import("../workers/stats/src/lib.js");
  assert.deepEqual(hiddenNickKeys(" 너만은잡는다 , Abc,,abc "), ["너만은잡는다", "abc"]);
  assert.deepEqual(hiddenNickKeys(undefined), []);
  assert.equal(hiddenNickKeys("너만은잡는다")[0], nickKey("너만은잡는다"));
});


test("희망 지역 통계는 검색 시 허용된 고정 지역 ID만 받고 구버전 이벤트를 유지한다", async () => {
  const { SEARCH_AREAS } = await import("../workers/stats/src/lib.js");
  const { TRAVEL_AREAS } = await import("../src/data/travelAreas");
  assert.deepEqual(SEARCH_AREAS, TRAVEL_AREAS.map((a) => a.id));
  const base = { v: "abc12345", s: "search" };
  assert.deepEqual(parseEvent({ ...base, g: ["northern-europe", "southeast-asia", "northern-europe"] }), { ...base, r: "", g: ["southeast-asia", "northern-europe"] });
  assert.deepEqual(parseEvent({ ...base, g: [] }), { ...base, r: "", g: [] });
  assert.deepEqual(parseEvent(base), { ...base, r: "" });
  assert.equal(parseEvent({ ...base, g: ["개인 이름"] }), null);
  assert.equal(parseEvent({ ...base, g: "east-asia" }), null);
  assert.equal(parseEvent({ ...base, s: "visit", g: ["east-asia"] }), null);
});
