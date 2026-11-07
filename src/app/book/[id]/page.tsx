// 정적 내보내기(Cloudflare Pages)용: 미리 만들 주소 목록. 화면은 client.tsx.
import { Suspense } from "react";
import { ALL_REGIONS } from "@/services/regionScore";
import Client from "./client";

export function generateStaticParams() {
  return ALL_REGIONS.map((r) => ({ id: r.id }));
}

export default function Page() {
  return <Suspense><Client /></Suspense>;
}
