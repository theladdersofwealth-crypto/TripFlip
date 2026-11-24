// 숙소 가격 자료가 없는 권역(새 194권역 등)의 1박 가격 추정 → src/data/hotelEstimates.ts
// 실행: node --import tsx scripts/build-hotel-estimates.ts <세계은행 PA.NUS.PPPC.RF CSV> <collector /summary JSON>
//  - 나라 물가 = World Bank WDI PA.NUS.PPPC.RF(가격수준비율, 미국=1, CC BY 4.0) 가장 최근 연도
//  - 보정 = 수집 서버(Xotelo) 실측 권역의 숙소 1박 최저가 중간값 ÷ 나라 물가, 그 중간값(k)
//  - 추정 = 같은 나라 실측 권역 평균, 없으면 k × 나라 물가. 나라 물가가 없으면 미확인으로 둔다.
import { readFileSync, writeFileSync } from "node:fs";
import { ALL_REGIONS, PILOT_TWIN_OF } from "../src/services/regionScore";
import { COUNTRY_PRICE_LEVEL, HOTEL_MEDIAN_USD } from "../src/data/worldPrices";
import { HOTELS } from "../src/data/worldHotels";

const ISO3: Record<string, string> = { 볼리비아: "BOL", 아르헨티나: "ARG", 페루: "PER", 네팔: "NPL", 노르웨이: "NOR", 몬테네그로: "MNE", 몰타: "MLT", 아이슬란드: "ISL", 알바니아: "ALB", 조지아: "GEO", 키프로스: "CYP", 폴란드: "POL", 모로코: "MAR", 요르단: "JOR", 탄자니아: "TZA", 브라질: "BRA", 에콰도르: "ECU", 칠레: "CHL", 콜롬비아: "COL", 쿠바: "CUB", 부탄: "BTN", 인도: "IND", 키르기스스탄: "KGZ", 뉴칼레도니아: "NCL", "프랑스령 폴리네시아": "PYF", 덴마크: "DNK", 루마니아: "ROU", 벨기에: "BEL", 북마케도니아: "MKD", 아일랜드: "IRL", 에스토니아: "EST", 세이셸: "SYC", 오만: "OMN", 케냐: "KEN", 과테말라: "GTM", 푸에르토리코: "PRI", 브루나이: "BRN", 바누아투: "VUT", "쿡 제도": "COK", 불가리아: "BGR", 세르비아: "SRB", 스웨덴: "SWE", 슬로바키아: "SVK", 아르메니아: "ARM", 나미비아: "NAM", 마다가스카르: "MDG", 카타르: "QAT", 대만: "TWN" };

const rows = readFileSync(process.argv[2], "utf8").replace(/^﻿/, "").split("\n").map((l) => l.match(/"([^"]*)"/g)?.map((s) => s.slice(1, -1)) ?? []);
const header = rows.find((r) => r[0] === "Country Name")!;
const wb: Record<string, [number, string]> = {};
for (const r of rows) for (let i = r.length - 1; i >= 4; i--) if (r[i]) { wb[r[1]] = [+r[i], header[i]]; break; }

const level: Record<string, number> = { ...COUNTRY_PRICE_LEVEL };
const added: Record<string, number> = {};
const years = new Set<string>();
for (const [ko, iso] of Object.entries(ISO3)) if (level[ko] == null && wb[iso]) { level[ko] = added[ko] = Math.round(wb[iso][0] * 1000) / 1000; years.add(wb[iso][1]); }

const summary = JSON.parse(readFileSync(process.argv[3], "utf8"));
const PILOT: Record<string, string> = { OS: "jap-osaka", NT: "vie-nhatrang", HK: "hon-hongkong", DN: "vie-danang", PQ: "vie-phuquoc" };
const country = new Map(ALL_REGIONS.map((r) => [PILOT_TWIN_OF[r.id] ?? r.id, r.country]));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const measured: Record<string, number> = {};
for (const [k, list] of Object.entries(summary.hotels as Record<string, [number][]>)) {
  const prices = list.map((x) => x[0]).filter((v) => v > 0);
  if (prices.length >= 5) measured[PILOT[k] ?? k] = median(prices);
}
const ratios = Object.entries(measured).filter(([id]) => level[country.get(id)!] != null).map(([id, v]) => v / level[country.get(id)!]);
const k = median(ratios);
const byCountry: Record<string, number[]> = {};
for (const [id, v] of Object.entries(measured)) (byCountry[country.get(id)!] ??= []).push(v);

const est: Record<string, number> = {};
const unknown: string[] = [];
for (const [id, c] of country) {
  if (HOTEL_MEDIAN_USD[id] != null || HOTELS[id]?.length || measured[id] != null) continue;
  const same = byCountry[c];
  if (same) est[id] = Math.round(same.reduce((a, b) => a + b, 0) / same.length);
  else if (level[c] != null) est[id] = Math.round(k * level[c]);
  else unknown.push(id);
}

writeFileSync(new URL("../src/data/hotelEstimates.ts", import.meta.url), `// 생성 파일: scripts/build-hotel-estimates.ts 로 만든다. 손으로 고치지 말 것.
// 숙소 가격 자료가 없는 권역의 1박 추정가(USD, 실측 아님). 실측 ${ratios.length}권역(Xotelo 수집 ${String(summary.updatedAt).slice(0, 10)})의 1박 최저가 중간값 ÷ 나라 물가의 중간값 k=${Math.round(k)}.
// 같은 나라에 실측 권역이 있으면 그 평균, 없으면 k × 나라 물가. 나라 물가 = World Bank WDI PA.NUS.PPPC.RF(미국=1, ${[...years].sort().join("·")}년, CC BY 4.0).
// 나라 물가가 없는 권역(${unknown.join(", ") || "없음"})은 미확인으로 둔다.

/** worldPrices.ts에 없던 나라의 물가 수준(미국=1) */
export const EXTRA_PRICE_LEVEL: Record<string, number> = ${JSON.stringify(added)};
/** 권역별 숙소 1박 추정가(USD) */
export const HOTEL_ESTIMATE_USD: Record<string, number> = ${JSON.stringify(est)};
`);
console.log({ k: Math.round(k), calib: ratios.length, estimated: Object.keys(est).length, unknown, addedCountries: Object.keys(added).length });
