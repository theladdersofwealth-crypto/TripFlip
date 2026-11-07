"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty } from "@/components/ui";
import { loadLegacyTrips, loadPlans, parsePlanFile, removePlan, savePlan } from "@/lib/flow";
import type { LegacyTrip, SavedPlan } from "@/lib/flow";
import { fmtDate } from "@/services/itineraryV1";
import { tripDays } from "@/services/regionScore";
import { downloadPlan } from "@/lib/planDownload";

export default function MyTripsPage() {
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [legacy, setLegacy] = useState<LegacyTrip[]>([]);
  const [preview, setPreview] = useState<{ plan: SavedPlan; exists: boolean } | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setPlans(loadPlans()); setLegacy(loadLegacyTrips()); }, []);
  if (!plans) return null;

  const pick = async (f: File | undefined) => {
    setImportMsg(null); setPreview(null);
    if (!f) return;
    const r = parsePlanFile(await f.text());
    if ("error" in r) { setImportMsg(r.error); return; }
    setPreview({ plan: r.plan, exists: plans.some((p) => p.id === r.plan.id) });
  };
  const restore = (asCopy: boolean) => {
    if (!preview) return;
    const plan = asCopy ? { ...preview.plan, id: crypto.randomUUID(), createdAt: new Date().toISOString() } : preview.plan;
    const ok = savePlan(plan);
    setPlans(loadPlans());
    setPreview(null);
    setImportMsg(ok ? `${plan.regionName} 계획을 불러왔어요.` : "불러왔지만 이 브라우저에 저장하지 못했어요. 새로고침 전에 다시 파일로 보관해 주세요.");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <main className="container page" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>내 여행</h1>
      <p className="xs muted">이 기기·브라우저에 저장돼요. 다른 기기에서 보관하려면 계획 파일을 내려받아 주세요.</p>
      <div className="card-soft stack" style={{ marginTop: 12, gap: 8 }}>
        <div className="between"><b className="small">계획 파일 불러오기</b><button className="btn btn-sm" onClick={() => fileRef.current?.click()}>파일 선택</button></div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <p className="xs muted">다른 기기·주소에서 내려받은 계획 파일(.json)을 이 브라우저로 옮겨요. 확인 전에는 저장하지 않아요.</p>
        {importMsg && <p className="xs" role="status">{importMsg}</p>}
        {preview && (() => { const d = tripDays(preview.plan.query.startDate, preview.plan.query.endDate); return (
          <div className="card stack restore-preview" style={{ gap: 6 }}>
            <b>{preview.plan.regionName}</b>
            <span className="small muted">{fmtDate(preview.plan.query.startDate)} ~ {fmtDate(preview.plan.query.endDate)} · {d - 1}박 {d}일 · 일정 {preview.plan.board ? "포함" : "없음"} · 시간 설정 {preview.plan.prefs ? "포함" : "기본값"}</span>
            {preview.exists && <p className="xs form-error">같은 계획이 이미 있어요. 덮어쓰지 않으려면 ‘사본으로 추가’를 고르세요.</p>}
            <div className="row-wrap">
              {preview.exists ? <><button className="btn btn-sm btn-primary" onClick={() => restore(true)}>사본으로 추가</button><button className="btn btn-sm" onClick={() => restore(false)}>기존 계획 덮어쓰기</button></> : <button className="btn btn-sm btn-primary" onClick={() => restore(false)}>내 여행에 추가</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}>취소</button>
            </div>
          </div>
        ); })()}
      </div>
      {plans.length === 0 ? (legacy.length ? null : 
        <Empty icon="suitcase" title="아직 저장된 여행이 없어요" desc="추천받은 지역을 예약하고 저장하면 여기에 모여요." action={<Link href="/" className="btn btn-primary">여행지 추천받기</Link>} />
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {plans.map((p) => {
            const d = tripDays(p.query.startDate, p.query.endDate);
            return (
              <div key={p.id} className="card stack" style={{ gap: 10 }}>
                <Link href={`/r/${p.regionId}?plan=${p.id}`} className="between">
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 800 }}>{p.regionName}</div>
                    <div className="small muted">{fmtDate(p.query.startDate)} ~ {fmtDate(p.query.endDate)} · {d - 1}박 {d}일 · {p.query.adults + p.query.children.length}명</div>
                  </div>
                  <Icon name="next" />
                </Link>
                <div className="row-wrap">
                  <span className={`badge ${p.booked.flight ? "badge-ok" : "badge-muted"}`}>항공 {p.booked.flight ? "예약 완료" : "미예약"}</span>
                  <span className={`badge ${p.booked.hotel ? "badge-ok" : "badge-muted"}`}>숙소 {p.booked.hotel ? "예약 완료" : "미예약"}</span>
                  <span className="badge badge-muted">추천 {Math.round(p.display)}점</span>
                </div>
                <div className="between"><button className="btn btn-sm" onClick={() => downloadPlan(p)}>계획 파일 내려받기</button><button className="btn btn-sm btn-ghost" onClick={() => { removePlan(p.id); setPlans(loadPlans()); }}>삭제</button></div>
              </div>
            );
          })}
        </div>
      )}
      {legacy.length > 0 && (
        <section className="stack" style={{ marginTop: 20, gap: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>이전 형식으로 만든 계획</h2>
          <p className="xs muted">예전 화면에서 만든 계획이에요. 원본 그대로 두고 예전 편집기로 열어요.</p>
          {legacy.map((t) => <Link key={t.id} href={`/trip/${t.id}`} className="card-soft between"><span className="small"><b>{t.title}</b>{t.createdAt && <span className="xs muted" style={{ display: "block" }}>만든 날 {String(t.createdAt).slice(0, 10)}</span>}</span><Icon name="next" size={16} /></Link>)}
        </section>
      )}
    </main>
  );
}
