import assert from "node:assert/strict";
import test from "node:test";
import { DINING_CATALOG, DINING_PLACES } from "../src/data/dining";
import verifiedDining from "../src/data/verifiedDining.json";
import pendingDining from "../src/data/pendingDining.json";
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
  assert.equal(imported.length, 1010);
  assert.equal(new Set(imported.map((place) => place.id)).size, imported.length);
  assert.equal(imported.filter((place) => place.dining?.sourceUrl == null).length, 497);
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
  assert.equal(pending.length, 44);
  assert.equal(pending.filter((p) => p.dining?.sourceUrl == null).length, 22);
  for (const place of pending) {
    assert.equal(place.dining?.address, null);
    const map = new URL(diningMapUrl(place)!);
    assert.equal(map.searchParams.get("query"), [place.dining!.mapRecord!.nameLocal, place.dining!.mapRecord!.area].filter(Boolean).join(" "));
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

test("4차 미식 데이터는 지정 필드만 넣고 기존 시장 ID와 확인 상태를 유지한다", () => {
  const expected = ["id", "region", "nameLocal", "nameEn", "nameKo", "kind", "styles", "cuisine", "signature", "priceLevel", "sourceUrl", "checkedAt"].sort();
  const rows = [...verifiedDining.slice(344, 576), ...pendingDining.slice(26, 42)];
  assert.equal(rows.length, 248);
  assert.equal(new Set(rows.map((r) => r.region)).size, 10);
  const mapNames = new Set(rows.map((r) => r.nameLocal));
  assert.ok(!mapNames.has("Tarihi Karaköy Balıkçısı") && !mapNames.has("Konyalı Lokantası Topkapı Sarayı"));
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), expected);
    const p = ALL_PLACES.find((p) => p.id === row.id)!;
    assert.equal(p.dining?.mapRecord?.area, null);
    assert.equal(p.dining?.mapRecord?.confidence, null);
  }
  for (const id of ["tur-istanbul-1000", "uni-losangeles-x10", "uni-losangeles-x7", "spa-madrid-940", "spa-madrid-x9"]) {
    const p = ALL_PLACES.filter((p) => p.id === id);
    assert.equal(p.length, 1);
    assert.equal(p[0].dining?.mapRecord?.status, "confirmed");
  }
  const q = { ...DEFAULT_QUERY, startDate: "2027-05-10", endDate: "2027-05-15" };
  for (const [region, expectedPending] of [["chi-shanghai", 6], ["chi-beijing", 10]] as const) {
    const board = emptyBoard(region, q);
    const choices = ["점심", "디저트"].flatMap((slot) => {
      const list = candidates(region, slot as "점심" | "디저트", q, board.days[1]);
      const first = list.findIndex(({ p }) => p.dining?.mapRecord?.status === "pending");
      if (first >= 0) assert.ok(list.slice(first).every(({ p }) => p.dining?.mapRecord?.status === "pending"));
      return list;
    });
    assert.equal(choices.filter(({ p }) => p.dining?.mapRecord?.status === "pending").length, expectedPending);
  }
});

test("5차 자료는 앱의 4권역에만 연결하고 동네 및 기존 장소 ID를 유지한다", () => {
  const confirmed = verifiedDining.slice(576, 673);
  const pending = pendingDining.slice(42);
  assert.equal(confirmed.length, 97);
  assert.equal(pending.length, 2);
  const rows = [...confirmed, ...pending];
  assert.deepEqual([...new Set(rows.map((r) => r.region))].sort(), ["aus-vienna", "hun-budapest", "mac-macau", "phi-boracay"]);
  const fields = ["id", "region", "nameLocal", "nameEn", "nameKo", "area", "kind", "styles", "cuisine", "signature", "priceLevel", "sourceUrl", "checkedAt"].sort();
  assert.ok(rows.every((row) => row.nameLocal !== "Belvárosi Disznótoros – Király utca"));
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), fields);
    const p = ALL_PLACES.find((entry) => entry.id === row.id)!;
    assert.equal(p.dining?.mapRecord?.area, "area" in row ? row.area : null);
    assert.equal(p.dining?.mapRecord?.confidence, null);
  }
  for (const id of ["phi-boracay-x16", "hun-budapest-1318", "hun-budapest-x6", "aus-vienna-1011", "aus-vienna-1009"]) {
    const p = ALL_PLACES.filter((entry) => entry.id === id);
    assert.equal(p.length, 1);
    assert.equal(p[0].dining?.mapRecord?.status, "confirmed");
  }
  const pendingMarket = ALL_PLACES.filter((p) => p.id === "phi-boracay-x13");
  assert.equal(pendingMarket.length, 1);
  assert.ok(pendingMarket[0].tags.includes("시장"));
  assert.equal(pendingMarket[0].grade, "A");
  assert.equal(pendingMarket[0].dining?.mapRecord?.status, "pending");
  const q = { ...DEFAULT_QUERY, startDate: "2027-05-10", endDate: "2027-05-15" };
  for (const region of ["mac-macau", "phi-boracay"]) {
    const b = emptyBoard(region, q);
    const pendingIds = new Set(pending.map((r) => r.id));
    assert.ok(b.days.every((d) => [d.cells.점심.v, d.cells.저녁.v].every((id) => id == null || !pendingIds.has(id))));
    const lunch = candidates(region, "점심", q, b.days[1]);
    const firstPending = lunch.findIndex(({ p }) => p.dining?.mapRecord?.status === "pending");
    assert.ok(firstPending > 0);
    assert.ok(lunch.slice(0, firstPending).some(({ p }) => p.dining?.mapRecord?.status === "confirmed"));
    assert.ok(lunch.slice(firstPending).every(({ p }) => p.dining?.mapRecord?.status === "pending"));
  }
});

