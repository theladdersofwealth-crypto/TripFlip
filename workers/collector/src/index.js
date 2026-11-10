// TripFlip 가격 수집 Worker (Cloudflare 무료 플랜)
// - 항공권: Travelpayouts Data API, 하루 4회 → KV flight-prices/날짜_UTC시
// - 숙소: Xotelo /api/rates, 고정 목록(hotels.json) × 체크인 14/30/60일 뒤 → KV hotel-rates/날짜/part-NN
// - 위키 조회수: 매월 2일 5분마다 45건 → KV wiki-pageviews/YYYY-MM/part-NNN (권역 물가는 Xotelo 목록 고장으로 보류)
// - 평균가: 수집마다 agg/flight|hotel/날짜 에 더하고 최근 14일로 summary/latest 갱신 → GET /summary
// - 읽기: GET /list?prefix=..., GET /get?key=..., GET /hotel-rates?date=YYYY-MM-DD (조각 합본)
import HOTELS from "./hotels.json";
import WIKI from "./wiki-titles.json";
import { buildSummary, mergeFlightAgg, mergeHotelAgg, SUMMARY_DAYS } from "./summary.js";

const FIELDS = ["destination", "departure_at", "return_at", "price", "airline", "transfers", "return_transfers", "duration"];
const ORIGIN = "ICN";
const DESTS = { HKG: "홍콩", KIX: "오사카", DAD: "다낭", CXR: "나트랑", PQC: "푸꾸옥" };
const MONTHS_AHEAD = 6;
const AHEAD_DAYS = [14, 30, 60];
const BATCH = 40; // 묶음당 숙소 요청 수 (재시도 포함 외부 요청 50회 이하)
const START_MIN = 30; // 00:30 UTC(09:30 KST)부터
const TTL = 60 * 60 * 24 * 400; // 약 13개월 보관

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const ymd = (d) => d.toISOString().slice(0, 10);

