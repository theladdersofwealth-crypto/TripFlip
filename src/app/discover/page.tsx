"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DestinationCard } from "@/components/DestinationCard";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui";
import { discoverDestinations } from "@/services/discovery";
import { useTripStore } from "@/store/TripStore";
import { PREF_LABEL, BUDGET } from "@/lib/labels";

function DiscoverInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { conditions, destinationFavorites, toggleDestinationFavorite, ready } = useTripStore();
  const results = useMemo(() => discoverDestinations(conditions), [conditions]);
  const [idx, setIdx] = useState(0);
  const [notReady, setNotReady] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const d = params.get("d");
    if (d) {
      const i = results.findIndex((r) => r.destination.id === d);
      if (i >= 0) setIdx(i);
    }
  }, [params, results]);

  if (!ready) return null;
  const cur = results[idx];
  const go = (n: number) => setIdx((i) => (i + n + results.length) % results.length);
  const select = (id: string) => {
    const r = results.find((x) => x.destination.id === id)!;
    if (r.destination.hasItineraryData) router.push(`/create/${id}`);
    else setNotReady(r.destination.name);
  };

  return (
    <>
      <div className="between" style={{ marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>여행지 발견</h1>
          <p className="small muted">카드를 넘기며 하나씩 살펴보세요</p>
        </div>
        <Link href="/plan" className="btn btn-sm">조건 수정</Link>
      </div>

      {conditions ? (
        <div className="row-wrap" style={{ marginBottom: 14 }}>
          <span className="chip"><Icon name="users" />성인 {conditions.party.adults}{conditions.party.children ? ` · 어린이 ${conditions.party.children}` : ""}</span>
          <span className="chip">{BUDGET[conditions.budget].label}</span>
          {conditions.prefs.slice(0, 4).map((p) => <span key={p} className="chip">{PREF_LABEL[p]}</span>)}
        </div>
      ) : (
        <div className="banner banner-info small" style={{ marginBottom: 14 }}>
          <span>여행 조건을 입력하면 내 조건과 맞는 점을 함께 보여드려요.</span>
          <Link href="/plan" className="btn btn-sm btn-primary" style={{ alignSelf: "flex-start" }}>조건 입력하기</Link>
        </div>
      )}

      <div className="discover-layout">
        <div>
          <div
            key={cur.destination.id}
            className="flip-anim"
            onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
              touchX.current = null;
            }}
          >
            <DestinationCard
              result={cur}
              favorite={destinationFavorites.includes(cur.destination.id)}
              onFavorite={() => toggleDestinationFavorite(cur.destination.id)}
              onSelect={() => select(cur.destination.id)}
            />
          </div>
          <div className="flip-nav">
            <button className="icon-btn" onClick={() => go(-1)} aria-label="이전 여행지"><Icon name="back" /></button>
            <div className="progress-dots">{results.map((r, i) => <i key={r.destination.id} className={i === idx ? "on" : ""} />)}</div>
            <button className="btn btn-soft" onClick={() => go(1)}>다음 여행지<Icon name="next" /></button>
          </div>
        </div>

        <aside className="stack desktop-flex">
          <h2 className="section-title">후보 여행지</h2>
          {results.map((r, i) => (
            <button key={r.destination.id} className="list-btn" style={i === idx ? { borderColor: "var(--navy)" } : undefined} onClick={() => setIdx(i)}>
              <div className="grow">
                <div className="bold">{r.destination.name} <span className="muted small">· {r.destination.country}</span></div>
                <div className="small muted">{r.destination.reason}</div>
              </div>
              {r.destination.hasItineraryData ? <span className="badge badge-ok">일정 지원</span> : <span className="badge badge-muted">준비중</span>}
            </button>
          ))}
        </aside>
      </div>

      <Sheet open={!!notReady} onClose={() => setNotReady(null)} title={`${notReady ?? ""} 일정 데이터 준비중`}>
        <div className="stack">
          <p className="muted">이 여행지는 아직 방문지·음식점 데이터가 없어서 자동 일정을 만들 수 없어요. 데이터 없이 일정을 지어내지 않아요.</p>
          <p className="small">현재 MVP는 <b>나트랑</b>만 DEMO 데이터로 일정 생성을 지원해요.</p>
          <button className="btn btn-primary btn-block" onClick={() => router.push("/create/nha-trang")}>나트랑으로 일정 만들기</button>
          <button className="btn btn-block" onClick={() => setNotReady(null)}>다른 여행지 보기</button>
        </div>
      </Sheet>
    </>
  );
}

export default function DiscoverPage() {
  return (
    <main className="container page">
      <Suspense>
        <DiscoverInner />
      </Suspense>
    </main>
  );
}
