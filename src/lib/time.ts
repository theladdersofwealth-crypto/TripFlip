export const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const toHHMM = (min: number): string => {
  const m = Math.max(0, Math.min(min, 24 * 60 - 1));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** 5분 단위 반올림 */
export const round5 = (min: number) => Math.round(min / 5) * 5;

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(start: string, end: string): number {
  const a = new Date(start + "T00:00:00").getTime();
  const b = new Date(end + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function formatKDate(date: string, withWeekday = true): string {
  const d = new Date(date + "T00:00:00");
  const s = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return withWeekday ? `${s} ${WEEK[d.getDay()]}요일` : s;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

export const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
