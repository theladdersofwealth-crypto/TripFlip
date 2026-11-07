import assert from "node:assert/strict";
import test from "node:test";
import { DINING_CATALOG, DINING_PLACES } from "../src/data/dining";
import { candidates, diningDistance, emptyBoard, evaluate } from "../src/services/planner";
import { DEFAULT_QUERY } from "../src/lib/flow";

test("식당 후보에는 출처·이용 조건을 남기고 미확인 품질·편의시설을 만들지 않는다", () => {
  assert.ok(DINING_PLACES.length >= 100);
  for (const place of DINING_PLACES) {
    assert.equal(place.grade, null);
    assert.ok(place.dining?.sourceUrl.startsWith("https://en.wikivoyage.org/w/index.php?"));
    assert.equal(place.dining?.license, "CC-BY-SA-4.0");
  }
  assert.ok(DINING_CATALOG.places.every((p) => p.kidsChair === null && p.kidsMenu === null && p.openingHours === null));
});

test("좌표를 모르는 식당은 거점 좌표로 채우거나 자동 일정에 넣지 않는다", () => {
  const unknown = DINING_PLACES.find((p) => p.lat == null)!;
  assert.equal(unknown.lon, undefined);
  const q = { ...DEFAULT_QUERY, startDate: "2027-05-07", endDate: "2027-05-17" };
  const board = emptyBoard(unknown.region, q);
  assert.ok(!board.days.some((d) => Object.values(d.cells).some((c) => c.v === unknown.id)));
  assert.equal(evaluate(unknown, q, board.days[0]).label, "위치 확인 필요");
});

test("가이드의 식당과 카페가 실제 선택 후보에 연결되고 음식 종류 필터를 따른다", () => {
  const q = { ...DEFAULT_QUERY, startDate: "2027-05-07", endDate: "2027-05-10" };
  const day = emptyBoard("NT", q).days[1];
  const all = candidates("NT", "점심", q, day);
  assert.ok(all.length >= 15);
  assert.ok(all.some((x) => x.p.dining));
  assert.ok(all.every((x) => x.p.dining?.kind !== "cafe"));
  const western = candidates("NT", "점심", q, { ...day, mealStyle: "western" });
  assert.ok(western.filter((x) => x.p.dining).every((x) => x.p.dining!.styles.includes("western")));
  assert.ok(candidates("NT", "디저트", q, day).some((x) => x.p.dining?.kind === "cafe"));
});

test("시내 식당의 거리는 기존 섬 좌표 대신 출처 확인한 도시 좌표에서 계산한다", () => {
  const place = DINING_PLACES.find((p) => p.name === "Lac Canh")!;
  const distance = diningDistance(place, {});
  assert.equal(distance.from, "거점");
  assert.ok(distance.km != null && distance.km < 3, "나트랑 시내 식당을 10km 이상 떨어졌다고 표시하지 않는다");
});
