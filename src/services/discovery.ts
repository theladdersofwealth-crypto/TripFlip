// 목적지 발견 / 숙박 지역 추천 (rule-based). 점수를 만들지 않고 "조건 일치 태그"로 설명한다.
import type { Destination, TripConditions, Zone } from "@/lib/types";
import { getDestinations, getZones } from "@/data/repository";
import { PREF_LABEL, BUDGET } from "@/lib/labels";

export interface DiscoveryResult {
  destination: Destination;
  matched: string[]; // 사용자 조건과 일치한 태그
  caution: string[];
}

export function discoverDestinations(c: TripConditions | null): DiscoveryResult[] {
  const all = getDestinations();
  if (!c) return all.map((d) => ({ destination: d, matched: [], caution: [] }));
  return all
    .map((d) => {
      const matched = c.prefs.filter((p) => d.prefs.includes(p)).map((p) => PREF_LABEL[p]);
      const caution: string[] = [];
      if (c.party.children > 0) {
        if (d.kidFriendly === true) matched.unshift("아이 동반");
        else if (d.kidFriendly === null) caution.push("아이 동반 데이터 확인 필요");
      }
      if (d.budgetFit.includes(c.budget)) matched.push(`예산 ${BUDGET[c.budget].label}`);
      else caution.push(`예산 '${BUDGET[c.budget].label}'과 맞는지 확인 필요`);
      if (!d.hasItineraryData) caution.push("자동 일정 데이터 준비중");
      return { destination: d, matched, caution };
    })
    .sort((a, b) => Number(b.destination.hasItineraryData) - Number(a.destination.hasItineraryData) || b.matched.length - a.matched.length);
}

export interface StayRecommendation {
  zone: Zone;
  reasons: string[];
  rank: number;
}

export function recommendStayZones(destinationId: string, c: TripConditions): StayRecommendation[] {
  return getZones(destinationId)
    .map((z) => {
      const reasons: string[] = [];
      let s = 0;
      const m = c.prefs.filter((p) => z.goodFor.includes(p));
      if (m.length) {
        reasons.push(`${m.map((p) => PREF_LABEL[p]).join("·")} 취향과 맞음`);
        s += m.length * 2;
      }
      if (c.party.children > 0) {
        if (z.kidFriendly === true) {
          reasons.push("아이 동반에 무난");
          s += 2;
        } else if (z.kidFriendly === null) reasons.push("아이 동반 적합도 미확인");
      }
      if (c.intensity !== "relaxed" && (z.id === "nt-center" || z.id === "nt-north")) {
        reasons.push("주요 방문지 이동이 짧음");
        s += 2;
      }
      if (c.intensity === "relaxed" && z.goodFor.includes("relax")) s += 1;
      reasons.push(z.note);
      return { zone: z, reasons, rank: s };
    })
    .sort((a, b) => b.rank - a.rank);
}
