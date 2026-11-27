"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/AppShell";
import { GUEST_OPEN, GuestPreview, RankCards } from "@/components/RankList";
import { RegionBoard } from "@/app/r/[id]/client";
import { useWide } from "@/lib/useWide";
import { AUTH_EVENT, loadAuth } from "@/lib/account";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { saveQuery, useFlowQuery, loadQuestionPreview, confirmQuestionPreview, confirmedDefaultLabels } from "@/lib/flow";
import { decodeShare } from "@/lib/shareLink";
import { ShareButton } from "@/components/ShareButton";
import type { RegionQuery } from "@/services/regionScore";
import { coreInterests, membersOf } from "@/lib/travelParty";
import { scoreRegions, tripDays } from "@/services/regionScore";
import { normalizeTravelAreas, TRAVEL_AREAS } from "@/data/travelAreas";
import { useLivePrices } from "@/lib/livePrices";
import { useTripStore } from "@/store/TripStore";

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
  const own = useFlowQuery();
  const [home,setHome]=useState<{requested:boolean;snapshot:ReturnType<typeof loadQuestionPreview>;applied:boolean}|null>(null);
  useEffect(()=>{const requested=new URLSearchParams(location.search).get("preview")==="1";setHome({requested,snapshot:requested?loadQuestionPreview():null,applied:false});},[]);
  // 공유받은 링크(?s=): 미리보기로만 보여 주고, '이 조건 사용'을 눌러야 내 조건을 바꾼다(11/25 점검 후 수정)
  const [shared, setShared] = useState<{ q: RegionQuery | null; bad: boolean; applied?: boolean } | null>(null);
  const { showToast } = useTripStore();
  useEffect(() => {
    const s = new URLSearchParams(location.search).get("s");
    if (!s) { setShared({ q: null, bad: false }); return; }
    const sq = decodeShare(s);
    setShared({ q: sq, bad: !sq });
  }, []);
  const draftPreview=!!home?.snapshot&&!home.applied&&!shared?.q;
  const previewOnly = (!!shared?.q && !shared.applied)||draftPreview;
  const confirmDraft=()=>{if(!home?.snapshot)return;confirmQuestionPreview(home.snapshot);setHome({...home,applied:true});router.replace("/results");showToast("이 조건으로 확정했어요.");};
  const applyShared = () => {
    if (!shared?.q) return;
    saveQuery(shared.q);
    setShared({ q: shared.q, bad: false, applied: true });
    router.replace("/results");
    showToast("공유받은 조건으로 바꿨어요.");
  };
  const q = shared === null || home === null ? null : shared.q ?? home.snapshot?.q ?? own;
  const defaults = shared?.q ? [] : home?.snapshot?.defaults ?? (q ? confirmedDefaultLabels(q) : []);
  const priceVersion = useLivePrices();
  const results = useMemo(() => (q ? scoreRegions(q) : []), [q, priceVersion]);
  // PC(넓은 화면): 왼쪽 추천 순위 + 오른쪽 권역 상세(예약·일정·관광지·음식점). 첫 화면 미리보기에서 고른 권역(?r=)부터 연다
  const wide = useWide();
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { const r = new URLSearchParams(location.search).get("r"); if (r) setSel(r); }, []);
  if(home?.requested&&!home.snapshot&&!shared?.q)return <main className="container page"><p role="status">이 탭의 추천 미리보기를 찾을 수 없어요. 기존 검색 결과는 변경되지 않았어요.</p><Link href="/" className="btn btn-primary">조건 이어서 고르기</Link></main>;
  if (!q || member === null) return (
    <main className="container page" style={{ maxWidth: 560 }} aria-busy="true">
      <p className="small muted" role="status">추천 여행지를 불러오는 중…</p>
      <div className="stack" style={{ marginTop: 12 }}>
        {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 128 }} />)}
      </div>
    </main>
  );
  const ranked = results.filter((r) => r.status === "ranked").slice(0, 10);
  const split = wide && member && ranked.length > 0 && !previewOnly;
  const picked = ranked.some((r) => r.region.id === sel) ? sel! : ranked[0]?.region.id ?? null;
  const open = (id: string) => {
    if (previewOnly) { showToast(draftPreview ? "자세히 보려면 먼저 이 조건으로 확정해 주세요." : "자세히 보려면 먼저 '이 조건 사용'을 눌러 주세요."); return; }
    router.push(`/r/${id}`);
  };
  const others = results.filter((r) => (r.status === "데이터 부족" || r.status === "조건 충족 장소 없음") && !r.region.tier);
  const days = tripDays(q.startDate, q.endDate);
  const members = membersOf(q);
  const who = [`성인 ${q.adults}명`, q.children.length ? `자녀 ${q.children.length}명` : "", q.pet ? "반려동물" : ""].filter(Boolean).join(" · ");
  return (
    <main className={split ? "container page pc-split" : "container page"} style={split ? undefined : { maxWidth: 560 }}>
      <div className="pc-list">
      <BackButton href="/" label="조건 선택" />
      <div className="between">
        <h1 style={{ fontSize: 24, fontWeight: 900 }}>추천 여행지</h1>
        <div className="row-wrap" style={{ gap: 6 }}>
          {ranked.length > 0 && !previewOnly && <ShareButton query={q} title={`${days - 1}박 ${days}일 · ${who} · ${coreInterests(q).join("·")} 여행지 추천`} />}
          <Link href="/" className="btn btn-sm">{draftPreview?"조건 이어서 고르기":"조건 수정"}</Link>
        </div>
      </div>
      {draftPreview&&<div className="card-soft stack" role="status" style={{marginTop:10}}><b>지금까지 고른 조건의 추천 미리보기</b><p className="small muted">마지막 확정 검색은 그대로예요. 원하면 조건을 더 고르거나 이 조건으로 확정할 수 있어요.</p><div className="row-wrap"><button type="button" className="btn btn-primary btn-sm" onClick={confirmDraft}>이 조건으로 확정</button></div></div>}
      {defaults.length>0&&<div className="card-soft small" role="status" style={{marginTop:10}}><b>기본 조건으로 추천했어요</b><p>{defaults.join(" · ")}</p><p className="xs muted">선택하지 않은 조건은 가정이에요. 실제 맞춤 견적이나 예약가는 아니에요.</p></div>}
      {!!shared?.q&&!shared.applied && <div className="card-soft stack" role="status" style={{ marginTop: 10, gap: 8 }}>
        <p className="small"><b>공유받은 추천 미리보기예요.</b> 내 조건은 그대로예요. 링크에는 이름·나이·키·보행 조건을 담지 않아서 보낸 사람 화면과 조금 다를 수 있어요.</p>
        <div className="row-wrap" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm btn-primary" onClick={applyShared}>이 조건 사용</button>
          <Link href="/" className="btn btn-sm">내 조건으로 추천받기</Link>
        </div>
      </div>}
      {shared?.bad && <div className="card-soft small muted" role="status" style={{ marginTop: 10 }}>공유 링크를 열 수 없어서(날짜가 지났거나 주소가 잘림) 내 조건으로 보여 드려요.</div>}
      <p className="small muted" style={{ marginTop: 8 }}>{defaults.length ? "기본값과 선택 조건을 반영한 적합도 추정이에요." : "이번 일행과 여행 조건에 대한 적합도예요. 조건을 바꾸면 순위도 달라져요."}</p>
      <div className="row-wrap" style={{ margin: "10px 0 14px" }}>
        <span className="chip"><Icon name="calendar" />{days - 1}박 {days}일</span>
        <span className="chip"><Icon name="users" />{who}</span>
        <span className="chip">{coreInterests(q).join(" + ")}</span>
        <span className="chip">{q.stay}</span>
        {normalizeTravelAreas(q.preferredAreas).map((id) => <span key={id} className="chip">{TRAVEL_AREAS.find((a) => a.id === id)!.label}</span>)}
        {q.totalBudgetKrw != null && <span className="chip">전체 {Math.round(q.totalBudgetKrw / 10000).toLocaleString()}만원 {q.budgetMode === "cap" ? "상한" : "목표"}</span>}
      </div>
      {members.some((m) => m.preferences.length) && <p className="xs muted" style={{ marginBottom: 12 }}>구성원별로 선택한 취향도 함께 반영했어요.</p>}
      {!ranked.length && <div className="card-soft stack" role="status"><b>현재 조건으로 보여드릴 추천이 없어요.</b><p className="small muted">예산이나 취향을 조정해 보세요. 데이터가 부족한 지역은 실제로 맞지 않는다고 단정하지 않아요.</p><Link href="/" className="btn btn-sm">조건 다시 선택하기</Link></div>}
      {!member && ranked.length > 0 ? <div className="stack">
        <RankCards ranked={ranked.slice(0, GUEST_OPEN)} budget={q.totalBudgetKrw} onOpen={open} previewOnly={previewOnly} />
        {ranked.length > GUEST_OPEN && <GuestPreview count={ranked.length - GUEST_OPEN} startRank={GUEST_OPEN + 1} returnTo={draftPreview?"/results?preview=1":undefined} />}
      </div> : <div className="stack">
        <RankCards ranked={ranked} budget={q.totalBudgetKrw} selected={split ? picked : null} onSelect={split ? setSel : undefined} onOpen={open} previewOnly={previewOnly} />
        {others.map((r) => <div key={r.region.id} className="card-soft small muted">{r.region.name}: {r.status === "데이터 부족" ? "추천에 필요한 자료를 보강하고 있어요." : "등록된 자료에서 조건에 맞는 후보를 찾지 못했어요."}</div>)}
      </div>}
      </div>
      {split && picked && <aside className="pc-detail" aria-label="선택한 권역 상세"><RegionBoard id={picked} /></aside>}
    </main>
  );
}