// ---------- 항공권 ----------
function months(now) {
  const out = [];
  for (let i = 0; i < MONTHS_AHEAD; i++) out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
  return out;
}
async function fetchMonth(token, destination, month) {
  const p = new URLSearchParams({ origin: ORIGIN, ...(destination ? { destination } : {}), departure_at: month, currency: "krw", market: "kr", sorting: "price", one_way: "false", limit: "1000", token });
  try {
    const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${p}`, { signal: AbortSignal.timeout(20000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) return { error: `${res.status} ${body.error ?? ""}`.trim() };
    return { rows: (body.data ?? []).map((t) => FIELDS.map((f) => t[f] ?? null)) };
  } catch (e) {
    return { error: String(e?.message ?? e) };
  }
}
async function collectFlights(env, now) {
  if (!env.TRAVELPAYOUTS_TOKEN) throw new Error("TRAVELPAYOUTS_TOKEN 없음");
  const ms = months(now);
  const result = { collectedAt: now.toISOString(), source: "Travelpayouts Aviasales Data API (최근 48시간 검색 캐시)", origin: ORIGIN, currency: "KRW", fields: FIELDS, routes: {}, world: { months: {} } };
  for (const [code, name] of Object.entries(DESTS)) {
    const route = { name, months: {} };
    for (const m of ms) {
      const r = await fetchMonth(env.TRAVELPAYOUTS_TOKEN, code, m);
      route.months[m] = r.error ? { error: r.error } : r.rows;
    }
    result.routes[code] = route;
  }
  for (const m of ms) {
    const r = await fetchMonth(env.TRAVELPAYOUTS_TOKEN, null, m);
    result.world.months[m] = r.error ? { error: r.error } : r.rows;
  }
  const key = `flight-prices/${ymd(now)}_${String(now.getUTCHours()).padStart(2, "0")}`;
  await env.DATA.put(key, JSON.stringify(result), { expirationTtl: TTL });
  await addFlightAgg(env, now, result);
  await rebuildSummary(env, now);
  return key;
}

// ---------- 평균가 (앱이 읽는 값) ----------
// 수집할 때마다 날짜별 합계(agg/…/날짜)에 더하고, 최근 SUMMARY_DAYS일 합계로 summary/latest 를 다시 만든다.
// 큰 원본을 다시 읽지 않아 무료 플랜 CPU 한도 안에서 돈다.
const AGG_TTL = 60 * 60 * 24 * 60;
const HOTEL_NAMES = Object.fromEntries(Object.values(HOTELS.regions).flatMap((r) => r.hotels));
async function getJson(env, key) {
  const v = await env.DATA.get(key);
  return v ? JSON.parse(v) : null;
}
async function addFlightAgg(env, now, result) {
  const key = `agg/flight/${ymd(now)}`;
  await env.DATA.put(key, JSON.stringify(mergeFlightAgg(await getJson(env, key), result)), { expirationTtl: AGG_TTL });
}
async function addHotelAgg(env, now, rows) {
  const key = `agg/hotel/${ymd(now)}`;
  await env.DATA.put(key, JSON.stringify(mergeHotelAgg(await getJson(env, key), rows)), { expirationTtl: AGG_TTL });
}
async function rebuildSummary(env, now) {
  const fd = [], hd = [];
  for (let i = 0; i < SUMMARY_DAYS; i++) {
    const d = ymd(new Date(now.getTime() - i * 864e5));
    const [a, b] = await Promise.all([getJson(env, `agg/flight/${d}`), getJson(env, `agg/hotel/${d}`)]);
    if (a) fd.push(a);
    if (b) hd.push(b);
  }
  await env.DATA.put("summary/latest", JSON.stringify(buildSummary(fd, hd, now, HOTEL_NAMES)));
}

// ---------- 숙소 ----------
function hotelJobs(now) {
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const stays = AHEAD_DAYS.map((n) => ({ chkIn: ymd(new Date(base + n * 864e5)), chkOut: ymd(new Date(base + (n + 1) * 864e5)) }));
  const jobs = [];
  for (const [region, r] of Object.entries(HOTELS.regions)) for (const [key] of r.hotels) for (const s of stays) jobs.push({ region, key, ...s });
  return { stays, jobs };
}
async function rates(key, chkIn, chkOut, budget) {
  const url = `https://data.xotelo.com/api/rates?hotel_key=${key}&chk_in=${chkIn}&chk_out=${chkOut}&currency=USD`;
  let last;
  for (let i = 0; i < 2 && budget.left > 0; i++) {
    budget.left--;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}
      if (res.ok && body && !body.error) return { ok: true, rates: body.result?.rates ?? [] };
      last = { http: res.status, error: body?.error ?? null, snippet: text.slice(0, 160) };
      if (!(res.status === 429 || res.status >= 500)) break;
    } catch (e) {
      last = { network: String(e?.message ?? e) };
    }
    await sleep(3000);
  }
  return { ok: false, ...last };
}
async function collectHotelBatch(env, now, index, size = BATCH) {
  const { stays, jobs } = hotelJobs(now);
  const slice = jobs.slice(index * size, index * size + size);
  if (!slice.length) return null;
  const budget = { left: 48 };
  const rows = [];
  const errors = [];
  for (const j of slice) {
    const out = await rates(j.key, j.chkIn, j.chkOut, budget);
    if (!out.ok) { errors.push({ key: j.key, chk_in: j.chkIn, ...out }); }
    else {
      const list = out.rates.filter((x) => typeof x.rate === "number" && x.rate > 0);
      const min = list.reduce((a, b) => (a && a.rate <= b.rate ? a : b), null);
      rows.push([j.region, j.key, j.chkIn, min?.rate ?? null, min?.name ?? null, list.map((x) => [x.code, x.rate])]);
    }
    await sleep(800);
  }
  const key = `hotel-rates/${ymd(now)}/part-${String(index).padStart(2, "0")}`;
  const total = Math.ceil(jobs.length / BATCH);
  await env.DATA.put(key, JSON.stringify({ collectedAt: now.toISOString(), index, total, stays, requests: slice.length, failed: errors.length, rows, errors: errors.slice(0, 5) }), { expirationTtl: TTL });
  await addHotelAgg(env, now, rows);
  if (index === total - 1) await rebuildSummary(env, now);
  return key;
}
async function mergedHotelRates(env, date) {
  const list = await env.DATA.list({ prefix: `hotel-rates/${date}/` });
  const parts = [];
  for (const k of list.keys) parts.push(JSON.parse(await env.DATA.get(k.name)));
  if (!parts.length) return null;
  const total = parts[0].total;
  const regions = {};
  let req = 0, fail = 0;
  for (const p of parts) {
    req += p.requests; fail += p.failed;
    for (const [region, ...row] of p.rows) {
      regions[region] ??= { name: HOTELS.regions[region]?.name, hotels: HOTELS.regions[region]?.hotels.length, rows: [] };
      regions[region].rows.push(row);
    }
  }
  for (const r of Object.values(regions)) r.priced = r.rows.filter((x) => x[2] != null).length;
  const status = parts.length < total ? "partial" : fail / req >= 0.5 ? "failed" : "complete";
  return { collectedAt: parts[0].collectedAt, source: "Xotelo /api/rates (TripAdvisor 기반, 비공식). 고정 숙소 목록", currency: "USD", priceUnit: "1박 객실(세금 미포함일 수 있음)", stays: parts[0].stays, fields: ["key", "chk_in", "min_rate", "min_provider", "rates"], status, parts: `${parts.length}/${total}`, requests: req, failedRequests: fail, regions };
}


