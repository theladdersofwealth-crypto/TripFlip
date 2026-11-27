import { expect, test } from "@playwright/test";

// 추천 카드 배경 깃발: 원본 SVG가 실제로 불러와지고, 모바일·PC 모두 카드 윗부분 안에 잘리지 않고 통째로 들어간다.
for (const width of [390, 1440]) {
  test(`추천 카드 깃발이 잘리지 않고 보인다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "구성원 설정", exact: true }).click();
    await page.getByRole("button", { name: "설정 완료", exact: true }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    for (const d of ["2027-05-10", "2027-05-15"]) {
      const day = page.getByRole("button", { name: d, exact: true });
      for (let i = 0; i < 24 && !(await day.isVisible()); i++) await page.getByRole("button", { name: "다음 달", exact: true }).click();
      await day.click();
    }
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "트립플립 추천", exact: true }).click();
    await expect(page).toHaveURL(/\/results\?preview=1$/);
    const dialog = page.getByRole("dialog", { name: "가입 안내" });
    if (await dialog.isVisible()) await page.keyboard.press("Escape");

    const heroes = page.locator(".rank-card:not(.guest-blur .rank-card) .rank-hero");
    await expect(heroes).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const hero = heroes.nth(i);
      const flag = hero.locator("img.rank-flag");
      await expect(flag).toHaveAttribute("src", /^\/flags\/[a-z]{2}\.svg$/);
      await flag.scrollIntoViewIfNeeded();
      await expect.poll(() => flag.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const box = await hero.boundingBox();
      // 그려진 깃발 영역(object-fit: contain)이 카드 윗부분 안에 모두 들어간다
      const drawn = await flag.evaluate((el: HTMLImageElement) => {
        const r = el.getBoundingClientRect();
        const s = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight);
        const w = el.naturalWidth * s, h = el.naturalHeight * s;
        return { left: r.right - w, top: r.top + (r.height - h) / 2, right: r.right, bottom: r.top + (r.height + h) / 2, ratio: w / h, natural: el.naturalWidth / el.naturalHeight };
      });
      expect(box).not.toBeNull();
      expect(drawn.left).toBeGreaterThanOrEqual(box!.x - 0.5);
      expect(drawn.top).toBeGreaterThanOrEqual(box!.y - 0.5);
      expect(drawn.right).toBeLessThanOrEqual(box!.x + box!.width + 0.5);
      expect(drawn.bottom).toBeLessThanOrEqual(box!.y + box!.height + 0.5);
      expect(Math.abs(drawn.ratio - drawn.natural)).toBeLessThan(0.01);
    }
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/flag-cards-${width}.png`, fullPage: false });
  });
}
