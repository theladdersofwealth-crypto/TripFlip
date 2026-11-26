"use client";
// 관리자 통계: 일별 방문자, 사용 흐름(퍼널), 인기 권역. 데이터는 tripflip-stats Worker.
// 메뉴에 노출하지 않고 /admin 주소로만 들어온다. 비밀번호는 Worker 비밀값 ADMIN_KEY.
import { useEffect, useMemo, useState } from "react";
import { NO_TRACK_KEY, STATS_URL, activityLabel } from "@/lib/analytics";
import { ALL_REGIONS } from "@/services/regionScore";
import { TRAVEL_AREAS } from "@/data/travelAreas";

const KEY_STORE = "tripflip:admin-key";

interface Day { day: string; visitors: number; views: number; newVisitors: number; steps: Record<string, number> }
interface Stats {
  ok: true; today: string; from: string; days: number; totalVisitors: number; periodVisitors: number;
  members?: { total: number; today: number; activeToday: number };
  daily: Day[]; funnel: Record<string, number>;
  searchAreas?: { area: string; searches: number }[];
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
// 관리자 비밀번호는 localStorage + 쿠키(400일) 두 곳에 둔다. 한쪽이 지워져도 다른 쪽에서 되살리고,
// 열 때마다 다시 써서 만료를 늘린다(사파리가 스크립트 저장소를 정리해도 덜 풀리게).
const COOKIE = "tf_admin";
const savedKey = {
  get: (): string => {
    const ls = store.get(KEY_STORE);
    if (ls) return ls;
    try { const m = document.cookie.match(/(?:^|;\s*)tf_admin=([^;]*)/); return m ? decodeURIComponent(m[1]) : ""; } catch { return ""; }
  },
  set: (v: string | null) => {
    store.set(KEY_STORE, v);
    try {
      document.cookie = v
        ? `${COOKIE}=${encodeURIComponent(v)}; Max-Age=${400 * 86400}; Path=/admin; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`
        : `${COOKIE}=; Max-Age=0; Path=/admin`;
    } catch {}
  },
};

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [input, setInput] = useState("");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [noTrack, setNoTrack] = useState(false);
  const [tab, setTab] = useState<"stats" | "members">("stats");

