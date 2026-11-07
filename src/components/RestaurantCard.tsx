"use client";
import { useState } from "react";
import type { Restaurant, Zone } from "@/lib/types";
import { Icon } from "./Icon";
import { Attr, DemoBadge, TriChip, Chip } from "./ui";
import { SPICY_LABEL, UNKNOWN, triLabel } from "@/lib/labels";

export interface RestaurantMeta {
  zone?: Zone;
  travelFromHotel: number | null;
  scheduledDays: number[];
  favorite: boolean;
}

export function RestaurantChips({ r }: { r: Restaurant }) {
  return (
    <div className="row-wrap">
      <TriChip icon="chair" value={r.kidsChair} yes="아기의자" no="아기의자 없음" />
      {r.spicy ? <Chip icon="chili" tone={r.spicy === "mild" ? "ok" : "no"}>{SPICY_LABEL[r.spicy]}</Chip> : <Chip icon="chili" tone="unknown">매운 정도 {UNKNOWN}</Chip>}
      <TriChip icon="users" value={r.seats6} yes="6인 착석" no="6인 착석 어려움" />
      <TriChip icon="snow" value={r.aircon} yes="실내·냉방" no="냉방 없음" />
    </div>
  );
}

export function RestaurantDetail({ r, meta }: { r: Restaurant; meta: RestaurantMeta }) {
  return (
    <div className="stack">
      <div className="attr-grid">
        <Attr k="음식 종류" v={r.cuisine} />
        <Attr k="대표 메뉴" v={r.signature} />
        <Attr k="가격대" v={r.priceLevel} />
        <Attr k="영업시간" v={r.hours} />
        <Attr k="예약" v={r.reservation === null ? null : r.reservation ? "필요" : "불필요"} />
        <Attr k="아기의자" v={r.kidsChair === null ? null : triLabel(r.kidsChair, "있음", "없음")} />
        <Attr k="키즈메뉴" v={r.kidsMenu === null ? null : triLabel(r.kidsMenu, "있음", "없음")} />
        <Attr k="아이가 먹기 좋은 메뉴" v={r.kidFriendlyMenu} />
        <Attr k="매운 정도" v={r.spicy ? SPICY_LABEL[r.spicy] : null} />
        <Attr k="청결" v={r.clean} />
        <Attr k="에어컨/실내" v={r.aircon === null ? null : triLabel(r.aircon, "있음", "없음")} />
        <Attr k="카드결제" v={r.card === null ? null : triLabel(r.card, "가능", "불가")} />
        <Attr k="우천 적합" v={r.rainOk === null ? null : triLabel(r.rainOk, "적합", "비추천")} />
        <Attr k="6인 이상 착석" v={r.seats6 === null ? null : triLabel(r.seats6, "가능", "어려움")} />
        <Attr k="지역" v={meta.zone?.name} />
        <Attr k="숙소에서 이동" v={meta.travelFromHotel !== null ? `약 ${meta.travelFromHotel}분 (추정)` : null} />
      </div>
      <div className="attr"><div className="k">최근 부정 후기 요약</div><div className={`v ${r.negativeSummary ? "" : "unknown"}`}>{r.negativeSummary ?? UNKNOWN}</div></div>
      <div className="row-wrap">
        <span className="chip xs">데이터 신뢰도 · {r.confidence ?? UNKNOWN}</span>
        <span className="chip xs">마지막 확인일 · {r.lastVerified ?? UNKNOWN}</span>
      </div>
      <p className="xs faint"><DemoBadge /> 시연용 가상 식당이에요. 실제 업체 정보가 아니며, 확인되지 않은 항목은 ‘미확인’으로 둬요.</p>
    </div>
  );
}

export function RestaurantCard({ r, meta, onFavorite }: { r: Restaurant; meta: RestaurantMeta; onFavorite: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="pcard">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <button className="pcard-top" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <div className="pcard-thumb r"><Icon name="utensils" /></div>
          <div className="grow stack" style={{ gap: 6 }}>
            <div>
              <div className="pcard-name">{r.name}</div>
              <div className="pcard-en">{r.cuisine} · {meta.zone?.name ?? UNKNOWN} · 가격대 {r.priceLevel ?? UNKNOWN}</div>
            </div>
            <RestaurantChips r={r} />
            <div className="row-wrap">
              <span className="chip xs"><Icon name="clock" />영업 {r.hours ?? UNKNOWN}</span>
              {meta.travelFromHotel !== null && <span className="chip xs"><Icon name="car" />숙소 {meta.travelFromHotel}분</span>}
            </div>
            {meta.scheduledDays.length > 0 && <span className="it-reason">일정 포함 · {meta.scheduledDays.map((d) => `${d}일차`).join(", ")}</span>}
          </div>
        </button>
        <button className={`icon-btn ${meta.favorite ? "on" : ""}`} style={{ margin: "14px 14px 0 0" }} onClick={onFavorite} aria-label="즐겨찾기" aria-pressed={meta.favorite}><Icon name="star" /></button>
      </div>
      {open && <div className="pcard-detail"><RestaurantDetail r={r} meta={meta} /></div>}
    </article>
  );
}
