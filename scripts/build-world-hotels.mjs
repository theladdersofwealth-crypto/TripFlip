// data 브랜치 prices/region-prices-날짜.json 의 숙소 목록 → src/data/worldHotels.ts (추천 숙소)
// 시범 5개 권역은 매일 모으는 data 브랜치 hotels/날짜.json 을 쓴다 (트립어드바이저 ID를 위키데이터에서 못 찾는 곳이 있어서).
// 실행: node scripts/build-world-hotels.mjs /tmp/prices.json /tmp/pilot-hotels.json
import { readFile, writeFile } from "node:fs/promises";

const src = JSON.parse(await readFile(process.argv[2], "utf8"));
const out = {};
for (const [id, r] of Object.entries(src.regions)) {
  if (!r.hotels?.length) continue;
  // [이름, 평점, 리뷰 수, 최저가 USD, 최고가 USD]
  out[id] = r.hotels.map(([name, rating, reviews, lo, hi]) => [name, rating, reviews, Math.round(lo), Math.round(hi)]);
}
const PILOT = { NT: "vie-nhatrang", HK: "hon-hongkong", OS: "jap-osaka", DN: "vie-danang", PQ: "vie-phuquoc" };
if (process.argv[3]) {
  const pilot = JSON.parse(await readFile(process.argv[3], "utf8"));
  const f = Object.fromEntries(pilot.fields.map((k, i) => [k, i]));
  for (const [k, id] of Object.entries(PILOT)) {
    const rows = (pilot.regions[k]?.hotels ?? []).filter((h) => h[f.price_min] > 0 && h[f.price_max] > 0);
    if (rows.length) out[id] = rows.slice(0, 60).map((h) => [h[f.name], h[f.rating], h[f.reviews], Math.round(h[f.price_min]), Math.round(h[f.price_max])]);
  }
}
await writeFile(
  new URL("../src/data/worldHotels.ts", import.meta.url),
  `// 생성 파일: scripts/build-world-hotels.mjs 로 만든다. 손으로 고치지 말 것.
// 수집 ${src.collectedAt.slice(0, 10)}, ${src.source.hotels}. 총점 ${src.filter.minRating}↑·리뷰 ${src.filter.minReviews}↑ 통과 숙소만. 가격은 1박 객실 USD 가격대.
export type HotelRow = [name: string, rating: number, reviews: number, lo: number, hi: number];
export const HOTELS: Record<string, HotelRow[]> = ${JSON.stringify(out)};
`,
);
console.log(`권역 ${Object.keys(out).length}, 숙소 ${Object.values(out).flat().length}`);
