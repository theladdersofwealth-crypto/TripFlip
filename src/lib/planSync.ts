"use client";
// 로그인 회원의 '내 여행'을 계정(tripflip-stats)에 저장해 다른 기기에서도 보이게 한다.
// 이 기기 목록 + 지운 목록을 올리면 서버가 합친 전체 목록을 돌려주고, 그걸로 이 기기 저장을 바꾼다.
// 비로그인은 지금처럼 이 기기에만 저장. 처음 로그인하면 이 기기에 있던 여행이 계정으로 합쳐진다.
import { STATS_URL } from "./analytics";
import { loadAuth } from "./account";
import { clearPlanDels, loadPlanDels, loadPlans, replacePlans } from "./flow";
import type { SavedPlan } from "./flow";

export const PLANS_SYNCED_EVENT = "tripflip:plans-synced";
let running: Promise<boolean> | null = null;
let again = false;

/** 계정과 맞추기. 성공하면 true. 동시에 여러 번 불리면 끝난 뒤 한 번 더 */
export function syncPlans(): Promise<boolean> {
  if (running) { again = true; return running; }
  running = (async () => {
    const a = loadAuth();
    if (!a) return false;
    const dels = loadPlanDels();
    const sent = loadPlans();
    try {
      const res = await fetch(`${STATS_URL}/plans`, { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ token: a.token, put: sent, del: dels }) });
      const j = (await res.json()) as { ok: boolean; plans?: SavedPlan[] };
      if (!j.ok || !Array.isArray(j.plans)) return false;
      // 서버 목록이 정답. 단, 올리는 동안 이 기기에서 새로 저장·삭제한 건 반영(다음 동기화 때 올라감)
      const sentIds = new Set(sent.map((p) => p.id));
      const ids = new Set(j.plans.map((p) => p.id));
      const newDels = loadPlanDels().filter((id) => !dels.includes(id));
      const local = loadPlans();
      const sentJson = new Map(sent.map((p) => [p.id, JSON.stringify(p)]));
      const fresh = local.filter((p) => !ids.has(p.id) && (!sentIds.has(p.id) || sentJson.get(p.id) !== JSON.stringify(p)));
      const merged = [...j.plans.filter((p) => !newDels.includes(p.id)), ...fresh];
      replacePlans(merged.sort((x, y) => (y.createdAt > x.createdAt ? 1 : -1)));
      clearPlanDels(dels);
      window.dispatchEvent(new Event(PLANS_SYNCED_EVENT));
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    running = null;
    if (again) { again = false; void syncPlans(); }
  });
  return running;
}
