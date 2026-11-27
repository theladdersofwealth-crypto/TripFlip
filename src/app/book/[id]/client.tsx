"use client";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BackButton } from "@/components/AppShell";
import { AgodaStaySummary } from "@/components/AgodaStaySummary";
import { Icon } from "@/components/Icon";
import { relaxedNotice } from "@/lib/livePrices";
import { currentAccount, loadBoard, loadPrefs, planState, savePlan, saveQuery, useFlowQuery } from "@/lib/flow";
import { syncPlans } from "@/lib/planSync";
import type { SavedPlan } from "@/lib/flow";
import { roomEstimate } from "@/lib/travelParty";
import { fmtDate } from "@/services/itineraryV1";
import { boardKey, emptyBoard } from "@/services/planner";
import { estimateTripCost, scoreRegions, tripDays } from "@/services/regionScore";
import type { StayTier } from "@/services/regionScore";
import { hotelKo, pickPrice } from "@/components/PriceSheets";
import { agodaFlightMissingKids, agodaFlightUrl, bookingComUrl, STAY_TIERS, childAgesForBooking, flightAffiliateUrl, flightSearchUrl, hotelCandidates, hotelSearchUrl, klookStayPrefilled, klookStayUrl } from "@/services/booking";
import { useLivePrices } from "@/lib/livePrices";
import { AFFILIATE_NOTE } from "@/lib/legal";
import { kkdaySearchUrl, klookSearchUrl, welcomePickupsUrl } from "@/services/affiliate";
import { track } from "@/lib/analytics";


