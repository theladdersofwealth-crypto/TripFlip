import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TripStoreProvider } from "@/store/TripStore";
import { AppShell } from "@/components/AppShell";

const DESC = "누구와·언제·어떤 여행인지 고르면, 같은 예산으로 생각 못 한 여행지까지 순위로 추천해 드려요.";
export const metadata: Metadata = {
  metadataBase: new URL("https://www.tripflip.co.kr"),
  title: "TripFlip · 트립플립 | 나에게 맞는 여행지 추천",
  description: DESC,
  icons: { apple: "/apple-touch-icon.png" },
  // 카카오톡·문자·SNS 공유 미리보기(11/25)
  openGraph: {
    type: "website",
    siteName: "트립플립 TripFlip",
    locale: "ko_KR",
    url: "/",
    title: "트립플립 | 나에게 맞는 여행지 추천",
    description: DESC,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "트립플립 TripFlip 로고" }],
  },
  twitter: { card: "summary_large_image", title: "트립플립 | 나에게 맞는 여행지 추천", description: DESC, images: ["/og-image.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <TripStoreProvider>
          <AppShell>{children}</AppShell>
        </TripStoreProvider>
      </body>
    </html>
  );
}
