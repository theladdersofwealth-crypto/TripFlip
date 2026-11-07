// POM 서버 (Vercel /api 대체, 2026-11-07 재작성) — 1단계: 캘린더 + 푸시
// 거래내역·문자·코인·주식은 아직 옛 Vercel 서버를 그대로 씀(PROXY_ORIGIN 으로 넘김)
import { DurableObject } from "cloudflare:workers";
import { sendPush, b64u } from "./webpush.js";

const PROXY_ORIGIN = "https://pom-path-of-money.vercel.app";
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const seoulDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const authed = (req, env) => !!env.POM_ACCESS_TOKEN && (req.headers.get("x-pom-token") || "") === env.POM_ACCESS_TOKEN;
const vapid = (env) => ({ publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK), subject: "mailto:ohysky0127@gmail.com" });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/calendar" || url.pathname === "/api/calendar-push") {
      if (url.pathname === "/api/calendar-push" && req.method === "GET") return json({ ok: true, publicKey: env.VAPID_PUBLIC_KEY });
      if (!authed(req, env)) return json({ ok: false, error: "unauthorized" }, 401);
      return env.STORE.get(env.STORE.idFromName("pom")).fetch(req);
    }
    if (url.pathname.startsWith("/api/")) {
      // 아직 안 옮긴 기능은 옛 서버로 그대로 전달
      const r = await fetch(PROXY_ORIGIN + url.pathname + url.search, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer() });
      return new Response(r.body, { status: r.status, headers: r.headers });
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx) {
    await env.STORE.get(env.STORE.idFromName("pom")).briefing();
  },
};