  useEffect(() => {
    const k = savedKey.get(); if (k) savedKey.set(k); setKey(k);
    setNoTrack(store.get(NO_TRACK_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`${STATS_URL}/stats?days=${days}`, { headers: { authorization: `Bearer ${key}` }, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { savedKey.set(null); if (alive) { setKey(""); setError("비밀번호가 맞지 않아요."); } return; }
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
      <form className="stack" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); if (!input.trim()) return; savedKey.set(input.trim()); setKey(input.trim()); setInput(""); }}>
        <label className="field"><span className="label">비밀번호</span><input className="input" type="password" autoComplete="current-password" value={input} onChange={(e) => setInput(e.target.value)} /></label>
        <button className="btn btn-primary btn-block" type="submit">들어가기</button>
        <p className="xs faint">한 번 들어가면 이 기기·이 브라우저에서 계속 유지돼요(나가기 누르기 전까지). 카톡 등 앱 안 브라우저·개인정보 보호 모드는 저장이 안 될 수 있어요.</p>
        {error && <p role="alert" className="small" style={{ color: "var(--danger)" }}>{error}</p>}
      </form>
    </main>;
  }

  return <main className="container page admin" style={{ maxWidth: 760 }}>
    <div className="between">
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>관리자 통계</h1>
      <button className="btn btn-ghost" onClick={() => { savedKey.set(null); setKey(""); setData(null); }}>나가기</button>
    </div>
    <div className="seg" role="tablist" style={{ marginTop: 8 }}>
      <button role="tab" aria-selected={tab === "stats"} className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>방문 통계</button>
      <button role="tab" aria-selected={tab === "members"} className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>회원 이용 기록{data?.members ? ` (${data.members.total})` : ""}</button>
    </div>
    <div className="row-wrap" role="group" aria-label="기간" style={{ marginTop: 8 }}>
      {[7, 30, 90].map((d) => <button key={d} className={`btn ${days === d ? "btn-primary" : ""}`} style={{ minHeight: 36, padding: "0 14px" }} onClick={() => setDays(d)}>최근 {d}일</button>)}
    </div>
    {error && <p role="alert" className="small" style={{ color: "var(--danger)", marginTop: 12 }}>{error}</p>}
    {loading && !data && <p className="muted small" style={{ marginTop: 12 }}>불러오는 중…</p>}
    {tab === "stats" ? data && <Dashboard data={data} /> : <Members adminKey={key} days={days} />}
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
      {data.members && <Tile label="회원" value={data.members.total} sub={`오늘 가입 ${data.members.today} · 오늘 접속 ${data.members.activeToday}`} />}
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
      <b>희망 지역 검색 횟수 (최근 {data.days}일)</b>
      <p className="xs muted">복수 선택은 지역마다 1회, 상관없음은 전체 1회. 고유 방문자 수가 아니며 개인별 기록은 저장하지 않아요.</p>
      {!data.searchAreas?.length ? <p className="small muted">아직 지역 선택 통계가 없어요.</p> :
        <div style={{ overflowX: "auto", marginTop: 8 }}><table className="admin-table small">
          <thead><tr><th>희망 지역</th><th>검색 횟수</th></tr></thead>
          <tbody>{data.searchAreas.map((r) => <tr key={r.area}><td>{r.area === "all" ? "상관없음(전체)" : TRAVEL_AREAS.find((a) => a.id === r.area)?.label ?? r.area}</td><td>{r.searches}</td></tr>)}</tbody>
        </table></div>}
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

// ── 회원 이용 기록 ─────────────────────────────────────────
interface Member { uid: string; nick: string; birth: string; gender: string; created: number; last: number | null; visitsAll: number; daysAll: number; visits: number; days: number; regions: number; flight: number; hotel: number; save: number }
interface MemberDetail {
  ok: true; devices: number;
  user: { uid: string; nick: string; birth: string; gender: string; created: number; lock_until: number };
  regions: { region: string; views: number; book: number; flight: number; hotel: number; save: number; last: number }[];
  daily: { day: string; visits: number }[];
  recent: { ts: number; step: string; region: string; path: string }[];
  saved?: { regionId: string; regionName: string; createdAt: string; start: string | null; end: string | null }[];
}

const kst = (ms: number) => new Date(ms + 9 * 3600000).toISOString();
/** 11/23 17:05 (한국 시간) */
const when = (ms: number | null) => (ms ? `${md(kst(ms))} ${kst(ms).slice(11, 16)}` : "–");
const age = (birth: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return "–"; // 구글 전용 회원은 미수집
  const t = kst(Date.now()).slice(0, 10);
  return Number(t.slice(0, 4)) - Number(birth.slice(0, 4)) - (t.slice(5) < birth.slice(5) ? 1 : 0);
};
const genderKo = (g: string) => (g === "M" ? "남" : g === "F" ? "여" : "–");
const rName = (id: string) => regionName.get(id) ?? id;

function Members({ adminKey, days }: { adminKey: string; days: number }) {
  const [list, setList] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setError("");
    fetch(`${STATS_URL}/users?days=${days}`, { headers: { authorization: `Bearer ${adminKey}` }, cache: "no-store" })
      .then(async (res) => { if (!res.ok) throw new Error(String(res.status)); const j = await res.json(); if (alive) setList(j.users); })
      .catch(() => alive && setError("회원 기록을 불러오지 못했어요."));
    return () => { alive = false; };
  }, [adminKey, days, reload]);