test("나트랑 등 5권역에 확인된 식당만 추가하고 기존 장소를 중복 생성하지 않는다", () => {
  const rows = verifiedDining.slice(673, 740);
  const countByRegion: Record<string, number> = { NT: 19, "nor-garapan": 10, "tha-pattaya": 14, "tai-kaohsiung": 23, "chi-qingdao": 1 };
  const fields = ["id", "region", "nameLocal", "nameEn", "nameKo", "area", "kind", "styles", "cuisine", "signature", "priceLevel", "sourceUrl", "checkedAt"].sort();
  assert.equal(rows.length, 67);
  assert.equal(new Set(rows.map((row) => JSON.stringify([row.region, row.nameLocal]))).size, rows.length);
  assert.deepEqual(new Set(rows.map((row) => row.region)), new Set(Object.keys(countByRegion)));
  for (const [region, count] of Object.entries(countByRegion)) {
    assert.equal(rows.filter((row) => row.region === region).length, count);
  }
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), fields);
    assert.equal(row.checkedAt, "2026-11-27");
    assert.equal(row.sourceUrl, null);
    assert.deepEqual(row.signature, []);
    assert.ok(!pendingDining.some((pending) => pending.id === row.id));
  }
  for (const id of ["wv-bd5889be1bb75f4d18", "vie-nhatrang-x22", "vie-nhatrang-x23", "vie-nhatrang-x40", "vie-nhatrang-x41"]) {
    const places = ALL_PLACES.filter((place) => place.id === id);
    assert.equal(places.length, 1);
    assert.equal(places[0].dining?.mapRecord?.status, "confirmed");
  }
  const guide = DINING_PLACES.find((place) => place.id === "wv-bd5889be1bb75f4d18")!;
  const lacCanh = ALL_PLACES.find((place) => place.id === guide.id)!;
  assert.equal(lacCanh.lat, guide.lat);
  assert.equal(lacCanh.lon, guide.lon);
  assert.equal(lacCanh.dining?.mapRecord?.guideSource?.url, guide.dining?.sourceUrl);
  assert.equal(lacCanh.dining?.mapRecord?.guideSource?.license, guide.dining?.license);
  assert.ok(ALL_PLACES.some((place) => place.id === "nt-laccanh"), "예전에 저장한 장소 ID는 삭제하지 않는다");
  const q = { ...DEFAULT_QUERY, startDate: "2027-05-10", endDate: "2027-05-15" };
  const picks = candidates("NT", "점심", q, emptyBoard("NT", q).days[1]);
  assert.deepEqual(picks.filter(({ p }) => p.en === "Lac Canh").map(({ p }) => p.id), [guide.id]);
});

test("칭다오 후속 자료는 확인된 세 곳만 추가하고 기존 키와 날짜를 따른다", () => {
  const rows = verifiedDining.slice(740, 743);
  assert.deepEqual(rows.map(({ nameLocal, region, checkedAt }) => [nameLocal, region, checkedAt]), [
    ["春和楼", "chi-qingdao", "2026-11-27"],
    ["渔家人海鲜菜馆", "chi-qingdao", "2026-11-27"],
    ["三盛楼饭店", "chi-qingdao", "2026-11-27"],
  ]);
  assert.equal(new Set(verifiedDining.map(({ id }) => id)).size, verifiedDining.length);
  assert.ok(rows.every(({ id }) => !pendingDining.some((pending) => pending.id === id)));
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), Object.keys(verifiedDining[739]).sort());
});

