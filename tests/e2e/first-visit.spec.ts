import { expect, test } from "@playwright/test";

const start = /^(여행지 추천 받기|조건 이어서 고르기)$/;

for (const vp of [{ name: "모바일", width: 390, height: 844 }, { name: "PC", width: 1280, height: 900 }]) {
  test(`처음 방문(저장값 없음) ${vp.name}: 홈이 먼저, 버튼을 눌러야 질문, 기본값은 '기본값'으로 구분`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.route("https://**/*", (r) => r.abort());
    await page.goto("/");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    // 1) 첫 화면은 홈. 질문 팝업은 자동으로 뜨지 않는다.
    await expect(page.getByRole("heading", { name: "어디로 떠나볼까요?" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // 첫 화면 콘텐츠(11/27): 비어 보이지 않게 이용 방법·여행지 카드(국기)·테마가 있고, 신규 방문자 버튼은 '여행지 추천 받기'.
    for (const h of ["이렇게 추천해요", "넘겨보며 발견하기", "테마로 시작하기"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
    await expect(page.locator(".home-dest-card")).toHaveCount(8);
    await expect(page.locator(".home-dest-card .rank-flag").first()).toHaveAttribute("src", "/flags/vn.svg");
    await expect(page.getByRole("button", { name: "조건 이어서 고르기", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: true });
    await page.getByRole("button", { name: "여행지 추천 받기", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "누구랑 가나요?" })).toBeVisible();
    // 2) 신규 방문자 기본값은 성인 2명, 아무것도 고르지 않은 상태.
    await expect(dialog.getByText("질문 1/11 · 선택 0개", { exact: true })).toBeVisible();
    await expect(dialog.getByText("성인 2명", { exact: true })).toBeVisible();
    await expect(dialog.getByText("기본값", { exact: true })).toBeVisible();
    for (const label of ["혼자", "부부·연인", "친구", "아이와", "부모님과"]) await expect(dialog.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "false");
    // 3) 팝업 높이는 내용에 맞춘다(크게 비지 않음).
    const box = await page.locator(".question-panel").boundingBox();
    const scroll = await page.locator(".question-scroll").evaluate((el) => ({ client: el.clientHeight, content: el.scrollHeight }));
    expect(scroll.client - scroll.content).toBeLessThanOrEqual(1);
    expect(box!.height).toBeLessThan(vp.height * 0.75);
    await page.screenshot({ path: testInfo.outputPath("question-who.png") });
    // 직접 고르면 '내가 고른 조건'으로 바뀐다.
    await dialog.getByRole("button", { name: "부부·연인", exact: true }).click();
    await expect(dialog.getByText("질문 1/11 · 선택 1개", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "부부·연인", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByText("기본값", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("지난 검색이 저장돼 있어도 팝업은 자동으로 안 뜨고, 지난 조건은 '지난 조건'으로 구분", async ({ page }) => {
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("tripflip.flow.query", JSON.stringify({ startDate: "2027-05-10", endDate: "2027-05-14", adults: 4, children: [{ band: "초등", height: null, actualAge: 6 }, { band: "유아", height: null, actualAge: 3 }], elders: false, pet: false, main: "관광", subs: ["휴양"], perDay: 2, price: "상관없음", stay: "가심비", maxFlightHours: 8 }));
  });
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: start }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("질문 1/11 · 선택 0개 · 지난 조건 11개", { exact: true })).toBeVisible();
  await expect(dialog.getByText("지난 조건", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/지난 검색 조건이에요/)).toBeVisible();
  await dialog.getByRole("button", { name: "지난 조건 그대로 선택", exact: true }).click();
  await expect(dialog.getByText("질문 1/11 · 선택 1개 · 지난 조건 10개", { exact: true })).toBeVisible();
  await expect(dialog.getByText("내가 고른 조건이에요.", { exact: true })).toBeVisible();
});

test("테마·여행지 카드를 누르면 그 조건이 고른 상태로 질문이 열리고, 닫으면 '조건 이어서 고르기'", async ({ page }) => {
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole("button", { name: /^휴양/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("질문 1/11 · 선택 1개", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "질문 닫기" }).click();
  await page.getByRole("button", { name: /^다낭/ }).click();
  await expect(dialog.getByText("질문 1/11 · 선택 2개", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "질문 닫기" }).click();
  await expect(page.getByRole("button", { name: "조건 이어서 고르기", exact: true })).toBeVisible();
});
