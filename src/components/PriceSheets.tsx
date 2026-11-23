"use client";
// 추천 카드의 경비 내역에서 항공·숙소를 눌렀을 때 뜨는 팝업
import { useEffect, useState } from "react";
import type { RegionV1 } from "@/data/regionsV1";
import type { HotelRow } from "@/data/worldHotels";
import { HOTEL_KO } from "@/data/hotelKo";
import { FLIGHT_ESTIMATED, KRW_PER_USD } from "@/data/worldPrices";
import { liveFlightInfo, liveSummary } from "@/lib/livePrices";
import { loadFlightSamples } from "@/lib/flightSamples";
import type { FlightSample } from "@/lib/flightSamples";
import { flightAffiliateUrl, hotelSearchUrl } from "@/services/booking";
import { PILOT_TWIN_OF } from "@/services/regionScore";
import type { RegionQuery, StayTier } from "@/services/regionScore";
import { CenterModal } from "@/components/ui";
import { Icon } from "@/components/Icon";

const man = (krw: number) => `${Math.round(krw / 10000).toLocaleString()}만원`;
const WD = "일월화수목금토";
/** "2026-12-10T21:50" → "12/10(목) 21:50" (그 공항 현지 시각) */
function when(s: string) {
  const d = new Date(s.slice(0, 10) + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]}) ${s.slice(11, 16)}`;
}
const stopText = (n: number) => (n ? `경유 ${n}회` : "직항");
const hm = (min: number) => `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ""}`;

/** 경비에 넣은 항공 값의 기준을 짧게 */
export function flightBasis(regionId: string, startDate: string): string {
  const key = PILOT_TWIN_OF[regionId] ?? regionId;
  const info = liveFlightInfo(key, startDate);
  if (info?.basis === "month") return `${Number(info.month!.slice(5))}월 출발 최저가 평균`;
  if (info) return "여러 달 최저가의 중간값";
  return FLIGHT_ESTIMATED.has(key) ? "거리로 추정" : "10/31 수집 최저가";
}

export function hotelKo(name: string): string {
  return HOTEL_KO[name]?.[0] ?? name;
}

export function FlightSheet({ region, q, flightKrw, onClose }: { region: RegionV1; q: RegionQuery; flightKrw: number | null; onClose: () => void }) {
  const key = PILOT_TWIN_OF[region.id] ?? region.id;
  const info = liveFlightInfo(key, q.startDate);
  const month = Number(q.startDate.slice(5, 7));
  const [state, setState] = useState<"loading" | "fail" | { collectedAt: string; cheapest: FlightSample | null; near: FlightSample[] }>("loading");
  useEffect(() => {
    let alive = true;
    loadFlightSamples(key, q.startDate, q.endDate).then((r) => alive && setState(r ?? "fail"));
    return () => { alive = false; };
  }, [key, q.startDate, q.endDate]);
  const updated = liveSummary()?.updatedAt;
  const basis = info?.basis === "month"
    ? `${month}월에 출발하는 인천↔${region.name} 왕복 항공권 중 가장 싼 값을 최근 2주 동안 ${info.samples}번 모아 평균 낸 값이에요.`
    : info ? `${month}월 출발 자료가 아직 없어, 수집된 여러 달의 최저가 중간값을 넣었어요.`
    : FLIGHT_ESTIMATED.has(key) ? "이 도시는 항공 가격 자료가 없어 비행 거리로 추정했어요."
    : "10/31에 수집한 달별 최저가의 중간값이에요.";
  return (
    <CenterModal open onClose={onClose} title={`✈️ 인천 ↔ ${region.name} 항공`}
      foot={<a className="btn btn-primary btn-block" href={flightAffiliateUrl(region, q)} target="_blank" rel="noopener noreferrer">내 날짜로 실제 항공권 검색 <Icon name="link" /></a>}>
      <div className="sheet-box">
        <span className="xs muted">경비에 넣은 값</span>
        <b>{flightKrw == null ? "미확인" : `1인 왕복 약 ${man(flightKrw)}`}</b>
        <span className="xs">{basis}</span>
        <span className="xs muted">특정 날짜·항공사·시간을 골라 계산한 값이 아니라 &lsquo;그 달 최저가&rsquo; 기준이라, 원하는 시간대·항공사를 고르면 더 비쌀 수 있어요.{updated ? ` (${new Date(updated).getMonth() + 1}/${new Date(updated).getDate()} 갱신)` : ""}</span>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <b className="small">최근 실제로 검색된 {month}월 항공편</b>
        {state === "loading" && <span className="xs muted">불러오는 중…</span>}
        {state === "fail" && <span className="xs muted">지금은 항공편 예시를 불러오지 못했어요. 아래 버튼으로 바로 검색해 보세요.</span>}
        {typeof state === "object" && (state.near.length ? <>
          <span className="xs muted">내 날짜({q.startDate.slice(5).replace("-", "/")}~{q.endDate.slice(5).replace("-", "/")})와 가까운 순 · {new Date(state.collectedAt).getMonth() + 1}/{new Date(state.collectedAt).getDate()} {new Date(state.collectedAt).getHours()}시 수집 · 1인 왕복</span>
          {state.near.map((f) => <FlightRow key={`${f.depart}${f.ret}${f.krw}`} f={f} mine={f.gap === 0} />)}
          {state.cheapest && !state.near.includes(state.cheapest) && <><span className="xs muted">이 달 최저가</span><FlightRow f={state.cheapest} mine={false} /></>}
          <span className="xs faint">Travelpayouts(아비아세일즈)에 최근 48시간 안에 검색된 가격이에요. 좌석이 이미 팔렸거나 값이 바뀌었을 수 있어요. 시각은 출발 공항 현지 시각이에요.</span>
        </> : <span className="xs muted">최근 수집본에 {month}월 출발 항공편이 없어요. 아래 버튼으로 바로 검색해 보세요.</span>)}
      </div>
    </CenterModal>
  );
}

function FlightRow({ f, mine }: { f: FlightSample; mine: boolean }) {
  return (
    <div className={`flight-row ${mine ? "mine" : ""}`}>
      <div className="between"><b className="small">{f.airline}{mine ? " · 내 날짜" : ""}</b><b className="small">{man(f.krw)}</b></div>
      <span className="xs">가는 편 {when(f.depart)} 출발 · {stopText(f.stops)}</span>
      <span className="xs">오는 편 {when(f.ret)} 출발 · {stopText(f.retStops)}</span>
      {f.minutes != null && <span className="xs muted">왕복 비행 합계 {hm(f.minutes)}</span>}
    </div>
  );
}

const TIER_TEXT: Record<StayTier, string> = { 가성비: "가격 하위 30%", 가심비: "가격 30~70% 구간", 프리미엄: "가격 70~90% 구간", 하이엔드: "가격 상위 10%" };
export const tierText = (t: StayTier) => TIER_TEXT[t];

export function HotelSheet({ hotel, tier, region, q, onClose }: { hotel: HotelRow; tier: StayTier; region: RegionV1; q: RegionQuery; onClose: () => void }) {
  const [name, rating, reviews, lo, hi] = hotel;
  const info = HOTEL_KO[name];
  const ta = info?.[1].match(/^g(\d+)-d(\d+)$/);
  const priced = lo > 0 && hi >= lo;
  return (
    <CenterModal open onClose={onClose} title={`🏨 ${info?.[0] ?? name}`}
      foot={<>
        <a className="btn btn-primary btn-block" href={hotelSearchUrl(region, q, name)} target="_blank" rel="noopener noreferrer">아고다에서 객실·조식 보기 <Icon name="link" /></a>
        {ta && <a className="btn btn-block" href={`https://www.tripadvisor.co.kr/Hotel_Review-g${ta[1]}-d${ta[2]}.html`} target="_blank" rel="noopener noreferrer">트립어드바이저 사진·후기 <Icon name="link" /></a>}
        <a className="btn btn-block" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`} target="_blank" rel="noopener noreferrer">구글 지도에서 위치 보기 <Icon name="link" /></a>
      </>}>
      {info && <span className="xs muted">{name}</span>}
      <dl className="info-grid">
        <dt>평점</dt><dd>★ {rating} / 5 · 후기 {reviews.toLocaleString()}개 (트립어드바이저)</dd>
        <dt>1박 가격대</dt><dd>{priced ? `약 ${man(lo * KRW_PER_USD)} ~ ${man(hi * KRW_PER_USD)} (객실 1개, 세금 포함 여부 미확인)` : "미확인"}</dd>
        <dt>숙소 수준</dt><dd>{tier} · {region.name} 품질 기준 통과 숙소 중 {TIER_TEXT[tier]}</dd>
        <dt>객실 종류</dt><dd className="muted">미확인</dd>
        <dt>조식 포함</dt><dd className="muted">미확인</dd>
      </dl>
      <span className="xs muted">객실 종류·조식은 날짜와 요금제마다 달라 지금 자료에는 없어요. 아고다에서 내 날짜로 확인해 주세요.</span>
      <span className="xs faint">가격대·평점은 10/31 Xotelo(트립어드바이저 기반) 수집값이에요. 한글 이름은 영문을 읽는 대로 옮긴 것이라 공식 한글명과 다를 수 있어요.</span>
    </CenterModal>
  );
}
