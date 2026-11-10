// tripflip-stats: 익명 사용 흐름 집계.
//  POST /e      {v, s, r?}  ← 앱(sendBeacon, text/plain). v=기기 무작위 번호, s=단계, r=권역 id
//  GET  /stats?days=30      ← 관리자 페이지 (Authorization: Bearer ADMIN_KEY)
import { DurableObject } from "cloudflare:workers";

import { STEPS, KEEP_DAYS, kstDay, parseEvent } from "./lib.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const stub = env.STATS.get(env.STATS.idFromName("main"));

    if (url.pathname === "/e" && req.method === "POST") {
      const text = (await req.text()).slice(0, 500);
      const e = parseEvent(text);
      if (!e) return json({ ok: false }, 400);
      // 자동 프로그램(검색 로봇 등)은 세지 않음
      const ua = req.headers.get("user-agent") || "";
      if (/bot|crawl|spider|headless|lighthouse/i.test(ua)) return json({ ok: true, skipped: true });
      await stub.record(kstDay(), e.v, e.s, e.r);
      return json({ ok: true });
    }

    if (url.pathname === "/stats" && req.method === "GET") {
      const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!env.ADMIN_KEY || !safeEqual(auth, env.ADMIN_KEY)) return json({ ok: false, error: "unauthorized" }, 401);
      const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1), 365);
      return json(await stub.stats(days));
    }

    return json({ ok: true, service: "tripflip-stats" });
  },
};

export class Stats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hits (day TEXT NOT NULL, vid TEXT NOT NULL, step TEXT NOT NULL, region TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (day, vid, step, region))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS visitors (vid TEXT PRIMARY KEY, first_day TEXT NOT NULL)`);
  }

  async record(day, vid, step, region) {
    this.sql.exec(`INSERT INTO hits (day, vid, step, region) VALUES (?, ?, ?, ?) ON CONFLICT (day, vid, step, region) DO UPDATE SET n = n + 1`, day, vid, step, region);
    this.sql.exec(`INSERT OR IGNORE INTO visitors (vid, first_day) VALUES (?, ?)`, vid, day);
    // 하루 한 번쯤 오래된 기록 정리
    if (Math.random() < 0.01) {
      const cut = kstDay(Date.now() - KEEP_DAYS * 86400000);
      this.sql.exec(`DELETE FROM hits WHERE day < ?`, cut);
    }
  }

  async stats(days) {
    const today = kstDay();
    const from = kstDay(Date.now() - (days - 1) * 86400000);
    const rows = (q, ...a) => this.sql.exec(q, ...a).toArray();

    // 날짜별: 방문자(고유 기기), 화면 조회수(visit 횟수), 신규 방문자, 단계별 고유 기기
    const daily = rows(`SELECT day, COUNT(DISTINCT vid) AS visitors, SUM(CASE WHEN step = 'visit' THEN n ELSE 0 END) AS views FROM hits WHERE day >= ? GROUP BY day`, from);
    const newBy = rows(`SELECT first_day AS day, COUNT(*) AS c FROM visitors WHERE first_day >= ? GROUP BY first_day`, from);
    const stepDaily = rows(`SELECT day, step, COUNT(DISTINCT vid) AS c FROM hits WHERE day >= ? GROUP BY day, step`, from);
    const byDay = new Map();
    for (let t = Date.parse(from + "T00:00:00Z"); ; t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10);
      byDay.set(d, { day: d, visitors: 0, views: 0, newVisitors: 0, steps: {} });
      if (d >= today) break;
    }
    for (const r of daily) Object.assign(byDay.get(r.day) ?? {}, { visitors: r.visitors, views: r.views });
    for (const r of newBy) if (byDay.has(r.day)) byDay.get(r.day).newVisitors = r.c;
    for (const r of stepDaily) if (byDay.has(r.day)) byDay.get(r.day).steps[r.step] = r.c;

    // 기간 전체 퍼널: 단계별 고유 기기 수 (항공·숙소 링크는 '예약처 이동'으로 합침)
    const funnelRows = rows(`SELECT step, COUNT(DISTINCT vid) AS c FROM hits WHERE day >= ? GROUP BY step`, from);
    const funnel = Object.fromEntries(STEPS.map((s) => [s, 0]));
    for (const r of funnelRows) funnel[r.step] = r.c;
    funnel.outbound = rows(`SELECT COUNT(DISTINCT vid) AS c FROM hits WHERE day >= ? AND step IN ('flight','hotel')`, from)[0]?.c ?? 0;

    // 권역별: 상세 본 기기, 예약처 이동, 저장
    const regionRows = rows(`SELECT region, step, COUNT(DISTINCT vid) AS c FROM hits WHERE day >= ? AND region != '' AND step IN ('region','book','flight','hotel','save') GROUP BY region, step`, from);
    const regions = new Map();
    for (const r of regionRows) {
      const x = regions.get(r.region) ?? { region: r.region, views: 0, book: 0, flight: 0, hotel: 0, save: 0 };
      x[r.step === "region" ? "views" : r.step] = r.c;
      regions.set(r.region, x);
    }

    const total = rows(`SELECT COUNT(*) AS c FROM visitors`)[0]?.c ?? 0;
    return {
      ok: true,
      today,
      from,
      days,
      totalVisitors: total,
      periodVisitors: funnel.visit,
      daily: [...byDay.values()],
      funnel,
      regions: [...regions.values()].sort((a, b) => b.views - a.views).slice(0, 30),
    };
  }
}
