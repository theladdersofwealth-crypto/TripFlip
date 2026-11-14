import assert from "node:assert/strict";
import test from "node:test";
import { relaxedNotice, setLiveSummary } from "../src/lib/livePrices";
// @ts-expect-error 수집 Worker의 순수 JS 모듈
import { discoverBySearch, discoverRegion, pickHotels } from "../workers/collector/src/discover.js";

const h = (key: string, rating: number, count: number, lat = 12.2, lon = 109.2) => ({ key, name: key, review_summary: { rating, count }, price_ranges: { minimum: 50, maximum: 90 }, geo: { latitude: lat, longitude: lon } });

test("엄격 기준(4.5·300)으로 5곳 이상이면 그대로, 모자라면 4.0·100으로 낮추고 표시한다", () => {
  const strict = pickHotels([...Array(6)].map((_, i) => h(`s${i}`, 4.6, 400 + i)));
  assert.equal(strict.relaxed, false);
  assert.equal(strict.hotels.length, 6);
  const loose = pickHotels([h("a", 4.6, 400), ...[...Array(5)].map((_, i) => h(`l${i}`, 4.1, 150 + i))]);
  assert.equal(loose.relaxed, true);
  assert.equal(loose.hotels.length, 6);
  const none = pickHotels([h("a", 3.5, 900), h("b", 4.1, 20)]);
  assert.equal(none.relaxed, null);
  assert.equal(none.hotels.length, 0);
});

test("번호가 있으면 Xotelo 목록만 읽고, 멀리 떨어진 도시 번호는 거른다", async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    const far = String(url).includes("g999");
    const list = [...Array(7)].map((_, i) => h(`k${i}`, 4.2, 200 + i, far ? 40 : 12.2, far ? 100 : 109.2));
    return new Response(JSON.stringify({ result: { list } }), { status: 200 });
  }) as typeof fetch;
  try {
    const ok = await discoverRegion({ id: "x", lat: 12.2, lon: 109.2, ta: "g111" }, { left: 20 });
    assert.equal(ok.ok, true);
    assert.equal(ok.relaxed, true);
    assert.equal(calls.length, 1, "7곳 < 100이라 1쪽만 읽는다");
    const bad = await discoverRegion({ id: "y", lat: 12.2, lon: 109.2, ta: "g999" }, { left: 20 });
    assert.equal(bad.ok, undefined);
    assert.match(bad.error, /맞는 트립어드바이저/);
    const noBudget = await discoverRegion({ id: "z", lat: 12.2, lon: 109.2, ta: "g111" }, { left: 1 });
    assert.equal(noBudget.retry, true, "요청 한도가 모자라면 다음 회차로 미룬다");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("목록에 가격대가 없어도 통과하고, 번호는 힌트에서 가져오며, 1쪽이 100곳이면 3쪽까지 읽는다", async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    const list = [...Array(100)].map((_, i) => ({ key: `k${calls.length}-${i}`, name: "n", review_summary: { rating: 4.6, count: 500 }, geo: { latitude: 12.2, longitude: 109.2 } }));
    return new Response(JSON.stringify({ result: { list } }), { status: 200 });
  }) as typeof fetch;
  try {
    const r = await discoverRegion({ id: "h", lat: 12.2, lon: 109.2 }, { left: 20 }, { h: ["g123"] });
    assert.equal(r.ok, true);
    assert.equal(r.relaxed, false);
    assert.equal(r.ta, "g123");
    assert.equal(calls.length, 3);
    assert.equal(r.hotels.length, 20);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("기준을 낮춘 권역은 앱이 안내 문구를 보여준다", () => {
  setLiveSummary({ v: 2, updatedAt: "2026-11-12T00:00:00Z", windowDays: 14, days: { flight: 1, hotel: 1 }, counts: { flightSnapshots: 1, hotelBatches: 1 }, flights: {}, hotels: {}, relaxed: ["jap-fukuoka"], relaxedRule: "4.0점·후기 100개 이상" });
  assert.match(relaxedNotice("jap-fukuoka")!, /4\.0점·후기 100개 이상/);
  assert.equal(relaxedNotice("jap-tokyo"), null);
  setLiveSummary(null);
});

test("영문 이름 검색으로 도시 번호 후보를 얻어 거리 확인 후 통과시킨다", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes("/api/search")) return new Response(JSON.stringify({ result: { list: [{ key: "g555-d1" }, { key: "g555-d2" }, { key: "g777-d3" }] } }), { status: 200 });
    const far = u.includes("g555");
    const list = [...Array(8)].map((_, i) => h(`k${i}`, 4.6, 500, far ? 40 : 12.2, far ? 100 : 109.2));
    return new Response(JSON.stringify({ result: { list } }), { status: 200 });
  }) as typeof fetch;
  try {
    const r = await discoverBySearch({ id: "s", lat: 12.2, lon: 109.2 }, ["Somewhere"], { left: 30 }, []);
    assert.equal(r.ok, true);
    assert.equal(r.ta, "g777", "가장 많이 나온 g555는 멀어서 거르고 g777을 쓴다");
    assert.equal(r.via, "search");
    const none = await discoverBySearch({ id: "s", lat: 12.2, lon: 109.2 }, ["Somewhere"], { left: 30 }, ["g555", "g777"]);
    assert.match(none.error!, /검색 후보 없음|번호 없음/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
