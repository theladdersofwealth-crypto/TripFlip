// data 브랜치 prices/region-prices-날짜.json → src/data/worldPrices.ts
// + data 브랜치 flight-prices/날짜_시.json (인천발 왕복 최저가)
// 실행: node scripts/build-world-prices.mjs /tmp/prices.json /tmp/flights.json
import { readFile, writeFile } from "node:fs/promises";

const src = JSON.parse(await readFile(process.argv[2], "utf8"));
// 세계은행에 없는 미국령은 미국 물가로 대체한다. 대만은 대체값이 없어 미확인.
const SUBSTITUTE = { "괌(미국령)": "미국", "북마리아나(사이판)": "미국" };
const level = {};
for (const [ko, c] of Object.entries(src.countries)) {
  const v = c.priceLevel ?? src.countries[SUBSTITUTE[ko]]?.priceLevel ?? null;
  if (v != null) level[ko] = v;
}
const measured = {};
for (const [id, r] of Object.entries(src.regions)) if (r.medianUsd != null && level[r.country] != null) measured[id] = r.medianUsd;
// 숙소가를 못 구한 권역은 추정: 같은 나라 실측 평균, 없으면 나라 물가 수준 × k (실측 권역으로 맞춘 비례식).
// 실측이 추정의 3배를 넘으면 다른 동네 ID를 잡은 것으로 보고 추정으로 바꾼다.
const ids = Object.keys(measured);
const k = ids.reduce((s, id) => s + measured[id] * level[src.regions[id].country], 0) / ids.reduce((s, id) => s + level[src.regions[id].country] ** 2, 0);
for (const id of ids) if (measured[id] > 3 * k * level[src.regions[id].country]) delete measured[id];
const byCountry = {};
for (const id of Object.keys(measured)) (byCountry[src.regions[id].country] ??= []).push(measured[id]);
const hotel = {};
const estimated = [];
for (const [id, r] of Object.entries(src.regions)) {
  if (measured[id] != null) hotel[id] = measured[id];
  else if (level[r.country] != null) {
    const same = byCountry[r.country];
    hotel[id] = Math.round(same ? same.reduce((a, b) => a + b, 0) / same.length : k * level[r.country]);
    estimated.push(id);
  }
}

// 항공권: 권역 공항 → 여행사 도시 코드. 공항이 여럿인 도시는 도시 코드로 묶여 온다.
const CITY = { hnd: "TYO", nrt: "TYO", kix: "OSA", cxr: "NHA", pvg: "SHA", pek: "BJS", jfk: "NYC", cdg: "PAR", fco: "ROM", lhr: "LON", cgk: "JKT", mxp: "MIL", yyz: "YTO", yul: "YMQ", sai: "REP", kti: "PNH", cts: "SPK", mfm: "MFM" };
const flights = JSON.parse(await readFile(process.argv[3], "utf8"));
const byDest = {};
for (const [month, rows] of Object.entries(flights.world.months))
  for (const [dest, , , price] of rows) {
    const d = (byDest[dest] ??= {});
    d[month] = Math.min(d[month] ?? Infinity, price);
  }
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const worldTs = await readFile(new URL("../src/data/worldV1.ts", import.meta.url), "utf8");
const regionMeta = [...worldTs.matchAll(/\{"id":"([^"]+)","name":"[^"]*","country":"[^"]*","tier":"[^"]*","lat":([-\d.]+),"lon":([-\d.]+),"airportCode":"([a-z]+)"/g)].map((m) => ({ id: m[1], lat: +m[2], lon: +m[3], code: m[4] }));
const km = (a, b, c, d) => {
  const t = Math.PI / 180;
  const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
};
const ICN = [37.46, 126.44];
const flight = {};
const flightEstimated = [];
const known = [];
for (const r of regionMeta) {
  const months = byDest[CITY[r.code] ?? r.code.toUpperCase()];
  if (months) {
    // 달마다 최저가를 뽑고, 그 중간값을 "보통 이 정도면 간다"는 값으로 쓴다
    flight[r.id] = Math.round(median(Object.values(months)) / 1000) * 1000;
    known.push([km(...ICN, r.lat, r.lon), flight[r.id]]);
  }
}
// 노선 가격이 없는 권역은 인천에서의 거리로 추정 (실측 노선으로 맞춘 직선식)
const n = known.length, mx = known.reduce((s, [x]) => s + x, 0) / n, my = known.reduce((s, [, y]) => s + y, 0) / n;
const fb = known.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / known.reduce((s, [x]) => s + (x - mx) ** 2, 0);
const fa = my - fb * mx;
for (const r of regionMeta)
  if (flight[r.id] == null) {
    flight[r.id] = Math.round((fa + fb * km(...ICN, r.lat, r.lon)) / 1000) * 1000;
    flightEstimated.push(r.id);
  }

const out = `// 생성 파일: scripts/build-world-prices.mjs 로 만든다. 손으로 고치지 말 것.
// 수집 ${src.collectedAt.slice(0, 10)}. 숙소 = ${src.source.hotels} (총점 ${src.filter.minRating}↑·리뷰 ${src.filter.minReviews}↑ 통과 5곳 이상만)
// 실측 못 한 권역은 추정값(HOTEL_ESTIMATED). 나라 물가 수준(미국=1) = ${src.source.country}. 괌·사이판은 미국 값으로 대체.

/** 1인 1일 식비 초안(USD, 미국 기준). 나라 물가 수준을 곱해 쓴다. 실측 전 임시값 */
export const FOOD_USD_US = 50;
export const COUNTRY_PRICE_LEVEL: Record<string, number> = ${JSON.stringify(level)};
/** 권역별 숙소 객실 1박 가격대 중간값(USD) */
export const HOTEL_MEDIAN_USD: Record<string, number> = ${JSON.stringify(hotel)};
/** 실측 대신 추정(같은 나라 평균 또는 물가 수준 × ${k.toFixed(0)})한 권역 */
export const HOTEL_ESTIMATED = new Set<string>(${JSON.stringify(estimated)});

/** 원/달러 (세계은행 ${src.krwPerUsd?.year} 연평균) */
export const KRW_PER_USD = ${src.krwPerUsd?.v};
/** 인천발 1인 왕복 항공권(원): ${flights.source} ${flights.collectedAt.slice(0, 10)} 수집, 달별 최저가의 중간값 */
export const FLIGHT_KRW: Record<string, number> = ${JSON.stringify(flight)};
/** 노선 가격이 없어 인천에서의 거리로 추정한 권역 (원 = ${Math.round(fa)} + ${fb.toFixed(1)} × km) */
export const FLIGHT_ESTIMATED = new Set<string>(${JSON.stringify(flightEstimated)});
`;
await writeFile(new URL("../src/data/worldPrices.ts", import.meta.url), out);
console.log(`나라 ${Object.keys(level).length}, 권역 숙소 실측 ${Object.keys(hotel).length - estimated.length} + 추정 ${estimated.length}, k=${k.toFixed(0)} / 항공 실측 ${known.length} + 추정 ${flightEstimated.length}, 환율 ${src.krwPerUsd?.v}`);
