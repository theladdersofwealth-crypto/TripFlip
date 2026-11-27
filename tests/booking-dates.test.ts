import assert from "node:assert/strict";
import test from "node:test";
import { bookingDates, todayInSeoul } from "../src/lib/travelDates";
import { agodaFlightUrl, bookingComUrl, flightAffiliateUrl, flightSearchUrl, hotelSearchUrl, klookHotelStayUrl, klookStayUrl } from "../src/services/booking";
import { REGIONS_V1 } from "../src/data/regionsV1";
import { DEFAULT_QUERY } from "../src/lib/flow";

const now = new Date("2026-11-26T15:00:00Z"); // 한국 11/27 00:00
const region = REGIONS_V1.find((r) => r.id === "NT")!;
const inner = (value: string) => {
  const url = new URL(value);
  return new URL(url.searchParams.get("url") ?? url.searchParams.get("u") ?? value);
};

test("한국 자정 경계와 실제 달력 날짜", () => {
  assert.equal(todayInSeoul(new Date("2026-11-26T14:59:59Z")), "2026-11-26");
  assert.equal(todayInSeoul(now), "2026-11-27");
  assert.deepEqual(bookingDates("2026-11-25", "2026-11-27", now), { startDate: "2026-11-27", endDate: "2026-11-29" });
  assert.deepEqual(bookingDates("2026-11-26", "2026-11-29", now), { startDate: "2026-11-27", endDate: "2026-11-29" });
  assert.equal(bookingDates("2027-02-30", "2027-03-03", now), null);
  assert.equal(bookingDates("2026-11-29", "2026-11-27", now), null);
});

for (const [label, startDate, endDate, expectedStart, expectedEnd] of [
  ["과거", "2026-11-24", "2026-11-26", "2026-11-27", "2026-11-29"],
  ["오늘", "2026-11-27", "2026-11-29", "2026-11-27", "2026-11-29"],
  ["미래", "2026-11-28", "2026-11-30", "2026-11-28", "2026-11-30"],
  ["일부 과거", "2026-11-26", "2026-11-30", "2026-11-27", "2026-11-30"],
] as const) {
  test(label + ": 모든 예약 링크 날짜·인원·제휴 유지, 원본 불변", (t) => {
    t.mock.timers.enable({ apis: ["Date"], now });
    const q = { ...DEFAULT_QUERY, startDate, endDate, adults: 1, children: [], roomCount: 1 };
    const original = JSON.stringify(q);
    const a = inner(hotelSearchUrl(region, q));
    assert.equal(a.searchParams.get("city"), "2679");
    assert.equal(a.searchParams.get("checkIn"), expectedStart);
    assert.equal(a.searchParams.get("checkOut"), expectedEnd);
    assert.equal(a.searchParams.get("los"), String((Date.parse(expectedEnd) - Date.parse(expectedStart)) / 86400000));
    assert.equal(a.searchParams.get("adults"), "1");
    assert.equal(a.searchParams.get("rooms"), "1");
    assert.ok(new URL(hotelSearchUrl(region, q)).searchParams.has("url"));
    const f = inner(agodaFlightUrl(region, q));
    assert.equal(f.searchParams.get("departDate"), expectedStart);
    assert.equal(f.searchParams.get("returnDate"), expectedEnd);
    assert.equal(f.searchParams.get("adults"), "1");
    assert.equal(f.searchParams.get("departureFrom"), "ICN");
    assert.equal(f.searchParams.get("arrivalTo"), "CXR");
    const b = inner(bookingComUrl(region, q));
    assert.equal(b.searchParams.get("checkin"), expectedStart);
    assert.equal(b.searchParams.get("checkout"), expectedEnd);
    assert.equal(b.searchParams.get("group_adults"), "1");
    const k = inner(klookStayUrl(region, q));
    assert.equal(k.searchParams.get("check_in"), expectedStart);
    assert.equal(k.searchParams.get("check_out"), expectedEnd);
    assert.equal(k.searchParams.get("adult_num"), "1");
    const kd = inner(klookHotelStayUrl("The Ritz-Carlton, Osaka", q)!);
    assert.equal(kd.searchParams.get("check_in"), expectedStart);
    assert.equal(kd.searchParams.get("check_out"), expectedEnd);
    const short = (d: string) => d.slice(2).replaceAll("-", "");
    assert.ok(flightSearchUrl(region, q).includes(`/icn/cxr/${short(expectedStart)}/${short(expectedEnd)}/`));
    const ddmm = (d: string) => d.slice(8, 10) + d.slice(5, 7);
    assert.equal(inner(flightAffiliateUrl(region, q)).pathname, `/search/ICN${ddmm(expectedStart)}CXR${ddmm(expectedEnd)}1`);
    assert.equal(JSON.stringify(q), original);
  });
}

