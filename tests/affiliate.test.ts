import test from "node:test";
import assert from "node:assert/strict";
import { kkdaySearchUrl, klookSearchUrl, tpLink } from "../src/services/affiliate";

test("제휴 값이 없으면 원래 주소 그대로", () => {
  assert.equal(klookSearchUrl("Nha Trang", { marker: "", trs: "" }), "https://www.klook.com/ko/search/result/?query=Nha%20Trang");
  assert.equal(kkdaySearchUrl("Nha Trang", { marker: "", trs: "" }), "https://www.kkday.com/ko/product/productlist?keyword=Nha%20Trang");
});

test("제휴 값이 있으면 tp.media 로 감싸고 원래 주소를 u 에 넣는다", () => {
  const url = new URL(klookSearchUrl("Hong Kong", { marker: "123", trs: "456" }, { p: "4110", campaignId: "137" }));
  assert.equal(url.origin + url.pathname, "https://tp.media/r");
  assert.equal(url.searchParams.get("marker"), "123");
  assert.equal(url.searchParams.get("trs"), "456");
  assert.equal(url.searchParams.get("p"), "4110");
  assert.equal(url.searchParams.get("campaign_id"), "137");
  assert.equal(url.searchParams.get("u"), "https://www.klook.com/ko/search/result/?query=Hong%20Kong");
});

test("프로그램 번호가 없으면 감싸지 않는다", () => {
  assert.equal(tpLink("https://x.test/", { p: "", campaignId: "" }, { marker: "1", trs: "2" }), "https://x.test/");
});
