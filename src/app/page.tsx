"use client";
import { useEffect, useRef, useState, useTransition } from "react";
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
import { track } from "@/lib/analytics";
import type { IntensityV1, PriceLevel, RegionQuery, StayTier } from "@/services/regionScore";

const INTENSITY: { v: IntensityV1; label: string }[] = [
  { v: 1, label: "여유롭게 · 1곳" }, { v: 2, label: "보통 · 2곳" }, { v: 3, label: "알차게 · 3곳" },
];
const PRICES: PriceLevel[] = ["저렴", "보통", "높음", "상관없음"];
const STAYS: StayTier[] = ["가성비", "가심비", "프리미엄", "하이엔드"];

const FLIGHTS: { v: number | null; label: string }[] = [{ v: 5, label: "5시간" }, { v: 8, label: "8시간" }, { v: 12, label: "12시간" }, { v: null, label: "상관없음" }];

type Q = "who" | "when" | "vibe" | "flight" | "intensity" | "budget" | "stay";
// 형님 흐름(11/23): 1단계 → 2단계 → 3단계를 세로로 보여주고, 단계 안 질문은 하나씩 차례로
const STEPS: { title: string; sub: string; pct: number; qs: Q[] }[] = [
  { title: "기본", sub: "누구와 · 언제 · 여행 취향", pct: 60, qs: ["who", "when", "vibe"] },
  { title: "일정 스타일", sub: "비행시간 · 하루 강도", pct: 20, qs: ["flight", "intensity"] },
  { title: "예산·숙소", sub: "예산 · 숙소 · 물가 · 객실", pct: 20, qs: ["budget", "stay"] },
];
const Q_TITLE: Record<Q, string> = { who: "누구랑 가나요?", when: "언제 떠나요?", vibe: "어떤 여행인가요?", flight: "비행은 몇 시간까지 괜찮아요?", intensity: "하루에 몇 곳 둘러볼까요?", budget: "일행 전체 예산은요?", stay: "숙소·물가는요?" };
const Q_SHORT: Record<Q, string> = { who: "누구와", when: "언제", vibe: "취향", flight: "비행시간", intensity: "하루 강도", budget: "예산", stay: "숙소" };

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState<RegionQuery | null>(null);
  const [pending, startTransition] = useTransition();
  const [flying, setFlying] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  const [qi, setQi] = useState(0);
  const [done, setDone] = useState([false, false, false]);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const moved = useRef(false);
  useEffect(() => {
    const saved = loadQuery();
    setQ(normalizeParty({ ...saved, interests: saved.interests?.length ? saved.interests : [saved.main, ...saved.subs] }));
  }, []);
  useEffect(() => {
    // 처음 열 때는 그대로, 질문이 바뀔 때만 그 단계로 화면을 맞춤
    if (!moved.current || open == null) return;
    stepRefs.current[open]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open, qi]);
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
  const accuracy = STEPS.reduce((n, s, i) => n + (done[i] ? s.pct : 0), 0);
  const patch = (next: Partial<RegionQuery>) => setQ({ ...q, ...next });
  const qError = (k: Q) => k === "who" ? partyError : k === "when" ? dateError : k === "budget" ? budgetError : null;
  const kids = members.filter((m) => m.relationship === "child").length;
  const answer = (k: Q): string => {
    switch (k) {
      case "who": return `${members.length}명 · 성인 ${members.length - kids}${kids ? ` · 자녀 ${kids}` : ""}`;
      case "when": return Number.isFinite(days) ? `${days - 1}박 ${days}일` : "날짜 선택";
      case "vibe": return interests.join("·");
      case "flight": return FLIGHTS.find((f) => f.v === (q.maxFlightHours ?? null))?.label ?? "상관없음";
      case "intensity": return INTENSITY.find((it) => it.v === q.perDay)?.label ?? "-";
      case "budget": return q.totalBudgetKrw == null ? "아직 미정" : `${Math.round(q.totalBudgetKrw / 10000).toLocaleString()}만원${q.budgetMode === "cap" ? " 이내" : ""}`;
      case "stay": return `${q.stay} · 물가 ${q.price}`;
    }
  };
  const openStep = (i: number, at = 0) => { moved.current = true; setOpen(i); setQi(at); };
  const next = () => {
    if (open == null) return;
    moved.current = true;
    if (qi < STEPS[open].qs.length - 1) { setQi(qi + 1); return; }
    setDone(done.map((d, i) => (i === open ? true : d)));
    setOpen(null);
    setQi(0);
  };
  // 하나만 고르면 되는 질문은 누르면 바로 다음으로
  const pickAndNext = (next2: Partial<RegionQuery>) => { patch(next2); next(); };
  const setInterests = (next: Concept[]) => setQ({ ...q, interests: next, main: next[0], subs: next.slice(1) });
  // 메인은 한 번 눌러 바꾸고, 서브는 누른 순서대로 1·2·3… (다시 누르면 빠지고 뒤 번호가 당겨짐)
  const pickMain = (c: Concept) => setInterests([c, ...interests.slice(1).filter((s) => s !== c)]);
  const toggleSub = (c: Concept) => {
    const subs = interests.slice(1);
    setInterests([interests[0], ...(subs.includes(c) ? subs.filter((s) => s !== c) : [...subs, c])]);
  };
  const go = () => {
    if (error || pending || flying || !done[0]) return;
    saveQuery(normalizeParty(q));
    track("search");
    setFlying(true); // 비행기 회전 로딩(형님 흐름 ②)을 보여준 뒤 결과로 이동
    router.prefetch("/results");
    setTimeout(() => startTransition(() => router.push("/results")), 1800);
  };
  const curQ = open == null ? null : STEPS[open].qs[qi];
  const activeSlot = curQ === "who" || curQ === "when" || curQ === "vibe" ? curQ : curQ === "intensity" ? "vibe" : curQ === "budget" || curQ === "stay" ? "s3" : null;
  const slotJump = (t: string) => { if (t === "s3") openStep(2); else openStep(0, Math.max(0, STEPS[0].qs.indexOf(t as Q))); };
  const question = (k: Q) => {
    switch (k) {
      case "who": return <CompanionChooser members={members} error={partyError} onChange={(nx) => setQ(normalizeParty({ ...q, members: nx, ...(nx.length !== members.length ? { roomCount: null } : {}) }))} />;
      case "when": return <>
        <DateEditor query={q} onChange={setQ} />
        {dateError ? <p className="small form-error" role="alert">{dateError}</p> : <p className="small muted">기준 일정 {days - 1}박 {days}일</p>}
      </>;
      case "vibe": return <>
        <span className="label">메인 테마 · 1개</span>
        <p className="xs muted">여행지를 고를 때 가장 크게 반영해요. 누르면 바로 바뀌어요.</p>
        <div className="chips">{CONCEPTS.map((c) => { const isMain = interests[0] === c; return <button key={c} type="button" aria-label={`메인 ${c}`} className={`toggle-chip ${isMain ? "on main" : ""}`} aria-pressed={isMain} onClick={() => pickMain(c)}>{c}</button>; })}</div>
        <span className="label" style={{ marginTop: 14, display: "block" }}>서브 테마 · 누른 순서대로</span>
        <p className="xs muted">서브1 → 서브2 → 서브3 순서로 반영 비중이 줄어요. 다시 누르면 빠져요.</p>
        <div className="chips">{CONCEPTS.filter((c) => c !== interests[0]).map((c) => { const n = interests.indexOf(c); return <button key={c} type="button" aria-label={c} className={`toggle-chip ${n > 0 ? "on also" : ""}`} aria-pressed={n > 0} onClick={() => toggleSub(c)}>{n > 0 && <span className="sub-num" aria-hidden>{n}</span>}{c}</button>; })}</div>
        <p className="small"><b>메인 · {interests[0]}</b>{interests.slice(1).map((c, i) => <span key={c} className="muted"> · 서브{i + 1} {c}</span>)}</p>
      </>;
      case "flight": return <>
        <div className="seg sm">{FLIGHTS.map((f) => <button key={f.label} type="button" className={(q.maxFlightHours ?? null) === f.v ? "on" : ""} aria-pressed={(q.maxFlightHours ?? null) === f.v} onClick={() => pickAndNext({ maxFlightHours: f.v })}>{f.label}</button>)}</div>
        <p className="xs muted">인천 출발 편도 기준이에요. 넘는 곳은 빼지 않고 순위 맨 뒤로 보내요.</p>
      </>;
      case "intensity": return <div className="seg sm">{INTENSITY.map((it) => <button key={it.v} type="button" className={q.perDay === it.v ? "on" : ""} aria-pressed={q.perDay === it.v} onClick={() => pickAndNext({ perDay: it.v })}>{it.label}</button>)}</div>;
      case "budget": return <>
        <div className="chips">
          <button type="button" className={`toggle-chip ${q.totalBudgetKrw == null ? "on" : ""}`} aria-pressed={q.totalBudgetKrw == null} onClick={() => patch({ totalBudgetKrw: null })}>아직 미정</button>
          <button type="button" className={`toggle-chip ${q.totalBudgetKrw != null && q.budgetMode !== "cap" ? "on" : ""}`} aria-pressed={q.totalBudgetKrw != null && q.budgetMode !== "cap"} onClick={() => patch({ totalBudgetKrw: q.totalBudgetKrw ?? 10000000, budgetMode: "flexible" })}>대략 이 정도</button>
          <button type="button" className={`toggle-chip ${q.totalBudgetKrw != null && q.budgetMode === "cap" ? "on" : ""}`} aria-pressed={q.totalBudgetKrw != null && q.budgetMode === "cap"} onClick={() => patch({ totalBudgetKrw: q.totalBudgetKrw ?? 10000000, budgetMode: "cap" })}>상한 금액</button>
        </div>
        {q.totalBudgetKrw != null && <label className="budget-input"><input className="input" type="number" inputMode="numeric" min={1} step={10} aria-label="일행 전체 예산 만원" value={q.totalBudgetKrw / 10000} onChange={(e) => patch({ totalBudgetKrw: e.target.value === "" ? 0 : Number(e.target.value) * 10000 })} /><span>만원 / 전체</span></label>}
        {budgetError && <p className="small form-error" role="alert">{budgetError}</p>}
      </>;
      case "stay": return <>
        <label className="stay-select"><span className="label">숙소 스타일</span><select className="input" aria-label="숙소 선호" value={q.stay} onChange={(e) => patch({ stay: e.target.value as StayTier })}>{STAYS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <span className="label">지역 물가</span><div className="seg sm">{PRICES.map((p) => <button key={p} type="button" className={q.price === p ? "on" : ""} aria-pressed={q.price === p} onClick={() => patch({ price: p })}>{p}</button>)}</div>
        <label className="field"><span className="label">검색할 객실 수</span><select className="input" aria-label="검색할 객실 수" value={q.roomCount ?? ""} onChange={(e) => patch({ roomCount: e.target.value ? Number(e.target.value) : null })}><option value="">미정 · {rooms.rooms}객실로 추정</option>{Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}객실</option>)}</select></label>
        <label className="check-row small"><input type="checkbox" checked={q.pet} onChange={(e) => patch({ pet: e.target.checked })} />반려동물 동반</label>
        <p className="xs muted">객실 정원·아동 요금·반려동물 정책은 숙소마다 달라요.</p>
      </>;
    }
  };
  return (
    <main className="container page discovery-form" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>어디로 떠나볼까요?</h1>
      <p className="small muted form-intro">1단계만 답하면 바로 추천받을 수 있어요. 2·3단계를 더하면 더 정확해져요.</p>
      <div className="bp-sticky"><BoardingPass compact q={q} members={members} days={days} interests={interests} active={activeSlot} onSlot={slotJump} /></div>
      <ol className="flow-steps">
        {STEPS.map((s, i) => {
          const isOpen = open === i;
          const locked = i > 0 && !done[0];
          const k = s.qs[qi];
          return (
            <li key={s.title} ref={(el) => { stepRefs.current[i] = el; }} className={`flow-step ${isOpen ? "open" : ""} ${done[i] ? "done" : ""} ${locked ? "locked" : ""}`}>
              <button type="button" className="flow-step-head" disabled={locked} aria-expanded={isOpen} onClick={() => (isOpen ? setOpen(null) : openStep(i))}>
                <b className="flow-dot">{done[i] ? "✓" : i + 1}</b>
                <span className="flow-step-text"><strong>{i + 1}단계 · {s.title}</strong><small>{done[i] && !isOpen ? s.qs.map(answer).join(" · ") : s.sub}</small></span>
                <em>{done[i] ? (isOpen ? "" : "수정") : i === 0 ? (isOpen ? `${qi + 1}/${s.qs.length}` : "") : locked ? "1단계 먼저" : isOpen ? `${qi + 1}/${s.qs.length}` : `+${s.pct}% 열기`}</em>
              </button>
              {isOpen && <div className="flow-step-body">
                {s.qs.slice(0, qi).map((pk, j) => <button key={pk} type="button" className="flow-answered" onClick={() => openStep(i, j)}><span>{Q_SHORT[pk]}</span><b>{answer(pk)}</b><em>변경</em></button>)}
                <h2 className="flow-q">{Q_TITLE[k]}</h2>
                <div className="pop-body">{question(k)}</div>
                <button type="button" className="btn btn-primary btn-block flow-next" disabled={!!qError(k)} onClick={next}>
                  {qi < s.qs.length - 1 ? `다음 · ${Q_SHORT[s.qs[qi + 1]]} →` : `${i + 1}단계 완료${done[i] ? "" : ` (+${s.pct}%)`}`}
                </button>
              </div>}
            </li>
          );
        })}
      </ol>
      <div className="accuracy" aria-label={`추천 정확도 ${accuracy}%`}>
        <div className="accuracy-head"><b>추천 정확도 {accuracy}%</b><span className="xs muted">{!done[0] ? "1단계를 마치면 추천받을 수 있어요" : accuracy < 100 ? "단계를 더할수록 더 정확해져요" : "모든 단계 반영 완료"}</span></div>
        <div className="accuracy-bar"><span style={{ width: `${accuracy}%` }} /></div>
      </div>
      {done[0] && <div className="sticky-cta"><p className="xs muted form-total">{Number.isFinite(days) ? `${days - 1}박 ${days}일` : "날짜 선택"} · {members.length}명 · {interests.join("·")}</p>
        <button className="btn btn-primary btn-lg btn-block" disabled={!!error || pending} onClick={go}><Icon name="plane" /> {pending ? "여행지를 찾는 중…" : `여행지 추천받기 · 정확도 ${accuracy}%`}</button>
      </div>}
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
