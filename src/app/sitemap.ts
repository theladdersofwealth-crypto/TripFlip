import type { MetadataRoute } from "next";

// 정적 내보내기용 sitemap.xml(11/25). 로그인·저장·관리 화면은 빼고 누구나 보는 공개 페이지만 넣는다.
// 도시별 공개 페이지가 생기면 여기에 추가(Pages 파일 2만 개 한도 주의).
export const dynamic = "force-static";
const BASE = "https://www.tripflip.co.kr";
const PUBLIC_PATHS = ["/", "/data-status", "/legal/terms", "/legal/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((p) => ({ url: `${BASE}${p}`, changeFrequency: p === "/" ? "weekly" : "monthly", priority: p === "/" ? 1 : 0.3 }));
}
