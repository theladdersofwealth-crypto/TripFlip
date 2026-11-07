// 정적 내보내기(Cloudflare Pages)용: 미리 만들 주소 목록. 화면은 client.tsx.
import { Suspense } from "react";
import { DESTINATIONS } from "@/data/destinations";
import Client from "./client";

export function generateStaticParams() {
  return DESTINATIONS.map((d) => ({ dest: d.id }));
}

export default function Page() {
  return <Suspense><Client /></Suspense>;
}
