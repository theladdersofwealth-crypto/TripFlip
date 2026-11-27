"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CompanionChooser } from "@/components/CompanionChooser";
import { DateEditor } from "@/components/DateEditor";
import { CONCEPTS } from "@/data/regionsV1";
import { TRAVEL_AREAS, normalizeTravelAreas, type TravelArea } from "@/data/travelAreas";
import type { Concept } from "@/data/regionsV1";
import { makeQuestionDraft, saveHomeDraft, saveQuestionPreview } from "@/lib/flow";
import { QUESTIONS, type Question } from "@/lib/questionFlow";
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

type Q=Question;
const Q_TITLE: Record<Q,string> = {who:"누구랑 가나요?",when:"언제 떠나요?",area:"가고 싶은 지역",vibe:"어떤 여행인가요?",flight:"비행은 몇 시간까지 괜찮아요?",intensity:"하루에 몇 곳 둘러볼까요?",budget:"일행 전체 예산은요?",stay:"어떤 숙소를 선호하나요?",price:"지역 물가는요?",rooms:"객실은 몇 개 필요해요?",pet:"반려동물도 함께 가나요?"};
export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState<RegionQuery | null>(null);
  const [pending, startTransition] = useTransition();
  const [flying, setFlying] = useState(false);
  const [slide,setSlide]=useState(0);
  const [answered,setAnswered]=useState<Question[]>([]);
  const [show,setShow]=useState(true);
  const [direction,setDirection]=useState<"forward"|"back">("forward");
  const dialog=useRef<HTMLDialogElement>(null);
  const body=useRef<HTMLDivElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const progress=()=>({open:null,question:0,done:[false,false,false],choice:null,slide,answered});
  useEffect(()=>{
    const draft=makeQuestionDraft();
    setQ(draft.q);setSlide(draft.slide);setAnswered(draft.answered);
  },[]);
  useEffect(()=>{if(q)saveHomeDraft(q,progress());},[q,slide,answered]);
  useEffect(()=>{
    const el=dialog.current;
    if(!q||!show||!el)return;
    if(!el.open)el.showModal();
    const old=document.body.style.overflow;document.body.style.overflow="hidden";
    return ()=>{if(el.open)el.close();document.body.style.overflow=old;};
  },[!!q,show]);
  useEffect(()=>{body.current?.scrollTo({top:0});heading.current?.focus();},[slide,show,!!q]);
  if (!q) return null;
  const dateError = travelDateError(q);
  const days = calendarDays(q.startDate, q.endDate);
  const members = membersOf(q);
  const interests = q.interests?.length ? q.interests : [q.main, ...q.subs];
  const rooms = roomEstimate(q);
  const selectedAreas = normalizeTravelAreas(q.preferredAreas);
  const hasAdult = members.some((m) => m.age === null ? m.relationship !== "child" : m.age >= 18);
  const partyError = !hasAdult ? "성인 구성원을 한 명 이상 입력해 주세요." : members.some((m) => m.relationship === "child" && m.age === null) ? "자녀의 만 나이를 입력해 주세요." : null;
  const budgetError = q.totalBudgetKrw != null && (!Number.isFinite(q.totalBudgetKrw) || q.totalBudgetKrw <= 0) ? "전체 예산은 0보다 큰 금액으로 입력해 주세요." : null;
  const error = dateError || partyError || budgetError;
  const curQ=QUESTIONS[slide];
  const mark=(k:Question)=>setAnswered(old=>old.includes(k)?old:[...old,k]);
  const patch=(value:Partial<RegionQuery>)=>{mark(curQ);setQ(old=>old?{...old,...value}:old);};
  const move=(delta:number)=>{setDirection(delta>0?"forward":"back");setSlide(n=>Math.max(0,Math.min(QUESTIONS.length-1,n+delta)));};
  const qError=(k:Q)=>k==="who"?partyError:k==="when"?dateError:k==="budget"?budgetError:null;
  const toggleArea = (area: TravelArea) => {
    const next = normalizeTravelAreas(selectedAreas.includes(area) ? selectedAreas.filter((a) => a !== area) : [...selectedAreas, area]);
    patch({ preferredAreas: next.length ? next : undefined });
  };
  const setInterests = (next: Concept[]) => patch({ interests: next, main: next[0], subs: next.slice(1) });
  // 메인은 한 번 눌러 바꾸고, 서브는 누른 순서대로 1·2·3… (다시 누르면 빠지고 뒤 번호가 당겨짐)
  const pickMain = (c: Concept) => setInterests([c, ...interests.slice(1).filter((s) => s !== c)]);
  const toggleSub = (c: Concept) => {
    const subs = interests.slice(1);
    setInterests([interests[0], ...(subs.includes(c) ? subs.filter((s) => s !== c) : [...subs, c])]);
  };
  const go=()=>{
    if(error||pending||flying)return;
    saveQuestionPreview(q,progress());
    track("search",undefined,undefined,selectedAreas);
    setFlying(true);
    startTransition(()=>router.push("/results?preview=1"));
  };
  const question = (k: Q) => {
    switch (k) {
      case "who": return <CompanionChooser members={members} error={partyError} onChange={(nx) => { mark("who"); if(nx.length!==members.length)setAnswered(old=>old.filter(k=>k!=="rooms")); setQ(normalizeParty({ ...q, members: nx, ...(nx.length !== members.length ? { roomCount: null } : {}) })); }} />;
      case "when": return <>
        <DateEditor query={q} onChange={(value)=>{mark("when");setQ(value);}} />
        {dateError ? <p className="small form-error" role="alert">{dateError}</p> : <p className="small muted">기준 일정 {days - 1}박 {days}일</p>}
      </>;
      case "area": return <>
        <p className="small muted">선택 사항 · 여러 지역을 고를 수 있어요. 선택하지 않으면 전 세계를 추천해요.</p>
        <div className="chips" role="group" aria-label="가고 싶은 지역 선택">
          <button type="button" className={`toggle-chip ${selectedAreas.length === 0 ? "on" : ""}`} aria-pressed={selectedAreas.length === 0} onClick={() => patch({ preferredAreas: undefined })}>상관없음</button>
          {TRAVEL_AREAS.map((a) => <button key={a.id} type="button" className={`toggle-chip ${selectedAreas.includes(a.id) ? "on" : ""}`} aria-pressed={selectedAreas.includes(a.id)} onClick={() => toggleArea(a.id)}>{a.label}</button>)}
        </div>
        {selectedAreas.length > 0 && <p className="xs muted">선택한 {selectedAreas.length}개 지역 안에서 점수순으로 추천해요.</p>}
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
        <div className="seg sm">{FLIGHTS.map((f) => <button key={f.label} type="button" className={(q.maxFlightHours ?? null) === f.v ? "on" : ""} aria-pressed={(q.maxFlightHours ?? null) === f.v} onClick={() => patch({ maxFlightHours: f.v })}>{f.label}</button>)}</div>
        <p className="xs muted">{selectedAreas.length ? "인천 출발 편도 기준이에요. 선택 지역 안에서는 점수순으로 추천하고 비행 부담은 점수에 반영해요." : "인천 출발 편도 기준이에요. 넘는 곳은 빼지 않고 순위 맨 뒤로 보내요."}</p>
      </>;
      case "intensity": return <div className="seg sm">{INTENSITY.map((it) => <button key={it.v} type="button" className={q.perDay === it.v ? "on" : ""} aria-pressed={q.perDay === it.v} onClick={() => patch({ perDay: it.v })}>{it.label}</button>)}</div>;
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
        <label className="stay-select"><span className="label">숙소 스타일</span><select className="input select-center" aria-label="숙소 선호" value={q.stay} onChange={(e) => patch({ stay: e.target.value as StayTier })}>{STAYS.map((s) => <option key={s}>{s}</option>)}</select></label><p className="xs muted">적정 가격대는 기존 가심비 구간이에요.</p></>;
      case "price": return <>
        <span className="label">지역 물가</span><div className="seg sm">{PRICES.map((p) => <button key={p} type="button" className={q.price === p ? "on" : ""} aria-pressed={q.price === p} onClick={() => patch({ price: p })}>{p}</button>)}</div></>;
      case "rooms": return <>
        <label className="field"><span className="label">검색할 객실 수</span><select className="input select-center" aria-label="검색할 객실 수" value={q.roomCount ?? ""} onChange={(e) => patch({ roomCount: e.target.value ? Number(e.target.value) : null })}><option value="">미정 · {rooms.rooms}객실로 추정</option>{Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}객실</option>)}</select></label><p className="xs muted">객실 정원·아동 요금은 숙소마다 달라요.</p></>;
      case "pet": return <>
        <label className="check-row small"><input type="checkbox" checked={q.pet} onChange={(e) => patch({ pet: e.target.checked })} />반려동물 동반</label>
        <p className="xs muted">객실 정원·아동 요금·반려동물 정책은 숙소마다 달라요.</p>
      </>;
    }
  };
  return <main className="container page discovery-form" style={{maxWidth:560}}>
    <h1 style={{fontSize:24,fontWeight:900}}>어디로 떠나볼까요?</h1>
    <p className="small muted">한 질문씩 고르고, 언제든 트립플립 추천을 확인해 보세요.</p>
    <button type="button" className="btn btn-primary btn-block" onClick={()=>setShow(true)}>조건 이어서 고르기</button>
    <Link href="/guide" className="home-faq-link small">자주 묻는 질문 ›</Link>
    {show && <dialog ref={dialog} className="question-dialog" aria-labelledby="slide-title" onCancel={e=>{e.preventDefault();setShow(false);}}>
      <div className="question-panel">
        <header className="question-head">
          <div className="between"><span className="small muted">질문 {slide+1}/{QUESTIONS.length} · 선택 {answered.length}개</span><button type="button" className="icon-btn" aria-label="질문 닫기" onClick={()=>setShow(false)}>×</button></div>
          <div className="question-progress" aria-hidden>{QUESTIONS.map((k,i)=><span key={k} className={i===slide?"active":answered.includes(k)?"selected":""}/>)}</div>
          <h2 id="slide-title" ref={heading} tabIndex={-1}>{Q_TITLE[curQ]}</h2>
          <p className="xs muted">{answered.includes(curQ)?"선택한 조건 반영":"미선택 · 기본값으로 추천할 수 있어요."}</p>
        </header>
        <div ref={body} className="question-scroll">
          <div key={curQ} className={"question-content "+direction}>{question(curQ)}</div>
          {!answered.includes(curQ)&&<button type="button" className="btn btn-block" disabled={!!qError(curQ)} onClick={()=>mark(curQ)}>현재 조건 선택</button>}
          {error && <p className="small form-error" role="alert">{error} <span>이전 질문에서 수정할 수 있어요.</span></p>}
        </div>
        <footer className="question-actions">
          <div>{slide>0&&<button type="button" className="btn btn-block" onClick={()=>move(-1)}>이전</button>}</div>
          <button type="button" className="btn btn-primary btn-block" disabled={!!error||pending||flying} onClick={go}><Icon name="plane"/> 트립플립 추천</button>
          <div>{slide<QUESTIONS.length-1&&<button type="button" className="btn btn-block" disabled={!!qError(curQ)} onClick={()=>move(1)}>다음</button>}</div>
        </footer>
        {flying&&<p className="xs muted" role="status">여행지를 찾는 중…</p>}
      </div>
    </dialog>}
  </main>;
}
