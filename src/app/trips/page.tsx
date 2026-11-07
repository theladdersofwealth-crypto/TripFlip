"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { DemoBadge, Empty, FreeBadge, Sheet } from "@/components/ui";
import { getDestination } from "@/data/repository";
import { useTripStore, FREE_TRIP_LIMIT } from "@/store/TripStore";
import { formatKDate } from "@/lib/time";

export default function TripsPage() {
  const { trips, deleteTrip, destinationFavorites, ready, showToast } = useTripStore();
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!ready) return null;
  const target = trips.find((t) => t.id === confirm);

  return (
    <main className="container page" style={{ maxWidth: 760 }}>
      <div className="between" style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>내 여행</h1>
        <span className="row small muted"><FreeBadge />{trips.length}/{FREE_TRIP_LIMIT}개 저장</span>
      </div>

      {trips.length === 0 ? (
        <Empty
          icon="suitcase"
          title="아직 저장된 여행이 없어요"
          desc="조건을 입력하고 여행지를 고르면 일정이 자동으로 만들어져요."
          action={<div className="row"><Link href="/plan" className="btn btn-primary">여행지 찾아보기</Link><Link href="/" className="btn">Demo 보기</Link></div>}
        />
      ) : (
        <div className="stack">
          {trips.map((t) => {
            const places = t.days.reduce((s, d) => s + d.items.filter((i) => i.type === "place").length, 0);
            return (
              <div key={t.id} className="card row" style={{ alignItems: "stretch" }}>
                <Link href={`/trip/${t.id}`} className="grow stack" style={{ gap: 4 }}>
                  <div className="row"><b style={{ fontSize: 18 }}>{t.title}</b>{t.demo && <DemoBadge />}</div>
                  <div className="small muted">{formatKDate(t.dates.start, false)} – {formatKDate(t.dates.end, false)} · 방문지 {places}곳 · 즐겨찾기 {t.favorites.length}</div>
                  <div className="xs faint">마지막 수정 {new Date(t.updatedAt).toLocaleString("ko-KR")}</div>
                </Link>
                <button className="icon-btn" aria-label="여행 삭제" onClick={() => setConfirm(t.id)}><Icon name="trash" /></button>
              </div>
            );
          })}
          {trips.length >= FREE_TRIP_LIMIT && (
            <div className="banner banner-warn small">
              Free 플랜 저장 한도({FREE_TRIP_LIMIT}개)에 도달했어요. 새 여행을 만들려면 하나를 삭제하거나 <Link href="/premium" className="bold">Premium(무제한 저장)</Link>을 확인해 주세요.
            </div>
          )}
        </div>
      )}

      {destinationFavorites.length > 0 && (
        <section className="stack" style={{ marginTop: 28 }}>
          <h2 className="section-title">즐겨찾기한 여행지</h2>
          <div className="row-wrap" style={{ gap: 8 }}>
            {destinationFavorites.map((id) => {
              const d = getDestination(id);
              return d ? <Link key={id} href={`/discover?d=${id}`} className="toggle-chip" style={{ display: "inline-flex", alignItems: "center" }}>★ {d.name}</Link> : null;
            })}
          </div>
        </section>
      )}

      <Sheet open={!!target} onClose={() => setConfirm(null)} title="여행을 삭제할까요?">
        <div className="stack">
          <p className="muted">‘{target?.title}’과 수정한 일정이 이 기기에서 삭제돼요.</p>
          <div className="grid-2">
            <button className="btn" onClick={() => setConfirm(null)}>취소</button>
            <button className="btn btn-primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => { deleteTrip(confirm!); setConfirm(null); showToast("여행을 삭제했어요"); }}>삭제</button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
