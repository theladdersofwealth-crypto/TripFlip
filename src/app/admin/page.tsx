"use client";
// 관리자 통계: 일별 방문자, 사용 흐름(퍼널), 인기 권역. 데이터는 tripflip-stats Worker.
// 메뉴에 노출하지 않고 /admin 주소로만 들어온다. 비밀번호는 Worker 비밀값 ADMIN_KEY.
import { useEffect, useMemo, useState } from "react";
import { NO_TRACK_KEY, STATS_URL } from "@/lib/analytics";
import { ALL_REGIONS } from "@/services/regionScore";

const KEY_STORE = "tripflip:admin-key";

interface Day { day: string; visitors: number; views: number; newVisitors: number; steps: Record<string, number> }
interface Stats {
  ok: true; today: string; from: string; days: number; totalVisitors: number; periodVisitors: number;
  daily: Day[]; funnel: Record<string, number>;
  regions: { region: string; views: number; book: number; flight: number; hotel: number; save: number }[];
}

const FUNNEL: [string, string][] = [
  ["visit", "앱 방문"],
  ["search", "조건 입력 후 찾기"],
  ["results", "추천 목록 봄"],
  ["region", "권역 일정 봄"],
  ["day", "일차 타임테이블 봄"],
  ["book", "항공·숙소 화면"],
  ["outbound", "예약처로 이동"],
  ["save", "내 여행에 저장"],
];

const regionName = new Map(ALL_REGIONS.map((r) => [r.id, r.name]));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [input, setInput] = useState("");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [noTrack, setNoTrack] = useState(false);

  useEffect(() => {
    setKey(store.get(KEY_STORE) ?? "");
    setNoTrack(store.get(NO_TRACK_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`${STATS_URL}/stats?days=${days}`, { headers: { authorization: `Bearer ${key}` }, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { store.set(KEY_STORE, null); if (alive) { setKey(""); setError("비밀번호가 맞지 않아요."); } return; }
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as Stats;
        if (alive) setData(j);
      })
      .catch(() => alive && setError("통계 서버에 연결하지 못했어요. 잠시 뒤 다시 열어 주세요."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key, days]);

  if (!key) {
    return <main className="container page" style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>관리자</h1>
      <form className="stack" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); if (!input.trim()) return; store.set(KEY_STORE, input.trim()); setKey(input.trim()); setInput(""); }}>
        <label className="field"><span className="label">비밀번호</span><input className="input" type="password" autoComplete="current-password" value={input} onChange={(e) => setInput(e.target.value)} /></label>
        <button className="btn btn-primary btn-block" type="submit">들어가기</button>
        {error && <p role="alert" className="small" style={{ color: "var(--danger)" }}>{error}</p>}
      </form>
    </main>;
  }

  return <main className="container page admin" style={{ maxWidth: 760 }}>
    <div className="between">
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>관리자 통계</h1>
      <button className="btn btn-ghost" onClick={() => { store.set(KEY_STORE, null); setKey(""); setData(null); }}>나가기</button>
    </div>
    <div className="row-wrap" role="group" aria-label="기간" style={{ marginTop: 8 }}>
      {[7, 30, 90].map((d) => <button key={d} className={`btn ${days === d ? "btn-primary" : ""}`} style={{ minHeight: 36, padding: "0 14px" }} onClick={() => setDays(d)}>최근 {d}일</button>)}
    </div>
    {error && <p role="alert" className="small" style={{ color: "var(--danger)", marginTop: 12 }}>{error}</p>}
    {loading && !data && <p className="muted small" style={{ marginTop: 12 }}>불러오는 중…</p>}
    {data && <Dashboard data={data} />}
    <label className="check-row xs muted" style={{ marginTop: 24 }}>
      <input type="checkbox" checked={noTrack} onChange={(e) => { setNoTrack(e.target.checked); store.set(NO_TRACK_KEY, e.target.checked ? "1" : null); }} />
      이 기기는 통계에서 빼기 (관리자 테스트용)
    </label>
    <p className="xs faint" style={{ marginTop: 8 }}>방문자 = 기기 기준(브라우저마다 무작위 번호). 이름·IP·위치는 모으지 않아요. 날짜는 한국 시간. 브라우저 저장을 지우면 새 방문자로 세요.</p>
  </main>;
}

