"use client";
import { useEffect, useState } from "react";

/** PC(넓은 화면) 여부. 모바일 화면은 그대로 두고, 이 폭 이상에서만 2단 레이아웃을 쓴다 */
export const WIDE_QUERY = "(min-width: 1200px)";
export function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(WIDE_QUERY);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}
