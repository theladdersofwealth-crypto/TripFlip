"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BackButton } from "@/components/AppShell";
import { DayTimeline, type IdleWindow } from "@/components/DayTimeline";
import { Icon } from "@/components/Icon";
import { PlaceCard, PlaceDetail } from "@/components/PlaceCard";
import { RestaurantCard, RestaurantDetail } from "@/components/RestaurantCard";
import { WeatherBadge } from "@/components/WeatherBadge";
import { DemoBadge, Empty, PremiumBadge, Sheet } from "@/components/ui";
import { getDestination, getPlaces, getRestaurants, getZones } from "@/data/repository";
import { estimateTravel } from "@/services/routing";
import { DEMO_RAIN_SIMULATION, EMPTY_WEATHER, isRainy } from "@/services/weather";
import {
  adaptForRain, alternativesFor, changeIntensity, changeTime, deleteItem, idleWindows, insertCandidate, lightenDay, moveItem,
  replaceWithCandidate, setDayWeather, suggestForGap, suggestForWindow, toggleFavorite, toggleFavoriteRef, validateDay, type Candidate,
} from "@/services/recommendation";
import { useTripStore } from "@/store/TripStore";
import { INTENSITY, PREF_LABEL } from "@/lib/labels";
import { formatDuration, formatKDate, toHHMM, toMin } from "@/lib/time";
import type { Intensity, ItineraryItem, Trip } from "@/lib/types";

type Tab = "schedule" | "places" | "restaurants";
type SheetState =
  | { kind: "detail"; item: ItineraryItem }
  | { kind: "candidates"; title: string; desc: string; candidates: Candidate[]; apply: (c: Candidate) => void }
  | { kind: "time"; item: ItineraryItem }
  | null;

