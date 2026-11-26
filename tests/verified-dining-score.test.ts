import assert from "node:assert/strict";
import test from "node:test";
import { ALL_PLACES, scoreRegions, withConcepts, type RegionQuery } from "../src/services/regionScore";
import type { PlaceV1 } from "../src/data/regionsV1";
import { DINING_SCORE, scoreVerifiedDining } from "../src/services/diningScore";

const query: RegionQuery = {
  startDate: "2027-05-10", endDate: "2027-05-15",
  adults: 2, children: [], elders: false, pet: false,
  main: "미식", subs: [], interests: ["미식"],
  perDay: 2, price: "상관없음", stay: "가심비",
};
const paris = "fra-paris";
const parisResult = (input: RegionQuery) => scoreRegions(input).find((row) => row.region.id === paris)!;

test("검증 식당이 많은 권역은 미식 단독에서도 순위에 들어가며 확인 중은 점수에서 제외된다", (t) => {
  const region = "chi-harbin";
  const locations = ALL_PLACES.map((place, index) => ({ place, index }))
    .filter(({ place }) => place.region === region && place.dining?.mapRecord?.status === "confirmed");
  t.after(() => locations.forEach(({ place, index }) => { ALL_PLACES[index] = place; }));
  const result = () => scoreRegions(query).find((row) => row.region.id === region)!;
  const full = result();
  assert.ok(locations.length > 15);
  assert.equal(full.status, "ranked");
  assert.equal(full.diningFit?.verifiedCount, locations.length);
  assert.equal(full.diningFit?.components.count, 2.5);
  assert.ok(full.diningFit!.score! <= 5);
  assert.equal(full.diningFit?.share, 1);
  const leaveVerified = (count: number) => {
    locations.forEach(({ place, index }, i) => {
      ALL_PLACES[index] = i < count ? place : {
        ...place, dining: { ...place.dining!, mapRecord: { ...place.dining!.mapRecord!, status: "pending" } },
      };
    });
    return result();
  };
  const six = leaveVerified(6);
  assert.equal(six.status, "ranked");
  assert.equal(six.diningFit?.verifiedCount, 6);
  assert.equal(six.diningFit?.components.count, 1);
  assert.ok(full.score > six.score);
  const unknown = leaveVerified(0);
  assert.equal(unknown.status, "조건 충족 장소 없음");
  assert.equal(unknown.diningFit?.score, null);
  assert.equal(unknown.diningFit?.verifiedCount, null);
  assert.ok(unknown.diningFit!.pendingCount >= locations.length);
  assert.match(unknown.reasons[0], /미확인/);
  assert.deepEqual(full.sightseeing, unknown.sightseeing);
});

test("기존 가이드만 있는 권역은 검증 식당 자료 없음으로 처리한다", () => {
  const row = scoreRegions({ ...query, interests: ["관광", "미식"] }).find((r) => r.region.id === "NT")!;
  assert.ok(row.readiness.meals > 0);
  assert.equal(row.diningFit?.verifiedCount, null);
  assert.equal(row.diningFit?.score, null);
  assert.equal(row.diningFit?.share, 0);
  assert.equal(row.status, "ranked");
  assert.match(row.reasons[0], /미확인/);
});

test("미식을 선택하지 않으면 검증 정보 유무가 전체 추천 결과를 바꾸지 않는다", (t) => {
  const input: RegionQuery = { ...query, main: "관광", interests: ["관광"] };
  const before = scoreRegions(input);
  const locations = ALL_PLACES.map((place, index) => ({ place, index }))
    .filter(({ place }) => place.dining?.mapRecord?.status === "confirmed");
  t.after(() => locations.forEach(({ place, index }) => { ALL_PLACES[index] = place; }));
  locations.forEach(({ place, index }) => {
    ALL_PLACES[index] = { ...place, dining: { ...place.dining!, mapRecord: undefined } };
  });
  assert.ok(before.every((row) => !("diningFit" in row)));
  const summary = (rows: ReturnType<typeof scoreRegions>) => rows.map(({ top, ...rest }) => ({
    ...rest,
    top: top.map(({ place, ...scored }) => ({ ...scored, id: place.id })),
  }));
  assert.deepEqual(summary(scoreRegions(input)), summary(before));
});

test("미식이 두 번째 취향이면 기존 취향 가중치를 적용한다", () => {
  const row = parisResult({ ...query, interests: ["관광", "미식"] });
  assert.equal(row.diningFit?.verifiedCount, 11);
  assert.equal(row.diningFit?.weight, 0.8);
  assert.equal(row.diningFit?.share, DINING_SCORE.share);
});

test("미식 볼거리 0곳인 파리·상하이도 확인됨 식당으로 추천한다", () => {
  const rows = scoreRegions(query);
  for (const id of ["fra-paris", "chi-shanghai"]) {
    const row = rows.find((r) => r.region.id === id)!;
    assert.equal(row.status, "ranked");
    assert.equal(row.top.length, 0, "식당을 관광 슬롯으로 속여 넣지 않는다");
    assert.equal(row.filled, 0);
    assert.equal(row.diningFit?.share, 1);
    assert.ok(row.diningFit!.verifiedCount! >= 6);
    assert.ok(row.score > 0);
    assert.ok(!row.reasons.some((reason) => reason.includes("미식에 맞는 곳은 아직 부족")));
  }
});

