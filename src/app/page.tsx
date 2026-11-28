"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CompanionChooser } from "@/components/CompanionChooser";
import { DateEditor } from "@/components/DateEditor";
import { CONCEPTS } from "@/data/regionsV1";
import { TRAVEL_AREAS, normalizeTravelAreas, travelAreaOf, type TravelArea } from "@/data/travelAreas";
import { AUTH_EVENT, loadAuth } from "@/lib/account";
import { resultThemes, withResultThemes } from "@/lib/resultThemes";
import type { Concept } from "@/data/regionsV1";
import { makeQuestionDraft, saveHomeDraft, saveQuestionPreview } from "@/lib/flow";
import { QUESTIONS, type Question } from "@/lib/questionFlow";
import { membersOf, normalizeParty, roomEstimate } from "@/lib/travelParty";
import { budgetManwon, perTravelerKrw, totalBudgetFromManwon } from "@/lib/travelBudget";
import { calendarDays, travelDateError } from "@/lib/travelDates";
import { track } from "@/lib/analytics";
import { FlagBg } from "@/components/FlagBg";
import { ALL_REGIONS, estimateFlightHours } from "@/services/regionScore";
import type { IntensityV1, PriceLevel, RegionQuery, StayTier } from "@/services/regionScore";

const INTENSITY: { v: IntensityV1; label: string }[] = [
  { v: 1, label: "여유롭게 · 1곳" }, { v: 2, label: "보통 · 2곳" }, { v: 3, label: "알차게 · 3곳" },
];
const PRICES: PriceLevel[] = ["저렴", "보통", "높음", "상관없음"];
const STAYS: StayTier[] = ["가성비", "가심비", "프리미엄", "하이엔드"];

const FLIGHTS: { v: number | null; label: string }[] = [{ v: 5, label: "5시간" }, { v: 8, label: "8시간" }, { v: 12, label: "12시간" }, { v: null, label: "상관없음" }];

