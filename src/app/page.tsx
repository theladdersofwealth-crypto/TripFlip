"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { CompanionChooser } from "@/components/CompanionChooser";
import { DateEditor } from "@/components/DateEditor";
import { BoardingPass } from "@/components/BoardingPass";
import { CONCEPTS } from "@/data/regionsV1";
import type { Concept } from "@/data/regionsV1";
import { loadQuery, saveQuery } from "@/lib/flow";
import { membersOf, normalizeParty, roomEstimate } from "@/lib/travelParty";
import { calendarDays, travelDateError } from "@/lib/travelDates";
import type { IntensityV1, PriceLevel, RegionQuery, StayTier } from "@/services/regionScore";

const INTENSITY: { v: IntensityV1; label: string }[] = [
  { v: 1, label: "여유롭게 · 1곳" }, { v: 2, label: "보통 · 2곳" }, { v: 3, label: "알차게 · 3곳" },
];
const PRICES: PriceLevel[] = ["저렴", "보통", "높음", "상관없음"];
const STAYS: StayTier[] = ["가성비", "가심비", "프리미엄", "하이엔드"];

const FLIGHTS: { v: number | null; label: string }[] = [{ v: 5, label: "5시간" }, { v: 8, label: "8시간" }, { v: 12, label: "12시간" }, { v: null, label: "상관없음" }];

