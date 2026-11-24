"use client";
import Link from "next/link";
import { NEXT_KEY } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import type { RegionResult } from "@/services/regionScore";

const HERO = ["#102f54,#00838c", "#1d497d,#00acb8", "#0b3a5b,#0ca678", "#3b2f63,#00838c", "#5a3a1a,#d9822b", "#102f54,#7a4fb5"];
function heroBg(country: string) {
  let h = 0;
  for (const ch of country) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `linear-gradient(135deg,${HERO[h % HERO.length]})`;
}
function budgetLine(total: number | null, budget: number | null | undefined) {
  if (budget == null) return "예산 미정";
  if (total == null) return "비교 불가";
  const diff = Math.round((budget - total) / 10000);
  return diff >= 0 ? `${diff.toLocaleString()}만원 여유` : `${(-diff).toLocaleString()}만원 초과`;
}

export function priceNote(s?: { flight: string; hotel: string; updatedAt: string | null }) {
  if (!s || !s.updatedAt || (s.flight !== "live" && s.hotel !== "live")) return "예상 경비는 10/31 수집 가격과 식비 가정으로 계산했어요.";
  const d = new Date(s.updatedAt);
  return `예상 경비의 ${s.flight === "live" ? "항공" : ""}${s.flight === "live" && s.hotel === "live" ? "·" : ""}${s.hotel === "live" ? "숙소" : ""} 가격은 최근 2주 수집한 최저가의 평균이에요(${d.getMonth() + 1}/${d.getDate()} 갱신). 실제 예약가는 달라요.`;
}

/** 비회원용 흐린 결과: 실제 여행지 이름·점수·경비는 화면(DOM)에 넣지 않고 모양만 같은 가짜 카드를 흐리게 보여 준다 */
export function GuestPreview({ count, beforeGo }: { count: number; beforeGo?: () => void }) {
  const goAccount = (hash: string) => {
    beforeGo?.();
    try { sessionStorage.setItem(NEXT_KEY, "/results"); } catch {}
    location.assign(`/account${hash}`);
  };
  const n = Math.max(1, Math.min(count, 4));
  return <div className="guest-wrap">
    <div className="guest-blur" aria-hidden>
      {Array.from({ length: n }, (_, i) => <article key={i} className={`rank-card ${i === 0 ? "first" : ""}`}>
        <div className="rank-hero" style={{ background: `linear-gradient(135deg,${HERO[i % HERO.length]})` }}>
          <div className="between" style={{ width: "100%" }}>
            <span className="rank-pill">{i === 0 ? "🏆 " : ""}{i + 1}위 추천</span>
            <span className="rank-match"><b className="rank-score">??</b>점 매칭</span>
          </div>
          <div className="rank-hero-name">○○○○</div>
          <div className="rank-hero-sub">○○ · ○월 ○○ · 적합도 추정</div>
        </div>
        <div className="rank-stats">
          <div><span>일행 예상 경비</span><b>약 ○○○만원</b></div>
          <div><span>예산 대비</span><b>○○만원 여유</b></div>
          <div><span>일정 준비</span><b>○○ 가능</b></div>
        </div>
        <span className="small bold">추천 이유</span>
        <ul className="reason-list"><li>○○○○ ○○○ ○○○○○ ○○</li><li>○○○ ○○○○ ○○○○</li></ul>
      </article>)}
    </div>
    <div className="guest-gate" role="dialog" aria-label="가입 안내">
      <b style={{ fontSize: 18 }}>🔒 추천 여행지 {count}곳을 찾았어요</b>
      <p className="small muted">가입하면 추천 여행지를 볼 수 있어요. 닉네임·생년월일·PIN 6자리, 30초면 끝나요. 가입·로그인하면 이 결과로 바로 돌아와요.</p>
      <button type="button" className="btn btn-primary btn-block" onClick={() => goAccount("")}>30초 가입하고 보기</button>
      <button type="button" className="btn btn-block" onClick={() => goAccount("#login")}>이미 계정이 있어요</button>
    </div>
  </div>;
}

/** 추천 순위 카드 목록. onSelect가 있으면(PC 2단) 페이지 이동 대신 오른쪽 상세를 바꾼다 */
export function RankCards({ ranked, budget, selected, onSelect, onOpen }: { ranked: RegionResult[]; budget: number | null | undefined; selected?: string | null; onSelect?: (id: string) => void; onOpen: (id: string) => void }) {
  const go = (id: string) => (onSelect ? onSelect(id) : onOpen(id));
  return <>
        {ranked.map((r, i) => (
          <article key={r.region.id} className={`rank-card reveal ${i === 0 ? "first" : ""} ${selected === r.region.id ? "picked" : ""}`} aria-current={selected === r.region.id || undefined} style={{ animationDelay: `${i * 0.08}s` }} onClick={() => go(r.region.id)}>
            <div className="rank-hero" style={{ background: heroBg(r.region.country) }}>
              <div className="between" style={{ width: "100%" }}>
                <span className="rank-pill">{i === 0 ? "🏆 " : ""}{r.rank}위 추천{r.weather.judge === "좋음" ? ` · ${r.weather.month}월 날씨 좋음` : ""}</span>
                <span className="rank-match"><b className="rank-score">{Math.round(r.display)}</b>점 매칭</span>
              </div>
              <div className="rank-hero-name">{r.region.name}</div>
              <div className="rank-hero-sub">{r.region.country} · {r.weather.judge === "미확인" ? "기후 미확인" : `${r.weather.month}월 ${r.weather.judge}`} · 적합도 추정</div>
            </div>
            <div className="rank-brief">
              <span className="small">{r.themes?.length ? r.themes.slice(0, 2).map((t) => `${t.icon} ${t.names[0]}`).join(" · ") : r.reasons[0] ?? ""}</span>
            </div>
            <div className="rank-brief">
              <b className="small">일행 {r.stay.partyTotalKrw == null ? "경비 미확인" : `약 ${Math.round(r.stay.partyTotalKrw / 10000).toLocaleString()}만원`}</b>
              <span className={`xs ${r.stay.budgetStatus === "over" ? "warn" : r.stay.budgetStatus === "within" ? "ok" : "muted"}`}>{budgetLine(r.stay.partyTotalKrw, budget)}</span>
            </div>
            {(r.flags.some((f) => f.includes("적합도를")) || r.overFlight || r.weather.judge === "스콜성 우기") && <span className="xs warn">⚠ {[r.flags.some((f) => f.includes("적합도를")) ? "일부 추정값" : "", r.overFlight ? "희망 비행시간 초과" : "", r.weather.judge === "스콜성 우기" ? "스콜성 우기" : ""].filter(Boolean).join(" · ")}</span>}
            <Link href={`/r/${r.region.id}`} className="row small" style={{ color: "var(--teal-dark)", fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); if (onSelect) { e.preventDefault(); onSelect(r.region.id); } }}>자세히 보기 · 예약·일정·관광지·음식점 <Icon name="next" size={16} /></Link>
          </article>
        ))}
  </>;
}
