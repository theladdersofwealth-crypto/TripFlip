import { FreeBadge, PremiumBadge } from "@/components/ui";

const FREE = ["여행지 탐색", "기본 여행정보", "기본 일정 생성", "기본 방문지 · 음식점 정보", "여행 저장 (3개까지)", "기본 추천"];
const PREMIUM = [
  "심화 여행 데이터",
  "고급 개인화",
  "가족·아이 세부 최적화",
  "이동시간 기반 고급 재배치",
  "숙소별 일정 비교",
  "날씨 대응 자동 재최적화",
  "고급 AI 일정 수정",
  "무제한 여행 저장",
  "PDF · 공유 여행계획서",
  "광고 제거",
];

export default function PremiumPage() {
  return (
    <main className="container page" style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Free와 Premium</h1>
      <p className="muted" style={{ marginTop: 4 }}>TripFlip Free는 계속 무료예요. Premium은 처음부터 유료 플랜으로 운영돼요.</p>

      <div className="card-soft stack" style={{ marginTop: 16, background: "var(--teal-50)" }}>
        <div className="row"><PremiumBadge /><b>출시 기념 90일 무료</b></div>
        <p className="small">출시 기념으로 Premium을 90일간 무료로 이용할 수 있어요. 90일이 지나도 Free 기능은 그대로 무료예요.</p>
      </div>

      <div className="cards-grid" style={{ marginTop: 16 }}>
        <section className="card stack">
          <div className="between"><h2 style={{ fontSize: 20 }}>Free</h2><FreeBadge /></div>
          <p className="small muted">영구 무료</p>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">{FREE.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
        <section className="card stack" style={{ borderColor: "var(--navy)" }}>
          <div className="between"><h2 style={{ fontSize: 20 }}>Premium</h2><PremiumBadge /></div>
          <p className="small muted">유료 플랜 · 가격 미정</p>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">{PREMIUM.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
      </div>
      <p className="xs faint" style={{ marginTop: 16 }}>MVP 단계에서는 결제 기능이 없어요. Premium 표시는 기능 구분을 위한 배지예요.</p>
    </main>
  );
}
