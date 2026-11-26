import { test, expect } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`희망 지역 순차 선택·복수 칩 및 스크린샷 ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.route("https://**/*", (route) => route.abort());
    await page.goto("/");
    const shortcut = page.getByRole("button", { name: /가고 싶은 지역.*상관없음.*선택/ });
    await expect(shortcut).toBeVisible();
    await page.getByRole("button", { name: "다음 · 언제 →", exact: true }).click();
    await page.getByRole("button", { name: "다음 · 지역 →", exact: true }).click();
    const chips = page.getByRole("group", { name: "가고 싶은 지역 선택" });
    await expect(chips.getByRole("button")).toHaveCount(15);
    await expect(chips.getByRole("button", { name: "상관없음", exact: true })).toHaveAttribute("aria-pressed", "true");
    await chips.getByRole("button", { name: "동남아", exact: true }).click();
    await chips.getByRole("button", { name: "동·중부유럽", exact: true }).click();
    await expect(chips.getByRole("button", { name: "상관없음", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(chips.getByRole("button", { name: "동남아", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(chips.getByRole("button", { name: "동·중부유럽", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(chips.getByRole("button", { name: "동남아", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(chips.getByRole("button", { name: "동·중부유럽", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`travel-area-${width}.png`), fullPage: true });
    await chips.getByRole("button", { name: "상관없음", exact: true }).click();
    await expect(chips.getByRole("button", { name: "동남아", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(chips.getByRole("button", { name: "동·중부유럽", exact: true })).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "다음 · 취향 →", exact: true }).click();
    await expect(page.getByRole("button", { name: "메인 관광", exact: true })).toBeVisible();
  });
}
