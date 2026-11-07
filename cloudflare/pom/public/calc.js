// POM 계산 로직. 화면 코드와 분리해 두어 테스트할 수 있게 한다 (node --test tests/).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.POM_CALC = api;
})(typeof self !== 'undefined' ? self : this, function () {

  const sum = (list, fn = x => x) => list.reduce((s, x) => s + (Number(fn(x)) || 0), 0);

  // ── 거래 ──────────────────────────────────────────────
  // 원장 + 사용자 수정(overrides) + 수기 입력(manual)을 합친다
  function mergeTransactions(base, overrides = {}, manual = []) {
    return [...base, ...manual].map(tx => ({ ...tx, ...(overrides[tx.id] || {}) }));
  }

  // 지출 금액: 지출은 +, 환불은 -, 수입·이체는 0
  function spendAmount(tx) {
    if (tx.kind === 'refund') return -Math.abs(tx.amount);
    if (tx.kind === 'income' || tx.kind === 'transfer' || tx.kind === 'test') return 0;
    return tx.amount;
  }
  const isSpend = tx => !['income', 'transfer', 'test'].includes(tx.kind);

  const monthKey = date => String(date).slice(0, 7);
  function periodKey(date, period) {
    const y = String(date).slice(0, 4), m = Number(String(date).slice(5, 7));
    if (period === 'quarter') return `${y} Q${Math.ceil(m / 3)}`;
    if (period === 'half') return `${y} ${m <= 6 ? '상반기' : '하반기'}`;
    if (period === 'year') return y;
    return monthKey(date);
  }

  function inMonth(txs, month) { return txs.filter(t => monthKey(t.date) === month); }
  function months(txs) { return [...new Set(txs.map(t => monthKey(t.date)))].sort(); }

  // 피벗: 기간 × (카테고리 | 대상) 지출 합계
  function pivot(txs, period, keyFn) {
    const cells = {}, keys = new Set();
    txs.filter(isSpend).forEach(t => {
      const p = periodKey(t.date, period), k = keyFn(t);
      keys.add(k);
      cells[p] ??= {};
      cells[p][k] = (cells[p][k] || 0) + spendAmount(t);
    });
    const periods = Object.keys(cells).sort();
    const keyTotals = {};
    periods.forEach(p => Object.entries(cells[p]).forEach(([k, v]) => { keyTotals[k] = (keyTotals[k] || 0) + v; }));
    return {
      periods,
      keys: [...keys].sort((a, b) => (keyTotals[b] || 0) - (keyTotals[a] || 0)),
      cells,
      totals: Object.fromEntries(periods.map(p => [p, sum(Object.values(cells[p]))]))
    };
  }

  function groupSum(txs, keyFn) {
    const map = {};
    txs.filter(isSpend).forEach(t => { const k = keyFn(t); map[k] = (map[k] || 0) + spendAmount(t); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  // ── 카드사 ────────────────────────────────────────────
  // '우리카드 4161', '현대카드 대한항공030', 'KB국민카드 9718' 처럼 끝자리·상품명이 달라도 카드사 하나로 묶는다
  const ISSUERS = [
    ['KB국민카드', /국민|\bKB/i], ['신한카드', /신한/], ['삼성카드', /삼성/], ['현대카드', /현대/],
    ['우리카드', /우리/], ['롯데카드', /롯데/], ['NH농협카드', /농협|\bNH/i], ['하나카드', /하나/], ['BC카드', /\bBC/i]
  ];
  function cardIssuer(card) {
    const s = String(card || '').trim();
    if (!s) return '기타';
    const hit = ISSUERS.find(([, re]) => re.test(s));
    return hit ? hit[0] : s.replace(/\s*\d{3,}$/, '').trim() || '기타';
  }
  // 카드사별 지출 합계·건수 (금액 큰 순)
  function byCardIssuer(txs) {
    const map = {};
    txs.filter(isSpend).forEach(t => {
      const k = cardIssuer(t.card);
      map[k] ??= { issuer: k, amount: 0, count: 0 };
      map[k].amount += spendAmount(t);
      if (t.kind !== 'refund') map[k].count += 1;
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }

  // ── 할부 ──────────────────────────────────────────────
  // 결제(승인)는 당월이지만 실제로는 나눠 내므로, 월별 소비에는 개월 수만큼 나눠 반영한다
  const INSTALLMENT_OPTIONS = [1, 2, 3, 4, 5, 6, 12, 18, 24];
  function installmentOf(tx) {
    const n = Math.floor(Number(tx.installment) || 0);
    if (n >= 1) return n;
    const m = String(tx.raw || '').match(/(\d{1,2})\s*개월/);
    return m ? Math.max(1, Number(m[1])) : 1;
  }
  function addMonths(date, k) {
    const y = Number(String(date).slice(0, 4)), m = Number(String(date).slice(5, 7)), d = Number(String(date).slice(8, 10)) || 1;
    const t = new Date(Date.UTC(y, m - 1 + k, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
  }
  // 카드 결제일·이용기간: { payDay: 결제일, endDay: 이용기간 끝(당월 ○일) } → 이용기간은 '전월 (endDay+1)일 ~ 당월 endDay일'
  // 예) 25일 결제·전월 12일~당월 11일 = {payDay:25,endDay:11}. endDay 0 = 전월 1일~전월 말일
  // 예전 형식 {startDay, lag}도 읽는다(lag 2 = 전전월~전월)
  function billingEndDay(cfg) {
    if (cfg.endDay != null) return { end: Number(cfg.endDay) || 0, lag: 1 };
    const start = Number(cfg.startDay) || 1, lag = Number(cfg.lag) || 1;
    return { end: start - 1, lag };
  }
  function billingDate(date, cfg) {
    if (!cfg || !cfg.payDay) return date;
    const { end, lag } = billingEndDay(cfg);
    const day = Number(String(date).slice(8, 10)) || 1;
    // 이용기간이 끝나는 달(당월) = 사용일이 끝일 이하면 그 달, 아니면 다음 달
    const endMonth = addMonths(monthKey(date) + '-01', day <= end ? 0 : 1);
    const payMonth = addMonths(endMonth, lag - 1);
    return addMonths(payMonth.slice(0, 8) + String(cfg.payDay).padStart(2, '0'), 0);
  }
  function billingPeriodLabel(cfg) {
    if (!cfg || !cfg.payDay) return '';
    const { end, lag } = billingEndDay(cfg);
    const from = lag === 2 ? '전전월' : '전월', to = lag === 2 ? '전월' : '당월';
    return end === 0 ? `${from} 1일~말일` : `${from} ${end + 1}일~${to} ${end}일`;
  }
  // 청구 기준으로 펼친다: 카드 결제일 설정이 있으면 결제일 달로 옮기고, 할부는 회차별로 나눈다.
  // 첫 회차에 나머지(원 단위 끝전)를 얹는다. uptoMonth 이후 청구분은 뺀다. cfgFor(tx)는 카드 설정을 돌려준다
  function spreadInstallments(txs, uptoMonth, cfgFor) {
    const out = [];
    txs.forEach(tx => {
      const n = installmentOf(tx);
      if (!isSpend(tx)) { out.push(tx); return; }
      const cfg = cfgFor ? cfgFor(tx) : null;
      const billDate = billingDate(tx.date, cfg);
      if (n <= 1) {
        if (billDate === tx.date) out.push(tx);
        else if (!uptoMonth || monthKey(billDate) <= uptoMonth) out.push({ ...tx, date: billDate, usedDate: tx.date });
        return;
      }
      const total = Number(tx.amount) || 0, base = Math.floor(total / n), first = total - base * (n - 1);
      for (let k = 0; k < n; k++) {
        const date = addMonths(billDate, k);
        if (uptoMonth && monthKey(date) > uptoMonth) break;
        out.push({ ...tx, id: `${tx.id}::i${k + 1}`, origId: tx.id, date, usedDate: tx.date, amount: k === 0 ? first : base,
          installment: n, installmentPart: k + 1, originalAmount: total });
      }
    });
    return out;
  }

  // ── 유류비 ────────────────────────────────────────────
  // 영문 키워드(E1 등)는 단어 경계로만 매칭해 엉뚱한 상호에 걸리지 않게 한다
  function matchesKeyword(hay, keyword) {
    const k = keyword.toUpperCase();
    if (/^[A-Z0-9 \-]+$/.test(k)) {
      const esc = k.replace(/[-\s]/g, m => '\\' + m);
      return new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`).test(hay);
    }
    return hay.includes(k);
  }
  function isFuel(tx, keywords) {
    if (tx.category === '유류비') return true;
    if (tx.category && !['미분류', '교통', '차량관리'].includes(tx.category)) return false;
    const hay = `${tx.merchant || ''} ${tx.detail || ''} ${tx.raw || ''}`.toUpperCase();
    return keywords.some(k => matchesKeyword(hay, k));
  }
  // 차량별 유류비: tx.vehicle → 카드 기본 차량 → '미지정'
  function fuelByVehicle(txs, keywords, vehicleByCard = {}) {
    const out = { _unassigned: [] };
    txs.filter(isSpend).filter(t => isFuel(t, keywords)).forEach(t => {
      const v = t.vehicle || vehicleByCard[t.card] || '_unassigned';
      (out[v] ??= []).push(t);
    });
    return out;
  }

  // ── 자산·부채 ─────────────────────────────────────────
  function monthlyCost(l) {
    if (l.monthlyPayment) return l.monthlyPayment;
    return Math.round((l.balance || 0) * (l.rate || 0) / 100 / 12);
  }
  function balanceSheet(data, accountBalances = {}) {
    const a = data.assets, inv = data.investments;
    const realEstate = sum(a.realEstate, x => x.value);
    const vehicles = sum(a.vehicles, x => x.value);
    const accounts = data.accounts.map(x => ({ ...x, balance: accountBalances[x.id] ?? x.balance }));
    const cash = sum(accounts.filter(x => x.balance != null), x => x.balance);
    const missingAccounts = accounts.filter(x => x.balance == null).length;
    const stocks = inv.stocks.value || 0;
    const coin = Math.round((inv.coin.usd || 0) * (data.settings.usdKrw || 0));
    const liabilities = sum(data.liabilities, x => x.balance);
    const totalAssets = realEstate + vehicles + cash + stocks + coin;
    return {
      realEstate, vehicles, cash, stocks, coin, investments: stocks + coin,
      accounts, missingAccounts, totalAssets, liabilities,
      netWorth: totalAssets - liabilities,
      monthlyDebtCost: sum(data.liabilities, monthlyCost)
    };
  }

  // ── 차량 가액 자동 감가 ─────────────────────────────────
  // 기준 가액(base)과 기준일(at)에서 연 감가율(rate, 예: 0.12)만큼 매일 조금씩 줄어든다고 보고 오늘 가액을 추정
  function vehicleValue(base, at, rate, today) {
    if (!base) return 0;
    const days = Math.max(0, (Date.parse(String(today).slice(0, 10)) - Date.parse(String(at).slice(0, 10))) / 864e5);
    if (!Number.isFinite(days)) return base;
    return Math.round(base * Math.pow(1 - (rate || 0), days / 365) / 10000) * 10000;
  }

  // ── 대출 잔액 자동 갱신 ─────────────────────────────────
  // 원리금균등(monthlyPayment + nextDate)은 상환일이 지날 때마다 잔액 × (1 + 월금리) − 월상환액으로 줄여 간다.
  // overrides[id] = { balance, limit, at }: 사용자가 직접 입력한 값. at 이후 상환일부터 다시 자동 차감
  function addMonths(date, n) {
    const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
  }
  function amortize(balance, l, firstDue, today) {
    if (!l.monthlyPayment || !firstDue) return { balance, nextDate: firstDue || null, paidCount: 0 };
    let b = balance, due = firstDue, n = 0;
    while (due <= today && b > 0 && n < 600) {
      b = Math.max(0, Math.round(b * (1 + (l.rate || 0) / 100 / 12) - l.monthlyPayment));
      due = addMonths(due, 1); n++;
    }
    return { balance: b, nextDate: due, paidCount: n };
  }
  function currentLiabilities(liabilities, overrides = {}, today) {
    const day = String(today).slice(0, 10);
    return liabilities.map(l => {
      const o = overrides[l.id] || {};
      const base = { ...l, ...(o.limit != null ? { limit: o.limit } : {}), ...(o.rate != null ? { rate: o.rate } : {}) };
      if (o.balance != null) {
        // 입력한 날 이후 첫 상환일부터 자동 차감
        let first = l.nextDate || null;
        if (first && o.at) while (first <= String(o.at).slice(0, 10)) first = addMonths(first, 1);
        const r = amortize(o.balance, base, first, day);
        return { ...base, balance: r.balance, nextDate: r.nextDate, source: 'manual', enteredAt: o.at || null };
      }
      const r = amortize(l.balance, base, l.nextDate, day);
      return { ...base, balance: r.balance, nextDate: r.nextDate, source: r.paidCount ? 'auto' : 'data' };
    });
  }

  // ── 예측 ──────────────────────────────────────────────
  // 매월: 현금 = 전월 현금 + 수입 - 고정비 - 변동비. 0 아래로 처음 내려가는 달, 마통 여유까지 써도 모자라는 달과 금액
  function forecast({ startMonth, cash, income, fixedCost, variableCost, overdraftRoom = 0, horizon = 24 }) {
    const rows = [];
    let c = cash, [y, m] = startMonth.split('-').map(Number);
    for (let i = 0; i < horizon; i++) {
      c = c + income - fixedCost - variableCost;
      rows.push({ month: `${y}-${String(m).padStart(2, '0')}`, cash: c });
      m++; if (m > 12) { m = 1; y++; }
    }
    const zero = rows.find(r => r.cash < 0);
    const loan = rows.find(r => r.cash < -overdraftRoom);
    const minCash = Math.min(cash, ...rows.map(r => r.cash));
    return {
      rows,
      monthlyNet: income - fixedCost - variableCost,
      zeroMonth: zero ? zero.month : null,
      loanMonth: loan ? loan.month : null,
      neededLoan: Math.max(0, -minCash - overdraftRoom)
    };
  }

  function nextMonth(month) {
    let [y, m] = month.split('-').map(Number);
    m++; if (m > 12) { m = 1; y++; }
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  return { sum, mergeTransactions, spendAmount, isSpend, monthKey, periodKey, inMonth, months, pivot, groupSum, cardIssuer, byCardIssuer, INSTALLMENT_OPTIONS, installmentOf, addMonths, spreadInstallments, billingDate, billingPeriodLabel,
    matchesKeyword, isFuel, fuelByVehicle, monthlyCost, balanceSheet, forecast, nextMonth, addMonths, amortize, currentLiabilities, vehicleValue };
});
