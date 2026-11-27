// Account analytics is optional and distinct from legacy device-level statistics.
import { kstDay } from "./lib.js";

export const DAY = 86400000;
export const USAGE_DAYS = 90;
const date = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

export function reportRange(params, days, now = Date.now()) {
  const today = kstDay(now), from = params.get("from"), to = params.get("to");
  if (from === null && to === null) return { from: kstDay(now - (days - 1) * DAY), to: today, days };
  if (!date(from) || !date(to) || from > to || to > today || from < kstDay(now - 364 * DAY)) return null;
  return { from, to, days: 1 + (Date.parse(to) - Date.parse(from)) / DAY };
}

export function initUsage(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS usage_optin (uid TEXT PRIMARY KEY, since INTEGER NOT NULL)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS usage_windows (uid TEXT NOT NULL, bucket INTEGER NOT NULL, day TEXT NOT NULL, PRIMARY KEY(uid,bucket))`);
  sql.exec(`CREATE INDEX IF NOT EXISTS usage_windows_day ON usage_windows(day)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS usage_actions (uid TEXT NOT NULL, id TEXT NOT NULL, ts INTEGER NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '', PRIMARY KEY(uid,id))`);
  sql.exec(`CREATE INDEX IF NOT EXISTS usage_actions_day ON usage_actions(day)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS usage_actions_uid_day ON usage_actions(uid,day)`);
}

export function usageAllowed(sql, uid) {
  return sql.exec("SELECT since FROM usage_optin WHERE uid = ?", uid).toArray()[0] ?? null;
}

export function eraseUsage(sql, uid) {
  for (const table of ["usage_optin", "usage_windows", "usage_actions"]) sql.exec(`DELETE FROM ${table} WHERE uid = ?`, uid);
}

export function purgeUsage(sql) {
  for (const table of ["usage_windows", "usage_actions"]) sql.exec(`DELETE FROM ${table} WHERE day < ?`, kstDay(Date.now() - (USAGE_DAYS - 1) * DAY));
}

export function noteUsage(sql, uid, kind, id, provider = "", now = Date.now()) {
  if (!usageAllowed(sql, uid)) return;
  const day = kstDay(now);
  // At most one foreground sample per account in a 15-second window, even across tabs/devices.
  if (kind === "active") {
    sql.exec("INSERT OR IGNORE INTO usage_windows VALUES (?, ?, ?)", uid, Math.floor(now / 15000), day);
  } else {
    sql.exec("INSERT OR IGNORE INTO usage_actions VALUES (?, ?, ?, ?, ?, ?)", uid, id, now, day, kind, provider);
  }
}

export function usageReport(sql, uid, range) {
  const consent = usageAllowed(sql, uid);
  const from = [range.from, kstDay(Date.now() - (USAGE_DAYS - 1) * DAY)].sort().at(-1);
  const rows = (q, ...args) => sql.exec(q, ...args).toArray();
  const events = rows("SELECT kind, COUNT(*) AS count FROM usage_actions WHERE uid = ? AND day BETWEEN ? AND ? GROUP BY kind", uid, from, range.to);
  const counts = Object.fromEntries(events.map((x) => [x.kind, x.count]));
  return {
    optedInSince: consent?.since ?? null,
    measuredFrom: consent ? [from, kstDay(consent.since)].sort().at(-1) : null,
    activeSeconds: (rows("SELECT COUNT(*) AS count FROM usage_windows WHERE uid = ? AND day BETWEEN ? AND ?", uid, from, range.to)[0]?.count ?? 0) * 15,
    logins: counts.login ?? 0,
    clicks: counts.click ?? 0,
    visits: counts.access ?? 0,
    saves: counts.saved ?? 0,
    outbound: counts.flight ?? 0,
    hotelOutbound: counts.hotel ?? 0,
    otherOutbound: counts.outbound ?? 0,
    recent: rows(`SELECT ts, kind, provider FROM usage_actions WHERE uid = ? AND day BETWEEN ? AND ?
      AND kind != 'click' ORDER BY ts DESC LIMIT 100`, uid, from, range.to),
  };
}
