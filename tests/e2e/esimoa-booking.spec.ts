import { expect, test } from "@playwright/test";
import { ESIMOA_REF } from "../../src/services/esimoa";

test("두 예약 화면에서 목적지별 이심모아 제휴 링크를 노출한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://tripflip-stats.ohysky0127.workers.dev/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === "/me" ? { ok: true, uid: "0123456789abcdef", nick: "QA" }
      : path === "/plans" ? { ok: true, plans: [] } : { ok: false };
    return route.fulfill({ json, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" } });
  });
  await page.addInitScript(() => {
    localStorage.setItem("tripflip:auth", JSON.stringify({ uid: "0123456789abcdef", token: "fixture", nick: "QA" }));
    localStorage.setItem("tripflip.flow.query", JSON.stringify({
      startDate: "2027-01-13", endDate: "2027-01-19", adults: 2, children: [], elders: false, pet: false,
      main: "관광", subs: [], interests: ["관광"], perDay: 2, price: "상관없음", stay: "가심비",
    }));
  });
  for (const path of ["/r/NT", "/book/NT"]) {
    await page.goto(path);
    if (path.startsWith("/r/")) await page.getByRole("tab", { name: "예약", exact: true }).click();
    const card = page.getByRole("region", { name: "여행 eSIM", exact: true });
    const button = card.getByRole("link", { name: "베트남 eSIM 요금제 보기" });
    await expect(button).toHaveAttribute("href", `https://www.esimoa.com/ko/plans/vn?ref=${ESIMOA_REF}`);
    await expect(button).toHaveAttribute("target", "_blank");
    await expect(button).toHaveAttribute("rel", "noopener noreferrer sponsored");
    await expect(card.getByText(/제휴 링크/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
