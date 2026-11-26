import assert from "node:assert/strict";
import test from "node:test";
import { DINING_CATALOG, DINING_PLACES } from "../src/data/dining";
import verifiedDining from "../src/data/verifiedDining.json";
import { diningMapUrl } from "../src/components/DiningMapDetails";
import { ALL_PLACES, ALL_REGIONS, isMealPlace } from "../src/services/regionScore";
import { candidates, diningDistance, emptyBoard, evaluate } from "../src/services/planner";
import { DEFAULT_QUERY } from "../src/lib/flow";

test("식당 후보에는 출처·이용 조건을 남기고 미확인 품질·편의시설을 만들지 않는다", () => {
  assert.ok(DINING_PLACES.length >= 100);
  for (const place of DINING_PLACES) {
    assert.equal(place.grade, null);
    assert.ok(place.dining?.sourceUrl?.startsWith("https://en.wikivoyage.org/w/index.php?"));
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

test("지도 확인 식당은 실제 권역에 연결되고 미확인 연락처와 자동 동선용 좌표는 가져오지 않는다", () => {
  const imported = ALL_PLACES.filter((place) => place.dining?.mapRecord?.status === "confirmed");
  assert.equal(imported.length, 344);
  assert.equal(new Set(imported.map((place) => place.id)).size, imported.length);
  assert.equal(imported.filter((place) => place.dining?.sourceUrl == null).length, 71);
  const regions = new Set(ALL_REGIONS.map((region) => region.id));
  for (const row of verifiedDining) {
    const place = imported.find((p) => p.id === row.id)!;
    assert.ok(regions.has(place.region));
    assert.equal(place.region, row.region);
    assert.equal(place.dining?.address, null);
    assert.equal(place.dining?.sourceUrl, row.sourceUrl);
    assert.ok(!("phone" in row || "address" in row || "opening_hours" in row));
    const mapUrl = new URL(diningMapUrl(place)!);
    assert.equal(mapUrl.searchParams.get("query"), [row.nameLocal, row.area].filter(Boolean).join(" "));
    if (row.id.startsWith("verified-dining-")) {
      assert.equal(place.grade, null);
      assert.equal(place.lat, undefined);
      assert.equal(place.lon, undefined);
      assert.ok(isMealPlace(place));
    }
  }
});

test("기존 오사카 가이드 장소 ID와 출처를 유지하고 신규 다낭 메뉴 오탈자를 고친다", () => {
  for (const id of ["wv-00bda7807878b6c85d", "wv-b770efa4a90acfcc5b", "wv-d873e2dea1cdcc2743"]) {
    const previous = DINING_PLACES.find((p) => p.id === id)!;
    const current = ALL_PLACES.filter((p) => p.id === id);
    assert.equal(current.length, 1);
    assert.equal(current[0].dining?.mapRecord?.status, "confirmed");
    assert.equal(current[0].dining?.mapRecord?.guideSource?.url, previous.dining?.sourceUrl);
    assert.equal(current[0].dining?.mapRecord?.guideSource?.license, "CC-BY-SA-4.0");
  }
  assert.ok(ALL_PLACES.find((p) => p.id === "vie-danang-x49")?.dining?.mapRecord?.signature.includes("새우와 돼지고기를 넣은 생춘권"));
});

test("확인 중 후보는 점심 목록에서 확인됨 뒤에 오고 지도 검색으로 찾을 수 있다", () => {
  const pending = ALL_PLACES.filter((p) => p.dining?.mapRecord?.status === "pending");
  assert.equal(pending.length, 26);
  assert.equal(pending.filter((p) => p.dining?.sourceUrl == null).length, 10);
  for (const place of pending) {
    assert.equal(place.dining?.address, null);
    const map = new URL(diningMapUrl(place)!);
    assert.equal(map.searchParams.get("query"), `${place.dining!.mapRecord!.nameLocal} ${place.dining!.mapRecord!.area}`);
    if (place.id.startsWith("pending-dining-")) assert.equal(place.lat, undefined);
    if (place.id.startsWith("pending-dining-")) assert.equal(place.lon, undefined);
  }
  const q = { ...DEFAULT_QUERY, startDate: "2027-05-10", endDate: "2027-05-15" };
  for (const region of ["gre-fira", "chi-harbin"]) {
    const board = emptyBoard(region, q);
    const choices = candidates(region, "점심", q, board.days[1]);
    const statuses = choices.map(({ p }) => p.dining?.mapRecord?.status);
    const firstPending = statuses.indexOf("pending");
    assert.ok(firstPending > 0);
    assert.ok(statuses.includes("confirmed"));
    assert.ok(statuses.slice(firstPending).every((status) => status === "pending"));
    assert.ok(board.days.every((day) => !pending.some((place) => place.id === day.cells.점심.v)));
  }
});

test("미식 후보로도 표시한 니시키 시장은 기존 관광과 저장 장소 ID를 유지한다", () => {
  const day = emptyBoard("jap-kyoto", DEFAULT_QUERY).days[0];
  for (const slot of ["점심", "오전"] as const) {
    const market = candidates("jap-kyoto", slot, DEFAULT_QUERY, day).find(({ p }) => p.id === "jap-kyoto-17");
    assert.equal(market?.p.dining?.mapRecord?.nameEn, "Nishiki Food Market");
  }
});

test("신규 미식 자료는 기존 시장 ID와 관광 역할을 보존하고 확인 상태별로 식사 후보를 정렬한다", () => {
  const q = { ...DEFAULT_QUERY, startDate: "2027-05-10", endDate: "2027-05-15" };
  const hanoi = "vie-hanoi";
  const hanoiBoard = emptyBoard(hanoi, q);
  const day = hanoiBoard.days[1];
  const lunch = candidates(hanoi, "점심", q, day);
  const pendingMarket = ALL_PLACES.filter((p) => p.id === "vie-hanoi-684");
  assert.equal(pendingMarket.length, 1);
  assert.equal(pendingMarket[0].dining?.mapRecord?.status, "pending");
  assert.ok(pendingMarket[0].tags.includes("시장"));
  assert.ok(!isMealPlace(pendingMarket[0]));
  assert.ok(candidates(hanoi, "오전", q, day).some(({ p }) => p.id === pendingMarket[0].id));
  const firstPending = lunch.findIndex(({ p }) => p.dining?.mapRecord?.status === "pending");
  assert.ok(firstPending > 0);
  assert.ok(lunch.slice(0, firstPending).some(({ p }) => p.dining?.mapRecord?.status === "confirmed"));
  assert.ok(lunch.slice(firstPending).some(({ p }) => p.id === pendingMarket[0].id));
  assert.ok(lunch.slice(firstPending).every(({ p }) => p.dining?.mapRecord?.status === "pending"));

  const borough = ALL_PLACES.filter((p) => p.id === "uni-london-1234");
  assert.equal(borough.length, 1);
  assert.equal(borough[0].dining?.mapRecord?.status, "confirmed");
  assert.ok(!isMealPlace(borough[0]));
  const maltby = ALL_PLACES.find((p) => p.dining?.mapRecord?.nameEn === "Maltby Street Market")!;
  const restaurant = ALL_PLACES.find((p) => p.dining?.mapRecord?.nameEn === "Dishoom Covent Garden")!;
  assert.ok(isMealPlace(maltby) && isMealPlace(restaurant));
  assert.notEqual(maltby.id, borough[0].id);
  assert.notEqual(restaurant.id, "uni-london-1233");
});
