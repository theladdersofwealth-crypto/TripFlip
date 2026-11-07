"use client";
import { useState } from "react";
import type { Place, Zone } from "@/lib/types";
import { Icon } from "./Icon";
import { Attr, Chip, DemoBadge, Dots } from "./ui";
import { INDOOR_LABEL, UNKNOWN } from "@/lib/labels";
import { formatDuration } from "@/lib/time";

export interface PlaceMeta {
  zone?: Zone;
  travelFromHotel: number | null;
  scheduledDays: number[];
  favorite: boolean;
}

export function PlaceSummaryChips({ p, meta }: { p: Place; meta: PlaceMeta }) {
  return (
    <div className="row-wrap">
      <Chip icon={p.indoor === "outdoor" ? "sun" : "umbrella"}>{INDOOR_LABEL[p.indoor]}</Chip>
      <Chip icon="clock">{formatDuration(p.stayMinutes)}</Chip>
      {meta.travelFromHotel !== null ? <Chip icon="car">숙소 {meta.travelFromHotel}분</Chip> : <Chip icon="car" tone="unknown">이동 {UNKNOWN}</Chip>}
      {p.reservation === true && <Chip icon="calendar" tone="teal">예약 필요</Chip>}
    </div>
  );
}

export function PlaceDetail({ p, meta }: { p: Place; meta: PlaceMeta }) {
  return (
    <div className="stack">
      <div className="attr-grid">
        <Attr k="카테고리" v={p.category} />
        <Attr k="지역" v={meta.zone ? `${meta.zone.name}` : null} />
        <Attr k="추천 등급" v={p.grade !== null ? <Dots value={p.grade} /> : null} />
        <Attr k="예상 체류" v={formatDuration(p.stayMinutes)} />
        <Attr k="아이 적합도" v={p.kidScore !== null ? <Dots value={p.kidScore} /> : null} />
        <Attr k="피로도" v={p.fatigue !== null ? <Dots value={p.fatigue} kind="fatigue" /> : null} />
        <Attr k="실내/실외" v={INDOOR_LABEL[p.indoor]} />
        <Attr k="우천 적합" v={p.rainOk === null ? null : p.rainOk ? "가능" : "비 오면 비추천"} />
        <Attr k="운영시간" v={p.hours} />
        <Attr k="숙소에서 이동" v={meta.travelFromHotel !== null ? `약 ${meta.travelFromHotel}분 (추정)` : null} />
        <Attr k="유모차" v={p.stroller === null ? null : p.stroller ? "가능" : "어려움"} />
        <Attr k="예약" v={p.reservation === null ? null : p.reservation ? "필요" : "불필요"} />
        <Attr k="주소" v={p.address} />
        <Attr k="권장 최소 연령" v={p.minKidAge !== null ? `${p.minKidAge}세 이상` : "제한 정보 없음"} />
      </div>
      <p className="small"><b>추천 이유</b> · {p.reason}</p>
      <p className="xs faint">
        <DemoBadge /> 체류시간·아이 적합도·피로도는 시연용 추정값이에요. 운영시간·주소는 확인 전이라 ‘미확인’으로 표시해요. 이동시간은 지역 단위 추정치예요.
      </p>
    </div>
  );
}

export function PlaceCard({ p, meta, onFavorite }: { p: Place; meta: PlaceMeta; onFavorite: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="pcard">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <button className="pcard-top" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <div className="pcard-thumb"><Icon name="pin" /></div>
          <div className="grow stack" style={{ gap: 6 }}>
            <div>
              <div className="pcard-name">{p.name}</div>
              <div className="pcard-en">{p.nameEn} · {p.category} · {meta.zone?.name ?? UNKNOWN}</div>
            </div>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <span className="xs muted">아이 <Dots value={p.kidScore} /></span>
              <span className="xs muted">피로 <Dots value={p.fatigue} kind="fatigue" /></span>
            </div>
            <PlaceSummaryChips p={p} meta={meta} />
            {meta.scheduledDays.length > 0 && <span className="it-reason">일정 포함 · {meta.scheduledDays.map((d) => `${d}일차`).join(", ")}</span>}
          </div>
        </button>
        <button className={`icon-btn ${meta.favorite ? "on" : ""}`} style={{ margin: "14px 14px 0 0" }} onClick={onFavorite} aria-label="즐겨찾기" aria-pressed={meta.favorite}><Icon name="star" /></button>
      </div>
      {open && <div className="pcard-detail"><PlaceDetail p={p} meta={meta} /></div>}
    </article>
  );
}
