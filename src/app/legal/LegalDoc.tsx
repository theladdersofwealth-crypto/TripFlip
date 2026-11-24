import Link from "next/link";
import { LEGAL_EFFECTIVE } from "@/lib/legal";

export function LegalDoc({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="container page legal" style={{ maxWidth: 680 }}>
    <h1 style={{ fontSize: 22, fontWeight: 900 }}>{title}</h1>
    <p className="xs faint" style={{ marginTop: 4 }}>시행일: {LEGAL_EFFECTIVE}</p>
    {children}
    <p className="xs" style={{ marginTop: 24 }}><Link href="/legal/privacy">개인정보처리방침</Link> · <Link href="/legal/terms">이용약관</Link> · <Link href="/">첫 화면</Link></p>
  </main>;
}
