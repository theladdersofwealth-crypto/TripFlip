"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty } from "@/components/ui";
import { loadGuestPlans, loadLegacyTrips, loadPlans, moveGuestPlansToAccount, planState, removePlan } from "@/lib/flow";
import type { LegacyTrip, SavedPlan } from "@/lib/flow";
import { fmtDate } from "@/services/itineraryV1";
import { tripDays } from "@/services/regionScore";
import { PLANS_SYNCED_EVENT, syncPlans } from "@/lib/planSync";
import { AUTH_EVENT, loadAuth } from "@/lib/account";

export default function MyTripsPage() {
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [legacy, setLegacy] = useState<LegacyTrip[]>([]);
  const [member, setMember] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    const on = () => { setPlans(loadPlans()); setMember(loadAuth()?.nick ?? null); setGuestCount(loadAuth() ? loadGuestPlans().length : 0); setTick((n) => n + 1); };
    on(); setLegacy(loadLegacyTrips());
    window.addEventListener(PLANS_SYNCED_EVENT, on);
    window.addEventListener(AUTH_EVENT, on);
    return () => { window.removeEventListener(PLANS_SYNCED_EVENT, on); window.removeEventListener(AUTH_EVENT, on); };
  }, []);
  if (!plans) return null;

  return (
    <main className="container page" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>내 여행</h1>
      {member ? <p className="xs muted">{member} 님 계정에 자동 저장돼요 · 다른 폰에서 로그인하면 그대로 보여요.</p>
        : <p className="xs muted">이 기기·브라우저에 저장돼요. <Link href="/account">간편 가입·로그인</Link>하면 계정에 보관돼 다른 기기에서도 보여요.</p>}
      {member && guestCount > 0 && <div className="card-soft stack" style={{ marginTop: 12, gap: 8 }}>
        <b className="small">로그인 전에 이 기기에 저장한 여행이 {guestCount}개 있어요</b>
        <p className="xs muted">내 계정으로 옮기면 다른 기기에서도 보여요. 옮기지 않으면 로그아웃했을 때 이 기기에서만 보여요.</p>
        <button className="btn btn-sm btn-primary" onClick={() => { moveGuestPlansToAccount(); setGuestCount(loadGuestPlans().length); setPlans(loadPlans()); }}>내 계정으로 옮기기</button>
      </div>}
      {plans.length === 0 ? (legacy.length ? null : 
        <Empty icon="suitcase" title="아직 저장된 여행이 없어요" desc="추천받은 지역을 예약하고 저장하면 여기에 모여요." action={<Link href="/" className="btn btn-primary">여행지 추천받기</Link>} />
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {plans.map((p) => {
            const d = tripDays(p.query.startDate, p.query.endDate);
            return (
              <div key={p.id} className="card stack" style={{ gap: 10 }}>
                <Link href={`/r/${p.regionId}?plan=${p.id}`} className="between">
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 800 }}>{p.regionName}</div>
                    <div className="small muted">{fmtDate(p.query.startDate)} ~ {fmtDate(p.query.endDate)} · {d - 1}박 {d}일 · {p.query.adults + p.query.children.length}명</div>
                    {member && <SyncBadge id={p.id} />}
                  </div>
                  <Icon name="next" />
                </Link>
                <div className="row-wrap">
                  <span className={`badge ${p.booked.flight ? "badge-ok" : "badge-muted"}`}>항공 {p.booked.flight ? "예약 완료" : "미예약"}</span>
                  <span className={`badge ${p.booked.hotel ? "badge-ok" : "badge-muted"}`}>숙소 {p.booked.hotel ? "예약 완료" : "미예약"}</span>
                  <span className="badge badge-muted">추천 {Math.round(p.display)}점</span>
                </div>
                <div className="between"><span /><button className="btn btn-sm btn-ghost" onClick={() => { removePlan(p.id); setPlans(loadPlans()); }}>삭제</button></div>
              </div>
            );
          })}
        </div>
      )}
      {legacy.length > 0 && (
        <section className="stack" style={{ marginTop: 20, gap: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>이전 형식으로 만든 계획</h2>
          <p className="xs muted">예전 화면에서 만든 계획이에요. 원본 그대로 두고 예전 편집기로 열어요.</p>
          {legacy.map((t) => <Link key={t.id} href={`/trip/${t.id}`} className="card-soft between"><span className="small"><b>{t.title}</b>{t.createdAt && <span className="xs muted" style={{ display: "block" }}>만든 날 {String(t.createdAt).slice(0, 10)}</span>}</span><Icon name="next" size={16} /></Link>)}
        </section>
      )}
    </main>
  );
}

function SyncBadge({ id }: { id: string }) {
  const st = planState(id);
  if (st.state === "synced") return <span className="chip chip-ok xs" style={{ marginTop: 4 }}>✓ 계정에 저장됨</span>;
  if (st.state === "waiting") return <span className="chip chip-unknown xs" style={{ marginTop: 4 }}>⏳ 동기화 대기 · 연결되면 자동 저장</span>;
  if (st.state === "failed") return <span className="chip chip-no xs" style={{ marginTop: 4, color: "var(--danger)" }} onClick={(e) => { e.preventDefault(); void syncPlans(); }}>⚠ 저장 실패{st.error ? ` · ${st.error}` : ""} (눌러서 다시)</span>;
  return null;
}
