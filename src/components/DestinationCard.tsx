"use client";
import { useState } from "react";
import type { DiscoveryResult } from "@/services/discovery";
import { Icon } from "./Icon";
import { DemoBadge } from "./ui";
import { UNKNOWN } from "@/lib/labels";

export function DestinationCard({ result, favorite, onFavorite, onSelect }: { result: DiscoveryResult; favorite: boolean; onFavorite: () => void; onSelect: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const d = result.destination;
  return (
    <div className="flip-wrap">
      <div className={`flip ${flipped ? "flipped" : ""}`}>
        {/* 앞면 */}
        <article className="flip-face" aria-hidden={flipped}>
          <div className="dest-img" style={{ background: d.tone }}>
            <div className="tl">
              {d.source === "DEMO" ? <DemoBadge /> : <span />}
              <button className={`icon-btn ${favorite ? "on" : ""}`} onClick={onFavorite} aria-label="여행지 즐겨찾기" aria-pressed={favorite}><Icon name="star" /></button>
            </div>
            <div className="nm">{d.name}</div>
            <div className="en">{d.nameEn} · {d.country}</div>
            <span className="ph">대표 이미지 준비중</span>
          </div>
          <div className="dest-body">
            <div className="row-wrap">{d.character.map((c) => <span key={c} className="chip">{c}</span>)}</div>
            <p className="reason">{d.reason}</p>
            {result.matched.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <span className="xs muted bold">내 조건과 맞는 점</span>
                <div className="row-wrap">{result.matched.map((m) => <span key={m} className="chip chip-teal"><Icon name="check" />{m}</span>)}</div>
              </div>
            )}
            <dl className="kv" style={{ margin: 0 }}>
              <dt>예상 강도</dt><dd>{d.expectedIntensity}</dd>
              <dt>추천 시기</dt><dd className={d.season ? "" : "faint"}>{d.season ?? "데이터 확인 필요"}</dd>
            </dl>
            <div style={{ flex: 1 }} />
            <div className="grid-2">
              <button className="btn" onClick={() => setFlipped(true)}><Icon name="flip" />자세히</button>
              <button className="btn btn-primary" onClick={onSelect}>이 여행지로</button>
            </div>
          </div>
        </article>
        {/* 뒷면 */}
        <article className="flip-face flip-back" aria-hidden={!flipped}>
          <div className="between">
            <div>
              <h3 style={{ fontSize: 22 }}>{d.name}</h3>
              <div className="small muted">{d.nameEn} · {d.country}</div>
            </div>
            <DemoBadge />
          </div>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>여행 성격</dt><dd>{d.character.join(" · ")}</dd>
            <dt>예상 강도</dt><dd>{d.expectedIntensity}</dd>
            <dt>주요 장점</dt><dd>{d.highlights.join(" · ")}</dd>
            <dt>추천 시기</dt><dd>{d.season ?? "데이터 확인 필요"}</dd>
            <dt>항공</dt><dd>{d.flightFromKorea ?? UNKNOWN}</dd>
            <dt>아이 동반</dt><dd>{d.kidFriendly === null ? "데이터 확인 필요" : d.kidFriendly ? "적합" : "주의"}</dd>
            <dt>자동 일정</dt><dd>{d.hasItineraryData ? "지원 (DEMO 데이터)" : "데이터 준비중"}</dd>
          </dl>
          {result.caution.length > 0 && (
            <div className="banner banner-warn small">
              {result.caution.map((c) => <div key={c}>· {c}</div>)}
            </div>
          )}
          <p className="xs faint">점수·등급 데이터가 없어 태그로만 표시해요. 항공·가격 정보는 실시간 데이터가 아니에요.</p>
          <div style={{ flex: 1 }} />
          <div className="grid-2">
            <button className="btn" onClick={() => setFlipped(false)}><Icon name="flip" />앞면</button>
            <button className="btn btn-primary" onClick={onSelect}>이 여행지로</button>
          </div>
        </article>
      </div>
    </div>
  );
}
