"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BackButton } from "@/components/AppShell";
import { TripForm } from "@/components/TripForm";
import { Icon } from "@/components/Icon";
import { DemoBadge, Empty } from "@/components/ui";
import { getDestination, getPlaces, getZones } from "@/data/repository";
import { recommendStayZones } from "@/services/discovery";
import { useTripStore, FREE_TRIP_LIMIT } from "@/store/TripStore";
import { BUDGET, INTENSITY, PREF_LABEL } from "@/lib/labels";
import { addDays, daysBetween, formatKDate, uid } from "@/lib/time";
import type { BookedEvent, TripProfile } from "@/lib/types";
import { defaultConditions } from "@/services/demo";

export default function CreatePage() {
  const { dest: destId } = useParams<{ dest: string }>();
  const router = useRouter();
  const { conditions, setConditions, createTrip, showToast, ready } = useTripStore();
  const dest = getDestination(destId);
  const zones = getZones(destId);
  const places = getPlaces(destId);

  const [editingConditions, setEditingConditions] = useState(false);
  const [hotelName, setHotelName] = useState("");
  const [zoneId, setZoneId] = useState<string>("");
  const [showStay, setShowStay] = useState(false);
  const [checkIn, setCheckIn] = useState("15:00");
  const [checkOut, setCheckOut] = useState("11:00");
  const [lunch, setLunch] = useState<[string, string]>(["11:30", "12:30"]);
  const [dinner, setDinner] = useState<[string, string]>(["17:00", "18:00"]);
  const [must, setMust] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [booked, setBooked] = useState<BookedEvent[]>([]);
  const [transport, setTransport] = useState({ rentalCar: false, publicTransit: false, taxi: true });

  const formInitial = useMemo(() => conditions ?? defaultConditions(), [conditions]);
  const stay = useMemo(() => (conditions ? recommendStayZones(destId, conditions) : []), [destId, conditions]);

  if (!ready) return null;
  if (!dest || !dest.hasItineraryData) {
    return (
      <main className="container page">
        <Empty title="일정 데이터가 없는 여행지예요" desc="현재 MVP는 나트랑만 자동 일정을 지원해요." action={<Link className="btn btn-primary" href="/create/nha-trang">나트랑으로 만들기</Link>} />
      </main>
    );
  }

  if (!conditions || editingConditions) {
    return (
      <main className="container page" style={{ maxWidth: 640 }}>
        <BackButton />
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>{dest.name} · 여행 조건</h1>
        <TripForm initial={formInitial} submitLabel="다음: 숙소·일정 조건" onSubmit={(c) => { setConditions(c); setEditingConditions(false); }} />
      </main>
    );
  }

  const n = daysBetween(conditions.startDate, conditions.endDate) + 1;
  const dates = Array.from({ length: n }, (_, i) => addDays(conditions.startDate, i));
  const toggle = (list: string[], set: (v: string[]) => void, id: string, other: string[], setOther: (v: string[]) => void) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    if (other.includes(id)) setOther(other.filter((x) => x !== id));
  };

  const submit = () => {
    const chosenZone = zoneId || stay[0]?.zone.id || null;
    const profile: TripProfile = {
      conditions,
      hotel: { name: hotelName.trim() || "숙소", zoneId: chosenZone },
      checkIn,
      checkOut,
      meals: { lunch, dinner },
      mustVisit: must,
      exclude,
      booked: booked.filter((b) => b.title.trim()),
      transport,
    };
    const trip = createTrip(destId, profile);
    if (!trip) {
      showToast(`Free 플랜은 여행을 ${FREE_TRIP_LIMIT}개까지 저장할 수 있어요. 내 여행에서 하나를 정리하거나 Premium을 확인해 주세요.`);
      return;
    }
    if (!zoneId) showToast(`숙소 지역을 정하지 않아 추천 지역 '${zones.find((z) => z.id === chosenZone)?.name}' 기준으로 만들었어요.`);
    router.push(`/trip/${trip.id}`);
  };

  return (
    <main className="container page" style={{ maxWidth: 640 }}>
      <BackButton />
      <div className="between" style={{ marginTop: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>{dest.name} 여행 만들기</h1>
        <DemoBadge />
      </div>

      <div className="card-soft between" style={{ marginTop: 12 }}>
        <div className="small">
          <div className="bold">{formatKDate(conditions.startDate, false)} – {formatKDate(conditions.endDate, false)} · {n - 1}박 {n}일</div>
          <div className="muted">
            성인 {conditions.party.adults}{conditions.party.children ? ` · 어린이 ${conditions.party.children}(${conditions.party.childAges.join("·")}세)` : ""} · {INTENSITY[conditions.intensity].label} · {BUDGET[conditions.budget].label}
            {conditions.prefs.length ? ` · ${conditions.prefs.map((p) => PREF_LABEL[p]).join("·")}` : ""}
          </div>
        </div>
        <button className="btn btn-sm" onClick={() => setEditingConditions(true)}>수정</button>
      </div>

      <div className="form-section">
        <h2 className="section-title">숙소</h2>
        <label className="field">
          <span className="label">숙소 이름</span>
          <input className="input" value={hotelName} onChange={(e) => setHotelName(e.target.value)} placeholder="예: OO 리조트 (선택)" />
        </label>
        <label className="field">
          <span className="label">숙소 위치</span>
          <select className="input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">아직 안 정했어요</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name} · {z.description}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-soft" onClick={() => setShowStay((v) => !v)}>
          <Icon name="bed" />어느 지역에 숙박하는 게 좋은지 추천받기
        </button>
        {showStay && (
          <div className="stack">
            {stay.map((s, i) => (
              <button key={s.zone.id} type="button" className="card-btn" style={zoneId === s.zone.id ? { borderColor: "var(--navy)", boxShadow: "0 0 0 1px var(--navy) inset" } : undefined} onClick={() => setZoneId(s.zone.id)}>
                <div className="between">
                  <div className="bold">{i === 0 && <span className="badge badge-ok" style={{ marginRight: 6 }}>추천</span>}{s.zone.name}</div>
                  {zoneId === s.zone.id && <Icon name="check" />}
                </div>
                <div className="small muted">{s.zone.description}</div>
                <div className="row-wrap" style={{ marginTop: 8 }}>{s.reasons.map((r) => <span key={r} className="chip xs">{r}</span>)}</div>
              </button>
            ))}
            <p className="xs faint">지역 특성은 DEMO 데이터 기반이에요. 숙소 가격·예약 가능 여부는 제공하지 않아요.</p>
          </div>
        )}
        <div className="grid-2">
          <label className="field"><span className="label">체크인 (1일차)</span><input className="input" type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></label>
          <label className="field"><span className="label">체크아웃 (마지막 날)</span><input className="input" type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></label>
        </div>
      </div>

      <div className="form-section">
        <h2 className="section-title">원하는 식사시간</h2>
        <div className="grid-2">
          <label className="field"><span className="label">점심 시작</span><input className="input" type="time" value={lunch[0]} onChange={(e) => setLunch([e.target.value, lunch[1]])} /></label>
          <label className="field"><span className="label">점심 끝</span><input className="input" type="time" value={lunch[1]} onChange={(e) => setLunch([lunch[0], e.target.value])} /></label>
          <label className="field"><span className="label">저녁 시작</span><input className="input" type="time" value={dinner[0]} onChange={(e) => setDinner([e.target.value, dinner[1]])} /></label>
          <label className="field"><span className="label">저녁 끝</span><input className="input" type="time" value={dinner[1]} onChange={(e) => setDinner([dinner[0], e.target.value])} /></label>
        </div>
      </div>

      <div className="form-section">
        <h2 className="section-title">반드시 방문할 장소</h2>
        <div className="row-wrap" style={{ gap: 8 }}>
          {places.map((p) => <button type="button" key={p.id} className={`toggle-chip ${must.includes(p.id) ? "on" : ""}`} onClick={() => toggle(must, setMust, p.id, exclude, setExclude)}>{p.name}</button>)}
        </div>
        <h2 className="section-title" style={{ marginTop: 8 }}>제외할 장소</h2>
        <div className="row-wrap" style={{ gap: 8 }}>
          {places.map((p) => <button type="button" key={p.id} className={`toggle-chip ${exclude.includes(p.id) ? "on" : ""}`} style={exclude.includes(p.id) ? { background: "var(--danger)", borderColor: "var(--danger)" } : undefined} onClick={() => toggle(exclude, setExclude, p.id, must, setMust)}>{p.name}</button>)}
        </div>
      </div>

      <div className="form-section">
        <div className="between">
          <h2 className="section-title">이미 예약한 일정</h2>
          <button type="button" className="btn btn-sm" onClick={() => setBooked([...booked, { id: uid("bk"), title: "", date: dates[Math.min(1, n - 1)], start: "09:00", end: "12:00" }])}><Icon name="plus" />추가</button>
        </div>
        {booked.length === 0 && <p className="small muted">예약한 투어·공연 등이 있으면 추가하세요. 그 시간은 비워두고 일정을 짜요.</p>}
        {booked.map((b, i) => (
          <div key={b.id} className="card stack" style={{ gap: 8 }}>
            <div className="row">
              <input className="input" placeholder="예: 스노클링 투어" value={b.title} onChange={(e) => setBooked(booked.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <button type="button" className="icon-btn" aria-label="삭제" onClick={() => setBooked(booked.filter((_, j) => j !== i))}><Icon name="trash" /></button>
            </div>
            <select className="input" value={b.date} onChange={(e) => setBooked(booked.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}>
              {dates.map((d, k) => <option key={d} value={d}>{k + 1}일차 · {formatKDate(d)}</option>)}
            </select>
            <div className="grid-2">
              <input className="input" type="time" aria-label="시작" value={b.start} onChange={(e) => setBooked(booked.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
              <input className="input" type="time" aria-label="종료" value={b.end} onChange={(e) => setBooked(booked.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
            </div>
          </div>
        ))}
      </div>

      <div className="form-section" style={{ borderBottom: 0 }}>
        <h2 className="section-title">이동 수단</h2>
        <label className="check"><input type="checkbox" checked={transport.taxi} onChange={(e) => setTransport({ ...transport, taxi: e.target.checked })} />택시·차량호출 이용 가능</label>
        <label className="check"><input type="checkbox" checked={transport.rentalCar} onChange={(e) => setTransport({ ...transport, rentalCar: e.target.checked })} />렌터카</label>
        <label className="check"><input type="checkbox" checked={transport.publicTransit} onChange={(e) => setTransport({ ...transport, publicTransit: e.target.checked })} />대중교통</label>
      </div>

      <div className="sticky-cta">
        <button className="btn btn-primary btn-lg btn-block" onClick={submit}><Icon name="sparkles" />일정 만들기</button>
      </div>
    </main>
  );
}
