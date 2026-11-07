import type { SavedPlan } from "@/lib/flow";

/** 서버나 유료 PDF 서비스 없이 일정 전체를 보관한다. */
export function downloadPlan(plan: SavedPlan) {
  const blob = new Blob([JSON.stringify({ format: "tripflip-plan", version: 2, plan }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `TripFlip-${plan.regionId}-${plan.query.startDate}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
