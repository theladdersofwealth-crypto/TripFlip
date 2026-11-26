"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NEXT_KEY } from "@/components/AppShell";
import { AUTH_EVENT, loadAuth, logout, startSocial, finishSocial, SOCIAL_PROVIDERS } from "@/lib/account";
import type { Auth, SocialIntent, SocialProvider } from "@/lib/account";
import { syncPlans } from "@/lib/planSync";

const names = { google: "구글", kakao: "카카오", naver: "네이버" };
export default function AccountPage() {
  const [auth, setAuth] = useState<Auth | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const outcome = new URLSearchParams(location.search).get("oauth");
    let completing = outcome != null;
    const on = () => {
      const a = loadAuth();
      setAuth(a);
      if (a && !completing) {
        let next: string | null = null;
        try { next = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); } catch {}
        if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) router.replace(next);
      }
    };
    on();
    window.addEventListener(AUTH_EVENT, on);
    if (outcome != null) {
      history.replaceState(history.state, "", location.pathname + location.hash);
      setBusy(true);
      void finishSocial(outcome).then(r => {
        completing = false;
        setBusy(false);
        if (!r.ok) setError(r.error ?? "인증에 실패했어요.");
        on();
      });
    }
    return () => window.removeEventListener(AUTH_EVENT, on);
  }, [router]);
  if (auth === undefined) return null;
  if (busy) return <main className="container page" style={{ maxWidth: 420 }} aria-busy="true"><p role="status" className="small muted">소셜 인증 확인 중…</p></main>;
  return <main className="container page" style={{ maxWidth: 420 }}>
    <h1 style={{ fontSize: 22, fontWeight: 900 }}>{auth ? "내 계정" : "가입 · 로그인"}</h1>
    {error && <p role="alert" className="small" style={{ color: "var(--danger)" }}>{error}</p>}
    {auth ? <>
      <div className="card-soft stack" style={{ marginTop: 16 }}>
        <p><b>{auth.nick}</b> 님으로 로그인 중이에요.</p>
        <Link href="/" className="btn btn-primary btn-block">여행지 추천 받기</Link>
        <Link href="/my-trips" className="btn btn-block">내 여행 (계정에 저장됨)</Link>
        <button className="btn btn-block" onClick={() => logout(syncPlans)}>로그아웃</button>
      </div>
      {withdraw ? <section className="card-soft stack" style={{ marginTop: 20 }}>
        <b>회원 탈퇴</b><p className="small">계정과 저장한 여행, 이용 기록이 삭제돼요. 연결된 소셜 계정으로 다시 인증해 주세요.</p>
        <SocialButtons intent="withdraw" />
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setWithdraw(false)}>취소</button>
      </section> : <button type="button" className="btn btn-ghost btn-block xs" style={{ marginTop: 20 }} onClick={() => setWithdraw(true)}>회원 탈퇴</button>}
    </> : <>
      <p className="small muted" style={{ marginTop: 10 }}>소셜 계정으로 가입하고 여행 계획을 저장해 보세요.</p>
      <SocialButtons intent="login" />
      <Link href="/" className="btn btn-ghost btn-block" style={{ marginTop: 12 }}>첫 화면으로</Link>
    </>}
  </main>;
}
function SocialButtons({ intent }: { intent: SocialIntent }) {
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState("");
  const go = async (provider: SocialProvider) => {
    if (!agree || pending) return;
    setPending(provider); setError("");
    const result = await startSocial(provider, intent, agree);
    if (!result.ok) { setPending(null); setError(result.error ?? "인증에 실패했어요."); }
  };
  return <div className="stack" style={{ marginTop: 16 }}>
    <label className="check-row consent-row small">
      <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
      <span>{intent === "withdraw" ? "계정 및 저장한 모든 여행·이용 기록 삭제에 동의해요." : <>만 14세 이상이며 <Link href="/legal/terms" target="_blank" rel="noopener">이용약관</Link> 및 <Link href="/legal/privacy" target="_blank" rel="noopener">개인정보처리방침</Link>에 동의해요.</>}</span>
    </label>
    {SOCIAL_PROVIDERS.map(p => <button type="button" key={p} className="btn btn-block" disabled={!agree || pending !== null}
      style={p === "kakao" ? {background:"#FEE500",color:"#191919",borderColor:"#FEE500"} : p === "naver" ? {background:"#03C75A",color:"#fff",borderColor:"#03C75A"} : undefined}
      onClick={() => void go(p)}>{pending === p ? "연결 중…" : names[p] + (intent === "withdraw" ? "로 확인하고 탈퇴" : "로 계속하기")}</button>)}
    {error && <p role="alert" className="small" style={{ color: "var(--danger)" }}>{error}</p>}
  </div>;
}
