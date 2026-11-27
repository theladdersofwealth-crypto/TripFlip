import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_QUERY, loadBoard, loadQuery, saveBoard, saveQuery } from "../src/lib/flow";
import { recommendationDefaults } from "../src/lib/questionFlow";
import { resultThemes, withResultThemes } from "../src/lib/resultThemes";
import { decodeShare, encodeShare } from "../src/lib/shareLink";
import { conceptWeight } from "../src/lib/travelParty";
import { ALL_PLACES, scoreRegions } from "../src/services/regionScore";
import { boardKey, byId, emptyBoard, REST } from "../src/services/planner";
import type { PlaceV1 } from "../src/data/regionsV1";

const q = { ...recommendationDefaults(DEFAULT_QUERY), startDate: "2027-05-10", endDate: "2027-05-15" };
test("메인부터 시작하고 서브는 한 개만 교체하거나 해제한다", () => {
  assert.deepEqual(resultThemes(q), { main: "관광", sub: null });
  const main = withResultThemes(q, "관광", null);
  const a = withResultThemes(main, "관광", "휴양");
  const b = withResultThemes(a, "관광", "미식");
  assert.deepEqual(b.interests, ["관광", "미식"]);
  assert.deepEqual(b.subs, ["미식"]);
  assert.equal(conceptWeight(["관광"], b), 1);
  assert.ok(conceptWeight(["미식"], b) > 0 && conceptWeight(["미식"], b) < 1);
  assert.deepEqual(withResultThemes(b, "관광", null), main);
  assert.deepEqual(withResultThemes(b, "관광", "관광"), main);
  assert.deepEqual(decodeShare(encodeShare(b))?.interests, ["관광", "미식"]);
});

test("서브 미식을 넣으면 추천에 반영되고 해제하면 기존 추천과 같다", () => {
  const main = withResultThemes(q, "관광", null);
  const mix = withResultThemes(main, "관광", "미식");
  const summary = (query: typeof main) => scoreRegions(query).map((r) => [r.region.id, r.rank, r.display]);
  const base = summary(main);
  const both = summary(mix);
  assert.notDeepEqual(base, both);
  assert.deepEqual(summary(withResultThemes(mix, "관광", null)), base);
});

test("일정이 두 테마를 사용하고, 테마 교체 시 수동 고정과 날짜가 유지된다", () => {
  const id = "theme-planner-fixture";
  const places: PlaceV1[] = (["관광", "휴양", "액티비티"] as const).flatMap((concept) =>
    Array.from({ length: 12 }, (_, i) => ({
      id: `${id}-${concept}-${i}`, name: `${concept} ${i}`, en: `${concept} ${i}`, region: id,
      concepts: [concept], tags: [], grade: "A" as const, travel: "20분", penalty: 0,
    })));
  const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  ALL_PLACES.push(...places);
  try {
    const base = withResultThemes(q, "관광", null);
    const mixed = withResultThemes(base, "관광", "휴양");
    const themeOf = (board: ReturnType<typeof emptyBoard>) => board.days.flatMap((day) =>
      Object.values(day.cells).flatMap((cell) => cell.v ? byId(cell.v)?.concepts ?? [] : []));
    const old = emptyBoard(id, base);
    assert.ok(!themeOf(old).includes("휴양"));
    old.days[1].cells.오전 = { v: REST, lock: true };
    saveBoard(id, old);
    saveQuery(mixed);
    assert.deepEqual(resultThemes(loadQuery()), { main: "관광", sub: "휴양" });
    const refreshed = loadBoard(id, boardKey(id, mixed));
    assert.ok(refreshed);
    assert.deepEqual(refreshed.days[1].cells.오전, { v: REST, lock: true });
    assert.deepEqual(refreshed.days.map((d) => d.date), old.days.map((d) => d.date));
    assert.ok(themeOf(refreshed).includes("관광"));
    assert.ok(themeOf(refreshed).includes("휴양"));
    assert.ok(!themeOf(refreshed).includes("액티비티"));
    assert.equal(loadBoard(id, boardKey(id, { ...mixed, perDay: 3 })), null);
  } finally {
    ALL_PLACES.splice(-places.length);
    if (before) Object.defineProperty(globalThis, "localStorage", before);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
