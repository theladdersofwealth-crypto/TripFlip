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
const STEP_NAMES = ["기본", "일정 스타일", "예산·숙소"];

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState<RegionQuery | null>(null);
  const [pending, startTransition] = useTransition();
  const [flying, setFlying] = useState(false);
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [reached, setReached] = useState<1 | 2 | 3>(1);
  useEffect(() => {
    const saved = loadQuery();
    setQ(normalizeParty({ ...saved, interests: saved.interests?.length ? saved.interests : [saved.main, ...saved.subs] }));
  }, []);
  useEffect(() => {
    // 휴대폰 뒤로가기(제스처)도 이전 단계로 가게
    const onPop = (e: PopStateEvent) => { setStage((e.state?.tfStage as 1 | 2 | 3) ?? 1); window.scrollTo({ top: 0 }); };
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
  const accuracy = STEP_PCT.slice(0, reached).reduce((a, b) => a + b, 0);
  const patch = (next: Partial<RegionQuery>) => setQ({ ...q, ...next });
  const stage1Error = dateError || partyError;
  const moveTo = (to: 1 | 2 | 3) => {
    const n = Math.min(to, reached + 1) as 1 | 2 | 3; // 단계는 건너뛰지 않음
    if (n > stage && stage === 1 && stage1Error) return;
    if (n > stage) history.pushState({ ...history.state, tfStage: n }, "");
    setStage(n);
    if (n > reached) setReached(n);
    window.scrollTo({ top: 0 });
  };
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
      {stage > 1 && <button type="button" className="back-btn" onClick={() => history.back()}><Icon name="back" />이전 단계</button>}
      {stage === 1 && <>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>어디로 떠나볼까요?</h1>
      <p className="small muted form-intro">1단계만 해도 추천돼요. 2·3단계를 더하면 더 정확해져요.</p>
      <BoardingPass q={q} members={members} days={days} interests={interests} onSlot={(t) => moveTo(t === "step-3" ? 3 : 1)} />
      </>}
      <div className="stepper" role="list" aria-label="입력 단계">{STEP_NAMES.map((name, i) => <button key={name} type="button" role="listitem" className={`stepper-dot ${stage === i + 1 ? "on" : ""} ${reached > i ? "reached" : ""}`} aria-current={stage === i + 1 ? "step" : undefined} disabled={i + 1 > reached} onClick={() => moveTo((i + 1) as 1 | 2 | 3)}><b>{i + 1}</b>{name}</button>)}</div>
      <div className="accuracy" aria-label={`추천 정확도 ${accuracy}%`}>
        <div className="accuracy-head"><b>추천 정확도 {accuracy}%</b><span className="xs muted">{accuracy < 100 ? "단계를 더할수록 더 정확해져요" : "모든 단계 반영 완료"}</span></div>
        <div className="accuracy-bar"><span style={{ width: `${accuracy}%` }} /></div>
      </div>
      {stage === 1 && <section className="q-block step-card" id="step-1">
        <span className="step-badge">1단계 · 기본 · 정확도 {STEP_PCT[0]}%</span>
        <p className="xs muted">이것만 해도 바로 추천받을 수 있어요.</p>
        <h2>누구랑 가나요?</h2>
        <CompanionChooser members={members} error={partyError} onChange={(next) => setQ(normalizeParty({ ...q, members: next, ...(next.length !== members.length ? { roomCount: null } : {}) }))} />
        <DateEditor query={q} onChange={setQ} />
        {dateError ? <p className="small form-error" role="alert">{dateError}</p> : <p className="small muted">기준 일정 {days - 1}박 {days}일</p>}
        <h2>어떤 여행인가요?</h2>
        <span className="label">원하는 경험 · 여러 개 선택</span>
        <div className="chips">{CONCEPTS.map((c) => <button key={c} type="button" className={`toggle-chip ${interests.includes(c) ? "on" : ""}`} aria-pressed={interests.includes(c)} onClick={() => toggleInterest(c)}>{c}</button>)}</div>
      </section>}
      {stage === 2 && <section className="q-block step-card" id="step-2">
        <span className="step-badge">2단계 · 일정 스타일 · +{STEP_PCT[1]}%</span>
        <h2>일정은 어떻게 짤까요?</h2>
        <span className="label">희망 비행시간 (인천 출발 편도, 이내)</span>
        <div className="seg sm">{FLIGHTS.map((f) => <button key={f.label} type="button" className={(q.maxFlightHours ?? null) === f.v ? "on" : ""} aria-pressed={(q.maxFlightHours ?? null) === f.v} onClick={() => patch({ maxFlightHours: f.v })}>{f.label}</button>)}</div>
        <p className="xs muted">넘는 곳은 빼지 않고 순위 맨 뒤로 보내요.</p>
        <span className="label">하루 관광 강도</span>
        <div className="seg sm">{INTENSITY.map((it) => <button key={it.v} type="button" className={q.perDay === it.v ? "on" : ""} aria-pressed={q.perDay === it.v} onClick={() => patch({ perDay: it.v })}>{it.label}</button>)}</div>
      </section>}
      {stage === 3 && <section className="q-block step-card" id="step-3">
        <span className="step-badge">3단계 · 예산·숙소 · +{STEP_PCT[2]}%</span>
        <h2>예산과 숙소는요?</h2>
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
      </section>}
      <div className="sticky-cta"><p className="xs muted form-total">{Number.isFinite(days) ? `${days - 1}박 ${days}일` : "날짜 선택"} · {members.length}명 · {interests.join("·")}</p>
        {stage < 3 && <button type="button" className="btn btn-block next-step" disabled={!!stage1Error} onClick={() => moveTo((stage + 1) as 2 | 3)}>{stage + 1}단계로 더 정확하게 (+{STEP_PCT[stage]}%) →</button>}
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
