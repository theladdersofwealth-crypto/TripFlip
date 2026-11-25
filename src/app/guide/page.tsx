"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { HomeFaq } from "@/components/HomeFaq";
import { AFFILIATE_NOTE, CONTACT_EMAIL } from "@/lib/legal";

// 안내 탭(11/25 형님): 자주 묻는 질문·데이터 출처·약관·문의를 한곳에. 위쪽 탭은 주소 #faq·#data·#legal로 바로 열 수 있다.
const TABS = [
  { id: "faq", label: "자주 묻는 질문" },
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