  if (error) return <p role="alert" className="small" style={{ color: "var(--danger)", marginTop: 12 }}>{error}</p>;
  if (!list) return <p className="muted small" style={{ marginTop: 12 }}>불러오는 중…</p>;
  if (open) return <MemberView adminKey={adminKey} uid={open} onBack={() => { setOpen(null); setReload((n) => n + 1); }} />;
  return <section className="card-soft" style={{ marginTop: 16 }}>
    <b>회원 {list.length}명</b>
    <p className="xs muted" style={{ margin: "4px 0 10px" }}>접속·권역·예약 클릭은 최근 {days}일, 로그인한 기기 기준. 줄을 누르면 상세 기록.</p>
    {list.length === 0 ? <p className="small muted">아직 가입한 회원이 없어요.</p> :
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table small">
          <thead><tr><th>닉네임</th><th>나이·성별</th><th>최근 접속</th><th>접속</th><th>접속일</th><th>본 권역</th><th>항공</th><th>숙소</th><th>저장</th><th>가입</th></tr></thead>
          <tbody>{list.map((u) => <tr key={u.uid} className="admin-row" tabIndex={0} onClick={() => setOpen(u.uid)} onKeyDown={(e) => e.key === "Enter" && setOpen(u.uid)}>
            <td><b>{u.nick}</b></td><td>{age(u.birth)}·{genderKo(u.gender)}</td><td>{when(u.last)}</td><td>{u.visits}</td><td>{u.days}</td><td>{u.regions}</td><td>{u.flight}</td><td>{u.hotel}</td><td>{u.save}</td><td>{md(kst(u.created))}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}

function MemberView({ adminKey, uid, onBack }: { adminKey: string; uid: string; onBack: () => void }) {
  const [d, setD] = useState<MemberDetail | null>(null);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    fetch(`${STATS_URL}/user?id=${uid}`, { headers: { authorization: `Bearer ${adminKey}` }, cache: "no-store" })
      .then(async (res) => { if (!res.ok) throw new Error(String(res.status)); setD(await res.json()); })
      .catch(() => setError("상세 기록을 불러오지 못했어요."));
  }, [adminKey, uid]);
  const del = async () => {
    const res = await fetch(`${STATS_URL}/user?id=${uid}`, { method: "DELETE", headers: { authorization: `Bearer ${adminKey}` } }).catch(() => null);
    if (res?.ok) onBack(); else setError("삭제하지 못했어요.");
  };
  const back = <button className="btn btn-ghost" onClick={onBack}>← 회원 목록</button>;
  if (error) return <div style={{ marginTop: 12 }}>{back}<p role="alert" className="small" style={{ color: "var(--danger)" }}>{error}</p></div>;
  if (!d) return <div style={{ marginTop: 12 }}>{back}<p className="muted small">불러오는 중…</p></div>;
  const u = d.user;
  const totalVisits = d.daily.reduce((s, x) => s + x.visits, 0);
  return <div className="stack-lg" style={{ marginTop: 12 }}>
    {back}
    <section className="card-soft">
      <b style={{ fontSize: 18 }}>{u.nick}</b>
      <p className="small muted">{u.birth ? `${u.birth} (${age(u.birth)}세)` : "생년월일 미수집"} · {genderKo(u.gender)} · 가입 {when(u.created)} · 로그인 기기 {d.devices}대{u.lock_until > Date.now() ? " · 🔒 PIN 잠김" : ""}</p>
      <p className="small" style={{ marginTop: 6 }}>접속(화면 열람) {totalVisits}회 · 접속한 날 {d.daily.length}일{d.daily[0] ? ` · 마지막 ${md(d.daily[0].day)}` : ""}</p>
    </section>
    <section className="card-soft">
      <b>본 권역</b>
      {d.regions.length === 0 ? <p className="small muted" style={{ marginTop: 8 }}>아직 없어요.</p> :
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="admin-table small">
            <thead><tr><th>권역</th><th>일정 봄</th><th>예약 화면</th><th>항공</th><th>숙소</th><th>저장</th><th>최근</th></tr></thead>
            <tbody>{d.regions.map((r) => <tr key={r.region}><td>{rName(r.region)}</td><td>{r.views}</td><td>{r.book}</td><td>{r.flight}</td><td>{r.hotel}</td><td>{r.save}</td><td>{when(r.last)}</td></tr>)}</tbody>
          </table>
        </div>}
    </section>
    <section className="card-soft">
      <b>저장한 여행 {d.saved?.length ?? 0}개</b>
      {!d.saved?.length ? <p className="small muted" style={{ marginTop: 8 }}>아직 없어요.</p> :
        <ul className="admin-log small">{d.saved.map((p, i) => <li key={i}><span className="xs faint">{md(p.createdAt)}</span> {p.regionName}{p.start ? ` · ${md(p.start)}~${p.end ? md(p.end) : ""}` : ""}</li>)}</ul>}
    </section>
    <section className="card-soft">
      <b>최근 이용 기록</b>
      {d.recent.length === 0 ? <p className="small muted" style={{ marginTop: 8 }}>아직 없어요.</p> :
        <ol className="admin-log small">{d.recent.map((x, i) => <li key={i}><span className="xs faint">{when(x.ts)}</span> {activityLabel(x.step, x.region, x.path, rName)}</li>)}</ol>}
    </section>
    <section>
      {!confirmDel ? <button className="btn btn-ghost xs" onClick={() => setConfirmDel(true)}>이 계정 삭제(탈퇴 처리)</button> :
        <div className="row-wrap"><span className="small">정말 삭제할까요? 기록도 모두 지워져요.</span><button className="btn" style={{ color: "var(--danger)" }} onClick={del}>삭제</button><button className="btn btn-ghost" onClick={() => setConfirmDel(false)}>취소</button></div>}
    </section>
  </div>;
}
