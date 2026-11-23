"use client";
import type { RegionQuery } from "@/services/regionScore";
import { RangeCalendar } from "@/components/RangeCalendar";

// 출발일 → 귀국일 두 번 누르면 끝. 박수는 따로 묻지 않고 날짜에서 계산(11/24 형님)
export function DateEditor({ query, onChange }: { query: RegionQuery; onChange: (query: RegionQuery) => void }) {
  return <RangeCalendar start={query.startDate} end={query.endDate} onChange={(startDate, endDate) => onChange({ ...query, startDate, endDate, dateWindow: undefined })} />;
}
