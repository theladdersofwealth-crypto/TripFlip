"use client";
// 로그인 회원의 '내 여행'을 계정(tripflip-stats)과 맞춘다. 서버가 원본.
// 보내는 것: 그 계정의 대기 변경(저장·삭제)만. 서버가 항목별로 확인해 준 것만 '저장됨'으로 바꾼다.
// 응답이 늦게 와서 그사이 로그아웃·계정 전환이 있었으면 아무것도 바꾸지 않는다.
import { STATS_URL } from "./analytics";
import { currentAccount, loadPending, saveAccountCache, savePending } from "./flow";
import type { Pending, SavedPlan } from "./flow";

export const PLANS_SYNCED_EVENT = "tripflip:plans-synced";

export interface SyncResult { ok: boolean; plans?: SavedPlan[]; saved?: string[]; deleted?: string[]; gone?: string[]; rejected?: { id: string; error: string }[] }
export type SyncOutcome = "done" | "offline" | "failed" | "stale" | "none";

/** 서버 응답을 대기 목록에 반영(순수 함수). sent = 보낼 때의 대기 목록. 보낸 뒤 바뀐 항목은 건드리지 않는다 */
export function applySyncResult(now: Pending, sent: Pending, r: SyncResult): Pending {
  const out: Pending = { puts: { ...now.puts }, dels: { ...now.dels } };
  const same = (id: string) => !!out.puts[id] && !!sent.puts[id] && JSON.stringify(out.puts[id].plan) === JSON.stringify(sent.puts[id].plan);
  for (const id of [...(r.saved ?? []), ...(r.gone ?? [])]) if (same(id)) delete out.puts[id];
  for (const x of r.rejected ?? []) if (same(x.id)) out.puts[x.id] = { ...out.puts[x.id], state: "failed", error: x.error };
  for (const id of r.deleted ?? []) if (out.dels[id] && sent.dels[id]) delete out.dels[id];
  return out;
}

/** 보낸 항목 상태를 한꺼번에 바꿈(오프라인 → waiting, 서버 거절 → failed). 보낸 뒤 바뀐 건 그대로 */
function markSent(now: Pending, sent: Pending, state: "waiting" | "failed", error?: string): Pending {
  const out: Pending = { puts: { ...now.puts }, dels: { ...now.dels } };
  for (const id of Object.keys(sent.puts)) if (out.puts[id] && JSON.stringify(out.puts[id].plan) === JSON.stringify(sent.puts[id].plan)) out.puts[id] = { ...out.puts[id], state, error };
  for (const id of Object.keys(sent.dels)) if (out.dels[id]) out.dels[id] = { state, error };
  return out;
}

let running: Promise<SyncOutcome> | null = null;
let again = false;

export function syncPlans(): Promise<SyncOutcome> {
  if (running) { again = true; return running; }
  running = runSync().finally(() => {
    running = null;
    if (again) { again = false; void syncPlans(); }
  });
  return running;
}

async function runSync(): Promise<SyncOutcome> {
  const acct = currentAccount();
  if (!acct?.uid) return "none";
  const { uid, token } = acct;
  const sent = loadPending(uid);
  const stillSame = () => { const c = currentAccount(); return !!c && c.uid === uid && c.token === token; };
  let res: Response;
  try {
    res = await fetch(`${STATS_URL}/plans`, { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ token, put: Object.values(sent.puts).map((x) => x.plan), del: Object.keys(sent.dels) }) });
  } catch {
    if (stillSame()) { savePending(uid, markSent(loadPending(uid), sent, "waiting")); notify(); }
    return "offline";
  }
  if (!stillSame()) return "stale"; // 늦은 응답: 그사이 로그아웃·계정 전환 → 무시
  let j: SyncResult & { uid?: string; error?: string };
  try { j = await res.json(); } catch { j = { ok: false }; }
  if (!stillSame()) return "stale";
  if (!j.ok || !Array.isArray(j.plans) || (j.uid && j.uid !== uid)) {
    // 로그인 만료(401)는 대기로 두고 다시 로그인하면 재시도, 그 밖의 거절은 '저장 실패'
    savePending(uid, markSent(loadPending(uid), sent, res.status === 401 || res.status >= 500 ? "waiting" : "failed", j.error));
    notify();
    return "failed";
  }
  saveAccountCache(uid, j.plans);
  savePending(uid, applySyncResult(loadPending(uid), sent, j));
  notify();
  return "done";
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PLANS_SYNCED_EVENT));
}
