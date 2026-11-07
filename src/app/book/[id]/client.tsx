"use client";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BackButton } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { loadBoard, loadPrefs, savePlan, saveQuery, useFlowQuery } from "@/lib/flow";
import type { SavedPlan } from "@/lib/flow";
import { downloadPlan } from "@/lib/planDownload";
import { roomEstimate } from "@/lib/travelParty";
import { fmtDate } from "@/services/itineraryV1";
import { boardKey, emptyBoard } from "@/services/planner";
import { PILOT_TWIN_OF, estimateTripCost, scoreRegions, tripDays } from "@/services/regionScore";
import type { StayTier } from "@/services/regionScore";
import { STAY_TIERS, childAgesForBooking, flightSearchUrl, hotelSearchUrl } from "@/services/booking";
import { HOTELS } from "@/data/worldHotels";
import type { HotelRow } from "@/data/worldHotels";

const TIER_RANGE: Record<StayTier, [number, number]> = { 가성비: [0, 0.3], 가심비: [0.3, 0.7], 프리미엄: [0.7, 0.9], 하이엔드: [0.9, 1.01] };
function hotelCandidates(regionId: string, tier: StayTier): HotelRow[] {
  const sorted = [...(HOTELS[PILOT_TWIN_OF[regionId] ?? regionId] ?? [])].filter((h) => h[1] >= 4.5 && h[2] >= 300).sort((a, b) => a[3] + a[4] - b[3] - b[4]);
  const [from, to] = TIER_RANGE[tier];
  return sorted.filter((_, i) => i / sorted.length >= from && i / sorted.length < to).sort((a, b) => b[1] - a[1] || b[2] - a[2]).slice(0, 3);
}

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useFlowQuery();
  const r = useMemo(() => q ? scoreRegions(q).find((x) => x.region.id === id) : undefined, [q, id]);
  const [booked, setBooked] = useState({ flight: false, hotel: false });
  const [tier, setTier] = useState<StayTier | null>(null);
  const [rooms, setRooms] = useState<number | null | undefined>(undefined);
  const [flightPreference, setFlightPreference] = useState<NonNullable<SavedPlan["flightPreference"]>>("any");
  const [error, setError] = useState("");
  if (!q) return null;
  if (!r) return <main className="container page"><p className="muted">지역을 찾을 수 없어요.</p></main>;
  const selectedTier = tier ?? q.stay;
  const selectedRooms = rooms === undefined ? q.roomCount : rooms;
  const nextQuery = { ...q, stay: selectedTier, roomCount: selectedRooms };
  const roomInfo = roomEstimate(nextQuery);
  const estimate = estimateTripCost(r.region, nextQuery);
  const days = tripDays(q.startDate, q.endDate);
  const hotels = hotelCandidates(id, selectedTier);
  const unknownAges = childAgesForBooking(q) === null;

  const makePlan = (): SavedPlan => {
    const board = loadBoard(id, boardKey(id, q)) ?? emptyBoard(id, q);
    const updatedScore = scoreRegions(nextQuery).find((x) => x.region.id === id)?.display ?? r.display;
    return { id: `${id}-${q.startDate}-${Date.now().toString(36)}`, schemaVersion: 2, regionId: id, regionName: r.region.name, query: nextQuery, display: updatedScore, booked, flightPreference, createdAt: new Date().toISOString(), board: { ...board, key: boardKey(id, nextQuery) }, prefs: loadPrefs(id) };
  };
  const save = () => {
    if (!savePlan(makePlan())) { setError("이 브라우저에 저장하지 못했어요. 파일로 내려받아 보관해 주세요."); return; }
    saveQuery(nextQuery);
    router.push("/my-trips");
  };

  return <main className="container page" style={{ maxWidth: 560 }}>
    <BackButton href={`/r/${id}`} label={`${r.region.name} 일정`} />
    <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>항공·숙소 비교</h1>
    <p className="small muted">{r.region.name} · {fmtDate(q.startDate)} ~ {fmtDate(q.endDate)} · {days - 1}박 {days}일 · {q.adults + q.children.length}명</p>
    <div className="stack" style={{ marginTop: 16 }}>
      <section className={`book-card ${booked.flight ? "done" : ""}`}>
        <div className="row"><Icon name="plane" size={22} /><b style={{ fontSize: 18 }}>항공권</b></div>
        <p className="small muted">인천 출발 · 도착 공항 {r.region.airportCode.toUpperCase()} · 성인 {q.adults}명{q.children.length ? ` · 자녀 ${q.children.length}명` : ""}</p>
        <label className="field"><span className="label">항공 선호</span><select className="input" aria-label="항공 선호" value={flightPreference} onChange={(e) => setFlightPreference(e.target.value as typeof flightPreference)}><option value="any">상관없음</option><option value="lowcost">저가항공 우선</option><option value="fullservice">일반 항공사 우선</option></select></label>
        <p className="xs muted">선호는 계획에 저장돼요. 실제 항공사·수하물·도착시간은 예약처에서 비교해 주세요.</p>
        {unknownAges && <p className="xs muted">자녀 나이가 미확인이에요. 예약처에서 정확한 나이와 인원을 다시 입력해 주세요.</p>}
        <a className="btn btn-teal btn-block" href={flightSearchUrl(r.region, q)} target="_blank" rel="noopener noreferrer">스카이스캐너에서 검색 <Icon name="link" /></a>
        <label className="check-row"><input type="checkbox" checked={booked.flight} onChange={(e) => setBooked((v) => ({ ...v, flight: e.target.checked }))} />항공권 예약 완료 (직접 확인)</label>
      </section>
      <section className={`book-card ${booked.hotel ? "done" : ""}`}>
        <div className="row"><Icon name="bed" size={22} /><b style={{ fontSize: 18 }}>숙소</b></div>
        <div className="grid-2">
          <label className="field"><span className="label">숙소 수준</span><select className="input" aria-label="숙소 수준" value={selectedTier} onChange={(e) => setTier(e.target.value as StayTier)}>{STAY_TIERS.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="field"><span className="label">검색할 객실 수</span><select className="input" aria-label="검색할 객실 수" value={selectedRooms ?? "auto"} onChange={(e) => setRooms(e.target.value === "auto" ? null : Number(e.target.value))}><option value="auto">인원 기준 가정</option>{Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}개</option>)}</select></label>
        </div>
        <p className="small muted">객실 {roomInfo.rooms}개{roomInfo.estimated ? " (인원으로 추정)" : " (직접 선택)"} · {days - 1}박</p>
        <p className="xs muted">객실 정원·침대·자녀 추가요금은 숙소별로 확인해야 해요. 현재 자료의 종합 평점은 청결 세부평점을 보장하지 않아요.</p>
        {hotels.length > 0 ? <div className="stack" style={{ gap: 8 }}>
          <span className="small bold">기존 자료의 비교 후보 · {selectedTier}</span>
          {hotels.map(([name, rating, reviews, lo, hi]) => <a key={name} className="card-soft between" href={hotelSearchUrl(r.region, nextQuery, name)} target="_blank" rel="noopener noreferrer"><span><b className="small">{name}</b><span className="xs muted" style={{ display: "block" }}>종합 ★ {rating} · 후기 {reviews.toLocaleString()} · 과거 1박 ${lo}~${hi}</span></span><Icon name="link" size={16} /></a>)}
          <p className="xs faint">2026-10-31 수집 자료의 가격대예요. 날짜별 실시간 요금·청결 기준·정원은 재확인이 필요해요.</p>
        </div> : <p className="small muted">이 수준의 숙소 후보 자료가 아직 없어요. 예약처에서 조건에 맞춰 검색해 주세요.</p>}
        <a className="btn btn-teal btn-block" href={hotelSearchUrl(r.region, nextQuery)} target="_blank" rel="noopener noreferrer">아고다에서 검색 <Icon name="link" /></a>
        <label className="check-row"><input type="checkbox" checked={booked.hotel} onChange={(e) => setBooked((v) => ({ ...v, hotel: e.target.checked }))} />숙소 예약 완료 (직접 확인)</label>
      </section>
    </div>
    <p className="small muted" style={{ marginTop: 12 }}>현재 숙소 수준·객실 수 기준 일행 전체 예상 경비: {estimate.partyTotalKrw == null ? "미확인" : `약 ${Math.round(estimate.partyTotalKrw / 10000).toLocaleString()}만원`}. 항공·숙박·식비의 과거 자료와 가정으로 계산했어요.</p>
    {estimate.budgetStatus === "over" && <p role="status" className="small" style={{ color: "var(--danger)" }}>현재 선택은 입력한 전체 예산을 넘는 것으로 추정돼요.</p>}
    <p className="xs faint" style={{ marginTop: 10 }}>현재는 일반 검색 링크예요. 예약과 결제는 외부 사이트에서 진행하며, 예약 전에도 계획을 저장할 수 있어요. 실제 항공시간·숙소 위치에 맞춘 일정 조정은 별도 확인이 필요해요.</p>
    {error && <p role="alert" className="small" style={{ color: "var(--danger)" }}>{error}</p>}
    <div className="sticky-cta stack" style={{ marginTop: 12 }}><button className="btn btn-primary btn-lg btn-block" onClick={save}>일정과 함께 내 여행에 저장</button><button className="btn btn-block" onClick={() => downloadPlan(makePlan())}>계획 파일 내려받기</button></div>
  </main>;
}
