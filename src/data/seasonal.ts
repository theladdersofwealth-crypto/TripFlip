// 기간 한정 장소(행사·시즌). 여행 날짜에 운영 월이 하나도 없으면 추천 근거·일정 후보에서 뺀다.
// 월은 해마다 공개되는 일반 일정 기준(정확한 날짜는 연도마다 달라 "방문 전 확인"). 여기 없는 장소는 상시로 본다.
import type { PlaceV1 } from "@/data/regionsV1";

export const SEASONAL: Record<string, { months: number[]; note: string }> = {
  "jap-sapporo-x13": { months: [2], note: "삿포로 눈축제는 매년 2월 초 약 1주" },
  "chi-harbin-102": { months: [12, 1, 2], note: "하얼빈 빙설대세계는 겨울(대략 12~2월)만 운영" },
  "chi-harbin-109": { months: [11, 12, 1, 2, 3], note: "야부리 스키장은 스키 시즌(대략 11~3월)" },
  "sri-galle-418": { months: [11, 12, 1, 2, 3, 4], note: "미리사 고래 관찰은 대략 11~4월 시즌" },
};

const monthOf = (date: string) => Number(date.slice(5, 7));

/** 그 날짜(YYYY-MM-DD)에 운영하는가. 등록 안 된 장소는 상시. */
export function openOn(p: Pick<PlaceV1, "id">, date: string): boolean {
  const s = SEASONAL[p.id];
  return !s || s.months.includes(monthOf(date));
}

/** 여행 기간 중 하루라도 운영 월에 걸리는가 */
export function openDuring(p: Pick<PlaceV1, "id">, start: string, end: string): boolean {
  const s = SEASONAL[p.id];
  if (!s) return true;
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  for (; d <= last; d.setUTCDate(d.getUTCDate() + 1)) if (s.months.includes(d.getUTCMonth() + 1)) return true;
  return false;
}
