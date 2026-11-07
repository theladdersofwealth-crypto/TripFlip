// 나트랑플래너 가족 서버 (Vercel /api 대체, 2026-11-07 재작성)
// 상태는 Durable Object(SQLite, 무료) 한 곳에 JSON으로 저장. 세션은 쿠키 nts.
const SEED_MEMBERS = [
  { id: "admin", name: "오윤석", role: "admin" },
  { id: "father", name: "장인어른", role: "member" },
  { id: "mother", name: "장모님", role: "member" },
  { id: "wife", name: "박세영", role: "member" },
];
// 옛 Vercel 서버에서 2026-11-07에 받아온 게시본 v1 (백업 JSON이 오면 그걸로 교체)
const SEED_PLAN = [["출국 준비", "식사/공항", "KE467 인천 출발", "아미아나 체크인"], ["아미아나 수영", "Ăn Thôi Nha Trang", "롯데마트 본점", "Ngoc Trai Seafood Restaurant"], ["선택 필요", "식당 추천 필요", "선택 필요", "식당 추천 필요"], ["선택 필요", "식당 추천 필요", "선택 필요", "식당 추천 필요"], ["선택 필요", "식당 추천 필요", "선택 필요", "식당 추천 필요"], ["선택 필요", "식당 추천 필요", "선택 필요", "식당 추천 필요"], ["근거리 한 곳", "식당 추천 필요", "깜란 휴식호텔", "식당 추천 필요"], ["인천 도착", "-", "-", "-"]];
const MAX_FAIL = 5, LOCK_MS = 15 * 60e3, SESSION_MS = 180 * 864e5;
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const rand = (n = 16) => hex(crypto.getRandomValues(new Uint8Array(n)));
async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 50000 }, key, 256));
}
const validPin = (p) => typeof p === "string" && /^\d{4,6}$/.test(p);
const BAD = /[<>&"']/;

async function load(store) {
  const row = await store.get("state");
  if (row) {
    for (const m of SEED_MEMBERS) if (row.users?.[m.id]) row.users[m.id].name = m.name;
    return row;
  }
  const users = {};
  for (const m of SEED_MEMBERS) {
    const salt = rand();
    users[m.id] = { ...m, nickname: "", emoji: "", salt, pinHash: await hashPin("0000", salt), mustChange: true, fail: 0, lockUntil: 0 };
  }
  const at = "2026-11-06T16:50:47.050Z";
  return { version: 1, plan: SEED_PLAN, updatedAt: at, users, sessions: {}, requests: [], versions: [{ version: 1, note: "옛 서버에서 이전", by: "admin", at, plan: SEED_PLAN }], nextId: 1 };
}
const save = (store, s) => store.put("state", s);

const pubUser = (u) => ({ id: u.id, name: u.name, nickname: u.nickname || "", emoji: u.emoji || "", label: u.nickname ? `${u.emoji ? u.emoji + " " : ""}${u.nickname} (${u.name})` : u.name });
const meOf = (u) => u && { ...pubUser(u), role: u.role, mustChange: !!u.mustChange };
const isPlan = (p) => Array.isArray(p) && p.length > 0 && p.length <= 31 && p.every((d) => Array.isArray(d) && d.length === 4 && d.every((v) => typeof v === "string" && v.length <= 120));
const validChanges = (cs, plan) => Array.isArray(cs) && cs.length > 0 && cs.length <= 64 && cs.every((c) => Number.isInteger(c.day) && Number.isInteger(c.slot) && c.slot >= 0 && c.slot < 4 && c.day >= 0 && (!plan || c.day < plan.length) && typeof c.to === "string" && c.to.length <= 120);

function publish(s, plan, note, by) {
  s.version += 1;
  s.plan = plan;
  s.updatedAt = new Date().toISOString();
  s.versions.unshift({ version: s.version, note: String(note || "").slice(0, 100), by, at: s.updatedAt, plan });
  s.versions = s.versions.slice(0, 50);
  return s.version;
}
function applyChanges(plan, changes) {
  const p = plan.map((d) => d.slice());
  for (const c of changes) p[c.day][c.slot] = c.to;
  return p;
}

import { DurableObject } from "cloudflare:workers";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/api") return env.ASSETS.fetch(req);
    return env.FAMILY.get(env.FAMILY.idFromName("family")).fetch(req);
  },
};

