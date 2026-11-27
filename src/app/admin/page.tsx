"use client";
// 관리자 통계: 일별 방문자, 사용 흐름(퍼널), 인기 권역. 데이터는 tripflip-stats Worker.
// The Worker authorizes only the owner’s Google session. UI state is not a permission check.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./admin.module.css";
import Link from "next/link";
import { AUTH_EVENT, AUTH_KEY, loadAuth } from "@/lib/account";
import { NEXT_KEY } from "@/components/AppShell";
import { NO_TRACK_KEY, STATS_URL, activityLabel } from "@/lib/analytics";
import { ALL_REGIONS } from "@/services/regionScore";
import { TRAVEL_AREAS } from "@/data/travelAreas";

const KEY_STORE = "tripflip:admin-key";

interface Day { day: string; visitors: number; views: number; newVisitors: number; steps: Record<string, number> }
interface Stats {
  ok: true; today: string; from: string; days: number; totalVisitors: number; periodVisitors: number;
  to?: string;
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
// Remove old shared-key copies when migrating to the owner’s Google session.
const clearLegacyAdminKey = () => {
  store.set(KEY_STORE, null);
  document.cookie = "tf_admin=; Max-Age=0; Path=/admin; SameSite=Strict" + (location.protocol === "https:" ? "; Secure" : "");
};

export default function AdminPage() {
  const [key, setKey] = useState("");
  const sessionToken = useRef<string | null>(null);
  const [accountLoaded, setAccountLoaded] = useState(false);
  const [days, setDays] = useState(30);
  const todayKst = kst(Date.now()).slice(0, 10);
  const earliest = kst(Date.now() - 364 * 86400000).slice(0, 10);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [rangeError, setRangeError] = useState("");
  const rangeQuery = custom ? `from=${custom.from}&to=${custom.to}` : `days=${days}`;
  const [data, setData] = useState<Stats | null>(null);
  const [dataRange, setDataRange] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [noTrack, setNoTrack] = useState(false);
  const [tab, setTab] = useState<"stats" | "members">("stats");
  const [revision, setRevision] = useState(0);
  const [verified, setVerified] = useState(false);

  const reset = useCallback((message = "") => {
    setData(null);
    setVerified(false);
    setError(message);
    setLoading(false);
    setTab("stats");
  }, []);
  const invalidKey = useCallback(() => reset("관리자 권한이 없거나 세션이 만료됐어요. 운영자 구글 계정으로 다시 로그인해 주세요."), [reset]);

  useEffect(() => {
    clearLegacyAdminKey();
    setNoTrack(store.get(NO_TRACK_KEY) === "1");
    const update = () => {
      const token = loadAuth()?.token ?? "";
      if (sessionToken.current !== token) { sessionToken.current = token; reset(); setKey(token); }
      setAccountLoaded(true);
    };
    const onStorage = (e: StorageEvent) => { if (e.key === AUTH_KEY || e.key === null) update(); };
    update();
    window.addEventListener(AUTH_EVENT, update);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AUTH_EVENT, update);
      window.removeEventListener("storage", onStorage);
    };
  }, [reset]);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setError("");
    setData(null);
    fetch(`${STATS_URL}/stats?${rangeQuery}`, { headers: { authorization: `Bearer ${key}` }, cache: "no-store", signal })
      .then(async (res) => {
        if (signal.aborted || sessionToken.current !== key) return;
        if (res.status === 401) { invalidKey(); return; }
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as Stats;
        if (j.ok !== true || !Array.isArray(j.daily) || !Array.isArray(j.regions) || !j.funnel) throw new Error("Invalid stats");
        if (rangeQuery.startsWith("from=") && new URLSearchParams(rangeQuery).get("to") !== j.to) throw new Error("Range unavailable");
        if (!signal.aborted && sessionToken.current === key) { setData(j); setDataRange(rangeQuery); setVerified(true); }
      })
      .catch(() => { if (!signal.aborted) setError("통계 서버에 연결하지 못했어요. 다시 시도해 주세요."); })
      .finally(() => { if (!signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, rangeQuery, revision, invalidKey]);

  const authenticated = Boolean(key && verified);

  if (!authenticated) return <main className={styles.gate}>
    <section className={styles.login}>
      <div className={styles.brand}>TRIPFLIP<span>운영 도구</span></div>
      <h1>관리자 로그인</h1>
      <p>방문 통계와 회원 이용 기록을 확인해요.</p>
      {(!accountLoaded || loading) ? <p role="status">관리자 권한을 확인하고 있어요…</p> : <>
        {error && <p className={styles.alert} role="alert">{error}</p>}
        <div className="stack" style={{ margin: "20px 0" }}>
          <Link className="btn btn-primary btn-block" href="/account" onClick={() => {
            if (!key) { try { sessionStorage.setItem(NEXT_KEY, "/admin"); } catch {} }
          }}>{key ? "내 계정에서 로그인 확인" : "운영자 구글 계정으로 로그인"}</Link>
          {key && error.startsWith("통계 서버") && <button className="btn" onClick={() => setRevision((n) => n + 1)}>다시 시도</button>}
        </div>
        <p className={styles.hint}>일반 트립플립 로그인과 같은 구글 계정을 사용해요. 기존 로그인이라면 내 계정에서 로그아웃한 뒤 다시 로그인해 주세요. 별도 관리자 비밀번호는 사용하지 않아요.</p>
      </>}
    </section>
  </main>;

  return <main className={`admin ${styles.shell}`}>
    <header className={styles.hero}>
      <div className={styles.brand}>TRIPFLIP<span>운영 도구</span></div>
      <div className={styles.heroRow}>
        <div><h1>트립플립 운영 현황</h1><p>방문부터 예약처 이동까지 한눈에</p></div>
        <Link className={styles.exit} href="/">나가기</Link>
      </div>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.tabs} role="group" aria-label="관리자 화면">
        <button aria-pressed={tab === "stats"} onClick={() => setTab("stats")}>방문 통계</button>
        <button aria-pressed={tab === "members"} onClick={() => setTab("members")}>회원 이용 기록</button>
      </div>
      <div className={styles.period} role="group" aria-label="조회 기간">
        {[7, 30, 90].map((d) => <button key={d} aria-pressed={!custom && days === d} onClick={() => { setCustom(null); setRangeError(""); setDays(d); }}>최근 {d}일</button>)}
        <button type="button" onClick={() => setRevision((n) => n + 1)}>새로고침</button>
      </div>
    </div>
    <form className={styles.range} onSubmit={(e) => {
      e.preventDefault();
      if (!from || !to || from > to || from < earliest || to > todayKst) { setRangeError("최근 365일 안에서 올바른 시작일과 종료일을 입력해 주세요."); return; }
      setRangeError("");
      setCustom({ from, to });
    }}>
      <label>시작일 <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} min={earliest} max={todayKst} required /></label>
      <label>종료일 <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={earliest} max={todayKst} required /></label>
      <button className="btn" type="submit">기간 적용</button>
      {custom && <span className="xs muted">조회 기간: {custom.from} ~ {custom.to}</span>}
    </form>
    {rangeError && <p role="alert" className={styles.alert}>{rangeError}</p>}
    {error && <p role="alert" className={styles.alert}>{error}</p>}
    {loading && <p role="status" className="muted small">불러오는 중…</p>}
    {tab === "stats" ? data && dataRange === rangeQuery && <Dashboard key={rangeQuery} data={data} /> : <Members adminKey={key} rangeQuery={rangeQuery} revision={revision} periodLabel={custom ? `${custom.from} ~ ${custom.to}` : `최근 ${days}일`} onUnauthorized={invalidKey} />}
    <footer className={styles.footer}>
      <label className="check-row xs muted">
        <input type="checkbox" checked={noTrack} onChange={(e) => { setNoTrack(e.target.checked); store.set(NO_TRACK_KEY, e.target.checked ? "1" : null); }} />
        이 기기의 테스트 방문 집계 제외
      </label>
      <p>방문자는 브라우저·기기 기준으로 집계해요. 표의 날짜는 한국 시간이에요.</p>
    </footer>
  </main>;
}

