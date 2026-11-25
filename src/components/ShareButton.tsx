"use client";
import { useState } from "react";
import type { RegionQuery } from "@/services/regionScore";
import { shareUrl } from "@/lib/shareLink";
import { useTripStore } from "@/store/TripStore";
import { Icon } from "./Icon";

// 추천 결과 공유(11/25 형님): 휴대폰은 기본 공유창(카카오톡·문자 등), 없으면 링크 복사. 카카오 전용 말풍선 카드는 나중에.
export function ShareButton({ query, title }: { query: RegionQuery; title: string }) {
  const { showToast } = useTripStore();
  const [manual, setManual] = useState<string | null>(null);
  const onClick = async () => {
    const url = shareUrl(location.origin, query);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try { await nav.share({ title: "트립플립 여행지 추천", text: title, url }); return; }
      catch (e) { if ((e as Error)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); showToast("링크를 복사했어요. 카카오톡에 붙여 넣어 보내세요."); }
    catch { setManual(url); }
  };
  return <>
    <button type="button" className="btn btn-sm share-btn" onClick={onClick} aria-label="추천 결과 공유하기"><Icon name="share" />공유</button>
    {manual && <div className="share-manual card-soft stack" role="dialog" aria-label="공유 링크">
      <p className="xs muted">아래 링크를 길게 눌러 복사해 주세요.</p>
      <input readOnly value={manual} onFocus={(e) => e.currentTarget.select()} aria-label="공유 링크" />
      <button type="button" className="btn btn-sm" onClick={() => setManual(null)}>닫기</button>
    </div>}
  </>;
}
