import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateFlightHours, scoreRegions } from "../src/services/regionScore";
import { DEFAULT_QUERY } from "../src/lib/flow";

test("비행시간은 거리로 추정하고 좌표가 없으면 null", () => {
  assert.ok(estimateFlightHours("OS")! < 3);
  assert.ok(estimateFlightHours("egy-cairo")! > 10);
  assert.equal(estimateFlightHours("없는권역"), null);
});

test("희망 비행시간을 넘는 곳은 빠지지 않고 맨 뒤로, 이유가 붙는다", () => {
  const q = { ...DEFAULT_QUERY, startDate: "2026-12-20", endDate: "2026-12-23", maxFlightHours: 8 };
  const ranked = scoreRegions(q).filter((r) => r.status === "ranked");
  const cairo = ranked.find((r) => r.region.id === "egy-cairo")!;
  assert.equal(cairo.overFlight, true);
  assert.match(cairo.reasons[0], /희망 비행시간 초과/);
  const firstOver = ranked.findIndex((r) => r.overFlight);
  assert.ok(firstOver > 0 && ranked.slice(firstOver).every((r) => r.overFlight));
  const free = scoreRegions({ ...q, maxFlightHours: null }).filter((r) => r.status === "ranked");
  assert.ok(free.every((r) => !r.overFlight));
});