// ---------- 위키 조회수 (매월 2일, 5분마다 45건) ----------
const WIKI_BATCH = 45;
function wikiPeriod(now) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const f = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
  return { start: f(start), end: f(end), label: end.toISOString().slice(0, 7) };
}
async function collectWikiBatch(env, now, index) {
  const p = wikiPeriod(now);
  const slice = WIKI.jobs.slice(index * WIKI_BATCH, (index + 1) * WIKI_BATCH);
  if (!slice.length) return null;
  const rows = [];
  const errors = [];
  for (const [id, w, title] of slice) {
    const t = encodeURIComponent(title.replaceAll(" ", "_"));
    try {
      const r = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${w}.wikipedia/all-access/user/${t}/monthly/${p.start}/${p.end}`, { headers: { "User-Agent": "TripFlip/0.1 (https://tripflip.ohysky0127.workers.dev; data collection)", Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (r.status === 404) rows.push([id, w, title, 0]);
      else if (!r.ok) errors.push(`${w}:${title} ${r.status}`);
      else rows.push([id, w, title, ((await r.json()).items ?? []).reduce((s, x) => s + x.views, 0)]);
    } catch (e) {
      errors.push(`${w}:${title} ${e?.message ?? e}`);
    }
    await sleep(200);
  }
  const key = `wiki-pageviews/${p.label}/part-${String(index).padStart(3, "0")}`;
  await env.DATA.put(key, JSON.stringify({ period: p, index, total: Math.ceil(WIKI.jobs.length / WIKI_BATCH), rows, errors }), { expirationTtl: TTL });
  return key;
}
// 예전 형식(wiki-pageviews/YYYY-MM.json)으로 합친다
async function mergedWiki(env, label) {
  const list = await env.DATA.list({ prefix: `wiki-pageviews/${label}/` });
  if (!list.keys.length) return null;
  const places = {};
  for (const [id, qid] of Object.entries(WIKI.qid)) places[id] = { qid, ko: null, en: null };
  let period, total, errors = [];
  for (const k of list.keys) {
    const part = JSON.parse(await env.DATA.get(k.name));
    period = part.period; total = part.total; errors = errors.concat(part.errors);
    for (const [id, w, title, views] of part.rows) places[id][w] = { title, views };
  }
  const v = Object.values(places);
  return { source: "Wikimedia Pageviews API (user agent, all-access, monthly sum). 문서 제목은 2026-10 위키데이터 기준 고정", generatedAt: new Date().toISOString(), period: { start: period.start, end: period.end }, parts: `${list.keys.length}/${total}`, summary: { places: v.length, koArticle: v.filter((r) => r.ko).length, enArticle: v.filter((r) => r.en).length, errors: errors.length }, errors: errors.slice(0, 50), places };
}

// ---------- 진입점 ----------
export default {
  async scheduled(event, env, ctx) {
    const now = new Date(event.scheduledTime);
    if (event.cron.startsWith("0 0,6,12,18")) {
      console.log("항공권 저장", await collectFlights(env, now));
      return;
    }
    if (event.cron.endsWith(" 2 * *")) {
      const idx = (now.getUTCHours() * 60 + now.getUTCMinutes()) / 5;
      const key = Number.isInteger(idx) ? await collectWikiBatch(env, now, idx) : null;
      if (key) console.log("위키 저장", key);
      return;
    }
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes() - START_MIN;
    if (minutes < 0 || minutes % 5) return;
    const key = await collectHotelBatch(env, now, minutes / 5);
    if (key) console.log("숙소 저장", key);
  },
  async fetch(req, env) {
    const u = new URL(req.url);
    const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
    // 수동 실행(점검용): 헤더 x-run-key 가 시크릿 RUN_KEY 와 같을 때만
    if (u.pathname === "/run") {
      if (!env.RUN_KEY || req.headers.get("x-run-key") !== env.RUN_KEY) return json({ error: "권한 없음" }, 403);
      const now = new Date();
      const job = u.searchParams.get("job");
      if (job === "flight") return json({ saved: await collectFlights(env, now) });
      if (job === "wiki") return json({ saved: await collectWikiBatch(env, now, Number(u.searchParams.get("i") ?? 0)) });
      if (job === "hotel") return json({ saved: await collectHotelBatch(env, now, Number(u.searchParams.get("i") ?? 0), Number(u.searchParams.get("n") ?? BATCH)) });
      // 예전 원본으로 날짜별 합계 다시 만들기: job=backfill&date=YYYY-MM-DD (그 날짜 합계를 덮어씀)
      if (job === "backfill") {
        const date = u.searchParams.get("date") ?? "";
        const fl = await env.DATA.list({ prefix: `flight-prices/${date}_` });
        let fa = null;
        for (const k of fl.keys) fa = mergeFlightAgg(fa, await getJson(env, k.name));
        if (fa) await env.DATA.put(`agg/flight/${date}`, JSON.stringify(fa), { expirationTtl: AGG_TTL });
        const hl = await env.DATA.list({ prefix: `hotel-rates/${date}/` });
        let ha = null;
        for (const k of hl.keys) ha = mergeHotelAgg(ha, (await getJson(env, k.name)).rows);
        if (ha) await env.DATA.put(`agg/hotel/${date}`, JSON.stringify(ha), { expirationTtl: AGG_TTL });
        return json({ date, flightSnapshots: fa?.snapshots ?? 0, hotelBatches: ha?.batches ?? 0 });
      }
      if (job === "summary") { await rebuildSummary(env, now); return json({ ok: true }); }
      return json({ error: "job=flight|hotel|wiki|backfill|summary" }, 400);
    }
    if (u.pathname === "/list") {
      const r = await env.DATA.list({ prefix: u.searchParams.get("prefix") ?? "", cursor: u.searchParams.get("cursor") ?? undefined });
      return json({ keys: r.keys.map((k) => k.name), cursor: r.list_complete ? null : r.cursor });
    }
    if (u.pathname === "/get") {
      const v = await env.DATA.get(u.searchParams.get("key") ?? "");
      return v ? new Response(v, { headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } }) : json({ error: "없음" }, 404);
    }
    // 앱이 읽는 최근 평균가 (수집할 때마다 갱신)
    if (u.pathname === "/summary") {
      const v = await env.DATA.get("summary/latest");
      return v ? new Response(v, { headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=600" } }) : json({ error: "없음" }, 404);
    }
    if (u.pathname === "/hotel-rates") {
      const v = await mergedHotelRates(env, u.searchParams.get("date") ?? ymd(new Date()));
      return v ? json(v) : json({ error: "없음" }, 404);
    }
    if (u.pathname === "/wiki-pageviews") {
      const v = await mergedWiki(env, u.searchParams.get("month") ?? wikiPeriod(new Date()).label);
      return v ? json(v) : json({ error: "없음" }, 404);
    }
    return json({ ok: true, routes: ["/summary", "/list?prefix=flight-prices/", "/get?key=...", "/hotel-rates?date=YYYY-MM-DD", "/wiki-pageviews?month=YYYY-MM"] });
  },
};
