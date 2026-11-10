import type { Concept, PlaceV1 } from "@/data/regionsV1";
import { PLACE_ATTRS } from "@/data/placeAttrs";
import { PLACE_FIT } from "@/data/placeFit";
import type { ChildBand, Companion, RegionQuery } from "@/services/regionScore";

export type Relationship = "self" | "spouse" | "partner" | "friend" | "child" | "parent" | "parentInLaw" | "other";

/** 관계·나이만으로 취향이나 보행 능력을 확정하지 않는다. */
export interface TravelMember {
  id: string;
  name: string;
  relationship: Relationship;
  age: number | null;
  mobility: "standard" | "limited";
  stroller: boolean;
  preferences: Concept[];
  /** 예전 저장 자료를 읽을 때만 사용. 대표 나이를 실제 나이로 만들지 않는다. */
  childBand?: ChildBand;
  height?: number | null;
}

const BAND: ChildBand[] = ["영아", "유아", "초등", "중고등"];
const CONCEPTS: Concept[] = ["관광", "휴양", "액티비티", "미식", "쇼핑"];
const FIT_INDEX: Record<Companion, number> = { 부부: 1, 연인: 2, 친구: 3, 부모님: 4, 영유아: 5, 아이: 6, "10대": 7, 혼자: 8 };
const count = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(20, Math.floor(v))) : 0;
const unique = <T,>(values: T[]) => [...new Set(values)];

export function childBandOf(m: TravelMember): ChildBand | null {
  if (m.age != null && Number.isFinite(m.age)) {
    if (m.age >= 18) return null;
    return m.age < 3 ? "영아" : m.age < 6 ? "유아" : m.age < 13 ? "초등" : "중고등";
  }
  return m.relationship === "child" ? m.childBand ?? "초등" : null;
}

export function membersOf(q: RegionQuery): TravelMember[] {
  if (q.members?.length) return q.members;
  const adultCount = count(q.adults);
  const adults: TravelMember[] = Array.from({ length: adultCount }, (_, i) => ({
    id: `legacy-adult-${i + 1}`,
    name: i === 0 ? "나" : `성인 ${i + 1}`,
    relationship: i === 0 ? "self" : i === 1 && q.companions?.includes("부부") ? "spouse" : i === 1 && q.companions?.includes("연인") ? "partner" : q.companions?.includes("친구") ? "friend" : "other",
    age: null,
    mobility: "standard",
    stroller: false,
    preferences: [],
  }));
  return [...adults, ...q.children.map((c, i): TravelMember => ({
    id: `legacy-child-${i + 1}`, name: `자녀 ${i + 1}`, relationship: "child",
    age: c.actualAge ?? null, childBand: c.band, height: c.height,
    mobility: "standard", stroller: false, preferences: [],
  }))];
}

export function memberCompanions(m: TravelMember): Companion[] {
  const band = childBandOf(m);
  if (band) return [band === "영아" ? "영유아" : band === "중고등" ? "10대" : "아이"];
  if (m.relationship === "spouse") return ["부부"];
  if (m.relationship === "partner") return ["연인"];
  if (m.relationship === "friend") return ["친구"];
  if (m.relationship === "parent" || m.relationship === "parentInLaw") return ["부모님"];
  return [];
}

/** 구성원 편집 시 레거시 인원·나이 필드를 함께 갱신한다. 성인 자녀는 성인이다. */
export function normalizeParty(q: RegionQuery): RegionQuery {
  if (!q.members?.length) return q;
  const members = q.members.map((m) => ({
    ...m,
    age: m.age == null || !Number.isFinite(m.age) ? null : Math.max(0, Math.min(120, Math.floor(m.age))),
    preferences: unique(m.preferences.filter((p) => CONCEPTS.includes(p))),
  }));
  const children = members.flatMap((m) => {
    const band = childBandOf(m);
    return band ? [{ band, height: m.height ?? null, actualAge: m.age }] : [];
  });
  const companions = unique(members.flatMap(memberCompanions));
  if (members.length === 1 && !children.length) companions.push("혼자");
  return { ...q, members, adults: members.length - children.length, children,
    elders: members.some((m) => m.relationship === "parent" || m.relationship === "parentInLaw"), companions };
}

/** 공통 핵심 취향과 개인 취향은 동등한 여행 목표다. */
export function coreInterests(q: RegionQuery): Concept[] {
  const explicit = [...(q.interests ?? []), ...(q.members?.flatMap((m) => m.preferences) ?? [])];
  return unique(explicit.length ? explicit : [q.main, ...q.subs]);
}

