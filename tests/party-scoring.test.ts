import assert from "node:assert/strict";
import test from "node:test";
import { PLACES_V1, REGIONS_V1 } from "../src/data/regionsV1";
import { PLACE_FIT } from "../src/data/placeFit";
import { KRW_PER_USD } from "../src/data/worldPrices";
import { conceptWeight, coreInterests, dayVisitCapacity, membersOf, normalizeParty, personalFit, plannedVisitCount, roomEstimate } from "../src/lib/travelParty";
import type { TravelMember } from "../src/lib/travelParty";
import { estimateTripCost, isMealPlace, scoreRegions } from "../src/services/regionScore";
import type { RegionQuery } from "../src/services/regionScore";

function query(extra: Partial<RegionQuery> = {}): RegionQuery {
  return { startDate: "2027-05-07", endDate: "2027-05-10", adults: 2, children: [], elders: false, pet: false,
    main: "휴양", subs: ["액티비티"], perDay: 2, price: "상관없음", stay: "가심비", ...extra };
}
function member(id: string, extra: Partial<TravelMember> = {}): TravelMember {
  return { id, name: id, relationship: "other", age: null, mobility: "standard", stroller: false, preferences: [], ...extra };
}

test("성인 자녀·부모님·유아의 실제 구성으로 인원과 연령대를 계산한다", () => {
  const q = normalizeParty(query({ members: [
    member("나", { relationship: "self", age: 45 }), member("성인 자녀", { relationship: "child", age: 20 }),
    member("유아", { relationship: "child", age: 2, stroller: true }), member("부모님", { relationship: "parent", age: 70 }),
  ] }));
  assert.equal(q.adults, 3);
  assert.deepEqual(q.children, [{ band: "영아", height: null, actualAge: 2 }]);
  assert.equal(q.elders, true);
  assert.equal(membersOf(q).find((m) => m.relationship === "parent")!.mobility, "standard");
});

test("예전 자녀 나이대를 실제 나이로 만들어 저장하지 않는다", () => {
  const m = membersOf(query({ children: [{ band: "유아", height: null }] })).at(-1)!;
  assert.equal(m.age, null);
  assert.equal(m.childBand, "유아");
});

test("동등하게 선택한 핵심 취향은 같은 가중치로 반영된다", () => {
  const q = query({ interests: ["휴양", "액티비티"] });
  assert.equal(conceptWeight(["휴양"], q), 1);
  assert.equal(conceptWeight(["액티비티"], q), 1);
  assert.equal(conceptWeight(["관광"], q), 0);
  assert.equal(conceptWeight(["액티비티"], query()), 0.5, "예전 저장 조건은 기존 메인/서브 비율을 유지한다");
});

test("구성원의 서로 다른 희망을 여행 전체의 핵심 취향으로 모은다", () => {
  const q = query({ interests: ["휴양"], members: [member("나", { preferences: ["휴양"] }), member("배우자", { preferences: ["액티비티"] })] });
  assert.deepEqual(coreInterests(q), ["휴양", "액티비티"]);
});

test("추천에 필요한 장소 수는 첫날과 마지막 날의 실제 관광 칸과 일치한다", () => {
  assert.equal(plannedVisitCount(query({ perDay: 1 })), 4);
  assert.equal(plannedVisitCount(query({ perDay: 2 })), 6);
  assert.equal(plannedVisitCount(query({ perDay: 3 })), 9);
  assert.deepEqual([0, 1, 2, 3].map((d) => dayVisitCapacity(3, d, 4)), [2, 3, 3, 1]);
  assert.equal(plannedVisitCount(query({ startDate: "bad" })), 0);
});

test("객실 수는 전원을 포함한 가정이며 사용자 선택을 존중한다", () => {
  const q = query({ adults: 4, children: [{ band: "영아", height: null }, { band: "초등", height: null }] });
  assert.deepEqual(roomEstimate(q), { rooms: 3, estimated: true });
  assert.deepEqual(roomEstimate({ ...q, roomCount: 1 }), { rooms: 1, estimated: false }, "가족실 1개 요청을 인원만으로 거절하지 않는다");
});

test("3박 4일 경비에 숙박 3박과 식비 4일을 구분하고 전체 인원을 반영한다", () => {
  const q = query({ roomCount: 2 });
  const cost = estimateTripCost(REGIONS_V1.find((r) => r.id === "NT")!, q);
  assert.equal(cost.nights, 3);
  assert.equal(cost.rooms, 2);
  const expected = Math.round(cost.flightKrw! * 2 + (cost.hotelNightUsd! * 2 * 3 + cost.foodPerDayUsd! * 2 * 4) * KRW_PER_USD);
  assert.equal(cost.partyTotalKrw, expected);
  assert.equal(cost.totalKrw, Math.round(expected / 2));
  assert.equal(cost.estimated, true, "과거 수집 가격도 해당 여행 날짜의 확정 견적이 아니다");
});

test("전체 예산은 유연한 희망과 상한 필터를 구분한다", () => {
  const soft = scoreRegions(query({ totalBudgetKrw: 1, budgetMode: "flexible" }));
  const nt = soft.find((r) => r.region.id === "NT")!;
  assert.equal(nt.stay.budgetStatus, "over");
  assert.equal(nt.status, "ranked");
  const strict = scoreRegions(query({ totalBudgetKrw: 1, budgetMode: "cap" }));
  assert.equal(strict.find((r) => r.region.id === "NT")!.status, "예산 밖");
  assert.equal(estimateTripCost(REGIONS_V1[0], query()).budgetStatus, "unset");
});

test("부모님 동행만으로 급경사 장소를 강제 제외하지 않는다", () => {
  const p = PLACES_V1.find((x) => x.id === "nt-baho")!;
  const active = query({ members: [member("부모님", { relationship: "parent", age: 70 })] });
  const limited = query({ members: [member("부모님", { relationship: "parent", age: 70, mobility: "limited" })] });
  assert.ok(personalFit(p, limited).factor < personalFit(p, active).factor);
  assert.equal(scoreRegions(active).find((r) => r.region.id === "NT")!.excluded.length, 0);
});

test("AI 동행 0점은 실제 입장 불가로 처리하지 않는다", () => {
  const p = PLACES_V1.find((x) => x.id === "nt-beach")!;
  const before = PLACE_FIT[p.id];
  try {
    PLACE_FIT[p.id] = [1, 0, 0, 0, 0, 0, 0, 0, 0];
    const q = query({ endDate: "2027-05-20", members: [member("배우자", { relationship: "spouse" })] });
    const nt = scoreRegions(q).find((r) => r.region.id === "NT")!;
    assert.ok(nt.top.some((t) => t.place.id === p.id));
    assert.equal(nt.excluded.length, 0);
  } finally {
    if (before) PLACE_FIT[p.id] = before;
    else delete PLACE_FIT[p.id];
  }
});

test("식당·카페를 하루 관광 장소 수에 섞어 채우지 않는다", () => {
  const results = scoreRegions(query({ interests: ["휴양", "액티비티", "미식"] }));
  assert.ok(results.flatMap((r) => r.top).every((t) => !isMealPlace(t.place)));
});
