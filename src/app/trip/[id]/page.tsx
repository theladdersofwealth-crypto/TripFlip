// 정적 내보내기(Cloudflare Pages)용: 미리 만들 주소 목록. 화면은 client.tsx.
import { Suspense } from "react";

import Client from "./client";

export function generateStaticParams() {
  return [{ id: "_" }] // 저장된 여행 id는 미리 알 수 없어 껍데기 1개만 만든다. Cloudflare _redirects가 /trip/* 를 여기로 보낸다;
}

export default function Page() {
  return <Suspense><Client /></Suspense>;
}
