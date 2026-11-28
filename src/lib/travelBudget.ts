/** Keep saved/shared budgets in total KRW; only the UI takes a per-traveler amount. */
export function perTravelerKrw(total: number, travelers: number): number {
  return Math.round(total / Math.max(1, travelers));
}

export function totalBudgetFromManwon(amount: string, travelers: number): number {
  return Math.round(Number(amount) * 10_000) * Math.max(1, travelers);
}

export function budgetManwon(won: number): string {
  return (won / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 4 });
}
