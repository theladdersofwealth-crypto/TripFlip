// tripflip-stats: 사용 흐름 집계 + 간편 회원.
//  POST /e      {v, s, r?, p?, g?}  ← 앱(sendBeacon, text/plain). v=기기 무작위 번호, s=단계, r=권역 id, p=화면 주소
//  GET  /stats?days=30          ← 관리자 페이지 (Authorization: Bearer ADMIN_KEY)
//  POST /logout {token}
//  POST /me     {token}         → {nick}
//  POST /plans  {token, put?, del?} → {plans}  로그인 회원의 '내 여행'(저장 계획) 합치기·내려받기
//  GET  /users, GET /user?id=, DELETE /user?id=   ← 관리자
// HIDE_NICKS(wrangler.toml)에 적은 회원과 그 회원이 로그인했던 기기는 /stats·/users 집계와 목록에서 빠진다(기록은 지우지 않음).
import { DurableObject } from "cloudflare:workers";

import { PLANS_BODY_MAX, PLAN_MAX, PLANS_PER_USER, planOk } from "./lib.js";
import { hiddenNickKeys } from "./lib.js";
import { validIdentity, resolveIdentity } from "./oauth.js";
import { KEEP_DAYS, kstDay, parseEvent, sha256, randomHex } from "./lib.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
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
      await stub.record(kstDay(), e.v, e.s, e.r, e.p ?? "", e.g);
      return json({ ok: true });
    }

    // 회원: 앱에서 JSON 본문으로. IP는 잠깐 횟수 제한에만 쓰고 저장하지 않는다.
    const ip = req.headers.get("cf-connecting-ip") || "";
    if (req.method === "POST" && ["/logout", "/me", "/plans"].includes(url.pathname)) {
      const text = await req.text();
      const max = url.pathname === "/plans" ? PLANS_BODY_MAX : 2000;
      if (text.length > max) return json({ ok: false, error: "저장할 내용이 너무 커요." }, 413);
      let b;
      try { b = JSON.parse(text); } catch { return json({ ok: false, error: "잘못된 요청이에요." }, 400); }
      if (!b || typeof b !== "object") return json({ ok: false, error: "잘못된 요청이에요." }, 400);
      const r = await stub[url.pathname.slice(1)](b, ip);
      return json(r, r.status ?? (r.ok ? 200 : 400));
    }

    const isAdmin = () => {
      const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      return !!env.ADMIN_KEY && safeEqual(auth, env.ADMIN_KEY);
    };
    if (["/stats", "/users", "/user"].includes(url.pathname) && !isAdmin()) return json({ ok: false, error: "unauthorized" }, 401);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1), 365);
    if (url.pathname === "/stats" && req.method === "GET") return json(await stub.stats(days));
    if (url.pathname === "/users" && req.method === "GET") return json(await stub.users(days));
    if (url.pathname === "/user") {
      const id = url.searchParams.get("id") || "";
      if (!/^[a-f0-9]{16}$/.test(id)) return json({ ok: false, error: "bad id" }, 400);
      if (req.method === "GET") return json(await stub.user(id));
      if (req.method === "DELETE") return json(await stub.deleteUser(id));
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
    // 개인·기기별 지역 선택은 저장하지 않음. 일별·지역별 검색 횟수 합계만.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS search_areas (day TEXT NOT NULL, area TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (day, area))`);
    // 회원
    this.sql.exec(`CREATE TABLE IF NOT EXISTS social_users (uid TEXT PRIMARY KEY, nick TEXT NOT NULL, created INTEGER NOT NULL)`);
    // Provider subject is a one-way hash; only verified email and name are stored as profile data.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS social_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, uid TEXT NOT NULL, email TEXT, email_verified INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, PRIMARY KEY(provider,subject), UNIQUE(provider,uid))`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS social_email ON social_identities(email,email_verified)`);
    this.storage = ctx.storage;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (tok TEXT PRIMARY KEY, uid TEXT NOT NULL, vid TEXT NOT NULL, created INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS devices (vid TEXT PRIMARY KEY, uid TEXT NOT NULL, since INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, day TEXT NOT NULL, uid TEXT NOT NULL, vid TEXT NOT NULL, step TEXT NOT NULL, region TEXT NOT NULL DEFAULT '', path TEXT NOT NULL DEFAULT '')`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS log_uid ON log (uid, ts)`);
    // 회원의 '내 여행'. 지운 건 deleted=1로 남겨 다른 기기가 다시 올려도 살아나지 않게
    this.sql.exec(`CREATE TABLE IF NOT EXISTS plans (uid TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uid, id))`);
    this.ipHits = new Map(); // 메모리에만: IP별 최근 시도 수 (저장 안 함)
    // 통계에서 뺄 기기: 숨긴 회원이 한 번이라도 로그인한 기기(로그아웃해도 이용 기록에 남은 기기는 계속 뺀다)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hidden_vids (vid TEXT PRIMARY KEY)`);
    this.hiddenKeys = hiddenNickKeys(env.HIDE_NICKS);
  }

  /** 숨긴 회원 uid 목록 (닉네임 기준) */
  hiddenUids() {
    if (!this.hiddenKeys.length) return [];
    return this.sql.exec(`SELECT uid FROM social_users WHERE lower(trim(nick)) IN (${this.hiddenKeys.map(() => "?").join(",")})`, ...this.hiddenKeys).toArray().map((r) => r.uid);
  }

  /** 숨긴 회원이 쓴 기기를 hidden_vids에 모은다(지난 기록 포함). 집계 전에 부른다 */
  syncHidden() {
    const uids = this.hiddenUids();
    this.sql.exec(`DELETE FROM hidden_vids`); // 목록에서 뺀 회원은 다시 보이게 매번 새로 만든다
    for (const uid of uids) {
      for (const t of ["devices", "sessions", "log"]) this.sql.exec(`INSERT OR IGNORE INTO hidden_vids (vid) SELECT DISTINCT vid FROM ${t} WHERE uid = ?`, uid);
    }
    return uids;
  }

  /** IP당 1시간 limit번까지. 넘으면 true */
  throttled(kind, ip, limit) {
    if (!ip) return false;
    const k = kind + ip, now = Date.now();
    const h = this.ipHits.get(k);
    if (!h || now - h.t > 3600000) { this.ipHits.set(k, { n: 1, t: now }); return false; }
    if (this.ipHits.size > 5000) this.ipHits.clear();
    return ++h.n > limit;
  }

  async record(day, vid, step, region, path = "", areas) {
    this.sql.exec(`INSERT INTO hits (day, vid, step, region) VALUES (?, ?, ?, ?) ON CONFLICT (day, vid, step, region) DO UPDATE SET n = n + 1`, day, vid, step, region);
    this.sql.exec(`INSERT OR IGNORE INTO visitors (vid, first_day) VALUES (?, ?)`, vid, day);
    // 로그인한 기기면 계정 이용 기록에 남김
    const uid = this.sql.exec(`SELECT uid FROM devices WHERE vid = ?`, vid).toArray()[0]?.uid;
    if (uid) this.sql.exec(`INSERT INTO log (ts, day, uid, vid, step, region, path) VALUES (?, ?, ?, ?, ?, ?, ?)`, Date.now(), day, uid, vid, step, region, path);
    // 지역 선택은 회원 로그와 hits의 region/path에 쓰지 않는다.
    // 기존 관리자 제외 조건을 수신 시점에 적용. 합계만 남으므로 개인별 소급 삭제는 불가능.
    if (step === "search" && Array.isArray(areas)) {
      if (this.hiddenKeys.length) this.syncHidden();
      const hidden = this.sql.exec(`SELECT 1 FROM hidden_vids WHERE vid = ?`, vid).toArray().length > 0;
      if (!hidden) for (const area of areas.length ? areas : ["all"]) {
        this.sql.exec(`INSERT INTO search_areas (day, area) VALUES (?, ?) ON CONFLICT (day, area) DO UPDATE SET n = n + 1`, day, area);
      }
    }
    // 하루 한 번쯤 오래된 기록 정리
    if (Math.random() < 0.01) {
      const cut = kstDay(Date.now() - KEEP_DAYS * 86400000);
      this.sql.exec(`DELETE FROM hits WHERE day < ?`, cut);
      this.sql.exec(`DELETE FROM log WHERE day < ?`, cut);
      this.sql.exec(`DELETE FROM search_areas WHERE day < ?`, cut);
    }
  }

  // Only accessible through the cross-Worker Durable Object binding, not the public HTTP route.
  async oauthStart(intent, token, v, ip) {
    if (!/^[a-z0-9]{8,32}$/.test(v) || this.throttled("oauth", ip, 30)) return { ok: false };
    if (intent === "login" && token == null) return { ok: true };
    if (intent !== "withdraw") return { ok: false };
    const session = await this.sessionOf(token);
    if (!session || session.vid !== v) return { ok: false };
    return { ok: true, sessionHash: session.tok };
  }

  async oauthAccount(profile, intent, token, expectedHash, v) {
    const fail = { ok: false, error: "소셜 계정을 확인할 수 없어요. 다른 계정 또는 연결된 소셜 공급자로 다시 시도해 주세요." };
    if (!validIdentity(profile) || !/^[a-z0-9]{8,32}$/.test(v)) return fail;
    if (intent === "login" ? token != null || expectedHash != null : intent !== "withdraw" || typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token) || !expectedHash) return fail;
    const tokenHash = token ? await sha256(token) : null;
    if (tokenHash !== expectedHash) return fail;
    const subject = await sha256(profile.provider + ":" + profile.subject);
    const freshToken = randomHex(24), freshHash = await sha256(freshToken);
    // Same database transaction for identity resolution, user creation/link and session creation.
    return this.storage.transactionSync(() => {
      const session = tokenHash ? this.sql.exec(`SELECT s.uid FROM sessions s JOIN social_users u ON u.uid=s.uid WHERE s.tok=? AND s.vid=?`, tokenHash, v).toArray()[0] : null;
      if (tokenHash && !session) return fail;
      const bySubject = this.sql.exec(`SELECT uid FROM social_identities WHERE provider=? AND subject=?`, profile.provider, subject).toArray()[0];
      const emailUids = profile.emailVerified && profile.email ? this.sql.exec(`SELECT DISTINCT uid FROM social_identities WHERE email=? AND email_verified=1`, profile.email).toArray().map(x=>x.uid) : [];
      const existingProvider = emailUids.length===1 && !!this.sql.exec(`SELECT 1 FROM social_identities WHERE provider=? AND uid=?`,profile.provider,emailUids[0]).toArray().length;
      const decision = resolveIdentity({intent,currentUid:session?.uid,subjectUid:bySubject?.uid,emailUids,existingProvider});
      if(!decision) return fail;
      if(intent==="withdraw"){this.eraseUser(decision.uid);return {ok:true,withdrawn:true};}
      const uid=decision.create?randomHex(8):decision.uid;
      if(decision.create) this.sql.exec(`INSERT INTO social_users(uid,nick,created) VALUES(?,?,?)`,uid,profile.name,Date.now());
      if(!this.sql.exec(`SELECT uid FROM social_users WHERE uid=?`,uid).toArray().length) throw Error("missing account");
      const verified=profile.emailVerified && !emailUids.some(x=>x!==uid);
      this.sql.exec(`INSERT INTO social_identities(provider,subject,uid,email,email_verified,name) VALUES(?,?,?,?,?,?) ON CONFLICT(provider,subject) DO UPDATE SET email=excluded.email,email_verified=excluded.email_verified,name=excluded.name`,profile.provider,subject,uid,profile.email,Number(verified),profile.name);
      const nick=profile.name;
      this.sql.exec(`UPDATE social_users SET nick=? WHERE uid=?`,nick,uid);
      this.sql.exec(`INSERT INTO sessions(tok,uid,vid,created) VALUES(?,?,?,?)`, freshHash, uid, v, Date.now());
      this.sql.exec(`INSERT INTO devices(vid,uid,since) VALUES(?,?,?) ON CONFLICT(vid) DO UPDATE SET uid=excluded.uid,since=excluded.since`, v, uid, Date.now());
      return { ok: true, uid, nick, token: freshToken };
    });
  }

  async sessionOf(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token)) return null;
    return this.sql.exec(`SELECT s.tok, s.uid, s.vid, u.nick FROM sessions s JOIN social_users u ON u.uid = s.uid WHERE s.tok = ?`, await sha256(token)).toArray()[0] ?? null;
  }

  async me(b) {
    const s = await this.sessionOf(b.token);
    if (!s) return { ok: false, error: "로그인이 풀렸어요.", status: 401 };
    // 이 기기가 다른 계정에 묶였으면 다시 이 계정으로
    this.sql.exec(`INSERT INTO devices (vid, uid, since) VALUES (?, ?, ?) ON CONFLICT (vid) DO UPDATE SET uid = excluded.uid`, s.vid, s.uid, Date.now());
    return { ok: true, nick: s.nick, uid: s.uid };
  }

  async logout(b) {
    const s = await this.sessionOf(b.token);
    if (s) {
      this.sql.exec(`DELETE FROM sessions WHERE tok = ?`, s.tok);
      this.sql.exec(`DELETE FROM devices WHERE vid = ? AND uid = ?`, s.vid, s.uid);
    }
    return { ok: true };
  }

  // 항목별 결과를 돌려준다: saved(저장 확인) · deleted(삭제 확인) · gone(다른 기기에서 이미 지움) · rejected(거절, 사유)
  // 목록에 없는 id는 처리 안 된 것 → 앱은 '동기화 대기'로 남긴다.
  async plans(b) {
    const s = await this.sessionOf(b.token);
    if (!s) return { ok: false, error: "로그인이 풀렸어요.", status: 401 };
    const now = Date.now();
    const saved = [], deleted = [], gone = [], rejected = [];
    for (const id of Array.isArray(b.del) ? b.del.slice(0, 200) : []) {
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) continue;
      this.sql.exec(`INSERT INTO plans (uid, id, data, updated, deleted) VALUES (?, ?, '', ?, 1) ON CONFLICT (uid, id) DO UPDATE SET data = '', updated = excluded.updated, deleted = 1`, s.uid, id, now);
      deleted.push(id);
    }
    let live = this.sql.exec(`SELECT COUNT(*) AS c FROM plans WHERE uid = ? AND deleted = 0`, s.uid).toArray()[0].c;
    for (const p of Array.isArray(b.put) ? b.put.slice(0, PLANS_PER_USER) : []) {
      if (!planOk(p)) { if (p && typeof p.id === "string") rejected.push({ id: p.id, error: "형식이 맞지 않아요" }); continue; }
      const data = JSON.stringify(p);
      if (data.length > PLAN_MAX) { rejected.push({ id: p.id, error: "일정이 너무 커요" }); continue; }
      const cur = this.sql.exec(`SELECT deleted FROM plans WHERE uid = ? AND id = ?`, s.uid, p.id).toArray()[0];
      if (cur?.deleted) { gone.push(p.id); continue; } // 다른 기기에서 지운 여행은 되살리지 않음
      if (!cur && live >= PLANS_PER_USER) { rejected.push({ id: p.id, error: `계정당 ${PLANS_PER_USER}개까지 저장돼요` }); continue; }
      if (!cur) live++;
      this.sql.exec(`INSERT INTO plans (uid, id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT (uid, id) DO UPDATE SET data = excluded.data, updated = excluded.updated`, s.uid, p.id, data, now);
      saved.push(p.id);
    }
    const plans = this.sql.exec(`SELECT data FROM plans WHERE uid = ? AND deleted = 0 ORDER BY updated DESC`, s.uid).toArray().map((r) => JSON.parse(r.data));
    return { ok: true, uid: s.uid, plans, saved, deleted, gone, rejected };
  }

  async users(days) {
    const hidden = new Set(this.syncHidden());
    const from = kstDay(Date.now() - (days - 1) * 86400000);
    const rows = (q, ...a) => this.sql.exec(q, ...a).toArray();
    const all = rows(`SELECT u.uid, u.nick, u.created, MAX(l.ts) AS last,
        COUNT(CASE WHEN l.step = 'visit' THEN 1 END) AS visitsAll,
        COUNT(DISTINCT l.day) AS daysAll
      FROM social_users u LEFT JOIN log l ON l.uid = u.uid GROUP BY u.uid`);
    const period = new Map(rows(`SELECT uid,
        COUNT(CASE WHEN step = 'visit' THEN 1 END) AS visits,
        COUNT(DISTINCT day) AS days,
        COUNT(DISTINCT CASE WHEN step IN ('region','day') THEN region END) AS regions,
        COUNT(CASE WHEN step = 'flight' THEN 1 END) AS flight,
        COUNT(CASE WHEN step = 'hotel' THEN 1 END) AS hotel,
        COUNT(CASE WHEN step = 'save' THEN 1 END) AS save
      FROM log WHERE day >= ? GROUP BY uid`, from).map((r) => [r.uid, r]));
    const list = all.map((u) => {
      const p = period.get(u.uid) ?? { visits: 0, days: 0, regions: 0, flight: 0, hotel: 0, save: 0 };
      return { ...u, last: u.last ?? null, visits: p.visits, days: p.days, regions: p.regions, flight: p.flight, hotel: p.hotel, save: p.save };
    }).filter((u) => !hidden.has(u.uid)).sort((a, b) => (b.last ?? b.created) - (a.last ?? a.created));
    return { ok: true, days, from, users: list };
  }

  async user(uid) {
    const rows = (q, ...a) => this.sql.exec(q, ...a).toArray();
    const u = rows(`SELECT uid, nick, created FROM social_users WHERE uid = ?`, uid)[0];
    if (!u) return { ok: false, error: "없는 계정", status: 404 };
    const regions = rows(`SELECT region,
        COUNT(CASE WHEN step IN ('region','day') THEN 1 END) AS views,
        COUNT(CASE WHEN step = 'book' THEN 1 END) AS book,
        COUNT(CASE WHEN step = 'flight' THEN 1 END) AS flight,
        COUNT(CASE WHEN step = 'hotel' THEN 1 END) AS hotel,
        COUNT(CASE WHEN step = 'save' THEN 1 END) AS save,
        MAX(ts) AS last
      FROM log WHERE uid = ? AND region != '' GROUP BY region ORDER BY views DESC, last DESC LIMIT 50`, uid);
    const daily = rows(`SELECT day, COUNT(CASE WHEN step = 'visit' THEN 1 END) AS visits FROM log WHERE uid = ? GROUP BY day ORDER BY day DESC LIMIT 60`, uid);
    const recent = rows(`SELECT ts, step, region, path FROM log WHERE uid = ? AND step IN ('visit','search','flight','hotel','save') ORDER BY ts DESC LIMIT 150`, uid);
    const devices = rows(`SELECT COUNT(*) AS c FROM devices WHERE uid = ?`, uid)[0]?.c ?? 0;
    const saved = rows(`SELECT data FROM plans WHERE uid = ? AND deleted = 0 ORDER BY updated DESC LIMIT 50`, uid).map((r) => { const p = JSON.parse(r.data); return { regionId: p.regionId, regionName: p.regionName, createdAt: p.createdAt, start: p.query?.startDate ?? null, end: p.query?.endDate ?? null }; });
    return { ok: true, user: u, devices, regions, daily, recent, saved };
  }

  eraseUser(uid) {
    for (const t of ["social_identities", "log", "plans", "sessions", "devices", "social_users"]) this.sql.exec(`DELETE FROM ${t} WHERE uid = ?`, uid);
  }
  async deleteUser(uid) {
    this.storage.transactionSync(() => this.eraseUser(uid));
    return { ok: true };
  }

  async stats(days) {
    const hidden = this.syncHidden();
    const today = kstDay();
    const from = kstDay(Date.now() - (days - 1) * 86400000);
    const rows = (q, ...a) => this.sql.exec(q, ...a).toArray();

    // 날짜별: 방문자(고유 기기), 화면 조회수(visit 횟수), 신규 방문자, 단계별 고유 기기
    const daily = rows(`SELECT day, COUNT(DISTINCT vid) AS visitors, SUM(CASE WHEN step = 'visit' THEN n ELSE 0 END) AS views FROM hits WHERE vid NOT IN (SELECT vid FROM hidden_vids) AND day >= ? GROUP BY day`, from);
    const newBy = rows(`SELECT first_day AS day, COUNT(*) AS c FROM visitors WHERE vid NOT IN (SELECT vid FROM hidden_vids) AND first_day >= ? GROUP BY first_day`, from);
    const stepDaily = rows(`SELECT day, step, COUNT(DISTINCT vid) AS c FROM hits WHERE vid NOT IN (SELECT vid FROM hidden_vids) AND day >= ? GROUP BY day, step`, from);
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
    const funnelRows = rows(`SELECT step, COUNT(DISTINCT vid) AS c FROM hits WHERE vid NOT IN (SELECT vid FROM hidden_vids) AND day >= ? GROUP BY step`, from);
    const funnel = Object.fromEntries(STEPS.map((s) => [s, 0]));
    for (const r of funnelRows) funnel[r.step] = r.c;
    funnel.outbound = rows(`SELECT COUNT(DISTINCT vid) AS c FROM hits WHERE vid NOT IN (SELECT vid FROM hidden_vids) AND day >= ? AND step IN ('flight','hotel')`, from)[0]?.c ?? 0;

    // 권역별: 상세 본 기기, 예약처 이동, 저장
    const regionRows = rows(`SELECT region, step, COUNT(DISTINCT vid) AS c FROM hits WHERE vid NOT IN (SELECT vid FROM hidden_vids) AND day >= ? AND region != '' AND step IN ('region','book','flight','hotel','save') GROUP BY region, step`, from);
    const regions = new Map();
    for (const r of regionRows) {
      const x = regions.get(r.region) ?? { region: r.region, views: 0, book: 0, flight: 0, hotel: 0, save: 0 };
      x[r.step === "region" ? "views" : r.step] = r.c;
      regions.set(r.region, x);
    }

    const total = rows(`SELECT COUNT(*) AS c FROM visitors WHERE vid NOT IN (SELECT vid FROM hidden_vids)`)[0]?.c ?? 0;
    const kstStart = Date.parse(today + "T00:00:00+09:00");
    const notHidden = (col) => (hidden.length ? ` AND ${col} NOT IN (${hidden.map(() => "?").join(",")})` : "");
    const members = {
      total: rows(`SELECT COUNT(*) AS c FROM social_users WHERE 1${notHidden("uid")}`, ...hidden)[0]?.c ?? 0,
      today: rows(`SELECT COUNT(*) AS c FROM social_users WHERE created >= ?${notHidden("uid")}`, kstStart, ...hidden)[0]?.c ?? 0,
      activeToday: rows(`SELECT COUNT(DISTINCT uid) AS c FROM log WHERE day = ?${notHidden("uid")}`, today, ...hidden)[0]?.c ?? 0,
    };
    return {
      ok: true,
      today,
      from,
      days,
      totalVisitors: total,
      members,
      periodVisitors: funnel.visit,
      daily: [...byDay.values()],
      funnel,
      searchAreas: rows(`SELECT area, SUM(n) AS searches FROM search_areas WHERE day >= ? GROUP BY area ORDER BY searches DESC, area`, from),
      regions: [...regions.values()].sort((a, b) => b.views - a.views).slice(0, 30),
    };
  }
}
