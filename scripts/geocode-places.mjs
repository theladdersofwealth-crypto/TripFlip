// 등급을 매긴 장소 중 위키데이터 후보와 이름이 안 맞은 곳의 좌표를 찾는다.
// 위키데이터 검색(영문명) → 좌표(P625) 중 권역 거점에서 가장 가까운 것(320km 이내), 없으면 노미나팀(거점 주변 상자 안).
import { readFile, writeFile, mkdir } from "node:fs/promises";

const OUT = process.argv[2] ?? "store/places";
const UA = "TripFlip/0.1 (https://github.com/ohysky/TripFlip)";
const MAX_KM = 320;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const km = (a, b, c, d) => {
  const t = Math.PI / 180;
  const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
};
const get = async (u) => {
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${u.slice(0, 60)}`);
  return r.json();
};

async function viaWikidata(p) {
  const terms = [...new Set([p.en, p.en.replace(/\s*\(.*\)/, ""), p.en.split(",")[0]])];
  const ids = new Set();
  for (const s of terms) {
    const j = await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=7&search=${encodeURIComponent(s)}`);
    j.search.forEach((x) => ids.add(x.id));
    await sleep(250);
  }
  if (!ids.size) return null;
  const j = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${[...ids].slice(0, 50).join("|")}`);
  let best = null;
  for (const [id, e] of Object.entries(j.entities)) {
    const v = e.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (!v) continue;
    const d = km(p.lat0, p.lon0, v.latitude, v.longitude);
    if (d <= MAX_KM && (!best || d < best.km)) best = { qid: id, lat: +v.latitude.toFixed(5), lon: +v.longitude.toFixed(5), km: Math.round(d), via: "wikidata" };
  }
  return best;
}

async function viaNominatim(p) {
  const box = [p.lon0 - 2.5, p.lat0 + 2.5, p.lon0 + 2.5, p.lat0 - 2.5].join(",");
  const j = await get(`https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1&viewbox=${box}&q=${encodeURIComponent(p.en.replace(/\s*\(.*\)/, ""))}`);
  await sleep(1100);
  const h = j[0];
  if (!h) return null;
  const d = km(p.lat0, p.lon0, +h.lat, +h.lon);
  return d <= MAX_KM ? { qid: null, lat: +(+h.lat).toFixed(5), lon: +(+h.lon).toFixed(5), km: Math.round(d), via: "nominatim" } : null;
}

const input = JSON.parse(await readFile(new URL("./place-geocode-input.json", import.meta.url), "utf8"));
const out = [];
for (const p of input) {
  let hit = null;
  try {
    hit = (await viaWikidata(p)) ?? (await viaNominatim(p));
  } catch (e) {
    console.log("err", p.en, String(e));
  }
  out.push({ i: p.i, en: p.en, ...(hit ?? { qid: null, lat: null, lon: null, km: null, via: null }) });
}
await mkdir(OUT, { recursive: true });
const file = `${OUT}/geocode-${new Date().toISOString().slice(0, 10)}.json`;
await writeFile(file, JSON.stringify(out));
console.log("saved", file, out.filter((x) => x.lat != null).length, "/", out.length);
