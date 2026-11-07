import { test } from "node:test";
import assert from "node:assert/strict";
import { PLACE_ATTRS } from "../src/data/placeAttrs";
import { PLACE_FIT } from "../src/data/placeFit";
import type { PlaceV1 } from "../src/data/regionsV1";
import { ALL_PLACES } from "../src/services/regionScore";
import type { RegionQuery } from "../src/services/regionScore";
import { ARRIVE, LEAVE, boardKey, completeBoard, emptyBoard, evaluate, isSpecial, optimize, toDayPlan } from "../src/services/planner";
import type { Board } from "../src/services/planner";
import { buildTimetable } from "../src/services/itineraryV1";

const query: RegionQuery = { startDate: "2027-05-07", endDate: "2027-05-09", adults: 2, children: [], elders: false, pet: false, main: "관광", subs: [], perDay: 3, price: "상관없음", stay: "가성비" };
const place = (id: string): PlaceV1 => ({ id, region: "planner-test", name: id, en: id, concepts: ["관광"], tags: ["사진촬영"], grade: "S", travel: "2시간 이하", penalty: 0 });
const pref = { wake: "07:30", breakfast: "08:00", breakfastMin: 45, transport: "택시·그랩" as const };

test("packed는 식사와 별개로 2/3/1곳, normal·relaxed도 이동일을 반영한다", () => {
  const fixtures = Array.from({ length: 12 }, (_, i) => place(`planner-fixture-${i}`));
  ALL_PLACES.push(...fixtures);
  fixtures.forEach((p) => { PLACE_ATTRS[p.id] = ["아무때나", 60, "중"]; });
  try {
    for (const [perDay, expected] of [[1, [1, 1, 1]], [2, [1, 2, 1]], [3, [2, 3, 1]]] as const) {
      const board = emptyBoard("planner-test", { ...query, perDay });
      assert.deepEqual(board.days.map((d, i) => toDayPlan(d, i + 1).slots.length), expected);
      assert.equal(board.days[0].cells.오전.v, ARRIVE);
      assert.equal(board.days[2].cells.오후.v, LEAVE);
      const ids = board.days.flatMap((d) => Object.entries(d.cells).filter(([k, c]) => !["점심", "저녁", "디저트"].includes(k) && !isSpecial(c.v)).map(([, c]) => c.v));
      assert.equal(new Set(ids).size, ids.length, "자동 생성에서 관광지를 반복하지 않는다");
      const locked = { ...board, days: board.days.map((d, i) => i === 1 ? { ...d, cells: { ...d.cells, 오전: { v: fixtures[10].id, lock: true } } } : d) };
      assert.deepEqual(optimize(locked, "planner-test", { ...query, perDay }).days[1].cells.오전, locked.days[1].cells.오전);
    }
  } finally {
    ALL_PLACES.splice(ALL_PLACES.length - fixtures.length);
    fixtures.forEach((p) => { delete PLACE_ATTRS[p.id]; });
  }
});

test("AI 동행 0점은 이용 불가가 아니며, 부모님 관계만으로 보행 부담을 단정하지 않는다", () => {
  const p = { ...place("ai-zero-test"), steep: true };
  PLACE_FIT[p.id] = [2, 0, 0, 0, 0, 0, 0, 0, 0];
  const m = { id: "m", name: "구성원", relationship: "spouse" as const, age: 40, mobility: "standard" as const, stroller: false, preferences: [] };
  try {
    const evaluation = evaluate(p, { ...query, members: [m] }, { condition: "보통", weather: "맑음" });
    assert.equal(evaluation.blockedBy, undefined);
    assert.ok(evaluation.total > 0);
    assert.ok(evaluation.parts.some((part) => part.includes("AI 추정")));
  } finally { delete PLACE_FIT[p.id]; }
  const regular = evaluate(p, { ...query, members: [{ ...m, relationship: "parent" }] }, { condition: "보통", weather: "맑음" });
  const self = evaluate(p, { ...query, members: [{ ...m, relationship: "self" }] }, { condition: "보통", weather: "맑음" });
  const limited = evaluate(p, { ...query, members: [{ ...m, relationship: "parent", mobility: "limited" }] }, { condition: "보통", weather: "맑음" });
  assert.equal(regular.total, self.total);
  assert.ok(limited.total < regular.total);
});

test("과거 4칸 저장본과 가족 세부조건 변경을 안전하게 처리한다", () => {
  const legacy = { key: "old", days: [{ date: query.startDate, condition: "보통", weather: "맑음", cells: { 오전: { v: ARRIVE, lock: true }, 점심: { v: null, lock: false }, 오후: { v: null, lock: false }, 저녁: { v: null, lock: false } } }] } as unknown as Board;
  const board = completeBoard(legacy);
  assert.deepEqual(board.days[0].cells.야간, { v: null, lock: false });
  assert.deepEqual(board.days[0].cells.오전, legacy.days[0].cells.오전);
  assert.notEqual(boardKey("NT", query), boardKey("NT", { ...query, roomCount: 3 }));
  assert.notEqual(boardKey("NT", query), boardKey("NT", { ...query, totalBudgetKrw: 10_000_000 }));
});

test("조식 선택이 시작시간에 반영되고 출국일에 저녁 관광을 만들지 않는다", () => {
  const day = { day: 2, date: query.endDate, slots: [{ label: "오전", place: place("short-stop") }], fullDay: false, departure: true };
  PLACE_ATTRS["short-stop"] = ["아무때나", 60, "중"];
  try {
    const withBreakfast = buildTimetable(day, { ...pref, breakfastEnabled: true });
    const withoutBreakfast = buildTimetable(day, { ...pref, breakfastEnabled: false });
    assert.ok(withBreakfast.some((r) => r.title === "조식"));
    assert.ok(!withoutBreakfast.some((r) => r.title === "조식"));
    assert.ok(withoutBreakfast.find((r) => r.kind === "visit")!.time < withBreakfast.find((r) => r.kind === "visit")!.time);
    assert.ok(withBreakfast.at(-1)!.title.includes("공항 이동"));
    assert.ok(!withBreakfast.some((r) => r.title.startsWith("저녁")));
    const late = buildTimetable({ ...day, arrival: true, departure: false }, { ...pref, wake: "10:00", breakfast: "10:30", breakfastMin: 90 });
    assert.ok(late.every((r) => !r.end || r.end >= r.time));
  } finally { delete PLACE_ATTRS["short-stop"]; }
});
