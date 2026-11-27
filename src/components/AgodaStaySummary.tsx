import type { RegionV1 } from "@/data/regionsV1";
import type { RegionQuery } from "@/services/regionScore";
import { calendarDays, todayInSeoul } from "@/lib/travelDates";
import { roomEstimate } from "@/lib/travelParty";

/** Show the requested dates separately from the provider's results or availability. */
export function AgodaStaySummary({ region, query }: { region: RegionV1; query: RegionQuery }) {
  const { startDate, endDate, adults, children } = query;
  // The provider may choose a fallback date for old or distant searches. Keep the outgoing URL unchanged.
  const daysAhead = calendarDays(todayInSeoul(), startDate) - 1;
  const mayReset = daysAhead < 0 || daysAhead > 365;
  return <p className="xs muted">
    아고다 검색 요청: {region.id === "mon-gobi" ? "달란자드가드 · " : ""}{startDate} ~ {endDate} · 성인 {adults}명{children.length > 0 ? ` · 자녀 ${children.length}명` : ""} · {roomEstimate(query).rooms}객실.
    {" "}{mayReset ? "아고다가 검색 날짜를 바꿀 수 있어요. 예약 전 날짜를 꼭 확인해 주세요." : "아고다에서 날짜와 인원이 같은지 확인해 주세요."}
  </p>;
}
