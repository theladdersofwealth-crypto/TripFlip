// 숙소 목록이 없는 권역의 트립어드바이저 도시 번호 → Xotelo 숙소 목록을 찾는다 (하루 12회, 회당 몇 권역씩).
// 기준: 먼저 4.5점·후기 300개 이상. 5곳 미만이면 4.0점·후기 100개 이상으로 낮추고 relaxed=true 로 표시해 앱이 알린다.
export const STRICT = { rating: 4.5, reviews: 300, label: "4.5점·후기 300개 이상" };
export const RELAXED = { rating: 4.0, reviews: 100, label: "4.0점·후기 100개 이상" };
export const MIN_HOTELS = 5;
export const MAX_PER_REGION = 20; // 하루 요청 수를 줄이려고 후기 많은 순 20곳만
export const MAX_HOTEL_KM = 40; // 숙소 위치 중간값이 거점에서 이보다 멀면 다른 도시 번호로 본다

const rad = Math.PI / 180;
export function km(a, b, c, d) {
  const x = Math.sin(((c - a) * rad) / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(((d - b) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Xotelo 목록 → 기준에 맞는 숙소. 엄격 기준으로 5곳 이상이면 그대로, 아니면 낮춘 기준(relaxed) */
export function pickHotels(list) {
  const rows = list
    .filter((h) => h?.key && h.name) // 가격은 /api/rates 로 따로 받으므로 목록의 가격대는 요구하지 않는다
    .map((h) => ({ key: h.key, name: h.name, rating: h.review_summary?.rating ?? 0, reviews: h.review_summary?.count ?? 0 }));
  const by = (c) => rows.filter((h) => h.rating >= c.rating && h.reviews >= c.reviews).sort((a, b) => b.reviews - a.reviews);
  const strict = by(STRICT);
  if (strict.length >= MIN_HOTELS) return { relaxed: false, hotels: strict.slice(0, MAX_PER_REGION).map((h) => [h.key, h.name]), passed: strict.length };
  const loose = by(RELAXED);
  if (loose.length >= MIN_HOTELS) return { relaxed: true, hotels: loose.slice(0, MAX_PER_REGION).map((h) => [h.key, h.name]), passed: loose.length };
  return { relaxed: null, hotels: [], passed: loose.length };
}

const UA = "TripFlip/0.1 (travel price research; data collection)";
async function wikidataCandidates(lat, lon, budget) {
  const q = `SELECT ?item ?ta ?sl WHERE {
    SERVICE wikibase:around { ?item wdt:P625 ?loc. bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral; wikibase:radius "60". }
    ?item wdt:P3134 ?ta; wikibase:sitelinks ?sl.
    FILTER(STRSTARTS(STR(?ta), "g"))
  } ORDER BY DESC(?sl) LIMIT 8`;
  if (budget.left < 1) return null;
  budget.left--;
  try {
    const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) return { error: `wikidata ${r.status}` };
    const out = [];
    for (const b of (await r.json()).results.bindings) {
      const ta = b.ta.value.match(/^g?(\d+)$/)?.[1];
      if (ta && !out.includes(`g${ta}`)) out.push(`g${ta}`);
    }
    return { ids: out };
  } catch (e) {
    return { error: `wikidata ${String(e?.message ?? e)}` };
  }
}

async function xoteloList(loc, budget, pages = 3, startPage = 0) {
  const list = [];
  for (let i = startPage; i < startPage + pages; i++) {
    if (budget.left < 1) return { list, partial: true };
    budget.left--;
    try {
      const r = await fetch(`https://data.xotelo.com/api/list?location_key=${loc}&limit=100&offset=${i * 100}&sort=popularity`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || b.error) return { list, error: `xotelo ${r.status}${b.error ? " " + JSON.stringify(b.error).slice(0, 80) : ""}` };
      const page = b.result?.list ?? [];
      list.push(...page);
      if (page.length < 100) break;
    } catch (e) {
      return { list, error: `xotelo ${String(e?.message ?? e)}` };
    }
    await new Promise((ok) => setTimeout(ok, 800));
  }
  return { list };
}

/** 한 권역 처리. 결과: { ok, ta, relaxed, hotels, scanned, passed } 또는 { error } */
export async function discoverRegion(t, budget, hints = {}) {
  const base = t.ta ? [t.ta] : [...(hints[t.id] ?? [])];
  const tried = [];
  let lastErr = null;
  const tryIds = async (ids) => {
    for (const ta of ids) {
      if (tried.includes(ta)) continue;
      if (budget.left < 3) return { retry: true };
      tried.push(ta);
      // 먼저 1쪽만 읽어 거점에서 가까운 도시 번호인지 확인한다(틀린 번호에 요청을 쓰지 않으려고)
      const first = await xoteloList(ta, budget, 1, 0);
      if (first.error) { lastErr = first.error; if (!first.list.length) continue; }
      const near = (rows) => median(rows.filter((h) => h.geo?.latitude != null).map((h) => km(t.lat, t.lon, h.geo.latitude, h.geo.longitude)));
      if (first.list.length && (near(first.list) ?? Infinity) <= MAX_HOTEL_KM) {
        const list = [...first.list];
        if (first.list.length >= 100 && !first.error) list.push(...(await xoteloList(ta, budget, 2, 1)).list);
        const p = pickHotels(list);
        if (p.hotels.length) return { ok: true, ta, scanned: list.length, hotelKm: Math.round(near(list) ?? 0), ...p };
        lastErr = `기준을 낮춰도 ${RELAXED.label} 숙소가 5곳 미만 (스캔 ${list.length}곳)`;
        continue;
      }
      lastErr = lastErr ?? "맞는 트립어드바이저 지역 없음";
    }
    return null;
  };
  let r = await tryIds(base.slice(0, 2));
  if (r) return r;
  // 번호가 없거나 맞지 않으면 위키데이터(반경 60km 안 트립어드바이저 도시 번호 g…)에서 후보를 더 받는다
  const w = await wikidataCandidates(t.lat, t.lon, budget);
  if (!w) return { retry: true };
  if (w.error) return { error: lastErr ?? w.error };
  r = await tryIds(w.ids.slice(0, 3));
  if (r) return r;
  return { error: lastErr ?? (tried.length ? "맞는 트립어드바이저 지역 없음" : "트립어드바이저 번호 없음") };
}

/** 번호를 못 찾았거나 맞지 않은 권역: 영문 이름으로 Xotelo 검색 → 결과 숙소 번호(g…-d…)에서 도시 번호 후보를 모아 하나씩 거리로 검증한다 */
export async function discoverBySearch(t, names, budget, skip = []) {
  const tally = new Map();
  let note = "";
  for (const q of names.slice(0, 2)) {
    if (budget.left < 5) return { retry: true };
    budget.left--;
    try {
      const r = await fetch(`https://data.xotelo.com/api/search?query=${encodeURIComponent(q)}&location_type=accommodation`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      const txt = await r.text();
      if (!r.ok) { note = `search ${r.status}`; continue; }
      for (const m of txt.matchAll(/g(\d{4,8})-d\d+/g)) tally.set(`g${m[1]}`, (tally.get(`g${m[1]}`) ?? 0) + 1);
      if (!tally.size) note = `search 결과에 번호 없음: ${txt.slice(0, 80)}`;
    } catch (e) {
      note = `search ${String(e?.message ?? e)}`;
    }
    await new Promise((ok) => setTimeout(ok, 800));
  }
  const cands = [...tally.entries()].filter(([g]) => !skip.includes(g)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
  if (!cands.length) return { error: note || "검색 후보 없음" };
  let best = null;
  for (const ta of cands) {
    if (budget.left < 3) return best ?? { retry: true };
    const first = await xoteloList(ta, budget, 1, 0);
    if (!first.list.length) { note = first.error ?? note; continue; }
    const near = (rows) => median(rows.filter((h) => h.geo?.latitude != null).map((h) => km(t.lat, t.lon, h.geo.latitude, h.geo.longitude)));
    if ((near(first.list) ?? Infinity) > MAX_HOTEL_KM) continue;
    const list = [...first.list];
    if (first.list.length >= 100 && !first.error) list.push(...(await xoteloList(ta, budget, 2, 1)).list);
    const p = pickHotels(list);
    const res = { ok: true, ta, scanned: list.length, hotelKm: Math.round(near(list) ?? 0), via: "search", ...p };
    if (p.hotels.length && (!best || p.hotels.length > best.hotels.length)) best = res;
    if (best) break;
  }
  return best ?? { error: `검색 후보 ${cands.join(",")} 모두 맞지 않음${note ? " · " + note : ""}` };
}
