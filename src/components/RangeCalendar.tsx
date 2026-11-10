"use client";
// 달력 하나에서 출발일 → 귀국일 순서로 두 번 눌러 기간을 고른다.
import { useState } from "react";
import { calendarDays } from "@/lib/travelDates";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function today() {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
}
function short(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return `${m}/${day}(${WEEK[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]})`;
}

export function RangeCalendar({ start, end, onChange, startLabel = "출발", endLabel = "귀국", minDate }: {
  start: string; end: string; onChange: (start: string, end: string) => void; startLabel?: string; endLabel?: string; minDate?: string;
}) {
  const min = minDate ?? today();
  const base = /^\d{4}-\d{2}/.test(start) && start >= min ? start : min;
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });
  // 첫 번째로 누른 날짜(출발). 두 번째 누르면 기간이 확정된다.
  const [anchor, setAnchor] = useState<string | null>(null);

  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const count = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => iso(view.y, view.m, i + 1))];
  const move = (n: number) => setView(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));
  const canPrev = iso(view.y, view.m, 1) > min.slice(0, 8) + "01";

  const pick = (d: string) => {
    if (anchor && d > anchor) { onChange(anchor, d); setAnchor(null); }
    else setAnchor(d);
  };
  const s = anchor ?? start;
  const e = anchor ? null : end;
  const days = !anchor && start && end ? calendarDays(start, end) : NaN;

  return (
    <div className="rcal">
      <div className="rcal-sum" aria-live="polite">
        <div className={anchor ? "" : "on"}><span>{startLabel}</span><b>{s ? short(s) : "선택"}</b></div>
        <span className="rcal-arrow" aria-hidden>→</span>
        <div className={anchor ? "on" : ""}><span>{endLabel}</span><b>{e ? short(e) : "선택"}</b></div>
        {Number.isFinite(days) && days >= 2 && <em>{days - 1}박 {days}일</em>}
      </div>
      <p className="xs muted" style={{ margin: "6px 0 4px" }}>{anchor ? `${endLabel}일을 눌러 주세요.` : `${startLabel}일 → ${endLabel}일 순서로 눌러 주세요.`}</p>
      <div className="rcal-head">
        <button type="button" className="icon-btn" aria-label="이전 달" disabled={!canPrev} onClick={() => move(-1)}>‹</button>
        <b>{view.y}년 {view.m + 1}월</b>
        <button type="button" className="icon-btn" aria-label="다음 달" onClick={() => move(1)}>›</button>
      </div>
      <div className="rcal-grid" role="grid" aria-label={`${view.y}년 ${view.m + 1}월`}>
        {WEEK.map((w, i) => <span key={w} className={`rcal-w ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const isStart = d === s, isEnd = d === e, inRange = !!e && d > s && d < e;
          const dow = i % 7;
          return (
            <button key={d} type="button" aria-label={d} aria-pressed={isStart || isEnd} disabled={d < min}
              className={`rcal-d ${isStart ? "start" : ""} ${isEnd ? "end" : ""} ${inRange ? "mid" : ""} ${isStart && e ? "has-end" : ""} ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}`}
              onClick={() => pick(d)}>{Number(d.slice(8))}</button>
          );
        })}
      </div>
    </div>
  );
}