test("2차 음식점 자료는 달랏 등 5권역의 확인된 68곳만 추가한다", () => {
  const rows = verifiedDining.slice(743, 811);
  const byRegion = { "vie-dalat": 17, "vie-hoian": 15, "phi-tagbilaran": 13, "mal-georgetown": 18, "chi-sanya": 5 };
  assert.equal(rows.length, 68);
  assert.deepEqual([...new Set(rows.map(({ region }) => region))].sort(), Object.keys(byRegion).sort());
  const fields = Object.keys(verifiedDining[742]).sort();
  for (const [region, count] of Object.entries(byRegion)) {
    const inRegion = rows.filter((row) => row.region === region);
    assert.equal(inRegion.length, count);
    assert.equal(new Set(inRegion.map(({ nameLocal }) => nameLocal)).size, count);
  }
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), fields);
    assert.equal(row.checkedAt, "2026-11-27");
    assert.equal(row.sourceUrl, null);
    assert.deepEqual(row.signature, []);
    assert.ok(!pendingDining.some(({ id }) => id === row.id));
  }
  assert.ok(rows.some(({ nameLocal }) => nameLocal === "Quán 33 Ốc Nhồi Thịt"));
  assert.ok(!rows.some(({ nameLocal }) => nameLocal.includes("hẻm 27")));
});

test("일본 5권역의 확인된 71곳만 추가하고 기존 두 장소는 원래 ID에 연결한다", () => {
  const rows = verifiedDining.slice(811, 882);
  const counts = { "jap-nagoya": 14, "jap-beppu": 19, "jap-matsuyama": 13, "jap-nagasaki": 13, "jap-kagoshima": 12 };
  assert.equal(rows.length, 71);
  assert.deepEqual([...new Set(rows.map(({ region }) => region))].sort(), Object.keys(counts).sort());
  const keys = Object.keys(verifiedDining[810]).sort();
  for (const [region, count] of Object.entries(counts)) {
    const group = rows.filter((row) => row.region === region);
    assert.equal(group.length, count);
    assert.equal(new Set(group.map(({ nameLocal }) => nameLocal)).size, count);
  }
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), keys);
    assert.equal(row.checkedAt, "2026-11-27");
    assert.ok(!pendingDining.some(({ id, region, nameLocal }) => id === row.id || (region === row.region && nameLocal === row.nameLocal)));
  }
  for (const [id, nameLocal] of [
    ["jap-beppu-10", "地獄蒸し工房 鉄輪"],
    ["jap-nagasaki-11", "中華料理 四海樓"],
  ]) {
    const existing = ALL_PLACES.filter((p) => p.id === id);
    assert.equal(existing.length, 1);
    assert.equal(existing[0].dining?.mapRecord?.nameLocal, nameLocal);
    assert.equal(existing[0].dining?.mapRecord?.status, "confirmed");
  }
  assert.equal(rows.filter(({ id }) => id.startsWith("verified-dining-")).length, 69);
});

test("4묶음 자료는 확인된 시안·샤먼·타이난 28곳만 추가한다", () => {
  const rows = verifiedDining.slice(882, 910);
  const counts = { "chi-xian": 5, "chi-xiamen": 1, "tai-tainan": 22 };
  assert.equal(rows.length, 28);
  assert.deepEqual([...new Set(rows.map(({ region }) => region))].sort(), Object.keys(counts).sort());
  const fields = Object.keys(verifiedDining[881]).sort();
  for (const [region, count] of Object.entries(counts)) {
    const group = rows.filter((row) => row.region === region);
    assert.equal(group.length, count);
    assert.equal(new Set(group.map(({ nameLocal }) => nameLocal)).size, count);
  }
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), fields);
    assert.equal(row.checkedAt, "2026-11-27");
    assert.ok(!pendingDining.some(({ region, nameLocal }) => region === row.region && nameLocal === row.nameLocal));
  }
  assert.equal(rows.find(({ region }) => region === "chi-xiamen")?.priceLevel, null);
});

test("5묶음은 검수 통과 100곳만 담고 파스테이스 드 벨렝의 기존 ID를 보존한다", () => {
  const rows = verifiedDining.slice(910);
  const counts = { "ita-florence": 20, "por-lisbon": 23, "aus-melbourne": 17, "uni-lasvegas": 23, "cam-siemreap": 17 };
  assert.equal(rows.length, 100);
  assert.deepEqual([...new Set(rows.map(({ region }) => region))].sort(), Object.keys(counts).sort());
  const fields = Object.keys(verifiedDining[909]).sort();
  for (const [region, count] of Object.entries(counts)) {
    const group = rows.filter((row) => row.region === region);
    assert.equal(group.length, count);
    assert.equal(new Set(group.map(({ nameLocal }) => nameLocal)).size, count);
  }
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), fields);
    assert.equal(row.checkedAt, "2026-11-27");
    assert.ok(!pendingDining.some(({ region, nameLocal }) => region === row.region && nameLocal === row.nameLocal));
  }
  const original = ALL_PLACES.filter((place) => place.id === "por-lisbon-1294");
  assert.equal(original.length, 1);
  assert.equal(original[0].en, "Pastéis de Belém");
  assert.equal(original[0].dining?.mapRecord?.status, "confirmed");
  assert.equal(rows.filter(({ id }) => id.startsWith("verified-dining-")).length, 99);
});
