import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SavedPlan } from "../../src/lib/flow";

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** 달력 하나에서 시작일 → 끝일 순서로 누른다 (필요하면 다음 달로 넘긴다) */
async function pickRange(page: import("@playwright/test").Page, start: string, end: string) {
  for (const d of [start, end]) {
    const day = page.getByRole("button", { name: d, exact: true });
    for (let i = 0; i < 24 && !(await day.isVisible()); i++) await page.getByRole("button", { name: "다음 달", exact: true }).click();
    await day.click();
  }
}

// 실제 계정에는 연결하지 않는다. 테스트마다 독립된 가짜 서버의 계정 저장소를 사용한다.
const E2E_AUTH = { uid: "0123456789abcdef", token: "e2e", nick: "e2e" };
const STATS_ORIGIN = "https://tripflip-stats.ohysky0127.workers.dev";
const accountPlansKey = `tripflip.acct.${E2E_AUTH.uid}.plans`;
const accountPendingKey = `tripflip.acct.${E2E_AUTH.uid}.pending`;

test.beforeEach(async ({ page }) => {
  const serverPlans = new Map<string, SavedPlan>();
  const tombstones = new Set<string>();
  await page.addInitScript((auth) => localStorage.setItem("tripflip:auth", JSON.stringify(auth)), E2E_AUTH);
  await page.route(`${STATS_ORIGIN}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    if (path !== "/me" && path !== "/plans") { await route.abort(); return; }
    if (req.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    if (req.method() !== "POST") { await route.fulfill({ status: 405, headers }); return; }
    const body = req.postDataJSON() as { token?: string; put?: SavedPlan[]; del?: string[] };
    if (body.token !== E2E_AUTH.token) {
      await route.fulfill({ status: 401, headers, json: { ok: false, error: "로그인이 풀렸어요." } });
      return;
    }
    if (path === "/me") {
      await route.fulfill({ headers, json: { ok: true, uid: E2E_AUTH.uid, nick: E2E_AUTH.nick } });
      return;
    }
    const saved: string[] = [], deleted: string[] = [], gone: string[] = [];
    for (const id of body.del ?? []) { serverPlans.delete(id); tombstones.add(id); deleted.push(id); }
    for (const plan of body.put ?? []) {
      if (tombstones.has(plan.id)) { gone.push(plan.id); continue; }
      serverPlans.set(plan.id, plan);
      saved.push(plan.id);
    }
    await route.fulfill({ headers, json: { ok: true, uid: E2E_AUTH.uid, plans: [...serverPlans.values()], saved, deleted, gone, rejected: [] } });
  });
});

test("자녀 실제 나이와 여행 날짜를 입력한다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(여행지 추천 받기|조건 이어서 고르기)$/ }).click();
  await expect(page.locator(".party-member")).toHaveCount(0);
  // 첫 질문부터 추천 가능. 선택하지 않은 항목은 기본값.
  const submit = page.getByRole("button", { name: "트립플립 추천", exact: true });
  await expect(submit).toBeEnabled();
  await expect(page.getByRole("heading", { name: "누구랑 가나요?" })).toBeVisible();
  await page.getByRole("button", { name: "구성원 설정", exact: true }).click();
  await page.getByRole("button", { name: "+ 자녀", exact: true }).click();
  await page.getByLabel("3번째 구성원 나이", { exact: true }).fill("21");
  await page.getByRole("button", { name: "설정 완료", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();

  await expect(page.getByRole("heading", { name: "언제 떠나요?" })).toBeVisible();
  // 날짜는 출발 → 귀국 두 번만 누르면 되고, 박수는 따로 묻지 않는다.
  await expect(page.getByLabel("희망 숙박 수")).toHaveCount(0);
  await pickRange(page, "2027-05-10", "2027-05-20");
  await expect(page.getByText("기준 일정 10박 11일", { exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("group", { name: "가고 싶은 지역 선택" }).getByRole("button", { name: "상관없음", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/\/results\?preview=1$/);
  await page.getByRole("button", { name: "이 조건으로 확정", exact: true }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByText("성인 3명", { exact: true })).toBeVisible();
  const query = await page.evaluate(() => JSON.parse(localStorage.getItem("tripflip.flow.query") ?? "{}"));
  expect(query.startDate).toBe("2027-05-10");
  expect(query.endDate).toBe("2027-05-20");
  expect(query.adults).toBe(3);
  expect(query.children).toHaveLength(0);
});

test("6인 가족이 추천·일정·예약 비교·저장·복원·파일 보관을 완료한다", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  const consoleErrors: string[] = [];
  const externalRequests: string[] = [];
  let summaryRequests = 0;
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") await route.continue();
    // 계정 확인·저장 요청은 beforeEach의 모의 서버로 넘긴다. 그 외 외부 요청은 차단한다.
    else if (url.origin === STATS_ORIGIN && ["/me", "/plans"].includes(url.pathname)) await route.fallback();
    // 카드 썸네일용 위키미디어 공용 검색은 결과 없음으로 응답한다(사진 없이 색 블록으로 표시).
    else if (url.origin === "https://commons.wikimedia.org" && url.pathname === "/w/api.php") await route.fulfill({ json: {}, headers: { "access-control-allow-origin": "*" } });
    // 수집 서버의 최근 평균가 (시험용 값으로 응답)
    else if (url.href === "https://tripflip-collector.ohysky0127.workers.dev/summary") {
      summaryRequests++;
      await route.fulfill({ json: { updatedAt: "2026-11-10T02:15:00Z", windowDays: 14, days: { flight: 3, hotel: 3 }, counts: { flightSnapshots: 9, hotelBatches: 66 }, flights: { NHA: { "2027-05": [298000, 3] } }, hotels: {} }, headers: { "access-control-allow-origin": "*" } });
    }
    else { externalRequests.push(url.href); await route.abort(); }
  });

  await page.goto("/");

  await page.getByRole("button", { name: /^(여행지 추천 받기|조건 이어서 고르기)$/ }).click();
  await page.getByRole("button", { name: "구성원 설정", exact: true }).click();
  await page.getByLabel("2번째 구성원 관계", { exact: true }).selectOption("spouse");
  await page.getByRole("button", { name: "+ 자녀", exact: true }).click();
  await page.getByLabel("3번째 구성원 나이", { exact: true }).fill("1");
  await page.getByRole("button", { name: "+ 자녀", exact: true }).click();
  await page.getByLabel("4번째 구성원 나이", { exact: true }).fill("8");
  await page.getByRole("button", { name: "+ 부모님", exact: true }).click();
  await page.getByRole("button", { name: "+ 부모님", exact: true }).click();
  await expect(page.locator(".party-member")).toHaveCount(6);

  const memberCards = page.locator(".party-member");
  await memberCards.nth(0).locator("summary").click();
  await memberCards.nth(0).getByRole("button", { name: "휴양", exact: true }).click();
  await memberCards.nth(1).locator("summary").click();
  await memberCards.nth(1).getByRole("button", { name: "액티비티", exact: true }).click();
  await memberCards.nth(2).locator("summary").click();
  await memberCards.nth(2).getByLabel("유모차를 사용해요", { exact: true }).check();
  await memberCards.nth(4).locator("summary").click();
  await memberCards.nth(4).getByLabel("긴 도보·계단이 부담스러워요", { exact: true }).check();

  await page.getByRole("button", { name: "설정 완료", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await pickRange(page, "2027-05-07", "2027-05-17");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("group", { name: "가고 싶은 지역 선택" }).getByRole("button", { name: "상관없음", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const travelStyle = page.locator(".question-dialog");
  // 첫 질문에는 메인만 두고, 서브는 추천 결과에서 고른다.
  await expect(travelStyle.getByRole("button", { name: "메인 관광", exact: true })).toHaveAttribute("aria-pressed", "true");
  await travelStyle.getByRole("button", { name: "메인 휴양", exact: true }).click();
  await expect(travelStyle.getByText("메인 · 휴양", { exact: true })).toBeVisible();
  await expect(travelStyle.getByRole("group", { name: "서브 테마 선택" })).toHaveCount(0);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "상관없음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "알차게 · 3곳", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "대략 이 정도", exact: true }).click();
  await page.getByLabel("일행 전체 예산 만원", { exact: true }).fill("1000");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("숙소 선호", { exact: true }).selectOption("가성비");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "저렴", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("검색할 객실 수", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const findNow = page.getByRole("button", { name: "트립플립 추천", exact: true });
  await expect(findNow).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("family-mobile.png"), fullPage: true });
  await findNow.click();
  const subThemes = page.getByRole("group", { name: "서브 테마 선택" });
  await expect(subThemes.getByRole("button", { name: "없음", exact: true })).toHaveAttribute("aria-pressed", "true");
  await subThemes.getByRole("button", { name: "관광", exact: true }).click();
  await subThemes.getByRole("button", { name: "액티비티", exact: true }).click();
  await expect(subThemes.getByRole("button", { name: "관광", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(subThemes.getByRole("button", { name: "휴양", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "이 조건으로 확정", exact: true }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByText("성인 4명 · 자녀 2명", { exact: true })).toBeVisible();
  const query = await page.evaluate(() => JSON.parse(localStorage.getItem("tripflip.flow.query") ?? "{}"));
  expect(query.members).toHaveLength(6);
  expect(query.children.map((child: { actualAge: number }) => child.actualAge)).toEqual([1, 8]);
  expect(query.interests).toEqual(["휴양", "액티비티"]);
  expect(query.totalBudgetKrw).toBe(10_000_000);
  expect(query.roomCount).toBe(3);
  await noHorizontalOverflow(page);
  await expect(page.locator(".rank-card .rank-brief").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("results-brief.png") });
  await page.locator(".rank-card").filter({ hasText: "나트랑" }).getByRole("link", { name: /^자세히 보기/ }).click();
  await expect(page).toHaveURL(/\/r\/NT$/);
  await expect(page.getByRole("heading", { name: "나트랑", exact: true })).toBeVisible();
  // 추천 이유(테마별 대표 명소)는 관광지 탭 맨 위로 옮김(11/24)
  await page.getByRole("tab", { name: "관광지", exact: true }).click();
  const themeRow = page.locator(".why-box .theme-row").first();
  await expect(themeRow).toBeVisible();
  await expect(themeRow.locator(".theme-count")).toHaveText(/등 \d+곳/);
  // 캡처에서 발생한 긴 대표명 회귀 사례: 실 데이터는 수정하지 않고 DOM에서만 검사.
  await themeRow.locator(".theme-detail").evaluate((el) => {
    el.innerHTML = '<b>액티비티</b> · 순록 유목민 캠프<span class="theme-count muted"> 등 11곳</span>';
  });
  for (const width of [390, 375, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await noHorizontalOverflow(page);
    const clippedCount = await page.locator(".why-box .theme-count").evaluateAll((items) =>
      items.some((el) => {
        const card = el.closest(".why-box");
        if (!card) return true;
        const countRect = el.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        return countRect.left < cardRect.left || countRect.right > cardRect.right - 8;
      }),
    );
    expect(clippedCount).toBe(false);
    if (width >= 375) {
      const singleLine = await themeRow.locator(".theme-detail").evaluate((el) => {
        const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
        return el.getBoundingClientRect().height <= lineHeight + 1;
      });
      expect(singleLine).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("tab-sights.png") });
  await page.getByRole("tab", { name: "예약", exact: true }).click();
  await expect(page.getByText("공항 픽업", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tab-book.png"), fullPage: true });
  await page.getByRole("tab", { name: "음식점", exact: true }).click();
  await expect(page.locator(".place-row").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tab-food.png") });
  await page.getByRole("tab", { name: "일정", exact: true }).click();

  await expect(page.getByText("일정 테마 · 휴양 + 액티비티", { exact: true })).toBeVisible();
  const days = page.locator(".day-card");
  await expect(days).toHaveCount(11);
  await expect(days.first().getByRole("button", { name: /^오전/ })).toContainText("도착·체크인");
  await expect(days.last().getByRole("button", { name: /^오후/ })).toContainText("공항 이동");
  await expect(days.nth(1).getByRole("button", { name: /^야간/ })).toBeVisible();
  await expect(days.last().getByRole("button", { name: /^야간/ })).toHaveCount(0);
  await days.nth(1).getByRole("button", { name: /^오전/ }).click();
  await page.getByRole("dialog", { name: "2일차 오전 바꾸기", exact: true }).getByRole("button", { name: "숙소 휴식", exact: true }).click();
  await days.nth(1).getByLabel("2일차 하루 설정", { exact: true }).click();
  await days.nth(1).getByLabel("2일차 음식 종류", { exact: true }).selectOption("local");
  await days.nth(1).getByLabel("디저트 추가", { exact: true }).check();
  await page.getByRole("button", { name: "일정 다시 추천", exact: true }).click();
  await expect(days.nth(1).getByRole("button", { name: /^오전/ })).toContainText("숙소 휴식");
  await expect(days.nth(1).getByRole("button", { name: /^디저트/ })).toBeVisible();
  await noHorizontalOverflow(page);

  await days.nth(1).getByRole("link", { name: "시간표", exact: true }).click();
  await expect(page).toHaveURL(/\/r\/NT\/day\/2$/);
  await page.getByLabel("조식을 먹어요", { exact: true }).uncheck();
  await page.getByLabel("기상 시간", { exact: true }).selectOption("08:30");
  await expect(page.getByLabel("조식 시간", { exact: true })).toBeDisabled();
  await expect(page.locator(".tt")).not.toContainText("조식");
  await page.getByRole("link", { name: "나트랑 일정", exact: true }).click();
  await page.getByRole("button", { name: /^이 지역으로 NEXT/ }).click();
  await expect(page.getByRole("tab", { name: "예약", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: /^예약 상태 체크하고/ }).click();
  await expect(page).toHaveURL(/\/book\/NT$/);
  await page.getByLabel("숙소 수준", { exact: true }).selectOption("프리미엄");
  await page.getByLabel("항공 선호", { exact: true }).selectOption("lowcost");
  await page.getByLabel("검색할 객실 수", { exact: true }).selectOption("2");
  const flight = new URL(await page.getByRole("link", { name: "스카이스캐너", exact: true }).getAttribute("href") ?? "");
  const cj = new URL(await page.getByRole("link", { name: "아고다 검색", exact: true }).getAttribute("href") ?? "");
  expect(cj.hostname).toBe("www.tkqlhce.com"); // CJ 딥링크로 감싼 아고다
  const hotel = new URL(cj.searchParams.get("url") ?? "");
  expect(flight.searchParams.get("adultsv2")).toBe("4");
  expect(flight.searchParams.get("childrenv2")).toBe("1|8");
  expect(hotel.searchParams.get("rooms")).toBe("2");
  expect(hotel.searchParams.get("adults")).toBe("4");
  expect(hotel.searchParams.get("childages")).toBe("1,8");
  await expect(page.getByLabel("항공권 예약 완료 (직접 확인)", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("숙소 예약 완료 (직접 확인)", { exact: true })).not.toBeChecked();
  const saveResponse = page.waitForResponse((response) => {
    const request = response.request();
    if (response.url() !== `${STATS_ORIGIN}/plans` || request.method() !== "POST") return false;
    const body = request.postDataJSON() as { put?: SavedPlan[] };
    return !!body.put?.length;
  });
  await page.getByRole("button", { name: "일정과 함께 내 여행에 저장", exact: true }).click();
  const response = await saveResponse;
  expect(response.ok()).toBe(true);
  const ack = await response.json() as { ok: boolean; uid: string; saved: string[]; plans: SavedPlan[] };
  expect(ack.ok).toBe(true);
  expect(ack.uid).toBe(E2E_AUTH.uid);
  expect(ack.saved).toHaveLength(1);
  await expect(page).toHaveURL(/\/my-trips$/);
  await expect(page.getByText("✓ 계정에 저장됨", { exact: true })).toBeVisible();
  await expect(page.getByText("항공 미예약", { exact: true })).toBeVisible();
  await expect(page.getByText("숙소 미예약", { exact: true })).toBeVisible();
  const readAccountPlans = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), accountPlansKey) as Promise<SavedPlan[]>;
  const originalPlans = await readAccountPlans();
  expect(originalPlans).toEqual(ack.plans);
  expect(ack.saved).toEqual(originalPlans.map((p) => p.id));
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").puts, accountPendingKey)).toEqual({});
  expect(await page.evaluate(() => localStorage.getItem("tripflip.flow.plans"))).toBeNull();
  expect(originalPlans).toHaveLength(1);
  const original = originalPlans[0];
  expect(original.query.stay).toBe("프리미엄");
  expect(original.query.roomCount).toBe(2);
  expect(original.flightPreference).toBe("lowcost");
  expect(original.board?.days[1].cells["오전"]).toEqual({ v: "rest", lock: true });
  expect(original.prefs?.breakfastEnabled).toBe(false);
  // 계정 캐시를 없애도 서버에서 원래 일정을 다시 받아 복원해야 한다.
  await page.evaluate((key) => localStorage.removeItem(key), accountPlansKey);
  await page.reload();
  await expect(page.getByRole("link", { name: /^나트랑/ })).toBeVisible();
  await expect(page.getByText("✓ 계정에 저장됨", { exact: true })).toBeVisible();
  expect(await readAccountPlans()).toEqual(originalPlans);

  await expect(page.getByRole("button", { name: "계획 파일 내려받기" })).toHaveCount(0);

  // 같은 권역으로 다른 초안을 만들어도 저장된 계획은 독립적으로 복원돼야 한다.
  await page.goto("/");
  await page.getByRole("button", { name: /^(여행지 추천 받기|조건 이어서 고르기)$/ }).click();
  // Restore whichever slide the draft last used, then move back to the date slide.
  for(let i=0;i<11 && !(await page.getByRole("heading",{name:"언제 떠나요?"}).isVisible());i++){
    if(await page.getByRole("button",{name:"이전",exact:true}).isVisible()) await page.getByRole("button", { name: "이전", exact: true }).click();
    else await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await pickRange(page, "2027-06-01", "2027-06-04");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "8시간", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "보통 · 2곳", exact: true }).click();
  await page.getByRole("button", { name: "트립플립 추천", exact: true }).click();
  await page.getByRole("button", { name: "이 조건으로 확정", exact: true }).click();
  await expect(page).toHaveURL(/\/results$/);
  await page.goto("/r/NT");
  await expect(page.locator(".day-card")).toHaveCount(4);
  await page.getByRole("button", { name: "일정 다시 추천", exact: true }).click();
  await page.goto("/my-trips");
  await page.getByRole("link", { name: /^나트랑/ }).click();
  await expect(page).toHaveURL(new RegExp(`/r/NT\\?plan=${original.id}$`));
  await expect(page.locator(".day-card")).toHaveCount(11);
  await expect(page.locator(".day-card").nth(1).getByRole("button", { name: /^오전/ })).toContainText("숙소 휴식");
  await expect(page.locator(".day-card").nth(1).getByRole("button", { name: /^야간/ })).toBeVisible();
  await page.locator(".day-card").nth(1).getByLabel("2일차 하루 설정", { exact: true }).click();
  await expect(page.locator(".day-card").nth(1).getByLabel("2일차 음식 종류", { exact: true })).toHaveValue("local");
  await page.locator(".day-card").nth(1).getByRole("link", { name: "시간표", exact: true }).click();
  await expect(page.getByLabel("조식을 먹어요", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("기상 시간", { exact: true })).toHaveValue("08:30");
  await noHorizontalOverflow(page);
  expect(await readAccountPlans()).toEqual(originalPlans);
  expect(await page.evaluate(() => localStorage.getItem("tripflip.flow.plans"))).toBeNull();
  await page.goto("/data-status");
  await expect(page.getByRole("heading", { name: "데이터 출처와 확인 상태", exact: true })).toBeVisible();
  await expect(page.getByText("출처 검토 자료 · 권역 5곳, 장소 10곳", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "원문 확인", exact: true })).toHaveCount(10);
  await noHorizontalOverflow(page);
  expect(runtimeErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(summaryRequests).toBeGreaterThan(0);
});

test("식당 선택은 종류·검색·8개 후보로 시작하고 출처는 펼쳐서 확인한다", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^(여행지 추천 받기|조건 이어서 고르기)$/ }).click();
  await expect(page.getByRole("button", { name: "트립플립 추천", exact: true })).toBeVisible();
  // 1단계 첫 질문만 보이고, 날짜·2·3단계는 아직 펼치지 않는다.
  await expect(page.getByRole("heading", { name: "누구랑 가나요?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다음 달", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "알차게 · 3곳", exact: true })).toHaveCount(0);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("simple-home-mobile.png"), fullPage: true });
  await page.goto("/r/NT");
  const day = page.locator(".day-card").nth(1);
  await expect(day.locator(".board-ctl")).not.toBeVisible();
  await day.getByRole("button", { name: /^점심/ }).click();
  const sheet = page.getByRole("dialog", { name: "2일차 점심 바꾸기", exact: true });
  await expect(sheet.locator(".choice-card")).toHaveCount(8);
  await expect(sheet.locator(".fg")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /후보 더 보기/ })).toBeVisible();
  await sheet.getByRole("button", { name: "서양식", exact: true }).click();
  await expect(sheet.locator(".choice-card").first()).toBeVisible();
  await sheet.getByRole("button", { name: "전체", exact: true }).click();
  await sheet.getByLabel("후보 이름 또는 태그 검색", { exact: true }).fill("Lac Canh");
  await expect(sheet.locator(".choice-card")).toHaveCount(1);
  await sheet.locator("summary").click();
  await expect(sheet.getByRole("link", { name: "Wikivoyage 기존 자료", exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("dining-picker-mobile.png") });
  await sheet.getByRole("button", { name: /Lac Canh/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(day.getByRole("button", { name: /^점심/ })).toContainText("Lac Canh");
});

test("추천 상단에서 고른 서브 테마가 PC 일정에 즉시 반영되고 모바일 새로고침에도 유지된다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 920 });
  await page.addInitScript(() => {
    const key = "tripflip.flow.query";
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      startDate: "2027-05-10", endDate: "2027-05-15", adults: 2, children: [],
      elders: false, pet: false, main: "관광", subs: [], interests: ["관광"],
      perDay: 2, price: "상관없음", stay: "가심비", maxFlightHours: 8,
    }));
  });
  await page.goto("/results");
  const detail = page.getByRole("complementary", { name: "선택한 권역 상세" });
  await expect(detail.getByText("일정 테마 · 관광", { exact: true })).toBeVisible();
  const picker = page.getByRole("group", { name: "서브 테마 선택" });
  await picker.getByRole("button", { name: "미식", exact: true }).click();
  await expect(detail.getByText("일정 테마 · 관광 + 미식", { exact: true })).toBeVisible();
  await picker.getByRole("button", { name: "휴양", exact: true }).click();
  await expect(detail.getByText("일정 테마 · 관광 + 휴양", { exact: true })).toBeVisible();
  await expect(picker.getByRole("button", { name: "미식", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.reload();
  await expect(picker.getByRole("button", { name: "휴양", exact: true })).toHaveAttribute("aria-pressed", "true");
  await noHorizontalOverflow(page);
  await page.locator(".rank-card").first().getByRole("link", { name: /^자세히 보기/ }).click();
  await expect(page.getByText("일정 테마 · 관광 + 휴양", { exact: true })).toBeVisible();
  await page.goto("/results");
  await picker.getByRole("button", { name: "없음", exact: true }).click();
  await expect(picker.getByRole("button", { name: "없음", exact: true })).toHaveAttribute("aria-pressed", "true");
  const interests = await page.evaluate(() => JSON.parse(localStorage.getItem("tripflip.flow.query") ?? "{}").interests);
  expect(interests).toEqual(["관광"]);
});

test("고비사막: 2028년 일정은 그대로 두고 아고다에 자동 예약 날짜를 보내지 않는다", async ({ page, baseURL }) => {
  await page.clock.setFixedTime(new Date("2026-11-27T12:13:00Z"));
  const origin = new URL(baseURL!).origin;
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin === STATS_ORIGIN && url.pathname === "/me") return route.fallback();
    return route.abort();
  });
  const itinerary = {
    startDate: "2028-10-13", endDate: "2028-10-16", adults: 2, children: [], elders: false, pet: false,
    main: "휴양", subs: ["액티비티"], interests: ["휴양", "액티비티"], perDay: 2, price: "상관없음", stay: "가심비",
  };
  await page.addInitScript((query) => localStorage.setItem("tripflip.flow.query", JSON.stringify(query)), itinerary);
  const targetOf = async (name: RegExp) => {
    const link = page.getByRole("link", { name });
    const href = await link.getAttribute("href");
    return new URL(new URL(href!).searchParams.get("url")!);
  };
  for (const path of ["/r/mon-gobi", "/book/mon-gobi"]) {
    await page.goto(path);
    if (path.startsWith("/r")) await page.getByRole("tab", { name: "예약", exact: true }).click();
    await expect(page.getByText(/귀국일이 360일보다 멀어/)).toBeVisible();
    await expect(page.getByText(/체크인까지 365일 이내/)).toBeVisible();
    await expect(page.getByText(/도착은 울란바토르/)).toBeVisible();
    await expect(page.getByText("숙소 검색 지역: 달란자드가드")).toBeVisible();
    expect((await targetOf(/^아고다 항공/)).pathname).toBe("/ko-kr/flights");
    const hotel = await targetOf(/^아고다 (고비사막 호텔|검색)/);
    expect(hotel.searchParams.get("city")).toBe("725293");
    expect(hotel.searchParams.has("checkIn")).toBe(false);
    expect(hotel.searchParams.has("checkOut")).toBe(false);
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem("tripflip.flow.query") ?? "{}"));
    expect(data).toEqual(itinerary);
  }
});
