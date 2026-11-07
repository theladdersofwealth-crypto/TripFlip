// 시범 5개 권역 숙소의 날짜별 실제 1박 가격을 하루 한 번 모은다 (Xotelo /api/rates, 무료·키 없음).
// 숙소 목록(/api/list)은 2026-11-04부터 Xotelo 쪽 고장이라, 이전에 정상 수집한 hotels/날짜.json 의 숙소를 그대로 쓴다.
// 실행: node scripts/collect-hotel-rates.mjs <hotels 폴더> <저장 폴더>
//
// 저장 규칙(collect-hotel-prices.mjs 와 같음):
// - 전부 정상 → 저장폴더/날짜.json (status complete)
// - 일부 실패 → 같은 자리(status partial). 같은 날 complete 파일이 있으면 _errors/ 로.
// - 전부 실패 → _errors/날짜.json 에만
// - complete 가 아니면 종료 코드 1 (Actions 실패 표시)
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const HOTELS_DIR = process.argv[2] ?? "store/hotels";
const OUT_DIR = process.argv[3] ?? "store/hotel-rates";
const AHEAD_DAYS = [14, 30, 60]; // 체크인 = 오늘 + N일, 1박
const GAP_MS = 1000; // 상대 서버 부담을 줄이려고 요청 사이 1초
const RETRIES = 3;
// 이 비율 이상 실패하면 그 지역은 실패로 본다(가격 없는 숙소·날짜는 원래 일부 있음)
const REGION_FAIL_RATIO = 0.5;

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/** 정상 수집된 숙소 목록 파일을 모두 합친다(나중 파일이 우선) */
async function loadHotels() {
  const files = (await readdir(HOTELS_DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const regions = {};
  for (const f of files) {
    const j = JSON.parse(await readFile(`${HOTELS_DIR}/${f}`, "utf8"));
    if (j.status && j.status !== "complete" && j.status !== "partial") continue;
    for (const [id, r] of Object.entries(j.regions ?? {})) {
      if (!r.hotels?.length) continue;
      regions[id] ??= { name: r.name, hotels: new Map(), from: [] };
      for (const h of r.hotels) regions[id].hotels.set(h[0], { key: h[0], name: h[1] });
      regions[id].from.push(f);
    }
  }
  return regions;
}

async function rates(key, chkIn, chkOut) {
  const url = `https://data.xotelo.com/api/rates?hotel_key=${key}&chk_in=${chkIn}&chk_out=${chkOut}&currency=USD`;
  let last;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* 차단 페이지 등 */ }
      if (res.ok && body && !body.error) return { ok: true, rates: body.result?.rates ?? [] };
      last = { http: res.status, error: body?.error ?? null, snippet: text.slice(0, 200) };
      if (!(res.status === 429 || res.status >= 500)) break; // 일시 오류만 재시도
    } catch (e) {
      last = { network: String(e?.cause?.code ?? e?.message ?? e) };
    }
    await sleep(5000 * (i + 1));
  }
  return { ok: false, ...last };
}

const regions = await loadHotels();
if (!Object.keys(regions).length) {
  console.error("정상 숙소 목록 파일이 없어요");
  process.exit(1);
}
const now = new Date();
const date = now.toISOString().slice(0, 10);
const stays = AHEAD_DAYS.map((n) => ({ chkIn: day(n), chkOut: day(n + 1) }));
const result = {
  collectedAt: now.toISOString(),
  source: "Xotelo /api/rates (TripAdvisor 기반, 비공식). 숙소 목록은 이전 정상 수집분 재사용",
  currency: "USD",
  priceUnit: "1박 객실(세금 미포함일 수 있음)",
  stays,
  fields: ["key", "chk_in", "min_rate", "min_provider", "rates"],
  status: "complete",
  failedRegions: [],
  regions: {},
};

for (const [id, r] of Object.entries(regions)) {
  const rows = [];
  let fail = 0;
  const errors = [];
  for (const h of r.hotels.values()) {
    for (const s of stays) {
      const out = await rates(h.key, s.chkIn, s.chkOut);
      if (!out.ok) { fail++; if (errors.length < 5) errors.push({ key: h.key, ...out }); }
      else {
        const list = out.rates.filter((x) => typeof x.rate === "number" && x.rate > 0);
        const min = list.reduce((a, b) => (a && a.rate <= b.rate ? a : b), null);
        // [공급사코드, 가격] 쌍만 남겨 용량을 줄인다
        rows.push([h.key, s.chkIn, min?.rate ?? null, min?.name ?? null, list.map((x) => [x.code, x.rate])]);
      }
      await sleep(GAP_MS);
    }
  }
  const total = r.hotels.size * stays.length;
  const failed = total === 0 || fail / total >= REGION_FAIL_RATIO;
  const priced = rows.filter((x) => x[2] != null).length;
  result.regions[id] = { name: r.name, hotels: r.hotels.size, requests: total, failedRequests: fail, priced, ok: !failed, listFrom: r.from.at(-1), rows, ...(errors.length ? { errors } : {}) };
  if (failed) result.failedRegions.push(id);
  console.log(`${failed ? "❌" : "✅"} ${r.name}: 숙소 ${r.hotels.size} × 날짜 ${stays.length} = ${total}건 · 실패 ${fail} · 가격 있음 ${priced}`);
  for (const e of errors) console.log(`   진단 ${e.key}: HTTP ${e.http ?? "-"} ${e.network ?? ""} ${JSON.stringify(e.error ?? "")} ${e.snippet?.slice(0, 120) ?? ""}`);
}

const n = Object.keys(result.regions).length;
const okCount = n - result.failedRegions.length;
result.status = okCount === n ? "complete" : okCount > 0 ? "partial" : "failed";

const readStatus = async (f) => { try { return JSON.parse(await readFile(f, "utf8")).status ?? "complete"; } catch { return null; } };
const mainFile = `${OUT_DIR}/${date}.json`;
const toErrors = result.status === "failed" || (result.status === "partial" && (await readStatus(mainFile)) === "complete");
const dir = toErrors ? `${OUT_DIR}/_errors` : OUT_DIR;
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/${date}.json`, JSON.stringify(result));
console.log(`상태 ${result.status} (${okCount}/${n} 지역) → 저장: ${dir}/${date}.json`);
if (result.status !== "complete") {
  console.error(`숙소 가격 수집 ${result.status === "failed" ? "실패" : "불완전"}: ${result.failedRegions.join(", ")}`);
  process.exitCode = 1;
}
