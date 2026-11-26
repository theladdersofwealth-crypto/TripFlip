import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
// 고정된 예제 날짜가 지나도 링크 회귀 테스트는 동일한 기준으로 실행한다.
beforeEach((t) => { t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-26T03:00:00Z") }); });
import { pickSamples, airlineName } from "../src/lib/flightSamples";
import { themeHighlights } from "../src/services/regionScore";
import { HOTEL_KO } from "../src/data/hotelKo";
import { hotelCandidates, STAY_TIERS } from "../src/services/booking";
import { ALL_REGIONS } from "../src/services/regionScore";
import type { PlaceV1 } from "../src/data/regionsV1";

test("항공 예시: 같은 출발월만, 내 날짜와 가까운 순, 최저가 따로", () => {
  const snap = {
    collectedAt: "2026-11-23T12:00:00Z",
    routes: { CXR: { months: { "2026-12": [
      ["CXR", "2026-12-10T21:50:00+09:00", "2026-12-14T13:45:00+07:00", 400000, "VJ", 0, 0, 600],
      ["CXR", "2026-12-02T10:00:00+09:00", "2026-12-05T10:00:00+07:00", 250000, "7C", 0, 0, 610],
      ["CXR", "2026-12-11T10:00:00+09:00", "2026-12-14T10:00:00+07:00", 380000, "ZZ", 1, 0, 800],
    ] } } },
    world: { months: { "2026-12": [["NHA", "2026-12-10T21:50:00+09:00", "2026-12-14T13:45:00+07:00", 400000, "VJ", 0, 0, 600], ["TYO", "2026-12-10T09:00:00+09:00", "2026-12-14T09:00:00+09:00", 100000, "KE", 0, 0, 300]] } },
  } as never;
  const r = pickSamples(snap, "vie-nhatrang", "2026-12-10", "2026-12-14");
  assert.equal(r.near[0].airline, "비엣젯항공");
  assert.equal(r.near[0].gap, 0);
  assert.equal(r.near[0].depart, "2026-12-10T21:50");
  assert.equal(r.near.length, 3); // 중복 제거, 다른 도시(TYO) 제외
  assert.equal(r.cheapest?.krw, 250000);
  assert.equal(airlineName("ZZ"), "항공사 코드 ZZ");
});

test("추천 이유: 테마별 대표 명소, 테마끼리 겹치지 않음", () => {
  const p = (id: string, concepts: PlaceV1["concepts"], grade: PlaceV1["grade"], penalty: 0 | 0.5 | 1 = 0) => ({ place: { id, name: id, concepts, grade, penalty } as PlaceV1, weight: 1, score: 1 });
  const h = themeHighlights(["관광", "쇼핑"], [p("섬", ["휴양"], "S"), p("성", ["관광"], "A"), p("시장", ["쇼핑", "관광"], "A"), p("먼곳", ["관광"], "A", 1), p("몰", ["쇼핑"], "B")], 1);
  assert.deepEqual(h.map((x) => [x.theme, x.names]), [["관광", ["성"]], ["쇼핑", ["시장"]]]);
});

test("추천 카드에 나오는 숙소는 모두 한글 표기가 있다", () => {
  const missing = ALL_REGIONS.flatMap((r) => STAY_TIERS.flatMap((t) => hotelCandidates(r.id, t))).filter((h) => !HOTEL_KO[h.name]);
  assert.deepEqual(missing, []);
});

test("낮 최고 5℃ 미만은 혹한기로 감점", async () => {
  const { judgeWeather } = await import("../src/services/regionScore");
  assert.equal(judgeWeather({ tmax: 3.2, rainDays: 4.7, sunHours: null } as never, 4).judge, "혹한기");
});

test("짧은 일정에선 장거리 여행지가 비행 부담만큼 내려간다", async () => {
  const { scoreRegions } = await import("../src/services/regionScore");
  const q = { startDate: "2027-04-10", endDate: "2027-04-16", adults: 1, children: [], elders: false, pet: false, main: "액티비티", subs: ["미식", "관광"], interests: ["액티비티", "미식", "관광"], perDay: 2, price: "상관없음", stay: "가심비" } as never;
  const top = scoreRegions(q).filter((r) => r.status === "ranked").slice(0, 3);
  assert.ok(top.every((r) => (r.flightHours ?? 0) < 10), top.map((r) => r.region.name).join(","));
});

test("부킹닷컴 링크에 숙소·날짜·인원이 들어간다", async () => {
  const { bookingComUrl } = await import("../src/services/booking");
  const { REGIONS_V1 } = await import("../src/data/regionsV1");
  const u = new URL(bookingComUrl(REGIONS_V1[0], { startDate: "2026-12-10", endDate: "2026-12-14", adults: 2, children: [], elders: false, pet: false, main: "휴양", subs: [], perDay: 2, price: "상관없음", stay: "가심비" } as never, "Regent Phu Quoc"));
  assert.equal(u.searchParams.get("ss"), "Regent Phu Quoc");
  assert.equal(u.searchParams.get("checkin"), "2026-12-10");
  assert.equal(u.searchParams.get("checkout"), "2026-12-14");
  assert.equal(u.searchParams.get("group_adults"), "2");
});

test("최근 수집가(숙소 키 포함)가 있으면 추천 숙소를 그 목록에서 경비 1박 값과 가깝게 고른다", async () => {
  const { setLiveSummary } = await import("../src/lib/livePrices");
  const { estimateTripCost } = await import("../src/services/regionScore");
  const { REGIONS_V1 } = await import("../src/data/regionsV1");
  const { HOTEL_NAMES } = await import("../src/data/hotelNames");
  const keys = Object.keys(HOTEL_NAMES).filter((k) => k.startsWith("g293928-")).slice(0, 10);
  setLiveSummary({ v: 2, updatedAt: "2026-11-23T00:00:00Z", windowDays: 14, days: { flight: 1, hotel: 1 }, counts: { flightSnapshots: 1, hotelBatches: 1 }, flights: {},
    hotels: { NT: keys.map((k, i) => [50 + i * 10, 3, k] as [number, number, string]) } });
  const picks = hotelCandidates("NT", "가심비");
  const q = { startDate: "2026-12-10", endDate: "2026-12-14", adults: 2, children: [], elders: false, pet: false, main: "휴양", subs: [], perDay: 2, price: "상관없음", stay: "가심비" } as never;
  const night = estimateTripCost(REGIONS_V1.find((r) => r.id === "NT")!, q).hotelNightUsd!;
  assert.equal(picks.length, 3);
  assert.ok(picks.every((p) => p.nightUsd != null && HOTEL_NAMES[p.key!] === p.name));
  assert.ok(Math.abs(picks[0].nightUsd! - night) <= 10, `${picks[0].nightUsd} vs ${night}`);
  setLiveSummary(null);
});

test("항공·숙소·날씨 추정 칸 하나당 10% 감점, 사유를 남긴다", async () => {
  const { scoreRegions } = await import("../src/services/regionScore");
  const { setLiveSummary } = await import("../src/lib/livePrices");
  setLiveSummary(null);
  const q = { startDate: "2027-04-10", endDate: "2027-04-16", adults: 2, children: [], elders: false, pet: false, main: "관광", subs: [], perDay: 2, price: "상관없음", stay: "가심비" } as never;
  const rs = scoreRegions(q).filter((r) => r.status === "ranked");
  const est = rs.find((r) => r.flags.some((f) => f.includes("추정값이라")));
  assert.ok(est, "추정 권역 사유 없음");
  const known = rs.find((r) => r.region.id === "OS");
  assert.ok(known && !known.flags.some((f) => f.includes("추정값이라")));
});
