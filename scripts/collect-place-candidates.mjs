// 전 세계 권역(scripts/world-regions.json)마다 명소 후보를 위키데이터에서 뽑는다.
// 0원: 노미나팀(거점 좌표) + 위키데이터 SPARQL(반경 내 항목, 위키 문서 수=인지도). 둘 다 공개 데이터.
// 결과는 후보일 뿐이다. 정의서 §2-1(여행지·음식점)에 맞는지 거르고 등급을 매기는 건 다음 단계.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const OUT = process.argv[2] ?? "store/places";
const UA = "TripFlip/0.1 (https://github.com/ohysky/TripFlip)";
const MIN_SITELINKS = 3;
const LIMIT = 150;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 행정구역·교통·학교·사건처럼 여행지가 아닌 유형이 하나라도 붙은 항목은 뺀다. 유형이 없는 항목도 뺀다.
const DROP = new RegExp(
  [
    "station", "^city$", "big city", "megacity", "metropolis", "city of ", "global city", "municipality", "ward of", "special ward", "prefecture", "province",
    "county", "administrative", "capital of", "district of", "districts of", "^district$", "urban district", "commune of", "town of", "village of",
    "department of", "region of", "^region$", "metropolitan area", "dependent territory", "sovereign state", "country",
    "university", "college", "school", "academic", "research institute", "company", "enterprise", "business", "hospital", "airport", "aerodrome",
    "air base", "airbase", "military", "embassy", "consulate", "government", "ministry", "court", "constituency", "electoral", "census", "statistical",
    "organization", "organisation", "political", "sports club", "football club", "sports season", "tournament", "championship", "olympic", "world cup",
    "television", "newspaper", "^bank$", "stock exchange", "diocese", "event", "attack", "assassination", "shooting", "protest", "demonstration",
    "fire$", "siege", "battle", "war$", "massacre", "disaster", "earthquake", "language", "treaty", "agreement", "conference", "empire",
    "historical country", "former entity", "rapid transit", "railway", "metro", "tram", "bus ", "highway", "expressway", "motorway", "colony",
  ].join("|"),
  "i",
);

async function geocode(q) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const [hit] = await r.json();
  return hit ? { lat: +hit.lat, lon: +hit.lon, label: hit.display_name } : null;
}

async function sparql(lat, lon, radius) {
  const q = `SELECT ?item ?en ?ko ?coord ?sl (GROUP_CONCAT(DISTINCT ?tl; separator="|") AS ?types) WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radius}" . }
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${MIN_SITELINKS})
  OPTIONAL { ?item wdt:P31 ?t . ?t rdfs:label ?tl . FILTER(LANG(?tl) = "en") }
  OPTIONAL { ?item rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?ko . FILTER(LANG(?ko) = "ko") }
} GROUP BY ?item ?en ?ko ?coord ?sl ORDER BY DESC(?sl) LIMIT 800`;
  const r = await fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: { "User-Agent": UA, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
    body: "query=" + encodeURIComponent(q),
  });
  if (!r.ok) throw new Error(`wikidata ${r.status}`);
  const j = await r.json();
  return j.results.bindings.map((b) => {
    const [x, y] = b.coord.value.replace(/^Point\(|\)$/g, "").split(" ").map(Number);
    return [b.item.value.split("/").pop(), b.en?.value ?? "", b.ko?.value ?? "", +y.toFixed(5), +x.toFixed(5), +b.sl.value, b.types?.value ?? ""];
  });
}

const regions = JSON.parse(await readFile(new URL("./world-regions.json", import.meta.url), "utf8"));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const result = [];
for (const reg of regions) {
  if (only && !only.has(reg.id)) continue;
  const row = { ...reg, lat: null, lon: null, geocoded: null, radiusKm: null, error: null, items: [] };
  try {
    const g = await geocode(reg.query);
    await sleep(1100);
    if (!g) throw new Error("geocode miss");
    Object.assign(row, { lat: g.lat, lon: g.lon, geocoded: g.label });
    for (const radius of [30, 15]) {
      try {
        const items = await sparql(g.lat, g.lon, radius);
        const seen = new Set();
        row.items = items
          .filter((it) => it[6] && !it[6].split("|").some((t) => DROP.test(t)))
          .filter((it) => !seen.has(it[0]) && seen.add(it[0]))
          .slice(0, LIMIT);
        row.radiusKm = radius;
        break;
      } catch (e) {
        row.error = String(e);
        await sleep(5000);
      }
    }
    if (row.items.length) row.error = null;
  } catch (e) {
    row.error = String(e);
  }
  console.log(reg.id, row.lat, row.radiusKm, row.items.length, row.error ?? "");
  result.push(row);
  await sleep(1500);
}
await mkdir(OUT, { recursive: true });
const fields = ["qid", "en", "ko", "lat", "lon", "sitelinks", "types"];
const file = `${OUT}/candidates-${new Date().toISOString().slice(0, 10)}.json`;
await writeFile(file, JSON.stringify({ collectedAt: new Date().toISOString(), source: "Wikidata (CC0) + Nominatim/OSM", fields, regions: result }));
console.log("saved", file, result.filter((r) => r.error).length, "errors");
