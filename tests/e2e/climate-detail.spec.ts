import { expect, test } from "@playwright/test";

test("신규 여행지 상세에서 최근 5년 기후와 출처를 확인한다", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const origin = new URL(baseURL!).origin;
  await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("tripflip.flow.query", JSON.stringify({
      startDate: "2027-01-10", endDate: "2027-01-15", adults: 2, children: [],
      elders: false, pet: false, main: "관광", subs: [], interests: ["관광"],
      perDay: 2, price: "상관없음", stay: "가심비",
    }));
    localStorage.setItem("tripflip:auth", JSON.stringify({ token: "synthetic", nick: "QA" }));
  });
  await page.goto("/r/pol-gdansk?tab=" + encodeURIComponent("관광지"));
  await page.getByText("1월 기후 · 최근 5년 평균", { exact: true }).click();
  await expect(page.getByText(/평균 .*℃ · 총강수량 .*mm · 적설 수분량 .*mm/)).toBeVisible();
  await expect(page.getByText(/2021~2025년.*여행일 예보가 아니에요/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Copernicus C3S/ECMWF ERA5", exact: true })).toBeVisible();
});