const STEP_PCT = [60, 20, 20];
type Pop = "who" | "when" | "vibe" | "s2" | "s3";
const POP_TITLE: Record<Pop, string> = { who: "누구랑 가나요?", when: "여행 날짜", vibe: "어떤 여행인가요?", s2: "2단계 · 일정 스타일", s3: "3단계 · 예산·숙소" };

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState<RegionQuery | null>(null);
  const [pending, startTransition] = useTransition();
  const [flying, setFlying] = useState(false);
  const [pop, setPop] = useState<Pop | null>(null);
  const [done, setDone] = useState({ s2: false, s3: false });
  useEffect(() => {
    const saved = loadQuery();
    setQ(normalizeParty({ ...saved, interests: saved.interests?.length ? saved.interests : [saved.main, ...saved.subs] }));
  }, []);
  useEffect(() => {
    // 팝업은 휴대폰 뒤로가기(제스처)로도 닫히게
    const onPop = (e: PopStateEvent) => setPop((e.state?.tfPop as Pop) ?? null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  if (!q) return null;
  const dateError = travelDateError(q);
  const days = calendarDays(q.startDate, q.endDate);
  const members = membersOf(q);
  const interests = q.interests?.length ? q.interests : [q.main, ...q.subs];
  const rooms = roomEstimate(q);
  const hasAdult = members.some((m) => m.age === null ? m.relationship !== "child" : m.age >= 18);
  const partyError = !hasAdult ? "성인 구성원을 한 명 이상 입력해 주세요." : members.some((m) => m.relationship === "child" && m.age === null) ? "자녀의 만 나이를 입력해 주세요." : null;
  const budgetError = q.totalBudgetKrw != null && (!Number.isFinite(q.totalBudgetKrw) || q.totalBudgetKrw <= 0) ? "전체 예산은 0보다 큰 금액으로 입력해 주세요." : null;
  const error = dateError || partyError || budgetError;
  const accuracy = STEP_PCT[0] + (done.s2 ? STEP_PCT[1] : 0) + (done.s3 ? STEP_PCT[2] : 0);
  const patch = (next: Partial<RegionQuery>) => setQ({ ...q, ...next });
  const openPop = (p: Pop) => { history.pushState({ ...history.state, tfPop: p }, ""); setPop(p); };
  const closePop = () => { if (history.state?.tfPop) history.back(); else setPop(null); };
  const finishPop = () => {
    if (pop === "s2" || pop === "s3") setDone({ ...done, [pop]: true });
    closePop();
  };
  // 2단계 반영 후 같은 팝업에서 바로 3단계로 이어감
  const continueToS3 = () => {
    setDone({ ...done, s2: true });
    history.replaceState({ ...history.state, tfPop: "s3" }, "");
    setPop("s3");
  };
  // 팝업에서 바로 여행지 찾기
  const searchNow = () => {
    if (error) return;
    if (pop === "s2" || pop === "s3") setDone({ ...done, [pop]: true });
    history.replaceState({ ...history.state, tfPop: null }, "");
    setPop(null);
    go();
  };
  const popError = pop === "who" ? partyError : pop === "when" ? dateError : pop === "s3" ? budgetError : null;
  const nextStep: Pop | null = !done.s2 ? "s2" : !done.s3 ? "s3" : null;
  const toggleInterest = (c: Concept) => {
    const next = interests.includes(c) ? interests.filter((s) => s !== c) : [...interests, c];
    if (!next.length) return;
    setQ({ ...q, interests: next, main: next[0], subs: next.slice(1) });
  };
  const go = () => {
    if (error || pending || flying) return;
    saveQuery(normalizeParty(q));
    setFlying(true); // 비행기 회전 로딩(형님 흐름 ②)을 보여준 뒤 결과로 이동
    router.prefetch("/results");
    setTimeout(() => startTransition(() => router.push("/results")), 1800);
  };
  return (
    <main className="container page discovery-form" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>어디로 떠나볼까요?</h1>
      <p className="small muted form-intro">칸을 눌러 바꿔요. 1단계만 해도 추천되고, 2·3단계를 더하면 더 정확해져요.</p>
      <BoardingPass q={q} members={members} days={days} interests={interests} hint="칸을 누르면 바꿀 수 있어요." onSlot={(t) => openPop(t as Pop)} />
      <div className="accuracy" aria-label={`추천 정확도 ${accuracy}%`}>
        <div className="accuracy-head"><b>추천 정확도 {accuracy}%</b><span className="xs muted">{accuracy < 100 ? "단계를 더할수록 더 정확해져요" : "모든 단계 반영 완료"}</span></div>
        <div className="accuracy-bar"><span style={{ width: `${accuracy}%` }} /></div>
      </div>
      <div className="step-rows">
        <div className="step-row done"><b>1</b><span>기본 · 누구와·언제·경험</span><em>✓ {STEP_PCT[0]}%</em></div>
        <button type="button" className={`step-row ${done.s2 ? "done" : ""}`} onClick={() => openPop("s2")}><b>2</b><span>일정 스타일 · 비행시간·하루 강도</span><em>{done.s2 ? "✓ 반영" : `+${STEP_PCT[1]}%`}</em></button>
        <button type="button" className={`step-row ${done.s3 ? "done" : ""}`} onClick={() => openPop("s3")}><b>3</b><span>예산·숙소 · 예산·숙소·물가·객실</span><em>{done.s3 ? "✓ 반영" : `+${STEP_PCT[2]}%`}</em></button>
      </div>
      {pop && <div className="center-modal-back" onClick={closePop}>
        <div className="center-modal" role="dialog" aria-modal="true" aria-label={POP_TITLE[pop]} onClick={(e) => e.stopPropagation()}>
        <div className="center-modal-head"><h3>{POP_TITLE[pop]}</h3><button type="button" className="icon-btn" onClick={closePop} aria-label="닫기"><Icon name="x" /></button></div>
        <div className="pop-body">
          {pop === "who" && <>
        <CompanionChooser members={members} error={partyError} onChange={(next) => setQ(normalizeParty({ ...q, members: next, ...(next.length !== members.length ? { roomCount: null } : {}) }))} />
          </>}
          {pop === "when" && <>
        <DateEditor query={q} onChange={setQ} />
        {dateError ? <p className="small form-error" role="alert">{dateError}</p> : <p className="small muted">기준 일정 {days - 1}박 {days}일</p>}
          </>}
          {pop === "vibe" && <>
        <span className="label">원하는 경험 · 여러 개 선택</span>
        <p className="xs muted">처음 고른 테마가 메인이에요. 메인을 바꾸려면 눌러서 끈 뒤 다시 고르세요.</p>
        <div className="chips">{CONCEPTS.map((c) => { const on = interests.includes(c); const isMain = interests[0] === c; return <button key={c} type="button" aria-label={c} className={`toggle-chip ${on ? "on" : ""} ${on && !isMain ? "also" : ""} ${isMain ? "main" : ""}`} aria-pressed={on} onClick={() => toggleInterest(c)}>{c}{isMain && <span className="main-tag" aria-hidden>메인</span>}</button>; })}</div>
        <p className="small"><b>메인 테마 · {interests[0]}</b>{interests.length > 1 && <span className="muted"> + {interests.slice(1).join(" · ")}</span>}</p>
          </>}
          {pop === "s2" && <>
        <span className="label">희망 비행시간 (인천 출발 편도, 이내)</span>
        <div className="seg sm">{FLIGHTS.map((f) => <button key={f.label} type="button" className={(q.maxFlightHours ?? null) === f.v ? "on" : ""} aria-pressed={(q.maxFlightHours ?? null) === f.v} onClick={() => patch({ maxFlightHours: f.v })}>{f.label}</button>)}</div>
        <p className="xs muted">넘는 곳은 빼지 않고 순위 맨 뒤로 보내요.</p>
        <span className="label">하루 관광 강도</span>
        <div className="seg sm">{INTENSITY.map((it) => <button key={it.v} type="button" className={q.perDay === it.v ? "on" : ""} aria-pressed={q.perDay === it.v} onClick={() => patch({ perDay: it.v })}>{it.label}</button>)}</div>
          </>}
          {pop === "s3" && <>
        <span className="label">일행 전체 여행 예산</span>
        <div className="chips">
          <button type="button" className={`toggle-chip ${q.totalBudgetKrw == null ? "on" : ""}`} aria-pressed={q.totalBudgetKrw == null} onClick={() => patch({ totalBudgetKrw: null })}>아직 미정</button>
          <button type="button" className={`toggle-chip ${q.totalBudgetKrw != null && q.budgetMode !== "cap" ? "on" : ""}`} aria-pressed={q.totalBudgetKrw != null && q.budgetMode !== "cap"} onClick={() => patch({ totalBudgetKrw: q.totalBudgetKrw ?? 10000000, budgetMode: "flexible" })}>대략 이 정도</button>
          <button type="button" className={`toggle-chip ${q.totalBudgetKrw != null && q.budgetMode === "cap" ? "on" : ""}`} aria-pressed={q.totalBudgetKrw != null && q.budgetMode === "cap"} onClick={() => patch({ totalBudgetKrw: q.totalBudgetKrw ?? 10000000, budgetMode: "cap" })}>상한 금액</button>
        </div>
        {q.totalBudgetKrw != null && <label className="budget-input"><input className="input" type="number" inputMode="numeric" min={1} step={10} aria-label="일행 전체 예산 만원" value={q.totalBudgetKrw / 10000} onChange={(e) => patch({ totalBudgetKrw: e.target.value === "" ? 0 : Number(e.target.value) * 10000 })} /><span>만원 / 전체</span></label>}
        {budgetError && <p className="small form-error" role="alert">{budgetError}</p>}
        <label className="stay-select"><span className="label">숙소 스타일</span><select className="input" aria-label="숙소 선호" value={q.stay} onChange={(e) => patch({ stay: e.target.value as StayTier })}>{STAYS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <span className="label">지역 물가</span><div className="seg sm">{PRICES.map((p) => <button key={p} type="button" className={q.price === p ? "on" : ""} aria-pressed={q.price === p} onClick={() => patch({ price: p })}>{p}</button>)}</div>
        <label className="field"><span className="label">검색할 객실 수</span><select className="input" aria-label="검색할 객실 수" value={q.roomCount ?? ""} onChange={(e) => patch({ roomCount: e.target.value ? Number(e.target.value) : null })}><option value="">미정 · {rooms.rooms}객실로 추정</option>{Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}객실</option>)}</select></label>
        <label className="check-row small"><input type="checkbox" checked={q.pet} onChange={(e) => patch({ pet: e.target.checked })} />반려동물 동반</label>
        <p className="xs muted">객실 정원·아동 요금·반려동물 정책은 숙소마다 달라요.</p>
          </>}
        </div>
        <div className="center-modal-foot">
          {pop === "s2" && <>
            <button type="button" className="btn btn-primary btn-block" onClick={continueToS3}>3단계 이어서 입력 (+{STEP_PCT[2]}%) →</button>
            <button type="button" className="btn btn-block" disabled={!!error} onClick={searchNow}><Icon name="plane" /> 이대로 여행지 찾기 · 정확도 {STEP_PCT[0] + STEP_PCT[1] + (done.s3 ? STEP_PCT[2] : 0)}%</button>
          </>}
          {pop === "s3" && <button type="button" className="btn btn-primary btn-block" disabled={!!error} onClick={searchNow}><Icon name="plane" /> 여행지 찾기 · 정확도 {STEP_PCT[0] + (done.s2 ? STEP_PCT[1] : 0) + STEP_PCT[2]}%</button>}
          {pop !== "s2" && pop !== "s3" && <button type="button" className="btn btn-primary btn-block" disabled={!!popError} onClick={finishPop}>완료</button>}
        </div>
        </div>
      </div>}
      <div className="sticky-cta"><p className="xs muted form-total">{Number.isFinite(days) ? `${days - 1}박 ${days}일` : "날짜 선택"} · {members.length}명 · {interests.join("·")}</p>
        {nextStep && <button type="button" className="btn btn-block next-step" onClick={() => openPop(nextStep)}>{nextStep === "s2" ? 2 : 3}단계로 더 정확하게 (+{STEP_PCT[nextStep === "s2" ? 1 : 2]}%) →</button>}
        <button className="btn btn-primary btn-lg btn-block" disabled={!!error || pending} onClick={go}><Icon name="plane" /> {pending ? "여행지를 찾는 중…" : `여행지 추천받기 · 정확도 ${accuracy}%`}</button>
      </div>
      {flying && (
        <div className="plane-overlay" role="status">
          <div className="plane-orbit">
            <span className="plane">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" /></svg>
            </span>
          </div>
          <p>나에게 맞는 여행지를 찾는 중…</p>
        </div>
      )}
    </main>
  );
}
