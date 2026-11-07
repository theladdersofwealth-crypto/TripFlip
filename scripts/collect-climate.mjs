// 전 세계 권역(scripts/world-regions.json)의 월별 평년 날씨를 NASA POWER 일별 자료(최근 10년)로 계산한다.
// NASA 지구과학 자료는 공개·무료. 격자(0.5°) 재분석값이라 관측소 평년값과 다를 수 있다.
// 강수일 = 하루 1mm 이상. 일조시간은 POWER에 없어 '맑은 하늘 대비 일사량 비율'로 추정한다(sunHoursEst).
import { readFile, writeFile, mkdir } from "node:fs/promises";

const OUT = process.argv[2] ?? "store/climate";
const UA = "TripFlip/0.1 (https://github.com/ohysky/TripFlip)";
const START = 2015, END = 2024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 위도·월별 낮 길이(시간), 매월 15일 기준
function dayLength(lat, month) {
  const doy = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][month - 1];
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (doy - 81));
  const x = -Math.tan((lat * Math.PI) / 180) * Math.tan((decl * Math.PI) / 180);
  return (24 / Math.PI) * Math.acos(Math.max(-1, Math.min(1, x)));
}

async function fetchDaily(lat, lon) {
  const u = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,PRECTOTCORR,ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN&community=RE&latitude=${lat}&longitude=${lon}&start=${START}0101&end=${END}1231&format=JSON`;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    if (r.ok) return (await r.json()).properties.parameter;
    console.log("retry", r.status);
    await sleep(10000);
  }
  throw new Error("power failed");
}

function monthly(p, lat) {
  const years = END - START + 1;
  const acc = Array.from({ length: 13 }, () => ({ t: [], rain: 0, all: [], clr: [] }));
  for (const [k, tmax] of Object.entries(p.T2M_MAX)) {
    const m = +k.slice(4, 6);
    const a = acc[m];
    if (tmax > -900) a.t.push(tmax);
    const pr = p.PRECTOTCORR[k];
    if (pr > -900 && pr >= 1) a.rain++;
    const al = p.ALLSKY_SFC_SW_DWN[k], cl = p.CLRSKY_SFC_SW_DWN[k];
    if (al > -900 && cl > 0) { a.all.push(al); a.clr.push(cl); }
  }
  const out = {};
  for (let m = 1; m <= 12; m++) {
    const a = acc[m];
    const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const ratio = a.all.length ? avg(a.all) / avg(a.clr) : null;
    const days = new Date(2026, m, 0).getDate();
    // 맑은 하늘 대비 비율 0.3 → 일조 0, 1.0 → 낮 시간 전부로 선형 추정
    const sun = ratio === null ? null : Math.round(Math.max(0, Math.min(1, (ratio - 0.3) / 0.7)) * dayLength(lat, m) * days);
    out[m] = { tmax: +avg(a.t).toFixed(1), rainDays: +(a.rain / years).toFixed(1), sunHoursEst: sun, skyRatio: ratio && +ratio.toFixed(2) };
  }
  return out;
}

const regions = JSON.parse(await readFile(new URL("./world-regions.json", import.meta.url), "utf8"));
const geo = JSON.parse(await readFile(new URL("./region-centers.json", import.meta.url), "utf8"));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const result = {};
for (const reg of regions) {
  if (only && !only.has(reg.id)) continue;
  const c = geo[reg.id];
  if (!c) continue;
  try {
    result[reg.id] = monthly(await fetchDaily(c.lat.toFixed(3), c.lon.toFixed(3)), c.lat);
    console.log(reg.id, JSON.stringify(result[reg.id][1]), JSON.stringify(result[reg.id][7]));
  } catch (e) {
    console.log(reg.id, "error", String(e));
  }
  await sleep(2000);
}
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/climate-${START}-${END}.json`, JSON.stringify({ source: `NASA POWER daily ${START}–${END} (MERRA-2/CERES), 강수일 ≥1mm, 일조는 추정`, collectedAt: new Date().toISOString(), regions: result }));
console.log("saved", Object.keys(result).length);
