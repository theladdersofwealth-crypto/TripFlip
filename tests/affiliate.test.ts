import test from "node:test";
import assert from "node:assert/strict";
import { aviasalesSearchUrl, kkdaySearchUrl, klookHotelUrl, klookSearchUrl, tpLink, welcomePickupsUrl } from "../src/services/affiliate";

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

test("실제 계정 값으로 클룩·KKday 제휴 링크가 만들어진다", () => {
  const k = new URL(klookSearchUrl("Nha Trang"));
  assert.equal(k.searchParams.get("marker"), "798059");
  assert.equal(k.searchParams.get("p"), "4110");
  const d = new URL(kkdaySearchUrl("Nha Trang"));
  assert.equal(d.searchParams.get("p"), "9074");
  assert.equal(d.searchParams.get("campaign_id"), "633");
});

test("클룩 호텔 링크도 제휴로 감싼다", () => {
  const h = new URL(klookHotelUrl());
  assert.equal(h.searchParams.get("p"), "4110");
  assert.equal(h.searchParams.get("u"), "https://www.klook.com/ko/hotels/");
});

const none = { marker: "", trs: "" };
test("Aviasales 왕복 검색 주소(성인·어린이·유아)", () => {
  const base = { from: "ICN", to: "cxr", startDate: "2027-01-13", endDate: "2027-01-20" };
  assert.equal(aviasalesSearchUrl({ ...base, adults: 2, childAges: null, childCount: 0 }, none), "https://www.aviasales.com/search/ICN1301CXR20012?currency=krw");
  assert.equal(aviasalesSearchUrl({ ...base, adults: 2, childAges: [4, 1], childCount: 2 }, none), "https://www.aviasales.com/search/ICN1301CXR2001211?currency=krw");
  assert.equal(aviasalesSearchUrl({ ...base, adults: 2, childAges: null, childCount: 2 }, none), "https://www.aviasales.com/search/ICN1301CXR200122?currency=krw");
  assert.equal(aviasalesSearchUrl({ ...base, to: "", adults: 2, childAges: null, childCount: 0 }, none), "https://www.aviasales.com/");
});

test("Aviasales·공항 픽업도 제휴로 감싼다", () => {
  const a = new URL(aviasalesSearchUrl({ from: "ICN", to: "HKG", startDate: "2027-01-13", endDate: "2027-01-20", adults: 1, childAges: null, childCount: 0 }));
  assert.equal(a.searchParams.get("p"), "4114");
  assert.equal(a.searchParams.get("campaign_id"), "100");
  assert.equal(new URL(welcomePickupsUrl()).searchParams.get("p"), "8919");
});

test("클룩 호텔: 도시 번호 아는 권역은 날짜·인원·객실 채움, 모르면 첫 화면", () => {
  const stay = { startDate: "2027-01-13", endDate: "2027-01-20", adults: 2, children: 2, rooms: 1 };
  const u = new URL(new URL(klookHotelUrl("vie-nhatrang", stay)).searchParams.get("u")!);
  assert.equal(u.pathname, "/ko/hotels/searchresult/");
  assert.equal(u.searchParams.get("city_id"), "208");
  assert.equal(u.searchParams.get("check_in"), "2027-01-13");
  assert.equal(u.searchParams.get("check_out"), "2027-01-20");
  assert.equal(u.searchParams.get("adult_num"), "2");
  assert.equal(u.searchParams.get("child_num"), "2");
  assert.equal(u.searchParams.get("room_num"), "1");
  assert.equal(new URL(klookHotelUrl("vie-nhatrang", stay)).searchParams.get("p"), "4110");
  assert.equal(new URL(klookHotelUrl("jap-osaka", stay)).searchParams.get("u"), "https://www.klook.com/ko/hotels/");
  assert.equal(new URL(klookHotelUrl("vie-nhatrang", { ...stay, endDate: "" })).searchParams.get("u"), "https://www.klook.com/ko/hotels/");
});
