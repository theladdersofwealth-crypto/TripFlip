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
    const storage = {
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
    const record = new Stats({ storage }, {});
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
  } finally {
    db.close();
    hook.deregister();
  }
});
