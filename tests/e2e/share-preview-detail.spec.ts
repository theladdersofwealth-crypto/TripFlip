import { expect, test } from "@playwright/test";
import { encodeShare } from "../../src/lib/shareLink";
import type { RegionQuery } from "../../src/services/regionScore";

const own: RegionQuery = {
  startDate: "2027-05-10", endDate: "2027-05-12", adults: 2, children: [],
  elders: false, pet: false, main: "관광", subs: ["휴양"], perDay: 2,
  price: "상관없음", stay: "가심비", maxFlightHours: 8,
};
const shared: RegionQuery = { ...own, startDate: "2027-06-01", endDate: "2027-06-06", adults: 3 };

for (const width of [390, 1280]) {
  test(`공유 미리보기 상세는 조건 적용 전 다른 일정을 열지 않는다 (${width}px)`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 850 });
    const origin = new URL(baseURL!).origin;
    await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript((query) => {
      if (!localStorage.getItem("tripflip.flow.query")) localStorage.setItem("tripflip.flow.query", JSON.stringify(query));
      localStorage.setItem("tripflip:auth", JSON.stringify({ token: "synthetic", nick: "QA" }));
    }, own);
    await page.goto(`/results?s=${encodeShare(shared)}`);
    await expect(page.getByText("5박 6일", { exact: true })).toBeVisible();
    const url = page.url();
    const first = page.locator(".rank-card").first();
    const readQuery = () => page.evaluate(() => JSON.parse(localStorage.getItem("tripflip.flow.query")!));
    await first.locator(".rank-hero-name").click();
    await expect(page.getByText(/자세히 보려면 먼저/)).toBeVisible();
    await expect(page).toHaveURL(url);
    await expect(first.getByRole("link", { name: /^자세히 보기/ })).toHaveCount(0);
    await first.getByRole("button", { name: /^자세히 보기/ }).click();
    await expect(page.getByText(/자세히 보려면 먼저/)).toBeVisible();
    await expect(page).toHaveURL(url);
    expect(await readQuery()).toEqual(own);

    await page.getByRole("button", { name: "이 조건 사용", exact: true }).click();
    await expect(page).toHaveURL(/\/results$/);
    expect(await readQuery()).toMatchObject({ startDate: shared.startDate, endDate: shared.endDate, adults: 3 });
    await first.getByRole("link", { name: /^자세히 보기/ }).click();
    if (width === 390) await expect(page).toHaveURL(/\/r\//);
    else await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByRole("tab", { name: "예약", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "일정", exact: true }).click();
    await expect(page.locator(".day-card")).toHaveCount(6);
  });
}
