import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_QUERY, DEFAULT_PREFS, loadBoard, loadPlans, loadPrefs, saveBoard, savePlan, savePrefs } from "../src/lib/flow";
import { normalizeParty } from "../src/lib/travelParty";
import { REGIONS_V1 } from "../src/data/regionsV1";
import { boardKey, emptyBoard } from "../src/services/planner";
import { childAgesForBooking, flightSearchUrl, hotelSearchUrl } from "../src/services/booking";
const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) } });
});

test("저장 계획의 일정과 조식 설정은 이후 같은 권역의 다른 여행과 독립적이다", () => {
  const q = { ...DEFAULT_QUERY, startDate: "2027-05-07", endDate: "2027-05-10" };
  const key = boardKey("NT", q);
  const board = emptyBoard("NT", q);
  board.days[1].cells["오전"] = { v: "nt-ponagar", lock: true };
  assert.equal(savePlan({ id: "saved-1", regionId: "NT", regionName: "나트랑", query: q, display: 80, booked: { flight: false, hotel: false }, createdAt: "2026-11-03", board, prefs: { ...DEFAULT_PREFS, breakfastEnabled: false } }), true);
  saveBoard("NT", emptyBoard("NT", { ...q, perDay: 1 }));
  savePrefs("NT", { ...DEFAULT_PREFS, breakfastEnabled: true });
  assert.equal(loadBoard("NT", key, "saved-1")?.days[1].cells["오전"].lock, true);
  assert.equal(loadPrefs("NT", "saved-1").breakfastEnabled, false);
  const edited = loadBoard("NT", key, "saved-1")!;
  edited.days[1].condition = "피곤";
  saveBoard("NT", edited, "saved-1");
  assert.equal(loadPlans()[0].board?.days[1].condition, "피곤");
});

test("예약 링크는 실제 자녀 나이와 선택한 객실 수를 사용한다", () => {
  const q = normalizeParty({ ...DEFAULT_QUERY, roomCount: 3, members: [
    { id: "a", name: "나", relationship: "self", age: 40, mobility: "standard", stroller: false, preferences: [] },
    { id: "b", name: "자녀", relationship: "child", age: 2, mobility: "standard", stroller: true, preferences: [] },
    { id: "c", name: "성인 자녀", relationship: "child", age: 20, mobility: "standard", stroller: false, preferences: [] },
  ] });
  assert.deepEqual(childAgesForBooking(q), [2]);
  const hotel = new URL(hotelSearchUrl(REGIONS_V1[0], q));
  assert.equal(hotel.searchParams.get("rooms"), "3");
  assert.equal(hotel.searchParams.get("adults"), "2");
  assert.equal(hotel.searchParams.get("childAges"), "2");
  assert.equal(new URL(flightSearchUrl(REGIONS_V1[0], q)).searchParams.get("childrenv2"), "2");
});

test("미확인 자녀 나이를 대표 나이로 꾸며 예약처에 전달하지 않는다", () => {
  const q = { ...DEFAULT_QUERY, children: [{ band: "유아" as const, height: null }] };
  assert.equal(childAgesForBooking(q), null);
  assert.equal(new URL(hotelSearchUrl(REGIONS_V1[0], q)).searchParams.has("childAges"), false);
});

test("브라우저 저장 실패를 성공으로 보고하지 않는다", () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem: () => { throw new Error("quota exceeded"); } } });
  assert.equal(savePlan({ id: "fail", regionId: "NT", regionName: "나트랑", query: DEFAULT_QUERY, display: 0, booked: { flight: false, hotel: false }, createdAt: "2026-11-03" }), false);
});

test("운영 앱의 예전 키로 저장한 일정도 동일 조건이면 고정 칸을 보존한다", () => {
  const q = { ...DEFAULT_QUERY, startDate: "2027-05-07", endDate: "2027-05-10" };
  const legacy = emptyBoard("NT", q);
  legacy.key = ["NT", q.startDate, q.endDate, "부부", q.main, q.subs.join(","), q.perDay].join("|");
  legacy.days[1].cells["오전"] = { v: "nt-ponagar", lock: true };
  saveBoard("NT", legacy);
  const restored = loadBoard("NT", boardKey("NT", q));
  assert.equal(restored?.key, boardKey("NT", q));
  assert.deepEqual(restored?.days[1].cells["오전"], { v: "nt-ponagar", lock: true });
  assert.equal(loadBoard("NT", boardKey("NT", { ...q, perDay: 3 })), null);
  assert.equal(loadBoard("NT", boardKey("NT", { ...q, endDate: "2027-05-11" })), null);
});
