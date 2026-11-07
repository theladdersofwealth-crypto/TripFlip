// 위키보이지(영문) 도시 문서의 "Eat" 항목에서 식당 목록·가격대·설명을 뽑는다. 무료, CC BY-SA(출처 표기).
// 비교용으로 오픈스트리트맵에 등록된 식당 수도 같이 센다.
// 실행: node scripts/collect-wikivoyage-eat.mjs <저장 폴더> <위키보이지 문서명> <위도> <경도>
import { mkdir, writeFile } from "node:fs/promises";

const [OUT = "store/restaurants", PAGE = "Nha_Trang", LAT = "12.2388", LNG = "109.1967"] = process.argv.slice(2);
const UA = { "User-Agent": "TripFlipBot/0.1 (+https://github.com/ohysky/TripFlip)" };

/** 중첩 {{ }} 를 고려해 최상위 템플릿만 잘라낸다 */
function templates(text) {
  const out = [];
  let depth = 0, start = -1;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "{" && text[i + 1] === "{") { if (depth === 0) start = i; depth++; i++; }
    else if (text[i] === "}" && text[i + 1] === "}") { depth--; i++; if (depth === 0 && start >= 0) { out.push({ at: start, body: text.slice(start + 2, i - 1) }); start = -1; } }
  }
  return out;
}

/** 템플릿 인자를 최상위 | 기준으로 나눈다 */
function params(body) {
  const parts = [];
  let depth = 0, cur = "";
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; cur += two; i++; continue; }
    if (two === "}}" || two === "]]") { depth--; cur += two; i++; continue; }
    if (body[i] === "|" && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += body[i];
  }
  parts.push(cur);
  const kind = parts.shift().trim().toLowerCase();
  const kv = {};
  for (const p of parts) { const k = p.indexOf("="); if (k > 0) kv[p.slice(0, k).trim().toLowerCase()] = p.slice(k + 1).trim(); }
  return { kind, kv };
}

const clean = (s) => (s ?? "").replace(/\{\{[^{}]*\}\}/g, (m) => { const p = m.slice(2, -2).split("|"); return p.length > 1 ? p.slice(1).join(" ") : p[0]; }).replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1").replace(/'''?/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const res = await fetch(`https://en.wikivoyage.org/w/index.php?title=${encodeURIComponent(PAGE)}&action=raw`, { headers: UA });
const raw = await res.text();
if (!res.ok) { console.error(`위키보이지 HTTP ${res.status}`); process.exit(1); }

// 제목 위치 → 섹션 경로
const heads = [...raw.matchAll(/^(={2,4})\s*(.+?)\s*\1\s*$/gm)].map((m) => ({ at: m.index, level: m[1].length, title: m[2] }));
const sectionAt = (pos) => {
  const path = [];
  for (const h of heads) { if (h.at > pos) break; path.length = h.level - 2; path[h.level - 2] = h.title; }
  return path.filter(Boolean);
};

const rows = [];
for (const t of templates(raw)) {
  const { kind, kv } = params(t.body);
  const path = sectionAt(t.at);
  const inEat = path[0]?.toLowerCase() === "eat";
  const isEat = kind === "eat" || (kind === "listing" && (kv.type ?? "").toLowerCase() === "eat") || (inEat && ["listing", "marker"].includes(kind));
  if (!isEat || !kv.name) continue;
  rows.push({
    name: clean(kv.name), alt: clean(kv.alt) || null,
    tier: path.slice(1).join(" / ") || null, // Budget / Mid-range / Splurge 등
    price: clean(kv.price) || null, hours: clean(kv.hours) || null,
    address: clean(kv.address) || null, lat: Number(kv.lat) || null, lng: Number(kv.long) || null,
    url: kv.url || null, updated: kv.lastedit || null, content: clean(kv.content || kv.description) || null,
  });
}

// 오픈스트리트맵 식당 수(반경 10km)
let osm = null;
try {
  const q = `[out:json][timeout:60];node(around:10000,${LAT},${LNG})[amenity~"^(restaurant|cafe|fast_food)$"];out tags;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
  const j = await r.json();
  const els = j.elements ?? [];
  const by = (k) => els.filter((e) => e.tags?.amenity === k).length;
  const cuisine = {};
  for (const e of els) for (const c of (e.tags?.cuisine ?? "").split(";").filter(Boolean)) cuisine[c] = (cuisine[c] ?? 0) + 1;
  osm = { restaurant: by("restaurant"), cafe: by("cafe"), fast_food: by("fast_food"), withCuisine: els.filter((e) => e.tags?.cuisine).length, withHours: els.filter((e) => e.tags?.opening_hours).length, topCuisine: Object.entries(cuisine).sort((a, b) => b[1] - a[1]).slice(0, 15) };
} catch (e) { osm = { error: String(e?.message ?? e) }; }

const result = { collectedAt: new Date().toISOString(), source: `Wikivoyage "${PAGE}" (CC BY-SA 4.0) + OpenStreetMap (ODbL)`, page: PAGE, count: rows.length, osm, rows };
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/wikivoyage-${PAGE}.json`, JSON.stringify(result, null, 1));
console.log(`위키보이지 ${PAGE}: 식당 ${rows.length}곳 · OSM ${JSON.stringify(osm).slice(0, 200)}`);
