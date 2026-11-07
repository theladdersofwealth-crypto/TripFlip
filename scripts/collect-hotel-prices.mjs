// 시범 권역 숙소 목록·가격대를 하루 한 번 저장한다 (Xotelo, 트립어드바이저 기반 비공식 무료 API).
// 출시 전 아고다 등 공식 제휴 데이터로 바꿀 예정.
// 실행: node scripts/collect-hotel-prices.mjs [저장 폴더]
//
// 데이터 보호 규칙 (2026-11-06):
// - 5개 지역 모두 정상 → hotels/날짜.json (status "complete")
// - 일부 지역만 정상 → hotels/날짜.json (status "partial"). 같은 날짜에 complete 파일이 이미 있으면 덮지 않고 _errors/ 로.
// - 전부 실패      → hotels/_errors/날짜.json 에만 저장(정상 파일 자리를 차지하지 않음)
// - complete 가 아니면 종료 코드 1 → Actions 가 실패로 표시된다(결과 커밋은 워크플로에서 따로 수행).
import { mkdir, readFile, writeFile } from "node:fs/promises";

const OUT_DIR = process.argv[2] ?? "data/hotels";
// 트립어드바이저 지역 키
const LOCATIONS = { NT: ["나트랑", "g293928"], HK: ["홍콩", "g294217"], OS: ["오사카", "g298566"], DN: ["다낭", "g298085"], PQ: ["푸꾸옥", "g469418"] };
const FIELDS = ["key", "name", "type", "rating", "reviews", "price_min", "price_max", "lat", "lng", "labels"];
// 최소 품질 기준 (형님 확정 2026-10-30): 청결도 데이터가 생기기 전까지 총점으로 대신한다.
// 트립어드바이저 5점 만점 4.5 = 10점 만점 9점.
const MIN_RATING = 4.5;
const MIN_REVIEWS = 300;
const PAGE = 100;
const MAX_PAGES = 60;
const RETRIES = 3; // 일시 오류(네트워크·429·5xx)만 재시도
const BASE = "https://data.xotelo.com/api/list";

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** 요청 1회. 응답을 그대로 진단용으로 남긴다. */
async function call(url) {
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    return { transient: true, diag: { url, network: String(e?.cause?.code ?? e?.message ?? e) } };
  }
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* JSON 아님 = 차단 페이지일 수 있음 */ }
  const diag = {
    url,
    http: res.status,
    contentType: res.headers.get("content-type"),
    retryAfter: res.headers.get("retry-after"),
    server: res.headers.get("server"),
    json: body !== null,
    bodyKeys: body && typeof body === "object" ? Object.keys(body) : null,
    snippet: text.slice(0, 300),
  };
  const apiError = body?.error ?? (body?.status_code && body.status_code >= 400 ? { status_code: body.status_code, message: body.message } : null);
  const ok = res.ok && body && !apiError && Array.isArray(body.result?.list);
  return { ok, transient: res.status === 429 || res.status >= 500, apiError, diag, body };
}

/** 일시 오류는 제한적으로 재시도 */
async function callWithRetry(url) {
  let r;
  for (let i = 0; i < RETRIES; i++) {
    r = await call(url);
    if (r.ok || !r.transient) return { ...r, tries: i + 1 };
    await sleep(5000 * (i + 1));
  }
  return { ...r, tries: RETRIES };
}

// 기본 요청이 실패하면 원인 구분용으로 요청 형태를 바꿔 본다(응답 구조·파라미터 변경 여부).
const VARIANTS = [
  { name: "기본", q: (loc, off) => `location_key=${loc}&limit=${PAGE}&offset=${off}` },
  { name: "limit30", q: (loc, off) => `location_key=${loc}&limit=30&offset=${off}` },
  { name: "sort=best_value", q: (loc, off) => `location_key=${loc}&limit=${PAGE}&offset=${off}&sort=best_value` },
  { name: "키만", q: (loc) => `location_key=${loc}` },
];

