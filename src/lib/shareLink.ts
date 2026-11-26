import type { Concept } from "@/data/regionsV1";
import type { ChildBand, RegionQuery } from "@/services/regionScore";
import { DEFAULT_QUERY } from "@/lib/flow";
import { travelDateError } from "@/lib/travelDates";
import { coreInterests, normalizeParty } from "@/lib/travelParty";
import { normalizeTravelAreas } from "@/data/travelAreas";

// 추천 결과 공유 링크(11/25 형님): 서버 없이 링크 주소(?s=)에 검색 조건을 담는다.
// 링크는 누구나 읽을 수 있으므로 순위 계산에 꼭 필요한 값만 담는다(11/25 점검 후 수정).
// 담지 않는 것: 구성원 이름·관계·나이, 자녀 실제 나이·키, 보행 조건·유모차, 구성원별 취향 구분.
// 자녀는 연령대(영아·유아·초등·중고등)만, 예산은 10만원 단위로 반올림해서 담는다.

const toB64Url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const BANDS: ChildBand[] = ["영아", "유아", "초등", "중고등"];
const roundBudget = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? null : Math.max(0, Math.round(v / 100000) * 100000);

/** 공유용 조건: 순위 계산에 필요한 최소 값만 남긴다(구성원 정보는 인원·연령대로만) */
export function shareableQuery(input: RegionQuery): RegionQuery {
  const q = normalizeParty(input);
  // 구성원별 취향은 누구의 취향인지 빼고 공통 취향 뒤에 붙인다
  const interests: Concept[] | undefined = q.interests?.length || q.members?.some((m) => m.preferences.length)
    ? coreInterests(q) : undefined;
  const preferredAreas = normalizeTravelAreas(q.preferredAreas);
  return {
    ...(preferredAreas.length ? { preferredAreas } : {}),
    startDate: q.startDate,
    endDate: q.endDate,
    adults: q.adults,
    children: q.children.map((c) => ({ band: c.band, height: null })),
    elders: q.elders,
    pet: q.pet,
    companions: q.companions,
    main: q.main,
    subs: q.subs,
    interests,
    perDay: q.perDay,
    price: q.price,
    stay: q.stay,
    maxFlightHours: q.maxFlightHours ?? null,
    roomCount: q.roomCount ?? null,
    totalBudgetKrw: roundBudget(q.totalBudgetKrw),
    budgetMode: q.budgetMode,
  };
}

export function encodeShare(q: RegionQuery): string {
  return toB64Url(JSON.stringify(shareableQuery(q)));
}

/** 링크의 조건을 읽는다. 깨졌거나 지난 날짜면 null. 예전 링크에 더 많은 값이 있어도 최소 값만 쓴다 */
export function decodeShare(s: string | null | undefined): RegionQuery | null {
  if (!s || s.length > 4000) return null;
  try {
    const raw = JSON.parse(fromB64Url(s)) as RegionQuery;
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.children) || !Array.isArray(raw.subs)) return null;
    const merged = { ...DEFAULT_QUERY, ...raw, children: raw.children.filter((c) => BANDS.includes(c?.band)) };
    const q = shareableQuery(merged);
    return travelDateError(q) ? null : q;
  } catch {
    return null;
  }
}

export function shareUrl(origin: string, q: RegionQuery): string {
  return `${origin}/results?s=${encodeShare(q)}`;
}
