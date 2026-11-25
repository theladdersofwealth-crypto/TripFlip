import type { RegionQuery } from "@/services/regionScore";
import { DEFAULT_QUERY } from "@/lib/flow";
import { travelDateError } from "@/lib/travelDates";
import { normalizeParty } from "@/lib/travelParty";

// 추천 결과 공유 링크(11/25 형님): 서버 없이 링크 주소(?s=)에 검색 조건을 담는다.
// 구성원 이름은 개인 정보라 빼고 보낸다. 받은 쪽은 같은 조건으로 다시 계산한다.

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

/** 공유용 조건: 구성원 이름을 지운다 */
export function shareableQuery(q: RegionQuery): RegionQuery {
  return { ...q, members: q.members?.map((m) => ({ ...m, name: "" })) };
}

export function encodeShare(q: RegionQuery): string {
  return toB64Url(JSON.stringify(shareableQuery(q)));
}

/** 링크의 조건을 읽는다. 깨졌거나 지난 날짜면 null */
export function decodeShare(s: string | null | undefined): RegionQuery | null {
  if (!s || s.length > 4000) return null;
  try {
    const raw = JSON.parse(fromB64Url(s)) as RegionQuery;
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.children) || !Array.isArray(raw.subs)) return null;
    const q = normalizeParty({ ...DEFAULT_QUERY, ...raw });
    return travelDateError(q) ? null : q;
  } catch {
    return null;
  }
}

export function shareUrl(origin: string, q: RegionQuery): string {
  return `${origin}/results?s=${encodeShare(q)}`;
}
