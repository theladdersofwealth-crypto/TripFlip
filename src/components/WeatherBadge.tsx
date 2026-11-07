import type { DayWeather } from "@/lib/types";
import { Icon } from "./Icon";
import { DemoBadge, PremiumBadge } from "./ui";

const RAIN = { low: "강수 낮음", mid: "강수 보통", high: "비 예보" } as const;
const WIND = { none: "강풍 없음", some: "바람 약간", strong: "강풍" } as const;

/** 날씨 표시. 실제 API 데이터가 없으면 값을 만들지 않고 '미연결/미확인'으로 표시한다. */
export function WeatherBadge({ weather }: { weather: DayWeather }) {
  if (weather.source === "none") {
    return (
      <div className="weather">
        <Icon name="sun" />
        <span className="muted">날씨 데이터 미연결</span>
        <span className="faint xs">최저/최고 · 강우 · 강풍 미확인</span>
        <span style={{ marginLeft: "auto" }}><PremiumBadge /></span>
      </div>
    );
  }
  const rainy = weather.rain === "high" || weather.rain === "mid";
  return (
    <div className={`weather ${rainy ? "rain" : ""}`}>
      <Icon name={rainy ? "rain" : "sun"} />
      <b>{weather.min !== null && weather.max !== null ? `${weather.min}° / ${weather.max}°` : "기온 미확인"}</b>
      <span>{weather.rain ? RAIN[weather.rain] : "강수 미확인"}</span>
      <span>·</span>
      <span>{weather.wind ? WIND[weather.wind] : "강풍 미확인"}</span>
      {weather.source === "demo-simulation" && <span style={{ marginLeft: "auto" }}><DemoBadge label="DEMO 시뮬레이션" /></span>}
    </div>
  );
}