export default function TripPage() {
  const params = useParams<{ id: string }>();
  // 정적 껍데기(/trip/_)로 들어온 경우 실제 주소에서 id를 읽는다
  const id = params.id === "_" && typeof window !== "undefined" ? decodeURIComponent(window.location.pathname.split("/")[2] ?? "") : params.id;
  const { trips, updateTrip, showToast, ready } = useTripStore();
  const trip = trips.find((t) => t.id === id);
  const [tab, setTab] = useState<Tab>("schedule");
  const [dayIdx, setDayIdx] = useState(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [placeFilter, setPlaceFilter] = useState("all");
  const [restFilter, setRestFilter] = useState("all");

  const destId = trip?.destination ?? "";
  const places = useMemo(() => getPlaces(destId), [destId]);
  const restaurants = useMemo(() => getRestaurants(destId), [destId]);
  const zones = useMemo(() => getZones(destId), [destId]);

  if (!ready) return null;
  if (!trip) {
    return (
      <main className="container page">
        <Empty icon="suitcase" title="여행을 찾을 수 없어요" desc="삭제되었거나 다른 기기에서 만든 여행이에요. (저장은 이 기기에만 돼요)" action={<Link href="/trips" className="btn btn-primary">내 여행 보기</Link>} />
      </main>
    );
  }

  const day = trip.days[Math.min(dayIdx, trip.days.length - 1)];
  const di = trip.days.indexOf(day);
  const dest = getDestination(trip.destination);
  const c = trip.profile.conditions;
  const hotelZone = trip.profile.hotel.zoneId;
  const fromHotel = (zone: string) => estimateTravel(trip.destination, hotelZone, zone, trip.profile.transport).minutes;
  const scheduledDays = (ref: string) => trip.days.filter((d) => d.items.some((i) => i.placeId === ref || i.restaurantId === ref)).map((d) => d.dayNumber);
  const save = (t: Trip, msg?: string) => {
    updateTrip(t);
    if (msg) showToast(msg);
  };
  const warnings = validateDay(trip, day);
  const idle = idleWindows(trip, di);
  const rainy = isRainy(day.weather);

  const openCandidates = (title: string, desc: string, candidates: Candidate[], apply: (c: Candidate) => void) =>
    setSheet({ kind: "candidates", title, desc, candidates, apply });

  const handlers = {
    onDetail: (item: ItineraryItem) => setSheet({ kind: "detail", item }),
    onDelete: (item: ItineraryItem) => save(deleteItem(trip, di, item.id), "삭제했어요. 빈 시간만 다시 추천받을 수 있어요."),
    onFavorite: (item: ItineraryItem) => save(toggleFavorite(trip, di, item.id), item.favorite ? "즐겨찾기를 해제했어요" : "즐겨찾기 — 강도 조정·재추천 때도 유지돼요"),
    onMove: (item: ItineraryItem, dir: -1 | 1) => {
      const r = moveItem(trip, di, item.id, dir);
      save(r.trip, r.message);
    },
    onTime: (item: ItineraryItem) => setSheet({ kind: "time", item }),
    onAlternatives: (item: ItineraryItem) =>
      openCandidates("다른 장소로 변경", `${item.startTime}–${item.endTime} 시간대와 앞뒤 동선에 맞는 후보예요.`, alternativesFor(trip, di, item.id), (cand) => {
        save(replaceWithCandidate(trip, di, item.id, cand), `‘${cand.title}’(으)로 바꿨어요. 다른 일정은 그대로예요.`);
      }),
    onFillGap: (item: ItineraryItem) =>
      openCandidates("빈 시간 다시 추천", `${item.startTime}–${item.endTime} 빈 시간만 다시 채워요. 앞뒤 일정은 바꾸지 않아요.`, suggestForGap(trip, di, item.id), (cand) => {
        save(replaceWithCandidate(trip, di, item.id, cand), `빈 시간에 ‘${cand.title}’을(를) 넣었어요.`);
      }),
    onFillIdle: (w: IdleWindow) =>
      openCandidates("여유 시간 추천", `${toHHMM(w.start)}–${toHHMM(w.end)} 사이에 넣을 수 있는 후보예요.`, suggestForWindow(trip, di, w, "place"), (cand) => {
        save(insertCandidate(trip, di, cand), `‘${cand.title}’을(를) 추가했어요.`);
      }),
  };

  return (
    <main className="container page">
      <BackButton href="/trips" label="내 여행" />
      <div className="trip-head stack" style={{ gap: 6 }}>
        <div className="between">
          <h1>{trip.title}</h1>
          {trip.demo && <DemoBadge />}
        </div>
        <div className="small muted">
          {formatKDate(trip.dates.start, false)} – {formatKDate(trip.dates.end, false)} · 성인 {c.party.adults}
          {c.party.children ? ` · 어린이 ${c.party.children}(${c.party.childAges.join("·")}세)` : ""} · {trip.profile.hotel.name}
          {hotelZone ? `(${zones.find((z) => z.id === hotelZone)?.name})` : ""}
        </div>
        <div className="stack" style={{ gap: 6, marginTop: 6 }}>
          <span className="label">여행 강도</span>
          <div className="seg" role="radiogroup" aria-label="여행 강도">
            {(Object.keys(INTENSITY) as Intensity[]).map((k) => (
              <button key={k} role="radio" aria-checked={c.intensity === k} className={c.intensity === k ? "on" : ""} onClick={() => {
                if (k === c.intensity) return;
                const r = changeIntensity(trip, k);
                save(r.trip, r.message);
              }}>{INTENSITY[k].label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "schedule"} className={tab === "schedule" ? "on" : ""} onClick={() => setTab("schedule")}>일정</button>
        <button role="tab" aria-selected={tab === "places"} className={tab === "places" ? "on" : ""} onClick={() => setTab("places")}>방문지</button>
        <button role="tab" aria-selected={tab === "restaurants"} className={tab === "restaurants" ? "on" : ""} onClick={() => setTab("restaurants")}>음식점</button>
        <button role="tab" disabled title="추후 제공" style={{ flex: 0.8, fontSize: 14 }}>숙소 <span className="xs">(준비중)</span></button>
      </div>

      <div className="trip-layout">
        <div>
          {tab === "schedule" && (
            <>
              <div className="day-pills">
                {trip.days.map((d, i) => (
                  <button key={d.date} className={`day-pill ${i === di ? "on" : ""}`} onClick={() => setDayIdx(i)}>
                    <b>{d.dayNumber}일차</b>
                    <span>{formatKDate(d.date, false)}</span>
                  </button>
                ))}
              </div>

              <div className="day-head">
                <div className="dn">{day.dayNumber}일차</div>
                <div className="dt">{formatKDate(day.date)}</div>
              </div>
              <div className="stack">
                <WeatherBadge weather={day.weather} />
                {rainy && (
                  <div className="banner banner-info">
                    <b>비 예보가 있습니다. 실내 일정으로 조정할까요?</b>
                    <span className="small">실외 방문지만 같은 시간대의 실내 장소로 바꾸고, 즐겨찾기·반드시 방문 일정은 유지해요.</span>
                    <button className="btn btn-primary" onClick={() => { const r = adaptForRain(trip, di); save(r.trip, r.message); }}><Icon name="umbrella" />실내 일정으로 조정</button>
                  </div>
                )}
                {warnings.map((w) => (
                  <div key={w.text} className={`banner ${w.level === "warn" ? "banner-warn" : "banner-info"} small`} style={{ padding: "10px 12px" }}>{w.text}</div>
                ))}
                <div className="row-wrap" style={{ gap: 8 }}>
                  <button className="act" onClick={() => { const r = lightenDay(trip, di); save(r.trip, r.message); }}><Icon name="bed" size={16} />오늘 너무 빡세요</button>
                  <button className="act" onClick={() => { const r = adaptForRain(trip, di); save(r.trip, r.message); }}><Icon name="umbrella" size={16} />실내 중심으로</button>
                  <button className="act" onClick={() => save(setDayWeather(trip, di, rainy ? { ...EMPTY_WEATHER } : { ...DEMO_RAIN_SIMULATION }), rainy ? "비 예보 시뮬레이션을 껐어요" : "DEMO: 이 날에 비 예보가 있다고 가정해요 (실제 날씨 아님)")}>
                    <Icon name="rain" size={16} />{rainy ? "비 예보 시뮬레이션 끄기" : "비 예보 시뮬레이션"}<span className="badge badge-demo" style={{ marginLeft: 2 }}>DEMO</span>
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <DayTimeline trip={trip} day={day} places={places} restaurants={restaurants} zones={zones} idle={idle} {...handlers} />
              </div>
              <p className="xs faint" style={{ marginTop: 16 }}>이동시간은 지역 단위 DEMO 추정치예요. 지도 API 연결 시 실제 경로 기준으로 바뀌어요.</p>
            </>
          )}

          {tab === "places" && (
            <div className="stack" style={{ paddingTop: 14 }}>
              <div className="row-wrap" style={{ gap: 8 }}>
                {[["all", "전체"], ["scheduled", "일정에 포함"], ["fav", "즐겨찾기"], ["indoor", "실내·우천"], ["kids", "아이 추천"]].map(([k, l]) => (
                  <button key={k} className={`toggle-chip ${placeFilter === k ? "on" : ""}`} onClick={() => setPlaceFilter(k)}>{l}</button>
                ))}
              </div>
              {(() => {
                const list = places.filter((p) =>
                  placeFilter === "scheduled" ? scheduledDays(p.id).length > 0 :
                  placeFilter === "fav" ? trip.favorites.includes(p.id) :
                  placeFilter === "indoor" ? p.indoor === "indoor" || p.rainOk === true :
                  placeFilter === "kids" ? (p.kidScore ?? 0) >= 4 : true,
                );
                if (!list.length) return <Empty icon="pin" title="조건에 맞는 방문지가 없어요" desc={placeFilter === "fav" ? "별표를 눌러 즐겨찾기를 추가해 보세요." : "다른 필터를 선택해 보세요."} />;
                return (
                  <div className="cards-grid">
                    {list.map((p) => (
                      <PlaceCard key={p.id} p={p} meta={{ zone: zones.find((z) => z.id === p.zoneId), travelFromHotel: fromHotel(p.zoneId), scheduledDays: scheduledDays(p.id), favorite: trip.favorites.includes(p.id) }} onFavorite={() => save(toggleFavoriteRef(trip, p.id))} />
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {tab === "restaurants" && (
            <div className="stack" style={{ paddingTop: 14 }}>
              <div className="row-wrap" style={{ gap: 8 }}>
                {[["all", "전체"], ["scheduled", "일정에 포함"], ["fav", "즐겨찾기"], ["chair", "아기의자"], ["mild", "안 매움"]].map(([k, l]) => (
                  <button key={k} className={`toggle-chip ${restFilter === k ? "on" : ""}`} onClick={() => setRestFilter(k)}>{l}</button>
                ))}
              </div>
              {(() => {
                const list = restaurants.filter((r) =>
                  restFilter === "scheduled" ? scheduledDays(r.id).length > 0 :
                  restFilter === "fav" ? trip.favorites.includes(r.id) :
                  restFilter === "chair" ? r.kidsChair === true :
                  restFilter === "mild" ? r.spicy === "mild" : true,
                );
                if (!list.length) return <Empty icon="utensils" title="조건에 맞는 음식점이 없어요" desc={restFilter === "fav" ? "별표를 눌러 즐겨찾기를 추가해 보세요." : "다른 필터를 선택해 보세요."} />;
                return (
                  <div className="cards-grid">
                    {list.map((r) => (
                      <RestaurantCard key={r.id} r={r} meta={{ zone: zones.find((z) => z.id === r.zoneId), travelFromHotel: fromHotel(r.zoneId), scheduledDays: scheduledDays(r.id), favorite: trip.favorites.includes(r.id) }} onFavorite={() => save(toggleFavoriteRef(trip, r.id))} />
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <aside className="trip-side stack" style={{ marginTop: 24 }}>
          <div className="card stack" style={{ gap: 8 }}>
            <b>여행 요약</b>
            <div className="small muted">
              {dest?.name} · {trip.days.length - 1}박 {trip.days.length}일<br />
              식사 점심 {trip.profile.meals.lunch.join("–")} · 저녁 {trip.profile.meals.dinner.join("–")}<br />
              이동 {[trip.profile.transport.taxi && "택시", trip.profile.transport.rentalCar && "렌터카", trip.profile.transport.publicTransit && "대중교통"].filter(Boolean).join(" · ") || "미지정"}<br />
              취향 {c.prefs.map((p) => PREF_LABEL[p]).join(" · ") || "미지정"}
            </div>
            <button className="btn btn-primary" onClick={() => save({ ...trip, updatedAt: new Date().toISOString() }, "내 여행에 저장했어요 (이 기기에 보관)")}><Icon name="check" />여행 저장</button>
            <span className="xs faint">수정할 때마다 자동 저장돼요 · 마지막 저장 {new Date(trip.updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <Link href="/premium" className="card stack" style={{ gap: 8 }}>
            <div className="between"><b>Premium으로 더 똑똑하게</b><PremiumBadge /></div>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>날씨 대응 자동 재최적화</li>
              <li>숙소별 일정 비교</li>
              <li>PDF·공유 여행계획서</li>
            </ul>
            <span className="small bold" style={{ color: "var(--teal-dark)" }}>출시 기념 90일 무료 →</span>
          </Link>
        </aside>
      </div>

      {/* ---------- Sheets ---------- */}
      <Sheet open={sheet?.kind === "detail"} onClose={() => setSheet(null)} title={sheet?.kind === "detail" ? (places.find((p) => p.id === sheet.item.placeId)?.name ?? restaurants.find((r) => r.id === sheet.item.restaurantId)?.name ?? "") : ""}>
        {sheet?.kind === "detail" && (() => {
          const p = places.find((x) => x.id === sheet.item.placeId);
          const r = restaurants.find((x) => x.id === sheet.item.restaurantId);
          return (
            <div className="stack">
              <div className="small muted">{sheet.item.startTime}–{sheet.item.endTime} · {formatDuration(toMin(sheet.item.endTime) - toMin(sheet.item.startTime))}{sheet.item.travelMinutes ? ` · 이전 일정에서 약 ${sheet.item.travelMinutes}분(추정)` : ""}</div>
              {p && <PlaceDetail p={p} meta={{ zone: zones.find((z) => z.id === p.zoneId), travelFromHotel: fromHotel(p.zoneId), scheduledDays: scheduledDays(p.id), favorite: trip.favorites.includes(p.id) }} />}
              {r && <RestaurantDetail r={r} meta={{ zone: zones.find((z) => z.id === r.zoneId), travelFromHotel: fromHotel(r.zoneId), scheduledDays: scheduledDays(r.id), favorite: trip.favorites.includes(r.id) }} />}
            </div>
          );
        })()}
      </Sheet>

      <Sheet open={sheet?.kind === "candidates"} onClose={() => setSheet(null)} title={sheet?.kind === "candidates" ? sheet.title : ""}>
        {sheet?.kind === "candidates" && (
          <div className="stack">
            <p className="small muted">{sheet.desc}</p>
            {sheet.candidates.length === 0 && <Empty icon="search" title="이 시간에 맞는 후보가 없어요" desc="남은 장소가 없거나 시간이 짧아요. 시간을 조정하거나 비워둘 수 있어요." />}
            {sheet.candidates.map((cand, i) => {
              const p = places.find((x) => x.id === cand.placeId);
              return (
                <button key={i} className="card-btn" onClick={() => { sheet.apply(cand); setSheet(null); }}>
                  <div className="between">
                    <div className="bold">{i === 0 && cand.kind !== "rest" && <span className="badge badge-ok" style={{ marginRight: 6 }}>추천</span>}{cand.title}</div>
                    <span className="small muted">{toHHMM(cand.start)}–{toHHMM(cand.end)}</span>
                  </div>
                  {p && <div className="small muted">{p.category} · 아이 적합 {p.kidScore ?? "미확인"}/5 · {p.indoor === "indoor" ? "실내" : p.indoor === "outdoor" ? "실외" : "실내·실외"}</div>}
                  <div className="it-reason" style={{ marginTop: 4 }}>{cand.reason}</div>
                </button>
              );
            })}
          </div>
        )}
      </Sheet>

      <TimeSheet
        item={sheet?.kind === "time" ? sheet.item : null}
        onClose={() => setSheet(null)}
        onSave={(s, e) => {
          if (sheet?.kind !== "time") return;
          save(changeTime(trip, di, sheet.item.id, s, e), "시간을 바꿨어요. 겹치는 일정이 있으면 위에 표시돼요.");
          setSheet(null);
        }}
      />
    </main>
  );
}

function TimeSheet({ item, onClose, onSave }: { item: ItineraryItem | null; onClose: () => void; onSave: (s: string, e: string) => void }) {
  const [s, setS] = useState("");
  const [e, setE] = useState("");
  const [key, setKey] = useState<string | null>(null);
  if (item && key !== item.id) {
    setKey(item.id);
    setS(item.startTime);
    setE(item.endTime);
  }
  const invalid = !s || !e || toMin(e) <= toMin(s);
  return (
    <Sheet open={!!item} onClose={() => { setKey(null); onClose(); }} title="시간 변경">
      <div className="stack">
        <div className="grid-2">
          <label className="field"><span className="label">시작</span><input className="input" type="time" value={s} onChange={(ev) => setS(ev.target.value)} /></label>
          <label className="field"><span className="label">종료</span><input className="input" type="time" value={e} onChange={(ev) => setE(ev.target.value)} /></label>
        </div>
        <div className="row-wrap" style={{ gap: 8 }}>
          {[-30, -15, 15, 30].map((d) => (
            <button key={d} className="act" onClick={() => { if (!s || !e) return; setS(toHHMM(toMin(s) + d)); setE(toHHMM(toMin(e) + d)); }}>{d > 0 ? `+${d}` : d}분 이동</button>
          ))}
        </div>
        {invalid && <p className="small" style={{ color: "var(--danger)" }}>종료 시간이 시작보다 늦어야 해요</p>}
        <button className="btn btn-primary btn-block" disabled={invalid} onClick={() => { setKey(null); onSave(s, e); }}>저장</button>
      </div>
    </Sheet>
  );
}
