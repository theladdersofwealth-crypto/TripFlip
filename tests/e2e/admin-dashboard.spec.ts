import { expect, test } from "@playwright/test";

const nick = "테스트 회원";
const member = {
  uid: "fixture-user", nick, created: 1795700000000, last: null,
  visitsAll: 0, daysAll: 0, visits: 0, days: 0, regions: 0, flight: 0, hotel: 0, save: 0,
};

test("운영자 소셜 세션으로만 관리자 조회가 열리고 계정 전환 시 닫힌다", async ({ page }) => {
  const setAccount = async (token: string) => page.evaluate((v) => {
    localStorage.setItem("tripflip:auth", JSON.stringify({ token: v, nick: "테스트" }));
    window.dispatchEvent(new Event("tripflip:auth"));
  }, token);
  await page.route("**/me", (route) => route.fulfill({ json: { ok: true, nick: "테스트" } }));
  await page.route("**/plans", (route) => route.fulfill({ json: { ok: true, plans: [] } }));
  let health: 200 | 503 = 503;
  let memberStatus: 200 | 401 = 200;
  let deletes = 0;
  await page.route("**/stats?*", async (route) => {
    const header = route.request().headers().authorization;
    const query = new URL(route.request().url()).searchParams;
    const from = query.get("from") ?? "2026-11-21", to = query.get("to") ?? "2026-11-27";
    const days = Number(query.get("days") ?? 2);
    const status = header === "Bearer fixture-admin" ? health : 401;
    await route.fulfill({ status, json: status === 200 ? {
      ok: true, days, today: "2026-11-27", from, to, totalVisitors: 10,
      periodVisitors: 8, members: { total: 1, today: 0, activeToday: 0 },
      daily: [{ day: "2026-11-27", visitors: 4, views: 7, newVisitors: 2, steps: {} }],
      funnel: { visit: 8, outbound: 1 }, searchAreas: [], regions: [],
    } : { ok: false } });
  });
  await page.route("**/users?days=*", (route) => route.fulfill({ status: memberStatus, json: { ok: memberStatus === 200, users: [member] } }));
  await page.route("**/user?id=fixture-user*", (route) => {
    if (route.request().method() === "DELETE") deletes += 1;
    return route.fulfill({ json: {
      ok: true, devices: 0, user: member, regions: [], daily: [], recent: [], saved: [],
      identities: [{ provider: "google", emailHint: "f***@example.test" }],
      usage: { optedInSince: 1795700000000, measuredFrom: "2026-11-27", activeSeconds: 60, logins: 1, clicks: 2,
        visits: 1, saves: 1, outbound: 1, hotelOutbound: 0, otherOutbound: 0,
        recent: [{ ts: 1795700000000, kind: "login", provider: "google" }] },
    } });
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  await expect(page.getByRole("link", { name: "운영자 구글 계정으로 로그인" })).toBeVisible();
  await setAccount("ordinary-member");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("권한이 없거나");
  await setAccount("fixture-admin");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("연결하지 못했어요");
  health = 200;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("heading", { name: "트립플립 운영 현황" })).toBeVisible();
  await expect(page.getByText("오늘 방문자", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "최근 7일", exact: true }).click();
  await expect(page.getByText("최근 7일 방문자", { exact: true })).toBeVisible();
  const current = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  await page.getByLabel("시작일").fill(current);
  await page.getByLabel("종료일").fill(current);
  await page.getByRole("button", { name: "기간 적용" }).click();
  await expect(page.getByText(`조회 기간: ${current} ~ ${current}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "최근 7일", exact: true }).click();
  await page.getByRole("button", { name: "회원 이용 기록", exact: true }).click();
  await page.getByRole("searchbox", { name: "닉네임 검색" }).fill("없음");
  await expect(page.getByText("검색 결과가 없어요.")).toBeVisible();
  await page.getByRole("searchbox", { name: "닉네임 검색" }).fill("테스트");
  await page.getByRole("button", { name: nick, exact: true }).click();
  await expect(page.getByText("현재 저장된 여행 0개")).toBeVisible();
  await expect(page.getByText("연결 계정: 구글 f***@example.test")).toBeVisible();
  await expect(page.getByText("외부 예약 링크 클릭", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "이 계정 삭제(탈퇴 처리)" }).click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(deletes).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("tripflip:admin-key") === null && !document.cookie.includes("tf_admin="))).toBe(true);

  memberStatus = 401;
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("권한이 없거나");
  memberStatus = 200;
  await page.reload();
  await expect(page.getByRole("heading", { name: "트립플립 운영 현황" })).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem("tripflip:auth"); window.dispatchEvent(new Event("tripflip:auth")); });
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
});
