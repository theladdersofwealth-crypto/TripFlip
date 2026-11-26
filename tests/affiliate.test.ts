import type { TestContext } from "node:test";
import test, { beforeEach } from "node:test";
// 고정된 예제 날짜가 지나도 링크 회귀 테스트는 동일한 기준으로 실행한다.
beforeEach((t) => { (t as TestContext).mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-26T03:00:00Z") }); });
import assert from "node:assert/strict";
import { agodaFlightsUrl, aviasalesSearchUrl, kkdaySearchUrl, klookHotelUrl, klookSearchUrl, tpLink, welcomePickupsUrl } from "../src/services/affiliate";

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
  assert.equal(new URL(klookHotelUrl("zzz-none", stay)).searchParams.get("u"), "https://www.klook.com/ko/hotels/");
  assert.equal(new URL(klookHotelUrl("vie-nhatrang", { ...stay, endDate: "" })).searchParams.get("u"), "https://www.klook.com/ko/hotels/");
});

test("클룩 도시 번호 목록: 시범·세계 권역 둘 다", () => {
  const stay = { startDate: "2027-01-13", endDate: "2027-01-20", adults: 2, children: 0, rooms: 1 };
  for (const [id, n] of [["jap-osaka", "29"], ["OS", "29"], ["tha-bangkok", "4"], ["uni-dubai", "78"]] as const) {
    const u = new URL(new URL(klookHotelUrl(id, stay)).searchParams.get("u")!);
    assert.equal(u.searchParams.get("city_id"), n);
  }
});

test("클룩 호텔 상세: 번호 있는 숙소는 그 숙소로, 날짜·인원 채움", async () => {
  const { klookHotelDetailUrl } = await import("../src/services/affiliate");
  const stay = { startDate: "2027-01-13", endDate: "2027-01-20", adults: 2, children: 2, rooms: 1 };
  const u = new URL(new URL(klookHotelDetailUrl("The Ritz-Carlton, Osaka", stay)!).searchParams.get("u")!);
  assert.equal(u.pathname, "/ko/hotels/detail/276398-the-ritz-carlton-osaka/");
  assert.equal(u.searchParams.get("check_in"), "2027-01-13");
  assert.equal(u.searchParams.get("adult_num"), "2");
  assert.equal(u.searchParams.get("child_num"), "2");
  assert.equal(klookHotelDetailUrl("없는 호텔", stay), null);
});

import { CJ, cjLink } from "../src/services/affiliate";

test("CJ 설정이 비어 있으면 아고다 주소 그대로", () => {
  const u = "https://www.agoda.com/ko-kr/search?checkIn=2026-12-20&adults=2";
  assert.equal(cjLink(u, { domain: "", linkId: "" }), u);
  if (!CJ.agoda.domain) assert.equal(cjLink(u, CJ.agoda), u);
});

test("CJ 설정이 있으면 click-{pid}-{linkId}?url= 로 감싸고 날짜·인원이 그대로 남는다", () => {
  const u = "https://www.agoda.com/ko-kr/search?textToSearch=Nha%20Trang&checkIn=2026-12-20&checkOut=2026-12-23&los=3&rooms=1&adults=2&children=1&childages=4";
  const w = new URL(cjLink(u, { domain: "cj.example", linkId: "999" }, "101921886"));
  assert.equal(w.origin + w.pathname, "https://cj.example/click-101921886-999");
  const inner = new URL(w.searchParams.get("url")!);
  assert.equal(inner.searchParams.get("checkIn"), "2026-12-20");
  assert.equal(inner.searchParams.get("checkOut"), "2026-12-23");
  assert.equal(inner.searchParams.get("adults"), "2");
  assert.equal(inner.searchParams.get("childages"), "4");
});

test("아고다 항공: 조건이 없거나 공항코드·날짜가 안 맞으면 한국어 첫 화면을 CJ 딥링크로 감싼다", () => {
  const home = "https://www.tkqlhce.com/click-101921886-17095166?url=https%3A%2F%2Fwww.agoda.com%2Fko-kr%2Fflights";
  assert.equal(agodaFlightsUrl(), home);
  assert.equal(agodaFlightsUrl({ from: "ICN", to: "", startDate: "2026-11-26", endDate: "2026-12-02", adults: 2 }), home);
  assert.equal(agodaFlightsUrl({ from: "ICN", to: "미확인", startDate: "2026-11-26", endDate: "2026-12-02", adults: 2 }), home);
  assert.equal(agodaFlightsUrl({ from: "ICN", to: "CXR", startDate: "2026-12-02", endDate: "2026-11-26", adults: 2 }), home);
});

test("아고다 항공: 형님 샘플과 같은 왕복 검색 결과 주소를 CJ 딥링크로 감싼다", () => {
  const w = new URL(agodaFlightsUrl({ from: "icn", to: "cxr", startDate: "2026-11-26", endDate: "2026-12-02", adults: 1 }));
  assert.equal(w.origin + w.pathname, "https://www.tkqlhce.com/click-101921886-17095166");
  assert.equal(w.searchParams.get("url"), "https://www.agoda.com/ko-kr/flights/results?searchType=2&cabinType=Economy&adults=1&departureFrom=ICN&departureFromType=1&departDate=2026-11-26&arrivalTo=CXR&arrivalToType=1&returnDate=2026-12-02&sort=8");
  const two = new URL(new URL(agodaFlightsUrl({ from: "ICN", to: "HKG", startDate: "2027-01-10", endDate: "2027-01-14", adults: 2 })).searchParams.get("url")!);
  assert.equal(two.searchParams.get("adults"), "2");
  assert.equal(two.searchParams.get("arrivalTo"), "HKG");
  assert.equal([...two.searchParams.keys()].some((k) => /child|infant/i.test(k)), false);
});

test("시범 5권역은 아고다 도시 번호를 찾는다(11/25 아고다 직접 검색 값)", async () => {
  const { agodaCityId } = await import("../src/services/booking");
  assert.equal(agodaCityId("NT"), 2679);
  assert.equal(agodaCityId("DN"), 16440);
  assert.equal(agodaCityId("OS"), 9590);
  assert.equal(agodaCityId("HK"), 16808);
  assert.equal(agodaCityId("PQ"), 17188);
});
