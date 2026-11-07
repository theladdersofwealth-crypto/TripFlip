"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { DemoBadge, Empty } from "@/components/ui";
import { getDestination, getGeography } from "@/data/repository";
import type { Continent, Country, Subregion, TourismArea } from "@/lib/types";

// Continent → Subregion → Country → Tourism Area (TripFlip Travel Master 구조)
export default function SearchPage() {
  const router = useRouter();
  const geo = getGeography();
  const [q, setQ] = useState("");
  const [cont, setCont] = useState<Continent | null>(null);
  const [sub, setSub] = useState<Subregion | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [area, setArea] = useState<TourismArea | null>(null);

  const allAreas = useMemo(
    () => geo.flatMap((c) => c.subregions.flatMap((s) => s.countries.flatMap((co) => co.areas.map((a) => ({ a, co, s, c }))))),
    [geo],
  );
  const hits = q.trim() ? allAreas.filter(({ a, co }) => [a.name, a.nameEn, co.name, co.nameEn].some((t) => t.toLowerCase().includes(q.trim().toLowerCase()))) : [];

  const pick = (x: (typeof allAreas)[number]) => {
    setCont(x.c); setSub(x.s); setCountry(x.co); setArea(x.a); setQ("");
  };
  const reset = (lvl: number) => {
    if (lvl <= 0) setCont(null);
    if (lvl <= 1) setSub(null);
    if (lvl <= 2) setCountry(null);
    if (lvl <= 3) setArea(null);
  };

  const dest = area?.destinationId ? getDestination(area.destinationId) : undefined;

  return (
    <main className="container page" style={{ maxWidth: 680 }}>
      <BackButton href="/" label="홈" />
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "4px 0 12px" }}>여행지 찾기</h1>

      <label className="row input" style={{ gap: 8 }}>
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="도시·국가 이름 (예: 나트랑, Vietnam)" style={{ border: 0, outline: 0, flex: 1, minHeight: 44, background: "transparent" }} />
      </label>

      {q.trim() ? (
        <div className="stack" style={{ marginTop: 12 }}>
          {hits.length === 0 && <Empty icon="search" title="검색 결과가 없어요" desc="현재 시연용 여행 마스터에 있는 지역만 검색돼요." />}
          {hits.map((h) => (
            <button key={h.a.id} className="list-btn" onClick={() => pick(h)}>
              <div>
                <div className="bold">{h.a.name} <span className="small muted">{h.a.nameEn}</span></div>
                <div className="small muted">{h.c.name} · {h.s.name} · {h.co.name}</div>
              </div>
              <Icon name="next" />
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="crumbs" style={{ margin: "14px 0 10px" }}>
            <button onClick={() => reset(0)}>전체</button>
            {cont && <><span>›</span><button onClick={() => reset(1)}>{cont.name}</button></>}
            {sub && <><span>›</span><button onClick={() => reset(2)}>{sub.name}</button></>}
            {country && <><span>›</span><button onClick={() => reset(3)}>{country.name}</button></>}
            {area && <><span>›</span><span className="bold" style={{ color: "var(--ink)" }}>{area.name}</span></>}
          </div>

          <div className="stack">
            {!cont && geo.map((c) => (
              <button key={c.id} className="list-btn" onClick={() => setCont(c)}>
                <span className="bold">{c.name}</span>
                <span className="row muted small">{c.subregions.length ? `${c.subregions.length}개 권역` : "데이터 준비중"}<Icon name="next" /></span>
              </button>
            ))}
            {cont && !sub && (cont.subregions.length ? cont.subregions.map((s) => (
              <button key={s.id} className="list-btn" onClick={() => setSub(s)}>
                <span className="bold">{s.name}</span>
                <span className="row muted small">{s.countries.length}개 국가<Icon name="next" /></span>
              </button>
            )) : <Empty title={`${cont.name} 데이터 준비중`} desc="여행 마스터 데이터가 연결되면 표시돼요." />)}
            {sub && !country && sub.countries.map((co) => (
              <button key={co.id} className="list-btn" onClick={() => setCountry(co)}>
                <div><span className="bold">{co.name}</span> <span className="small muted">{co.nameEn}</span></div>
                <span className="row muted small">{co.areas.length}개 지역<Icon name="next" /></span>
              </button>
            ))}
            {country && !area && country.areas.map((a) => (
              <button key={a.id} className="list-btn" onClick={() => setArea(a)}>
                <div>
                  <div className="bold">{a.name} <span className="small muted">{a.nameEn}</span></div>
                  {a.administrativeDivision && <div className="small muted">{a.administrativeDivision}</div>}
                </div>
                <Icon name="next" />
              </button>
            ))}
            {area && (
              <div className="card stack">
                <div className="between">
                  <div>
                    <h2 style={{ fontSize: 22 }}>{area.name}</h2>
                    <div className="small muted">{area.nameEn} · {country?.name}</div>
                  </div>
                  <DemoBadge />
                </div>
                <dl className="kv" style={{ margin: 0 }}>
                  <dt>행정구역</dt><dd>{area.administrativeDivision ?? "미확인"}</dd>
                  <dt>포함 범위</dt><dd>{area.geographicCoverage ?? "미확인"}</dd>
                </dl>
                {dest?.reason && <p>{dest.reason}</p>}
                {dest?.hasItineraryData ? (
                  <button className="btn btn-primary btn-lg btn-block" onClick={() => router.push(`/create/${dest.id}`)}>이 지역으로 일정 만들기</button>
                ) : (
                  <div className="banner banner-warn small">방문지·음식점 데이터 준비중이라 자동 일정은 아직 만들 수 없어요. (현재 나트랑만 지원)</div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
