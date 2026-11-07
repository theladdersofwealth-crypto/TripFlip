"use client";
import type { Day, ItineraryItem, Place, Restaurant, Trip, Zone } from "@/lib/types";
import { Icon } from "./Icon";
import { Chip, Dots } from "./ui";
import { RestaurantChips } from "./RestaurantCard";
import { INDOOR_LABEL, UNKNOWN } from "@/lib/labels";
import { formatDuration, toMin } from "@/lib/time";

export interface IdleWindow { afterId: string; start: number; end: number; prevZone: string | null; nextZone: string | null }

export interface TimelineHandlers {
  onDetail: (it: ItineraryItem) => void;
  onDelete: (it: ItineraryItem) => void;
  onAlternatives: (it: ItineraryItem) => void;
  onTime: (it: ItineraryItem) => void;
  onMove: (it: ItineraryItem, dir: -1 | 1) => void;
  onFavorite: (it: ItineraryItem) => void;
  onFillGap: (it: ItineraryItem) => void;
  onFillIdle: (w: IdleWindow) => void;
}

interface Props extends TimelineHandlers {
  trip: Trip;
  day: Day;
  places: Place[];
  restaurants: Restaurant[];
  zones: Zone[];
  idle: IdleWindow[];
}

export function DayTimeline({ trip, day, places, restaurants, zones, idle, ...h }: Props) {
  const hasKids = trip.profile.conditions.party.children > 0;
  const zoneName = (id?: string | null) => zones.find((z) => z.id === id)?.name;

  return (
    <div className="timeline">
      {day.items.map((it, i) => {
        const prev = day.items[i - 1];
        const idleBefore = prev ? idle.find((w) => w.afterId === prev.id) : undefined;
        const showTravel = i > 0 && it.type !== "gap" && it.travelMinutes !== null && it.travelMinutes > 0;
        return (
          <div key={it.id}>
            {idleBefore && (
              <div className="tl-conn">
                <div className="line"><i /></div>
                <div style={{ padding: "6px 0" }}>
                  <button className="idle" style={{ width: "100%", border: 0 }} onClick={() => h.onFillIdle(idleBefore)}>
                    <span>여유 시간 {formatDuration(idleBefore.end - idleBefore.start - (it.travelMinutes ?? 0))}</span>
                    <span className="row bold"><Icon name="sparkles" size={16} />이 시간 추천받기</span>
                  </button>
                </div>
              </div>
            )}
            {showTravel && (
              <div className="tl-conn">
                <div className="line"><i /></div>
                <div className="txt"><Icon name="car" size={15} />이동 약 {it.travelMinutes}분{it.travelEstimated && <span className="faint">(추정)</span>}</div>
              </div>
            )}
            {i > 0 && !showTravel && !idleBefore && <div className="tl-conn"><div className="line"><i style={{ minHeight: 12 }} /></div><div /></div>}
            <Row it={it} />
          </div>
        );
      })}
    </div>
  );

  function Row({ it }: { it: ItineraryItem }) {
    const time = (
      <div className="tl-time">
        {it.startTime}
        {it.endTime !== it.startTime && <small>{it.endTime}</small>}
      </div>
    );
    if (it.type === "hotel") {
      return (
        <div className="tl-item">
          {time}
          <div className="hotel-row"><Icon name="bed" />{it.title}</div>
        </div>
      );
    }
    if (it.type === "gap") {
      const span = toMin(it.endTime) - toMin(it.startTime);
      return (
        <div className="tl-item">
          {time}
          <div className="gap-card">
            <div>
              <div className="bold">빈 시간 · {formatDuration(span)}</div>
              <div className="small muted">‘{it.gapOf}’ 일정을 삭제했어요. 다른 일정은 그대로 두고 이 시간대만 다시 추천해요.</div>
            </div>
            <button className="btn btn-teal" onClick={() => h.onFillGap(it)}><Icon name="sparkles" />빈 시간 다시 추천</button>
          </div>
        </div>
      );
    }

    const place = it.type === "place" ? places.find((p) => p.id === it.placeId) : undefined;
    const rest = it.type === "meal" ? restaurants.find((r) => r.id === it.restaurantId) : undefined;
    const title = place?.name ?? rest?.name ?? it.title ?? "";
    const canMove = it.type === "place";
    const canSwap = it.type === "place" || it.type === "meal";
    const isCore = it.locked || it.favorite;

    return (
      <div className="tl-item">
        {time}
        <article className={`it-card ${it.type} ${it.favorite ? "fav" : ""}`}>
          <button className="it-main" onClick={() => h.onDetail(it)} disabled={it.type === "rest" || it.type === "booked"} style={{ cursor: it.type === "rest" || it.type === "booked" ? "default" : "pointer" }}>
            <div className="row-wrap" style={{ gap: 6 }}>
              {it.type === "meal" && <span className="badge badge-warn">{it.mealKind === "lunch" ? "점심" : "저녁"}</span>}
              {it.type === "booked" && <span className="badge badge-premium">예약 일정</span>}
              {it.locked && it.type === "place" && <span className="badge badge-ok">반드시 방문</span>}
              {it.favorite && <span className="badge badge-warn">★ 즐겨찾기</span>}
              {it.confidence === "USER" && <span className="badge badge-muted">시간 수정됨</span>}
            </div>
            <div className="it-title">{title}</div>
            {place && (
              <>
                <div className="it-sub">{place.category} · {INDOOR_LABEL[place.indoor]} · {zoneName(place.zoneId) ?? UNKNOWN}</div>
                {hasKids && (
                  <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                    <span className="small muted">아이 적합 <Dots value={place.kidScore} /></span>
                    <span className="small muted">피로도 <Dots value={place.fatigue} kind="fatigue" /></span>
                  </div>
                )}
                <div className="row-wrap">
                  <Chip icon="clock" tone={place.hours ? undefined : "unknown"}>운영 {place.hours ?? UNKNOWN}</Chip>
                  {place.reservation === true && <Chip icon="calendar" tone="teal">예약 필요</Chip>}
                </div>
              </>
            )}
            {rest && (
              <>
                <div className="it-sub">{rest.cuisine} · {zoneName(rest.zoneId) ?? UNKNOWN}</div>
                <RestaurantChips r={rest} />
              </>
            )}
            {it.type === "rest" && <div className="it-sub">{formatDuration(toMin(it.endTime) - toMin(it.startTime))}</div>}
            {it.reason && <div className="it-reason">{it.reason}</div>}
          </button>
          {it.type !== "booked" && (
            <div className="it-actions">
              {canSwap && <button className={`icon-btn sm ${it.favorite ? "on" : ""}`} onClick={() => h.onFavorite(it)} aria-label="즐겨찾기" aria-pressed={!!it.favorite}><Icon name="star" /></button>}
              {canSwap && <button className="act" onClick={() => h.onAlternatives(it)}><Icon name="swap" size={16} />변경</button>}
              <button className="act" onClick={() => h.onTime(it)}><Icon name="clock" size={16} />시간</button>
              {canMove && <button className="icon-btn sm" onClick={() => h.onMove(it, -1)} aria-label="위로"><Icon name="up" /></button>}
              {canMove && <button className="icon-btn sm" onClick={() => h.onMove(it, 1)} aria-label="아래로"><Icon name="down" /></button>}
              <button className="act danger" onClick={() => h.onDelete(it)} disabled={isCore && it.type !== "rest"} title={isCore ? "즐겨찾기·반드시 방문 일정은 먼저 해제하세요" : undefined}><Icon name="trash" size={16} />삭제</button>
            </div>
          )}
        </article>
      </div>
    );
  }
}