// 가족 상태 하나를 한 곳에서 순서대로 처리(동시 수정 충돌 방지)
export class Family extends DurableObject {
  async fetch(req) {
    const store = this.ctx.storage;
    const json = (v, status = 200, cookie) => {
      const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
      if (cookie !== undefined) h["set-cookie"] = cookie;
      return new Response(JSON.stringify(v), { status, headers: h });
    };
    const s = await load(store);
    const now = Date.now();
    for (const [k, v] of Object.entries(s.sessions)) if (v.exp < now) delete s.sessions[k];
    const sid = (req.headers.get("cookie") || "").match(/(?:^|;\s*)nts=([a-f0-9]+)/)?.[1];
    const me = sid && s.sessions[sid] ? s.users[s.sessions[sid].user] : null;

    if (req.method === "GET") return json({ version: s.version, plan: s.plan, updatedAt: s.updatedAt, me: meOf(me), members: Object.values(s.users).map(pubUser) });
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const b = await req.json().catch(() => ({}));
    const a = b.action;
    const done = async (v, status = 200, cookie) => { await save(store, s); return json(v, status, cookie); };

    if (a === "login") {
      const u = s.users[b.user];
      if (!u || !validPin(b.pin)) return json({ error: "bad_input" }, 400);
      if (u.lockUntil > now) return json({ error: "locked", retryAfterSec: Math.ceil((u.lockUntil - now) / 1000) }, 429);
      if ((await hashPin(b.pin, u.salt)) !== u.pinHash) {
        u.fail = (u.fail || 0) + 1;
        if (u.fail >= MAX_FAIL) { u.fail = 0; u.lockUntil = now + LOCK_MS; return done({ error: "locked", retryAfterSec: LOCK_MS / 1000 }, 429); }
        return done({ error: "wrong_pin", remaining: MAX_FAIL - u.fail }, 401);
      }
      u.fail = 0; u.lockUntil = 0;
      const id = rand(24);
      s.sessions[id] = { user: u.id, exp: now + SESSION_MS };
      return done({ ok: true, me: meOf(u) }, 200, `nts=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`);
    }
    if (a === "logout") {
      if (sid) delete s.sessions[sid];
      return done({ ok: true }, 200, "nts=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    }
    if (!me) return json({ error: "login_required" }, 401);
    if (a === "changepin") {
      if (!validPin(b.pin) || b.pin === "0000") return json({ error: "bad_pin" }, 400);
      me.salt = rand(); me.pinHash = await hashPin(b.pin, me.salt); me.mustChange = false;
      return done({ ok: true, me: meOf(me) });
    }
    if (me.mustChange) return json({ error: "must_change_pin" }, 403);
    if (a === "profile") {
      const nick = String(b.nickname || "").trim().slice(0, 12), emo = String(b.emoji || "").trim().slice(0, 4);
      if (BAD.test(nick) || BAD.test(emo)) return json({ error: "bad_input" }, 400);
      me.nickname = nick; me.emoji = emo;
      return done({ ok: true, me: meOf(me) });
    }
    const admin = me.role === "admin";
    const names = Object.fromEntries(Object.values(s.users).map((u) => [u.id, pubUser(u).label]));
    const withConflicts = (q) => q.status !== "pending" || !s.plan ? q : { ...q, conflicts: q.changes.filter((c) => s.plan[c.day]?.[c.slot] !== c.from).length || 0 };
    if (a === "requests") return json({ ok: true, requests: s.requests.filter((q) => admin || q.userId === me.id).map(withConflicts), names });
    if (a === "history") return json({ ok: true, versions: s.versions.map(({ plan, ...v }) => v) });
    if (a === "submit") {
      if (!s.version) return json({ error: "no_published_schedule" }, 409);
      if (!validChanges(b.changes, s.plan)) return json({ error: "bad_changes" }, 400);
      const changes = b.changes.map((c) => ({ day: c.day, slot: c.slot, from: s.plan[c.day][c.slot], to: c.to }));
      const id = s.nextId++;
      s.requests.unshift({ id, userId: me.id, status: "pending", baseVersion: s.version, changes, memo: String(b.memo || "").slice(0, 200), createdAt: new Date().toISOString() });
      return done({ ok: true, id, pending: true, requestId: id });
    }
    if (a === "simulation_commit") {
      if (!validChanges(b.changes)) return json({ error: "bad_changes" }, 400);
      let base = s.plan;
      if (!s.version) {
        if (!admin || !isPlan(b.seedPlan)) return json({ error: "no_published_schedule" }, 409);
        base = b.seedPlan;
      }
      if (b.changes.some((c) => !base[c.day] || base[c.day][c.slot] !== c.from)) return json({ error: "stale_schedule" }, 409);
      const memo = String(b.memo || "").slice(0, 200);
      if (admin) return done({ ok: true, version: publish(s, applyChanges(base, b.changes), memo, me.id) });
      const id = s.nextId++;
      s.requests.unshift({ id, userId: me.id, status: "pending", baseVersion: s.version, changes: b.changes.map(({ day, slot, from, to }) => ({ day, slot, from, to })), memo, createdAt: new Date().toISOString() });
      return done({ ok: true, pending: true, requestId: id, id });
    }
    if (!admin) return json({ error: "admin_only" }, 403);
    if (a === "publish") {
      if (!isPlan(b.plan)) return json({ error: "bad_plan" }, 400);
      return done({ ok: true, version: publish(s, b.plan, b.note, me.id) });
    }
    if (a === "decide") {
      const q = s.requests.find((x) => x.id === b.id && x.status === "pending");
      if (!q) return json({ error: "not_found" }, 404);
      q.adminNote = String(b.note || "").slice(0, 200);
      q.decidedAt = new Date().toISOString();
      if (b.decision === "reject") { q.status = "rejected"; return done({ ok: true }); }
      let final = q.changes;
      if (Array.isArray(b.changes)) {
        if (!validChanges(b.changes, s.plan)) return json({ error: "bad_changes" }, 400);
        final = b.changes.map((c) => ({ day: c.day, slot: c.slot, from: s.plan?.[c.day]?.[c.slot] ?? "", to: c.to }));
        const edited = final.some((c, i) => c.to !== q.changes[i]?.to);
        q.status = edited ? "approved_with_edits" : "approved";
        if (edited) q.finalChanges = final;
      } else q.status = "approved";
      q.resultVersion = publish(s, applyChanges(s.plan, final), `요청 #${q.id} 승인`, me.id);
      return done({ ok: true, version: q.resultVersion });
    }
    if (a === "resetpin") {
      const u = s.users[b.user];
      if (!u || u.role === "admin") return json({ error: "bad_input" }, 400);
      u.salt = rand(); u.pinHash = await hashPin("0000", u.salt); u.mustChange = true; u.fail = 0; u.lockUntil = 0;
      for (const [k, v] of Object.entries(s.sessions)) if (v.user === u.id) delete s.sessions[k];
      return done({ ok: true });
    }
    if (a === "backup") {
      const { sessions, ...rest } = s;
      return json({ exportedAt: new Date().toISOString(), ...rest, users: Object.fromEntries(Object.entries(s.users).map(([k, u]) => [k, { ...pubUser(u), role: u.role }])) });
    }
    return json({ error: "unknown_action" }, 400);
  }
}
