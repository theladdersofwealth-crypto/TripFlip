import assert from "node:assert/strict";
import test from "node:test";
import { relaxedNotice, setLiveSummary } from "../src/lib/livePrices";
// @ts-expect-error 수집 Worker의 순수 JS 모듈
import { discoverRegion, pickHotels } from "../workers/collector/src/discover.js";

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

test("기준을 낮춘 권역은 앱이 안내 문구를 보여준다", () => {
  setLiveSummary({ v: 2, updatedAt: "2026-11-12T00:00:00Z", windowDays: 14, days: { flight: 1, hotel: 1 }, counts: { flightSnapshots: 1, hotelBatches: 1 }, flights: {}, hotels: {}, relaxed: ["jap-fukuoka"], relaxedRule: "4.0점·후기 100개 이상" });
  assert.match(relaxedNotice("jap-fukuoka")!, /4\.0점·후기 100개 이상/);
  assert.equal(relaxedNotice("jap-tokyo"), null);
  setLiveSummary(null);
});
