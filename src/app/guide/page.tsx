"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { HomeFaq } from "@/components/HomeFaq";
import { AFFILIATE_NOTE, CONTACT_EMAIL } from "@/lib/legal";

// 안내 탭(11/25 형님): 자주 묻는 질문·데이터 출처·약관·문의를 한곳에. 위쪽 탭은 주소 #faq·#data·#legal로 바로 열 수 있다.
const TABS = [
  { id: "faq", label: "자주 묻는 질문" },
  { id: "booking", label: "예약 안내" },
  { id: "data", label: "데이터 출처" },
  { id: "legal", label: "약관·문의" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const DATA: [string, string][] = [
  ["항공·숙소 가격", "최근 2주 수집한 최저가의 평균이에요. 실제 예약가는 달라요."],
  ["장소 등급·적합도", "추정값이에요. 자료의 양과 확인 수준은 지역마다 달라요."],
  ["날씨", "월별 기후 경향이에요. 여행일의 실제 예보가 아니에요."],
  ["경비에 빠진 것", "현지 교통비·입장료 등은 포함되지 않아요."],
  ["자료 출처", "Wikidata·Wikivoyage 같은 공개 자료와 AI 추정값을 함께 써요. 추정값은 '추정', 확인 못 한 정보는 '미확인'으로 표시해요."],
];

const BOOKING: [string, string][] = [
  ["항공", "항공 선호는 여행 계획에 저장돼요. 표시 금액은 수집한 가격 또는 과거 자료를 기준으로 한 추정치예요. 항공사·수하물·도착 시간과 실제 요금은 예약처에서 확인해 주세요. 아고다 항공 링크에는 성인만 포함될 수 있으니 자녀 인원과 실제 나이는 예약처에서 입력하거나 확인해 주세요."],
  ["숙소", "자료가 없으면 세계은행 국가별 물가를 바탕으로 숙박비를 추정해요. ‘청결은 기본입니다’는 여행 준비 기준을 뜻하며, 트립플립이 숙소별 청결을 확인하거나 보장한다는 뜻은 아니에요. 객실 정원·침대·청결 후기·자녀 추가요금은 예약처에서 확인해 주세요."],
  ["아고다·클룩 숙소 링크", "아고다에는 입력한 체크인·체크아웃·인원·객실 수를 넘겨도, 아고다에서 날짜가 지났거나 너무 멀면 바꿀 수 있어요. 특정 숙소 대신 도시 목록이 열릴 수도 있어요. 클룩도 도시 목록 또는 검색 첫 화면으로 열릴 수 있으니 예약 전에 날짜와 인원, 객실 수를 확인해 주세요."],
  ["여행 eSIM", "여행지별 이심모아 요금제나 국가 선택 화면으로 연결돼요. 요금·지원 단말·사용 기간·개통 조건을 이심모아에서 확인하고, 결제와 개통도 이심모아에서 진행해 주세요."],
  ["예상 경비와 여행 저장", "항공·숙박은 수집 자료나 과거 가격을, 식비는 가정을 사용해 계산해요. 실제 예약가는 아니에요. 예약·결제 전에도 여행 계획은 저장할 수 있어요. 항공시간과 숙소 위치가 확정되면 동선을 다시 확인해 주세요."],
  ["제휴와 결제", `트립플립은 예약을 직접 판매하지 않아요. ‘제휴’가 붙은 링크는 제휴 링크예요. ${AFFILIATE_NOTE}`],
];

export default function GuidePage() {
  const [tab, setTab] = useState<TabId>("faq");
  useEffect(() => {
    const read = () => { const h = location.hash.slice(1); if (TABS.some((t) => t.id === h)) setTab(h as TabId); };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const pick = (id: TabId) => { setTab(id); history.replaceState(null, "", `#${id}`); };
  return <main className="container page" style={{ maxWidth: 560 }}>
    <h1 style={{ fontSize: 24, fontWeight: 900 }}>안내</h1>
    <div className="seg-tabs" role="tablist" aria-label="안내 항목">
      {TABS.map((t) => <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => pick(t.id)}>{t.label}</button>)}
    </div>
    <section id="panel-faq" role="tabpanel" aria-labelledby="tab-faq" hidden={tab !== "faq"}>
      <HomeFaq bare />
    </section>
    <section id="panel-booking" role="tabpanel" aria-labelledby="tab-booking" hidden={tab !== "booking"}>
      <dl className="guide-dl">{BOOKING.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
    <section id="panel-data" role="tabpanel" aria-labelledby="tab-data" hidden={tab !== "data"}>
      <dl className="guide-dl">{DATA.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <Link href="/data-status" className="small" style={{ display: "inline-block", marginTop: 12, color: "var(--teal-dark)", fontWeight: 600 }}>출처를 확인한 자료 목록 보기 ›</Link>
    </section>
    <section id="panel-legal" role="tabpanel" aria-labelledby="tab-legal" hidden={tab !== "legal"}>
      <div className="guide-list">
        <Link href="/legal/terms">이용약관<span>›</span></Link>
        <Link href="/legal/privacy"><b>개인정보처리방침</b><span>›</span></Link>
        <a href={`mailto:${CONTACT_EMAIL}`}>문의하기<span>{CONTACT_EMAIL}</span></a>
      </div>
      <p className="xs muted" style={{ marginTop: 12 }}>트립플립(TripFlip)은 예약을 직접 판매하지 않아요. {AFFILIATE_NOTE}</p>
    </section>
  </main>;
}
