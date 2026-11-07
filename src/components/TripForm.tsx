"use client";
import { useEffect, useState } from "react";
import type { Budget, Intensity, Pref, TripConditions } from "@/lib/types";
import { ALL_PREFS, BUDGET, INTENSITY, PREF_LABEL } from "@/lib/labels";
import { Icon } from "./Icon";
import { daysBetween } from "@/lib/time";

const ORIGINS = ["인천", "김포", "김해(부산)", "대구", "청주", "제주"];

function Stepper({ label, sub, value, min, max, onChange }: { label: string; sub?: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <div>
        <div className="bold">{label}</div>
        {sub && <div className="xs muted">{sub}</div>}
      </div>
      <div className="ctrl">
        <button type="button" className="icon-btn" aria-label={`${label} 줄이기`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
        <span>{value}</span>
        <button type="button" className="icon-btn" aria-label={`${label} 늘리기`} disabled={value >= max} onClick={() => onChange(value + 1)}><Icon name="plus" /></button>
      </div>
    </div>
  );
}

export function TripForm({ initial, onSubmit, submitLabel }: { initial: TripConditions; onSubmit: (c: TripConditions) => void; submitLabel: string }) {
  const [c, setC] = useState<TripConditions>(initial);
  useEffect(() => setC(initial), [initial]);
  const set = <K extends keyof TripConditions>(k: K, v: TripConditions[K]) => setC((p) => ({ ...p, [k]: v }));
  const nights = daysBetween(c.startDate, c.endDate);
  const dateError = !c.startDate || !c.endDate ? "날짜를 선택해 주세요" : nights < 0 ? "종료일이 시작일보다 빨라요" : nights > 13 ? "MVP는 최대 14일까지 지원해요" : null;

  const setChildren = (n: number) => {
    const ages = [...c.party.childAges];
    while (ages.length < n) ages.push(5);
    setC((p) => ({ ...p, party: { ...p.party, children: n, childAges: ages.slice(0, n) } }));
  };
  const togglePref = (p: Pref) => set("prefs", c.prefs.includes(p) ? c.prefs.filter((x) => x !== p) : [...c.prefs, p]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!dateError) onSubmit(c);
      }}
    >
      <div className="form-section">
        <h2 className="section-title">언제, 어디서 출발하나요?</h2>
        <label className="field">
          <span className="label">출발지</span>
          <select className="input" value={c.origin} onChange={(e) => set("origin", e.target.value)}>
            {ORIGINS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        <div className="grid-2">
          <label className="field">
            <span className="label">여행 시작일</span>
            <input className="input" type="date" value={c.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </label>
          <label className="field">
            <span className="label">여행 종료일</span>
            <input className="input" type="date" value={c.endDate} min={c.startDate} onChange={(e) => set("endDate", e.target.value)} />
          </label>
        </div>
        {dateError ? <p className="small" style={{ color: "var(--danger)" }}>{dateError}</p> : <p className="small muted">{nights}박 {nights + 1}일</p>}
      </div>

      <div className="form-section">
        <h2 className="section-title">누구와 가나요?</h2>
        <Stepper label="성인" value={c.party.adults} min={1} max={12} onChange={(n) => setC((p) => ({ ...p, party: { ...p.party, adults: n } }))} />
        <Stepper label="어린이" sub="만 12세 이하" value={c.party.children} min={0} max={6} onChange={setChildren} />
        {c.party.children > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">어린이 연령 (일정·식당 추천에 반영돼요)</span>
            <div className="grid-2">
              {c.party.childAges.map((age, i) => (
                <select key={i} className="input" value={age} aria-label={`어린이 ${i + 1} 연령`} onChange={(e) => {
                  const ages = [...c.party.childAges];
                  ages[i] = Number(e.target.value);
                  setC((p) => ({ ...p, party: { ...p.party, childAges: ages } }));
                }}>
                  {Array.from({ length: 13 }, (_, a) => <option key={a} value={a}>{a === 0 ? "돌 전" : `${a}세`}</option>)}
                </select>
              ))}
            </div>
            <label className="check"><input type="checkbox" checked={c.stroller} onChange={(e) => set("stroller", e.target.checked)} />유모차 사용</label>
          </div>
        )}
      </div>

      <div className="form-section">
        <h2 className="section-title">여행 스타일</h2>
        <p className="small muted">금액 대신 어떻게 쓸지만 골라 주세요.</p>
        <div className="seg">
          {(Object.keys(BUDGET) as Budget[]).map((b) => (
            <button type="button" key={b} className={c.budget === b ? "on" : ""} onClick={() => set("budget", b)}>{BUDGET[b].label}</button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <h2 className="section-title">여행 강도</h2>
        <div className="stack" style={{ gap: 8 }}>
          {(Object.keys(INTENSITY) as Intensity[]).map((k) => (
            <button type="button" key={k} className="card-btn between" style={c.intensity === k ? { borderColor: "var(--navy)", boxShadow: "0 0 0 1px var(--navy) inset" } : undefined} onClick={() => set("intensity", k)}>
              <div>
                <div className="bold">{INTENSITY[k].label}</div>
                <div className="small muted">{INTENSITY[k].desc} · 이동거리·체류시간까지 고려</div>
              </div>
              {c.intensity === k && <Icon name="check" />}
            </button>
          ))}
        </div>
      </div>

      <div className="form-section" style={{ borderBottom: 0 }}>
        <h2 className="section-title">여행 취향 <span className="small muted">(복수 선택)</span></h2>
        <div className="row-wrap" style={{ gap: 8 }}>
          {ALL_PREFS.map((p) => (
            <button type="button" key={p} className={`toggle-chip ${c.prefs.includes(p) ? "on" : ""}`} aria-pressed={c.prefs.includes(p)} onClick={() => togglePref(p)}>{PREF_LABEL[p]}</button>
          ))}
        </div>
      </div>

      <div className="sticky-cta">
        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!!dateError}>{submitLabel}</button>
      </div>
    </form>
  );
}
