"use client";
import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TripForm } from "@/components/TripForm";
import { BackButton } from "@/components/AppShell";
import { useTripStore } from "@/store/TripStore";
import { defaultConditions } from "@/services/demo";
import type { TripConditions } from "@/lib/types";

function PlanInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { conditions, setConditions, ready } = useTripStore();
  const theme = params.get("theme");

  const initial = useMemo<TripConditions>(() => {
    const base = conditions ?? defaultConditions();
    if (theme === "kids") return { ...base, party: base.party.children ? base.party : { ...base.party, children: 1, childAges: [4] }, prefs: Array.from(new Set([...base.prefs, "kids" as const])) };
    if (theme === "relax") return { ...base, intensity: "relaxed", prefs: Array.from(new Set([...base.prefs, "relax" as const])) };
    if (theme === "food") return { ...base, prefs: Array.from(new Set([...base.prefs, "food" as const])) };
    if (theme === "value") return { ...base, budget: "value" };
    return base;
  }, [conditions, theme]);

  if (!ready) return null;
  return (
    <>
      <BackButton href="/" label="홈" />
      <h1 style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>여행 조건 입력</h1>
      <p className="muted small">입력한 조건은 이 기기에 저장돼요.</p>
      <TripForm
        initial={initial}
        submitLabel="어울리는 여행지 보기"
        onSubmit={(c) => {
          setConditions(c);
          router.push("/discover");
        }}
      />
    </>
  );
}

export default function PlanPage() {
  return (
    <main className="container page" style={{ maxWidth: 640 }}>
      <Suspense>
        <PlanInner />
      </Suspense>
    </main>
  );
}
