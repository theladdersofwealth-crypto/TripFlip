// 장소별 위키백과 조회수(최근 12개월, 사람 조회만)를 모은다. 정의서 V3 §2-3·§11-1: 장소가치 등급을 검색횟수 순위 %로 바꾸기 위한 원자료.
// 출처: 위키데이터(장소 QID → 한국어·영어 문서 제목), Wikimedia Pageviews API. 둘 다 공개·무료·키 없음.
// 결과는 data 브랜치 wiki-pageviews/YYYY-MM.json 에만 둔다. 등급 계산은 별도 단계(구간 % 미정).
import { readFile, writeFile, mkdir } from "node:fs/promises";

const OUT = process.argv[2] ?? "store/wiki-pageviews";
const UA = "TripFlip/0.1 (https://github.com/ohysky/TripFlip; data collection)";
const WIKIS = ["ko", "en"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// src/data/worldV1.ts 의 WORLD_PLACES_RAW 배열을 그대로 읽는다(빌드 결과물이라 JSON 형태).
async function loadPlaces() {
  const s = await readFile(new URL("../src/data/worldV1.ts", import.meta.url), "utf8");
  const a = s.indexOf("[", s.indexOf("const WORLD_PLACES_RAW"));
  let depth = 0, inStr = false, j = a;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === '"' && s[j - 1] !== "\\") inStr = !inStr;
    if (inStr) continue;
    if (c === "[") depth++;
    else if (c === "]" && --depth === 0) break;
  }
  return JSON.parse(s.slice(a, j + 1));
}

async function getJson(url) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (r.ok) return r.json();
    if (r.status === 404) return null; // 해당 기간 조회 기록 없음
    if (r.status === 429 || r.status >= 500) { await sleep(5000 * (i + 1)); continue; }
    throw new Error(`${r.status} ${url}`);
  }
  throw new Error(`retry exhausted ${url}`);
}

// 지난달 말일까지 12개월
function period(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const f = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
  return { start: f(start), end: f(end), label: end.toISOString().slice(0, 7) };
}

async function sitelinks(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 50) {
    const ids = qids.slice(i, i + 50).join("|");
    const sites = WIKIS.map((w) => `${w}wiki`).join("|");
    const j = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=sitelinks&sitefilter=${sites}&format=json`);
    for (const [q, e] of Object.entries(j?.entities ?? {})) {
      out[q] = {};
      for (const w of WIKIS) if (e.sitelinks?.[`${w}wiki`]) out[q][w] = e.sitelinks[`${w}wiki`].title;
    }
    await sleep(200);
  }
  return out;
}

async function views(wiki, title, p) {
  const t = encodeURIComponent(title.replaceAll(" ", "_"));
  const j = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${wiki}.wikipedia/all-access/user/${t}/monthly/${p.start}/${p.end}`);
  return (j?.items ?? []).reduce((s, x) => s + x.views, 0);
}

async function pool(items, n, fn) {
  let k = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (k < items.length) { const it = items[k++]; await fn(it); }
  }));
}

const places = await loadPlaces();
const p = period();
const withQid = places.filter((x) => x.qid);
const links = await sitelinks([...new Set(withQid.map((x) => x.qid))]);

const result = {};
const jobs = [];
for (const pl of places) {
  const r = { qid: pl.qid ?? null };
  result[pl.id] = r;
  for (const w of WIKIS) {
    const title = pl.qid ? links[pl.qid]?.[w] : undefined;
    r[w] = title ? { title, views: null } : null;
    if (title) jobs.push([r[w], w, title]);
  }
}
const errors = [];
await pool(jobs, 4, async ([slot, w, title]) => {
  try { slot.views = await views(w, title, p); } catch (e) { errors.push(`${w}:${title} ${e.message}`); }
  await sleep(50);
});

const count = (f) => Object.values(result).filter(f).length;
const summary = {
  places: places.length,
  withQid: withQid.length,
  koArticle: count((r) => r.ko),
  enArticle: count((r) => r.en),
  noArticle: count((r) => !r.ko && !r.en),
  errors: errors.length,
};
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/${p.label}.json`, JSON.stringify({
  source: "Wikidata sitelinks + Wikimedia Pageviews API (user agent, all-access, monthly sum)",
  generatedAt: new Date().toISOString(),
  period: { start: p.start, end: p.end },
  summary,
  errors: errors.slice(0, 50),
  places: result,
}));
console.log(summary);
