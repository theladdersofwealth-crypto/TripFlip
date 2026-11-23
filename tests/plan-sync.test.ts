import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_QUERY, GUEST_PLANS_KEY, loadAccountCache, loadPending, loadPlans, moveGuestPlansToAccount, planState, removePlan, resetStorageFallback, saveAccountCache, savePlan } from "../src/lib/flow";
import type { SavedPlan } from "../src/lib/flow";
import { applySyncResult, syncPlans } from "../src/lib/planSync";
import { logout } from "../src/lib/account";

const values = new Map<string, string>();
const A = "aaaaaaaaaaaaaaaa", B = "bbbbbbbbbbbbbbbb";
const as = (uid: string | null, token = uid ? `tok-${uid}` : "") => uid ? values.set("tripflip:auth", JSON.stringify({ token, nick: uid.slice(0, 2), uid })) : values.delete("tripflip:auth");
beforeEach(() => {
  values.clear();
  resetStorageFallback();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); },
    removeItem: (k: string) => { values.delete(k); },
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: () => true } });
});
const plan = (id: string, extra: Partial<SavedPlan> = {}): SavedPlan => ({ id, regionId: "NT", regionName: "나트랑", query: { ...DEFAULT_QUERY, startDate: "2027-05-07", endDate: "2027-05-10" }, display: 70, booked: { flight: false, hotel: false }, createdAt: "2026-11-24", ...extra });
const ids = () => loadPlans().map((p) => p.id).sort();

test("비회원 일정과 계정 일정은 따로, 계정끼리도 따로", () => {
  savePlan(plan("guest1"));
  values.set("tripflip.flow.plans", JSON.stringify([plan("legacy1")]));
  assert.deepEqual(ids(), ["guest1", "legacy1"]);
  as(A); savePlan(plan("a1"));
  assert.deepEqual(ids(), ["a1"]); // 비회원·예전 일정은 회원 화면에 안 섞임
  assert.equal(planState("a1").state, "waiting");
  as(B);
  assert.deepEqual(ids(), []); // 계정 전환하면 A 것 안 보임
  savePlan(plan("b1"));
  as(A);
  assert.deepEqual(ids(), ["a1"]);
  assert.deepEqual(Object.keys(loadPending(A).puts), ["a1"]);
  assert.deepEqual(Object.keys(loadPending(B).puts), ["b1"]);
  as(null);
  assert.deepEqual(ids(), ["guest1", "legacy1"]);
});

test("비회원 일정은 '옮기기'를 눌러야만, 예전 공용 저장소 것은 옮기지 않음", () => {
  savePlan(plan("guest1"));
  values.set("tripflip.flow.plans", JSON.stringify([plan("legacy1")]));
  as(A);
  assert.equal(moveGuestPlansToAccount(), 1);
  assert.deepEqual(ids(), ["guest1"]);
  assert.equal(JSON.parse(values.get(GUEST_PLANS_KEY)!).length, 0);
  assert.equal(JSON.parse(values.get("tripflip.flow.plans")!).length, 1); // 소유자 불분명 → 그대로
});

test("일부만 저장되면 확인된 것만 완료, 나머지는 대기·실패로 남김", () => {
  const sent = { puts: { p1: { plan: plan("p1"), state: "waiting" as const }, p2: { plan: plan("p2"), state: "waiting" as const }, p3: { plan: plan("p3"), state: "waiting" as const } }, dels: { d1: { state: "waiting" as const }, d2: { state: "waiting" as const } } };
  const now = { puts: { ...sent.puts, p1: { plan: plan("p1"), state: "waiting" as const } }, dels: { ...sent.dels } };
  const out = applySyncResult(now, sent, { ok: true, plans: [], saved: ["p1"], rejected: [{ id: "p2", error: "너무 커요" }], deleted: ["d1"] });
  assert.deepEqual(Object.keys(out.puts).sort(), ["p2", "p3"]);
  assert.equal(out.puts.p2.state, "failed");
  assert.equal(out.puts.p3.state, "waiting");
  assert.deepEqual(Object.keys(out.dels), ["d2"]);
  // 보낸 뒤 고친 일정은 '저장 확인'이 와도 대기 유지
  const edited = { puts: { p1: { plan: plan("p1", { display: 99 }), state: "waiting" as const } }, dels: {} };
  assert.ok(applySyncResult(edited, sent, { ok: true, plans: [], saved: ["p1"] }).puts.p1);
});

test("늦은 응답: 그사이 계정이 바뀌면 아무것도 바꾸지 않음", async () => {
  as(A); savePlan(plan("a1"));
  let release!: () => void;
  globalThis.fetch = (async () => { await new Promise<void>((r) => { release = r; }); return new Response(JSON.stringify({ ok: true, uid: A, plans: [plan("a1")], saved: ["a1"] })); }) as typeof fetch;
  const p = syncPlans();
  await new Promise((r) => setTimeout(r, 5));
  as(B); // 응답 오기 전에 계정 전환
  release();
  assert.equal(await p, "stale");
  assert.deepEqual(loadAccountCache(A), []);
  assert.deepEqual(loadAccountCache(B), []);
  assert.ok(loadPending(A).puts.a1);
  assert.deepEqual(ids(), []);
});

test("오프라인·서버 오류: 지우지 않고 대기/실패로 보관, 성공하면 저장 완료", async () => {
  as(A); savePlan(plan("a1")); removePlan("old");
  globalThis.fetch = (async () => { throw new TypeError("offline"); }) as typeof fetch;
  assert.equal(await syncPlans(), "offline");
  assert.equal(planState("a1").state, "waiting");
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false, error: "잘못된 요청" }), { status: 400 })) as typeof fetch;
  assert.equal(await syncPlans(), "failed");
  assert.equal(planState("a1").state, "failed");
  let body: { put: SavedPlan[]; del: string[] } | null = null;
  globalThis.fetch = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response(JSON.stringify({ ok: true, uid: A, plans: [plan("a1")], saved: ["a1"], deleted: ["old"] })); }) as typeof fetch;
  assert.equal(await syncPlans(), "done");
  assert.deepEqual(body!.put.map((p) => p.id), ["a1"]);
  assert.deepEqual(body!.del, ["old"]);
  assert.equal(planState("a1").state, "synced");
  assert.deepEqual(loadPending(A), { puts: {}, dels: {} });
});

test("로그아웃: 화면에서 바로 숨기고, 안 올라간 변경은 보존해 같은 계정 로그인 때만 재시도", async () => {
  as(A); saveAccountCache(A, [plan("a-server")]); savePlan(plan("a-unsent"));
  globalThis.fetch = (async () => { throw new TypeError("offline"); }) as typeof fetch;
  await logout();
  assert.deepEqual(ids(), []);
  assert.deepEqual(loadAccountCache(A), []);
  assert.ok(loadPending(A).puts["a-unsent"]);
  as(B);
  let sentIds: string[] = [];
  globalThis.fetch = (async (_u: string, init: RequestInit) => { sentIds = JSON.parse(String(init.body)).put.map((p: SavedPlan) => p.id); return new Response(JSON.stringify({ ok: true, uid: B, plans: [], saved: [] })); }) as typeof fetch;
  await syncPlans();
  assert.deepEqual(sentIds, []); // B 계정에는 A의 미저장 일정이 안 올라감
  as(A);
  await syncPlans();
  assert.deepEqual(sentIds, ["a-unsent"]);
});
