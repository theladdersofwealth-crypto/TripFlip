import assert from "node:assert/strict";
import test from "node:test";
import { APPROVED_RECORDS, applyApprovedFacts } from "../src/data/approvedCatalog";
import { PLACES_V1 } from "../src/data/regionsV1";

test("확인한 무료 기본사실을 붙여도 미평가 등급이나 접근성을 지어내지 않는다", () => {
  const source = APPROVED_RECORDS.find((r) => r.id === "wikidata:Q600269")!;
  assert.equal(source.fields.lat.status, "verified");
  assert.equal(source.fields.grade.value, null);
  const legacy = PLACES_V1.find((p) => p.id === "nt-ponagar")!;
  const merged = applyApprovedFacts(legacy) as typeof legacy & { lat?: number; lon?: number };
  assert.equal(merged.id, legacy.id);
  assert.equal(merged.grade, legacy.grade);
  assert.equal(merged.lat, source.fields.lat.value);
  assert.equal(merged.lon, source.fields.lon.value);
});