test("잘못된 날짜는 예약 링크에 싣지 않는다", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const q = { ...DEFAULT_QUERY, startDate: "2027-02-30", endDate: "2027-03-03" };
  assert.equal(inner(hotelSearchUrl(region, q)).searchParams.has("checkIn"), false);
  assert.equal(inner(hotelSearchUrl(region, q)).searchParams.has("los"), false);
  assert.equal(inner(bookingComUrl(region, q)).searchParams.has("checkin"), false);
  assert.equal(inner(agodaFlightUrl(region, q)).pathname, "/ko-kr/flights");
  assert.equal(inner(klookStayUrl(region, q)).pathname, "/ko/hotels/");
  assert.equal(inner(klookHotelStayUrl("The Ritz-Carlton, Osaka", q)!).searchParams.has("check_in"), false);
  assert.equal(inner(flightAffiliateUrl(region, q)).pathname, "/");
  assert.equal(inner(flightSearchUrl(region, q)).pathname, "/transport/flights/");
});

test("고비사막 2028년 일정: 항공 링크는 검색 홈, 숙소 링크는 도시만 전달", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const { ALL_REGIONS } = await import("../src/services/regionScore");
  const { agodaStayNotice, flightDateNotice } = await import("../src/services/booking");
  const gobi = ALL_REGIONS.find((r) => r.id === "mon-gobi")!;
  const q = { ...DEFAULT_QUERY, startDate: "2028-10-13", endDate: "2028-10-16", adults: 2 };
  const original = JSON.stringify(q);
  assert.equal(gobi.airportCode.toUpperCase(), "UBN");
  const f = inner(agodaFlightUrl(gobi, q));
  assert.equal(f.pathname, "/ko-kr/flights");
  assert.equal(f.searchParams.has("departDate"), false);
  assert.equal(inner(flightAffiliateUrl(gobi, q)).pathname, "/");
  assert.equal(inner(flightSearchUrl(gobi, q)).pathname, "/transport/flights/");
  const h = inner(hotelSearchUrl(gobi, q));
  assert.equal(h.searchParams.get("city"), "725293");
  assert.equal(h.searchParams.get("adults"), "2");
  for (const key of ["checkIn", "checkOut", "los"]) assert.equal(h.searchParams.has(key), false);
  assert.match(agodaStayNotice(gobi, q) ?? "", /365일/);
  assert.match(flightDateNotice(q) ?? "", /360일/);
  assert.equal(JSON.stringify(q), original);
});

test("항공 왕복 360일, 아고다 숙소 체크인 365일 경계와 원래 날짜 보존", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const { addCalendarDays } = await import("../src/lib/travelDates");
  const { agodaStayNotice, flightDateNotice } = await import("../src/services/booking");
  const today = todayInSeoul(now);
  const at = (i: number) => addCalendarDays(today, i);
  const range = (i: number, j: number) => ({ ...DEFAULT_QUERY, startDate: at(i), endDate: at(j) });
  assert.equal(inner(agodaFlightUrl(region, range(359, 360))).searchParams.get("returnDate"), at(360));
  assert.equal(flightDateNotice(range(359, 360)), null);
  assert.equal(inner(agodaFlightUrl(region, range(359, 361))).pathname, "/ko-kr/flights");
  assert.equal(inner(hotelSearchUrl(region, range(365, 367))).searchParams.get("checkIn"), at(365));
  assert.equal(agodaStayNotice(region, range(365, 367)), null);
  assert.equal(inner(hotelSearchUrl(region, range(366, 367))).searchParams.has("checkIn"), false);
  assert.match(agodaStayNotice(region, range(-2, -1)) ?? "", /저장한 일정은 그대로/);
});