/** 메인 > 서브1 > 서브2 > 서브3… 순서 비중. 구성원 개인 취향만 해당하면 0.5 */
export const ORDER_WEIGHT = [1, 0.8, 0.65, 0.5, 0.4];
export function conceptWeight(concepts: Concept[], q: RegionQuery): number {
  if (q.interests?.length || q.members?.some((m) => m.preferences.length)) {
    const order = q.interests ?? [];
    const idx = order.findIndex((c) => concepts.includes(c));
    if (idx >= 0) return ORDER_WEIGHT[Math.min(idx, ORDER_WEIGHT.length - 1)];
    return concepts.some((c) => coreInterests(q).includes(c)) ? 0.5 : 0;
  }
  return concepts.includes(q.main) ? 1 : concepts.some((c) => q.subs.includes(c)) ? 0.5 : 0;
}

/** 객실 수 미정일 때만 전원 2인/객실을 비용 산정 가정으로 사용한다. 숙소 정원 판정이 아니다. */
export function roomEstimate(q: RegionQuery): { rooms: number; estimated: boolean } {
  if (q.roomCount != null && Number.isInteger(q.roomCount) && q.roomCount > 0 && q.roomCount <= 20)
    return { rooms: q.roomCount, estimated: false };
  return { rooms: Math.max(1, Math.ceil(membersOf(q).length / 2)), estimated: true };
}

/** 항공편 미확정 단계의 기본 관광 칸. 도착 오전·귀국 오후/저녁은 이동용으로 둔다. */
export function dayVisitCapacity(perDay: 1 | 2 | 3, dayIndex: number, days: number): number {
  if (days < 2) return 0;
  if (dayIndex === days - 1) return 1;
  if (dayIndex === 0) return perDay === 3 ? 2 : 1;
  return perDay;
}

export function plannedVisitCount(q: RegionQuery): number {
  const days = Math.round((Date.parse(q.endDate) - Date.parse(q.startDate)) / 86400000) + 1;
  if (!Number.isFinite(days) || days < 2 || days > 30) return 0;
  return Array.from({ length: days }, (_, i) => dayVisitCapacity(q.perDay, i, days)).reduce((a, b) => a + b, 0);
}

export function partyFlags(q: RegionQuery): string[] {
  const out = ["항공편 확정 전 도착·귀국일 관광 시간은 기본 가정이에요"];
  if (roomEstimate(q).estimated) out.push("객실 수는 전원 2인/객실 기준 비용 가정이며, 아동 정책·실제 정원은 미확인이에요");
  else out.push("선택한 객실 수의 실제 숙박 가능 인원은 예약처에서 확인해야 해요");
  if (membersOf(q).some((m) => m.relationship === "child" && m.age === null)) out.push("자녀 실제 나이 미확인: 항공·숙소의 아동 요금은 확인이 필요해요");
  return out;
}

/** 취향·동행 점수는 추정이며 이용 제한의 근거로 쓰지 않는다. */
export function personalFit(p: PlaceV1, q: RegionQuery): { factor: number; flags: string[] } {
  const members = membersOf(q);
  const flags: string[] = [];
  const row = PLACE_FIT[p.id];
  const kid = PLACE_ATTRS[p.id]?.[2];
  const kidScore = kid === "상" ? 1 : kid === "중" ? 0.6 : kid === "하" ? 0.2 : null;
  const fits = members.map((m) => {
    const types = memberCompanions(m);
    const estimates = types.flatMap((c) => {
      const v = row?.[FIT_INDEX[c]];
      return typeof v === "number" && Number.isFinite(v) ? [Math.max(0, Math.min(1, v / 5))] : [];
    });
    let fit = estimates.length ? Math.min(...estimates) : childBandOf(m) && kidScore != null ? kidScore : 1;
    if (m.mobility === "limited" && (p.longWalk || p.steep === true)) {
      fit *= 0.6;
      flags.push(`${p.name}: 보행 부담을 줄이려는 구성원에게 장시간 도보·급경사 부담이 있어요`);
    }
    if (m.stroller) flags.push(`${p.name}: 유모차 접근 가능 여부 미확인`);
    return fit;
  });
  if (row || members.some((m) => childBandOf(m) && kidScore != null)) flags.push("동행 적합도는 AI 추정이며 실제 입장 제한을 뜻하지 않아요");
  return { factor: fits.length ? Math.min(...fits) * 0.5 + fits.reduce((s, f) => s + f, 0) / fits.length * 0.5 : 1, flags: unique(flags) };
}

export const CHILD_BANDS = BAND;
