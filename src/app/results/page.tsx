"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { TEMP_GRADE } from "@/data/regionsV1";
import { useFlowQuery } from "@/lib/flow";
import { coreInterests, membersOf } from "@/lib/travelParty";
import { scoreRegions, tripDays } from "@/services/regionScore";

const HERO = ["#102f54,#00838c", "#1d497d,#00acb8", "#0b3a5b,#0ca678", "#3b2f63,#00838c", "#5a3a1a,#d9822b", "#102f54,#7a4fb5"];
function heroBg(country: string) {
  let h = 0;
  for (const ch of country) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `linear-gradient(135deg,${HERO[h % HERO.length]})`;
}
function budgetLine(total: number | null, budget: number | null | undefined) {
  if (budget == null) return "예산 미정";
  if (total == null) return "비교 불가";
  const diff = Math.round((budget - total) / 10000);
  return diff >= 0 ? `${diff.toLocaleString()}만원 여유` : `${(-diff).toLocaleString()}만원 초과`;
}

export default function ResultsPage() {
  const router = useRouter();
  const q = useFlowQuery();
  const results = useMemo(() => (q ? scoreRegions(q) : []), [q]);
  if (!q) return null;
  const ranked = results.filter((r) => r.status === "ranked").slice(0, 10);
  const others = results.filter((r) => (r.status === "데이터 부족" || r.status === "조건 충족 장소 없음") && !r.region.tier);
  const days = tripDays(q.startDate, q.endDate);
  const members = membersOf(q);
  const excludedBudget = results.filter((r) => r.status === "예산 밖").length;
  const who = [`성인 ${q.adults}명`, q.children.length ? `자녀 ${q.children.length}명` : "", q.pet ? "반려동물" : ""].filter(Boolean).join(" · ");
  return (
    <main className="container page" style={{ maxWidth: 560 }}>
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
      <div className="stack">
        {ranked.map((r, i) => (
          <button key={r.region.id} className={`rank-card reveal ${i === 0 ? "first" : ""}`} style={{ animationDelay: `${i * 0.08}s` }} onClick={() => router.push(`/r/${r.region.id}`)}>
            <div className="rank-hero" style={{ background: heroBg(r.region.country) }}>
              <div className="between" style={{ width: "100%" }}>
                <span className="rank-pill">{i === 0 ? "🏆 " : ""}{r.rank}위 추천{r.weather.judge === "좋음" ? ` · ${r.weather.month}월 날씨 좋음` : ""}</span>
                <span className="rank-match"><b className="rank-score">{Math.round(r.display)}</b>점 매칭</span>
              </div>
              <div className="rank-hero-name">{r.region.name}</div>
              <div className="rank-hero-sub">{r.region.country} · {r.weather.judge === "미확인" ? "기후 미확인" : `${r.weather.month}월 ${r.weather.judge}`} · 적합도 추정</div>
            </div>
            <div className="rank-stats">
              <div><span>일행 예상 경비</span><b>{r.stay.partyTotalKrw == null ? "미확인" : `약 ${Math.round(r.stay.partyTotalKrw / 10000).toLocaleString()}만원`}</b></div>
              <div><span>예산 대비</span><b className={r.stay.budgetStatus === "over" ? "warn" : r.stay.budgetStatus === "within" ? "ok" : ""}>{budgetLine(r.stay.partyTotalKrw, q.totalBudgetKrw)}</b></div>
              <div><span>일정 준비</span><b className={r.readiness.ready ? "ok" : "warn"}>{r.readiness.ready ? "바로 가능" : "보완 필요"}</b></div>
            </div>
            <span className="xs muted">{r.stay.nights}박 · {r.stay.rooms}객실{r.stay.roomEstimated ? " 가정" : " 검색 조건"} · 항공·숙소·식비 예상</span>
            <span className="small bold">추천 이유</span>
            <ul className="reason-list">{r.reasons.map((s) => <li key={s}>{s}</li>)}</ul>
            <span className={`badge ${r.readiness.ready ? "badge-ok" : "badge-muted"}`}>관광 후보 {Math.min(r.filled, r.N)}/{r.N}곳 · 식당 {r.readiness.meals ? `${r.readiness.meals}곳 등록` : "자료 없음"}</span>
            {!r.readiness.ready && <span className="xs muted">{r.filled < r.N ? `하루 ${q.perDay}곳 기준 ${r.N - r.filled}칸은 직접 골라야 해요. ` : ""}{r.readiness.meals < Math.ceil(r.readiness.mealsNeeded / 2) ? "식당은 아직 자료가 적어 현지에서 찾아야 해요. " : ""}자료가 부족한 것이지 여행지가 나쁘다는 뜻은 아니에요.</span>}
            {r.weather.judge === "스콜성 우기" && <span className="badge badge-warn">스콜성 우기</span>}
            {r.overFlight && <span className="badge badge-warn">희망 비행시간 초과</span>}
            <span className="row small" style={{ color: "var(--teal-dark)", fontWeight: 700 }}>날짜별 일정 보기 <Icon name="next" size={16} /></span>
          </button>
        ))}
        {others.map((r) => <div key={r.region.id} className="card-soft small muted">{r.region.name}: {r.status === "데이터 부족" ? "추천에 필요한 자료를 보강하고 있어요." : "등록된 자료에서 조건에 맞는 후보를 찾지 못했어요."}</div>)}
      </div>
      <div className="stack" style={{ marginTop: 18, gap: 6 }}>
        <Link href="/data-status" className="xs" style={{ color: "var(--teal-dark)" }}>데이터 출처와 확인 상태 보기</Link>
        {TEMP_GRADE && <p className="xs faint">장소 등급과 적합도는 추정값이에요. 자료의 양과 확인 수준은 지역마다 달라요.</p>}
        <p className="xs faint">날씨 표시는 월별 기후 경향이며 여행일의 실제 예보가 아니에요. 경비에는 현지 교통비·입장료 등이 포함되지 않아요.</p>
        {excludedBudget > 0 && <p className="xs faint">선택한 지역 물가 또는 예산 상한을 벗어난 {excludedBudget}개 권역은 결과에서 제외했어요. 실제 예약 가격은 달라질 수 있어요.</p>}
        {q.price !== "상관없음" && <p className="xs faint">지역 물가 &lsquo;{q.price}&rsquo;만 표시해요. 물가를 확인할 수 없는 {results.filter((r) => r.status === "물가 미확인").length}개 권역은 별도 확인이 필요해요.</p>}
      </div>
    </main>
  );
}