type Q=Question;
// 첫 화면 콘텐츠(11/27 형님: "맨 처음 버전처럼 뭐가 좀 있어야"). 10/27 첫 버전 구성(대표 문구·큰 시작 버튼·넘겨보는 여행지·테마로 시작하기)을 기준으로 채운다.
// 여행지 카드는 '인기' 순위 데이터가 없어서 순위를 매기지 않고, 앱에 있는 권역 중 가까운 곳 위주로 고정 노출. 비행시간은 기존 추정값(estimateFlightHours).
const HOME_REGIONS = ["NT", "DN", "OS", "HK", "PQ", "tha-bangkok", "jap-tokyo", "tai-taipei"];
const THEMES: { c: Concept; icon: string; sub: string }[] = [
  { c: "관광", icon: "compass", sub: "명소·랜드마크 중심" },
  { c: "휴양", icon: "umbrella", sub: "리조트·해변에서 쉬기" },
  { c: "액티비티", icon: "sparkles", sub: "체험·투어·물놀이" },
  { c: "미식", icon: "utensils", sub: "확인된 식당 기준 맛집" },
  { c: "쇼핑", icon: "card", sub: "시장·쇼핑 거리" },
];
const HOW: { t: string; d: string }[] = [
  { t: "조건 고르기", d: "누구와 · 언제 · 어떤 여행인지 한 질문씩 골라요. 안 고른 건 기본값으로 둬요." },
  { t: "추천 순위 보기", d: "조건에 맞는 여행지를 적합도 순으로 보여 주고, 경비·비행시간도 함께 추정해요." },
  { t: "일정 · 예약", d: "날짜별 일정표를 만들고, 항공·숙소는 예약 사이트로 바로 이동해요." },
];
const Q_TITLE: Record<Q,string> = {who:"누구랑 가나요?",when:"언제 떠나요?",area:"가고 싶은 지역",vibe:"어떤 여행인가요?",flight:"비행은 몇 시간까지 괜찮아요?",intensity:"하루에 몇 곳 둘러볼까요?",budget:"1인당 여행 예산은요?",stay:"어떤 숙소를 선호하나요?",price:"지역 물가는요?",rooms:"객실은 몇 개 필요해요?",pet:"반려동물도 함께 가나요?"};
export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState<RegionQuery | null>(null);
  const ready = q !== null;
  const [pending, startTransition] = useTransition();
  const [flying, setFlying] = useState(false);
  const [slide,setSlide]=useState(0);
  const [answered,setAnswered]=useState<Question[]>([]);
  const [prefilled,setPrefilled]=useState<Question[]>([]);
  // 첫 화면은 홈. 질문 팝업은 사용자가 시작 버튼을 누르거나 추천 미리보기에서 돌아올 때만 연다.
  const [show,setShow]=useState(false);
  // 권역 상세는 회원 전용이라, 비회원이 여행지 카드를 누르면 그 지역으로 질문을 시작한다.
  const [member,setMember]=useState(false);
  useEffect(()=>{const on=()=>setMember(!!loadAuth());on();window.addEventListener(AUTH_EVENT,on);return ()=>window.removeEventListener(AUTH_EVENT,on);},[]);
  const [direction,setDirection]=useState<"forward"|"back">("forward");
  const dialog=useRef<HTMLDialogElement>(null);
  const body=useRef<HTMLDivElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const progress=()=>({open:null,question:0,done:[false,false,false],choice:null,slide,answered,prefilled});
  useEffect(()=>{
    const resume = new URLSearchParams(location.search).get("resume")==="1";
    const draft=makeQuestionDraft(resume);
    if(resume) history.replaceState(history.state,"","/");
    setQ(draft.q);setSlide(draft.slide);setAnswered(draft.answered);setPrefilled(draft.prefilled);
    if(resume)setShow(true);
  },[]);
  useEffect(()=>{if(q)saveHomeDraft(q,progress());},[q,slide,answered,prefilled]);
  useEffect(()=>{
    const el=dialog.current;
    if(!ready||!show||!el)return;
    if(!el.open)el.showModal();
    const old=document.body.style.overflow;document.body.style.overflow="hidden";
    return ()=>{if(el.open)el.close();document.body.style.overflow=old;};
  },[ready,show]);
  useEffect(()=>{body.current?.scrollTo({top:0});heading.current?.focus();},[slide,show,ready]);
  if (!q) return null;
  const dateError = travelDateError(q);
  const days = calendarDays(q.startDate, q.endDate);
  const members = membersOf(q);
  const { main } = resultThemes(q);
  const rooms = roomEstimate(q);
  const selectedAreas = normalizeTravelAreas(q.preferredAreas);
  const hasAdult = members.some((m) => m.age === null ? m.relationship !== "child" : m.age >= 18);
  const partyError = !hasAdult ? "성인 구성원을 한 명 이상 입력해 주세요." : members.some((m) => m.relationship === "child" && m.age === null) ? "자녀의 만 나이를 입력해 주세요." : null;
  const budgetError = q.totalBudgetKrw != null && (!Number.isFinite(q.totalBudgetKrw) || q.totalBudgetKrw <= 0) ? "1인당 예산은 0보다 큰 금액으로 입력해 주세요." : null;
  const error = dateError || partyError || budgetError;
  const curQ=QUESTIONS[slide];
  const mark=(k:Question)=>{setAnswered(old=>old.includes(k)?old:[...old,k]);setPrefilled(old=>old.filter(x=>x!==k));};
  const picked=(k:Question)=>answered.includes(k)&&!prefilled.includes(k);
  const pickedCount=answered.filter(k=>!prefilled.includes(k)).length;
  const status=picked(curQ)?"내가 고른 조건이에요.":prefilled.includes(curQ)?"지난 검색 조건이에요 · 그대로 두거나 새로 골라 주세요.":"아직 고르지 않았어요 · 기본값으로 추천할 수 있어요.";
  const started=answered.length>0;
  const patch=(value:Partial<RegionQuery>)=>{mark(curQ);setQ(old=>old?{...old,...value}:old);};
  const move=(delta:number)=>{setDirection(delta>0?"forward":"back");setSlide(n=>Math.max(0,Math.min(QUESTIONS.length-1,n+delta)));};
  const qError=(k:Q)=>k==="who"?partyError:k==="when"?dateError:k==="budget"?budgetError:null;
  const toggleArea = (area: TravelArea) => {
    const next = normalizeTravelAreas(selectedAreas.includes(area) ? selectedAreas.filter((a) => a !== area) : [...selectedAreas, area]);
    patch({ preferredAreas: next.length ? next : undefined });
  };
  const pickMain = (c: Concept) => patch(withResultThemes(q, c, null));
  const go=()=>{
    if(error||pending||flying)return;
    const { main, sub } = resultThemes(q);
    saveQuestionPreview(withResultThemes(q, main, sub),progress());
    track("search",undefined,undefined,selectedAreas);
    setFlying(true);
    startTransition(()=>router.push("/results?preview=1"));
  };
  const question = (k: Q) => {
    switch (k) {
      case "who": return <CompanionChooser members={members} error={partyError} tag={picked("who")?null:prefilled.includes("who")?"지난 조건":"기본값"} onChange={(nx) => { mark("who"); if(nx.length!==members.length)setAnswered(old=>old.filter(k=>k!=="rooms")); setQ(normalizeParty({ ...q, members: nx, ...(nx.length !== members.length ? { roomCount: null } : {}) })); }} />;
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
        <p className="xs muted">먼저 가장 중요한 테마를 골라요. 서브 테마는 추천 결과에서 하나 더할 수 있어요.</p>
        <div className="chips">{CONCEPTS.map((c) => <button key={c} type="button" aria-label={`메인 ${c}`} className={`toggle-chip ${main === c ? "on main" : ""}`} aria-pressed={main === c} onClick={() => pickMain(c)}>{c}</button>)}</div>
        <p className="small"><b>메인 · {main}</b></p>
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
        {q.totalBudgetKrw != null && <>
          <label className="budget-input"><input className="input" type="number" inputMode="decimal" min={0.0001} step="any" aria-label="1인당 여행 예산 만원" value={q.totalBudgetKrw === 0 ? "" : perTravelerKrw(q.totalBudgetKrw, members.length) / 10000} onChange={(e) => patch({ totalBudgetKrw: totalBudgetFromManwon(e.target.value, members.length) })} /><span>만원 / 1인</span></label>
          {!budgetError && <p className="xs muted">{members.length}인 기준 총 {budgetManwon(q.totalBudgetKrw)}만원 · 항공·숙소·식비</p>}
        </>}
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
  const openWithTheme=(c:Concept)=>{
    mark("vibe");setQ(old=>old?withResultThemes(old,c,null):old);
    setDirection("forward");setSlide(0);setShow(true);
  };
  const openWithArea=(country:string)=>{
    const a=travelAreaOf(country);
    if(a){mark("area");setQ(old=>old?{...old,preferredAreas:[a]}:old);}
    setDirection("forward");setSlide(0);setShow(true);
  };
  const homeRegions=HOME_REGIONS.map(id=>ALL_REGIONS.find(r=>r.id===id)).filter((r):r is NonNullable<typeof r>=>!!r);
  return <main className="container page discovery-form home">
    <section className="home-hero">
      <p className="home-eyebrow">나에게 맞는 여행을 발견하다</p>
      <h1>어디로 떠나볼까요?</h1>
      <p className="home-intro">누구와 가는지, 언제·어떤 여행인지 한 질문씩 고르면 갈 만한 여행지를 순위로 추천하고 날짜별 일정까지 짜 드려요.</p>
      <button type="button" className="btn btn-primary btn-lg btn-block home-cta" onClick={()=>setShow(true)}><Icon name="plane"/> {started?"조건 이어서 고르기":"여행지 추천 받기"}</button>
      <p className="home-cta-note">{started?"지난번 고른 조건이 저장돼 있어요. 이어서 고치거나 바로 추천받을 수 있어요.":"가입 없이 무료로 추천 1~3위까지 볼 수 있어요."}</p>
    </section>
    <nav className="home-links" aria-label="바로가기">
      <Link href="/my-trips" className="home-link"><Icon name="suitcase"/><span><b>내 여행 보기</b><small>저장한 일정 다시 열기</small></span><Icon name="next" size={16}/></Link>
      <Link href="/guide" className="home-link"><Icon name="info"/><span><b>자주 묻는 질문</b><small>가격·예약·데이터 출처 안내</small></span><Icon name="next" size={16}/></Link>
    </nav>
    <section className="home-sec" aria-labelledby="home-how">
      <h2 id="home-how">이렇게 추천해요</h2>
      <ol className="home-how">{HOW.map((h,i)=><li key={h.t}><span className="home-how-n">{i+1}</span><b>{h.t}</b><p>{h.d}</p></li>)}</ol>
    </section>
    <section className="home-sec" aria-labelledby="home-dest">
      <div className="between"><h2 id="home-dest">넘겨보며 발견하기</h2><span className="xs muted">{member?"누르면 여행지 상세를 봐요":"누르면 이 지역으로 추천을 시작해요"} · 비행은 편도 추정</span></div>
      <div className="home-dest">{homeRegions.map(r=>{const h=estimateFlightHours(r.id);const inner=<>
        <FlagBg country={r.country} en={r.searchName} fallback={r.tone}/>
        <span className="home-dest-name">{r.name}</span>
        <span className="home-dest-sub">{r.country}{h!=null?` · 인천에서 약 ${h}시간`:""}</span>
      </>;return member?<Link key={r.id} href={`/r/${r.id}`} className="home-dest-card">{inner}</Link>:<button key={r.id} type="button" className="home-dest-card" onClick={()=>openWithArea(r.country)}>{inner}</button>;})}</div>
    </section>
    <section className="home-sec" aria-labelledby="home-theme">
      <h2 id="home-theme">테마로 시작하기</h2>
      <div className="home-themes">{THEMES.map(t=><button key={t.c} type="button" className="home-theme" onClick={()=>openWithTheme(t.c)}><Icon name={t.icon} size={22}/><b>{t.c}</b><small>{t.sub}</small></button>)}</div>
    </section>
    {show && <dialog ref={dialog} className="question-dialog" aria-labelledby="slide-title" onCancel={e=>{e.preventDefault();setShow(false);}}>
      <div className="question-panel">
        <header className="question-head">
          <div className="between"><span className="small muted">질문 {slide+1}/{QUESTIONS.length} · 선택 {pickedCount}개{prefilled.length?` · 지난 조건 ${prefilled.length}개`:""}</span><button type="button" className="icon-btn" aria-label="질문 닫기" onClick={()=>setShow(false)}>×</button></div>
          <div className="question-progress" aria-hidden>{QUESTIONS.map((k,i)=><span key={k} className={i===slide?"active":picked(k)?"selected":prefilled.includes(k)?"saved":""}/>)}</div>
          <h2 id="slide-title" ref={heading} tabIndex={-1}>{Q_TITLE[curQ]}</h2>
          <p className={"xs question-status "+(picked(curQ)?"picked":"muted")}>{status}</p>
        </header>
        <div ref={body} className="question-scroll">
          <div key={curQ} className={"question-content "+direction+(picked(curQ)?"":" unpicked")}>{question(curQ)}</div>
          {!picked(curQ)&&<button type="button" className="btn btn-block" disabled={!!qError(curQ)} onClick={()=>mark(curQ)}>{prefilled.includes(curQ)?"지난 조건 그대로 선택":"현재 조건 선택"}</button>}
          {error && <p className="small form-error" role="alert">{error} <span>해당 질문에서 수정할 수 있어요.</span></p>}
        </div>
        <footer className="question-actions">
          <div>{slide>0&&<button type="button" className="btn btn-block" onClick={()=>move(-1)}>이전</button>}</div>
          <button type="button" className="btn btn-primary btn-block" disabled={!!error||pending||flying} onClick={go}><Icon name="plane"/> 트립플립 추천</button>
          <div>{slide<QUESTIONS.length-1&&<button type="button" className="btn btn-block" disabled={!!qError(curQ)} onClick={()=>move(1)}>다음</button>}</div>
        </footer>
        {flying&&<span className="sr-only" role="status">여행지를 찾는 중…</span>}
      </div>
    </dialog>}
  </main>;
}
