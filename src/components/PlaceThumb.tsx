"use client";
// 관광지·음식점 카드 썸네일. 순서: 직접 넣은 이미지(PLACE_IMAGES) → 위키미디어 공용(S·A 명소만) → 카테고리 색 블록.
import { useEffect, useRef, useState } from "react";
import type { PlaceV1 } from "@/data/regionsV1";
import { PLACE_IMAGES } from "@/data/placeImages";
import { REGIONS_V1 } from "@/data/regionsV1";
import { cachedCommons, commonsPhoto, type CommonsPhoto } from "@/lib/commonsPhoto";

export interface ThumbInfo { src: string; credit: string; link?: string; licenseUrl?: string }

const FALLBACK: Record<string, [string, string]> = {
  cafe: ["☕", "#f6ecdf"], food: ["🍽", "#fdeee6"], 휴양: ["🏖", "#e3f4f6"], 액티비티: ["🧗", "#e8f3ff"],
  미식: ["🍜", "#fdeee6"], 쇼핑: ["🛍", "#f3ecfb"], 관광: ["🏛", "#eef1f6"],
};
const fallbackOf = (p: PlaceV1): [string, string] => p.dining ? FALLBACK[p.dining.kind === "cafe" ? "cafe" : "food"] : FALLBACK[p.concepts[0] ?? "관광"] ?? FALLBACK.관광;
/** 자동 조회 대상: 영문명이 있는 S·A 명소(식당 제외 — 엉뚱한 사진 위험) */
const autoTarget = (p: PlaceV1) => !p.dining && (p.grade === "S" || p.grade === "A") && !!p.en && /[a-z]/i.test(p.en);
const areaOf = (p: PlaceV1) => REGIONS_V1.find((r) => r.id === p.region)?.searchName ?? "";

const fromCommons = (c: CommonsPhoto): ThumbInfo => ({ src: c.src, credit: `사진: ${c.artist} · ${c.license} · 위키미디어 공용`, link: c.page, licenseUrl: c.licenseUrl });
// 사진이 실제로 안 뜬(로드 실패) 경우 출처 줄도 숨기려고 기억해 둔다
const brokenSrc = new Set<string>();

function fixed(p: PlaceV1): ThumbInfo | null {
  if (p.dining?.mapRecord) return null;
  const f = PLACE_IMAGES[p.id];
  if (f) return { src: f.src, credit: f.credit ?? "", link: f.link };
  const c = autoTarget(p) ? cachedCommons(p.id) : null;
  return c ? fromCommons(c) : null;
}

export function usePlaceImage(p: PlaceV1, el: React.RefObject<HTMLElement | null>): ThumbInfo | null {
  const [img, setImg] = useState<ThumbInfo | null>(null);
  useEffect(() => {
    const now = fixed(p);
    setImg(now);
    if (now || !autoTarget(p) || cachedCommons(p.id) === null) return;
    let alive = true;
    const go = () => commonsPhoto(p.id, p.en, areaOf(p)).then((c) => { if (alive && c) setImg(fromCommons(c)); });
    const node = el.current;
    if (!node || typeof IntersectionObserver === "undefined") { go(); return () => { alive = false; }; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "200px" });
    io.observe(node);
    return () => { alive = false; io.disconnect(); };
  }, [p, el]);
  return img;
}

/** size=숫자면 정사각 썸네일, "wide"면 카드 폭 가득(이름 위 사진) */
/** creditLine=true면 사진 바로 아래에 출처 한 줄(링크 없이 글자만, 버튼 안에서도 쓸 수 있게). 사진이 안 뜨면 같이 숨김. */
export function PlaceThumb({ p, img, size = 64, creditLine = false }: { p: PlaceV1; img: ThumbInfo | null; size?: number | "wide"; creditLine?: boolean }) {
  const [broken, setBroken] = useState(false);
  const [ico, bg] = fallbackOf(p);
  useEffect(() => setBroken(false), [img?.src]);
  const box = size === "wide" ? { background: bg } : { width: size, height: size, background: bg };
  const shown = !!img && !broken;
  const thumb = <span className={`place-thumb${size === "wide" ? " wide" : ""}`} style={box} aria-hidden>
    {img && !broken ? <img src={img.src} alt="" loading="lazy" decoding="async" onError={() => { brokenSrc.add(img.src); setBroken(true); }} /> : <span className="place-thumb-ico">{ico}</span>}
  </span>;
  if (!creditLine || !shown || !img?.credit) return thumb;
  return <>{thumb}<span className="thumb-credit-line">{img.credit}</span></>;
}

/** 사진 출처 한 줄(작가·라이선스). 사진 없으면 아무것도 안 그림. */
export function ThumbCredit({ img }: { img: ThumbInfo | null }) {
  if (!img?.credit || brokenSrc.has(img.src)) return null;
  const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
  return <div className="faint">{img.link ? <a href={img.link} {...ext}>{img.credit}</a> : img.credit}{img.licenseUrl && <> · <a href={img.licenseUrl} {...ext}>라이선스</a></>}</div>;
}

export function useThumbRef() { return useRef<HTMLDivElement>(null); }
