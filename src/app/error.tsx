"use client";
// 화면에서 예상 못 한 오류가 나면 흰 화면 대신 안내 + 다시 시도(11/25)
import Link from "next/link";
import { useEffect } from "react";
import { Empty } from "@/components/ui";
import { CONTACT_EMAIL } from "@/lib/legal";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="container page">
      <Empty
        title="잠시 문제가 생겼어요"
        desc={`다시 시도해도 같으면 ${CONTACT_EMAIL} 로 알려 주세요.`}
        action={<div className="row"><button type="button" className="btn btn-primary" onClick={() => reset()}>다시 시도</button><Link href="/" className="btn">홈으로</Link></div>}
      />
    </main>
  );
}
