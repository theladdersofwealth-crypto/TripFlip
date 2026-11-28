"use client";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AUTH_EVENT, loadAuth } from "@/lib/account";
import { useLivePrices } from "@/lib/livePrices";
import { membersOf, normalizeParty } from "@/lib/travelParty";
import { scoreRegions } from "@/services/regionScore";
import type { RegionQuery } from "@/services/regionScore";
import { GUEST_OPEN, GuestPreview, RankCards } from "@/components/RankList";

/** PC 첫 화면 오른쪽: 고르는 조건으로 추천 순위를 바로 미리 보여 준다(비회원은 1~3위만 실제, 4위부터 흐린 가짜 카드) */
export function HomePreview({ q, ready, blocked, onOpen, save }: { q: RegionQuery; ready: boolean; blocked: string | null; onOpen: (id: string) => void; save: () => void }) {
  const [member, setMember] = useState<boolean | null>(null);
  useEffect(() => {
    const on = () => setMember(!!loadAuth());
    on();
    window.addEventListener(AUTH_EVENT, on);
    return () => window.removeEventListener(AUTH_EVENT, on);
  }, []);
  const priceVersion = useLivePrices();
  const dq = useDeferredValue(q);
  const ranked = useMemo(() => (ready && !blocked ? scoreRegions(normalizeParty(dq)).filter((r) => r.status === "ranked").slice(0, 6) : []), [dq, ready, blocked, priceVersion]);
  return <>
    <div className="between" style={{ marginBottom: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 900 }}>미리 보는 추천</h2>
      <span className="chip">조건을 바꾸면 바로 갱신</span>
    </div>
    {!ready ? <div className="card-soft small muted">1단계(누구와 · 언제 · 지역 · 취향)를 마치면 여기에 추천 순위가 바로 떠요.</div>
      : blocked ? <div className="card-soft small muted" role="status">{blocked}</div>
      : member === null ? null
      : !ranked.length ? <div className="card-soft small muted" role="status">현재 조건으로 보여드릴 추천이 없어요. 예산이나 취향을 조정해 보세요.</div>
      : !member ? <div className="stack"><div className="rank-grid"><RankCards ranked={ranked.slice(0, GUEST_OPEN)} budget={dq.totalBudgetKrw} travelers={membersOf(dq).length} onOpen={onOpen} /></div>
        {ranked.length > GUEST_OPEN && <GuestPreview count={ranked.length - GUEST_OPEN} startRank={GUEST_OPEN + 1} beforeGo={save} />}</div>
      : <div className="rank-grid"><RankCards ranked={ranked} budget={dq.totalBudgetKrw} travelers={membersOf(dq).length} onOpen={onOpen} /></div>}
    {ready && !blocked && member && ranked.length > 0 && <p className="xs faint" style={{ marginTop: 12 }}>상위 {ranked.length}곳 미리보기예요. 카드를 누르면 예약·일정·관광지·음식점을 볼 수 있어요. 적합도·경비는 추정이에요.</p>}
  </>;
}
