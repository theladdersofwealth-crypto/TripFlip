// 전 세계 권역 물가 재료를 주 1회 모은다 (0원).
// 1) 숙소: 위키데이터에서 거점 좌표 근처 도시의 트립어드바이저 ID(P3134)를 찾고, Xotelo 목록에서 최소 품질 기준(4.5·리뷰300) 통과 숙소의 1박 가격대(USD) 중간값.
// 2) 나라 물가: 세계은행 WDI(CC BY 4.0) PPP 환산계수 ÷ 시장환율 = 물가 수준(미국=1).
import { readFile, writeFile, mkdir } from "node:fs/promises";

const OUT = process.argv[2] ?? "store/prices";
const UA = "TripFlip/0.1 (https://github.com/ohysky/TripFlip)";
const MIN_RATING = 4.5;
const MIN_REVIEWS = 300;
const MIN_HOTELS = 5;
const MAX_HOTEL_KM = 40; // 숙소 위치 중간값이 거점에서 이보다 멀면 다른 도시 ID로 본다
const PAGES = 3; // 리뷰 많은 순 상위 300곳만 본다 (호출 수 줄이기)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const km = (a, b, c, d) => {
  const t = Math.PI / 180;
  const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
};
const getJson = async (u) => {
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// 나라 이름 → ISO3 (세계은행)
const ISO3 = { 일본: "JPN", 베트남: "VNM", 중국: "CHN", 미국: "USA", 태국: "THA", 필리핀: "PHL", 대만: "TWN", 홍콩: "HKG", 싱가포르: "SGP", 마카오: "MAC", 인도네시아: "IDN", 스페인: "ESP", 말레이시아: "MYS", "괌(미국령)": "GUM", 호주: "AUS", 튀르키예: "TUR", 오스트리아: "AUT", 독일: "DEU", 몽골: "MNG", 캐나다: "CAN", 캄보디아: "KHM", 멕시코: "MEX", "북마리아나(사이판)": "MNP", 뉴질랜드: "NZL", 슬로베니아: "SVN", 몰디브: "MDV", 핀란드: "FIN", 도미니카공화국: "DOM", 남아프리카공화국: "ZAF", 스리랑카: "LKA", 보스니아: "BIH", 모리셔스: "MUS", 코스타리카: "CRI", 피지: "FJI", 팔라우: "PLW", 프랑스: "FRA", 이탈리아: "ITA", 영국: "GBR", 스위스: "CHE", 체코: "CZE", 라오스: "LAO", 크로아티아: "HRV", 포르투갈: "PRT", 그리스: "GRC", 헝가리: "HUN", 네덜란드: "NLD", 아랍에미리트: "ARE", 우즈베키스탄: "UZB", 카자흐스탄: "KAZ", 이집트: "EGY" };

async function wbLatest(indicator) {
  const j = await getJson(`https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&mrv=6&per_page=20000`);
  const out = {};
  for (const r of j[1] ?? []) if (r.value != null && !out[r.countryiso3code]) out[r.countryiso3code] = { v: r.value, year: +r.date };
  return out;
}

// 거점 좌표 30km 안에서 트립어드바이저 ID(P3134)가 있는 정착지를 위키 링크 많은 순으로 고른다.
// 이름 검색은 표기 차이로 자주 빗나가서 좌표로 찾는다. 실제로 맞는 도시인지는 숙소 위치로 다시 확인한다(hotels).
async function tripadvisorCandidates(lat, lon) {
  const q = `SELECT ?item ?ta ?sl WHERE {
    SERVICE wikibase:around { ?item wdt:P625 ?loc. bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral; wikibase:radius "30". }
    ?item wdt:P3134 ?ta; wikibase:sitelinks ?sl; wdt:P31/wdt:P279* wd:Q486972.
  } ORDER BY DESC(?sl) LIMIT 6`;
  for (let i = 0; i < 3; i++) {
    try {
      const j = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`);
      const out = [];
      for (const b of j.results.bindings) {
        const ta = b.ta.value.match(/^g?(\d+)$/)?.[1];
        if (ta && !out.includes(`g${ta}`)) out.push(`g${ta}`);
      }
      return out;
    } catch {
      await sleep(5000 * (i + 1));
    }
  }
  return [];
}

async function hotels(loc, lat, lon) {
  const prices = [];
  const dists = [];
  const kept = []; // 추천 숙소용: [이름, 평점, 리뷰 수, 최저가, 최고가, 트립어드바이저 키]
  let scanned = 0;
  for (let i = 0; i < PAGES; i++) {
    const r = await fetch(`https://data.xotelo.com/api/list?location_key=${loc}&limit=100&offset=${i * 100}&sort=popularity`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok || b.error) return { scanned, passed: 0, medianUsd: null, error: `xotelo ${r.status}` };
    const list = b.result?.list ?? [];
    scanned += list.length;
    for (const h of list) {
      const ok = (h.review_summary?.rating ?? 0) >= MIN_RATING && (h.review_summary?.count ?? 0) >= MIN_REVIEWS;
      const lo = h.price_ranges?.minimum, hi = h.price_ranges?.maximum;
      if (ok && lo > 0 && hi > 0) {
        prices.push((lo + hi) / 2);
        kept.push([h.name, h.review_summary.rating, h.review_summary.count, lo, hi, h.key]);
      }
      if (h.geo?.latitude != null) dists.push(km(lat, lon, h.geo.latitude, h.geo.longitude));
    }
    if (list.length < 100) break;
    await sleep(1500);
  }
  const m = median(prices);
  // 5곳 미만이면 가격대가 한두 숙소에 좌우돼서 쓰지 않는다
  return { scanned, passed: prices.length, medianUsd: prices.length >= MIN_HOTELS ? Math.round(m) : null, hotelKm: dists.length ? Math.round(median(dists)) : null, hotels: kept.slice(0, 60) };
}

const regions = JSON.parse(await readFile(new URL("./world-regions.json", import.meta.url), "utf8"));
const centers = JSON.parse(await readFile(new URL("./region-centers.json", import.meta.url), "utf8"));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

const ppp = await wbLatest("PA.NUS.PPP");
const fx = await wbLatest("PA.NUS.FCRF");
const countries = {};
for (const [ko, iso] of Object.entries(ISO3)) {
  const p = ppp[iso], f = fx[iso];
  // 달러 사용 지역(괌·사이판 등)은 환율 1로 본다
  const rate = f?.v ?? (["GUM", "MNP", "PLW"].includes(iso) ? 1 : null);
  countries[ko] = p && rate ? { iso, priceLevel: +(p.v / rate).toFixed(3), year: p.year } : { iso, priceLevel: null };
}

// 항공권(원화)과 합칠 때 쓰는 원/달러 연평균 환율
const krwPerUsd = fx.KOR ? { v: +fx.KOR.v.toFixed(1), year: fx.KOR.year } : null;

const out = {};
for (const reg of regions) {
  if (only && !only.has(reg.id)) continue;
  const c = centers[reg.id];
  const row = { country: reg.country };
  try {
    const cands = await tripadvisorCandidates(c.lat, c.lon);
    row.tried = [];
    for (const ta of cands) {
      const h = await hotels(ta, c.lat, c.lon);
      row.tried.push(`${ta}:${h.hotelKm ?? "?"}km`);
      if (h.hotelKm != null && h.hotelKm <= MAX_HOTEL_KM && h.scanned) {
        Object.assign(row, { tripadvisor: ta }, h);
        break;
      }
      await sleep(1500);
    }
    if (!row.tripadvisor) row.error = cands.length ? "맞는 트립어드바이저 지역 없음" : "tripadvisor id 없음";
  } catch (e) {
    row.error = String(e);
  }
  out[reg.id] = row;
  console.log(reg.id, JSON.stringify(row));
  await sleep(2000);
}
await mkdir(OUT, { recursive: true });
const file = `${OUT}/region-prices-${new Date().toISOString().slice(0, 10)}.json`;
// 일부만 다시 돌린 경우 같은 날 결과에 덮어 붙인다
if (only) {
  const prev = JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
  for (const [id, row] of Object.entries(prev.regions ?? {})) if (!out[id]) out[id] = row;
}
await writeFile(file, JSON.stringify({ collectedAt: new Date().toISOString(), source: { hotels: "Xotelo(트립어드바이저 기반, 비공식) 1박 가격대 USD 중간값", country: "World Bank WDI PA.NUS.PPP ÷ PA.NUS.FCRF (CC BY 4.0)" }, filter: { minRating: MIN_RATING, minReviews: MIN_REVIEWS }, krwPerUsd, countries, regions: out }));
console.log("saved", file);