export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useFlowQuery();
  const priceVersion = useLivePrices();
  const r = useMemo(() => q ? scoreRegions(q, { includeOutsideAreas: true }).find((x) => x.region.id === id) : undefined, [q, id, priceVersion]);
  const [booked, setBooked] = useState({ flight: false, hotel: false });
  const [tier, setTier] = useState<StayTier | null>(null);
  const [rooms, setRooms] = useState<number | null | undefined>(undefined);
  const [flightPreference, setFlightPreference] = useState<NonNullable<SavedPlan["flightPreference"]>>("any");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
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
    const updatedScore = scoreRegions(nextQuery, { includeOutsideAreas: true }).find((x) => x.region.id === id)?.display ?? r.display;
    return { id: `${id}-${q.startDate}-${Date.now().toString(36)}`, schemaVersion: 2, regionId: id, regionName: r.region.name, query: nextQuery, display: updatedScore, booked, flightPreference, createdAt: new Date().toISOString(), board: { ...board, key: boardKey(id, nextQuery) }, prefs: loadPrefs(id) };
  };
  const save = async () => {
    const plan = makePlan();
    if (!savePlan(plan)) { setError(currentAccount() && !currentAccount()?.uid ? "계정 확인 중이에요. 잠시 뒤 다시 눌러 주세요." : "이 브라우저에 저장하지 못했어요. 파일로 내려받아 보관해 주세요."); return; }
    saveQuery(nextQuery);
    track("save", id);
    if (currentAccount()) {
      // 회원: 서버가 저장을 확인한 뒤에만 '저장 완료'
      setSaving("계정에 저장하는 중…");
      await syncPlans();
      const st = planState(plan.id);
      if (st.state === "synced") setSaving("✓ 계정에 저장 완료");
      else if (st.state === "failed") { setSaving(null); setError(`저장 실패${st.error ? `: ${st.error}` : ""}. 내 여행에서 다시 시도할 수 있어요.`); return; }
      else setSaving("⏳ 인터넷 연결이 안 돼 '동기화 대기'로 이 기기에 보관했어요. 연결되면 자동으로 저장돼요.");
      setTimeout(() => router.push("/my-trips"), 900);
      return;
    }
    router.push("/my-trips");
  };

  return <main className="container page" style={{ maxWidth: 560 }}>
    <BackButton href={`/r/${id}`} label={`${r.region.name} 일정`} />
    <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>항공·숙소 비교</h1>
    <p className="xs muted" style={{ marginTop: 4 }}>ⓘ {AFFILIATE_NOTE}</p>
    <p className="small muted">{r.region.name} · {fmtDate(q.startDate)} ~ {fmtDate(q.endDate)} · {days - 1}박 {days}일 · {q.adults + q.children.length}명</p>
    <div className="stack" style={{ marginTop: 16 }}>
      <section className={`book-card ${booked.flight ? "done" : ""}`}>
        <div className="row"><Icon name="plane" size={22} /><b style={{ fontSize: 18 }}>항공권</b></div>
        <p className="small muted">인천 출발 · 도착 공항 {r.region.airportCode.toUpperCase()} · 성인 {q.adults}명{q.children.length ? ` · 자녀 ${q.children.length}명` : ""}</p>
        <label className="field"><span className="label">항공 선호</span><select className="input" aria-label="항공 선호" value={flightPreference} onChange={(e) => setFlightPreference(e.target.value as typeof flightPreference)}><option value="any">상관없음</option><option value="lowcost">저가항공 우선</option><option value="fullservice">일반 항공사 우선</option></select></label>
        <p className="xs muted">선호는 계획에 저장돼요. 실제 항공사·수하물·도착시간은 예약처에서 비교해 주세요.</p>
        {unknownAges && <p className="xs muted">자녀 나이가 미확인이에요. 예약처에서 정확한 나이와 인원을 다시 입력해 주세요.</p>}
        <a className="btn btn-teal btn-block" href={agodaFlightUrl(r.region, q)} data-usage-outbound="flight" onClick={() => track("flight", id)} target="_blank" rel="noopener noreferrer sponsored">아고다 항공 <Icon name="link" /></a>
        {agodaFlightMissingKids(r.region, q) && <p className="xs muted">아고다 항공 링크엔 어른 인원만 들어가요. 아이 인원은 아고다에서 추가해 주세요.</p>}
        <div className="grid-2">
          <a className="btn btn-block" href={flightAffiliateUrl(r.region, q)} data-usage-outbound="flight" onClick={() => track("flight", id)} target="_blank" rel="noopener noreferrer sponsored">Aviasales <Icon name="link" /></a>
          <a className="btn btn-block" href={flightSearchUrl(r.region, q)} data-usage-outbound="flight" onClick={() => track("flight", id)} target="_blank" rel="noopener noreferrer">스카이스캐너 <Icon name="link" /></a>
        </div>
        <a className="btn btn-block" href={welcomePickupsUrl()} data-usage-outbound="outbound" target="_blank" rel="noopener noreferrer sponsored">공항 픽업 예약 (Welcome Pickups) <Icon name="link" /></a>
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
          {hotels.map((h) => <a key={h.name} className="card-soft between" href={hotelSearchUrl(r.region, nextQuery, h.name)} data-usage-outbound="hotel" onClick={() => track("hotel", id)} target="_blank" rel="noopener noreferrer sponsored"><span><b className="small">{hotelKo(h.name)}</b>{hotelKo(h.name) !== h.name && <span className="xs faint" style={{ display: "block" }}>{h.name}</span>}<span className="xs muted" style={{ display: "block" }}>{[h.rating != null ? `종합 ★ ${h.rating}` : "", h.reviews != null ? `후기 ${h.reviews.toLocaleString()}` : "", pickPrice(h)].filter(Boolean).join(" · ")}</span></span><Icon name="link" size={16} /></a>)}
          <p className="xs faint">최근 수집한 1박 최저가 평균(없으면 10/31 가격대)이에요. 날짜별 실시간 요금·청결 기준·정원은 재확인이 필요해요.</p>
        </div> : <p className="small muted">이 수준의 숙소 후보 자료가 아직 없어요. 예약처에서 조건에 맞춰 검색해 주세요.</p>}
        <div className="grid-2">
          <a className="btn btn-teal btn-block" href={hotelSearchUrl(r.region, nextQuery)} data-usage-outbound="hotel" onClick={() => track("hotel", id)} target="_blank" rel="noopener noreferrer sponsored">아고다 검색 <Icon name="link" /></a>
          <a className="btn btn-block" href={klookStayUrl(r.region, nextQuery)} data-usage-outbound="hotel" onClick={() => track("hotel", id)} target="_blank" rel="noopener noreferrer sponsored">클룩 {r.region.name} 호텔 목록 <Icon name="link" /></a>
          <a className="btn btn-block" href={bookingComUrl(r.region, nextQuery)} data-usage-outbound="hotel" onClick={() => track("hotel", id)} target="_blank" rel="noopener noreferrer">부킹닷컴 <Icon name="link" /></a>
        </div>
        <AgodaStaySummary region={r.region} query={nextQuery} />
        <p className="xs faint">아고다의 숙소 후보 링크는 도시 목록으로 열릴 수 있어요. {klookStayPrefilled(r.region) ? "클룩은 도시 호텔 목록으로 열려요." : "클룩에서 도시와 날짜를 직접 골라 주세요."}</p>
        <label className="check-row"><input type="checkbox" checked={booked.hotel} onChange={(e) => setBooked((v) => ({ ...v, hotel: e.target.checked }))} />숙소 예약 완료 (직접 확인)</label>
      </section>
      <section className="book-card">
        <div className="row"><Icon name="compass" size={22} /><b style={{ fontSize: 18 }}>현지 투어·입장권</b></div>
        <p className="small muted">{r.region.name}의 투어·입장권을 찾아요. 가격·운영 여부는 각 사이트에서 확인해 주세요.</p>
        <div className="grid-2">
          <a className="btn btn-block" href={klookSearchUrl(r.region.searchName)} data-usage-outbound="outbound" target="_blank" rel="noopener noreferrer sponsored">클룩 <Icon name="link" /></a>
          <a className="btn btn-block" href={kkdaySearchUrl(r.region.searchName)} data-usage-outbound="outbound" target="_blank" rel="noopener noreferrer sponsored">KKday <Icon name="link" /></a>
        </div>
      </section>
    </div>
    <p className="small muted" style={{ marginTop: 12 }}>현재 숙소 수준·객실 수 기준 일행 전체 예상 경비: {estimate.partyTotalKrw == null ? "미확인" : `약 ${Math.round(estimate.partyTotalKrw / 10000).toLocaleString()}만원`}. {estimate.priceSource.flight === "live" || estimate.priceSource.hotel === "live" ? "항공·숙박은 최근 2주 수집 평균, 식비는 가정으로 계산했어요." : "항공·숙박·식비의 과거 자료와 가정으로 계산했어요."}</p>
    {relaxedNotice(id) && <p className="xs muted">⚠ {relaxedNotice(id)}</p>}
    {estimate.budgetStatus === "over" && <p role="status" className="small" style={{ color: "var(--danger)" }}>현재 선택은 입력한 전체 예산을 넘는 것으로 추정돼요.</p>}
    <p className="xs faint" style={{ marginTop: 10 }}>예약과 결제는 외부 사이트에서 진행하며, 예약 전에도 계획을 저장할 수 있어요. 실제 항공시간·숙소 위치에 맞춘 일정 조정은 별도 확인이 필요해요.</p>
    {error && <p role="alert" className="small" style={{ color: "var(--danger)" }}>{error}</p>}
    {saving && <p role="status" className="small" style={{ fontWeight: 700 }}>{saving}</p>}
    <div className="sticky-cta stack" style={{ marginTop: 12 }}><button className="btn btn-primary btn-lg btn-block" onClick={save} disabled={!!saving}>일정과 함께 내 여행에 저장</button></div>
  </main>;
}
