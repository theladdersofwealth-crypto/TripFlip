"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { STORAGE_FAIL_EVENT } from "@/lib/flow";
import { trackPage } from "@/lib/analytics";
import { AUTH_EVENT, SIGNUP_LATER_KEY, loadAuth, refreshAuth } from "@/lib/account";
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
  useEffect(() => {
    const on = () => setNick(loadAuth()?.nick ?? null);
    on();
    refreshAuth();
    window.addEventListener(AUTH_EVENT, on);
    return () => window.removeEventListener(AUTH_EVENT, on);
  }, []);
  useEffect(() => {
    if (path.startsWith("/admin") || path.startsWith("/account") || navigator.webdriver || loadAuth()) { setAskSignup(false); return; }
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
          <p><b>이 브라우저에 저장하지 못했어요.</b> 지금 입력한 내용은 이 창에서 그대로 쓰지만, 새로고침하거나 창을 닫으면 사라져요. 예약 단계의 ‘계획 파일 내려받기’로 보관해 주세요.</p>
          <button type="button" className="icon-btn" aria-label="안내 닫기" onClick={() => setSaveFailed(false)}>×</button>
        </div>
      )}
      {children}
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
            <p className="small">닉네임·생년월일·성별과 PIN 6자리면 끝이에요. 가입 없이도 추천과 예약은 그대로 쓸 수 있어요.</p>
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

export function BackButton({ href, label = "뒤로" }: { href?: string; label?: string }) {
  if (href) return <Link href={href} className="back-btn"><Icon name="back" />{label}</Link>;
  return <button className="back-btn" onClick={() => history.back()}><Icon name="back" />{label}</button>;
}
