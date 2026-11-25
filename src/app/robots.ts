import type { MetadataRoute } from "next";

// 정적 내보내기용 robots.txt(11/25). 개인 화면·관리 화면은 검색에서 뺀다.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/my-trips", "/book/", "/trip/"] }],
    sitemap: "https://www.tripflip.co.kr/sitemap.xml",
    host: "https://www.tripflip.co.kr",
  };
}
