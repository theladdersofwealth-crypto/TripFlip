import { strict as assert } from "node:assert";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("관리자 통계는 소셜 회원 가입 후에도 퍼널과 회원 수를 반환하고 관리자 키를 요구한다", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-27T12:00:00Z") });
  // Use the real worker and SQLite queries locally, without production secrets or member data.
  const workerBuiltin = "data:text/javascript,tripflip-test-durable-object";
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "cloudflare:workers") {
        return { url: workerBuiltin, format: "module", shortCircuit: true };
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      return url === workerBuiltin ? { format: "module", source: "export class DurableObject {}", shortCircuit: true } : next(url, context);
    },
  });
  const db = new DatabaseSync(":memory:");
  try {
    // @ts-expect-error The JavaScript Worker entry point has no TypeScript declarations.
    const { default: worker, Stats } = await import("../workers/stats/src/index.js");
    // Wrap the SQLite API with the part of Durable Object storage used by the worker.
    let alarm: number | null = null;
    const storage = {
      getAlarm: async () => alarm,
      setAlarm: async (time: number) => { alarm = time; },
      sql: { exec: (q: string, ...args: (string | number | null)[]) => {
        const result = db.prepare(q).all(...args);
        return { toArray: () => result };
      } },
      transactionSync: <T>(fn: () => T): T => {
        db.exec("BEGIN");
        try { const result = fn(); db.exec("COMMIT"); return result; }
        catch (e) { db.exec("ROLLBACK"); throw e; }
      },
    };
    const record = new Stats({ storage }, { MEMBER_ANALYTICS: "1" });
    const adminKey = "synthetic-local-admin-key";
    const env = { ADMIN_KEY: adminKey, STATS: { idFromName: (s: string) => s, get: () => record } };
    const email = "fixture@example.test";
    const vid = "fixturedevice1";
    const user = await record.oauthAccount({
      provider: "google", subject: "synthetic-google-subject", name: "시험 회원", email, emailVerified: true,
    }, "login", null, null, vid);
    assert.ok(user.ok && user.uid && user.token);

    const statsRequest = (token?: string) => new Request("https://worker.example.test/stats?days=7", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    for (const token of [undefined, user.token]) {
      const denied = await worker.fetch(statsRequest(token), env);
      assert.equal(denied.status, 401);
      assert.deepEqual(await denied.json(), { ok: false, error: "unauthorized" });
    }

    const event = await worker.fetch(new Request("https://worker.example.test/e", {
      method: "POST", headers: { "user-agent": "Synthetic browser" },
      body: JSON.stringify({ v: vid, s: "visit" }),
    }), env);
    assert.equal(event.status, 200);

    const response = await worker.fetch(statsRequest(adminKey), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.ok(data.ok);
    assert.equal(data.daily.length, 7);
    assert.equal(data.funnel.visit, 1);
    assert.equal(data.funnel.save, 0);
    assert.deepEqual(data.members, { total: 1, today: 1, activeToday: 1 });
    // Rollout mode: only a verified Google login for the configured account earns a grant.
    const ownerEmail = "fixture-owner@example.test";
    const ownerDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ownerEmail)))].map((v) => v.toString(16).padStart(2, "0")).join("");
    const ownerConfig = { ADMIN_GOOGLE_EMAIL_SHA256: ownerDigest };
    const ownerStats = new Stats({ storage }, ownerConfig);
    const ownerEnv = { ...env, ...ownerConfig, STATS: { idFromName: (s: string) => s, get: () => ownerStats } };
    const google = (email: string, subject: string, emailVerified: boolean) => ({ provider: "google", email, subject, emailVerified, name: "테스트" });
    const owner = await ownerStats.oauthAccount(google(ownerEmail, "owner-subject", true), "login", null, null, vid);
    const nonGoogle = await ownerStats.oauthAccount({ ...google(ownerEmail, "kakao-subject", true), provider: "kakao" }, "login", null, null, vid);
    const unverified = await ownerStats.oauthAccount(google("someone@example.test", "other-subject", false), "login", null, null, vid);
    const verifyAdmin = (path: string, token?: string, method = "GET") => worker.fetch(new Request("https://worker.example.test" + path, {
      method, headers: token ? { authorization: `Bearer ${token}` } : {},
    }), ownerEnv);
    assert.equal(owner.uid, nonGoogle.uid); // Even a linked provider’s session is not an admin session.
    for (const path of ["/stats", "/users", `/user?id=${owner.uid}`]) {
      for (const token of [undefined, adminKey, user.token, nonGoogle.token, unverified.token]) assert.equal((await verifyAdmin(path, token)).status, 401);
      assert.equal((await verifyAdmin(path, owner.token)).status, 200);
    }
    assert.equal((await verifyAdmin(`/user?id=${user.uid}`, nonGoogle.token, "DELETE")).status, 401);
    assert.equal((await (await verifyAdmin(`/user?id=${owner.uid}`, owner.token)).json()).canDelete, false);
    const ownDelete = await verifyAdmin(`/user?id=${owner.uid}`, owner.token, "DELETE");
    assert.equal(ownDelete.status, 403);
    assert.equal((await ownDelete.json()).error, "administrator_account_protected");
    const disposable = await ownerStats.oauthAccount(google("disposable@example.test", "disposable-subject", true), "login", null, null, vid);
    assert.ok(disposable.uid);
    assert.equal((await (await verifyAdmin(`/user?id=${disposable.uid}`, owner.token)).json()).canDelete, true);
    assert.equal((await verifyAdmin(`/user?id=${disposable.uid}`, owner.token, "DELETE")).status, 200);
    assert.equal((await verifyAdmin(`/user?id=${disposable.uid}`, owner.token)).status, 404);
    assert.equal(await ownerStats.sessionOf(disposable.token), null);
    assert.equal((await verifyAdmin("/stats", owner.token)).status, 200);
    await ownerStats.logout({ token: owner.token });
    assert.equal((await verifyAdmin("/stats", owner.token)).status, 401);
    const freshOwner = await ownerStats.oauthAccount(google(ownerEmail, "owner-subject", true), "login", null, null, vid);
    assert.equal((await verifyAdmin("/stats", freshOwner.token)).status, 200);
    t.mock.timers.setTime(Date.now() + 8 * 86400000);
    assert.equal((await verifyAdmin("/stats", freshOwner.token)).status, 401);
    t.mock.timers.setTime(Date.parse("2026-11-27T12:00:00Z"));
    ownerStats.eraseUser(owner.uid);
    ownerStats.eraseUser(unverified.uid);
    await record.me({ token: user.token });

    const uid = user.uid!;
    const request = (path: string, options: RequestInit = {}) => worker.fetch(new Request("https://worker.example.test" + path, options), env);
    const admin = { headers: { authorization: `Bearer ${adminKey}` } };
    const detail = async (suffix = "") => (await request(`/user?id=${uid}${suffix}`, admin)).json();
    const action = (action: string, more: object = {}, token = user.token) => request("/usage", {
      method: "POST", body: JSON.stringify({ action, token, ...more }),
    });
    assert.equal((await action("status")).status, 200);
    assert.deepEqual(await (await action("status")).json(), { ok: true, enabled: false });
    const click = { kind: "click", id: "1".repeat(32) };
    await action("event", click);
    const before = await detail();
    assert.equal(before.usage.optedInSince, null);
    assert.equal(before.usage.clicks, 0);
    assert.deepEqual(before.identities, [{ provider: "google", emailHint: "f***@example.test" }]);
    assert.equal(JSON.stringify(before).includes(email), false);

    assert.equal((await action("consent", { version: 0 })).status, 400);
    assert.equal((await action("consent", { version: 1 })).status, 200);
    assert.notEqual(alarm, null);
    const returnLogin = await record.oauthAccount({
      provider: "google", subject: "synthetic-google-subject", name: "시험 회원", email, emailVerified: true,
    }, "login", null, null, vid);
    assert.equal(returnLogin.uid, uid);
    await action("event", click);
    await action("event", click);
    await action("event", { kind: "active", id: "2".repeat(32) });
    await action("event", { kind: "active", id: "3".repeat(32) }, returnLogin.token);
    await action("event", { kind: "flight", id: "4".repeat(32) });
    await action("event", { kind: "access", id: "5".repeat(32) });
    assert.equal((await action("event", { kind: "login", id: "6".repeat(32) })).status, 400);
    assert.equal((await action("event", click, "f".repeat(48))).status, 401);
    const plan = { id: "fixture-plan", regionId: "jp-test", regionName: "테스트", query: {}, createdAt: "2026-11-27" };
    for (let i = 0; i < 2; i++) assert.equal((await request("/plans", { method: "POST", body: JSON.stringify({ token: user.token, put: [plan] }) })).status, 200);
    const selected = await detail("&from=2026-11-27&to=2026-11-27");
    assert.equal(selected.usage.logins, 1);
    assert.equal(selected.usage.clicks, 1);
    assert.equal(selected.usage.visits, 1);
    assert.equal(selected.usage.activeSeconds, 15);
    assert.equal(selected.usage.saves, 1);
    assert.equal(selected.usage.outbound, 1);
    assert.ok(selected.usage.recent.some((e: { kind: string; provider: string }) => e.kind === "login" && e.provider === "google"));
    const previous = await detail("&from=2026-11-26&to=2026-11-26");
    assert.equal(previous.usage.logins, 0);
    assert.equal(previous.usage.activeSeconds, 0);
    assert.deepEqual(previous.recent, []);
    const oldStats = await (await request("/stats?from=2026-11-23&to=2026-11-25", admin)).json();
    assert.deepEqual(oldStats.daily.map((d: { day: string }) => d.day), ["2026-11-23", "2026-11-24", "2026-11-25"]);
    assert.equal((await request("/stats?from=2026-11-31&to=2026-11-30", admin)).status, 400);
    assert.equal((await request(`/user?id=${uid}`)).status, 401);

    db.prepare("INSERT INTO usage_actions VALUES (?, ?, ?, ?, ?, ?)").run(uid, "expired", 123, "2026-01-01", "click", "");
    await record.alarm();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usage_actions WHERE id='expired'").get()?.n, 0);
    // Killing the collection switch still allows existing participants to withdraw.
    const disabled = new Stats({ storage }, {});
    const disabledEnv = { ...env, STATS: { idFromName: (s: string) => s, get: () => disabled } };
    const off = (action: string) => worker.fetch(new Request("https://worker.example.test/usage", {
      method: "POST", body: JSON.stringify({ action, token: user.token }),
    }), disabledEnv);
    assert.equal((await off("event")).status, 404);
    assert.equal((await off("revoke")).status, 200);
    assert.equal((await detail()).usage.logins, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usage_windows").get()?.n, 0);
    await action("consent", { version: 1 });
    await action("event", click);
    assert.equal((await request(`/user?id=${uid}`, { ...admin, method: "DELETE" })).status, 200);
    assert.equal((await request(`/user?id=${uid}`, admin)).status, 404);
    for (const table of ["usage_actions", "usage_windows", "usage_optin"]) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n, 0);
    }
  } finally {
    db.close();
    hook.deregister();
  }
});
