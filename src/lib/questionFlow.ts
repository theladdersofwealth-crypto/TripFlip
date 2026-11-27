import type { RegionQuery } from "@/services/regionScore";
export const QUESTIONS = ["who","when","area","vibe","flight","intensity","budget","stay","price","rooms","pet"] as const;
export type Question = typeof QUESTIONS[number];
export const questionIndex = (n: unknown) => typeof n === "number" && Number.isInteger(n) ? Math.max(0,Math.min(QUESTIONS.length-1,n)) : 0;
export function selectedQuestions(value: unknown): Question[] {
  return Array.isArray(value) ? QUESTIONS.filter(q=>value.includes(q)) : [];
}
export function recommendationDefaults(base: RegionQuery): RegionQuery {
  return {...base,subs:[],maxFlightHours:5,stay:"가심비"};
}
export function defaultLabels(q: RegionQuery, answered: readonly Question[]): string[] {
  const unset = QUESTIONS.filter(k=>!answered.includes(k));
  const labels: Record<Question,string> = {
    who:`기본 동행 (성인 ${q.adults}명${q.children.length ? " · 자녀 "+q.children.length+"명":""})`,
    when:`기준 날짜 ${q.startDate}~${q.endDate}`,area:"지역 제한 없음",vibe:`기본 메인 테마 ${q.main}`,
    flight:`편도 ${q.maxFlightHours == null ? "제한 없음":q.maxFlightHours+"시간 이내 희망"}`,intensity:`하루 ${q.perDay}곳`,
    budget:"예산 미정",stay:"숙소 적정 가격대(가심비)",price:"물가 제한 없음",rooms:"객실 수 추정",pet:"반려동물 미동반",
  };
  const result=unset.map(k=>labels[k]);
  if(q.totalBudgetKrw==null&&!unset.includes("budget"))result.push("예산 미정");
  if(q.roomCount==null&&!unset.includes("rooms"))result.push("객실 수 추정");
  return result;
}
