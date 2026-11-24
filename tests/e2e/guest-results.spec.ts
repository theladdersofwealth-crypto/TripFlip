import { expect, test } from "@playwright/test";

// 비회원: 추천 결과는 흐리게(실제 여행지 이름은 화면에 없음) + 가입 안내. 회원: 같은 결과가 선명하게.
test("비회원은 추천 결과가 흐리게 보이고, 로그인하면 선명하게 보인다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "구성원 설정", exact: true }).click();
  await page.getByRole("button", { name: "설정 완료", exact: true }).click();
  await page.getByRole("button", { name: "다음 · 언제 →", exact: true }).click();
  for (const d of ["2027-05-10", "2027-05-15"]) {
    const day = page.getByRole("button", { name: d, exact: true });
    for (let i = 0; i < 24 && !(await day.isVisible()); i++) await page.getByRole("button", { name: "다음 달", exact: true }).click();
    await day.click();
  }
  await page.getByRole("button", { name: "다음 · 취향 →", exact: true }).click();
  await page.getByRole("button", { name: /^1단계 완료/ }).click();
  await page.getByRole("button", { name: /추천받기 · 정확도/ }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByRole("dialog", { name: "가입 안내" })).toBeVisible();
  await expect(page.getByText(/가입하면 추천 여행지를 볼 수 있어요/)).toBeVisible();
  await expect(page.locator(".rank-hero-name").first()).toHaveText("○○○○");
  await expect(page.getByText("날짜별 일정 보기")).toHaveCount(0);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/1-비회원.png` });

  // 로그인 상태가 되면 같은 결과가 선명하게
  await page.evaluate(() => {
    localStorage.setItem("tripflip:auth", JSON.stringify({ uid: "test", nick: "테스트", token: "t" }));
    window.dispatchEvent(new Event("tripflip:auth"));
  });
  await expect(page.getByRole("dialog", { name: "가입 안내" })).toHaveCount(0);
  await expect(page.locator(".rank-hero-name").first()).not.toHaveText("○○○○");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/2-회원.png` });
});
