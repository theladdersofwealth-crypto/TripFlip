import assert from "node:assert/strict";
import test from "node:test";
import { budgetManwon, perTravelerKrw, totalBudgetFromManwon } from "../src/lib/travelBudget";

test("1인당 만원 입력은 자녀를 포함한 전원과 곱해 기존 총예산 단위로 저장한다", () => {
  assert.equal(totalBudgetFromManwon("100", 4), 4_000_000);
  assert.equal(totalBudgetFromManwon("125.5", 2), 2_510_000);
  assert.equal(totalBudgetFromManwon("", 4), 0);
});

test("기존 총예산을 1인 기준으로 읽을 때 총액을 변경하지 않는다", () => {
  const saved = { totalBudgetKrw: 10_000_000 };
  assert.equal(perTravelerKrw(saved.totalBudgetKrw, 3), 3_333_333);
  assert.equal(budgetManwon(perTravelerKrw(saved.totalBudgetKrw, 3)), "333.3333");
  assert.equal(saved.totalBudgetKrw, 10_000_000);
});
