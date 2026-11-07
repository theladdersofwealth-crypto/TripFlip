/** 날짜는 UTC 달력 일자로 계산한다. 시간대나 서머타임에 따라 박수가 달라지지 않는다. */
export interface TravelWindow { earliest: string; latest: string; nights: number }
export interface TravelDates { startDate: string; endDate: string; dateWindow?: TravelWindow }

function dateMs(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
}

export function calendarDays(start: string, end: string): number {
  return (dateMs(end) - dateMs(start)) / 86400000 + 1;
}

export function addCalendarDays(date: string, days: number): string {
  const ms = dateMs(date);
  return Number.isFinite(ms) && Number.isInteger(days) ? new Date(ms + days * 86400000).toISOString().slice(0, 10) : "";
}

export function tripWindows(window: TravelWindow): { startDate: string; endDate: string }[] {
  const available = calendarDays(window.earliest, window.latest);
  if (!Number.isFinite(available) || available < 2 || available > 366 || !Number.isInteger(window.nights) || window.nights < 1 || window.nights > 29) return [];
  return Array.from({ length: Math.max(0, available - window.nights) }, (_, i) => {
    const startDate = addCalendarDays(window.earliest, i);
    return { startDate, endDate: addCalendarDays(startDate, window.nights) };
  });
}

export function travelDateError(query: TravelDates): string | null {
  const days = calendarDays(query.startDate, query.endDate);
  if (!Number.isFinite(days)) return "출발일과 귀국일을 올바르게 입력해 주세요.";
  if (days < 2) return "최소 1박으로 선택해 주세요.";
  if (days > 30) return "최대 29박 30일까지 지원해요.";
  if (query.dateWindow) {
    const candidates = tripWindows(query.dateWindow);
    if (!candidates.length) return "가능한 기간 안에 희망 박수가 들어가도록 선택해 주세요. 기간은 최대 1년이에요.";
    if (!candidates.some((c) => c.startDate === query.startDate && c.endDate === query.endDate)) return "가능한 기간 안에서 기준 출발일을 선택해 주세요.";
  }
  return null;
}