const CAT = new Set(["family", "work", "personal", "kids", "anniversary"]);
const REP = new Set(["none", "weekly", "monthly", "yearly"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
function clean(b) {
  const e = {
    title: String(b.title || "").trim().slice(0, 120), date: String(b.date || ""), endDate: String(b.endDate || ""),
    allDay: !!b.allDay, startTime: b.allDay ? "" : String(b.startTime || ""), endTime: b.allDay ? "" : String(b.endTime || ""),
    category: CAT.has(b.category) ? b.category : "family", repeat: REP.has(b.repeat) ? b.repeat : "none",
    location: String(b.location || "").trim().slice(0, 180), notes: String(b.notes || "").slice(0, 2000),
  };
  if (!e.title) return { error: "제목을 입력해 줘." };
  if (!DATE.test(e.date)) return { error: "날짜 형식이 맞지 않아." };
  if (e.endDate && (!DATE.test(e.endDate) || e.endDate < e.date)) return { error: "종료일이 시작일보다 빨라." };
  if (!e.allDay && (!TIME.test(e.startTime) || (e.endTime && !TIME.test(e.endTime)))) return { error: "시간 형식이 맞지 않아." };
  return { event: e };
}
function covers(e, date) {
  if (e.date > date) return false;
  if (e.repeat === "weekly") return new Date(e.date + "T12:00:00Z").getUTCDay() === new Date(date + "T12:00:00Z").getUTCDay();
  if (e.repeat === "monthly") return e.date.slice(8) === date.slice(8);
  if (e.repeat === "yearly") return e.date.slice(5) === date.slice(5);
  if (e.endDate) return date <= e.endDate;
  return e.date === date;
}
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export class Store extends DurableObject {
  async events() { return (await this.ctx.storage.get("events")) || []; }
  async subs() { return (await this.ctx.storage.get("subs")) || []; }
  async fetch(req) {
    const url = new URL(req.url);
    const st = this.ctx.storage;
    if (url.pathname === "/api/calendar") {
      let events = await this.events();
      if (req.method === "GET") return json({ ok: true, events });
      const b = await req.json().catch(() => ({}));
      if (req.method === "DELETE") {
        const n = events.length; events = events.filter((e) => e.id !== b.id);
        if (events.length === n) return json({ ok: false, error: "일정을 찾지 못했어." }, 404);
        await st.put("events", events); return json({ ok: true });
      }
      if (req.method === "PATCH" && Array.isArray(b.import)) {
        // 옛 서버 일정 가져오기(1회용): id 유지, 중복 id는 건너뜀
        const now = new Date().toISOString(); const have = new Set(events.map((e) => e.id)); let added = 0;
        for (const x of b.import) { const c2 = clean(x); if (c2.event && x.id && !have.has(x.id)) { events.push({ id: x.id, ...c2.event, createdAt: x.createdAt || now, updatedAt: x.updatedAt || now }); added++; } }
        await st.put("events", events); return json({ ok: true, added, total: events.length });
      }
      const c = clean(b);
      if (c.error) return json({ ok: false, error: c.error }, 400);
      const now = new Date().toISOString();
      if (req.method === "POST") {
        const e = { id: crypto.randomUUID(), ...c.event, createdAt: now, updatedAt: now };
        events.push(e); await st.put("events", events); return json({ ok: true, event: e });
      }
      if (req.method === "PUT") {
        const i = events.findIndex((e) => e.id === b.id);
        if (i < 0) return json({ ok: false, error: "일정을 찾지 못했어." }, 404);
        events[i] = { ...events[i], ...c.event, updatedAt: now }; await st.put("events", events); return json({ ok: true, event: events[i] });
      }
      return json({ ok: false, error: "method" }, 405);
    }
    // /api/calendar-push
    const b = await req.json().catch(() => ({}));
    const sub = b.subscription;
    let subs = await this.subs();
    const same = (s) => sub && s.endpoint === sub.endpoint;
    const meta = (await st.get("pushMeta")) || {};
    if (req.method === "DELETE") { await st.put("subs", subs.filter((s) => !same(s))); return json({ ok: true }); }
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return json({ ok: false, error: "bad_subscription" }, 400);
    if (b.action === "status") return json({ ok: true, registered: subs.some(same), ...meta });
    if (b.action === "test") {
      if (!subs.some(same)) return json({ ok: false, error: "device_not_registered" }, 404);
      const r = await sendPush(sub, { title: "POM 테스트 알림", body: "알림이 잘 와요 👍", tag: "pom-test" }, vapid(this.env));
      if (r.gone) { await st.put("subs", subs.filter((s) => !same(s))); return json({ ok: false, error: "device_subscription_expired" }, 410); }
      return json({ ok: r.ok, sent: r.ok, ...(r.ok ? {} : { error: "push_" + r.status }) }, r.ok ? 200 : 502);
    }
    subs = subs.filter((s) => !same(s)); subs.push({ endpoint: sub.endpoint, keys: sub.keys, at: new Date().toISOString() });
    await st.put("subs", subs.slice(-10));
    return json({ ok: true, registered: true });
  }
  // 매일 아침: 오늘~일요일 일정 요약을 등록된 기기로 보냄
  async briefing() {
    const subs = await this.subs();
    if (!subs.length) return;
    const events = await this.events();
    const today = seoulDay();
    const d0 = new Date(today + "T12:00:00Z");
    const left = (7 - d0.getUTCDay()) % 7; // 일요일까지
    const lines = [];
    for (let i = 0; i <= left; i++) {
      const day = new Date(d0.getTime() + i * 864e5).toISOString().slice(0, 10);
      for (const e of events.filter((x) => covers(x, day)).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "")))
        lines.push(`${i === 0 ? "오늘" : `${+day.slice(5, 7)}/${+day.slice(8)}(${DOW[new Date(day + "T12:00:00Z").getUTCDay()]})`} ${e.allDay ? "" : e.startTime + " "}${e.title}`);
    }
    const payload = { title: "POM 이번 주 일정", body: lines.length ? lines.slice(0, 12).join("\n") + (lines.length > 12 ? `\n외 ${lines.length - 12}건` : "") : "이번 주 남은 일정이 없어요.", tag: "pom-weekly" };
    let sent = 0, fail = 0; const keep = [];
    for (const s of subs) {
      const r = await sendPush(s, payload, vapid(this.env)).catch(() => ({ ok: false }));
      if (r.ok) sent++; else fail++;
      if (!r.gone) keep.push(s);
    }
    await this.ctx.storage.put("subs", keep);
    await this.ctx.storage.put("pushMeta", { lastAttemptDay: today, lastSentCount: sent, lastFailureCount: fail, ...(sent ? { lastSentDay: today } : {}) });
  }
}
