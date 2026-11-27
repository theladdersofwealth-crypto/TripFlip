"use client";
import { MACAU_DAY_TRIP_PLACES } from "@/services/regionScore";
// 권역 상세 탭(형님 11/24: 나트랑앱처럼). 예약·관광지·음식점 탭 내용. 일정 탭은 /r/[id] client.tsx 그대로.
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PlaceThumb, ThumbCredit, usePlaceImage, useThumbRef } from "@/components/PlaceThumb";
import { DiningMapDetails, DiningStatusBadge } from "@/components/DiningMapDetails";
import { pendingDiningLast } from "@/data/dining";
import { FlightSheet, HotelSheet, flightBasis, hotelKo, pickPrice, tierText } from "@/components/PriceSheets";
import { CONCEPTS } from "@/data/regionsV1";
import type { Concept, PlaceV1 } from "@/data/regionsV1";
import { PLACE_ATTRS } from "@/data/placeAttrs";
import { KRW_PER_USD } from "@/data/worldPrices";
import { relaxedNotice } from "@/lib/livePrices";
import { AFFILIATE_NOTE } from "@/lib/legal";
import { track } from "@/lib/analytics";
import { kkdaySearchUrl, klookSearchUrl, welcomePickupsUrl } from "@/services/affiliate";
import { agodaFlightMissingKids, agodaFlightUrl, bookingComUrl, flightAffiliateUrl, flightSearchUrl, hotelCandidates, hotelSearchUrl, klookStayUrl } from "@/services/booking";
import type { HotelPick } from "@/services/booking";
import { isFood, placesOf } from "@/services/planner";
import { PILOT_TWIN_OF, hotelEstimated } from "@/services/regionScore";
import type { RegionQuery, RegionResult } from "@/services/regionScore";

export type RegionTab = "예약" | "일정" | "관광지" | "음식점";
export const REGION_TABS: RegionTab[] = ["예약", "일정", "관광지", "음식점"];