test("미식 자료가 없는 권역은 기존 볼거리 점수로 평가하고 별도 감점을 붙이지 않는다", () => {
  const row = scoreRegions(query).find((r) => r.region.id === "gre-athens")!;
  assert.equal(row.status, "ranked");
  assert.equal(row.diningFit?.score, null);
  assert.equal(row.diningFit?.share, 0);
  assert.equal(row.top.length, 1);
  const expected = (row.top[0].score + row.weather.adj) * (1 - Math.min(0.5, row.flightHours! * 2 / (6 * 24)));
  // 이 권역·고정 입력은 기존 정적 가격/날씨 자료 미확인 감점이 없다.
  assert.ok(Math.abs(row.score - expected) < 1e-10);
});

test("미식 점수 구성: 수량 상한, 음식 종류·대표 메뉴 중복, 가격 분포, 확인 중 제외", () => {
  const make = (i: number, status: "confirmed" | "pending" = "confirmed", diverse = true): PlaceV1 => ({
    id: `dining-score-fixture-${i}`, region: "HK", name: `Fixture ${i}`, en: `Fixture ${i}`,
    concepts: ["미식"], tags: ["로컬푸드"], travel: "미확인", penalty: 0, grade: null,
    dining: { kind: "restaurant", styles: [], cuisine: diverse ? `Cuisine ${i % 6}` : "Cuisine 0",
      address: null, source: "fixture", sourceUrl: null, checkedAt: "2026-11-27", license: null, website: null,
      mapRecord: { status, nameLocal: `Fixture ${i}`, nameEn: `Fixture ${i}`, nameKo: null, area: null,
        signature: [diverse ? `Dish ${i % 8}` : "Dish 0"], priceLevel: diverse ? ["저", "중", "고"][i % 3] : "저", confidence: null } },
  });
  const full = Array.from({ length: 24 }, (_, i) => make(i));
  const rich = scoreVerifiedDining(full, 6);
  assert.equal(rich.components.count, 2.5);
  assert.equal(rich.cuisineCount, 6);
  assert.equal(rich.signatureCount, 8);
  assert.deepEqual(rich.priceCounts, [8, 8, 8]);
  assert.ok(Math.abs(rich.score! - 5) < 1e-10);
  const same = scoreVerifiedDining(full.map((_, i) => make(i, "confirmed", false)), 6);
  assert.equal(same.components.price, 0);
  assert.ok(rich.score! > same.score!);
  const few = scoreVerifiedDining(full.slice(0, 6), 6);
  assert.equal(few.components.count, 1);
  assert.ok(rich.score! > few.score!);
  const pending = scoreVerifiedDining([...full, make(99, "pending"), full[0]], 6);
  assert.equal(pending.score, rich.score);
  assert.equal(pending.verifiedCount, 24);
  assert.equal(pending.pendingCount, 1);
  assert.equal(scoreVerifiedDining([make(1), make(2)], 6).score, null);
  assert.equal(scoreVerifiedDining([make(1, "pending")], 6).score, null);
});


test("복합 야경·핫플 태그는 실제 미식 장소에만 미식을 자동 부여한다", () => {
  const fixture = (name: string, en: string, tags: string[], concepts: PlaceV1["concepts"] = ["관광"]): PlaceV1 =>
    ({ id: "fixture", region: "HK", name, en, tags, concepts, travel: "미확인", penalty: 0, grade: "A" });
  for (const p of [
    fixture("전망대", "Observation Deck", ["야경·야시장"]),
    fixture("고층 빌딩", "Sky Tower", ["핫플"]),
    fixture("야경 산책로", "Night View", ["야경·야시장", "핫플"]),
  ]) {
    assert.ok(!withConcepts(p).concepts.includes("미식"));
    assert.ok(withConcepts(p).concepts.includes("쇼핑"), "미식 이외 컨셉 보강은 유지");
  }
  for (const p of [
    fixture("스린 야시장", "Shilin", ["야경·야시장"]),
    fixture("리치먼드 나이트 마켓", "Richmond Night Market", ["야경·야시장"]),
    fixture("음식 시장", "Market", ["시장"]),
    fixture("현지 식당", "Local Restaurant", ["핫플"]),
    fixture("카페", "Cafe", ["카페·디저트"]),
    fixture("명시 미식", "Food District", ["핫플"], ["관광", "미식"]),
  ]) assert.ok(withConcepts(p).concepts.includes("미식"));
  assert.ok(!ALL_PLACES.find((p) => p.id === "hk-peak")!.concepts.includes("미식"));
  assert.ok(ALL_PLACES.find((p) => p.id === "nt-nightmarket")!.concepts.includes("미식"));
  const hk = scoreRegions(query).find((r) => r.region.id === "HK")!;
  assert.ok(!hk.top.some(({ place }) => place.id === "hk-peak"));
});


test("복원된 미식 점수와 PR #78 희망 지역 필터가 함께 동작한다", () => {
  const input: RegionQuery = { ...query, maxFlightHours: 8 };
  const all = scoreRegions(input);
  const selected = scoreRegions({ ...input, preferredAreas: ["western-europe"] });
  const paris = selected.find((r) => r.region.id === "fra-paris")!;
  assert.ok(paris);
  assert.equal(paris.status, "ranked");
  assert.equal(paris.diningFit?.share, 1);
  assert.equal(paris.overFlight, true);
  assert.match(paris.reasons[0], /선택 지역 안에서는 점수순/);
  assert.ok(!selected.some((r) => r.region.id === "chi-shanghai"));
  assert.equal(paris.score, all.find((r) => r.region.id === paris.region.id)!.score);
  const ranked = selected.filter((r) => r.status === "ranked");
  assert.ok(ranked.every((r, i) => i === 0 || ranked[i - 1].score >= r.score));
  assert.deepEqual(scoreRegions({ ...input, preferredAreas: [] }), all);
});
