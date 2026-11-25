import { expect, test } from "@playwright/test";

test("모바일에서 추천과 일정의 로고를 눌러도 날짜·설정 단계·고정 일정이 남는다", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tripflip:auth", JSON.stringify({ token: "e2e", nick: "e2e" })));
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).hostname === "127.0.0.1") await route.continue();
    else await route.abort();
  });
  await page.goto("/");
  const logo = page.getByRole("link", { name: "TripFlip 홈", exact: true });
  await page.getByRole("button", { name: "다음 · 언제 →", exact: true }).click();
  for (const date of ["2027-05-07", "2027-05-21"]) {
    const day = page.getByRole("button", { name: date, exact: true });
    for (let i = 0; i < 24 && !(await day.isVisible()); i++) await page.getByRole("button", { name: "다음 달", exact: true }).click();
    await day.click();
  }
  await page.getByRole("button", { name: "다음 · 취향 →", exact: true }).click();
  await page.getByRole("button", { name: "메인 휴양", exact: true }).click();
  // 추천 전의 진행 중 질문과 값도 홈을 다시 열었을 때 남는다.
  await page.getByRole("link", { name: /자주 묻는 질문/ }).click();
  await expect(page).toHaveURL(/\/guide/);
  await logo.click();
  await expect(page.getByRole("heading", { name: "어떤 여행인가요?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "메인 휴양", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "1단계 완료", exact: true }).click();
  await page.getByRole("button", { name: /^2단계로 조건 더 넣기/ }).click();
  await page.getByRole("button", { name: "8시간", exact: true }).click();
  await page.getByRole("button", { name: "여유롭게 · 1곳", exact: true }).click();
  await page.getByRole("button", { name: /^3단계로 조건 더 넣기/ }).click();
  await page.getByRole("button", { name: "대략 이 정도", exact: true }).click();
  await page.getByLabel("일행 전체 예산 만원", { exact: true }).fill("1000");
  await page.getByRole("button", { name: "다음 · 숙소 →", exact: true }).click();
  await page.getByLabel("숙소 선호", { exact: true }).selectOption("하이엔드");
  await page.getByLabel("검색할 객실 수", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "3단계 완료", exact: true }).click();
  const recommend = page.getByRole("button", { name: /추천받기 · 조건 3\/3/ });
  await recommend.click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByText("14박 15일", { exact: true })).toBeVisible();
  const query = () => page.evaluate(() => localStorage.getItem("tripflip.flow.query"));
  const original = await query();
  expect(JSON.parse(original ?? "{}")).toMatchObject({ startDate: "2027-05-07", endDate: "2027-05-21", stay: "하이엔드", roomCount: 2, perDay: 1, totalBudgetKrw: 10000000 });
  await logo.click();
  await expect(recommend).toBeEnabled();
  await recommend.click();
  await expect(page.getByText("14박 15일", { exact: true })).toBeVisible();
  expect(await query()).toBe(original);

  // 일정 수정 후에도 같은 조건으로 다시 예약판을 열면 고정한 칸이 보인다.
  const firstResult = page.getByRole("link", { name: /^자세히 보기/ }).first();
  const region = await firstResult.getAttribute("href");
  expect(region).toMatch(/^\/r\//);
  await firstResult.click();
  const morning = page.locator(".day-card").nth(1).getByRole("button", { name: /^오전/ });
  await morning.click();
  await page.getByRole("dialog", { name: "2일차 오전 바꾸기" }).getByRole("button", { name: "숙소 휴식", exact: true }).click();
  await expect(morning).toContainText("숙소 휴식");
  await logo.click();
  await expect(recommend).toBeEnabled();
  await recommend.click();
  await expect(page).toHaveURL(/\/results$/);
  await page.locator(`a[href="${region}"]`).first().click();
  await expect(morning).toContainText("숙소 휴식");
});
