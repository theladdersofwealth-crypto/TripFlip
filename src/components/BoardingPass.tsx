"use client";
import type { RegionQuery } from "@/services/regionScore";
import type { TravelMember } from "@/lib/travelParty";
import { fmtDate } from "@/services/itineraryV1";

type Slot = { n: string; k: string; v: string; sub: string; target: string };

const shortDate = (d: string) => fmtDate(d).replace(/\(.\)$/, "");
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

// 보딩패스 시안: 지금 고른 조건 4가지를 한 장에 요약하고, 칸을 누르면 해당 입력으로 이동
// compact: 첫 화면 위에 고정되는 작은 보딩패스. 답할 때마다 값이 바뀌고, 지금 묻는 칸(active)을 강조
export function BoardingPass({ q, members, days, interests, onSlot, hint = "칸을 누르면 아래 입력으로 이동해요.", compact = false, active }: { q: RegionQuery; members: TravelMember[]; days: number; interests: string[]; onSlot?: (target: string) => void; hint?: string; compact?: boolean; active?: string | null }) {
  const kids = members.filter((m) => m.relationship === "child");
  const adults = members.length - kids.length;
  const okDays = Number.isFinite(days) && days > 0;
  const slots: Slot[] = [
    { n: "①", k: "PASSENGER · 누구와", v: `${members.length}명`, sub: kids.length ? `성인 ${adults} · 자녀 ${kids.length}` : `성인 ${adults}`, target: "who" },
    { n: "②", k: "DATE · 언제", v: okDays ? `${days - 1}박 ${days}일` : "날짜 선택", sub: okDays ? `${fmtDate(q.startDate)} ~ ${fmtDate(q.endDate)}` : "출발·귀국일", target: "when" },
    { n: "③", k: "VIBE · 여행취향", v: `메인 ${interests[0] ?? "-"}`, sub: [interests.length > 1 ? `+ ${interests.slice(1, 3).join("·")}${interests.length > 3 ? ` 외 ${interests.length - 3}` : ""}` : null, `하루 ${q.perDay}곳`].filter(Boolean).join(" · "), target: "vibe" },
    { n: "④", k: "BUDGET · 예산", v: q.totalBudgetKrw != null ? `${Math.round(q.totalBudgetKrw / 10000).toLocaleString()}만원` : "미정", sub: q.stay, target: "s3" },
  ];
  // 작은 보딩패스는 칸마다 한 줄씩만 — 줄바꿈 없이 짧게
  const compactSub = (s: Slot) => {
    if (s.target === "when") return okDays ? `${shortDate(q.startDate)}~${shortDate(q.endDate)}` : s.sub;
    if (s.target === "vibe") return interests.length > 1 ? `+${interests[1]}${interests.length > 2 ? ` 외${interests.length - 2}` : ""}` : `하루 ${q.perDay}곳`;
    return s.sub;
  };
  if (compact) return (
    <section className="boarding-pass compact" aria-label="여행 조건 요약">
      <div className="ticket-top">
        <span className="ticket-top-label">TRIPFLIP BOARDING PASS</span>
        <div className="route-visualizer">
          <span className="airport-code">ICN</span>
          <div className="flight-arc"><div className="flight-arc-line"><i />✈️<i /></div></div>
          <span className="airport-code">FLIP?</span>
        </div>
      </div>
      <div className="ticket-slots-grid">
        {slots.map((s) => (
          <button key={s.k} type="button" className={`ticket-slot ${active === s.target ? "active" : ""}`} onClick={() => onSlot?.(s.target)}>
            <span className="slot-k">{s.n} {s.k.split(" · ")[1]}</span>
            <span key={s.v} className="slot-v">{s.v}</span>
            <span key={s.sub} className="slot-sub">{compactSub(s)}</span>
          </button>
        ))}
      </div>
    </section>
  );
  return (
    <section className="boarding-pass" aria-label="여행 조건 요약">
      <div className="ticket-top">
        <div className="ticket-top-label"><span>✈️ TRIPFLIP BOARDING PASS</span><span>{kids.length ? "FAMILY" : "ECONOMY"} CLASS</span></div>
        <div className="route-visualizer">
          <div className="airport-box"><span className="airport-code">ICN</span><span className="airport-name">서울 / 인천</span></div>
          <div className="flight-arc"><div className="flight-arc-line"><i />✈️<i /></div><small>맞춤 목적지 찾기</small></div>
          <div className="airport-box" style={{ alignItems: "flex-end" }}><span className="airport-code">FLIP?</span><span className="airport-name">추천 여행지</span></div>
        </div>
      </div>
      <div className="ticket-slots-grid">
        {slots.map((s) => (
          <button key={s.k} type="button" className="ticket-slot" onClick={() => (onSlot ? onSlot(s.target) : go(s.target))}>
            <span className="slot-k">{s.n} {s.k}</span>
            <span className="slot-v">{s.v}</span>
            <span className="slot-sub">{s.sub}</span>
          </button>
        ))}
      </div>
      <p className="ticket-hint xs muted">{hint}</p>
    </section>
  );
}
