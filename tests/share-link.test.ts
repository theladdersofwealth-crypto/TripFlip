import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_QUERY } from "../src/lib/flow";
import { decodeShare, encodeShare, shareUrl } from "../src/lib/shareLink";
import type { RegionQuery } from "../src/services/regionScore";

const q: RegionQuery = {
  ...DEFAULT_QUERY,
  startDate: "2027-05-07", endDate: "2027-05-11",
  totalBudgetKrw: 3_456_789,
  members: [
    { id: "a", name: "아빠", relationship: "self", age: 40, mobility: "limited", stroller: false, preferences: ["휴양"] },
    { id: "b", name: "준우", relationship: "child", age: 3, height: 97, mobility: "standard", stroller: true, preferences: ["액티비티"] },
  ],
} as RegionQuery;

const plain = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

test("공유 링크는 순위 계산에 필요한 최소 값만 담는다", () => {
  const s = encodeShare(q);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  const raw = plain(s);
  for (const bad of ["준우", "아빠", "members", "actualAge", "mobility", "stroller", "limited", "97", "relationship"])
    assert.ok(!raw.includes(bad), `링크에 ${bad} 포함`);
  const back = decodeShare(s)!;
  assert.ok(back);
  assert.equal(back.startDate, "2027-05-07");
  assert.equal(back.adults, 1);
  assert.deepEqual(back.children, [{ band: "유아", height: null }]);
  assert.equal(back.totalBudgetKrw, 3_500_000);
  assert.deepEqual(back.interests, ["휴양", "액티비티"]);
  assert.equal(back.members, undefined);
  assert.ok(shareUrl("https://tripflip.co.kr", q).startsWith("https://tripflip.co.kr/results?s="));
});

test("예전 형식 링크(전체 조건)를 열어도 민감 값은 버린다", () => {
  const old = Buffer.from(JSON.stringify({ ...q, children: [{ band: "유아", height: 105, actualAge: 4 }] })).toString("base64url");
  const back = decodeShare(old)!;
  assert.ok(back);
  assert.equal(back.members, undefined);
  assert.ok(!JSON.stringify(back).match(/준우|actualAge|mobility|105/));
});

test("깨진 링크·잘못된 날짜는 null", () => {
  assert.equal(decodeShare("@@@"), null);
  assert.equal(decodeShare(""), null);
  assert.equal(decodeShare(encodeShare({ ...q, startDate: "2027-05-11", endDate: "2027-05-11" })), null);
});


test("선택 지역을 공유하고 중복/미지 ID는 제거한다. 예전 링크는 전체", () => {
  const selected = { ...q, preferredAreas: ["northern-europe", "southeast-asia", "northern-europe", "invalid"] } as RegionQuery;
  assert.deepEqual(decodeShare(encodeShare(selected))?.preferredAreas, ["southeast-asia", "northern-europe"]);
  assert.equal(decodeShare(encodeShare({ ...q, preferredAreas: [] }))?.preferredAreas, undefined);
  assert.equal(decodeShare(encodeShare(q))?.preferredAreas, undefined);
});
