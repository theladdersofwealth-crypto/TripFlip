import { expect, test } from "@playwright/test";

// 비회원: 1~3위는 실제로 보이고, 4위부터는 흐린 가짜 카드(실제 여행지 이름은 화면에 없음) + 가입 안내. 회원: 전체가 선명하게.
test("비회원은 1~3위만 보이고 4위부터 흐리며, 로그인하면 전체가 선명하게 보인다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "구성원 설정", exact: true }).click();
  await page.getByRole("button", { name: "설정 완료", exact: true }).click();
  await page.getByRole("button", { name: "다음 · 언제 →", exact: true }).click();
  for (const d of ["2027-05-10", "2027-05-15"]) {
    const day = page.getByRole("button", { name: d, exact: true });
    for (let i = 0; i < 24 && !(await day.isVisible()); i++) await page.getByRole("button", { name: "다음 달", exact: true }).click();
    await day.click();
  }
  await page.getByRole("button", { name: "다음 · 지역 →", exact: true }).click();
  await expect(page.getByRole("group", { name: "가고 싶은 지역 선택" }).getByRole("button", { name: "상관없음", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "다음 · 취향 →", exact: true }).click();
  await page.getByRole("button", { name: /^1단계 완료/ }).click();
  await page.getByRole("button", { name: /추천받기 · 조건/ }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByRole("dialog", { name: "가입 안내" })).toBeVisible();
  await expect(page.getByText(/가입하면 4위부터 나머지 추천/)).toBeVisible();
  // 가입 안내 항목이 실제 가입 양식(닉네임·생년월일·성별·PIN+확인)과 같다
  await expect(page.getByRole("dialog", { name: "가입 안내" })).toContainText("닉네임·생년월일·성별, PIN 6자리(확인용 한 번 더)");
  const open = page.locator(".rank-card:not(.guest-blur .rank-card)");
  await expect(open).toHaveCount(3);
  await expect(open.locator(".rank-pill")).toHaveText([/^🏆 1위 추천/, /^2위 추천/, /^3위 추천/]);
  for (const name of await open.locator(".rank-hero-name").allTextContents()) expect(name).not.toContain("○");
  await expect(open.locator(".rank-brief b").first()).toContainText(/일행 (약 [\d,]+만원|경비 미확인)/);
  // 4위부터: 가짜 카드만, 실제 이름은 DOM에 없다
  const hidden = page.locator(".guest-blur .rank-card");
  await expect(hidden.first().locator(".rank-pill")).toHaveText("4위 추천");
  await expect(hidden.locator(".rank-hero-name")).toHaveText(Array(await hidden.count()).fill("○○○○"));
  const openNames = await open.locator(".rank-hero-name").allTextContents();
  await expect(page.getByText("날짜별 일정 보기")).toHaveCount(0);
  if (process.env.SHOT_DIR) await page.waitForTimeout(1500);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/1-비회원.png`, fullPage: true });

  // 로그인 상태가 되면 같은 결과가 선명하게
  await page.evaluate(() => {
    localStorage.setItem("tripflip:auth", JSON.stringify({ uid: "test", nick: "테스트", token: "t" }));
    window.dispatchEvent(new Event("tripflip:auth"));
  });
  await expect(page.getByRole("dialog", { name: "가입 안내" })).toHaveCount(0);
  await expect(page.locator(".rank-hero-name").first()).toHaveText(openNames[0]);
  await expect(page.getByText("○○○○")).toHaveCount(0);
  expect(await page.locator(".rank-card").count()).toBeGreaterThan(3);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/2-회원.png` });
});
