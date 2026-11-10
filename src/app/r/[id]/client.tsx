"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BackButton } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { loadBoard, saveBoard, useFlowQuery } from "@/lib/flow";
import { fmtDate } from "@/services/itineraryV1";
import type { Board, Condition, DayWeather, SlotKey } from "@/services/planner";
import { MEAL_STYLES, REST, boardKey, byId, candidates, cellLabel, companionsOf, completeBoard, emptyBoard, isSpecial, optimize, slotsForDay, travelMin } from "@/services/planner";
import type { MealStyle } from "@/services/planner";
import { scoreRegions } from "@/services/regionScore";
import { useLivePrices } from "@/lib/livePrices";

const CONDITIONS: Condition[] = ["보통", "피곤", "매우 피곤"];
const WEATHERS: DayWeather[] = ["맑음", "비", "강풍"];

function slotKind(k: string, v: string | null) {
  if (v && isSpecial(v)) return "rest";
  if (k === "점심" || k === "저녁") return "meal";
  if (k === "디저트") return "dessert";
  if (k === "야간") return "night";
  return "sight";
}

function BoardInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const plan = sp.get("plan");
  const router = useRouter();
  const q = useFlowQuery(plan);
  const priceVersion = useLivePrices();
  const r = useMemo(() => (q ? scoreRegions(q).find((x) => x.region.id === id) : undefined), [q, id, priceVersion]);
  const [board, setBoard] = useState<Board | null>(null);
  const [pick, setPick] = useState<{ di: number; slot: SlotKey } | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!q) return;
    setBoard(completeBoard(loadBoard(id, boardKey(id, q), plan) ?? emptyBoard(id, q)));
  }, [q, id, plan]);
  if (!q || !board) return null;
  if (!r) return <p className="muted">일정을 만들 수 없는 지역이에요.</p>;

  const update = (b: Board) => {
    setBoard(b);
    saveBoard(id, b, plan);
  };
  const setDay = (di: number, patch: Partial<Board["days"][number]>) => update({ ...board, days: board.days.map((d, i) => (i === di ? { ...d, ...patch } : d)) });
  const setCell = (di: number, slot: SlotKey, v: string | null, lock = true) => {
    const d = board.days[di];
    const cells = { ...d.cells, [slot]: { v, lock } };
    // 종일 장소를 고르면 오전·오후를 함께 쓰고, 이어진 칸을 바꾸면 이어짐을 푼다
    const p = v ? byId(v) : undefined;
    const allDay = p && candidates(id, "오전", q, d).find((x) => x.p.id === v)?.allDay;
    if (slot === "오전" && allDay && d.cells["오후"].lock && d.cells["오후"].v !== v) {
      setToast("오후에 고정한 일정이 있어요. 오후 고정을 먼저 풀어주세요.");
      setTimeout(() => setToast(""), 2500);
      return;
    }
    if (slot === "오전" && allDay) cells["오후"] = { v, lock, cont: true };
    if (slot === "오전" && !allDay && d.cells["오후"].cont) cells["오후"] = { v: null, lock: false };
    if (slot === "오후" && d.cells["오전"].v === d.cells["오후"].v && d.cells["오후"].cont) cells["오전"] = { v: null, lock: false };
    setDay(di, { cells });
  };
  const reopt = () => {
    update(optimize(board, id, q));
    setToast("고정한 칸은 두고 나머지를 다시 짰어요");
    setTimeout(() => setToast(""), 2200);
  };
  const reset = () => update(emptyBoard(id, q));
  const comps = companionsOf(q);

  return (
    <>
      <BackButton href={plan ? "/my-trips" : "/results"} label={plan ? "내 여행" : "추천 목록"} />
      <div className="between" style={{ marginTop: 4 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900 }}>{r.region.name} 일정</h1>
          <p className="small muted">동행 {comps.join(" · ")}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="rank-score" style={{ fontSize: 26 }}>{Math.round(r.display)}</span><span className="small muted">점</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <button className="btn btn-teal" onClick={reopt}><Icon name="sparkle" /> 일정 다시 추천</button>
        <button className="btn" onClick={reset}>처음부터 다시</button>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>바꾸고 싶은 일정을 눌러보세요. 직접 고른 곳은 다시 추천할 때도 유지돼요.</p>

      <nav className="day-jump" aria-label="일차 바로가기">
        {board.days.map((d, di) => (
          <button key={d.date} type="button" onClick={() => document.getElementById(`day-${di + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <b>{di + 1}일차</b><span>{fmtDate(d.date)}</span>
          </button>
        ))}
      </nav>

      <div className="stack" style={{ marginTop: 12 }}>
        {board.days.map((d, di) => (
          <div key={d.date} id={`day-${di + 1}`} className="day-card">
            <div className="between" style={{ width: "100%" }}>
              <b>{di + 1}일차 <span className="muted small">· {fmtDate(d.date)}</span></b>
              <Link href={`/r/${id}/day/${di + 1}${plan ? `?plan=${plan}` : ""}`} className="xs" style={{ color: "var(--teal-dark)", fontWeight: 700 }}>시간표 <Icon name="next" size={12} /></Link>
            </div>
            <details className="day-options"><summary aria-label={`${di + 1}일차 하루 설정`}>하루 설정 <span className="xs muted">{d.condition} · {d.weather}</span></summary><div className="board-ctl">
              <select aria-label="컨디션" value={d.condition} onChange={(e) => setDay(di, { condition: e.target.value as Condition })}>
                {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select aria-label="날씨" value={d.weather} onChange={(e) => setDay(di, { weather: e.target.value as DayWeather })}>
                {WEATHERS.map((w) => <option key={w}>{w}</option>)}
              </select>
              <select aria-label={`${di + 1}일차 음식 종류`} value={d.mealStyle ?? "any"} onChange={(e) => setDay(di, { mealStyle: e.target.value as MealStyle })}>
                {MEAL_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <label className="small"><input type="checkbox" checked={d.dessert ?? false} onChange={(e) => setDay(di, { dessert: e.target.checked })} /> 디저트 추가</label>
            </div>
            <p className="xs muted">설정을 바꾼 뒤 일정 다시 추천을 누르면 선택하지 않은 칸에 반영돼요.</p></details>
            {slotsForDay(d, q).map((k) => {
              const c = d.cells[k];
              const p = c.v && !isSpecial(c.v) ? byId(c.v) : undefined;

              return (
                <button key={k} type="button" className={`board-cell slot-${slotKind(k, c.v)} ${c.lock ? "locked" : ""}`} onClick={() => setPick({ di, slot: k })}>
                  <span className="k">{k}</span>
                  <span className="v">

                    {c.cont ? <span className="muted">{cellLabel(c.v)} · 계속</span> : <span className={isSpecial(c.v) ? "muted" : ""}>{!c.v && (k === "야간" || k === "디저트") ? "추천 후보 보강 필요 · 직접 선택 가능" : cellLabel(c.v)}</span>}
                    {p?.dining?.cuisine && !c.cont && <span className="xs faint">{p.dining.cuisine}</span>}
                  </span>
                  {c.lock && <span className="lock-badge"><Icon name="lock" size={12} />고정</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {!plan && (
        <div className="sticky-cta" style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => router.push(`/book/${id}`)}>이 지역으로 NEXT <Icon name="next" /></button>
        </div>
      )}

      {pick && (
        <PickSheet
          regionId={id}
          board={board}
          di={pick.di}
          slot={pick.slot}
          q={q}
          onClose={() => setPick(null)}
          onMealStyle={(mealStyle) => setDay(pick.di, { mealStyle })}
          onPick={(v, lock) => {
            setCell(pick.di, pick.slot, v, lock);
            setPick(null);
          }}
          onToggleLock={() => {
            const c = board.days[pick.di].cells[pick.slot];
            const cells = { ...board.days[pick.di].cells, [pick.slot]: { ...c, lock: !c.lock } };
            if ((pick.slot === "오전" || pick.slot === "오후") && cells["오후"].cont && cells["오전"].v === cells["오후"].v) {
              cells["오전"] = { ...cells["오전"], lock: !c.lock };
              cells["오후"] = { ...cells["오후"], lock: !c.lock };
            }
            setDay(pick.di, { cells });
            setPick(null);
          }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function PickSheet({ regionId, board, di, slot, q, onClose, onPick, onToggleLock, onMealStyle }: {
  regionId: string; board: Board; di: number; slot: SlotKey;
  q: NonNullable<ReturnType<typeof useFlowQuery>>;
  onClose: () => void; onPick: (v: string | null, lock: boolean) => void;
  onToggleLock: () => void; onMealStyle: (style: MealStyle) => void;
}) {
  const d = board.days[di];
  const cur = d.cells[slot];
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(8);
  const dialogRef = useRef<HTMLDivElement>(null);
  const meal = slot === "점심" || slot === "저녁" || slot === "디저트";
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const list = candidates(regionId, slot, q, d).filter((x) => !query || [x.p.name, x.p.en, x.p.dining?.cuisine ?? "", x.p.tags.join(" ")].join(" ").toLowerCase().includes(query.toLowerCase()));
  return <div className="sheet-back" onClick={onClose}>
    <div ref={dialogRef} className="sheet choice-sheet" role="dialog" aria-modal="true" aria-label={`${di + 1}일차 ${slot} 바꾸기`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary") ?? []).filter((el) => el.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}>
      <div className="between"><div><h2 className="choice-title">{meal ? slot === "디저트" ? "카페·디저트 고르기" : "어디서 먹을까요?" : "어디를 가볼까요?"}</h2><p className="xs muted">{di + 1}일차 · {slot}</p></div><button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>×</button></div>
      <input className="input choice-search" aria-label="후보 이름 또는 태그 검색" placeholder={meal ? "식당 이름이나 음식 검색" : "장소 이름 검색"} value={query} onChange={(e) => { setQuery(e.target.value); setShown(8); }} />
      {meal && slot !== "디저트" && <div className="choice-filters" aria-label="음식 종류 필터">{MEAL_STYLES.map((style) => <button type="button" key={style.value} className={`toggle-chip ${(d.mealStyle ?? "any") === style.value ? "on" : ""}`} aria-pressed={(d.mealStyle ?? "any") === style.value} onClick={() => { onMealStyle(style.value); setShown(8); }}>{style.value === "any" ? "전체" : style.label}</button>)}</div>}
      <div className="choice-meta"><span className="xs muted">후보 {list.length}곳{meal ? " · 동선 주변부터" : " · 조건에 맞는 순"}</span><button type="button" className="text-button xs" onClick={() => onPick(meal ? "meal" : REST, true)}>{meal ? "식당은 나중에" : "숙소 휴식"}</button></div>
      <div className="sheet-list choice-list">
        {list.length === 0 && <div className="choice-empty"><b>{meal ? "이 종류의 후보가 아직 부족해요" : "조건에 맞는 후보가 없어요"}</b><p className="small muted">{meal ? "전체를 선택해 다른 식당을 보거나, 나중에 정할 수 있어요." : "검색어를 줄이거나 휴식 시간으로 남겨보세요."}</p></div>}
        {list.slice(0, shown).map(({ p, e, allDay, distance }) => {
          const selected = cur.v === p.id;
          const location = meal ? distance?.km == null ? "위치 확인 필요" : `${distance.from} 기준 직선 약 ${distance.km < 1 ? Math.round(distance.km * 1000) + "m" : distance.km.toFixed(1) + "km"}` : `이동 약 ${travelMin(p)}분 · ${allDay ? "종일" : p.tags.slice(0, 2).join("·")}`;
          return <article key={p.id} className={`choice-card ${selected ? "selected" : ""}`}>
            <button type="button" className="choice-main" disabled={!!e.blockedBy} onClick={() => onPick(p.id, true)}><span className="choice-copy"><b>{p.name}</b>{p.wikiBoost && <span className="xs" style={{ color: "var(--teal, #0f8b8d)", fontWeight: 700 }}>🔥 위키 조회수 상위</span>}<span className="small muted">{meal ? p.dining?.cuisine ?? (slot === "디저트" ? "카페·디저트" : "식당") : e.label}</span><span className="xs muted">{location}</span></span><span className="choice-select">{selected ? "선택됨" : "선택"}</span></button>
            <details className="choice-detail"><summary>정보·출처</summary><div className="xs muted">{p.dining?.address && <p>{p.dining.address}</p>}<p>{meal ? "영업시간·가격·아기의자·키즈메뉴는 방문 전에 확인해 주세요." : e.parts.join(" · ") || "이동·체류시간과 적합도는 추정이에요."}</p>{p.dining ? <><p>가이드 등록 자료 · 조회 {p.dining.checkedAt}. 음식 종류는 설명에 따른 분류예요.</p><a href={p.dining.sourceUrl} target="_blank" rel="noopener noreferrer">{p.dining.source} 원문</a><span> · CC BY-SA 4.0</span></> : <p>기존 후보 자료 · 현장 정보 확인 필요</p>}</div></details>
          </article>;
        })}
        {shown < list.length && <button type="button" className="btn btn-block" onClick={() => setShown((n) => n + 8)}>후보 더 보기 ({list.length - shown}곳)</button>}
      </div>
      <div className="choice-footer"><button type="button" className="text-button xs" onClick={onToggleLock}>{cur.lock ? "선택 고정 풀기" : "현재 일정 고정"}</button>{meal && <a className="xs muted" href="/dining/catalog.json" target="_blank" rel="noopener noreferrer">자료: Wikivoyage · CC BY-SA 4.0</a>}</div>
    </div>
  </div>;
}

export default function BoardPage() {
  return (
    <main className="container page" style={{ maxWidth: 560 }}>
      <Suspense>
        <BoardInner />
      </Suspense>
    </main>
  );
}
