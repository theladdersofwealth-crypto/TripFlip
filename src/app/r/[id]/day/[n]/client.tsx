"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { BackButton } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { DEFAULT_PREFS, TRANSPORTS, loadBoard, loadPrefs, savePrefs, useFlowQuery } from "@/lib/flow";
import type { DayPrefs, Transport } from "@/lib/flow";
import { buildTimetable, fmtDate } from "@/services/itineraryV1";
import { boardKey, emptyBoard, toDayPlan } from "@/services/planner";
import { scoreRegions } from "@/services/regionScore";

const times = (from: string, to: string) => {
  const out: string[] = [];
  for (let m = Number(from.slice(0, 2)) * 60; m <= Number(to.slice(0, 2)) * 60; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 ? "30" : "00"}`);
  return out;
};
const WAKE = times("05:00", "10:00");
const BREAKFAST = times("06:00", "10:30");

function DayInner() {
  const { id, n } = useParams<{ id: string; n: string }>();
  const sp = useSearchParams();
  const plan = sp.get("plan");
  const q = useFlowQuery(plan);
  const [prefs, setPrefs] = useState<DayPrefs>(DEFAULT_PREFS);
  useEffect(() => setPrefs(loadPrefs(id, plan)), [id, plan]);
  const update = (p: Partial<DayPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    savePrefs(id, next, plan);
  };

  const r = useMemo(() => (q ? scoreRegions(q).find((x) => x.region.id === id) : undefined), [q, id]);
  const days = useMemo(() => {
    if (!q) return [];
    const b = loadBoard(id, boardKey(id, q), plan) ?? emptyBoard(id, q);
    return b.days.map((d, i) => toDayPlan(d, i + 1));
  }, [q, id, plan]);
  if (!q) return null;
  const dayNo = Number(n);
  const day = days[dayNo - 1];
  if (!r || !day) return <p className="muted">일정을 찾을 수 없어요.</p>;
  const rows = buildTimetable(day, prefs);
  const suffix = plan ? `?plan=${plan}` : "";

  return (
    <>
      <BackButton href={`/r/${id}${suffix}`} label={`${r.region.name} 일정`} />
      <div className="between" style={{ marginTop: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900 }}>{dayNo}일차 <span className="muted" style={{ fontSize: 16 }}>{fmtDate(day.date)}</span></h1>
        <div className="row">
          {dayNo > 1 && <Link className="icon-btn" aria-label="이전 날" href={`/r/${id}/day/${dayNo - 1}${suffix}`}><Icon name="back" /></Link>}
          {dayNo < days.length && <Link className="icon-btn" aria-label="다음 날" href={`/r/${id}/day/${dayNo + 1}${suffix}`}><Icon name="next" /></Link>}
        </div>
      </div>

      <div className="card-soft stack" style={{ marginTop: 12, gap: 10 }}>
        <label className="check-row"><input type="checkbox" checked={prefs.breakfastEnabled !== false} onChange={(e) => update({ breakfastEnabled: e.target.checked })} /> 조식을 먹어요</label>
        <div className="grid-2">
          <label className="field">
            <span className="label">기상 시간</span>
            <select className="input" aria-label="기상 시간" value={prefs.wake} onChange={(e) => update({ wake: e.target.value })}>{WAKE.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field">
            <span className="label">조식 시간</span>
            <select className="input" aria-label="조식 시간" disabled={prefs.breakfastEnabled === false} value={prefs.breakfast} onChange={(e) => update({ breakfast: e.target.value })}>{BREAKFAST.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span className="label">조식 소요</span>
            <select className="input" aria-label="조식 소요" disabled={prefs.breakfastEnabled === false} value={prefs.breakfastMin} onChange={(e) => update({ breakfastMin: Number(e.target.value) })}>
              {[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m}분</option>)}
            </select>
          </label>
          <label className="field">
            <span className="label">이동 방법</span>
            <select className="input" aria-label="이동 방법" value={prefs.transport} onChange={(e) => update({ transport: e.target.value as Transport })}>{TRANSPORTS.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
        </div>
        <p className="xs muted">바꾼 설정은 {r.region.name} 모든 일차에 적용돼요.</p>
      </div>

      <div className="tt" style={{ marginTop: 18 }}>
        {rows.map((row, i) => (
          <div key={i} className={`tt-row ${row.kind}`}>
            <span className="tm">{row.time}</span>
            <span className="ln"><i /></span>
            <div className="bd">
              <b>{row.title}</b>{row.end && <span className="xs faint"> ~{row.end}</span>}
              {row.sub && <div className="xs muted">{row.sub}</div>}
            </div>
          </div>
        ))}
      </div>
      <p className="xs faint">이동·체류 시간은 실측 전 예상값이고 운영시간은 미확인이에요. 항공편·숙소 위치 확정 후 실제 가용시간과 동선을 확인해 주세요.</p>
    </>
  );
}

export default function DayPage() {
  return (
    <main className="container page" style={{ maxWidth: 560 }}>
      <Suspense>
        <DayInner />
      </Suspense>
    </main>
  );
}