function Dashboard({ data }: { data: Stats }) {
  const today = data.daily[data.daily.length - 1];
  const yesterday = data.daily[data.daily.length - 2];
  const last7 = data.daily.slice(-7);
  const avg7 = Math.round(last7.reduce((s, d) => s + d.visitors, 0) / Math.max(last7.length, 1));
  const f = data.funnel;
  const base = f.visit || 0;
  const maxV = Math.max(1, ...data.daily.map((d) => d.visitors));
  const [hover, setHover] = useState<Day | null>(null);
  const shown = hover ?? today;
  const tickEvery = Math.ceil(data.daily.length / 6);
  const funnelRows = useMemo(() => FUNNEL.map(([k, label], i) => {
    const n = f[k] ?? 0;
    const prev = i ? f[FUNNEL[i - 1][0]] ?? 0 : n;
    return { k, label, n, ofAll: pct(n, base), ofPrev: i ? pct(n, prev) : "", w: base ? (n / base) * 100 : 0 };
  }), [f, base]);

  return <div className="stack-lg" style={{ marginTop: 16 }}>
    <section className="admin-tiles">
      <Tile label="오늘 방문자" value={today?.visitors ?? 0} sub={`신규 ${today?.newVisitors ?? 0} · 조회 ${today?.views ?? 0}`} />
      <Tile label="어제 방문자" value={yesterday?.visitors ?? 0} sub={`신규 ${yesterday?.newVisitors ?? 0}`} />
      <Tile label="최근 7일 하루 평균" value={avg7} />
      <Tile label={`최근 ${data.days}일 방문자`} value={data.periodVisitors} sub={`누적 ${data.totalVisitors.toLocaleString()}`} />
    </section>

    <section className="card-soft">
      <div className="between"><b>일별 방문자</b><span className="xs muted">{md(shown.day)} · 방문자 {shown.visitors} · 신규 {shown.newVisitors} · 조회 {shown.views}</span></div>
      <div className="admin-bars" onMouseLeave={() => setHover(null)} role="img" aria-label={`최근 ${data.days}일 일별 방문자 막대그래프`}>
        {data.daily.map((d) => <button key={d.day} type="button" className={`admin-bar ${hover?.day === d.day ? "on" : ""}`} onMouseEnter={() => setHover(d)} onFocus={() => setHover(d)} onClick={() => setHover(d)} aria-label={`${md(d.day)} 방문자 ${d.visitors}명`}>
          <span style={{ height: `${(d.visitors / maxV) * 100}%` }} />
        </button>)}
      </div>
      <div className="admin-axis xs faint">{data.daily.map((d, i) => <span key={d.day}>{i % tickEvery === 0 || i === data.daily.length - 1 ? md(d.day) : ""}</span>)}</div>
      <p className="xs faint">최고 {maxV}명 · 막대를 누르면 그날 숫자</p>
    </section>

    <section className="card-soft">
      <b>사용 흐름 (최근 {data.days}일, 기기 수)</b>
      <p className="xs muted" style={{ margin: "4px 0 10px" }}>각 단계까지 온 기기 수. 오른쪽 %는 바로 앞 단계 대비 남은 비율 — 낮은 곳이 이탈 지점이에요.</p>
      <div className="stack" style={{ gap: 8 }}>
        {funnelRows.map((r) => <div key={r.k} className="admin-funnel">
          <div className="between small"><span>{r.label}</span><span><b>{r.n.toLocaleString()}</b> <span className="muted xs">({r.ofAll}){r.ofPrev && ` · 앞 단계 ${r.ofPrev}`}</span></span></div>
          <div className="admin-track"><span style={{ width: `${r.w}%` }} /></div>
        </div>)}
      </div>
      <p className="xs faint" style={{ marginTop: 8 }}>예약처 이동: 항공 {f.flight ?? 0} · 숙소 {f.hotel ?? 0} (실제 결제 여부는 제휴 연결 후 확인 가능)</p>
    </section>

    <section className="card-soft">
      <b>인기 권역 (최근 {data.days}일)</b>
      {data.regions.length === 0 ? <p className="small muted" style={{ marginTop: 8 }}>아직 기록이 없어요.</p> :
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="admin-table small">
            <thead><tr><th>권역</th><th>일정 봄</th><th>예약 화면</th><th>항공</th><th>숙소</th><th>저장</th></tr></thead>
            <tbody>{data.regions.map((r) => <tr key={r.region}><td>{regionName.get(r.region) ?? r.region}</td><td>{r.views}</td><td>{r.book}</td><td>{r.flight}</td><td>{r.hotel}</td><td>{r.save}</td></tr>)}</tbody>
          </table>
        </div>}
    </section>
  </div>;
}

function Tile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return <div className="card-soft admin-tile"><span className="xs muted">{label}</span><b>{value.toLocaleString()}</b>{sub && <span className="xs faint">{sub}</span>}</div>;
}
