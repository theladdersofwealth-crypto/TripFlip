"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { STORAGE_FAIL_EVENT } from "@/lib/flow";
import { trackPage } from "@/lib/analytics";
import { AUTH_EVENT, SIGNUP_LATER_KEY, loadAuth, refreshAuth } from "@/lib/account";
import { PLANS_CHANGED_EVENT } from "@/lib/flow";
import { syncPlans } from "@/lib/planSync";
import { Icon } from "./Icon";
import { useTripStore } from "@/store/TripStore";

const NAV = [
  { href: "/", label: "여행지 추천", icon: "plane" },
  { href: "/my-trips", label: "내 여행", icon: "suitcase" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { toast } = useTripStore();
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    const on = () => setSaveFailed(true);
    window.addEventListener(STORAGE_FAIL_EVENT, on);
    return () => window.removeEventListener(STORAGE_FAIL_EVENT, on);
  }, []);
  useEffect(() => { trackPage(path); }, [path]);
  // 간편 회원: 로그인 닉네임 표시 + 첫 방문 때 한 번 가입 권유(건너뛰기 가능)
  const [nick, setNick] = useState<string | null>(null);
  const [askSignup, setAskSignup] = useState(false);
  // 권역 일정·예약 화면은 회원만(형님 결정 11/24). 추천 결과(/results)는 비회원에게 흐리게 보여 주고 가입 안내(결과 화면에서 처리)
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const blocked = ready && membersOnly(path) && !nick;
  const hide = membersOnly(path) && (!ready || !nick);
  useEffect(() => {
    if (!blocked) return;
    try { sessionStorage.setItem(NEXT_KEY, path + location.search); } catch {}
    router.replace("/account#gate");
  }, [blocked, path, router]);

  useEffect(() => {
    // 로그인·계정 전환, 여행 저장·삭제, 인터넷 다시 연결 때 그 계정과 맞춘다(비회원 여행은 자동으로 올리지 않음)
    const on = () => { setNick(loadAuth()?.nick ?? null); if (loadAuth()) void syncPlans(); };
    const onPlans = () => { if (loadAuth()) void syncPlans(); };
    setNick(loadAuth()?.nick ?? null);
    setReady(true);
    refreshAuth().then(() => { if (loadAuth()) void syncPlans(); });
    window.addEventListener(AUTH_EVENT, on);
    window.addEventListener(PLANS_CHANGED_EVENT, onPlans);
    window.addEventListener("online", onPlans);
    return () => { window.removeEventListener(AUTH_EVENT, on); window.removeEventListener(PLANS_CHANGED_EVENT, onPlans); window.removeEventListener("online", onPlans); };
  }, []);
  useEffect(() => {
    if (path.startsWith("/admin") || path.startsWith("/account") || path.startsWith("/legal") || navigator.webdriver || loadAuth()) { setAskSignup(false); return; }
    let later = false;
    try { later = localStorage.getItem(SIGNUP_LATER_KEY) === "1"; } catch { later = true; }
    if (!later) setAskSignup(true);
  }, [path]);
  const signupLater = () => {
    try { localStorage.setItem(SIGNUP_LATER_KEY, "1"); } catch {}
    setAskSignup(false);
  };
  const isActive = (href: string) => (href === "/" ? !path.startsWith("/my-trips") : path.startsWith(href));
  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="header-logo" aria-label="TripFlip 홈">
            {/* 제공된 공식 로고 원본 이미지 사용 */}
            <img src="/logo-full.png" alt="TripFlip 트립플립" />
          </Link>
          <div className="header-right">
            <nav className="header-nav">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={isActive(n.href) ? "active" : ""}>{n.label}</Link>
              ))}
            </nav>
            {!path.startsWith("/admin") && <Link href="/account" className="header-account">{nick ? `${nick} 님` : "로그인"}</Link>}
          </div>
        </div>
      </header>
      {saveFailed && (
        <div className="save-warning" role="alert">
          <p><b>이 브라우저에 저장하지 못했어요.</b> 지금 입력한 내용은 이 창에서 그대로 쓰지만, 새로고침하거나 창을 닫으면 사라져요. 로그인하면 저장할 때 계정에 보관돼요.</p>
          <button type="button" className="icon-btn" aria-label="안내 닫기" onClick={() => setSaveFailed(false)}>×</button>
        </div>
      )}
      {hide ? <main className="container page"><p className="muted small">{ready ? "회원만 볼 수 있어요. 로그인 화면으로 이동해요…" : "불러오는 중…"}</p></main> : children}
      {!path.startsWith("/admin") && <footer className="site-footer"><Link href="/legal/terms">이용약관</Link>·<Link href="/legal/privacy"><b>개인정보처리방침</b></Link></footer>}
      <nav className="bottom-nav" aria-label="주요 메뉴">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={isActive(n.href) ? "active" : ""}>
            <Icon name={n.icon} />
            {n.label}
          </Link>
        ))}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
      {askSignup && (
        <div className="center-modal-back" role="dialog" aria-modal="true" aria-label="간편 가입 안내">
          <div className="center-modal">
            <div className="center-modal-head"><h3>30초 간편 가입</h3></div>
            <p className="small">닉네임·생년월일·성별과 PIN 6자리면 끝이에요. 가입하면 추천 여행지를 바로 볼 수 있어요.</p>
            <div className="center-modal-foot">
              <Link href="/account" className="btn btn-primary btn-block" onClick={signupLater}>가입하기</Link>
              <Link href="/account#login" className="btn btn-block" onClick={signupLater}>이미 계정이 있어요</Link>
              <button type="button" className="btn btn-ghost btn-block" onClick={signupLater}>나중에 할게요</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const NEXT_KEY = "tripflip:after-login";
/** 회원 전용 화면: 권역 일정·일차·예약 비교(추천 결과는 비회원에게 흐리게 보여 줌) */
export const membersOnly = (path: string) => /^\/(r|book)(\/|$)/.test(path);

export function BackButton({ href, label = "뒤로" }: { href?: string; label?: string }) {
  if (href) return <Link href={href} className="back-btn"><Icon name="back" />{label}</Link>;
  return <button className="back-btn" onClick={() => history.back()}><Icon name="back" />{label}</button>;
}
