"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadAuth } from "@/lib/account";
import { memberUsage, USAGE_CHANGED } from "@/lib/memberUsage";

export function MemberUsagePreference({ token }: { token: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void memberUsage(token, "status").then((r) => { if (active && r.ok) setEnabled(r.enabled === true); });
    return () => { active = false; };
  }, [token]);

  if (enabled === null) return null;
  return <section className="card-soft stack" style={{ marginTop: 16 }}>
    <b>이용 분석 참여 (선택)</b>
    <p className="small muted">동의한 뒤의 로그인·접속 시각, 버튼 클릭, 앱에서 활동한 시간, 여행 저장, 제휴 링크 클릭을 계정 기준으로 최대 90일 기록해요. 앱 개선에만 쓰며 참여하지 않아도 모든 기존 기능을 쓸 수 있어요.</p>
    <p className="small"><Link href="/legal/privacy">개인정보처리방침</Link></p>
    <button type="button" className="btn" disabled={busy} onClick={async () => {
      setBusy(true);
      setError(false);
      const result = await memberUsage(token, enabled ? "revoke" : "consent");
      if (loadAuth()?.token !== token) return;
      if (result.ok) {
        setEnabled(result.enabled === true);
        window.dispatchEvent(new Event(USAGE_CHANGED));
      } else setError(true);
      setBusy(false);
    }}>{enabled ? "참여 철회 및 분석 기록 삭제" : "동의하고 참여하기"}</button>
    {error && <p role="alert" className="small">설정을 저장하지 못했어요. 다시 시도해 주세요.</p>}
  </section>;
}
