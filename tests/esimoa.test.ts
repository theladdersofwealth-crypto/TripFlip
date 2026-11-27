import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ESIMOA_REF, esimoaPlansLink } from "../src/services/esimoa";

test("이심모아 국가 링크는 파트너 코드만 보내고 회원 또는 여행 데이터를 보내지 않는다", () => {
  for (const [country, code] of [["베트남", "vn"], ["일본", "jp"], ["태국", "th"], ["미국", "us"], ["괌(미국령)", "gu"], ["홍콩", "hk"], ["마카오", "mo"]]) {
    const link = esimoaPlansLink(country);
    const dest = new URL(link.href);
    assert.equal(dest.origin, "https://www.esimoa.com");
    assert.equal(dest.pathname, `/ko/plans/${code}`);
    assert.deepEqual([...dest.searchParams.entries()], [["ref", ESIMOA_REF]]);
    assert.equal(link.filtered && link.affiliate, true);
  }
});

test("매핑하지 않은 지역은 전체 목록, 잘못된 제휴 코드는 링크에서 제외", () => {
  for (const country of ["북마리아나(사이판)", "__proto__", "외부 주소"]) {
    const link = esimoaPlansLink(country, "not-a-ref&token=bogus");
    assert.equal(link.href, "https://www.esimoa.com/ko/plans");
    assert.equal(link.filtered || link.affiliate, false);
  }
});
