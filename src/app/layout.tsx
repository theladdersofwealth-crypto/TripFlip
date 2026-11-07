import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TripStoreProvider } from "@/store/TripStore";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "TripFlip · 트립플립",
  description: "나에게 맞는 여행을 발견하다",
  icons: { apple: "/apple-touch-icon.png" },
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