async function collectRegion(loc) {
  const probes = [];
  // 첫 페이지로 동작하는 요청 방식을 찾는다
  let variant = null;
  let first = null;
  for (const v of VARIANTS) {
    const r = await callWithRetry(`${BASE}?${v.q(loc, 0)}`);
    probes.push({ variant: v.name, ok: !!r.ok, tries: r.tries, apiError: r.apiError ?? null, ...r.diag });
    if (r.ok) { variant = v; first = r; break; }
    await sleep(1500);
  }
  if (!variant) return { rows: [], total: 0, error: probes[0].apiError ? JSON.stringify(probes[0].apiError) : `HTTP ${probes[0].http ?? probes[0].network}`, probes };

  const rows = [];
  const seen = new Set();
  let total = first.body.result?.total_count ?? 0;
  let error;
  let empty = 0;
  let r = first;
  for (let i = 0; i < MAX_PAGES; i++) {
    if (i > 0) {
      await sleep(1000);
      r = await callWithRetry(`${BASE}?${variant.q(loc, i * PAGE)}`);
      if (!r.ok) {
        error = `${i + 1}쪽에서 중단: ${r.apiError ? JSON.stringify(r.apiError) : `HTTP ${r.diag.http ?? r.diag.network}`}`;
        probes.push({ variant: variant.name, page: i + 1, ok: false, tries: r.tries, apiError: r.apiError ?? null, ...r.diag });
        break;
      }
      total = r.body.result?.total_count ?? total;
    }
    const list = r.body.result.list;
    for (const h of list) {
      if (seen.has(h.key)) continue; // 페이지가 겹쳐서 같은 숙소가 다시 오기도 한다
      seen.add(h.key);
      rows.push([h.key, h.name, h.accommodation_type, h.review_summary?.rating ?? null, h.review_summary?.count ?? null, h.price_ranges?.minimum ?? null, h.price_ranges?.maximum ?? null, h.geo?.latitude ?? null, h.geo?.longitude ?? null, h.merchandising_labels ?? []]);
    }
    // 중간 페이지가 덜 차서 오기도 해서, 빈 페이지가 연달아 나오거나 전체 개수를 넘을 때만 멈춘다
    empty = list.length ? 0 : empty + 1;
    const step = variant.name === "limit30" ? 30 : PAGE;
    if (variant.name === "키만" || empty >= 2 || (i + 1) * step >= total) break;
  }
  return { rows, total, error, variant: variant.name, probes };
}

const now = new Date();
const date = now.toISOString().slice(0, 10);
const result = { collectedAt: now.toISOString(), source: "Xotelo (TripAdvisor 기반, 비공식)", filter: { minRating: MIN_RATING, minReviews: MIN_REVIEWS }, currency: "USD", priceUnit: "1박 객실", fields: FIELDS, status: "complete", failedRegions: [], regions: {}, diagnostics: {} };

for (const [id, [name, loc]] of Object.entries(LOCATIONS)) {
  const { rows, total, error, variant, probes } = await collectRegion(loc);
  const kept = rows.filter((h) => (h[3] ?? 0) >= MIN_RATING && (h[4] ?? 0) >= MIN_REVIEWS).sort((a, b) => b[4] - a[4]);
  // 오류가 났거나, 전체 숙소가 있다는데 하나도 못 읽었으면 실패로 본다
  const failed = !!error || rows.length === 0;
  result.regions[id] = { name, locationKey: loc, total, scanned: rows.length, ok: !failed, ...(variant && variant !== "기본" ? { variant } : {}), ...(error ? { error } : {}), hotels: kept };
  if (failed || probes.some((p) => !p.ok)) result.diagnostics[id] = probes;
  if (failed) result.failedRegions.push(id);
  const tag = failed ? "❌" : "✅";
  console.log(`${tag} ${name}(${loc}): 전체 ${total} · 읽음 ${rows.length} → 기준 통과 ${kept.length}곳${variant && variant !== "기본" ? ` [방식 ${variant}]` : ""}${error ? ` · 오류 ${error}` : ""}`);
  for (const p of probes.filter((x) => !x.ok)) console.log(`   진단 ${p.variant}${p.page ? ` ${p.page}쪽` : ""}: HTTP ${p.http ?? "-"} ${p.network ?? ""} type=${p.contentType ?? "-"} retry-after=${p.retryAfter ?? "-"} 시도 ${p.tries}회 · ${p.snippet?.replace(/\s+/g, " ").slice(0, 160) ?? ""}`);
}

const okCount = Object.keys(LOCATIONS).length - result.failedRegions.length;
result.status = okCount === Object.keys(LOCATIONS).length ? "complete" : okCount > 0 ? "partial" : "failed";

const readStatus = async (f) => { try { return JSON.parse(await readFile(f, "utf8")).status ?? "complete"; } catch { return null; } };
const mainFile = `${OUT_DIR}/${date}.json`;
const existing = await readStatus(mainFile);
// 실패는 항상 _errors 로. 불완전은 같은 날 정상 파일이 있으면 _errors 로(정상 데이터 보호).
const toErrors = result.status === "failed" || (result.status === "partial" && existing === "complete");
const file = toErrors ? `${OUT_DIR}/_errors/${date}.json` : mainFile;
await mkdir(toErrors ? `${OUT_DIR}/_errors` : OUT_DIR, { recursive: true });
await writeFile(file, JSON.stringify(result));
console.log(`상태 ${result.status} (${okCount}/5 지역) → 저장: ${file}`);

if (result.status !== "complete") {
  console.error(`숙소 수집 ${result.status === "failed" ? "실패" : "불완전"}: ${result.failedRegions.join(", ")}`);
  process.exitCode = 1;
}
