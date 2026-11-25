"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/AppShell";
import { GUEST_OPEN, GuestPreview, RankCards, priceNote } from "@/components/RankList";
import { RegionBoard } from "@/app/r/[id]/client";
import { useWide } from "@/lib/useWide";
import { AUTH_EVENT, loadAuth } from "@/lib/account";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { TEMP_GRADE } from "@/data/regionsV1";
import { useFlowQuery } from "@/lib/flow";
import { coreInterests, membersOf } from "@/lib/travelParty";
import { scoreRegions, tripDays } from "@/services/regionScore";
import { useLivePrices } from "@/lib/livePrices";

export default function ResultsPage() {
  const router = useRouter();
  // 비회원: 1~3위는 실제로 보여 주고 4위부터 흐린 가짜 카드+가입 안내(형님 11/25). 로그인하면 전체 그대로
  const [member, setMember] = useState<boolean | null>(null);
  useEffect(() => {
    const on = () => setMember(!!loadAuth());
    on();
    window.addEventListener(AUTH_EVENT, on);
    return () => window.removeEventListener(AUTH_EVENT, on);
  }, []);
  const q = useFlowQuery();
  const priceVersion = useLivePrices();
  const results = useMemo(() => (q ? scoreRegions(q) : []), [q, priceVersion]);
  // PC(넓은 화면): 왼쪽 추천 순위 + 오른쪽 권역 상세(예약·일정·관광지·음식점). 첫 화면 미리보기에서 고른 권역(?r=)부터 연다
  const wide = useWide();
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { const r = new URLSearchParams(location.search).get("r"); if (r) setSel(r); }, []);
  if (!q || member === null) return (
    <main className="container page" style={{ maxWidth: 560 }} aria-busy="true">
      <p className="small muted" role="status">추천 여행지를 불러오는 중…</p>
      <div className="stack" style={{ marginTop: 12 }}>
        {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 128 }} />)}
      </div>
    </main>
  );
  const ranked = results.filter((r) => r.status === "ranked").slice(0, 10);
  const split = wide && member && ranked.length > 0;
  const picked = ranked.some((r) => r.region.id === sel) ? sel! : ranked[0]?.region.id ?? null;
  const others = results.filter((r) => (r.status === "데이터 부족" || r.status === "조건 충족 장소 없음") && !r.region.tier);
  const days = tripDays(q.startDate, q.endDate);
  const members = membersOf(q);
  const excludedBudget = results.filter((r) => r.status === "예산 밖").length;
  const who = [`성인 ${q.adults}명`, q.children.length ? `자녀 ${q.children.length}명` : "", q.pet ? "반려동물" : ""].filter(Boolean).join(" · ");
  return (
    <main className={split ? "container page pc-split" : "container page"} style={split ? undefined : { maxWidth: 560 }}>
      <div className="pc-list">
      <BackButton href="/" label="조건 선택" />
      <div className="between">
        <h1 style={{ fontSize: 24, fontWeight: 900 }}>추천 여행지</h1>
        <Link href="/" className="btn btn-sm">조건 수정</Link>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>이번 일행과 여행 조건에 대한 적합도예요. 조건을 바꾸면 순위도 달라져요.</p>
      <div className="row-wrap" style={{ margin: "10px 0 14px" }}>
        <span className="chip"><Icon name="calendar" />{days - 1}박 {days}일</span>
        <span className="chip"><Icon name="users" />{who}</span>
        <span className="chip">{coreInterests(q).join(" + ")}</span>
        <span className="chip">{q.stay}</span>
        {q.totalBudgetKrw != null && <span className="chip">전체 {Math.round(q.totalBudgetKrw / 10000).toLocaleString()}만원 {q.budgetMode === "cap" ? "상한" : "목표"}</span>}
      </div>
      {members.some((m) => m.preferences.length) && <p className="xs muted" style={{ marginBottom: 12 }}>구성원별로 선택한 취향도 함께 반영했어요.</p>}
      {!ranked.length && <div className="card-soft stack" role="status"><b>현재 조건으로 보여드릴 추천이 없어요.</b><p className="small muted">예산이나 취향을 조정해 보세요. 데이터가 부족한 지역은 실제로 맞지 않는다고 단정하지 않아요.</p><Link href="/" className="btn btn-sm">조건 다시 선택하기</Link></div>}
      {!member && ranked.length > 0 ? <div className="stack">
        <RankCards ranked={ranked.slice(0, GUEST_OPEN)} budget={q.totalBudgetKrw} onOpen={(id) => router.push(`/r/${id}`)} />
        {ranked.length > GUEST_OPEN && <GuestPreview count={ranked.length - GUEST_OPEN} startRank={GUEST_OPEN + 1} />}
      </div> : <div className="stack">
        <RankCards ranked={ranked} budget={q.totalBudgetKrw} selected={split ? picked : null} onSelect={split ? setSel : undefined} onOpen={(id) => router.push(`/r/${id}`)} />
        {others.map((r) => <div key={r.region.id} className="card-soft small muted">{r.region.name}: {r.status === "데이터 부족" ? "추천에 필요한 자료를 보강하고 있어요." : "등록된 자료에서 조건에 맞는 후보를 찾지 못했어요."}</div>)}
      </div>}
      <div className="stack" style={{ marginTop: 18, gap: 6 }}>
        <Link href="/data-status" className="xs" style={{ color: "var(--teal-dark)" }}>데이터 출처와 확인 상태 보기</Link>
        <p className="xs faint">{priceNote(ranked[0]?.stay.priceSource)}</p>
        {TEMP_GRADE && <p className="xs faint">장소 등급과 적합도는 추정값이에요. 자료의 양과 확인 수준은 지역마다 달라요.</p>}
        <p className="xs faint">날씨 표시는 월별 기후 경향이며 여행일의 실제 예보가 아니에요. 경비에는 현지 교통비·입장료 등이 포함되지 않아요.</p>
        {excludedBudget > 0 && <p className="xs faint">선택한 지역 물가 또는 예산 상한을 벗어난 {excludedBudget}개 권역은 결과에서 제외했어요. 실제 예약 가격은 달라질 수 있어요.</p>}
        {q.price !== "상관없음" && <p className="xs faint">지역 물가 &lsquo;{q.price}&rsquo;만 표시해요. 물가를 확인할 수 없는 {results.filter((r) => r.status === "물가 미확인").length}개 권역은 별도 확인이 필요해요.</p>}
      </div>
      </div>
      {split && picked && <aside className="pc-detail" aria-label="선택한 권역 상세"><RegionBoard id={picked} /></aside>}
    </main>
  );
}
