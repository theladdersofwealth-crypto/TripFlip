// 평균가 계산 (순수 함수, node 로 시험 가능)
export const SUMMARY_DAYS = 14;

// 한 번 수집분: 도착 도시 × 출발월 최저가 → 날짜별 [합, 횟수]
export function mergeFlightAgg(agg, result) {
  agg ??= { snapshots: 0, dest: {} };
  agg.snapshots++;
  const add = (dest, month, price) => {
    const m = ((agg.dest[dest] ??= {})[month] ??= [0, 0]);
    m[0] += price; m[1]++;
  };
  const mins = {};
  for (const [month, rows] of Object.entries(result.world?.months ?? {})) {
    if (!Array.isArray(rows)) continue;
    for (const [dest, , , price] of rows) if (typeof price === "number" && price > 0) {
      const d = (mins[dest] ??= {});
      d[month] = Math.min(d[month] ?? Infinity, price);
    }
  }
  for (const route of Object.values(result.routes ?? {})) for (const [month, rows] of Object.entries(route.months ?? {})) {
    if (!Array.isArray(rows)) continue;
    for (const [dest, , , price] of rows) if (typeof price === "number" && price > 0) {
      const d = (mins[dest] ??= {});
      d[month] = Math.min(d[month] ?? Infinity, price);
    }
  }
  for (const [dest, ms] of Object.entries(mins)) for (const [month, price] of Object.entries(ms)) add(dest, month, price);
  return agg;
}
// 숙소 묶음: 숙소별 1박 최저가 [합, 횟수]
export function mergeHotelAgg(agg, rows) {
  agg ??= { batches: 0, hotels: {} };
  agg.batches++;
  for (const [region, key, , min] of rows) if (typeof min === "number" && min > 0) {
    const h = (agg.hotels[`${region}|${key}`] ??= [0, 0]);
    h[0] += min; h[1]++;
  }
  return agg;
}
export function buildSummary(flightDays, hotelDays, now, relaxed = [], relaxedLabel = "") {
  const f = {};
  let snapshots = 0;
  for (const a of flightDays) {
    snapshots += a.snapshots;
    for (const [dest, ms] of Object.entries(a.dest)) for (const [month, [sum, n]] of Object.entries(ms)) {
      const x = ((f[dest] ??= {})[month] ??= [0, 0]);
      x[0] += sum; x[1] += n;
    }
  }
  const thisMonth = now.toISOString().slice(0, 7);
  const flights = {};
  for (const [dest, ms] of Object.entries(f)) {
    const months = {};
    for (const [m, [sum, n]] of Object.entries(ms)) if (m >= thisMonth) months[m] = [Math.round(sum / n / 1000) * 1000, n];
    if (Object.keys(months).length) flights[dest] = months;
  }
  const h = {};
  let batches = 0;
  for (const a of hotelDays) {
    batches += a.batches;
    for (const [k, [sum, n]] of Object.entries(a.hotels)) {
      const x = (h[k] ??= [0, 0]);
      x[0] += sum; x[1] += n;
    }
  }
  const hotels = {};
  for (const [k, [sum, n]] of Object.entries(h)) {
    const region = k.split("|")[0];
    (hotels[region] ??= []).push([Math.round(sum / n), n]);
  }
  for (const list of Object.values(hotels)) list.sort((a, b) => a[0] - b[0]);
  return {
    v: 2,
    relaxed, // 숙소 기준을 낮춘 권역 id (앱이 알림)
    relaxedRule: relaxedLabel,
    updatedAt: now.toISOString(),
    windowDays: SUMMARY_DAYS,
    days: { flight: flightDays.length, hotel: hotelDays.length },
    source: { flight: "Travelpayouts 인천발 왕복 최저가(최근 48시간 검색 캐시), 수집 회차별 도착도시·출발월 최저가의 평균", hotel: "Xotelo 1박 최저가(USD, 체크인 14·30·60일 뒤), 숙소별 평균" },
    counts: { flightSnapshots: snapshots, hotelBatches: batches },
    flights, // 도착 도시코드 → { "YYYY-MM": [원, 표본수] }
    hotels, // 권역(시범 5곳은 NT·HK·OS·DN·PQ, 나머지는 권역 id) → [[USD, 표본수]] 숙소별 평균, 싼 순. 숙소 목록은 수집 때 4.5점·후기 300개 이상만 담음
  };
}