function Dashboard({ data }: { data: Stats }) {
  const today = data.daily[data.daily.length - 1];
  const yesterday = data.daily[data.daily.length - 2];
  const historical = !!data.to && data.to !== data.today;
  const last7 = data.daily.slice(-7);
  const avg7 = Math.round(last7.reduce((s, d) => s + d.visitors, 0) / Math.max(last7.length, 1));
  const f = data.funnel;
  const base = f.visit || 0;
  const maxV = Math.max(1, ...data.daily.map((d) => d.visitors));
  const [hover, setHover] = useState<Day | null>(null);
  const shown = hover ?? today;
  const tickEvery = Math.max(1, Math.ceil(data.daily.length / 6));
  const funnelRows = useMemo(() => FUNNEL.map(([k, label], i) => {
    const n = f[k] ?? 0;
    const prev = i ? f[FUNNEL[i - 1][0]] ?? 0 : n;
    return { k, label, n, ofAll: pct(n, base), ofPrev: i ? pct(n, prev) : "", w: base ? Math.min(100, (n / base) * 100) : 0 };
  }), [f, base]);

  return <div className="stack-lg" style={{ marginTop: 16 }}>
    <section className="admin-tiles">
      <Tile label={historical && today ? `${md(today.day)} 방문자` : "오늘 방문자"} value={today?.visitors ?? 0} sub={`신규 ${today?.newVisitors ?? 0} · 조회 ${today?.views ?? 0}`} />
      <Tile label={historical || !yesterday ? "직전 조회일 방문자" : "어제 방문자"} value={yesterday?.visitors ?? 0} sub={`신규 ${yesterday?.newVisitors ?? 0}`} />
      <Tile label="조회 기간 마지막 최대 7일 평균" value={avg7} />
      <Tile label={historical ? `선택 기간 ${data.days}일 방문자` : `최근 ${data.days}일 방문자`} value={data.periodVisitors} sub={`누적 ${data.totalVisitors.toLocaleString()}`} />
      {data.members && <Tile label="회원" value={data.members.total} sub={`오늘 가입 ${data.members.today} · 오늘 접속 ${data.members.activeToday}`} />}
    </section>

    <section className="card-soft">
      <div className="between"><b>일별 방문자</b><span className="xs muted">{shown ? `${md(shown.day)} · 방문자 ${shown.visitors} · 신규 ${shown.newVisitors} · 조회 ${shown.views}` : "기록 없음"}</span></div>
      <div className="admin-bars" onMouseLeave={() => setHover(null)} role="group" aria-label={`최근 ${data.days}일 일별 방문자 막대그래프`}>
        {data.daily.map((d) => <button key={d.day} type="button" className={`admin-bar ${hover?.day === d.day ? "on" : ""}`} onMouseEnter={() => setHover(d)} onFocus={() => setHover(d)} onClick={() => setHover(d)} aria-label={`${md(d.day)} 방문자 ${d.visitors}명`}>
          <span style={{ height: `${(d.visitors / maxV) * 100}%` }} />
        </button>)}
      </div>
      <div className="admin-axis xs faint">{data.daily.map((d, i) => <span key={d.day}>{i % tickEvery === 0 || i === data.daily.length - 1 ? md(d.day) : ""}</span>)}</div>
      <p className="xs faint">최고 {maxV}명 · 막대를 누르면 그날 숫자</p>
    </section>

    <section className="card-soft">
      <b>사용 흐름 (조회 {data.days}일, 기기 수)</b>
      <p className="xs muted" style={{ margin: "4px 0 10px" }}>각 단계까지 온 기기 수. 오른쪽 비율은 바로 앞 단계와의 기기 수 비교예요. 같은 기기가 순서대로 이동했다는 뜻은 아니에요.</p>
      <div className="stack" style={{ gap: 8 }}>
        {funnelRows.map((r) => <div key={r.k} className="admin-funnel">
          <div className="between small"><span>{r.label}</span><span><b>{r.n.toLocaleString()}</b> <span className="muted xs">({r.ofAll}){r.ofPrev && ` · 앞 단계 ${r.ofPrev}`}</span></span></div>
          <div className="admin-track"><span style={{ width: `${r.w}%` }} /></div>
        </div>)}
      </div>
      <p className="xs faint" style={{ marginTop: 8 }}>예약처 이동: 항공 {f.flight ?? 0} · 숙소 {f.hotel ?? 0} (실제 결제 여부는 제휴 연결 후 확인 가능)</p>
    </section>

    <section className="card-soft">
      <b>희망 지역 검색 횟수 (조회 {data.days}일)</b>
      <p className="xs muted">복수 선택은 지역마다 1회, 상관없음은 전체 1회. 고유 방문자 수가 아니며 개인별 기록은 저장하지 않아요.</p>
      {!data.searchAreas?.length ? <p className="small muted">아직 지역 선택 통계가 없어요.</p> :
        <div style={{ overflowX: "auto", marginTop: 8 }}><table className="admin-table small">
          <thead><tr><th>희망 지역</th><th>검색 횟수</th></tr></thead>
          <tbody>{data.searchAreas.map((r) => <tr key={r.area}><td>{r.area === "all" ? "상관없음(전체)" : TRAVEL_AREAS.find((a) => a.id === r.area)?.label ?? r.area}</td><td>{r.searches}</td></tr>)}</tbody>
        </table></div>}
    </section>
    <section className="card-soft">
      <b>인기 권역 (조회 {data.days}일)</b>
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
interface Member { uid: string; nick: string; created: number; last: number | null; visitsAll: number; daysAll: number; visits: number; days: number; regions: number; flight: number; hotel: number; save: number }
interface UsageReport {
  optedInSince: number | null; measuredFrom: string | null;
  activeSeconds: number; logins: number; clicks: number; visits: number; saves: number;
  outbound: number; hotelOutbound: number; otherOutbound: number;
  recent: { ts: number; kind: string; provider: string }[];
}
interface MemberDetail {
  identities?: { provider: string; emailHint: string | null }[];
  usage?: UsageReport | null;
  ok: true; devices: number;
  user: { uid: string; nick: string; created: number; lock_until: number };
  regions: { region: string; views: number; book: number; flight: number; hotel: number; save: number; last: number }[];
  daily: { day: string; visits: number }[];
  recent: { ts: number; step: string; region: string; path: string }[];
  saved?: { regionId: string; regionName: string; createdAt: string; start: string | null; end: string | null }[];
}

const kst = (ms: number) => new Date(ms + 9 * 3600000).toISOString();
/** 11/23 17:05 (한국 시간) */
const when = (ms: number | null) => (ms ? `${md(kst(ms))} ${kst(ms).slice(11, 16)}` : "–");
const rName = (id: string) => regionName.get(id) ?? id;

function Members({ adminKey, rangeQuery, revision, periodLabel, onUnauthorized }: { adminKey: string; rangeQuery: string; revision: number; periodLabel: string; onUnauthorized: () => void }) {
  const [list, setList] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setError("");
    setList(null);
    fetch(`${STATS_URL}/users?${rangeQuery}`, { headers: { authorization: `Bearer ${adminKey}` }, cache: "no-store", signal })
      .then(async (res) => {
        if (signal.aborted) return;
        if (res.status === 401) { onUnauthorized(); return; }
        if (!res.ok) throw new Error(String(res.status));
        const j = await res.json();
        if (!Array.isArray(j.users)) throw new Error("Invalid response");
        if (!signal.aborted) setList(j.users);
      })
      .catch(() => { if (!signal.aborted) setError("회원 기록을 불러오지 못했어요."); });
    return () => controller.abort();
  }, [adminKey, rangeQuery, revision, reload, onUnauthorized]);

  if (error) return <div className={styles.alert} role="alert">{error} <button className="btn" onClick={() => setReload((n) => n + 1)}>다시 시도</button></div>;
  if (!list) return <p role="status" className="muted small" style={{ marginTop: 12 }}>불러오는 중…</p>;
  if (open) return <MemberView adminKey={adminKey} uid={open} rangeQuery={rangeQuery} periodLabel={periodLabel} onUnauthorized={onUnauthorized} onBack={() => { setOpen(null); setReload((n) => n + 1); }} />;
  const filtered = list.filter((u) => u.nick.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="card-soft" style={{ marginTop: 16 }}>
    <div className={styles.memberHeading}><b>회원 {list.length}명</b><label>닉네임 검색<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
    <p className="xs muted" style={{ margin: "4px 0 10px" }}>조회 기간: {periodLabel}. 아래 목록은 기존 기기 기준 집계예요. 정확한 로그인 횟수와 동의 후 활동 기록은 회원 상세에서 확인해요. 줄을 누르면 상세 기록.</p>
    {list.length === 0 ? <p className="small muted">아직 가입한 회원이 없어요.</p> : filtered.length === 0 ? <p className="small muted">검색 결과가 없어요.</p> :
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table small">
          <thead><tr><th>닉네임</th><th>최근 접속</th><th>접속</th><th>접속일</th><th>본 권역</th><th>항공</th><th>숙소</th><th>저장</th><th>가입</th></tr></thead>
          <tbody>{filtered.map((u) => <tr key={u.uid}>
            <td><button className={styles.memberLink} onClick={() => setOpen(u.uid)}>{u.nick}</button></td><td>{when(u.last)}</td><td>{u.visits}</td><td>{u.days}</td><td>{u.regions}</td><td>{u.flight}</td><td>{u.hotel}</td><td>{u.save}</td><td>{md(kst(u.created))}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}

function MemberView({ adminKey, uid, rangeQuery, periodLabel, onBack, onUnauthorized }: { adminKey: string; uid: string; rangeQuery: string; periodLabel: string; onBack: () => void; onUnauthorized: () => void }) {
  const [d, setD] = useState<MemberDetail | null>(null);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteRequest = useRef<AbortController | null>(null);
  useEffect(() => () => deleteRequest.current?.abort(), [adminKey, uid]);
  const url = `${STATS_URL}/user?id=${encodeURIComponent(uid)}`;
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    fetch(`${url}&${rangeQuery}`, { headers: { authorization: `Bearer ${adminKey}` }, cache: "no-store", signal })
      .then(async (res) => {
        if (signal.aborted) return;
        if (res.status === 401) { onUnauthorized(); return; }
        if (!res.ok) throw new Error(String(res.status));
        const result = await res.json();
        if (!signal.aborted) setD(result);
      })
      .catch(() => { if (!signal.aborted) setError("상세 기록을 불러오지 못했어요."); });
    return () => controller.abort();
  }, [adminKey, url, rangeQuery, onUnauthorized]);
  const del = async () => {
    if (deleteRequest.current || !confirmDel) return;
    const controller = new AbortController();
    deleteRequest.current = controller;
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(url, { method: "DELETE", headers: { authorization: `Bearer ${adminKey}` }, signal: controller.signal }).catch(() => null);
    if (controller.signal.aborted) return;
    deleteRequest.current = null;
    if (res?.status === 401) onUnauthorized();
    else if (res?.ok) onBack();
    else { setDeleting(false); setDeleteError("삭제하지 못했어요."); }
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
      <p className="small muted">가입 {when(u.created)} · 로그인 기기 {d.devices}대</p>
      {!!d.identities?.length && <p className="small">연결 계정: {d.identities.map((i) => [providerLabel(i.provider), i.emailHint].filter(Boolean).join(" ")).join(" · ")}</p>}
      <p className="xs muted">선택 기간: {periodLabel}</p>
      <p className="small" style={{ marginTop: 6 }}>기존 기기 기록(화면 열람) {totalVisits}회 · 접속한 날 {d.daily.length}일{d.daily[0] ? ` · 마지막 ${md(d.daily[0].day)}` : ""}</p>
    </section>
    <AccountUsage usage={d.usage} />
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
      <b>현재 저장된 여행 {d.saved?.length ?? 0}개</b><p className="xs muted">현재 보관 중인 목록이며 기간 필터와 별개예요 (최대 50개).</p>
      {!d.saved?.length ? <p className="small muted" style={{ marginTop: 8 }}>아직 없어요.</p> :
        <ul className="admin-log small">{d.saved.map((p, i) => <li key={i}><span className="xs faint">{md(p.createdAt)}</span> {p.regionName}{p.start ? ` · ${md(p.start)}~${p.end ? md(p.end) : ""}` : ""}</li>)}</ul>}
    </section>
    <section className="card-soft">
      <b>기존 기기 이용 기록</b>
      {d.recent.length === 0 ? <p className="small muted" style={{ marginTop: 8 }}>아직 없어요.</p> :
        <ol className="admin-log small">{d.recent.map((x, i) => <li key={i}><span className="xs faint">{when(x.ts)}</span> {activityLabel(x.step, x.region, x.path, rName)}</li>)}</ol>}
    </section>
    <section className={styles.dangerZone}>
      {deleteError && <p role="alert">{deleteError}</p>}
      {!confirmDel ? <button className="btn btn-ghost xs" onClick={() => setConfirmDel(true)}>이 계정 삭제(탈퇴 처리)</button> :
        <div className="row-wrap"><span className="small">정말 삭제할까요? 기록도 모두 지워져요.</span><button className="btn" style={{ color: "var(--danger)" }} onClick={del} disabled={deleting}>{deleting ? "삭제 중…" : "삭제 확정"}</button><button className="btn btn-ghost" disabled={deleting} onClick={() => setConfirmDel(false)}>취소</button></div>}
    </section>
  </div>;
}

const providerLabel = (p: string) => ({ google: "구글", kakao: "카카오", naver: "네이버" }[p] ?? p);
const usageLabels: Record<string, string> = {
  login: "소셜 로그인 성공", access: "화면 접속", saved: "새 여행 저장 확인",
  flight: "항공 링크 클릭", hotel: "숙소 링크 클릭", outbound: "기타 예약 링크 클릭",
};

function AccountUsage({ usage }: { usage?: UsageReport | null }) {
  return <section className="card-soft stack" aria-label="회원 행동 분석">
    <b>회원 행동 분석</b>
    {!usage ? <p className="small muted">상세 분석 수집을 아직 시작하지 않았어요.</p>
      : !usage.optedInSince ? <p className="small muted">상세 분석 참여에 동의한 기록이 없어요.</p>
      : <>
        <p className="small muted">{usage.measuredFrom ? `기록 시작: ${usage.measuredFrom} · ` : ""}동의 후 최대 90일 기록만 표시해요. 로그인 횟수에는 앱을 열거나 세션을 확인한 건 포함하지 않아요.</p>
        <div className="admin-tiles">
          <Tile label="로그인 성공" value={usage.logins} sub="구글·카카오·네이버 인증" />
          <Tile label="화면 접속" value={usage.visits} sub="화면 이동 포함" />
          <Tile label="활동 시간(분)" value={Math.round(usage.activeSeconds / 60 * 10) / 10} sub="앱이 화면에 보일 때만 추정" />
          <Tile label="버튼·링크 클릭" value={usage.clicks} />
          <Tile label="새 여행 저장 확인" value={usage.saves} sub={usage.saves ? "서버 저장 기록 있음" : "이 기간 확인된 저장 없음"} />
          <Tile label="외부 예약 링크 클릭" value={usage.outbound + usage.hotelOutbound + usage.otherOutbound} sub={`항공 ${usage.outbound} · 숙소 ${usage.hotelOutbound} · 기타 ${usage.otherOutbound}`} />
        </div>
        <p className="xs muted">외부 링크를 누른 시점까지만 확인돼요. 외부 사이트 열림·열람·결제는 확인할 수 없어요.</p>
        <b>최근 행동 타임라인 (한국 시간)</b>
        {!usage.recent.length ? <p className="small muted">이 기간에 기록된 행동이 없어요.</p> : <ol className="admin-log small">
          {usage.recent.map((e, i) => <li key={i}><time className="xs muted" dateTime={new Date(e.ts).toISOString()}>{kst(e.ts).slice(0, 19).replace("T", " ")}</time> {usageLabels[e.kind] ?? e.kind}{e.provider ? ` · ${providerLabel(e.provider)}` : ""}</li>)}
        </ol>}
      </>}
  </section>;
}
