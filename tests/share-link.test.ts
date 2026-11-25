import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_QUERY } from "../src/lib/flow";
import { decodeShare, encodeShare, shareUrl } from "../src/lib/shareLink";
import type { RegionQuery } from "../src/services/regionScore";

const q: RegionQuery = {
  ...DEFAULT_QUERY,
  startDate: "2027-05-07", endDate: "2027-05-11",
  members: [
    { id: "a", name: "아빠", relationship: "self", age: 40, mobility: "standard", stroller: false, preferences: ["휴양"] },
    { id: "b", name: "준우", relationship: "child", age: 3, mobility: "standard", stroller: true, preferences: [] },
  ],
} as RegionQuery;

test("공유 링크는 조건을 그대로 되살리고 구성원 이름은 빼고 보낸다", () => {
  const s = encodeShare(q);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  const back = decodeShare(s)!;
  assert.ok(back);
  assert.equal(back.startDate, "2027-05-07");
  assert.equal(back.members?.length, 2);
  assert.ok(back.members!.every((m) => m.name === ""));
  assert.ok(!JSON.stringify(back).includes("준우"));
  assert.ok(shareUrl("https://tripflip.co.kr", q).startsWith("https://tripflip.co.kr/results?s="));
});

test("깨진 링크·잘못된 날짜는 null", () => {
  assert.equal(decodeShare("@@@"), null);
  assert.equal(decodeShare(""), null);
  assert.equal(decodeShare(encodeShare({ ...q, startDate: "2027-05-11", endDate: "2027-05-11" })), null);
});
