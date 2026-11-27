import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ALL_REGIONS, PILOT_TWIN_OF, scoreRegions } from "../src/services/regionScore";
import type { RegionQuery } from "../src/services/regionScore";
import { WORLD_WEATHER, WORLD_WEATHER_SOURCE } from "../src/data/worldWeather";
import { WORLD_REGIONS } from "../src/data/worldV1";

test("all 358 destinations use twelve valid five-year climate records", () => {
  assert.deepEqual(Object.keys(WORLD_WEATHER).sort(), WORLD_REGIONS.map(r => r.id).sort());
  assert.equal(ALL_REGIONS.length, 358);
  const ids = new Set(ALL_REGIONS.map(r => PILOT_TWIN_OF[r.id] ?? r.id));
  assert.deepEqual([...ids].sort(), Object.keys(WORLD_WEATHER).sort());
  for (const id of ids) {
    const months = WORLD_WEATHER[id];
    assert.deepEqual(Object.keys(months).map(Number), Array.from({ length: 12 }, (_, i) => i + 1), id);
    for (const [month, value] of Object.entries(months)) {
      const days = new Date(2024, Number(month), 0).getDate();
      assert.ok(Number.isFinite(value.tmean) && value.tmean <= value.tmax + 0.1, id);
      assert.ok(Number.isFinite(value.precipMm) && value.precipMm >= 0, id);
      assert.ok(Number.isFinite(value.snowWaterMm) && value.snowWaterMm >= 0, id);
      assert.ok(Number.isFinite(value.rainDays) && value.rainDays >= 0 && value.rainDays <= days, id);
      assert.ok(value.sunHours === null || (Number.isFinite(value.sunHours) && value.sunHours >= 0 && value.sunHours <= days * 24), id);
    }
  }
});

test("scoring resolves new and pilot destinations through the same five-year source in every month", () => {
  for (let month = 1; month <= 12; month++) {
    const prefix = `2027-${String(month).padStart(2,"0")}`;
    const q: RegionQuery = {
      startDate: `${prefix}-10`, endDate: `${prefix}-15`, adults: 2, children: [],
      elders: false, pet: false, main: "관광", subs: [], interests: ["관광"],
      perDay: 2, price: "상관없음", stay: "가심비",
    };
    const rows = scoreRegions(q);
    assert.equal(rows.length, 358);
    for (const r of rows) {
      const expected = WORLD_WEATHER[PILOT_TWIN_OF[r.region.id] ?? r.region.id][month];
      assert.equal(r.weather.source, WORLD_WEATHER_SOURCE, r.region.id);
      assert.equal(r.weather.tmean, expected.tmean, r.region.id);
      assert.equal(r.weather.tmax, expected.tmax, r.region.id);
      assert.equal(r.weather.precipMm, expected.precipMm, r.region.id);
      assert.equal(r.weather.snowWaterMm, expected.snowWaterMm, r.region.id);
      assert.equal(r.weather.rainDays, expected.rainDays, r.region.id);
    }
    for (const id of ["pol-gdansk", "pol-krakow", "slo-bratislava", "OS", "HK", "NT", "DN", "PQ"]) {
      const region = rows.find(r => r.region.id === id)!;
      assert.notEqual(region.weather.judge, "미확인", id);
    }
  }
});
