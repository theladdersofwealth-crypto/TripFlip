"use client";
import type { RegionQuery } from "@/services/regionScore";
import { calendarDays, tripWindows } from "@/lib/travelDates";
import type { TravelWindow } from "@/lib/travelDates";
import { RangeCalendar } from "@/components/RangeCalendar";

export function DateEditor({ query, onChange }: { query: RegionQuery; onChange: (query: RegionQuery) => void }) {
  const window = query.dateWindow;
  const candidates = window ? tripWindows(window) : [];
  const updateWindow = (patch: Partial<TravelWindow>) => {
    const next = { earliest: query.startDate, latest: query.endDate, nights: Math.max(1, calendarDays(query.startDate, query.endDate) - 1), ...window, ...patch };
    const options = tripWindows(next);
    const selected = options.find((o) => o.startDate === query.startDate) ?? options[0];
    onChange({ ...query, dateWindow: next, ...(selected ?? {}) });
  };
  return (
    <section className="q-block">
      <h2>언제 가나요?</h2>
      <div className="seg sm" aria-label="여행 날짜 선택 방식">
        <button type="button" className={!window ? "on" : ""} aria-pressed={!window} onClick={() => onChange({ ...query, dateWindow: undefined })}>날짜가 정해졌어요</button>
        <button type="button" className={window ? "on" : ""} aria-pressed={!!window} onClick={() => updateWindow({})}>가능한 기간이 있어요</button>
      </div>
      {window ? <>
        <div style={{ marginTop: 10 }}><RangeCalendar start={window.earliest} end={window.latest} startLabel="가능 시작" endLabel="가능 마지막" onChange={(earliest, latest) => updateWindow({ earliest, latest })} /></div>
        <label className="field"><span className="label">희망 숙박 수</span><input className="input" type="number" min={1} max={29} value={Number.isFinite(window.nights) ? window.nights : ""} onChange={(e) => updateWindow({ nights: Number(e.target.value) })} /></label>
        {candidates.length > 0 && <label className="field"><span className="label">기준 일정 · {candidates.length}가지 중 선택</span><select className="input" value={query.startDate} onChange={(e) => { const selected = candidates.find((o) => o.startDate === e.target.value); if (selected) onChange({ ...query, ...selected }); }}>{candidates.map((o) => <option key={o.startDate} value={o.startDate}>{o.startDate} ~ {o.endDate}</option>)}</select></label>}
        <p className="xs muted">선택한 기준 일정으로 추천해요. 날짜별 최저가 검색은 포함하지 않아요.</p>
      </> : <div style={{ marginTop: 10 }}><RangeCalendar start={query.startDate} end={query.endDate} onChange={(startDate, endDate) => onChange({ ...query, startDate, endDate })} /></div>}
    </section>
  );
}
