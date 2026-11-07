// 날씨 Provider 계층.
// MVP 에는 Weather API 가 연결되어 있지 않다. 가짜 날씨를 만들지 않고 source:"none" 으로 반환한다.
// 실제 API 를 붙일 때는 WeatherProvider 를 구현해 setWeatherProvider 로 교체한다.
import type { DayWeather } from "@/lib/types";

export interface WeatherProvider {
  getDaily(destinationId: string, date: string): DayWeather;
}

export const EMPTY_WEATHER: DayWeather = { min: null, max: null, rain: null, wind: null, source: "none" };

const noneProvider: WeatherProvider = {
  getDaily: () => ({ ...EMPTY_WEATHER }),
};

let provider: WeatherProvider = noneProvider;

export function setWeatherProvider(p: WeatherProvider) {
  provider = p;
}

export function getDailyWeather(destinationId: string, date: string): DayWeather {
  return provider.getDaily(destinationId, date);
}

/** UI 시연용: 사용자가 'DEMO 비 예보 시뮬레이션'을 켰을 때만 쓰는 값 (기온은 만들지 않는다) */
export const DEMO_RAIN_SIMULATION: DayWeather = { min: null, max: null, rain: "high", wind: null, source: "demo-simulation" };

export const isRainy = (w: DayWeather) => w.rain === "high" || w.rain === "mid";