const man = (krw: number) => `${Math.round(krw / 10000).toLocaleString()}만원`;
const mapUrl = (p: PlaceV1) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.lat != null && p.lon != null ? `${p.lat},${p.lon}` : p.en || p.name)}`;
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const aff = { target: "_blank", rel: "noopener noreferrer sponsored" } as const;

export function TabBar({ tab, onTab }: { tab: RegionTab; onTab: (t: RegionTab) => void }) {
  return <div className="tabs region-tabs" role="tablist" aria-label="지역 상세">
    {REGION_TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => onTab(t)}>{t}</button>)}
  </div>;
}

/** 예약 탭: 항공 → 숙소 → 공항 픽업 → 투어. 제휴 링크가 첫 버튼. */
export function BookTab({ r, q }: { r: RegionResult; q: RegionQuery }) {
  const s = r.stay;
  const tier = q.stay;
  const [open, setOpen] = useState<"flight" | HotelPick | null>(null);
  const [all, setAll] = useState(false);
  const hotels = hotelCandidates(r.region.id, tier);
  const estimated = !hotels.length && s.priceSource.hotel !== "live" && hotelEstimated(PILOT_TWIN_OF[r.region.id] ?? r.region.id);
  const id = r.region.id;
  return <div className="stack" style={{ marginTop: 14 }}>
    <p className="small"><b>일행 예상 경비 {s.partyTotalKrw == null ? "미확인" : `약 ${man(s.partyTotalKrw)}`}</b> <span className="xs muted">· {s.nights}박 · {s.rooms}객실{s.roomEstimated ? " 가정" : ""} · 항공·숙소·식비</span></p>
    <section className="book-card">
      <div className="row"><Icon name="plane" size={20} /><b>항공</b></div>
      <button type="button" className="cost-row" onClick={() => setOpen("flight")}>
        <span>1인 왕복 <b>약 {s.flightKrw != null ? man(s.flightKrw) : "미확인"}</b><small>{flightBasis(id, q.startDate)} · 항공사·시간 보기</small></span><Icon name="next" size={16} />
      </button>
      <a className="btn btn-teal btn-block" href={agodaFlightUrl(r.region, q)} onClick={() => track("flight", id)} {...aff}>아고다 항공 <Icon name="link" /></a>
      {agodaFlightMissingKids(r.region, q) && <p className="xs muted">아고다 항공 링크엔 어른 인원만 들어가요. 아이 인원은 아고다에서 추가해 주세요.</p>}
      <div className="grid-2">
        <a className="btn btn-block" href={flightAffiliateUrl(r.region, q)} onClick={() => track("flight", id)} {...aff}>Aviasales <Icon name="link" /></a>
        <a className="btn btn-block" href={flightSearchUrl(r.region, q)} onClick={() => track("flight", id)} {...ext}>스카이스캐너 <Icon name="link" /></a>
      </div>
    </section>
    <section className="book-card">
      <div className="row"><Icon name="bed" size={20} /><b>숙소</b><span className="xs muted">{tier}({tierText(tier)})</span></div>
      <p className="small">{s.hotelNightUsd != null ? <>1박 <b>약 {man(s.hotelNightUsd * KRW_PER_USD)}{estimated ? "(추정)" : ""}</b> × {s.rooms}실 × {s.nights}박</> : "숙소 가격 미확인"}
        {estimated && <span className="xs muted" style={{ display: "block" }}>숙소 자료 없음 · 나라 물가(세계은행)로 추정, 실측 아님</span>}</p>
      {hotels.length > 0 && <div className="hotel-picks">
        {(all ? hotels : hotels.slice(0, 3)).map((h) => <button type="button" key={h.name} className="hotel-pick" onClick={() => setOpen(h)}><span><b>{hotelKo(h.name)}</b><small>{[h.rating != null ? `★${h.rating}` : "", h.reviews != null ? `후기 ${h.reviews.toLocaleString()}개` : "", pickPrice(h)].filter(Boolean).join(" · ")}</small></span><Icon name="next" size={16} /></button>)}
        {hotels.length > 3 && !all && <button type="button" className="xs link-btn" onClick={() => setAll(true)}>숙소 더 보기 ({hotels.length}곳) ▾</button>}
      </div>}
      <a className="btn btn-teal btn-block" href={hotelSearchUrl(r.region, q)} onClick={() => track("hotel", id)} {...aff}>아고다 {r.region.name} 호텔 <Icon name="link" /></a>
      <div className="grid-2">
        <a className="btn btn-block" href={klookStayUrl(r.region, q)} onClick={() => track("hotel", id)} {...aff}>클룩 <Icon name="link" /></a>
        <a className="btn btn-block" href={bookingComUrl(r.region, q)} onClick={() => track("hotel", id)} {...ext}>부킹닷컴 <Icon name="link" /></a>
      </div>
      {relaxedNotice(id) && <span className="xs warn">⚠ {relaxedNotice(id)}</span>}
    </section>
    <section className="book-card">
      <div className="row"><Icon name="car" size={20} /><b>공항 픽업</b></div>
      <a className="btn btn-block" href={welcomePickupsUrl()} {...aff}>Welcome Pickups <Icon name="link" /></a>
    </section>
    <section className="book-card">
      <div className="row"><Icon name="compass" size={20} /><b>투어·입장권</b></div>
      <div className="grid-2">
        <a className="btn btn-block" href={klookSearchUrl(r.region.searchName)} {...aff}>클룩 <Icon name="link" /></a>
        <a className="btn btn-block" href={kkdaySearchUrl(r.region.searchName)} {...aff}>KKday <Icon name="link" /></a>
      </div>
    </section>
    <p className="xs muted">ⓘ {AFFILIATE_NOTE}</p>
    <Link href={`/book/${id}`} className="btn btn-primary btn-block">예약 상태 체크하고 내 여행에 저장 <Icon name="next" /></Link>
    {open === "flight" && <FlightSheet region={r.region} q={q} flightKrw={s.flightKrw} onClose={() => setOpen(null)} />}
    {open && open !== "flight" && <HotelSheet hotel={open} tier={tier} region={r.region} q={q} onClose={() => setOpen(null)} />}
  </div>;
}

const GRADE_CLS: Record<string, string> = { S: "gS", A: "gA", B: "gB", C: "gC", D: "gC" };
function PlaceRow({ p, food }: { p: PlaceV1; food?: boolean }) {
  const [open, setOpen] = useState(false);
  const attr = PLACE_ATTRS[p.id];
  const mapRecord = food ? p.dining?.mapRecord : undefined;
  const sub = food ? [p.dining?.kind === "cafe" ? "☕ 카페" : "🍽 식당", p.dining?.cuisine, mapRecord ? mapRecord.area : p.dining?.address].filter(Boolean).join(" · ") : [p.tags.slice(0, 2).join("·"), p.travel].filter(Boolean).join(" · ");
  const ref = useThumbRef();
  const img = usePlaceImage(p, ref);
  return <div className="place-row" ref={ref}>
    <PlaceThumb p={p} img={img} size="wide" />
    <div className="place-head"><div className="place-head-copy">
      <div className="between"><b>{p.name}</b>{mapRecord ? <DiningStatusBadge place={p} /> : p.grade && <span className={`grade-pill ${GRADE_CLS[p.grade] ?? "gC"}`}>{p.grade}</span>}</div>
      <span className="xs muted">{sub || "정보 미확인"}</span>
      <button type="button" className="xs link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "상세 닫기 ▴" : "상세 보기 ▾"}</button>
    </div></div>
    {open && <div className="place-more xs">{mapRecord ? <DiningMapDetails place={p} /> : <>
      {!food && <div>컨셉: {p.concepts.join(" · ")}</div>}
      {!food && <div>권장 시간: {attr ? `${attr[0]} · 약 ${attr[1] >= 60 ? `${Math.round(attr[1] / 6) / 10}시간` : `${attr[1]}분`}` : "미확인"}</div>}
      {p.note && <div>{p.note}</div>}
      {food && <div>평점·가격·영업시간: 미확인{p.dining?.source ? ` (출처 ${p.dining.source})` : ""}</div>}
      {p.en && p.en !== p.name && <div className="faint">{p.en}</div>}
      <ThumbCredit img={img} />
      <a href={mapUrl(p)} {...ext} style={{ color: "var(--teal-dark)", fontWeight: 700 }}>구글 지도에서 보기 ›</a>
    </>}</div>}
  </div>;
}

const GRADE_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };
/** 관광지 탭: 맨 위 추천 이유, 컨셉 칩, 등급순 카드(상세는 눌러서) */
export function SightsTab({ r }: { r: RegionResult }) {
  const [filter, setFilter] = useState<Concept | "전체">("전체");
  const [shown, setShown] = useState(15);
  const all = placesOf(r.region.id).filter((p) => !isFood(p)).sort((a, b) => (GRADE_ORDER[a.grade ?? "D"] ?? 5) - (GRADE_ORDER[b.grade ?? "D"] ?? 5));
  const concepts = CONCEPTS.filter((c) => all.some((p) => p.concepts.includes(c)));
  const list = filter === "전체" ? all : all.filter((p) => p.concepts.includes(filter));
  return <div style={{ marginTop: 14 }}>
    {(!!r.themes?.length || r.reasons.length > 0) && <div className="why-box">
      <b className="small">이래서 추천했어요</b>
      {r.themes?.map((t) => <div key={t.theme} className="theme-row"><span className="theme-ico" aria-hidden>{t.icon}</span><span className="theme-detail"><b>{t.theme}</b> · {t.names.slice(0, 2).join(", ")}<span className="theme-count muted"> 등 {t.count}곳</span></span></div>)}
      {r.reasons.length > 0 && <ul className="reason-list">{r.reasons.map((s) => <li key={s}>{s}</li>)}</ul>}
    </div>}
    {r.region.id==="HK"&&<MacauDayTrip/>}
    {!all.length ? <p className="empty-tab">이 지역 관광지는 준비 중이에요</p> : <>
      <div className="row-wrap" style={{ margin: "12px 0 10px" }}>
        {(["전체", ...concepts] as const).map((c) => <button key={c} type="button" className={`chip-btn ${filter === c ? "on" : ""}`} onClick={() => { setFilter(c); setShown(15); }}>{c}</button>)}
      </div>
      <div className="stack" style={{ gap: 8 }}>{list.slice(0, shown).map((p) => <PlaceRow key={p.id} p={p} />)}</div>
      {list.length > shown && <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setShown(shown + 15)}>더 보기 ({list.length - shown}곳)</button>}
      <p className="xs faint" style={{ marginTop: 10 }}>사진은 위키미디어 공용(작가·라이선스는 상세 보기)이고, 없는 곳은 색 블록으로 보여요. 등급은 AI 추정이에요. 이동시간은 거점에서 직선거리로 잡은 구간이라 실제와 달라요.</p>
    </>}
  </div>;
}

/** 음식점 탭: 등록된 식당만. 없으면 한 줄 안내 */
export function FoodTab({ r }: { r: RegionResult }) {
  const [shown, setShown] = useState(15);
  const list = placesOf(r.region.id).filter((p) => p.dining || isFood(p)).sort(pendingDiningLast);
  if (!list.length) return <p className="empty-tab">🍽<br />이 지역 음식점은 준비 중이에요<br /><span className="xs muted">관광지 탭에서 먼저 둘러보세요</span></p>;
  return <div style={{ marginTop: 14 }}>
    <p className="note-box xs">가격대는 참고용이에요. 실제 가격과 영업시간은 방문 전에 확인해 주세요.</p>
    <div className="stack" style={{ gap: 8 }}>{list.slice(0, shown).map((p) => <PlaceRow key={p.id} p={p} food={!!p.dining} />)}</div>
    {list.length > shown && <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setShown(shown + 15)}>더 보기 ({list.length - shown}곳)</button>}
  </div>;
}

export function MacauDayTrip(){return <section className="card-soft stack" style={{marginTop:12}} aria-label="마카오 당일치기"><b>마카오 당일치기 · 별도 선택</b><p className="small muted">홍콩 시내 명소 및 자동 일정에 섞지 않아요. 별도 하루를 비워 왕복 이동·출입경·운항편을 확인해 주세요. 추가 교통비는 기본 경비에 포함하지 않았어요.</p><ul className="small">{MACAU_DAY_TRIP_PLACES.map(p=><li key={p.id}>{p.name}</li>)}</ul></section>;}
