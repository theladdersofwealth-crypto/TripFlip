"use client";
// 간편 가입·로그인: 닉네임·생년월일·성별 + PIN 6자리. 비회원은 추천 결과가 흐리게 보이고, 일정·예약은 회원만.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NEXT_KEY } from "@/components/AppShell";
import { AUTH_EVENT, birthFrom8, loadAuth, login, logout, signup } from "@/lib/account";
import type { Auth } from "@/lib/account";
import { syncPlans } from "@/lib/planSync";

export default function AccountPage() {
  const [auth, setAuth] = useState<Auth | null | undefined>(undefined);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [gate, setGate] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const on = () => {
      const a = loadAuth();
      setAuth(a);
      // 추천 보려다 온 경우: 가입·로그인 끝나면 원래 화면으로
      if (a) { let next: string | null = null; try { next = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); } catch {} if (next && next.startsWith("/")) router.replace(next); }
    };
    on();
    if (location.hash === "#login") setMode("login");
    if (location.hash === "#gate") setGate(true);
    window.addEventListener(AUTH_EVENT, on);
    return () => window.removeEventListener(AUTH_EVENT, on);
  }, [router]);
  if (auth === undefined) return null;

  if (auth) {
    return <main className="container page" style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>내 계정</h1>
      <div className="card-soft stack" style={{ marginTop: 16 }}>
        <p><b>{auth.nick}</b> 님으로 로그인 중이에요.</p>
        <Link href="/" className="btn btn-primary btn-block">여행지 추천 받기</Link>
        <Link href="/my-trips" className="btn btn-block">내 여행 (계정에 저장됨)</Link>
        <button className="btn btn-block" onClick={() => logout(syncPlans)}>로그아웃</button>
      </div>
      <p className="xs faint" style={{ marginTop: 12 }}>저장한 여행은 계정에 보관돼 다른 기기에서 로그인해도 보여요. 로그아웃하면 이 기기 화면에서는 바로 숨겨져요.</p>
      <p className="xs faint" style={{ marginTop: 4 }}>탈퇴(정보 삭제)를 원하시면 관리자에게 닉네임을 알려 주세요.</p>
    </main>;
  }

  return <main className="container page" style={{ maxWidth: 420 }}>
    <h1 style={{ fontSize: 22, fontWeight: 900 }}>{mode === "signup" ? "간편 가입" : "로그인"}</h1>
    {gate && <p className="card-soft small" style={{ marginTop: 10 }}>가입하면 추천 여행지를 볼 수 있어요. 30초면 가입돼요. 가입·로그인하면 보던 화면으로 바로 돌아가요.</p>}
    <div className="seg" role="tablist" style={{ marginTop: 12 }}>
      <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>처음이에요</button>
      <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>계정 있어요</button>
    </div>
    {mode === "signup" ? <SignupForm /> : <LoginForm />}
    <Link href="/" className="btn btn-ghost btn-block" style={{ marginTop: 12 }}>첫 화면으로</Link>
  </main>;
}

const pinOnly = (s: string) => s.replace(/\D/g, "").slice(0, 6);

function PinField({ label, value, onChange, auto }: { label: string; value: string; onChange: (s: string) => void; auto: string }) {
  return <label className="field"><span className="label">{label}</span>
    <input className="input" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete={auto} placeholder="숫자 6자리" value={value} onChange={(e) => onChange(pinOnly(e.target.value))} />
  </label>;
}

function SignupForm() {
  const [nick, setNick] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "">("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const b = birthFrom8(birth);
    if (!/^[가-힣A-Za-z0-9_]{2,12}$/.test(nick.trim())) return setError("닉네임은 한글·영문·숫자 2~12자로 정해 주세요.");
    if (!b) return setError("생년월일 8자리를 확인해 주세요. 예: 19850127");
    if (!gender) return setError("성별을 골라 주세요.");
    if (pin.length !== 6) return setError("PIN은 숫자 6자리예요.");
    if (pin !== pin2) return setError("PIN 확인이 달라요.");
    if (!agree) return setError("개인정보 수집에 동의해 주세요.");
    setBusy(true);
    const r = await signup({ nick: nick.trim(), birth: b, gender, pin, agree });
    setBusy(false);
    if (!r.ok) setError(r.error ?? "가입하지 못했어요.");
  };

  return <form className="stack" style={{ marginTop: 16 }} onSubmit={submit}>
    <label className="field"><span className="label">닉네임</span><input className="input" autoComplete="username" maxLength={12} placeholder="한글·영문·숫자 2~12자" value={nick} onChange={(e) => setNick(e.target.value)} /></label>
    <label className="field"><span className="label">생년월일</span><input className="input" inputMode="numeric" maxLength={8} placeholder="예: 19850127" value={birth} onChange={(e) => setBirth(e.target.value.replace(/\D/g, "").slice(0, 8))} /></label>
    <div className="field"><span className="label">성별</span>
      <div className="seg" role="radiogroup" aria-label="성별">
        {([["M", "남성"], ["F", "여성"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={gender === k} className={gender === k ? "on" : ""} onClick={() => setGender(k)}>{l}</button>)}
      </div>
    </div>
    <PinField label="PIN 6자리" value={pin} onChange={setPin} auto="new-password" />
    <PinField label="PIN 확인" value={pin2} onChange={setPin2} auto="new-password" />
    <label className="check-row consent-row small">
      <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
      <span>(필수) 닉네임·생년월일·성별과 앱 이용 기록(본 화면·권역, 예약 버튼 클릭)을 서비스 개선 통계용으로 모으는 데 동의해요. 탈퇴 요청 시 지웁니다.</span>
    </label>
    <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? "가입 중…" : "가입하기"}</button>
    {error && <p role="alert" className="small" style={{ color: "var(--danger)" }}>{error}</p>}
    <p className="xs faint">PIN은 암호화(해시)해서 저장해요. 5번 틀리면 잠시 잠겨요.</p>
  </form>;
}

function LoginForm() {
  const [nick, setNick] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!nick.trim() || pin.length !== 6) return setError("닉네임과 PIN 6자리를 넣어 주세요.");
    setBusy(true);
    const r = await login(nick.trim(), pin);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "로그인하지 못했어요."); setPin(""); }
  };
  return <form className="stack" style={{ marginTop: 16 }} onSubmit={submit}>
    <label className="field"><span className="label">닉네임</span><input className="input" autoComplete="username" maxLength={12} value={nick} onChange={(e) => setNick(e.target.value)} /></label>
    <PinField label="PIN 6자리" value={pin} onChange={setPin} auto="current-password" />
    <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
    {error && <p role="alert" className="small" style={{ color: "var(--danger)" }}>{error}</p>}
    <p className="xs faint">PIN을 잊으셨으면 관리자에게 닉네임을 알려 주세요.</p>
  </form>;
}
