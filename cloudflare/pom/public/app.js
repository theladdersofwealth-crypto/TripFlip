(() => {
  const data = window.POM_DATA;
  const C = window.POM_CALC;
  const app = document.getElementById('app');
  const sheetRoot = document.getElementById('sheet-root');

  // ── 로컬 저장 ──────────────────────────────────────
  const STORE_KEY = 'pom_v2';
  // 이전 대상 ID/표시명과 삭제된 카테고리를 현재 분류 체계로 통합한다.
  // 원본 거래/금액은 변경하지 않고, 앱에서 합산·표시할 때만 정규화한다.
  const MEMBER_ALIASES = Object.freeze({
    couple: 'family', junseo: 'children', junwoo: 'children',
    '우리 부부': 'family', '부부': 'family', '우리 가족': 'family',
    '준서': 'children', '준우': 'children'
  });
  const normalizeMember = id => MEMBER_ALIASES[String(id ?? '')] || String(id ?? '');
  const normalizeClassification = tx => {
    const member = normalizeMember(tx.member);
    if (tx.category === '대출이자') {
      return { ...tx, member, category:'고정비/준고정비', sub:tx.sub || '대출이자' };
    }
    return member === tx.member ? tx : { ...tx, member };
  };
  const store = loadStore();
  function loadStore() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { s = {}; }
    s.overrides ??= {}; s.manual ??= []; s.vehicles ??= {}; s.balances ??= {}; s.forecast ??= {}; s.settings ??= {}; s.rules ??= {}; s.hiddenTx ??= {}; s.remoteTxs ??= null; s.remoteSource ??= ''; s.syncUrl ??= ''; s.lastSyncedAt ??= ''; s.lastSyncError ??= ''; s.serverMeta ??= null; s.cryptoToken ??= ''; s.crypto ??= null; s.cryptoError ??= ''; s.cryptoSyncedAt ??= ''; s.stocksLive ??= null; s.loans ??= {}; s.vehicleValues ??= {}; s.accountList ??= null; s.cardList ??= null; s.stocksError ??= '';
    data.assets.vehicles.forEach(v => {
      if (s.vehicles[v.id]) return;
      try { const old = JSON.parse(localStorage.getItem('pom_vehicle_' + v.id) || 'null'); if (old) s.vehicles[v.id] = old; } catch {}
    });
    return s;
  }
  // 계좌·카드 목록(사용자가 고친 목록이 있으면 그걸 쓴다)과 차량 가액(자동 감가)을 화면 그리기 전에 반영
  const BASE = { accounts: data.accounts, cards: data.cards, vehicles: data.assets.vehicles };
  function applyUserData() {
    data.accounts = store.accountList || BASE.accounts;
    // 농협카드는 나중에 기본 목록에 들어왔으므로, 이미 카드 목록을 고친 기기에도 한 번만 넣어 준다
    if (store.cardList && !store.cardListNhAdded) {
      if (!store.cardList.some(c => C.cardIssuer(c.name) === 'NH농협카드')) {
        const nh = BASE.cards.find(c => c.id === 'nh');
        const at = store.cardList.findIndex(c => c.id === 'lotte');
        if (nh) store.cardList.splice(at < 0 ? store.cardList.length : at, 0, { ...nh });
      }
      store.cardListNhAdded = true; saveStore();
    }
    data.cards = store.cardList || BASE.cards;
    const rate = (store.settings.vehicleDepreciation ?? data.settings.vehicleDepreciation ?? 0.12);
    const today = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
    data.assets.vehicles = BASE.vehicles.map(v => {
      const o = store.vehicleValues[v.id];
      const base = o ? o.value : v.value, at = o ? o.at : (v.valuedAt || data.asOf);
      return { ...v, baseValue: base, baseAt: at, valueSource: o ? 'manual' : 'auto', value: C.vehicleValue(base, at, rate, today) };
    });
  }
  function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {} }

  const settings = () => ({ ...data.settings, ...store.settings, fuelVehicleByCard: { ...data.settings.fuelVehicleByCard, ...(store.settings.fuelVehicleByCard || {}) } });
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // 대출: 직접 입력값 > 원리금균등 자동 차감 > 초기 데이터
  const liabs = () => C.currentLiabilities(data.liabilities, store.loans, todayStr());
  const dataWithSettings = () => ({ ...data, settings: settings(), liabilities: liabs() });
  const txs = () => {
    // 실시간 POM 서버에서 정상 수신한 데이터만 원격 원장으로 인정한다.
    // 예전 Apps Script 실험값이 localStorage에 남아 있어도 새 앱 원장을 덮지 않게 한다.
    const useRemote = store.remoteSource === 'pom-server' && Array.isArray(store.remoteTxs) && store.remoteTxs.length > 0;
    // 저장된 이전 원격 동기화 결과도 렌더링 시 품목·그림 정보를 복원한다.
    const baseList = useRemote ? mergeServerTransactions(store.remoteTxs) : data.transactions;
    const merged = C.mergeTransactions(baseList, store.overrides, store.manual).filter(tx => !(store.hiddenTx || {})[tx.id]);
    return merged.map(tx => {
      const classified = !store.overrides[tx.id] && store.rules && store.rules[tx.merchant]
        ? { ...tx, ...store.rules[tx.merchant] }
        : tx;
      return normalizeClassification(classified);
    });
  };
  // 청구 기준(월별 실제 나가는 돈): 카드사별 결제일·이용기간과 할부 회차를 반영한다(이번 달까지만)
  const billingFor = tx => (store.settings.billing || {})[C.cardIssuer(tx.card)] || null;
  const spendTxs = () => {
    const now = C.monthKey(todayStr()), last = latestMonth();
    return C.spreadInstallments(txs(), last > now ? last : now, billingFor);
  };
  const baseId = id => String(id).replace(/::i\d+$/, '');
  // 거래소 연동 결과가 있으면 코인 금액은 실시간 값을 쓴다
  const coinLive = () => (store.crypto && store.crypto.ok && (store.crypto.exchanges || []).some(x => x.ok)) ? store.crypto : null;
  const coinUsd = () => coinLive() ? coinLive().totalUsd : data.investments.coin.usd;
  const coinSub = () => {
    const live = coinLive();
    if (!live) return '수동 데이터 · 거래소 연동 전';
    const syms = (live.holdings || []).slice(0, 3).map(h => h.symbol).join('·');
    const ex = live.exchanges.filter(x => x.ok).map(x => x.name).join('·');
    return `${syms || '보유 없음'} (${ex})`;
  };
  // 한국투자증권 연동 결과가 있으면 주식 금액은 실시간 값을 쓴다
  const stocksLive = () => (store.stocksLive && store.stocksLive.ok && store.stocksLive.connected) ? store.stocksLive : null;
  const sheet = () => {
    const d = dataWithSettings(), live = coinLive(), sl = stocksLive();
    if (live) d.investments = { ...d.investments, coin: { ...d.investments.coin, usd: live.totalUsd } };
    if (sl) d.investments = { ...d.investments, stocks: { ...d.investments.stocks, value: sl.totalKrw } };
    return C.balanceSheet(d, store.balances);
  };
  const memberName = id => (data.members.find(m => m.id === normalizeMember(id)) || {}).name || '대상 미지정';
  const latestMonth = () => C.months(txs()).at(-1) || C.monthKey(data.asOf);

  // ── UI 상태 ─────────────────────────────────────────
  const ui = {
    heroMode: 'summary',
    month: null,
    filterMember: 'all',
    filterCategory: 'all',
    filterCard: 'all',
    spendBasis: 'paid', // paid=결제 기준(승인한 달에 전액), billed=청구 기준(할부를 회차별로)
    searchQuery: '',
    showSpendFilter: false,
    trendPeriod: 'month',
    trendAxis: 'category',
    assetSubTab: 'overview',
    coinRange: '1W',
    openCoupangIds: {},
    openMerchantGroups: {},
    openCoupangOrders: {}
  };

  // ── 포맷 ──────────────────────────────────────────
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const num = n => new Intl.NumberFormat('ko-KR').format(Math.round(n));
  const won = n => n == null ? '미입력' : num(n) + '원';
  const signedWon = n => (n > 0 ? '+' : n < 0 ? '-' : '') + num(Math.abs(n)) + '원';
  const man = n => {
    if (n == null) return '미입력';
    const sign = n < 0 ? '-' : ''; n = Math.abs(n);
    if (n >= 1e8) { const e = Math.floor(n / 1e8), r = Math.round((n % 1e8) / 1e4); return sign + (r ? `${e}억 ${r.toLocaleString()}만원` : `${e}억원`); }
    return sign + `${Math.round(n / 1e4).toLocaleString()}만원`;
  };
  const signedMan = n => (n > 0 ? '+' : '') + man(n);
  const usd = n => (n < 0 ? '-$' : '$') + Math.abs(Number(n)).toLocaleString('en-US');
  const usd2 = n => (n < 0 ? '-$' : '$') + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signedUsd = n => (n > 0 ? '+' : n < 0 ? '-' : '') + '$' + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = n => n == null ? '-' : (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%';
  const upDown = n => n > 0 ? 'red-text' : n < 0 ? 'blue-text' : '';
  const usdPrice = n => !n ? '$0' : n >= 1 ? usd2(n) : '$' + Number(n).toPrecision(4);
  const coinAmount = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 4 : 8 });
  const monthLabel = m => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;
  const shortMonth = m => `${Number(m.slice(5, 7))}월`;
  const PALETTE = ['#0878f9', '#ffb020', '#13b67a', '#9b6bff', '#ff6b81', '#21b8d6', '#8a94a6', '#e3792b'];

  // ── 기본 선형 아이콘 ─────────────────────────────────
  function icon(name, cls = 'svg') {
    const p = {
      home:'<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
      car:'<path d="M5 17h14l-1.5-7h-11z"/><path d="M7 10 9 6h6l2 4"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
      cash:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
      stock:'<path d="M5 18v-5M10 18V9M15 18V5M20 18V2"/>',
      coin:'<circle cx="12" cy="12" r="9"/><path d="M9 7h4.3a2.3 2.3 0 0 1 0 4.6H9m0 0h5a2.5 2.5 0 0 1 0 5H9M11 5v14m3-14v2m0 10v2"/>',
      cart:'<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2 11h11l2-7H6"/>',
      card_nav:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/>',
      chart:'<path d="m3 17 5-5 4 3 7-8"/><path d="M15 7h4v4"/>',
      back:'<path d="m15 18-6-6 6-6"/>',
      bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      user:'<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
      shield:'<path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
      oil:'<path d="M4 11h8l2-3h4v4h2v5h-4l-2-3H4z"/><path d="M8 8V5M11 8V5"/>',
      fuel:'<rect x="4" y="3" width="9" height="18" rx="2"/><path d="M13 8h3l2 3v7a2 2 0 0 0 4 0V8l-2-2"/><path d="M7 7h3"/>',
      wrench:'<path d="M14 7a4 4 0 0 0-5-4l2 3-3 3-3-2a4 4 0 0 0 4 5l8 8 3-3-8-8"/>',
      calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/><path d="m8 15 2 2 5-5"/>',
      percent:'<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
      bank:'<path d="M3 9h18L12 3z"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
      layers:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/>',
      bag:'<path d="M6 8h12l1 13H5z"/><path d="M9 9a3 3 0 0 1 6 0"/>',
      game:'<path d="M8 8h8a6 6 0 0 1 5 8l-1 3a2 2 0 0 1-3 1l-3-2H10l-3 2a2 2 0 0 1-3-1l-1-3a6 6 0 0 1 5-8"/><path d="M7 12v4M5 14h4M16 13h.01M18 15h.01"/>',
      museum:'<path d="M3 9h18L12 3z"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
      search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',
      tag:'<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>',
      settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2H10V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
      receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
      link:'<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/>',
      swap:'<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
      users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 14a5 5 0 0 1 6 5"/>',
      forecast: '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 6-6"/><path d="M17 7h3v3" stroke-dasharray="2 2"/>',
      plus: '<path d="M12 5v14M5 12h14"/>'
    };
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${p[name] || p.receipt}</svg>`;
  }

  // ── 실제 브랜드 로고 & 품목 일러스트 SVG 팩토리 (6장 시안 100% 재현) ──

  // Cute UI: pure visual helpers; transaction amounts and original IDs are never modified.
  function merchantBadge(label, fg, bg, caption = '') {
    return '<div class="pom-merchant-badge" style="background:'+bg+';color:'+fg+'" role="img" aria-label="'+esc(label)+'">'+
      '<strong>'+esc(label)+'</strong>'+(caption ? '<small>'+esc(caption)+'</small>' : '')+'</div>';
  }

  function brandLogo(type) {
    switch (type) {
      case 'starbucks': return merchantBadge('★', '#00734D', '#E9F7F1', 'STAR');
      case 'twosome': return merchantBadge('T', '#8A1D37', '#FDECF0', 'A TWOSOME');
      case 'mega_coffee': return merchantBadge('M', '#181818', '#FFE458', 'MEGA');
      case 'compose': return merchantBadge('C', '#EACD30', '#252525', 'COFFEE');
      case 'ediya': return merchantBadge('E', '#24499E', '#EBF1FF', 'EDIYA');
      case 'daiso': return merchantBadge('DAISO', '#E4253A', '#FFF0F1');
      case 'cu': return merchantBadge('CU', '#632A87', '#F3E9F9');
      case 'gs25': return merchantBadge('GS25', '#0088D2', '#E7F6FF');
      case 'emart24': return merchantBadge('e24', '#E8C432', '#191919');
      case 'emart': return merchantBadge('e', '#F1AC09', '#FFFAE5', 'MART');
      case 'mcdonalds': return merchantBadge('M', '#FFC72C', '#DA291C');
      case 'lotteria': return merchantBadge('L', '#ED2636', '#FFF1F1', 'LOTTE');
      case 'burgerking': return merchantBadge('BK', '#D55A2A', '#FFF3E7');
      case 'kfc': return merchantBadge('KFC', '#D52429', '#FFF0F0');
      case 'bhc': return merchantBadge('BHC', '#F6A000', '#FFF7E8');
      case 'bbq_chicken': return merchantBadge('BBQ', '#D02229', '#FFF1F1');
      case 'kyochon': return merchantBadge('교촌', '#B61D23', '#FFF0F0');
      case 'goobne': return merchantBadge('굽네', '#B51C29', '#FFF4EB');
      case 'dominos': return merchantBadge('도미노', '#2256AA', '#F1F6FF');
      case 'pizzahut': return merchantBadge('PH', '#E6272C', '#FFF1F1', 'PIZZA');
      case 'momstouch': return merchantBadge('MOM', '#A93541', '#FFF4ED');
      case 'parisbaguette': return merchantBadge('PB', '#244F88', '#EEF5FF');
      case 'touslesjours': return merchantBadge('TLJ', '#26754F', '#F0F8F2');
      case 'baemin': return merchantBadge('배민', '#16736E', '#E2FAF7');
      case 'hospital':
        return '<div class="merchant-icon hospital-icon" role="img" aria-label="병원">'+
          '<svg viewBox="0 0 48 48" width="43" height="43" aria-hidden="true">'+
          '<rect x="2" y="2" width="44" height="44" rx="11" fill="#E8F3FF"/>'+
          '<path d="M20 8h8v12h12v8H28v12h-8V28H8v-8h12z" fill="#287AD9"/>'+
          '<path d="M13 35c4 5 18 5 22 0" fill="none" stroke="#8BB8F0" stroke-width="2.2" stroke-linecap="round"/>'+
          '</svg></div>';
      case 'seven_eleven':
        return '<div class="merchant-icon seven-icon" role="img" aria-label="세븐일레븐">'+
          '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">'+
          '<rect x="2" y="2" width="44" height="44" rx="11" fill="#F3FAF6"/>'+
          '<path d="M7 10h34v4H7z" fill="#E34A39"/>'+
          '<path d="M7 34h34v4H7z" fill="#149B63"/>'+
          '<path d="M21 15h11l-8 17h-7l7-12h-8v-5z" fill="#E04C36"/>'+
          '<path d="M10 28h27" stroke="#149B63" stroke-width="1.5"/>'+
          '</svg></div>';
      case 'ipark_mall':
        return '<div class="merchant-icon ipark-icon" role="img" aria-label="아이파크몰">'+
          '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">'+
          '<rect x="2" y="2" width="44" height="44" rx="11" fill="#ECF4FF"/>'+
          '<path d="M13 12h5v23h-5z" fill="#225DB8"/>'+
          '<path d="M22 12h9a7 7 0 0 1 0 14h-9zm5 5v4h4a2 2 0 0 0 0-4z" fill="#377DD5"/>'+
          '<path d="M23 33h13" stroke="#225DB8" stroke-width="3" stroke-linecap="round"/>'+
          '</svg></div>';
      case 'pharmacy':
        return '<div class="merchant-icon pharmacy-icon" role="img" aria-label="약국">'+
          '<svg viewBox="0 0 48 48" width="42" height="42" aria-hidden="true">'+
          '<rect x="3" y="3" width="42" height="42" rx="12" fill="#E6F8EE"/>'+
          '<path d="M20 9h8v11h11v8H28v11h-8V28H9v-8h11z" fill="#16A36D"/>'+
          '<path d="M30 32l6-6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'+
          '</svg></div>';
      case 'baskin_robbins':
        return '<div class="merchant-icon baskin-icon" role="img" aria-label="배스킨라빈스">'+
          '<svg viewBox="0 0 48 48" width="43" height="43" aria-hidden="true">'+
          '<rect x="2" y="2" width="44" height="44" rx="11" fill="#FFF4FB"/>'+
          '<text x="7" y="27" font-family="Arial,sans-serif" font-size="24" font-weight="900" fill="#284CA0">B</text>'+
          '<text x="23" y="27" font-family="Arial,sans-serif" font-size="24" font-weight="900" fill="#F1499B">R</text>'+
          '<text x="24" y="38" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="900" fill="#F1499B">31</text>'+
          '</svg></div>';
      case 'naver':
        return `<div style="width:100%;height:100%;background:#e8f9f0;display:grid;place-items:center">
          <svg width="22" height="22" viewBox="0 0 24 24"><path fill="#03c75a" d="M16.27 12.85 7.4 0H0v24h7.73V11.15L16.6 24H24V0h-7.73v12.85z"/></svg>
        </div>`;
      case 'coupang':
        return `<div style="width:100%;height:100%;background:#f8fafc;border:1px solid #eef1f6;border-radius:15px;display:grid;place-items:center;padding:2px">
          <div style="font-weight:900;font-size:11px;letter-spacing:-0.6px;line-height:1">
            <span style="color:#5c2d16">cou</span><span style="color:#e52528">p</span><span style="color:#f59e0b">a</span><span style="color:#84cc16">n</span><span style="color:#06b6d4">g</span>
          </div>
        </div>`;
      case 'oliveyoung':
        return `<div style="width:100%;height:100%;background:#f0fdf4;display:grid;place-items:center">
          <div style="font-weight:900;font-size:10px;color:#16a34a;text-align:center;line-height:1.1">OLIVE<br>YOUNG</div>
        </div>`;
      case 'binance':
        return `<div style="width:32px;height:32px;border-radius:10px;background:rgba(15,23,42,0.35);display:grid;place-items:center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#F3BA2F">
            <path d="M12 3L8.5 6.5 10.6 8.6 12 7.2 13.4 8.6 15.5 6.5 12 3zm-5.5 5.5L4 11l2.5 2.5L9 11 6.5 8.5zm11 0L15 11l2.5 2.5L20 11l-2.5-2.5zM12 9.5L9.5 12 12 14.5 14.5 12 12 9.5zm0 6.3L10.6 14.4 8.5 16.5 12 20l3.5-3.5-2.1-2.1L12 15.8z"/>
          </svg>
        </div>`;
      case 'binance_card':
        return `<div style="width:100%;height:100%;background:#fffbeb;display:grid;place-items:center">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#F3BA2F">
            <path d="M12 3L8.5 6.5 10.6 8.6 12 7.2 13.4 8.6 15.5 6.5 12 3zm-5.5 5.5L4 11l2.5 2.5L9 11 6.5 8.5zm11 0L15 11l2.5 2.5L20 11l-2.5-2.5zM12 9.5L9.5 12 12 14.5 14.5 12 12 9.5zm0 6.3L10.6 14.4 8.5 16.5 12 20l3.5-3.5-2.1-2.1L12 15.8z"/>
          </svg>
        </div>`;
      case 'bybit_card':
        return `<div style="width:100%;height:100%;background:#17181e;display:grid;place-items:center">
          <span style="font-weight:900;font-size:11px;letter-spacing:0.2px;color:#fff;font-family:Arial,sans-serif">BYB<span style="color:#f7a600">I</span>T</span>
        </div>`;
      case 'okx_card':
        return `<div style="width:100%;height:100%;background:#000;display:grid;place-items:center">
          <svg width="24" height="24" viewBox="0 0 30 30" fill="#fff"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/><rect x="10" y="10" width="10" height="10"/><rect x="0" y="20" width="10" height="10"/><rect x="20" y="20" width="10" height="10"/></svg>
        </div>`;
      case 'btc':
        return `<div style="width:100%;height:100%;background:#f7931a;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:900;font-size:20px">₿</div>`;
      case 'eth':
        return `<div style="width:100%;height:100%;background:#e2e8f0;border-radius:50%;display:grid;place-items:center">
          <svg width="22" height="22" viewBox="0 0 24 24"><polygon fill="#343434" points="12,2 5.5,12.2 12,16 18.5,12.2"/><polygon fill="#8C8C8C" points="12,2 5.5,12.2 12,9.3"/><polygon fill="#3C3C3B" points="12,17.3 5.5,13.5 12,22 18.5,13.5"/></svg>
        </div>`;
      case 'sol':
        return `<div style="width:100%;height:100%;background:#0a0f1f;border-radius:50%;display:grid;place-items:center">
          <svg width="22" height="22" viewBox="0 0 24 24">
            <defs><linearGradient id="solG" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#9945FF"/><stop offset="100%" stop-color="#14F195"/></linearGradient></defs>
            <path fill="url(#solG)" d="M5 16h12l2 2.5H7L5 16zm2-5.2h12L17 13.3H5l2-2.5zm-2-5.3h12l2 2.5H7L5 5.5z"/>
          </svg>
        </div>`;
      case 'coin_etc':
        return `<div style="width:100%;height:100%;background:#e8f0fe;border-radius:50%;display:grid;place-items:center;color:#1d4ed8;font-weight:900;font-size:18px">•••</div>`;
      case 'kis':
        return `<div style="width:100%;height:100%;background:#f8fafc;border:1px solid #eef1f6;border-radius:14px;display:grid;place-items:center;padding:2px">
          <div style="font-size:9px;font-weight:900;color:#1e293b;letter-spacing:-0.4px">true<span style="color:#ea580c">友</span>riend</div>
        </div>`;
      case 'tesla':
        return `<div style="width:100%;height:100%;background:#f1f5f9;border-radius:14px;display:grid;place-items:center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#e82127"><path d="M12 5.5c3.5 0 6.8.6 9 1.6-.5 1.1-1.6 1.5-2.8 1.5-1.4 0-2.8-.5-4.2-.7L12 19.5 10 7.9c-1.4.2-2.8.7-4.2.7-1.2 0-2.3-.4-2.8-1.5 2.2-1 5.5-1.6 9-1.6zm0-2.5c3.9 0 7.5.7 10 1.8-.3.7-.9 1.1-1.7 1.1-2.4-.9-5.3-1.4-8.3-1.4s-5.9.5-8.3 1.4c-.8 0-1.4-.4-1.7-1.1C4.5 3.7 8.1 3 12 3z"/></svg>
        </div>`;
      case 'samsung':
        return `<div style="width:100%;height:100%;background:#1428a0;border-radius:14px;display:grid;place-items:center">
          <span style="color:#fff;font-weight:900;font-size:8px;letter-spacing:0.3px">SAMSUNG</span>
        </div>`;
      case 'nvidia':
        return `<div style="width:100%;height:100%;background:#f1f5f9;border-radius:14px;display:grid;place-items:center">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#76b900"><path d="M4 7c3-2.5 8-3 12 0 2.5 2 3 5.5 0 8-3 2.5-8 2-10.5-.5-2-2-1.5-5 1-6.5 2-1.2 5-1 6.5.8 1 1.2.8 3-.5 4-1.2.8-3 .5-3.8-.5-.5-.8-.2-1.8.6-2.2.6-.3 1.4 0 1.6.6l1.3-.8c-.6-1.2-2.2-1.6-3.5-.9-1.6.9-2 3-.9 4.5 1.4 1.8 4.2 2.2 6.2.8 2.2-1.6 2.5-4.8.6-6.8-2.3-2.4-6.5-2.6-9.2-.6-3.2 2.4-3.6 6.8-.8 9.6C8 20.3 14 20.6 18 17.5c4-3.2 3.8-8.8-.4-11.8C13.2 2.5 7 3.2 4 7z"/></svg>
        </div>`;
      case 'apple_corp':
        return `<div style="width:100%;height:100%;background:#f1f5f9;border-radius:14px;display:grid;place-items:center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#1d1d1f"><path d="M16.36 12.68c.02 2.53 2.22 3.37 2.25 3.38-.02.06-.35 1.2-1.16 2.38-.7 1.02-1.43 2.03-2.57 2.05-1.12.02-1.48-.66-2.77-.66-1.29 0-1.69.64-2.75.68-1.1.04-1.94-1.1-2.65-2.11-1.44-2.08-2.54-5.88-1.06-8.45.73-1.28 2.05-2.09 3.48-2.11 1.09-.02 2.11.73 2.77.73.66 0 1.9-.9 3.2-.77.54.02 2.07.22 3.05 1.65-.08.05-1.82 1.06-1.79 3.23zM14.28 6.4c.59-.71.98-1.7.87-2.68-.84.03-1.86.56-2.46 1.27-.54.62-1.01 1.63-.88 2.59.94.07 1.89-.47 2.47-1.18z"/></svg>
        </div>`;
      default:
        return icon(type || 'bag');
    }
  }

  // 품목 일러스트 SVG (배, 사과, 캔디 — image_2.png 스타일)
  // Each Coupang/Naver item is visualized independently; avoid reading category guesses as evidence.
  function productArtKind(name, preferred = '') {
    if (['apple','pear','candy'].includes(String(preferred||''))) return preferred;
    const n = String(name || '');
    if (/사과/.test(n)) return 'apple';
    if (/(?:추황배|신고배|원황배|햇배|국산배|배\s*(?:\d+\s*(?:kg|g|개|입)|\(|,))/i.test(n)) return 'pear';
    if (/캔디|사탕|젤리|껌|초콜릿|과자|스낵|쿠키/.test(n)) return 'candy';
    if (/유정란|계란|달걀|계란판/.test(n)) return 'egg';
    if (/샌드위치|베이글|식빵|크루아상|빵|바게트/.test(n)) return 'bread';
    if (/우유|요거트|요구르트|치즈/.test(n)) return 'milk';
    if (/딸기|블루베리|라즈베리/.test(n)) return 'berry';
    if (/바나나/.test(n)) return 'banana';
    if (/귤|오렌지|레몬|한라봉/.test(n)) return 'citrus';
    if (/포도|샤인머스캣/.test(n)) return 'grape';
    if (/기저귀|분유|아기물티슈/.test(n)) return 'baby';
    if (/청소포|물티슈|휴지|키친타월|티슈/.test(n)) return 'tissue';
    if (/세제|세탁|섬유유연제|주방세제/.test(n)) return 'soap';
    if (/고기|삼겹살|소고기|돼지고기|목살|안심|등심/.test(n)) return 'meat';
    if (/쌀|밥|현미|잡곡/.test(n)) return 'rice';
    if (/채소|상추|양배추|브로콜리|시금치/.test(n)) return 'vegetable';
    if (/인형|장난감|완구|레고/.test(n)) return 'toy';
    return 'package';
  }
  function productEmoji(kind) {
    return ({egg:'🥚',bread:'🥪',milk:'🥛',berry:'🍓',banana:'🍌',
      citrus:'🍊',grape:'🍇',baby:'🍼',tissue:'🧻',soap:'🫧',
      meat:'🥩',rice:'🍚',vegetable:'🥬',toy:'🧸',package:'📦'})[kind] || '📦';
  }

  function itemIllustration(itemIcon, name = '') {
    itemIcon = productArtKind(name, itemIcon);
    if (itemIcon === 'pear') {
      return `<svg width="24" height="24" viewBox="0 0 32 32">
        <circle cx="13" cy="18" r="8" fill="#eab308"/>
        <circle cx="11" cy="16" r="2.5" fill="#fef08a" opacity="0.6"/>
        <circle cx="20" cy="19" r="7.5" fill="#ca8a04"/>
        <circle cx="19" cy="17" r="2" fill="#fde047" opacity="0.5"/>
        <path d="M13 10c0-2 1.5-3.5 3-4M20 11.5c0-1.5 1-3 2-3.5" stroke="#713f12" stroke-width="1.8" stroke-linecap="round"/>
      </svg>`;
    }
    if (itemIcon === 'apple') {
      return `<svg width="24" height="24" viewBox="0 0 32 32">
        <circle cx="14" cy="18" r="8.5" fill="#dc2626"/>
        <circle cx="11.5" cy="15.5" r="2.5" fill="#fca5a5" opacity="0.6"/>
        <path d="M14 9.5c0-2 1.5-3.5 3-4" stroke="#713f12" stroke-width="1.8" stroke-linecap="round"/>
        <ellipse cx="17" cy="8.5" rx="3" ry="1.5" transform="rotate(-20 17 8.5)" fill="#16a34a"/>
        <path d="M18 20a6 6 0 0 0 9 0z" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/>
      </svg>`;
    }
    if (itemIcon === 'candy') {
      return `<svg width="22" height="22" viewBox="0 0 24 24">
        <rect x="5" y="4" width="14" height="16" rx="3" fill="#0ea5e9"/>
        <rect x="7" y="7" width="10" height="6" rx="1.5" fill="#e0f2fe"/>
        <circle cx="12" cy="16" r="2" fill="#fff"/>
      </svg>`;
    }
    return `<span class="pom-product-emoji" aria-hidden="true">${productEmoji(itemIcon)}</span>`;
  }

  // 차량 정면 일러스트 SVG (image_6.png 우측 히어로 일러스트)
  function carHeroSvg() {
    return `<svg class="hero-car-art" viewBox="0 0 160 110" fill="none">
      <ellipse cx="80" cy="96" rx="64" ry="8" fill="rgba(0,30,90,0.35)"/>
      <rect x="22" y="68" width="22" height="22" rx="5" fill="#0f172a"/>
      <rect x="116" y="68" width="22" height="22" rx="5" fill="#0f172a"/>
      <path d="M36 22c3-5 8-8 14-8h60c6 0 11 3 14 8l12 22H24L36 22z" fill="#dbeafe" fill-opacity="0.9"/>
      <path d="M40 25h80l8 16H32l8-16z" fill="#1e3a8a" fill-opacity="0.65"/>
      <rect x="18" y="42" width="124" height="36" rx="12" fill="#eff6ff"/>
      <rect x="24" y="49" width="26" height="9" rx="4" fill="#38bdf8"/>
      <rect x="110" y="49" width="26" height="9" rx="4" fill="#38bdf8"/>
      <rect x="54" y="50" width="52" height="12" rx="4" fill="#1e3a8a"/>
      <rect x="48" y="66" width="64" height="8" rx="4" fill="#93c5fd"/>
    </svg>`;
  }

  // Visible merchant icons are derived from merchant names, not billing categories.
  // Keep this pure so new brands can be added without editing stored transactions.
  function merchantLogoKind(merchant) {
    const name=String(merchant||'').normalize('NFKC').replace(/[\s·._\-()'’]/g,'').toLowerCase();
    if (/약국|pharmacy|drugstore/.test(name)) return 'pharmacy';
    if (/소아청소년과|소아과|병원|의원|의료원|클리닉|치과|이비인후과|정형외과|한의원|안과|피부과|hospital|clinic/.test(name)) return 'hospital';
    if (/세븐일레븐|7eleven|seveneleven|^711(?:점|건대|판교|대장|$)/.test(name)) return 'seven_eleven';
    if (/아이파크몰|iparkmall/.test(name)) return 'ipark_mall';
    if (/배스킨라빈스|베스킨라빈스|배스킨로빈스|베스킨로빈스|baskinrobbins|^br31|^베라|^배라/.test(name)) return 'baskin_robbins';
    if (/스타벅스|starbucks/.test(name)) return 'starbucks';
    if (/투썸플레이스|^투썸|twosome/.test(name)) return 'twosome';
    if (/메가mgc커피|메가커피|megacoffee|megacoffee/.test(name)) return 'mega_coffee';
    if (/컴포즈커피|^컴포즈|composecoffee/.test(name)) return 'compose';
    if (/이디야|ediya/.test(name)) return 'ediya';
    if (/다이소|daiso/.test(name)) return 'daiso';
    if (/^cu(?:[가-힣]|[0-9]|$)|^씨유(?:[가-힣]|[0-9]|$)/.test(name)) return 'cu';
    if (/^gs25/.test(name)) return 'gs25';
    if (/이마트24|emart24/.test(name)) return 'emart24';
    if (/^이마트|^emart/.test(name)) return 'emart';
    if (/kfc|케이에프씨/.test(name)) return 'kfc';
    if (/bhc|비에이치씨/.test(name)) return 'bhc';
    if (/^bbq|비비큐치킨|비비큐/.test(name)) return 'bbq_chicken';
    if (/교촌/.test(name)) return 'kyochon';
    if (/굽네/.test(name)) return 'goobne';
    if (/도미노피자|dominos/.test(name)) return 'dominos';
    if (/피자헛|pizzahut/.test(name)) return 'pizzahut';
    if (/맘스터치|momstouch/.test(name)) return 'momstouch';
    if (/파리바게뜨|파리바게트|parisbaguette/.test(name)) return 'parisbaguette';
    if (/뚜레쥬르|touslesjours/.test(name)) return 'touslesjours';
    if (/맥도날드|mcdonalds/.test(name)) return 'mcdonalds';
    if (/롯데리아|lotteria/.test(name)) return 'lotteria';
    if (/버거킹|burgerking/.test(name)) return 'burgerking';
    if (/배달의민족|^배민|baemin/.test(name)) return 'baemin';
    return '';
  }

  function deliveryFoodEmoji(name) {
    const n=String(name||'');
    if (/닭똥집|똥집|순살|후라이드|양념치킨|치킨|닭강정|통닭|윙|닭발/.test(n)) return '🍗';
    if (/피자|pizza/i.test(n)) return '🍕';
    if (/햄버거|버거|와퍼|burger/i.test(n)) return '🍔';
    if (/초밥|스시|사시미|회덮밥/.test(n)) return '🍣';
    if (/냉면|라멘|라면|우동|쌀국수|국수|막국수|파스타|짜장면|짬뽕/.test(n)) return '🍜';
    if (/샐러드|포케|poke/i.test(n)) return '🥗';
    if (/국밥|곰탕|설렁탕|찌개|탕|죽|수프/.test(n)) return '🍲';
    if (/치즈케이크|케이크|아이스크림|빙수|도넛|디저트/.test(n)) return '🍰';
    if (/떡볶이|오뎅|어묵|핫도그|튀김/.test(n)) return '🍢';
    if (/김밥|주먹밥|유부초밥/.test(n)) return '🍙';
    if (/갈비|삼겹살|족발|보쌈|스테이크|소고기|돼지고기/.test(n)) return '🥩';
    if (/빵|베이글|크루아상|샌드위치|베이커리/.test(n)) return '🥪';
    if (/아메리카노|카페라떼|커피|에스프레소|밀크티|스무디/.test(n)) return '☕';
    return '🍽️';
  }
  function txLogo(tx) {
    const m = tx.merchant || '';
    if (tx.source === 'sms+eats') {
      return '<div class="tx-product-art" aria-label="음식 종류" role="img">'+deliveryFoodEmoji(m)+'</div>';
    }
    // Gmail/Naver 주문 품목은 기존 주문의 items[] 대신 개별 결제 행으로 들어온다.
    // 해당 행에도 품목 그림을 표시해 이미지가 사라지지 않도록 한다.
    if (/^sms\+(?:gmail|naver)$/.test(String(tx.source || '')) && tx.parentMerchant) {
      return '<div class="tx-product-art">'+itemIllustration('', m)+'</div>';
    }
    const merchantBrand=merchantLogoKind(m);
    if (merchantBrand) return brandLogo(merchantBrand);
    if (tx.icon === 'naver' || m.includes('네이버')) return brandLogo('naver');
    if (tx.icon === 'coupang' || m.includes('쿠팡')) return brandLogo('coupang');
    if (tx.icon === 'oliveyoung' || m.includes('올리브영')) return brandLogo('oliveyoung');
    if (tx.icon === 'museum' || m.includes('박물관')) return icon('museum');
    if (tx.icon === 'game' || m.includes('오락')) return icon('game');
    const emoji = /주유소|gs칼텍스|현대오일뱅크|s-?oil|에쓰오일/i.test(m) ? '⛽'
      : /세탁|빨래방/.test(m) ? '🧺'
      : /주차|아이파킹/.test(m) ? '🅿️'
      : /카페|커피|디저트/.test(m) ? '☕'
      : /마트|식자재|슈퍼/.test(m) ? '🛒'
      : /미용실|헤어샵|바버샵/.test(m) ? '✂️'
      : /국밥|순대|순댓|토종순|해장국|곰탕|설렁탕|감자탕|찌개|국수|칼국수|탕$/.test(m) ? '🍲'
      : /냉면|라멘|라면|우동|쌀국수|면옥|막국수/.test(m) ? '🍜'
      : /초밥|스시|횟집|회센터|오마카세/.test(m) ? '🍣'
      : /피자|pizza/i.test(m) ? '🍕'
      : /버거|burger/i.test(m) ? '🍔'
      : /치킨|통닭|chicken/i.test(m) ? '🍗'
      : /고깃집|갈비|삼겹|정육|한우|족발|보쌈|곱창|막창|숯불/.test(m) ? '🥩'
      : /반점|중화|짜장|짬뽕|마라|딤섬|만두/.test(m) ? '🥟'
      : /베이커리|제과|빵|파리바게뜨|뚜레쥬르|bakery/i.test(m) ? '🥐'
      : /분식|떡볶이|김밥/.test(m) ? '🍙'
      : /식당|한식|밥집|가든|정식|기사식당|푸드|키친|kitchen/i.test(m) ? '🍽️'
      : /골프|gc$|cc$|컨트리클럽|스크린/i.test(m) ? '⛳'
      : /택시|대리운전/.test(m) ? '🚕'
      : /문구|서점/.test(m) ? '📚' : '';
    // 가게 이름으로 못 찾으면 카테고리로 어울리는 그림을 고른다 (예: 순대국밥집 → 외식비 → 🍽️)
    const byCategory = { '외식비':'🍽️', '식비':'🍚', '간식비':'🍩', '의료':'💊', '교통':'🚌', '유류비':'⛽', '차량관리':'🔧', '골프':'⛳', '쇼핑':'🛍️', '의류비':'👕', '사치품':'💎', '육아·교육':'🧸', '통신':'📱', '보험':'🛡️', '문화/여가':'🎬', '여행경비':'✈️', '주거·관리비':'🏠', '경조사':'💐', '생활비':'🧴' }[tx.category];
    const art = emoji || (!tx.icon || tx.icon === 'bag' || tx.icon === 'receipt' ? byCategory : '');
    if (art) return '<div class="tx-product-art" aria-hidden="true">'+art+'</div>';
    return icon(tx.icon || 'bag');
  }

  // ── 하단 4탭 네비게이션 (홈 / 소비 / 자산 / 설정 — 6장 시안 100% 동일) ──
  function nav(active) {
    return `<nav class="bottom-nav">${[
      ['home', 'home', '홈'],
      ['calendar', 'calendar', '일정'],
      ['spending', 'card_nav', '소비'],
      ['assets', 'stock', '자산'],
      ['settings', 'settings', '설정']
    ].map(([s, i, l]) => `<a class="nav-item ${active === s ? 'active' : ''}" href="${s === 'calendar' ? '/calendar/' : '#/' + s}">${icon(i)}<span>${l}</span></a>`).join('')}</nav>`;
  }

  const page = (body, active) => `<main class="app-shell"><div class="page">${body}</div>${nav(active)}</main>`;

  const brandbar = () => `<header class="brandbar">
    <div class="brand">POM <span class="brand-dot"></span><small>Path of Money</small></div>
    <div class="brand-icons">
      <a class="icon-btn-rel" href="/calendar" aria-label="POM 캘린더 열기" title="캘린더">${icon('calendar')}</a>
      <button class="icon-btn-rel" data-sms-diag aria-label="알림 및 연동 상태">
        ${icon('bell')}
        <span class="noti-dot"></span>
      </button>
      <a class="icon-btn-rel" href="#/settings" aria-label="내 정보 설정">
        ${icon('user')}
      </a>
    </div>
  </header>`;

  const detailHeader = (title, back = '#/home', rightHtml = '') => `<div class="detail-head">
    <div class="detail-head-left">
      <a class="back-btn" href="${back}" aria-label="뒤로">${icon('back')}</a>
      <div class="detail-title">${esc(title)}</div>
    </div>
    ${rightHtml}
  </div>`;

  function donut(parts, label, valueText) {
    const total = C.sum(parts, p => Math.max(0, p[1]));
    let cur = 0;
    const stops = parts.map((p, i) => { const pct = total ? Math.max(0, p[1]) / total * 100 : 0; const s = `${p[2] || PALETTE[i % PALETTE.length]} ${cur}% ${cur + pct}%`; cur += pct; return s; });
    const legend = parts.slice(0, 5).map((p, i) => `<div class="legend-row"><span class="legend-key"><i class="legend-dot" style="background:${p[2] || PALETTE[i % PALETTE.length]}"></i>${esc(p[0])}</span><strong>${total ? Math.round(Math.max(0, p[1]) / total * 100) : 0}%</strong></div>`).join('');
    return `<div class="donut-block"><div class="donut" style="background:${total ? `conic-gradient(${stops.join(',')})` : 'rgba(255,255,255,.2)'}"><div class="donut-label">${esc(label)}<strong>${valueText}</strong></div></div><div class="legend">${legend || '<div class="legend-row">데이터 없음</div>'}</div></div>`;
  }

  // ── 1. 홈 화면 (#/home — image_3.png 100% 동일) ──────────────────
  function home() {
    const b = sheet(), month = latestMonth(), monthTx = C.inMonth(spendTxs(), month);
    const spend = C.sum(monthTx.filter(C.isSpend), C.spendAmount);
    const all = txs();
    const unclassified = all.filter(t => t.category === '미분류').length;
    const fc = forecastResult();
    // 이번 달 실제 현금흐름 = 이번 달 수입(거래 원장, 없으면 예측에 입력한 월 수입) − 소비(대출상환 제외) − 월 대출 상환액
    const incomeTx = C.sum(monthTx.filter(t => t.kind === 'income'), t => Math.abs(t.amount));
    const monthIncome = incomeTx || fc.inputs.income;
    const spendExDebt = C.sum(monthTx.filter(t => C.isSpend(t) && t.category !== '대출상환'), C.spendAmount);
    const outflow = spendExDebt + fc.inputs.debtCost;
    const cashflowLabel = monthIncome != null ? '이번 달 현금흐름' : '이번 달 나간 돈';
    const cashflowText = monthIncome != null ? signedMan(monthIncome - outflow) : '-' + man(outflow);

    const heroHtml = ui.heroMode === 'composition'
      ? `<section class="hero composition-hero">
          <button class="hero-corner" data-hero-toggle aria-label="숫자 보기">${icon('swap')}</button>
          <div class="composition-title">자산구조 · 소비구조</div>
          <div class="donut-wrap">
            ${donut([['부동산', b.realEstate, '#9fd0ff'], ['차량', b.vehicles, '#5aa5ff'], ['계좌', b.cash, '#ffffff'], ['투자', b.investments, '#c8e4ff']], '총자산', man(b.totalAssets))}
            ${donut(C.groupSum(monthTx, t => t.category).map((p, i) => [p[0], p[1], ['#ffcf66', '#7fd8ff', '#7ee0b2', '#c6a4ff', '#ff8fa3', '#a8b7d5'][i % 6]]), shortMonth(month) + ' 소비', man(spend))}
          </div>
        </section>`
      : `<section class="hero">
          <button class="hero-corner" data-hero-toggle aria-label="그래프 전환">${icon('chart')}</button>
          <div class="eyebrow">순자산 <span class="info-circle">i</span></div>
          <div class="hero-value">${man(b.netWorth)}</div>
          <div class="hero-grid">
            <div class="hero-stat"><label>총자산</label><strong>${man(b.totalAssets)}</strong></div>
            <div class="hero-stat"><label>총부채</label><strong>${man(b.liabilities)}</strong></div>
            <div class="hero-stat"><label>${cashflowLabel}</label><strong class="cyan-highlight">${cashflowText}</strong></div>
          </div>
        </section>`;

    const vFirst = data.assets.vehicles[0];
    const cashVal = b.missingAccounts === data.accounts.length ? '미입력' : man(b.cash);

    return page(`${brandbar()}${heroHtml}
      <section class="section list">
        <a class="list-card" href="#/realestate">
          <div class="tile-icon">${icon('home')}</div>
          <div class="tile-copy">
            <div class="tile-title">부동산</div>
            <div class="tile-sub">보유 ${data.assets.realEstate.length}건 · 매입가 기준</div>
          </div>
          <div class="tile-value">${man(b.realEstate)}</div>
          <div class="chev">›</div>
        </a>

        <a class="list-card" href="#/vehicle">
          <div class="tile-icon">${icon('car')}</div>
          <div class="tile-copy">
            <div class="tile-title">차량</div>
            <div class="tile-sub">${esc(vFirst.name)} 외 (${data.assets.vehicles.length}대)</div>
          </div>
          <div class="tile-value">${man(b.vehicles)}</div>
          <div class="chev">›</div>
        </a>

        <a class="list-card" href="#/accounts">
          <div class="tile-icon">${icon('cash')}</div>
          <div class="tile-copy">
            <div class="tile-title">저축·현금</div>
            <div class="tile-sub">예금·적금·현금 등 (${data.accounts.length}곳)</div>
          </div>
          <div class="tile-value">${cashVal}</div>
          <div class="chev">›</div>
        </a>

        <a class="list-card" href="#/invest/stocks">
          <div class="tile-icon">${icon('stock')}</div>
          <div class="tile-copy">
            <div class="tile-title">주식</div>
            <div class="tile-sub">국내·해외 주식 (한국투자 증권)</div>
          </div>
          <div class="tile-value">${man(b.stocks)}</div>
          <div class="chev">›</div>
        </a>

        <a class="list-card" href="#/invest/coin">
          <div class="tile-icon">${icon('coin')}</div>
          <div class="tile-copy">
            <div class="tile-title">코인</div>
            <div class="tile-sub">${esc(coinSub())}</div>
          </div>
          <div class="tile-value">${usd2(coinUsd())}</div>
          <div class="chev">›</div>
        </a>

        <a class="list-card" href="#/spending">
          <div class="tile-icon">${icon('cart')}</div>
          <div class="tile-copy">
            <div class="tile-title">소비</div>
            <div class="tile-sub">${shortMonth(month)} 누적 지출 (${monthTx.length}건)</div>
          </div>
          <div class="tile-value">${won(spend)}</div>
          <div class="chev">›</div>
        </a>
      </section>

      <section class="section">
        <h2 class="section-title">확인할 것</h2>
        <div class="detail-panel">
          <a class="detail-row" href="#/spending">
            <div class="tile-icon">${icon('receipt')}</div>
            <div class="tile-copy">
              <div class="tile-title">미분류 소비 ${unclassified}건</div>
              <div class="tile-sub">카테고리를 확인하고 정리해 주세요.</div>
            </div>
            <div class="chev">›</div>
          </a>
          <button class="detail-row" data-sms-diag>
            <div class="tile-icon">${icon('link')}</div>
            <div class="tile-copy">
              <div class="tile-title">자동연동 상태 확인</div>
              <div class="tile-sub">6개 카드사 SMS 및 쿠팡 Gmail 연동 상태를 확인해 주세요.</div>
            </div>
            <div class="chev">›</div>
          </button>
        </div>
      </section>`, 'home');
  }

  // ── 2. 부동산 화면 (#/realestate — image.png 100% 동일) ──────────
  function realestate() {
    const h = data.assets.realEstate[0];
    const loan = liabs().find(l => l.id === h.loanId);
    const interest = loan ? Math.round(loan.balance * loan.rate / 100 / 12) : 0;
    const principal = loan ? Math.max(0, (loan.monthlyPayment || 0) - interest) : 0;
    const netWorth = h.value - (loan?.balance || 0);

    return page(`${detailHeader('부동산')}
      <section class="hero">
        <div class="hero-corner">${icon('home')}</div>
        <div class="eyebrow">부동산 총자산 <span class="info-circle">i</span></div>
        <div class="hero-value">${man(h.value)}</div>
        <div class="hero-grid two">
          <div class="hero-stat"><label>총부채</label><strong>${man(loan?.balance)}</strong></div>
          <div class="hero-stat"><label>순자산</label><strong>${man(netWorth)}</strong></div>
        </div>
      </section>

      <section class="section">
        <div class="detail-panel">
          <div class="detail-row" style="padding:18px">
            <div class="tile-icon">${icon('home')}</div>
            <div class="tile-copy">
              <div class="tile-title" style="font-size:19px">${esc(h.name)}</div>
              <div class="tile-sub">${esc(h.address)}</div>
            </div>
            <div class="chev">›</div>
          </div>
          <div class="detail-row">
            <div class="tile-icon">${icon('layers')}</div>
            <div class="tile-copy"><div class="tile-title">평가액</div></div>
            <div class="tile-value">${man(h.value)}</div>
            <div class="chev">›</div>
          </div>
          ${loan ? `
          <div class="detail-row">
            <div class="tile-icon">${icon('bank')}</div>
            <div class="tile-copy"><div class="tile-title">주담대 잔액</div></div>
            <div class="tile-value">${man(loan.balance)}</div>
            <div class="chev">›</div>
          </div>
          <div class="detail-row">
            <div class="tile-icon">${icon('stock')}</div>
            <div class="tile-copy"><div class="tile-title">순자산</div></div>
            <div class="tile-value blue-text">${man(netWorth)}</div>
            <div class="chev">›</div>
          </div>
          <div class="detail-row">
            <div class="tile-icon">${icon('percent')}</div>
            <div class="tile-copy"><div class="tile-title">금리</div></div>
            <div class="tile-value">${loan.rate.toFixed(2)}%</div>
            <div class="chev">›</div>
          </div>
          <div class="detail-row">
            <div class="tile-icon">${icon('calendar')}</div>
            <div class="tile-copy"><div class="tile-title">상환방식</div></div>
            <div class="tile-value">${esc(loan.method)}</div>
            <div class="chev">›</div>
          </div>` : ''}
        </div>
      </section>

      ${loan ? `<section class="section">
        <div class="repayment-card">
          <div class="repayment-head">
            <h3>월 상환 내역</h3>
            <span class="info-circle" style="border-color:#8b95a1;color:#8b95a1">i</span>
          </div>
          <div class="repayment-inner">
            <div class="repay-col">
              <label>원금</label>
              <strong>${man(principal)}</strong>
            </div>
            <div class="repay-col">
              <label>이자</label>
              <strong>${man(interest)}</strong>
            </div>
            <div class="repay-col repay-highlight">
              <label>월 상환액</label>
              <strong>${man(loan.monthlyPayment)}</strong>
            </div>
          </div>
        </div>
      </section>` : ''}`, 'home');
  }

  // ── 3. 차량 화면 (#/vehicle — image_6.png 100% 동일) ──────────
  const fuelGroups = () => C.fuelByVehicle(txs(), settings().fuelKeywords, settings().fuelVehicleByCard);
  const vehicleManage = v => ({ ...v.defaultManage, ...(store.vehicles[v.id] || {}) });

  function vehicleDetail(id) {
    const vs = data.assets.vehicles;
    const v = vs.find(x => x.id === id) || vs[0];
    const m = vehicleManage(v), list = fuelGroups()[v.id] || [];
    const autoFuel = C.sum(list, C.spendAmount), manualFuel = Number(m.fuelManual || 0);
    const totalFuel = autoFuel + manualFuel;

    // 상단 차량 전환 탭 (쏘렌토 / 미니 컨트리맨)
    const carSwitch = vs.length > 1 ? `<div class="segmented vehicle-switch" style="margin-bottom:14px">
      ${vs.map(car => `<button class="${car.id === v.id ? 'active' : ''}" data-go-car="${esc(car.id)}">${esc(car.name)} (${man(car.value)})</button>`).join('')}
    </div>` : '';

    return page(`${detailHeader('차량', '#/home')}
      ${carSwitch}
      <section class="hero" style="min-height:185px">
        ${carHeroSvg()}
        <div class="eyebrow">차량 평가액 <span class="info-circle">i</span></div>
        <button class="hero-value" data-vehicle-value="${esc(v.id)}" style="margin-bottom:4px;background:none;border:0;color:inherit;padding:0;font-family:inherit;text-align:left;cursor:pointer;position:relative;z-index:3">${man(v.value)}</button>
        <div style="font-size:12px;color:rgba(255,255,255,0.85);margin-bottom:8px;max-width:58%;position:relative;z-index:3">${v.valueSource === 'manual' ? '직접 입력' : '기준'} ${man(v.baseValue)} (${esc(String(v.baseAt).slice(0, 7).replace('-', '.'))}) · 연 ${Math.round((settings().vehicleDepreciation ?? 0.12) * 100)}% 자동 감가 · 눌러서 시세 입력</div>
        <div style="font-size:17px;font-weight:700;color:rgba(255,255,255,0.92)">${esc(v.name)}</div>
      </section>

      <section class="section list vehicle-list">
        <button class="list-card" data-vehicle-edit="oil" data-vehicle-id="${esc(v.id)}">
          <div class="tile-icon">${icon('oil')}</div>
          <div class="tile-copy">
            <div class="tile-title">엔진오일</div>
            <div class="tile-sub">${esc(m.oilSub || '교환주기 확인 필요')}</div>
          </div>
          <div class="tile-right">
            <span class="status-pill blue">${esc(m.oil)}</span>
          </div>
          <div class="chev">›</div>
        </button>

        <button class="list-card" data-vehicle-edit="insurance" data-vehicle-id="${esc(v.id)}">
          <div class="tile-icon">${icon('shield')}</div>
          <div class="tile-copy">
            <div class="tile-title">보험</div>
            <div class="tile-sub">${esc(m.insuranceSub || '보험 만기일 확인 필요')}</div>
          </div>
          <div class="tile-right">
            <span class="status-pill red">${esc(m.insurance)}</span>
          </div>
          <div class="chev">›</div>
        </button>

        <button class="list-card" data-vehicle-edit="fuelManual" data-vehicle-id="${esc(v.id)}">
          <div class="tile-icon">${icon('fuel')}</div>
          <div class="tile-copy">
            <div class="tile-title">유류비</div>
            <div class="tile-sub">최근 1개월 지출</div>
          </div>
          <div class="tile-right">
            <div class="tile-value">${man(totalFuel)}</div>
          </div>
          <div class="chev">›</div>
        </button>

        <button class="list-card" data-vehicle-edit="maintenance" data-vehicle-id="${esc(v.id)}">
          <div class="tile-icon">${icon('wrench')}</div>
          <div class="tile-copy">
            <div class="tile-title">정비 기록</div>
            <div class="tile-sub">정비·수리 내역 관리</div>
          </div>
          <div class="tile-right">
            <span class="tile-sub" style="font-size:14px;font-weight:700;color:#4e5968">${esc(m.maintenance)}</span>
          </div>
          <div class="chev">›</div>
        </button>

        <button class="list-card" data-vehicle-edit="tax" data-vehicle-id="${esc(v.id)}">
          <div class="tile-icon">${icon('calendar')}</div>
          <div class="tile-copy">
            <div class="tile-title">세금/검사</div>
            <div class="tile-sub">자동차세, 정기검사 등</div>
          </div>
          <div class="tile-right">
            <span class="status-pill blue">${esc(m.tax || '확인 필요')}</span>
            ${m.taxSub ? `<span class="tile-sub">${esc(m.taxSub)}</span>` : ''}
          </div>
          <div class="chev">›</div>
        </button>
      </section>`, 'home');
  }

  function vehicleList() {
    return vehicleDetail(data.assets.vehicles[0].id);
  }

  // ── 4. 주식 상세 (#/invest/stocks — image_5.png 100% 동일) ───────
  const STOCK_LOGOS = { TSLA: 'tesla', '005930': 'samsung', NVDA: 'nvidia', AAPL: 'apple_corp' };
  function stockInitials(h) {
    const name = String(h.name || h.code || '?');
    const hue = [...name].reduce((x, c) => (x * 31 + c.charCodeAt(0)) % 360, 11);
    return `<div style="width:100%;height:100%;border-radius:50%;background:hsl(${hue} 70% 94%);color:hsl(${hue} 60% 35%);display:grid;place-items:center;font-weight:900;font-size:13px">${esc(name.slice(0, 2))}</div>`;
  }
  function stockLogo(h) {
    if (h.logo) return `<div style="width:100%;height:100%;border-radius:14px;overflow:hidden">${brandLogo(h.logo)}</div>`;
    // 종목 코드로 공개 로고 이미지를 자동으로 불러온다(종목별로 넣을 필요 없음). 못 불러오면 이름 글자로 대신한다
    // 국내(6자리 코드) = 토스증권 로고, 해외(티커) = financialmodelingprep 로고
    const code = String(h.code || '').toUpperCase();
    const src = /^\d{6}$/.test(code) ? `https://static.toss.im/png-icons/securities/icn-sec-fill-${code}.png`
      : /^[A-Z.]{1,6}$/.test(code) ? `https://financialmodelingprep.com/image-stock/${code}.png` : '';
    if (src) {
      const fallback = stockInitials(h).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      return `<img src="${esc(src)}" alt="${esc(h.name || code)}" loading="lazy" style="width:100%;height:100%;border-radius:50%;object-fit:contain;background:#fff" onerror="this.outerHTML='${fallback}'">`;
    }
    return stockInitials(h);
  }
  function stocks() {
    const sl = stocksLive(), manual = data.investments.stocks;
    const upd = sl ? new Date(sl.updatedAt) : null;
    const s = sl ? {
      broker: manual.broker, value: sl.totalKrw, pnl: sl.pnlKrw, rate: sl.rate,
      status: `KIS 실시간 · ${upd.getMonth() + 1}/${upd.getDate()} ${upd.getHours()}:${String(upd.getMinutes()).padStart(2, '0')} 기준${sl.cashKrw ? ' · 예수금 ' + man(sl.cashKrw) : ''}`
    } : { ...manual, status: store.cryptoToken ? (store.stocksError ? '연동 오류: ' + store.stocksError : manual.status) : manual.status };
    if (sl && sl.warnings && sl.warnings.length) s.status += ' · 일부 조회 오류: ' + sl.warnings.join(' / ');
    if (sl && !sl.holdings.length) s.status += ' · 조회된 보유 종목 없음 (계좌번호·상품코드 확인)';
    const holdings = sl ? sl.holdings.map(h => ({
      name: h.name, ticker: `${h.code} · ${h.market === 'KR' ? '국내주식' : '해외주식'} · ${h.qty.toLocaleString()}주`,
      value: h.valueKrw, pnl: h.pnlKrw, rate: h.rate, logo: STOCK_LOGOS[h.code], code: h.code, market: h.market, exchange: h.exchange || ''
    })) : (manual.holdings || []);

    return page(`${detailHeader('주식', '#/home')}
      <section class="hero" style="min-height:175px">
        <div class="hero-split-stock">
          <div>
            <div class="eyebrow" style="padding-right:0">주식 평가금액 <span class="info-circle">i</span></div>
            <div class="hero-value" style="margin:10px 0 0;font-size:35px">${man(s.value)}</div>
          </div>
          <div class="hero-stock-right">
            <label>평가손익</label>
            <strong>${signedMan(s.pnl)}</strong>
            <span class="hero-rate-pill">${s.rate > 0 ? '+' : ''}${s.rate.toFixed(2)}%</span>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="list-card">
          <div class="tile-icon" style="background:none;width:48px;height:48px">${brandLogo('kis')}</div>
          <div class="tile-copy">
            <div class="tile-title">${esc(s.broker)}</div>
            <div class="tile-sub" style="white-space:normal;word-break:break-all">${esc(s.status)}</div>
          </div>
          <span class="status-pill ${sl ? 'blue' : ''}" style="flex-shrink:0">${sl ? '✓ 연동 중' : '연동 전'}</span>
        </div>
      </section>

      ${(() => {
        // 투자 원금(내가 넣은 돈) 대비 지금 얼마인지: 지금 = 주식 평가금액 + 예수금
        const principal = Number(store.settings.stockPrincipal) || 0;
        const nowTotal = (Number(s.value) || 0) + (sl && sl.cashKrw ? Number(sl.cashKrw) : 0);
        const diff = nowTotal - principal, pct = principal ? diff / principal * 100 : 0;
        return `<section class="section">
          <h2 class="section-title">투자 원금 대비</h2>
          <div class="detail-panel">
            <button class="detail-row" data-stock-principal>
              <div class="tile-icon">${icon('stock')}</div>
              <div class="tile-copy">
                <div class="tile-title">${principal ? `넣은 돈 ${man(principal)}` : '투자 원금 입력하기'}</div>
                <div class="tile-sub">${principal ? `지금 ${man(nowTotal)} (평가금액+예수금)` : '지금까지 증권 계좌에 넣은 돈(입금 합계)을 넣으면 손익을 계산해요'}</div>
              </div>
              ${principal ? `<div class="tile-right"><div class="tile-value ${upDown(diff)}">${signedMan(diff)}</div><div class="${upDown(diff)}" style="font-size:13px;font-weight:800">${pct > 0 ? '+' : ''}${pct.toFixed(2)}%</div></div>` : '<div class="chev">›</div>'}
            </button>
          </div>
        </section>`;
      })()}

      <section class="section">
        <div class="section-head">
          <h2 class="section-title">보유 종목 <span style="color:#6b7684;font-weight:700">${holdings.length}개</span></h2>
          <span class="section-meta">눌러서 차트</span>
        </div>
        <div class="list">
          ${holdings.map(h => {
            const tag = h.code ? 'button' : 'div';
            return `<${tag} class="list-card${h.code ? ' tappable' : ''}" ${h.code ? `data-stock-chart="${esc(h.code)}" data-market="${esc(h.market || '')}" data-exchange="${esc(h.exchange || '')}" data-name="${esc(h.name)}"` : ''}>
              <div class="tile-icon" style="background:none;width:48px;height:48px">${stockLogo(h)}</div>
              <div class="tile-copy">
                <div class="tile-title">${esc(h.name)}</div>
                <div class="tile-sub">${esc(h.ticker)}</div>
              </div>
              <div class="tile-right">
                <div class="tile-value">${man(h.value)}</div>
                <div class="${upDown(h.pnl)}" style="font-size:13px;font-weight:800;white-space:nowrap">${signedMan(h.pnl)} (${h.rate > 0 ? '+' : ''}${h.rate.toFixed(2)}%)</div>
              </div>
            </${tag}>`;
          }).join('') || '<div class="empty">보유 종목이 없습니다.</div>'}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">관련 기능</h2>
        <div class="detail-panel">
          <a class="detail-row" href="#/assets">
            <div class="tile-icon">${icon('stock')}</div>
            <div class="tile-copy">
              <div class="tile-title">주식 리포트</div>
              <div class="tile-sub">보유 종목 수익률과 변화를 한눈에 확인하세요.</div>
            </div>
            <div class="chev">›</div>
          </a>
        </div>
      </section>`, 'home');
  }

  // ── 5. 코인 상세 (#/invest/coin) — Binance·Bybit·OKX 실시간 연동 ─────
  const COIN_RANGES = [['1D', 1], ['1W', 7], ['1M', 30], ['3M', 90]];
  function coinInitials(symbol) {
    const hue = [...symbol].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    return `<div style="width:100%;height:100%;border-radius:50%;background:hsl(${hue} 70% 94%);color:hsl(${hue} 60% 35%);display:grid;place-items:center;font-weight:900;font-size:${symbol.length > 3 ? 10 : 12}px">${esc(symbol.slice(0, 4))}</div>`;
  }
  // 코인 로고: 심볼로 공개 아이콘을 자동으로 불러온다. 코인게코(서버가 찾아 줌) → 바이낸스 → OKX → cryptocurrency-icons 순서로 시도하고, 모두 없으면 글자
  function coinLogo(symbol, auto = true) {
    symbol = String(symbol || '?').toUpperCase();
    const known = { BTC: 'btc', ETH: 'eth', SOL: 'sol' }[symbol];
    if (known) return brandLogo(known);
    const sym = symbol.replace(/^1000+(?=[A-Z])/, '').replace(/(USDT|USDC|BUSD|USD|PERP)$/, '') || symbol;
    if (!auto || !/^[A-Z0-9]{2,12}$/.test(sym)) return coinInitials(symbol);
    const lower = sym.toLowerCase();
    const srcs = [
      `https://bin.bnbstatic.com/static/assets/logos/${sym}.png`,
      `https://static.okx.com/cdn/oksupport/asset/currency/icon/${lower}.png`,
      `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${lower}.svg`
    ];
    const found = store.crypto && store.crypto.logos && store.crypto.logos[sym];
    if (found && /^https:\/\//.test(found)) srcs.unshift(found); // 서버가 코인게코에서 찾은 로고를 먼저
    const fallback = coinInitials(symbol).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return `<img src="${esc(srcs[0])}" data-srcs="${esc(srcs.slice(1).join(' '))}" alt="${esc(sym)}" loading="lazy" style="width:100%;height:100%;border-radius:50%;object-fit:contain;background:#fff" onerror="var n=(this.dataset.srcs||'').split(' ').filter(Boolean);if(n.length){this.dataset.srcs=n.slice(1).join(' ');this.src=n[0]}else{this.outerHTML='${fallback}'}">`;
  }


  function coinTrendChart(points) {
    const days = (COIN_RANGES.find(r => r[0] === ui.coinRange) || COIN_RANGES[1])[1];
    const since = Date.now() - days * 864e5;
    const pts = (points || []).filter(p => Date.parse(p.t) >= since);
    if (pts.length < 2) return `<div class="empty">추이는 3시간마다 기록돼요. 기록이 2개 이상 쌓이면 그래프가 나와요.</div>`;
    const W = 360, H = 170, L = 8, R = 8, T = 16, B = 22;
    const t0 = Date.parse(pts[0].t), t1 = Date.parse(pts.at(-1).t), vals = pts.map(p => p.usd);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(1, hi - lo);
    const X = t => L + (W - L - R) * (t1 > t0 ? (Date.parse(t) - t0) / (t1 - t0) : 0);
    const Y = v => T + (H - T - B) * (hi - v) / span;
    const line = pts.map(p => `${X(p.t).toFixed(1)},${Y(p.usd).toFixed(1)}`).join(' ');
    const first = vals[0], last = vals.at(-1), diff = last - first, color = diff >= 0 ? '#f04452' : '#3182f6';
    const label = t => { const d = new Date(t); return days <= 1 ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : `${d.getMonth() + 1}/${d.getDate()}`; };
    return `<div class="coin-trend-head"><span>${ui.coinRange} 변화</span><strong class="${upDown(diff)}">${signedUsd(diff)} (${pct(first ? diff / first * 100 : 0)})</strong></div>
      <svg viewBox="0 0 ${W} ${H}" class="trend-chart" role="img" aria-label="코인 자산 추이">
        <polygon points="${L},${H - B} ${line} ${W - R},${H - B}" fill="${color}" fill-opacity="0.08"/>
        <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
        <text x="${W - R}" y="${T - 4}" text-anchor="end" class="axis-label">최고 ${usd2(hi)}</text>
        <text x="${L}" y="${H - 6}" class="axis-label">${label(pts[0].t)}</text>
        <text x="${W - R}" y="${H - 6}" text-anchor="end" class="axis-label">${label(pts.at(-1).t)}</text>
      </svg>`;
  }
  function coin() {
    const live = coinLive(), b = sheet(), manual = data.investments.coin;
    const holdings = live ? live.holdings : (manual.holdings || []).map(h => ({ symbol: h.symbol, usd: h.usd, pnlRate: h.rate, manual: true }));
    const priced = holdings.filter(h => h.pnlUsd != null);
    const positions = live ? (live.positions || []) : [];
    // 선물 미실현 손익은 증거금 대비로 합산 (마진 잔고에는 이미 반영돼 있어 자산 합계는 그대로)
    const totalPnl = priced.reduce((s, h) => s + h.pnlUsd, 0) + positions.reduce((s, p) => s + p.pnlUsd, 0);
    const totalCost = priced.reduce((s, h) => s + (h.usd - h.pnlUsd), 0) + positions.reduce((s, p) => s + (p.marginUsd || 0), 0);
    const hasPnl = priced.length || positions.length;
    const walletName = { spot: '현물', funding: '펀딩', futures: '선물', 'coin-futures': 'COIN-M', unified: '통합', trading: '거래' };
    const updated = live ? new Date(live.updatedAt) : null;
    const exRows = live ? live.exchanges : [{ id: 'binance', name: 'Binance', connected: false }, { id: 'bybit', name: 'Bybit', connected: false }, { id: 'okx', name: 'OKX', connected: false }];
    const costLabel = { manual: '직접 입력 평단', exchange: '거래소 평단', tracking: 'POM 기록 시작가' };
    // 누적 순투입 원금(원화). 원화로 넣은 돈과 달러 잔고를 비교하려고 현재 잔고를 설정 환율로 원화 환산해 뺀다
    const principal = Number(settings().coinPrincipalKrw) || 0;

    return page(`${detailHeader('코인', '#/home')}
      ${ui.coinBack ? `<section class="hero">
        <button class="hero-corner" data-coin-flip aria-label="현재 잔액 보기">${icon('swap')}</button>
        <div class="eyebrow">원금 대비 현황 (원화)</div>
        ${principal > 0 ? `<div class="hero-value">${signedWon(b.coin - principal)}</div>
        <div class="hero-grid two">
          <button class="hero-stat" data-coin-principal style="all:unset;cursor:pointer;min-width:0"><label>누적 원금 ›</label><strong>${won(principal)}</strong></button>
          <div class="hero-stat"><label>현재 잔액</label><strong>${won(b.coin)}</strong></div>
          <div class="hero-stat"><label>손익 금액</label><strong>${signedWon(b.coin - principal)}</strong></div>
          <div class="hero-stat"><label>손익률</label><strong>${pct((b.coin - principal) / principal * 100)}</strong></div>
        </div>
        <div class="hero-note">현재 잔액 = ${usd2(live ? live.totalUsd : manual.usd)} × 환율 ${num(settings().usdKrw)}원</div>` : `<div class="hero-value" style="font-size:22px">원금 미입력</div>
        <button class="hero-note" data-coin-principal style="all:unset;cursor:pointer;text-decoration:underline">눌러서 원금 입력</button>`}
      </section>` : `<section class="hero">
        <button class="hero-corner" data-coin-flip aria-label="원금 대비 보기">${icon('swap')}</button>
        <div class="eyebrow">거래소 코인 자산</div>
        <div class="hero-value">${usd2(live ? live.totalUsd : manual.usd)}</div>
        <div class="hero-grid" style="grid-template-columns:1fr 1fr 1fr">
          <div class="hero-stat"><label>원화 잔액</label><strong>${man(b.coin)}</strong></div>
          <div class="hero-stat"><label>평가손익</label><strong>${hasPnl ? signedUsd(totalPnl) : '-'}</strong></div>
          <div class="hero-stat"><label>수익률</label><strong>${hasPnl && totalCost > 0 ? pct(totalPnl / totalCost * 100) : '-'}</strong></div>
        </div>
        <div class="hero-note">${live ? `${updated.getMonth() + 1}/${updated.getDate()} ${updated.getHours()}:${String(updated.getMinutes()).padStart(2, '0')} 기준 · 5분마다 자동 갱신` : (store.cryptoToken ? (store.cryptoError ? '연동 오류: ' + esc(store.cryptoError) : '불러오는 중…') : '수동 데이터 · 설정에서 연동 비밀번호를 넣으면 실시간으로 바뀝니다')}</div>
      </section>`}

      <section class="section">
        <h2 class="section-title">전체 코인 자산 추이</h2>
        <div class="segmented">${COIN_RANGES.map(([k]) => `<button class="${ui.coinRange === k ? 'active' : ''}" data-coin-range="${k}">${k}</button>`).join('')}</div>
        <div class="detail-panel chart-panel">${live ? coinTrendChart(live.trend) : '<div class="empty">거래소 연동 후 추이가 기록됩니다.</div>'}</div>
      </section>

      ${positions.length ? `<section class="section">
        <div class="section-head"><h2 class="section-title">선물 포지션 ${positions.length}개</h2><span class="section-meta">미실현 손익</span></div>
        <div class="detail-panel">
          ${positions.map(p => `<button class="detail-row coin-row" data-coin-chart="${esc(p.base || p.symbol)}">
              <div class="tile-icon" style="width:44px;height:44px;border-radius:50%;background:none">${coinLogo(p.base || p.symbol)}</div>
              <div class="tile-copy">
                <div class="tile-title">${esc(p.symbol)} <span class="${p.side === 'LONG' ? 'red-text' : 'blue-text'}" style="font-size:12px;font-weight:800">${p.side === 'LONG' ? '롱' : '숏'}${p.leverage ? ' ' + p.leverage + 'x' : ''}</span></div>
                <div class="tile-sub">${coinAmount(p.size)} · 진입 ${usdPrice(p.entryPrice)} → 현재 ${usdPrice(p.markPrice)}</div>
                <div class="tile-sub small">${esc(p.market)}${p.liqPrice > 0 ? ' · 청산가 ' + usdPrice(p.liqPrice) : ''} · 규모 ${usd2(p.notionalUsd)}</div>
              </div>
              <div class="tile-right">
                <div class="tile-value ${upDown(p.pnlUsd)}">${signedUsd(p.pnlUsd)}</div>
                <div class="${upDown(p.roe)}" style="font-size:13px;font-weight:800">${p.roe != null ? pct(p.roe) : '-'}</div>
              </div>
            </button>`).join('')}
        </div>
      </section>` : ''}

      <section class="section">
        <div class="section-head"><h2 class="section-title">보유 코인 ${holdings.length}종</h2><span class="section-meta">눌러서 차트·평단</span></div>
        <div class="detail-panel">
          ${holdings.map(h => `<button class="detail-row coin-row" data-coin-chart="${esc(h.symbol)}">
              <div class="tile-icon" style="width:44px;height:44px;border-radius:50%;background:none">${coinLogo(h.symbol)}</div>
              <div class="tile-copy">
                <div class="tile-title">${esc(h.symbol)}</div>
                <div class="tile-sub">${h.amount != null ? coinAmount(h.amount) + ' ' + esc(h.symbol) : '수동 데이터'}${h.change24h != null ? ` · 24h <span class="${upDown(h.change24h)}">${pct(h.change24h)}</span>` : ''}</div>
                ${h.costSource ? `<div class="tile-sub small">${costLabel[h.costSource]} ${usdPrice(h.avgPrice)}</div>` : (live ? '<div class="tile-sub small">평단 미입력</div>' : '')}
              </div>
              <div class="tile-right">
                <div class="tile-value">${usd2(h.usd)}</div>
                <div class="${upDown(h.pnlRate)}" style="font-size:13px;font-weight:800">${h.pnlRate != null ? `${h.pnlUsd != null ? signedUsd(h.pnlUsd) + ' ' : ''}(${pct(h.pnlRate)})` : '-'}</div>
              </div>
            </button>`).join('') || '<div class="empty">보유 코인이 없습니다.</div>'}
          ${live && live.dustUsd > 0 ? `<div class="detail-row"><div class="tile-copy"><div class="tile-sub">1달러 미만 소액 코인 합계 ${usd2(live.dustUsd)}</div></div></div>` : ''}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">연결 거래소</h2>
        <div class="detail-panel">
          ${exRows.map(x => `<div class="detail-row">
            <div class="tile-icon" style="background:none">${['binance', 'bybit', 'okx'].includes(x.id) ? brandLogo(x.id + '_card') : coinLogo(x.name.toUpperCase(), false)}</div>
            <div class="tile-copy"><div class="tile-title">${esc(x.name)}</div><div class="tile-sub" style="${x.connected && !x.ok ? 'white-space:normal;word-break:break-all' : ''}">${!x.connected ? 'API 키 미등록' : x.ok ? `${(x.wallets || []).map(w => walletName[w] || w).join('·') || '잔고 없음'} · 코인 ${x.coinCount}종${x.positionCount ? ` · 포지션 ${x.positionCount}개` : ''}` : '오류: ' + esc(x.error || '')}</div></div>
            <div class="tile-value">${x.ok ? usd2(x.usd) : '-'}</div>
          </div>`).join('')}
        </div>
      </section>

      <div class="info-notice-box">
        <div class="info-notice-icon">i</div>
        <div><h4>수익률 기준</h4><p>평단은 직접 입력한 값 → 거래소가 주는 평단(OKX) → POM이 처음 기록한 가격 순으로 씁니다. 코인을 누르면 가격 차트가 나오고, 거기서 평단(USD)을 입력하면 정확한 수익률이 나옵니다.</p></div>
      </div>`, 'home');
  }

  async function syncCrypto({ silent = true } = {}) {
    if (!store.cryptoToken) return;
    try {
      const res = await fetch('/api/crypto', { cache: 'no-store', headers: { 'Accept': 'application/json', 'X-POM-Token': store.cryptoToken } });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.ok) throw new Error(res.status === 401 ? '연동 비밀번호가 맞지 않습니다' : (json && json.error) || `HTTP ${res.status}`);
      store.crypto = json; store.cryptoError = ''; store.cryptoSyncedAt = new Date().toISOString();
    } catch (err) {
      store.cryptoError = String(err && err.message ? err.message : err);
    }
    await syncStocks();
    saveStore();
    if (!silent || /^#\/(home|assets|invest)|^$/.test(location.hash)) render();
  }

  async function syncStocks() {
    try {
      const res = await fetch('/api/stocks?usdKrw=' + encodeURIComponent(settings().usdKrw || 1400), { cache: 'no-store', headers: { 'Accept': 'application/json', 'X-POM-Token': store.cryptoToken } });
      const json = await res.json().catch(() => null);
      if (res.status === 404) return; // 아직 배포 전
      if (!res.ok || !json || !json.ok) throw new Error(res.status === 401 ? '연동 비밀번호가 맞지 않습니다' : (json && json.error) || `HTTP ${res.status}`);
      store.stocksLive = json; store.stocksError = '';
    } catch (err) {
      store.stocksError = String(err && err.message ? err.message : err);
    }
  }

  function openCoinCost(symbol) {
    const h = (coinLive()?.holdings || []).find(x => x.symbol === symbol);
    if (!h) return;
    openSheet(`${sheetHead(symbol + ' 평단 입력')}
      <div class="field"><label>평균 매수가 (USD, 코인 1개당)</label><input id="num-field" type="number" inputmode="decimal" step="any" value="${h.costSource === 'manual' ? esc(h.avgPrice) : ''}" placeholder="${h.avgPrice ? esc(Number(h.avgPrice.toPrecision(6))) : '예: 52000'}"></div>
      <div class="auto-box">현재가 ${usdPrice(h.amount ? h.usd / h.amount : 0)} · 보유 ${coinAmount(h.amount)} ${esc(symbol)}<br>비우고 저장하면 직접 입력값을 지우고 자동 평단으로 돌아갑니다.</div>
      <button class="save-btn" data-save>저장</button>`, root => {
      root.querySelector('[data-save]').onclick = async () => {
        const raw = root.querySelector('#num-field').value;
        root.querySelector('[data-save]').textContent = '저장 중…';
        try {
          const res = await fetch('/api/crypto', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-POM-Token': store.cryptoToken }, body: JSON.stringify({ symbol, avgPrice: raw === '' ? null : Number(raw) }) });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          closeSheet(); await syncCrypto({ silent: false });
        } catch (e) {
          root.querySelector('.auto-box').textContent = '저장 실패: ' + e.message;
          root.querySelector('[data-save]').textContent = '저장';
        }
      };
    });
  }


  // ── 보유 종목 가격 차트 (바텀시트) ── /api/chart: 코인은 거래소 캔들, 주식은 한국투자증권 시세
  const PRICE_RANGES = ['1D', '1W', '1M', '3M', '1Y'];
  const chartCache = new Map();
  function chartPrice(v, currency) { return currency === 'KRW' ? won(v) : usdPrice(v); }
  function chartTimeLabel(t, range) {
    const d = new Date(t);
    if (range === '1D') return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (range === '1Y') return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  function priceChartSvg(pts, currency, range) {
    const W = 360, H = 200, L = 6, R = 6, T = 18, B = 34;
    const vals = pts.map(p => p.c);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || hi * 0.01 || 1;
    const X = i => L + (W - L - R) * (pts.length > 1 ? i / (pts.length - 1) : 0);
    const Y = v => T + (H - T - B) * (hi - v) / span;
    const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.c).toFixed(1)}`).join(' ');
    const color = vals.at(-1) >= vals[0] ? '#f04452' : '#3182f6';
    const hiI = vals.indexOf(hi), loI = vals.indexOf(lo);
    const anchor = i => X(i) < W * 0.2 ? 'start' : X(i) > W * 0.8 ? 'end' : 'middle';
    return `<svg viewBox="0 0 ${W} ${H}" class="trend-chart price-chart" data-w="${W}" data-l="${L}" data-r="${R}" role="img" aria-label="가격 차트">
        <polygon points="${L},${H - B} ${line} ${W - R},${H - B}" fill="${color}" fill-opacity="0.08"/>
        <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
        <text x="${X(hiI).toFixed(1)}" y="${(Y(hi) - 6).toFixed(1)}" text-anchor="${anchor(hiI)}" class="axis-label">최고 ${esc(chartPrice(hi, currency))}</text>
        <text x="${X(loI).toFixed(1)}" y="${(Y(lo) + 13).toFixed(1)}" text-anchor="${anchor(loI)}" class="axis-label">최저 ${esc(chartPrice(lo, currency))}</text>
        <text x="${L}" y="${H - 5}" class="axis-label">${chartTimeLabel(pts[0].t, range)}</text>
        <text x="${W - R}" y="${H - 5}" text-anchor="end" class="axis-label">${chartTimeLabel(pts.at(-1).t, range)}</text>
        <line class="scrub-line" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#8b95a1" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>
        <circle class="scrub-dot" r="4" fill="${color}" stroke="#fff" stroke-width="2" visibility="hidden"/>
      </svg>`;
  }

  // 캔들(봉) + 볼린저밴드(20, 2) + 거래대금
  const COIN_INTERVALS = [['15m', '15분'], ['1h', '1시간'], ['4h', '4시간'], ['1d', '일'], ['1w', '주']];
  const STOCK_INTERVALS = [['D', '일봉'], ['W', '주봉'], ['M', '월봉']];
  const intraday = iv => /m$|h$/.test(iv);
  function amountLabel(v, currency) {
    if (currency === 'KRW') return v >= 1e12 ? (v / 1e12).toFixed(1) + '조원' : v >= 1e8 ? Math.round(v / 1e8).toLocaleString() + '억원' : man(v);
    const a = Math.abs(v);
    return a >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : a >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : a >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v);
  }
  function candleTimeLabel(t, iv) {
    const d = new Date(t);
    if (intraday(iv)) return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (iv === 'M' || iv === 'W' || iv === '1w') return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}${iv === 'M' ? '' : '.' + d.getDate()}`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  function candleChartSvg(pts, currency, iv) {
    const W = 360, L = 4, R = 4, T = 14, PH = 190, GAP = 26, VH = 56, B = 18, H = T + PH + GAP + VH + B;
    const n = pts.length, step = (W - L - R) / n, bw = Math.max(1.2, step * 0.62);
    const highs = pts.flatMap(p => [p.h, p.bbU].filter(Number.isFinite)), lows = pts.flatMap(p => [p.l, p.bbL].filter(Number.isFinite));
    const hi = Math.max(...highs), lo = Math.min(...lows), span = hi - lo || hi * 0.01 || 1;
    const X = i => L + step * (i + 0.5);
    const Y = v => T + PH * (hi - v) / span;
    const maxAmt = Math.max(...pts.map(p => p.amt || 0)), vTop = T + PH + GAP;
    const VY = a => vTop + VH - (maxAmt > 0 ? VH * a / maxAmt : 0);
    const UP = '#f04452', DOWN = '#3182f6';
    const band = pts.map((p, i) => [i, p]).filter(([, p]) => Number.isFinite(p.bbU));
    const pl = k => band.map(([i, p]) => `${X(i).toFixed(1)},${Y(p[k]).toFixed(1)}`).join(' ');
    const bandPoly = band.length > 1 ? `<polygon points="${pl('bbU')} ${band.slice().reverse().map(([i, p]) => `${X(i).toFixed(1)},${Y(p.bbL).toFixed(1)}`).join(' ')}" fill="#8b5cf6" fill-opacity="0.07"/>
        <polyline points="${pl('bbU')}" fill="none" stroke="#8b5cf6" stroke-width="1" stroke-opacity="0.8"/>
        <polyline points="${pl('bbL')}" fill="none" stroke="#8b5cf6" stroke-width="1" stroke-opacity="0.8"/>
        <polyline points="${pl('bbM')}" fill="none" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3 2"/>` : '';
    const bars = pts.map((p, i) => {
      const color = p.c >= p.o ? UP : DOWN, x = X(i);
      const top = Y(Math.max(p.o, p.c)), h = Math.max(1, Math.abs(Y(p.o) - Y(p.c)));
      return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(p.h).toFixed(1)}" y2="${Y(p.l).toFixed(1)}" stroke="${color}" stroke-width="1"/>
        <rect x="${(x - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"/>
        ${p.amt ? `<rect x="${(x - bw / 2).toFixed(1)}" y="${VY(p.amt).toFixed(1)}" width="${bw.toFixed(1)}" height="${(vTop + VH - VY(p.amt)).toFixed(1)}" fill="${color}" fill-opacity="0.45"/>` : ''}`;
    }).join('');
    const lastY = Y(pts.at(-1).c);
    return `<svg viewBox="0 0 ${W} ${H}" class="trend-chart price-chart candle-chart" data-w="${W}" data-l="${L}" data-r="${R}" role="img" aria-label="캔들 차트">
        ${bandPoly}
        ${bars}
        <line x1="${L}" x2="${W - R}" y1="${lastY.toFixed(1)}" y2="${lastY.toFixed(1)}" stroke="#8b95a1" stroke-width="0.6" stroke-dasharray="2 3"/>
        <text x="${W - R}" y="${T - 3}" text-anchor="end" class="axis-label">${esc(chartPrice(hi, currency))}</text>
        <text x="${W - R}" y="${T + PH + 10}" text-anchor="end" class="axis-label">${esc(chartPrice(lo, currency))}</text>
        <line x1="${L}" x2="${W - R}" y1="${vTop - 3}" y2="${vTop - 3}" stroke="#eef2f8"/>
        <text x="${L}" y="${vTop - 7}" class="axis-label">거래대금 최대 ${esc(amountLabel(maxAmt, currency))}</text>
        <text x="${L}" y="${H - 4}" class="axis-label">${esc(candleTimeLabel(pts[0].t, iv))}</text>
        <text x="${W - R}" y="${H - 4}" text-anchor="end" class="axis-label">${esc(candleTimeLabel(pts.at(-1).t, iv))}</text>
        <line class="scrub-line" x1="0" x2="0" y1="${T}" y2="${vTop + VH}" stroke="#4e5968" stroke-width="0.8" stroke-dasharray="3 3" visibility="hidden"/>
      </svg>`;
  }
  function candleInfo(p, prev, currency, iv) {
    const chg = prev ? (p.c - prev.c) / prev.c * 100 : null;
    return `<div class="candle-info">
        <div class="candle-info-top"><span>${esc(candleTimeLabel(p.t, iv))}</span>${chg != null ? `<strong class="${upDown(chg)}">${pct(chg)}</strong>` : ''}</div>
        <div class="candle-grid">
          <span>시가 <b>${esc(chartPrice(p.o, currency))}</b></span><span>고가 <b class="red-text">${esc(chartPrice(p.h, currency))}</b></span>
          <span>저가 <b class="blue-text">${esc(chartPrice(p.l, currency))}</b></span><span>종가 <b>${esc(chartPrice(p.c, currency))}</b></span>
          <span>거래대금 <b>${p.amt ? esc(amountLabel(p.amt, currency)) : '-'}</b></span>
          <span style="grid-column:1/-1"><i class="bb-dot"></i>볼린저밴드 ${Number.isFinite(p.bbU) ? `<b>${esc(chartPrice(p.bbL, currency))} ~ ${esc(chartPrice(p.bbU, currency))}</b>` : '<b>-</b>'}</span>
        </div>
      </div>`;
  }
  function bindCandleScrub(root, svg, pts, currency, iv) {
    const W = Number(svg.dataset.w), L = Number(svg.dataset.l), R = Number(svg.dataset.r);
    const ln = svg.querySelector('.scrub-line'), info = root.querySelector('[data-candle-info]');
    const orig = info.innerHTML;
    const step = (W - L - R) / pts.length;
    const move = e => {
      const box = svg.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width * W;
      const i = Math.max(0, Math.min(pts.length - 1, Math.floor((x - L) / step)));
      const px = L + step * (i + 0.5);
      ln.setAttribute('x1', px); ln.setAttribute('x2', px); ln.setAttribute('visibility', 'visible');
      info.innerHTML = candleInfo(pts[i], pts[i - 1], currency, iv);
    };
    const reset = () => { ln.setAttribute('visibility', 'hidden'); info.innerHTML = orig; };
    svg.addEventListener('pointerdown', e => { svg.setPointerCapture && svg.setPointerCapture(e.pointerId); move(e); });
    svg.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) move(e); });
    svg.addEventListener('pointerup', reset);
    svg.addEventListener('pointerleave', reset);
    svg.addEventListener('pointercancel', reset);
  }
  function openPriceChart(opts) {
    const st = { range: opts.kind === 'coin' ? '1W' : '1M', mode: 'line', interval: opts.kind === 'coin' ? '1h' : 'D', data: null, error: '', loading: false };
    const intervals = opts.kind === 'coin' ? COIN_INTERVALS : STOCK_INTERVALS;
    const key = () => [opts.kind, opts.symbol || opts.code, st.mode === 'candle' ? 'c:' + st.interval : st.range].join('|');
    const title = opts.kind === 'coin' ? opts.symbol : opts.name || opts.code;
    const draw = root => {
      const d = st.data, pts = d && d.points || [];
      const cur = d && d.currency || (opts.kind === 'coin' ? 'USD' : 'KRW');
      let body;
      if (!store.cryptoToken) body = '<div class="empty">설정에서 연동 비밀번호를 넣으면 차트가 나와요.</div>';
      else if (st.loading && !d) body = '<div class="empty">차트 불러오는 중…</div>';
      else if (st.error) body = `<div class="empty">차트를 못 불러왔어요<br><span style="font-size:12px">${esc(st.error)}</span></div>`;
      else if (pts.length < 2) body = `<div class="empty">${esc((d && d.note) || '표시할 시세가 없어요')}</div>`;
      else if (st.mode === 'candle') {
        body = `<div data-candle-info>${candleInfo(pts.at(-1), pts.at(-2), cur, st.interval)}</div>
          ${candleChartSvg(pts, cur, st.interval)}
          <div class="candle-legend"><span><i style="background:#8b5cf6"></i>볼린저밴드 20·2</span><span><i style="background:#f59e0b"></i>중심선</span><span>${esc(d.source || '')}</span></div>`;
      } else {
        const first = pts[0].c, last = pts.at(-1).c, diff = last - first;
        body = `<div class="price-chart-head">
            <div class="price-now" data-scrub-price>${esc(chartPrice(last, cur))}</div>
            <div class="${upDown(diff)} price-diff" data-scrub-diff>${st.range} ${diff >= 0 ? '+' : '-'}${esc(chartPrice(Math.abs(diff), cur))} (${pct(first ? diff / first * 100 : 0)})</div>
            <div class="price-when" data-scrub-when>${opts.kind === 'coin' ? '현재가' : st.range === '1D' ? esc(chartTimeLabel(pts.at(-1).t, '1D')) + ' 기준' : esc(chartTimeLabel(pts.at(-1).t, '1M')) + ' 종가'} · ${esc(d.source || '')}${d.note ? ' · ' + esc(d.note) : ''}</div>
          </div>
          ${priceChartSvg(pts, cur, st.range)}`;
      }
      root.querySelector('.sheet').innerHTML = `${sheetHead(title + ' 차트')}
        ${opts.sub ? `<div class="tile-sub" style="margin:-2px 2px 10px">${esc(opts.sub)}</div>` : ''}
        <div class="chart-mode">${[['line', '선'], ['candle', '캔들']].map(([m, l]) => `<button class="${st.mode === m ? 'active' : ''}" data-chart-mode="${m}">${l}</button>`).join('')}</div>
        <div class="segmented" style="margin-top:6px">${st.mode === 'candle'
          ? intervals.map(([k, l]) => `<button class="${st.interval === k ? 'active' : ''}" data-chart-interval="${k}">${l}</button>`).join('')
          : PRICE_RANGES.map(r => `<button class="${st.range === r ? 'active' : ''}" data-chart-range="${r}">${r}</button>`).join('')}</div>
        <div class="detail-panel chart-panel" style="margin-top:10px">${body}</div>
        ${opts.onCost ? '<button class="save-btn ghost" data-chart-cost style="margin-top:14px">평단 입력하기</button>' : ''}`;
      root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
      root.querySelectorAll('[data-chart-range]').forEach(b => b.onclick = () => { st.range = b.dataset.chartRange; load(root); });
      root.querySelectorAll('[data-chart-interval]').forEach(b => b.onclick = () => { st.interval = b.dataset.chartInterval; load(root); });
      root.querySelectorAll('[data-chart-mode]').forEach(b => b.onclick = () => { if (st.mode !== b.dataset.chartMode) { st.mode = b.dataset.chartMode; st.data = null; load(root); } });
      const costBtn = root.querySelector('[data-chart-cost]');
      if (costBtn) costBtn.onclick = () => opts.onCost();
      const svg = root.querySelector('.price-chart');
      if (svg && pts.length >= 2) (st.mode === 'candle' ? bindCandleScrub(root, svg, pts, cur, st.interval) : bindScrub(root, svg, pts, cur));
    };
    const bindScrub = (root, svg, pts, cur) => {
      const W = Number(svg.dataset.w), L = Number(svg.dataset.l), R = Number(svg.dataset.r);
      const ln = svg.querySelector('.scrub-line'), dot = svg.querySelector('.scrub-dot');
      const priceEl = root.querySelector('[data-scrub-price]'), whenEl = root.querySelector('[data-scrub-when]'), diffEl = root.querySelector('[data-scrub-diff]');
      const orig = [priceEl.innerHTML, whenEl.innerHTML, diffEl.innerHTML, diffEl.className];
      const poly = svg.querySelector('polyline').getAttribute('points').split(' ').map(s => s.split(',').map(Number));
      const move = e => {
        const box = svg.getBoundingClientRect();
        const x = (e.clientX - box.left) / box.width * W;
        const i = Math.max(0, Math.min(pts.length - 1, Math.round((x - L) / (W - L - R) * (pts.length - 1))));
        const [px, py] = poly[i];
        ln.setAttribute('x1', px); ln.setAttribute('x2', px); ln.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
        const diff = pts[i].c - pts[0].c;
        priceEl.textContent = chartPrice(pts[i].c, cur);
        diffEl.textContent = `처음 대비 ${diff >= 0 ? '+' : '-'}${chartPrice(Math.abs(diff), cur)} (${pct(pts[0].c ? diff / pts[0].c * 100 : 0)})`;
        diffEl.className = upDown(diff) + ' price-diff';
        const dt = new Date(pts[i].t);
        whenEl.textContent = `${dt.getMonth() + 1}/${dt.getDate()}${st.range === '1D' || st.range === '1W' || (st.range === '1M' && opts.kind === 'coin') ? ' ' + dt.getHours() + ':' + String(dt.getMinutes()).padStart(2, '0') : ''}`;
      };
      const reset = () => {
        ln.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden');
        [priceEl.innerHTML, whenEl.innerHTML, diffEl.innerHTML, diffEl.className] = orig;
      };
      svg.addEventListener('pointerdown', e => { svg.setPointerCapture && svg.setPointerCapture(e.pointerId); move(e); });
      svg.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) move(e); });
      svg.addEventListener('pointerup', reset);
      svg.addEventListener('pointerleave', reset);
      svg.addEventListener('pointercancel', reset);
    };
    const load = async root => {
      const k = key(), hit = chartCache.get(k);
      st.error = '';
      const fresh = st.mode === 'candle' ? (intraday(st.interval) ? 60e3 : 10 * 60e3) : (st.range === '1D' ? 60e3 : 10 * 60e3);
      if (hit && Date.now() - hit.at < fresh) { st.data = hit.data; st.loading = false; return draw(root); }
      st.loading = true; st.data = hit ? hit.data : null; draw(root);
      if (!store.cryptoToken) return;
      const q = opts.kind === 'coin'
        ? { kind: 'coin', symbol: opts.symbol, range: st.range }
        : { kind: 'stock', code: opts.code, market: opts.market || '', exchange: opts.exchange || '', range: st.range };
      if (st.mode === 'candle') q.interval = st.interval;
      try {
        const res = await fetch('/api/chart?' + new URLSearchParams(q), { cache: 'no-store', headers: { Accept: 'application/json', 'X-POM-Token': store.cryptoToken } });
        const json = await res.json().catch(() => null);
        if (res.status === 404) throw new Error('차트 기능 배포 중이에요. 잠시 뒤 다시 눌러 주세요');
        if (!res.ok || !json || !json.ok) throw new Error(res.status === 401 ? '연동 비밀번호가 맞지 않습니다' : (json && json.error) || `HTTP ${res.status}`);
        chartCache.set(k, { at: Date.now(), data: json });
        if (key() !== k) return; // 그사이 다른 기간을 눌렀음
        st.data = json;
      } catch (e) {
        if (key() !== k) return;
        st.error = String(e && e.message ? e.message : e);
      }
      st.loading = false;
      if (sheetRoot.contains(root.querySelector('.sheet'))) draw(root);
    };
    openSheet('', root => load(root));
  }
  function openCoinChart(symbol) {
    const h = (coinLive()?.holdings || []).find(x => x.symbol === symbol);
    const sub = h && h.amount != null ? `보유 ${coinAmount(h.amount)} ${symbol} · ${usd2(h.usd)}${h.avgPrice ? ' · 평단 ' + usdPrice(h.avgPrice) : ''}` : '';
    openPriceChart({ kind: 'coin', symbol, sub, onCost: h ? () => openCoinCost(symbol) : null });
  }

  function openCryptoToken() {
    openSheet(`${sheetHead('코인 거래소 연동 비밀번호')}
      <div class="field"><label>연동 비밀번호</label><input id="token-field" type="password" autocomplete="off" value="${esc(store.cryptoToken)}"></div>
      <div class="auto-box">Vercel 환경변수 POM_ACCESS_TOKEN 에 넣은 값과 같아야 합니다. 이 기기에만 저장됩니다.</div>
      <button class="save-btn" data-save>저장하고 불러오기</button>`, root => {
      root.querySelector('[data-save]').onclick = () => {
        store.cryptoToken = root.querySelector('#token-field').value.trim();
        if (!store.cryptoToken) { store.crypto = null; store.cryptoError = ''; }
        saveStore(); closeSheet(); render(); syncCrypto({ silent: false });
      };
    });
  }

  function invest() {
    return stocks();
  }

  // ── 6. 저축·현금·대출 (#/accounts) ─────────────────────────────
  function accounts() {
    const b = sheet();
    const od = liabs().find(l => l.type === 'overdraft');
    return page(`${detailHeader('저축·현금 및 대출')}
      <section class="hero">
        <div class="hero-corner">${icon('cash')}</div>
        <div class="eyebrow">현금성 자산 합계 <span class="info-circle">i</span></div>
        <div class="hero-value">${b.missingAccounts === data.accounts.length ? '미입력' : man(b.cash)}</div>
        <div class="hero-grid two">
          <div class="hero-stat"><label>연결 계좌</label><strong>${data.accounts.length}곳</strong></div>
          <button class="hero-stat" ${od ? `data-loan-limit="${esc(od.id)}"` : ''} style="text-align:left;background:none;border:0;color:inherit;padding:0;font:inherit"><label>마통 잔여한도 ›</label><strong>${od ? man(od.limit - od.balance) : '-'}</strong></button>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">입출금 계좌 (터치해 잔액 입력)</h2>
        <div class="detail-panel">
          ${b.accounts.map(a => `<button class="detail-row" data-balance="${esc(a.id)}">
            <div class="tile-icon">${icon('bank')}</div>
            <div class="tile-copy">
              <div class="tile-title">${esc(a.institution)}</div>
              <div class="tile-sub">${a.balance == null ? '터치해서 잔액을 입력해 주세요' : '직접 입력된 잔액'}</div>
            </div>
            <div class="tile-value">${won(a.balance)}</div>
            <div class="chev">›</div>
          </button>`).join('')}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">보유 대출 목록</h2>
        <div class="detail-panel">
          ${liabs().map(l => `<button class="detail-row" data-loan="${esc(l.id)}">
            <div class="tile-icon">${icon('percent')}</div>
            <div class="tile-copy">
              <div class="tile-title">${esc(l.institution)} · ${esc(l.name)}</div>
              <div class="tile-sub">금리 ${l.rate.toFixed(2)}% · 월 이자/상환 ${won(C.monthlyCost(l))}${l.type === 'overdraft' && l.limit ? ` · 한도 ${man(l.limit)}` : ''}</div>
              <div class="tile-sub small">${l.source === 'manual' ? `직접 입력 (${esc(String(l.enteredAt || '').slice(5, 10).replace('-', '/'))})${l.monthlyPayment ? ' 후 상환일마다 자동 차감' : ''}` : l.source === 'auto' ? `상환일마다 자동 차감 · 다음 ${esc(String(l.nextDate).slice(5).replace('-', '/'))}` : '터치해서 현재 잔액 입력'}</div>
            </div>
            <div class="tile-value red-text">${man(l.balance)}</div>
            <div class="chev">›</div>
          </button>`).join('')}
        </div>
      </section>`, 'home');
  }

  // Cute UI presentation only: group matching shop payments on the same day.
  // Never alter, aggregate, duplicate or remove transactions from the source ledger.
  function merchantGroupKey(tx) {
    if (!tx || !C.isSpend(tx) || tx.kind === 'refund') return '';
    let name = String(tx.merchant || '').normalize('NFKC').toLowerCase();
    if (/아이파크몰|i['’]?\s*park\s*mall/.test(name)) return 'iparkmall';
    if (/쿠팡|coupang|네이버|naver|페이|payco|토스페이|배달의민족/.test(name)) return '';
    name = name.replace(/주식회사|㈜|\(주\)|유한회사/g, '')
      .replace(/[\s·._\-'’()"[\]]/g, '');
    return name.length >= 2 ? name : '';
  }

  // Render one Coupang card for each original approval; keep the child rows as the ledger.
  function coupangOrderKey(tx) {
    if (!tx || tx.kind !== 'expense') return '';
    if (/^네이버\s*파이낸셜$/i.test(String(tx.merchant||'').trim()) && tx.source !== 'sms+naver') return String(tx.date||'')+'|naverpay|'+String(tx.id||'');
    if (!['sms+gmail','sms+naver','sms+eats'].includes(tx.source)) return '';
    const provider = tx.source === 'sms+naver' ? 'naverpay' : tx.source === 'sms+eats' ? 'coupangeats' : 'coupang';
    if (provider === 'coupang' && !/쿠팡/.test(String(tx.parentMerchant || ''))) return '';
    if (provider === 'coupangeats' && !/쿠팡\s*이츠/.test(String(tx.parentMerchant || ''))) return '';
    if (provider === 'naverpay' && !/네이버|n\s*pay/i.test(String(tx.parentMerchant || ''))) return '';
    const original = String(tx.parentId || String(tx.id || '').replace(/:item:\d+$/, ''));
    return original ? String(tx.date || '')+'|'+provider+'|'+original : '';
  }
  function coupangOrderRow(group) {
    const expanded = ui.openCoupangOrders[group.key] === true;
    const first = group.transactions[0];
    const total = C.sum(group.transactions,C.spendAmount);
    const card = C.cardIssuer(first.card) || first.card || '';
    const isNaver = group.key.includes('|naverpay|');
    const isEats = group.key.includes('|coupangeats|');
    const restaurant = String(first.restaurant || '').trim();
    const franchise = restaurant ? merchantLogoKind(restaurant) : '';
    const label = isNaver ? '네이버페이' : isEats ? (restaurant ? restaurant+' · 쿠팡이츠' : '쿠팡이츠') : String(first.parentMerchant || '쿠팡(쿠페이)');
    const badge = isNaver ? brandLogo('naver') : isEats
      ? (franchise ? brandLogo(franchise) : '<div class="tx-product-art" role="img" aria-label="음식 종류">'+deliveryFoodEmoji(first.merchant)+'</div>')
      : brandLogo('coupang');
    return '<div class="coupang-order-group">'+
      '<button type="button" class="coupang-order-header" data-coupang-order="'+esc(group.key)+'" aria-expanded="'+expanded+'">'+
        '<span class="coupang-order-shop-logo">'+badge+'</span>'+
        '<span class="coupang-order-head-copy"><strong>'+esc(label)+'</strong>'+
          '<small>'+esc(first.time || '')+' · '+esc(card)+' · '+(isNaver && first.source !== 'sms+naver' ? '품목 미확인' : isEats ? '주문 메뉴 '+group.transactions.length+'건' : '품목 '+group.transactions.length+'개')+'</small>'+
          '<em>'+(expanded?'품목 접기':'상품별 결제내역 보기')+'</em></span>'+
        '<span class="coupang-order-head-total">'+won(total)+'<small>'+(expanded?'⌃':'⌄')+'</small></span>'+
      '</button>'+
      (expanded?'<div class="coupang-order-item-list">'+group.transactions.map(tx=>
        '<div class="coupang-order-item"><button type="button" class="coupang-order-item-button" data-tx="'+esc(tx.id)+'">'+
          '<span class="coupang-order-item-icon">'+txLogo(tx)+'</span>'+
          '<span class="coupang-order-item-text"><strong>'+esc(tx.merchant)+'</strong>'+
          '<small>'+esc(tx.category || '미분류')+(tx.sub?' · '+esc(tx.sub):'')+'</small></span>'+
          '<span class="coupang-order-item-price">'+won(tx.amount)+'<small>수정 ›</small></span>'+
        '</button></div>').join('')+'</div>':'')+
      '</div>';
  }

  function groupedDayRows(dayItems) {
    const orders = new Map(), merchants = new Map();
    for (const tx of dayItems) {
      const orderKey=coupangOrderKey(tx);
      if (orderKey) {
        if (!orders.has(orderKey)) orders.set(orderKey,[]);
        orders.get(orderKey).push(tx);
        continue;
      }
      const key=merchantGroupKey(tx);
      if (!key) continue;
      if (!merchants.has(key)) merchants.set(key,[]);
      merchants.get(key).push(tx);
    }
    const emittedOrders=new Set(), emittedMerchants=new Set(), output=[];
    for (const tx of dayItems) {
      const orderKey=coupangOrderKey(tx);
      if (orderKey) {
        if (emittedOrders.has(orderKey)) continue;
        emittedOrders.add(orderKey);
        output.push({kind:'coupang-order',key:orderKey,transactions:orders.get(orderKey)});
        continue;
      }
      const key=merchantGroupKey(tx), bucket=key&&merchants.get(key);
      if (bucket && bucket.length>=2) {
        if (emittedMerchants.has(key)) continue;
        emittedMerchants.add(key);
        output.push({kind:'group',key:tx.date+'|'+key,
          merchant:key==='iparkmall'?'아이파크몰':String(bucket[0].merchant||'').replace(/\s*(?:주식회사|㈜|\(주\))\s*$/g,'').trim(),
          transactions:bucket});
      } else output.push({kind:'single',transaction:tx});
    }
    return output;
  }
  function merchantGroupRow(group) {
    const expanded = ui.openMerchantGroups[group.key] === true;
    const first = group.transactions[0];
    const total = C.sum(group.transactions, C.spendAmount);
    const cards = [...new Set(group.transactions.map(t=>C.cardIssuer(t.card)).filter(Boolean))];
    return '<div class="cute-merchant-group">'+
      '<button class="cute-merchant-toggle" data-merchant-group="'+esc(group.key)+'" aria-expanded="'+expanded+'">'+
        '<span class="tx-logo-box">'+txLogo({...first,merchant:group.merchant})+'</span>'+
        '<span class="cute-group-copy"><strong>'+esc(group.merchant)+'</strong>'+
          '<small>'+group.transactions.length+'건 결제 · '+esc(cards.slice(0,2).join(' · '))+(cards.length>2?' 외 '+(cards.length-2)+'개':'')+'</small>'+
          '<em>'+(expanded?'상세 접기':'각 결제 확인하기')+'</em></span>'+
        '<span class="cute-group-amount">'+won(total)+'<small>'+(expanded?'⌃':'⌄')+'</small></span>'+
      '</button>'+
      (expanded?'<div class="cute-merchant-entries">'+group.transactions.map(txRow).join('')+'</div>':'')+
    '</div>';
  }
  function spendSyncBadge() {
    let age = NaN, timeLabel = '동기화 전';
    if (store.lastSyncedAt) {
      const t = new Date(store.lastSyncedAt);
      if (Number.isFinite(t.getTime())) {
        age = Math.max(0, Date.now()-t.getTime());
        timeLabel = t.toLocaleString('ko-KR', { timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' });
      }
    }
    const failure = Boolean(store.lastSyncError);
    const stale = Number.isFinite(age) && age > 6*60*60*1000;
    return '<button type="button" class="cute-sync-status '+(failure?'is-error':stale?'is-stale':'')+
      '" data-sms-diag aria-label="서버 동기화 상태 확인 및 새로고침">'+
      '<span class="cute-sync-dot"></span><span>'+
      (failure?'최근 동기화 오류':stale?'마지막 동기화 '+esc(timeLabel)+' · 오래됨':'마지막 동기화 '+esc(timeLabel))+
      '</span><span aria-hidden="true">↻</span></button>';
  }
  function categoryMiniIcon(category) {
    const c=String(category||'');
    if (/식비|외식/.test(c)) return '🍽️';
    if (/간식/.test(c)) return '🍪';
    if (/육아|자녀|교육/.test(c)) return '🧸';
    if (/의료|병원|건강/.test(c)) return '💊';
    if (/생활/.test(c)) return '🧺';
    if (/여행/.test(c)) return '🧳';
    if (/교통/.test(c)) return '🚗';
    if (/문화|여가/.test(c)) return '🎟️';
    if (/의류/.test(c)) return '👕';
    return '🧾';
  }
  function receiptSnapshot(monthTx, month) {
    const eligible = monthTx.filter(C.isSpend), today=todayStr();
    const todayRows = eligible.filter(t=>t.date===today);
    const snapshotDate = todayRows.length && month===today.slice(0,7)
      ? today : (eligible.map(t=>t.date).filter(Boolean).sort().at(-1) || '');
    const selected = eligible.filter(t=>t.date===snapshotDate);
    const total = C.sum(selected, C.spendAmount);
    const uniquePaymentCount = new Set(selected.map(t=>String(t.parentId||t.id))).size;
    const categoryTotals = new Map();
    selected.forEach(t=>{const category=String(t.category||'미분류');categoryTotals.set(category,(categoryTotals.get(category)||0)+C.spendAmount(t));});
    const leaders = [...categoryTotals].sort((a,b)=>b[1]-a[1]).slice(0,3);
    const isToday = snapshotDate===today;
    const displayDate = snapshotDate ? Number(snapshotDate.slice(5,7))+'월 '+Number(snapshotDate.slice(8,10))+'일' : monthLabel(month);
    return '<section class="cute-receipt-card" aria-label="소비 영수증">'+
      '<div class="cute-receipt-head"><span>'+(isToday?'☀️ 오늘의 작은 영수증':'🧾 최근 소비 영수증')+'</span><small>'+displayDate+'</small></div>'+
      '<div class="cute-receipt-total">'+won(total)+'</div>'+
      '<div class="cute-receipt-sub">'+(selected.length ? uniquePaymentCount+'건 결제 · '+selected.length+'개 거래항목':'이 기간에 불러온 결제내역이 없어')+'</div>'+
      (leaders.length?'<div class="cute-receipt-chips">'+leaders.map(([category,n])=>'<span>'+categoryMiniIcon(category)+' '+esc(category)+' '+won(n)+'</span>').join('')+'</div>':'')+
      (snapshotDate?'<button type="button" class="cute-receipt-link" data-receipt-jump="'+esc(snapshotDate)+'">이날 결제 자세히 보기 <span aria-hidden="true">›</span></button>':'')+
    '</section>';
  }

  // ── 7. 소비 화면 (#/spending — image_2.png 100% 동일) ──────────
  function spending() {
    const all = txs(), monthsList = C.months(all);
    const month = ui.month && monthsList.includes(ui.month) ? ui.month : latestMonth();
    const billed = ui.spendBasis === 'billed';
    const paidMonthTx = C.inMonth(all, month), billedMonthTx = C.inMonth(spendTxs(), month);
    const rawMonthTx = billed ? billedMonthTx : paidMonthTx;
    const unclassifiedCount = rawMonthTx.filter(t => t.category === '미분류').length;

    const applyFilters = list => {
      let out = list;
      if (ui.filterMember !== 'all') out = out.filter(t => (t.member || '') === ui.filterMember);
      if (ui.filterCategory !== 'all') out = out.filter(t => t.category === ui.filterCategory);
      if (ui.searchQuery.trim()) {
        const q = ui.searchQuery.trim().toLowerCase();
        out = out.filter(t => `${t.merchant} ${t.parentMerchant || ''} ${t.card} ${t.category} ${t.detail || ''}`.toLowerCase().includes(q));
      }
      if (ui.filterCard !== 'all') out = out.filter(t => C.cardIssuer(t.card) === ui.filterCard);
      return out;
    };
    // 결제 기준·청구 기준 합계를 같은 필터로 둘 다 계산해 히어로에 함께 보여 준다
    const paidTotal = C.sum(applyFilters(paidMonthTx).filter(C.isSpend), C.spendAmount);
    const billedTotal = C.sum(applyFilters(billedMonthTx).filter(C.isSpend), C.spendAmount);
    const cardFilter = ui.filterCard; ui.filterCard = 'all';
    let monthTx = applyFilters(rawMonthTx);
    ui.filterCard = cardFilter;
    // 카드사별 사용금액은 카드사 필터를 걸기 전 기준으로 집계해 다른 카드사도 계속 보이게 한다
    // 등록된 카드는 이번 달 사용이 없어도 0원으로 보여 준다(현금·계좌이체 제외)
    const issuers = C.byCardIssuer(monthTx);
    data.cards.filter(c => c.id !== 'cash').map(c => C.cardIssuer(c.name)).forEach(k => {
      if (!issuers.some(x => x.issuer === k)) issuers.push({ issuer: k, amount: 0, count: 0 });
    });
    if (ui.filterCard !== 'all') monthTx = monthTx.filter(t => C.cardIssuer(t.card) === ui.filterCard);

    const total = C.sum(monthTx.filter(C.isSpend), C.spendAmount);
    const groups = {};
    monthTx.forEach(t => (groups[t.date] ??= []).push(t));

    // 필터 바 토글 시 표시되는 칩
    const filterDrawer = ui.showSpendFilter ? `<div class="detail-panel" style="padding:14px;margin-bottom:14px">
      <div class="subtle" style="margin-bottom:6px">대상별 필터</div>
      <div class="chips" style="margin:0 0 10px">
        ${[['all', '전체'], ...data.members.map(m => [m.id, m.name]), ['', '미지정']].map(([id, n]) =>
          `<button class="chip ${ui.filterMember === id ? 'active' : ''}" data-member-filter="${esc(id)}">${esc(n)}</button>`
        ).join('')}
      </div>
      <div class="subtle" style="margin-bottom:6px">카테고리 필터</div>
      <div class="chips" style="margin:0">
        ${[['all', '전체'], ['미분류', `미분류(${unclassifiedCount})`], ['생활비', '생활비'], ['식비', '식비'], ['외식비', '외식비'], ['간식비', '간식비'], ['의류비', '의류비'], ['문화/여가', '문화/여가'], ['사치품', '사치품'], ['여행경비', '여행경비']].map(([id, n]) =>
          `<button class="chip ${ui.filterCategory === id ? 'active' : ''}" data-cat-filter="${esc(id)}">${esc(n)}</button>`
        ).join('')}
      </div>
    </div>` : '';

    return page(`${detailHeader('소비', '#/home', `<button class="status-pill blue" data-manual-add style="padding:7px 13px;font-size:13px">+ 수기 입력</button>`)}
      <section class="hero" style="min-height:175px">
        <a class="hero-corner" href="#/assets" aria-label="추이 그래프">${icon('stock')}</a>
        <div class="eyebrow">${shortMonth(month)} ${billed ? '청구' : '결제'} 금액 <span class="info-circle">i</span></div>
        <div class="hero-value" style="margin:10px 0 4px">${won(total)}</div>
        <div class="hero-sub">${billed ? `결제 기준 ${won(paidTotal)}` : `청구 기준 ${won(billedTotal)}`}${paidTotal !== billedTotal ? ` · 할부 차이 ${won(Math.abs(paidTotal - billedTotal))}` : ''}</div>
        <div class="hero-pills">
          <button class="hero-pill" data-cat-filter="all">
            ${icon('card_nav')}
            <span>카드 ${rawMonthTx.length}건</span>
          </button>
          <button class="hero-pill" data-cat-filter="${ui.filterCategory === '미분류' ? 'all' : '미분류'}">
            ${icon('tag')}
            <span>미분류 ${unclassifiedCount}건</span>
          </button>
        </div>
      </section>
      ${spendSyncBadge()}
      ${receiptSnapshot(paidMonthTx,month)}

      <div class="segmented spend-basis">
        <button class="${billed ? '' : 'active'}" data-spend-basis="paid">결제 기준</button>
        <button class="${billed ? 'active' : ''}" data-spend-basis="billed">청구 기준 (할부 분할)</button>
      </div>

      <div class="spend-toolbar">
        <button class="spend-filter-dropdown" data-toggle-spend-filter>
          <span>${ui.filterCard !== 'all' ? ui.filterCard : ui.filterCategory !== 'all' ? ui.filterCategory : (ui.filterMember !== 'all' ? memberName(ui.filterMember) : '전체')} 거래 ${monthTx.length}건</span>
          <span>⌄</span>
        </button>
        <div class="toolbar-actions">
          <button class="small-square" data-toggle-spend-filter aria-label="필터">${icon('filter')}</button>
          <button class="small-square" data-open-search aria-label="검색">${icon('search')}</button>
        </div>
      </div>

      ${filterDrawer}

      ${issuers.length ? `<section class="section">
        <div class="section-head"><h2 class="section-title">카드사별 사용금액</h2>${ui.filterCard !== 'all' ? '<button class="section-meta" data-card-filter="all" style="background:none;border:0;color:#3182f6;font-weight:800">전체 보기</button>' : ''}</div>
        <div class="detail-panel bars">
          ${(() => { const maxV = Math.max(1, ...issuers.map(x => x.amount)); return issuers.map((x, i) => `<button class="bar-row card-issuer-row ${ui.filterCard === x.issuer ? 'active' : ''}" data-card-filter="${esc(ui.filterCard === x.issuer ? 'all' : x.issuer)}">
            <span>${esc(x.issuer)}<small>${x.count}건</small></span>
            <div class="bar"><i style="width:${Math.max(4, Math.max(0, x.amount) / maxV * 100)}%;background:${PALETTE[i % PALETTE.length]}"></i></div>
            <strong>${won(x.amount)}</strong>
          </button>`).join(''); })()}
        </div>
      </section>` : ''}

      ${Object.keys(groups).sort().reverse().map(date => {
        const items = groups[date].sort((a, b) => String(b.time).localeCompare(String(a.time)));
        const d = new Date(date + 'T12:00:00');
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const today = todayStr(), yd = new Date(); yd.setDate(yd.getDate() - 1);
        const yesterday = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
        const dayPrefix = date === today ? '오늘 ' : (date === yesterday ? '어제 ' : '');
        return `<section class="date-group" id="pom-day-${date}">
          <div class="date-heading">
            <strong>${dayPrefix}<small>${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})</small></strong>
            <span>${won(C.sum(items.filter(C.isSpend), C.spendAmount))}</span>
          </div>
          <div class="tx-card">${groupedDayRows(items).map(entry=>entry.kind==='coupang-order' ? coupangOrderRow(entry) : entry.kind==='group' ? merchantGroupRow(entry) : txRow(entry.transaction)).join('')}</div>
        </section>`;
      }).join('') || '<div class="tx-card"><div class="empty">이 조건의 거래가 없습니다.</div></div>'}`, 'spending');
  }

  function txRow(tx) {
    const hasItems = tx.items && tx.items.length > 0;
    const isOpen = ui.openCoupangIds[tx.id] === true;
    const n = C.installmentOf(tx);
    const inst = tx.installmentPart ? ` · 할부 ${tx.installmentPart}/${tx.installment}회 (총 ${won(tx.originalAmount)})` : n > 1 ? ` · ${n}개월 할부 (월 ${won(Math.floor(tx.amount / n))})` : '';
    const used = tx.usedDate && tx.usedDate !== tx.date ? ` · ${Number(tx.usedDate.slice(5, 7))}/${Number(tx.usedDate.slice(8, 10))} 사용` : '';
    const subMeta = `${tx.sub || tx.card} · ${tx.time || ''}${tx.source === 'manual' ? ' · 수기' : ''}${used}${inst}`;

    const tagHtml = tx.category === '미분류'
      ? `<div class="tx-tags"><span class="tx-tag-pill warn">${icon('tag', 'svg')} 미분류</span></div>`
      : (tx.member ? `<div class="tx-tags"><span class="tx-tag-pill">${esc(tx.category)}</span><span class="tx-tag-pill member">${esc(memberName(tx.member))}</span></div>` : '');

    const itemsBoxHtml = hasItems ? `<div class="items-box ${isOpen ? '' : 'hidden'}">
      <div class="items-box-title">주문 품목 ${tx.items.length}건</div>
      ${tx.items.map(i => `<div class="item-line">
        <div class="item-left">
          <div class="item-illust">${itemIllustration(i.itemIcon, i.name)}</div>
          <span>${esc(i.name)}</span>
        </div>
        <strong>${won(i.amount)}</strong>
      </div>`).join('')}
    </div>` : '';

    return `<div class="tx-wrap">
      <button class="tx-row" data-tx="${esc(tx.id)}">
        <div class="tx-logo-box">${txLogo(tx)}</div>
        <div class="tx-main">
          <div class="tx-merchant">${esc(tx.merchant)}</div>
          <div class="tx-meta">${esc(subMeta)}</div>
          ${tagHtml}
        </div>
        <div class="tx-amount">${won(tx.amount)}</div>
        ${hasItems
          ? `<span class="chev" data-toggle-coupang="${esc(tx.id)}" style="font-size:16px;padding:4px">${isOpen ? '⌃' : '⌄'}</span>`
          : `<div class="chev">›</div>`}
      </button>
      ${itemsBoxHtml}
    </div>`;
  }

  // ── 8. 자산·분석·예측 통합 탭 (#/assets, #/trend, #/forecast) ────
  function assetsHub() {
    const mode = ui.assetSubTab || 'overview';
    const topSwitch = `<div class="segmented" style="margin-bottom:16px">
      <button class="${mode === 'overview' ? 'active' : ''}" data-asset-tab="overview">자산·투자</button>
      <button class="${mode === 'trend' ? 'active' : ''}" data-asset-tab="trend">소비 추이</button>
      <button class="${mode === 'forecast' ? 'active' : ''}" data-asset-tab="forecast">24개월 예측</button>
    </div>`;

    if (mode === 'trend') return trend(topSwitch);
    if (mode === 'forecast') return forecastPage(topSwitch);

    const b = sheet(), s = data.investments.stocks, c = data.investments.coin;
    return page(`${detailHeader('자산 · 포트폴리오', '#/home')}
      ${topSwitch}
      <section class="hero">
        <div class="eyebrow">총 자산 규모 <span class="info-circle">i</span></div>
        <div class="hero-value">${man(b.totalAssets)}</div>
        <div class="hero-grid">
          <div class="hero-stat"><label>순자산</label><strong>${man(b.netWorth)}</strong></div>
          <div class="hero-stat"><label>총부채</label><strong>${man(b.liabilities)}</strong></div>
          <div class="hero-stat"><label>월 대출비용</label><strong>${man(b.monthlyDebtCost)}</strong></div>
        </div>
      </section>

      <section class="section list">
        <a class="list-card" href="#/realestate">
          <div class="tile-icon">${icon('home')}</div>
          <div class="tile-copy"><div class="tile-title">부동산</div><div class="tile-sub">주담대 ${man(liabs()[0]?.balance)} · 순자산 ${man(b.realEstate - (liabs()[0]?.balance || 0))}</div></div>
          <div class="tile-value">${man(b.realEstate)}</div><div class="chev">›</div>
        </a>
        <a class="list-card" href="#/invest/stocks">
          <div class="tile-icon" style="background:none">${brandLogo('kis')}</div>
          <div class="tile-copy"><div class="tile-title">주식 (${esc(s.broker)})</div><div class="tile-sub">${(() => { const sl = stocksLive(); if (!sl) return '연동 전'; const names = (sl.holdings || []).slice(0, 4).map(h => esc(h.name)).join('·'); return names ? `${names} (${signedMan(sl.pnlKrw || 0)})` : '조회된 보유 종목 없음'; })()}</div></div>
          <div class="tile-value">${man(b.stocks)}</div><div class="chev">›</div>
        </a>
        <a class="list-card" href="#/invest/coin">
          <div class="tile-icon" style="background:none">${brandLogo('binance_card')}</div>
          <div class="tile-copy"><div class="tile-title">코인</div><div class="tile-sub">${esc(coinSub())} · 원화 ${man(b.coin)}</div></div>
          <div class="tile-value">${usd2(coinUsd())}</div><div class="chev">›</div>
        </a>
        <a class="list-card" href="#/vehicle">
          <div class="tile-icon">${icon('car')}</div>
          <div class="tile-copy"><div class="tile-title">보유 차량 (${data.assets.vehicles.length}대)</div><div class="tile-sub">${data.assets.vehicles.map(v => esc(v.name)).join(' · ')}</div></div>
          <div class="tile-value">${man(b.vehicles)}</div><div class="chev">›</div>
        </a>
        <a class="list-card" href="#/accounts">
          <div class="tile-icon">${icon('cash')}</div>
          <div class="tile-copy"><div class="tile-title">입출금 계좌 · 대출</div><div class="tile-sub">은행 계좌 ${data.accounts.length}개${liabs().some(l => l.type === 'overdraft') ? ' 및 마이너스통장' : ''}</div></div>
          <div class="tile-value">${b.missingAccounts === data.accounts.length ? '미입력' : man(b.cash)}</div><div class="chev">›</div>
        </a>
      </section>`, 'assets');
  }

  function trend(topSwitch = '') {
    const axis = ui.trendAxis, period = ui.trendPeriod;
    const keyFn = axis === 'member' ? t => t.member || '' : axis === 'card' ? t => C.cardIssuer(t.card) : t => t.category;
    const label = k => axis === 'member' ? memberName(k) : k;
    const pv = C.pivot(ui.spendBasis === 'billed' ? spendTxs() : txs(), period, keyFn);
    const toggle = (name, cur, opts) => `<div class="segmented">${opts.map(([v, l]) => `<button class="${cur === v ? 'active' : ''}" data-${name}="${v}">${l}</button>`).join('')}</div>`;
    const latestP = pv.periods.at(-1) || '';
    const latestTotal = latestP ? (pv.totals[latestP] || 0) : 0;

    return page(`${detailHeader('소비 추이 분석', '#/home')}
      ${topSwitch}
      ${toggle('period', period, [['month', '월별'], ['quarter', '분기별'], ['half', '반기별'], ['year', '연도별']])}
      ${toggle('axis', axis, [['category', '카테고리별'], ['member', '대상별'], ['card', '카드사별']])}
      ${toggle('spend-basis', ui.spendBasis, [['paid', '결제 기준'], ['billed', '청구 기준']])}

      <section class="section">
        <h2 class="section-title">${esc(latestP)} 지출 비중 (${won(latestTotal)})</h2>
        <div class="detail-panel bars">
          ${pv.keys.map((k, i) => {
            const v = latestP ? (pv.cells[latestP][k] || 0) : 0;
            const maxV = Math.max(1, ...pv.keys.map(key => pv.cells[latestP]?.[key] || 0));
            return `<div class="bar-row">
              <span>${esc(label(k))}</span>
              <div class="bar"><i style="width:${Math.max(4, v / maxV * 100)}%;background:${PALETTE[i % PALETTE.length]}"></i></div>
              <strong>${won(v)}</strong>
            </div>`;
          }).join('') || '<div class="empty">데이터 없음</div>'}
        </div>
      </section>`, 'assets');
  }

  // ── 9. 현금 예측 ────────────────────────────────────
  function forecastInputs() {
    const b = sheet(), all = spendTxs();
    const ms = C.months(txs());
    const recent = ms.slice(-3);
    const avgVar = recent.length ? Math.round(C.sum(recent, m => C.sum(C.inMonth(all, m).filter(t => C.isSpend(t) && t.category !== '대출상환'), C.spendAmount)) / recent.length) : 0;
    const od = liabs().find(l => l.type === 'overdraft');
    const f = store.forecast;
    return {
      cash: f.cash ?? b.cash,
      income: f.income ?? null,
      variableCost: f.variableCost ?? avgVar,
      otherFixed: f.otherFixed ?? 0,
      debtCost: b.monthlyDebtCost,
      overdraftRoom: od ? Math.max(0, od.limit - od.balance) : 0,
      avgVar, avgMonths: recent.length
    };
  }
  function forecastResult() {
    const i = forecastInputs();
    if (i.income == null) return { ready: false, inputs: i };
    return { ready: true, inputs: i, result: C.forecast({ startMonth: C.nextMonth(C.monthKey(todayStr())), cash: i.cash, income: i.income, fixedCost: i.debtCost + i.otherFixed, variableCost: i.variableCost, overdraftRoom: i.overdraftRoom, horizon: 24 }) };
  }

  function forecastPage(topSwitch = '') {
    const { ready, inputs: i, result: r } = forecastResult();
    const headline = !ready ? '월 수입 입력 필요' : (r.zeroMonth ? monthLabel(r.zeroMonth) : '24개월 내 충분');

    return page(`${detailHeader('24개월 현금 예측', '#/home')}
      ${topSwitch}
      <section class="hero">
        <div class="eyebrow">현금 바닥 예상 시점 <span class="info-circle">i</span></div>
        <div class="hero-value">${esc(headline)}</div>
        <div class="hero-grid two">
          <div class="hero-stat"><label>월 고정 대출비</label><strong>${man(i.debtCost)}</strong></div>
          <div class="hero-stat"><label>마통 여유한도</label><strong>${man(i.overdraftRoom)}</strong></div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">예측 가정값 (터치해 수정)</h2>
        <div class="detail-panel">
          <button class="detail-row" data-fc="income">
            <div class="tile-icon">${icon('cash')}</div>
            <div class="tile-copy"><div class="tile-title">월 평균 수입</div><div class="tile-sub">부부 합산 월 실수령액</div></div>
            <div class="tile-value blue-text">${man(i.income)}</div><div class="chev">›</div>
          </button>
          <button class="detail-row" data-fc="variableCost">
            <div class="tile-icon">${icon('cart')}</div>
            <div class="tile-copy"><div class="tile-title">월 변동비</div><div class="tile-sub">최근 평균 소비</div></div>
            <div class="tile-value">${man(i.variableCost)}</div><div class="chev">›</div>
          </button>
          <button class="detail-row" data-fc="otherFixed">
            <div class="tile-icon">${icon('receipt')}</div>
            <div class="tile-copy"><div class="tile-title">기타 고정비</div><div class="tile-sub">카드 외 고정 지출</div></div>
            <div class="tile-value">${man(i.otherFixed)}</div><div class="chev">›</div>
          </button>
          <div class="detail-row">
            <div class="tile-icon">${icon('bank')}</div>
            <div class="tile-copy"><div class="tile-title">월 대출 상환·이자</div><div class="tile-sub">대출 잔액·금리 자동 계산</div></div>
            <div class="tile-value red-text">${man(i.debtCost)}</div>
          </div>
        </div>
      </section>`, 'assets');
  }

  // ── 10. 설정 (#/settings) ──────────────────────────
  function settingsPage() {
    const s = settings();
    const fuelCards = data.cards.filter(c => c.source === 'sms' || c.id === 'lotte');
    return page(`${detailHeader('설정')}
      <section class="section">
        <h2 class="section-title">환율 · 연동 설정</h2>
        <div class="detail-panel">
          <button class="detail-row" data-setting="usdKrw">
            <div class="tile-icon" style="background:none">${brandLogo('binance_card')}</div>
            <div class="tile-copy"><div class="tile-title">바이낸스 코인 환율</div><div class="tile-sub">1달러당 원화 환산 기준</div></div>
            <div class="tile-value">${won(s.usdKrw)}</div><div class="chev">›</div>
          </button>
          <button class="detail-row" data-crypto-token>
            <div class="tile-icon">${icon('coin')}</div>
            <div class="tile-copy"><div class="tile-title">코인 거래소 연동</div><div class="tile-sub">Binance · Bybit · OKX</div></div>
            <span class="status-pill ${coinLive() ? 'blue' : ''}">${coinLive() ? '연동됨' : store.cryptoToken ? (store.cryptoError ? '오류' : '확인 중') : '미설정'}</span><div class="chev">›</div>
          </button>
          <button class="detail-row" data-sms-diag>
            <div class="tile-icon">${icon('link')}</div>
            <div class="tile-copy"><div class="tile-title">SMS · 쿠팡 자동연동 상태</div><div class="tile-sub">6개 카드사 SMS 및 Gmail 영수증 파서</div></div>
            <span class="status-pill blue">${store.serverMeta?.coupangSync?.configured === false ? '쿠팡 미연결' : store.serverMeta?.coupangSync?.error ? '쿠팡 오류' : store.serverMeta?.coupangSync?.ok ? '상태 정상' : '상태 확인'}</span><div class="chev">›</div>
          </button>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">은행 계좌</h2><button class="section-meta" data-list-add="account" style="background:none;border:0;color:#3182f6;font-weight:800">+ 추가</button></div>
        <div class="detail-panel">
          ${data.accounts.map(a => `<button class="detail-row" data-list-edit="account" data-id="${esc(a.id)}">
            <div class="tile-icon">${icon('bank')}</div>
            <div class="tile-copy"><div class="tile-title">${esc(a.institution)}</div><div class="tile-sub">눌러서 이름 변경·삭제</div></div><div class="chev">›</div>
          </button>`).join('') || '<div class="empty">계좌가 없습니다.</div>'}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">카드 · 결제수단</h2><button class="section-meta" data-list-add="card" style="background:none;border:0;color:#3182f6;font-weight:800">+ 추가</button></div>
        <div class="detail-panel">
          ${data.cards.map(c => `<button class="detail-row" data-list-edit="card" data-id="${esc(c.id)}">
            <div class="tile-icon">${icon('card_nav')}</div>
            <div class="tile-copy"><div class="tile-title">${esc(c.name)}</div><div class="tile-sub">${c.source === 'sms' ? 'SMS 자동 수신' : '수기 입력'} · 눌러서 수정·삭제</div></div><div class="chev">›</div>
          </button>`).join('')}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">차량 감가율</h2>
        <div class="detail-panel">
          <button class="detail-row" data-depreciation>
            <div class="tile-icon">${icon('car')}</div>
            <div class="tile-copy"><div class="tile-title">연 감가율</div><div class="tile-sub">차량 가액이 매일 이 비율로 자동 감소</div></div>
            <div class="tile-value">${Math.round((s.vehicleDepreciation ?? 0.12) * 1000) / 10}%</div><div class="chev">›</div>
          </button>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">카드별 결제일 · 이용기간</h2>
        <div class="detail-panel">
          ${[...new Set(data.cards.filter(c => c.id !== 'cash').map(c => C.cardIssuer(c.name)))].map(k => {
            const cfg = (store.settings.billing || {})[k];
            return `<button class="detail-row" data-billing-card="${esc(k)}">
              <div class="tile-icon">${icon('card_nav')}</div>
              <div class="tile-copy"><div class="tile-title">${esc(k)}</div><div class="tile-sub">${cfg ? `매월 ${cfg.payDay}일 결제 · ${esc(C.billingPeriodLabel(cfg))} 사용분` : '미설정 · 사용한 달 기준으로 계산'}</div></div>
              <div class="chev">›</div>
            </button>`;
          }).join('')}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">카드별 기본 주유 차량</h2>
        <div class="detail-panel">
          ${fuelCards.map(c => `<button class="detail-row" data-fuel-card="${esc(c.name)}">
            <div class="tile-icon">${icon('fuel')}</div>
            <div class="tile-copy"><div class="tile-title">${esc(c.name)}</div><div class="tile-sub">${c.source === 'sms' ? 'SMS 자동 수신' : '수기 입력'}</div></div>
            <div class="tile-value blue-text">${esc((data.assets.vehicles.find(v => v.id === s.fuelVehicleByCard[c.name]) || {}).name || '미지정')}</div>
            <div class="chev">›</div>
          </button>`).join('')}
        </div>
      </section>

      <button class="save-btn ghost" data-reset style="margin-top:22px">이 기기에 저장한 수정값 초기화</button>`, 'settings');
  }

  // ── 바텀시트 모달 ─────────────────────────────────
  function openSheet(html, onMount) {
    sheetRoot.innerHTML = `<div class="sheet-backdrop"><div class="sheet">${html}</div></div>`;
    sheetRoot.querySelector('.sheet-backdrop').onclick = e => { if (e.target.classList.contains('sheet-backdrop')) closeSheet(); };
    sheetRoot.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
    onMount && onMount(sheetRoot);
  }
  function closeSheet() { sheetRoot.innerHTML = ''; }
  const sheetHead = title => `<div class="sheet-head"><h3>${esc(title)}</h3><button class="sheet-close" data-close>닫기 ✕</button></div>`;

  function openTx(id) {
    const tx = txs().find(t => t.id === baseId(id));
    if (!tx) return;
    const draft = { category: tx.category, member: tx.member || '', kind: tx.kind || 'expense', vehicle: tx.vehicle || '', installment: C.installmentOf(tx), learnRule: true };
    const isManual = tx.source === 'manual';
    const draw = root => {
      root.querySelector('.sheet').innerHTML = `${sheetHead(`${tx.merchant} · ${won(tx.amount)}`)}
        <div class="sheet-scroll">
          <div class="sheet-info">
            <div>일시 ${esc(tx.date)} ${esc(tx.time || '')} · ${esc(tx.card)}</div>
            ${tx.detail ? `<div>상세 ${esc(tx.detail)}</div>` : ''}
            ${tx.raw ? `<div class="raw">${esc(tx.raw)}</div>` : ''}
          </div>
          <div class="sheet-label">결제 방식 ${draft.installment > 1 ? `<span class="subtle">· 월 ${won(Math.floor(tx.amount / draft.installment))}씩 ${draft.installment}개월</span>` : ''}</div>
          <div class="chips">${C.INSTALLMENT_OPTIONS.map(n => `<button class="chip ${draft.installment === n ? 'active' : ''}" data-inst="${n}">${n === 1 ? '일시불' : n + '개월'}</button>`).join('')}</div>
          <div class="sheet-label">누구를 위해</div>
          <div class="chips">${data.members.map(m => `<button class="chip ${draft.member === m.id ? 'active' : ''}" data-m="${esc(m.id)}">${esc(m.name)}</button>`).join('')}</div>
          <div class="sheet-label">카테고리</div>
          <div class="sheet-grid">${data.categories.map(c => `<button class="cat-btn ${draft.category === c ? 'active' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
          ${['유류비', '차량관리'].includes(draft.category) || C.isFuel({ ...tx, category: draft.category }, settings().fuelKeywords) ? `<div class="sheet-label">차량</div><div class="chips">${data.assets.vehicles.map(v => `<button class="chip ${draft.vehicle === v.id ? 'active' : ''}" data-v="${esc(v.id)}">${esc(v.name)}</button>`).join('')}</div>` : ''}
          <label style="display:flex;align-items:center;gap:8px;margin-top:14px;padding:12px;background:#f4f6fb;border-radius:14px;font-size:13px;font-weight:700;cursor:pointer">
            <input type="checkbox" id="chk-learn" ${draft.learnRule ? 'checked' : ''} style="width:16px;height:16px">
            <span>앞으로 '${esc(tx.merchant)}' 결제는 항상 이 분류로 자동 지정</span>
          </label>
        </div>
        <button class="save-btn" data-save>저장</button>
        <button class="save-btn ghost" data-delete>${isManual ? '이 수기 거래 삭제' : '이 거래 삭제 (테스트·중복 문자)'}</button>`;
      root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
      const chk = root.querySelector('#chk-learn');
      if (chk) chk.onchange = () => { draft.learnRule = chk.checked; };
      root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { draft.member = b.dataset.m; draw(root); });
      root.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { draft.category = b.dataset.c; draw(root); });
      root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { draft.vehicle = b.dataset.v; draw(root); });
      root.querySelectorAll('[data-inst]').forEach(b => b.onclick = () => { draft.installment = Number(b.dataset.inst); draw(root); });
      root.querySelector('[data-save]').onclick = () => {
        const patch = { category: draft.category, member: draft.member, kind: draft.kind, vehicle: draft.vehicle, installment: draft.installment, sub: draft.category === tx.category ? tx.sub : '' };
        if (isManual) Object.assign(store.manual.find(t => t.id === tx.id), patch);
        else store.overrides[tx.id] = patch;
        if (draft.learnRule && tx.merchant) {
          store.rules ??= {};
          store.rules[tx.merchant] = { category: draft.category, member: draft.member };
        }
        saveStore(); closeSheet(); render();
      };
      const del = root.querySelector('[data-delete]');
      if (del) del.onclick = () => {
        if (isManual) store.manual = store.manual.filter(t => t.id !== tx.id);
        else (store.hiddenTx ??= {})[tx.id] = true; // 서버 문자 거래는 앱 원장에서만 숨긴다(서버 원본은 유지)
        saveStore(); closeSheet(); render();
      };
    };
    openSheet('', draw);
  }

  function openManualAdd() {
    const today = todayStr();
    const cardOpts = data.cards.map(c => `<option ${c.id === 'lotte' ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    openSheet(`${sheetHead('수기 입력 (롯데카드 등)')}
      <div class="sheet-scroll">
        <div class="field"><label>날짜</label><input id="mi-date" type="date" value="${today}"></div>
        <div class="field"><label>금액 (원)</label><input id="mi-amount" type="number" inputmode="numeric" placeholder="예: 35000"></div>
        <div class="field"><label>사용처</label><input id="mi-merchant" placeholder="예: 롯데백화점"></div>
        <div class="field"><label>결제수단</label><select id="mi-card">${cardOpts}</select></div>
        <div class="field"><label>일시불 · 할부</label><select id="mi-inst">${C.INSTALLMENT_OPTIONS.map(n => `<option value="${n}">${n === 1 ? '일시불' : n + '개월 할부'}</option>`).join('')}</select></div>
        <div class="field"><label>카테고리</label><select id="mi-cat">${data.categories.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label>누구를 위해</label><select id="mi-member"><option value="">미지정</option>${data.members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></div>
      </div>
      <button class="save-btn" data-add>추가</button>`, root => {
      root.querySelector('[data-add]').onclick = () => {
        const amount = Number(root.querySelector('#mi-amount').value);
        const merchant = root.querySelector('#mi-merchant').value.trim();
        if (!amount || amount <= 0 || !merchant) return;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        store.manual.push({
          id: 'manual-' + Date.now(), date: root.querySelector('#mi-date').value || today, time: timeStr,
          card: root.querySelector('#mi-card').value, merchant, amount, kind: 'expense', installment: Number(root.querySelector('#mi-inst').value) || 1,
          category: root.querySelector('#mi-cat').value, sub: '수기 결제', member: root.querySelector('#mi-member').value, fixed: false, source: 'manual'
        });
        saveStore(); closeSheet(); ui.month = C.monthKey(store.manual.at(-1).date); location.hash = '#/spending'; render();
      };
    });
  }

  function openSearchModal() {
    openSheet(`${sheetHead('거래 내역 검색')}
      <div class="field"><label>상호명 · 카드사 · 품목 검색</label><input id="search-input" type="text" value="${esc(ui.searchQuery)}" placeholder="예: 쿠팡, 올리브영, 네이버페이"></div>
      <button class="save-btn" data-do-search>검색 적용</button>
      ${ui.searchQuery ? '<button class="save-btn ghost" data-clear-search>검색 초기화</button>' : ''}`, root => {
      root.querySelector('[data-do-search]').onclick = () => {
        ui.searchQuery = root.querySelector('#search-input').value;
        closeSheet(); render();
      };
      const clr = root.querySelector('[data-clear-search]');
      if (clr) clr.onclick = () => { ui.searchQuery = ''; closeSheet(); render(); };
    });
  }

  function txSyncFingerprint(tx) {
    const card = String(tx.card || '').replace(/\d{4}/g, '').replace(/\s|카드/g, '').toLowerCase();
    const kind = tx.kind === 'refund' ? 'refund' : tx.kind === 'test' ? 'test' : 'expense';
    return [tx.date || '', tx.time || '', card, Math.abs(Number(tx.amount) || 0), kind].join('|');
  }

  function mergeServerTransactions(serverTxs) {
    const remote = Array.isArray(serverTxs) ? serverTxs.filter(Boolean) : [];
    const remoteFp = new Set(remote.map(txSyncFingerprint));
    // 메일 연동 서버가 기존 주문을 일반 SMS 거래로 교체할 때에도
    // 로컬 주문 품목(items 및 품목별 사과·배·캔디 그림)은 보존한다.
    // 금액과 거래 ID는 서버 원장을 우선해 중복 결제는 만들지 않는다.
    const originalByFingerprint = new Map(data.transactions.map(tx => [txSyncFingerprint(tx), tx]));
    const hydratedRemote = remote.map(tx => {
      const old = originalByFingerprint.get(txSyncFingerprint(tx));
      if (!old) return tx;
      const items = Array.isArray(tx.items) && tx.items.length ? tx.items : old.items;
      return { ...tx, ...(items ? { items } : {}), icon: tx.icon || old.icon,
        detail: tx.detail || old.detail };
    });
    const fallback = data.transactions.filter(tx => !remoteFp.has(txSyncFingerprint(tx)));
    const byId = new Map();
    [...fallback, ...hydratedRemote].forEach(tx => {
      if (!tx || !tx.id) return;
      byId.set(tx.id, tx);
    });
    return [...byId.values()].sort((a, b) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`));
  }

  async function syncFromPomServer({ silent = false } = {}) {
    try {
      const res = await fetch('/api/transactions?limit=600', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.ok || !Array.isArray(json.transactions)) {
        throw new Error((json && json.error) || `HTTP ${res.status}`);
      }
      store.remoteTxs = mergeServerTransactions(json.transactions);
      store.remoteSource = 'pom-server';
      store.lastSyncedAt = json.syncedAt || new Date().toISOString();
      store.lastSyncError = '';
      store.serverMeta = {
        eventCount: Number(json.eventCount || 0),
        transactionCount: Number(json.transactionCount || 0),
        readErrors: Number(json.readErrors || 0),
        latestEvent: json.latestEvent || null,
        lastAttempt: json.lastAttempt || null,
        coupangSync: json.coupangSync || null
      };
      saveStore();
      render();
      return { ok:true, count:json.transactionCount || json.transactions.length, eventCount:json.eventCount || 0, syncedAt:store.lastSyncedAt, latestEvent:json.latestEvent || null };
    } catch (err) {
      store.lastSyncError = String(err && err.message ? err.message : err);
      saveStore();
      if (!silent) render();
      return { ok:false, error:'POM 서버 동기화 실패: ' + store.lastSyncError };
    }
  }

  function openSmsDiag() {
    const lastSync = store.lastSyncedAt || '아직 서버 동기화 안 됨';
    const serverCount = store.serverMeta?.transactionCount ?? 0;
    const eventCount = store.serverMeta?.eventCount ?? 0;
    const readErrors = store.serverMeta?.readErrors ?? 0;
    const latest = store.serverMeta?.latestEvent;
    const latestText = latest?.parsed
      ? `${latest.parsed.date || ''} ${latest.parsed.time || ''} · ${latest.parsed.card || ''} · ${latest.parsed.merchant || ''} · ${num(latest.parsed.amount || 0)}원${latest.parsed.kind === 'refund' ? ' (취소)' : latest.parsed.kind === 'test' ? ' (테스트)' : ''}`
      : latest ? `이벤트 수신됨 · 거래 파싱 대기 (${latest.receivedAt || ''})` : '수신 이벤트 없음';

    const cs = store.serverMeta?.coupangSync;
    const coupangText = !cs ? '' : !cs.configured ? '<span style="color:#f04452">연결 안 됨 → '+esc((cs.missingKeys||['GMAIL_USER','GMAIL_APP_PASSWORD']).join(', '))+' 설정 필요</span>'
      : cs.error ? `<span style="color:#f04452">오류: ${esc(cs.error)}</span>`
      : cs.skipped === 'throttled' ? '정상 (5분마다 확인)'
      : `<span style="color:#0aa870">정상</span> · 메일 ${num(cs.scanned || 0)}통 확인, 쿠팡 주문 ${num(cs.added || 0)}건 추가`;
    const la = store.serverMeta?.lastAttempt;
    const laTime = la?.receivedAt ? new Date(la.receivedAt).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
    const attemptText = la ? `${esc(laTime)} · ${la.saved ? '<span style="color:#0aa870">저장됨</span>'
      : la.reason === 'empty_body' ? '<span style="color:#f04452">본문이 비어 있음 → 단축어의 요청 본문에 \'단축어 입력\'을 넣어주세요</span>'
      : la.reason === 'bad_key' || la.reason === 'no_key' ? '<span style="color:#f04452">키가 맞지 않아 거절됨 → 단축어 주소의 key= 값을 확인해주세요</span>'
      : '<span style="color:#f04452">카드 문자가 아니라서 건너뜀</span>'}${la.preview ? ` · “${esc(la.preview)}”` : ''}` : '';
    openSheet(`${sheetHead('POM 실시간 문자 수신 상태')}
      <div class="sheet-scroll">
        <div class="auto-box">
          <strong>✓ 아이폰 단축어 → Vercel Blob → POM 자동 동기화</strong><br>
          앱을 열거나 다시 활성화하면 서버의 최신 카드 문자 내역을 자동으로 불러옵니다. 비밀키는 앱 화면에 저장되지 않습니다.
        </div>
        <div id="sync-status-msg" class="sheet-info">
          <div>• <strong>서버 거래</strong>: ${serverCount}건 / 원본 이벤트 ${eventCount}건</div>
          <div>• <strong>마지막 동기화</strong>: ${esc(lastSync)}</div>
          <div>• <strong>최근 수신</strong>: ${esc(latestText)}</div>
          ${attemptText ? `<div>• <strong>마지막 단축어 요청</strong>: ${attemptText}</div>` : ''}
          ${coupangText ? `<div>• <strong>쿠팡 지메일</strong>: ${coupangText}</div>` : ''}
          ${readErrors ? `<div style="color:#f04452">• Blob 읽기 오류 ${readErrors}건</div>` : ''}
          ${store.lastSyncError ? `<div style="color:#f04452">• 최근 오류: ${esc(store.lastSyncError)}</div>` : ''}
        </div>
        <div class="auto-box" style="margin-top:12px">
          <strong>777원 테스트 처리</strong><br>
          “777원” 같은 진단 문자는 <b>최근 수신 상태에서 확인</b>할 수 있고, 실제 소비 원장·합계·예측에서는 제외됩니다.
        </div>
      </div>
      <button class="save-btn" data-run-server-sync>🔄 지금 서버에서 다시 불러오기</button>`, root => {
      const msgBox = root.querySelector('#sync-status-msg');
      root.querySelector('[data-run-server-sync]').onclick = async () => {
        msgBox.innerHTML = '<div>⏳ Vercel Blob에서 최신 문자 거래를 불러오는 중...</div>';
        const r = await syncFromPomServer({ silent:true });
        if (r.ok) {
          // 새로 받은 상태(최근 수신·마지막 단축어 요청)가 보이도록 시트를 다시 그린다
          openSmsDiag();
        } else {
          msgBox.innerHTML = `<div style="color:#f04452;font-weight:800">⚠️ ${esc(r.error)}</div>`;
        }
      };
    });
  }

  function openNumberEdit(title, value, help, onSave) {
    openSheet(`${sheetHead(title)}
      <div class="field"><label>${esc(title)}</label><input id="num-field" type="number" inputmode="numeric" value="${value == null ? '' : esc(value)}"></div>
      <div class="auto-box">${esc(help)}</div>
      <button class="save-btn" data-save>저장</button>`, root => {
      root.querySelector('[data-save]').onclick = () => {
        const raw = root.querySelector('#num-field').value;
        onSave(raw === '' ? null : Number(raw));
        saveStore(); closeSheet(); render();
      };
    });
  }

  // 계좌·카드 목록 편집 (이름 변경, 추가, 삭제). 처음 고칠 때 기본 목록을 복사해 store 에 저장
  function openListItem(kind, id) {
    const isCard = kind === 'card';
    const list = isCard ? (store.cardList || BASE.cards.map(c => ({ ...c }))) : (store.accountList || BASE.accounts.map(a => ({ ...a })));
    const item = id ? list.find(x => x.id === id) : null;
    const name = item ? (isCard ? item.name : item.institution) : '';
    openSheet(`${sheetHead(item ? (isCard ? '카드 수정' : '계좌 수정') : (isCard ? '카드 추가' : '계좌 추가'))}
      <div class="field"><label>${isCard ? '카드 이름' : '은행 이름'}</label><input id="li-name" type="text" value="${esc(name)}" placeholder="${isCard ? '예: 하나카드' : '예: 카카오뱅크'}"></div>
      ${isCard ? `<div class="chips" style="margin:10px 0">${[['sms', 'SMS 자동 수신'], ['manual', '수기 입력']].map(([k, l]) => `<button class="chip ${(item ? item.source : 'manual') === k ? 'active' : ''}" data-src="${k}">${l}</button>`).join('')}</div>` : ''}
      <button class="save-btn" data-save>저장</button>
      ${item ? '<button class="save-btn" data-del style="background:#fff;color:#f04452;border:1px solid #f04452;margin-top:8px">삭제</button>' : ''}`, root => {
      let src = item ? item.source : 'manual';
      root.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { src = b.dataset.src; root.querySelectorAll('[data-src]').forEach(x => x.classList.toggle('active', x === b)); });
      const commit = next => { if (isCard) store.cardList = next; else store.accountList = next; saveStore(); closeSheet(); render(); };
      root.querySelector('[data-save]').onclick = () => {
        const n = root.querySelector('#li-name').value.trim();
        if (!n) return;
        if (item) commit(list.map(x => x.id !== item.id ? x : (isCard ? { ...x, name: n, source: src } : { ...x, institution: n })));
        else commit([...list, isCard ? { id: 'c' + Date.now().toString(36), name: n, source: src } : { id: 'a' + Date.now().toString(36), institution: n, type: 'deposit', balance: null }]);
      };
      const del = root.querySelector('[data-del]');
      if (del) del.onclick = () => commit(list.filter(x => x.id !== item.id));
    });
  }

  function openVehicleEdit(vid, field) {
    const v = data.assets.vehicles.find(x => x.id === vid);
    if (!v) return;
    const m = vehicleManage(v);
    const meta = {
      oil: ['엔진오일 상태', m.oil, 'text', '예: 교환 예정 / 교환 완료'],
      insurance: ['보험 상태', m.insurance, 'text', '예: 확인 필요 / 삼성화재 갱신완료'],
      fuelManual: ['유류비 수기 추가', String(m.fuelManual || 0), 'number', '카드 자동 집계 외 현금 주유 등'],
      maintenance: ['정비 기록', m.maintenance, 'textarea', '예: 최근 정비 3개월 전'],
      tax: ['세금/검사 상태', m.tax || '확인 필요', 'text', '예: 확인 필요 / 납부 완료']
    }[field];
    if (!meta) return;
    const [title, value, type, help] = meta;
    openSheet(`${sheetHead(`${v.name} · ${title}`)}
      <div class="field"><label>${esc(title)}</label>${type === 'textarea' ? `<textarea id="vehicle-field">${esc(value)}</textarea>` : `<input id="vehicle-field" type="${type}" value="${esc(value)}">`}</div>
      <div class="auto-box">${esc(help)}</div>
      <button class="save-btn" data-save>저장</button>`, root => {
      root.querySelector('[data-save]').onclick = () => {
        const val = root.querySelector('#vehicle-field').value;
        store.vehicles[v.id] = { ...m, [field]: field === 'fuelManual' ? Number(val || 0) : val.trim() };
        saveStore(); closeSheet(); render();
      };
    });
  }

  function openBillingCard(issuer) {
    const saved = (store.settings.billing || {})[issuer];
    const curEnd = saved ? (saved.endDay != null ? Number(saved.endDay) : (Number(saved.startDay) || 1) - 1) : 11;
    const curPay = saved ? saved.payDay : 25;
    const opts = (from, to, sel) => Array.from({ length: to - from + 1 }, (_, i) => i + from).map(d => `<option value="${d}" ${d === Number(sel) ? 'selected' : ''}>${d}일</option>`).join('');
    openSheet(`${sheetHead(issuer + ' 결제일 · 이용기간')}
      <div class="sheet-scroll">
        <div class="subtle" style="margin:4px 0 12px">카드사 앱의 '결제일/이용기간' 화면 그대로 넣어 주세요.</div>
        <div class="field"><label>결제일 (매월)</label><select id="bc-pay">${opts(1, 31, curPay)}</select></div>
        <div class="field"><label>이용기간 시작 (전월)</label><select id="bc-start">${opts(2, 31, curEnd + 1)}</select></div>
        <div class="field"><label>이용기간 끝 (당월)</label><select id="bc-end">${opts(1, 30, curEnd)}</select></div>
        <div class="subtle" id="bc-preview" style="margin-top:6px"></div>
      </div>
      <button class="save-btn" data-save>저장</button>
      ${saved ? '<button class="save-btn ghost" data-clear>설정 지우기 (사용한 달 기준)</button>' : ''}`, root => {
      const $ = q => root.querySelector(q);
      // 시작일과 끝일은 이어지므로(끝일+1 = 시작일) 하나를 바꾸면 다른 하나도 맞춘다
      $('#bc-start').onchange = () => { $('#bc-end').value = String(Number($('#bc-start').value) - 1); preview(); };
      $('#bc-end').onchange = () => { $('#bc-start').value = String(Number($('#bc-end').value) + 1); preview(); };
      $('#bc-pay').onchange = () => preview();
      const read = () => ({ payDay: Number($('#bc-pay').value), endDay: Number($('#bc-end').value) });
      function preview() { const c = read(); $('#bc-preview').textContent = `매월 ${c.payDay}일에 ${C.billingPeriodLabel(c)} 사용분이 청구됩니다.`; }
      preview();
      $('[data-save]').onclick = () => { store.settings.billing = { ...(store.settings.billing || {}), [issuer]: read() }; saveStore(); closeSheet(); render(); };
      const clr = $('[data-clear]');
      if (clr) clr.onclick = () => { const b = { ...(store.settings.billing || {}) }; delete b[issuer]; store.settings.billing = b; saveStore(); closeSheet(); render(); };
    });
  }

  function openStockPrincipal() {
    const cur = Number(store.settings.stockPrincipal) || '';
    openSheet(`${sheetHead('주식 투자 원금')}
      <div class="sheet-scroll">
        <div class="subtle" style="margin:4px 0 12px">키움에서 옮겨 온 것까지 포함해, 지금까지 주식 계좌에 넣은 돈의 합계(입금 − 출금)를 넣어 주세요.</div>
        <div class="field"><label>투자 원금 (원)</label><input id="sp-amount" type="number" inputmode="numeric" value="${cur}" placeholder="예: 10000000"></div>
      </div>
      <button class="save-btn" data-save>저장</button>`, root => {
      root.querySelector('[data-save]').onclick = () => {
        const v = Number(root.querySelector('#sp-amount').value);
        store.settings.stockPrincipal = Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
        saveStore(); closeSheet(); render();
      };
    });
  }

  function openFuelCard(cardName) {
    const cur = settings().fuelVehicleByCard[cardName] || '';
    openSheet(`${sheetHead(cardName + ' 주유 차량')}
      <div class="chips" style="margin-top:16px">${[['', '차량 미지정'], ...data.assets.vehicles.map(v => [v.id, v.name])].map(([id, n]) => `<button class="chip ${cur === id ? 'active' : ''}" data-v="${esc(id)}">${esc(n)}</button>`).join('')}</div>`, root => {
      root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
        store.settings.fuelVehicleByCard = { ...(store.settings.fuelVehicleByCard || {}), [cardName]: b.dataset.v };
        saveStore(); closeSheet(); render();
      });
    });
  }

  // ── 라우팅 ────────────────────────────────────────
  function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const [a, b] = parts;
    switch (a) {
      case 'realestate': return realestate();
      case 'vehicle': return b ? vehicleDetail(b) : vehicleList();
      case 'accounts': return accounts();
      case 'invest': return b === 'coin' ? coin() : stocks();
      case 'spending': return spending();
      case 'assets': return assetsHub();
      case 'trend': ui.assetSubTab = 'trend'; return assetsHub();
      case 'forecast': ui.assetSubTab = 'forecast'; return assetsHub();
      case 'settings': return settingsPage();
      default: return home();
    }
  }

  function render() { applyUserData(); app.innerHTML = route(); bind(); }

  function bind() {
    const on = (sel, fn) => app.querySelectorAll(sel).forEach(el => el.onclick = e => { e.stopPropagation(); fn(el); });
    on('[data-hero-toggle]', () => { ui.heroMode = ui.heroMode === 'summary' ? 'composition' : 'summary'; render(); });
    on('[data-tx]', el => openTx(el.dataset.tx));
    on('[data-manual-add]', openManualAdd);
    on('[data-sms-diag]', openSmsDiag);
    on('[data-open-search]', openSearchModal);
    on('[data-toggle-spend-filter]', () => { ui.showSpendFilter = !ui.showSpendFilter; render(); });
    on('[data-coupang-order]', el => {
      const key = el.dataset.coupangOrder;
      ui.openCoupangOrders[key] = ui.openCoupangOrders[key] !== true;
      render();
    });
    on('[data-merchant-group]', el => {
      const key = el.dataset.merchantGroup;
      ui.openMerchantGroups[key] = ui.openMerchantGroups[key] !== true;
      render();
    });
    on('[data-receipt-jump]', el => {
      const date = el.dataset.receiptJump;
      ui.month = date.slice(0,7); ui.spendBasis = 'paid';
      ui.filterCategory = 'all'; ui.filterMember = 'all'; ui.filterCard = 'all'; ui.searchQuery = '';
      render();
      const group = document.getElementById('pom-day-'+date);
      if (group) group.scrollIntoView({behavior:'smooth',block:'start'});
    });
    on('[data-toggle-coupang]', el => {
      const id = el.dataset.toggleCoupang;
      ui.openCoupangIds[id] = ui.openCoupangIds[id] === false ? true : false;
      render();
    });
    on('[data-go-car]', el => { location.hash = '#/vehicle/' + el.dataset.goCar; });
    on('[data-asset-tab]', el => { ui.assetSubTab = el.dataset.assetTab; location.hash = '#/assets'; render(); });
    on('[data-member-filter]', el => { ui.filterMember = el.dataset.memberFilter; render(); });
    on('[data-cat-filter]', el => { ui.filterCategory = el.dataset.catFilter; if (el.dataset.catFilter === 'all') ui.filterCard = 'all'; render(); });
    on('[data-spend-basis]', el => { ui.spendBasis = el.dataset.spendBasis; render(); });
    on('[data-card-filter]', el => { ui.filterCard = el.dataset.cardFilter; render(); });
    on('[data-period]', el => { ui.trendPeriod = el.dataset.period; render(); });
    on('[data-axis]', el => { ui.trendAxis = el.dataset.axis; render(); });
    on('[data-vehicle-edit]', el => openVehicleEdit(el.dataset.vehicleId, el.dataset.vehicleEdit));
    on('[data-vehicle-value]', el => {
      const v = data.assets.vehicles.find(x => x.id === el.dataset.vehicleValue);
      if (!v) return;
      openNumberEdit(`${v.name} 현재 시세`, v.value, '중고차 시세(엔카·KB차차차 등)를 보고 넣으면 오늘부터 다시 자동 감가됩니다. 비우면 처음 기준값으로 돌아갑니다.', val => {
        if (val == null) delete store.vehicleValues[v.id]; else store.vehicleValues[v.id] = { value: val, at: todayStr() };
      });
    });
    on('[data-depreciation]', () => openNumberEdit('차량 연 감가율 (%)', Math.round((settings().vehicleDepreciation ?? 0.12) * 1000) / 10, '보통 국산차 10~15%, 수입차 15~20%. 비우면 12%', v => {
      if (v == null) delete store.settings.vehicleDepreciation; else store.settings.vehicleDepreciation = Math.min(60, Math.max(0, v)) / 100;
    }));
    on('[data-list-add]', el => openListItem(el.dataset.listAdd, null));
    on('[data-list-edit]', el => openListItem(el.dataset.listEdit, el.dataset.id));
    on('[data-loan]', el => {
      const l = liabs().find(x => x.id === el.dataset.loan);
      if (!l) return;
      openNumberEdit(`${l.institution} ${l.name} 잔액`, l.balance, l.monthlyPayment ? '오늘 기준 남은 원금. 이후 상환일마다 자동으로 줄어듭니다. 비우면 자동 계산으로 돌아갑니다.' : '오늘 기준 잔액(마통은 사용 중인 금액). 비우면 초기값으로 돌아갑니다.', v => {
        const o = { ...(store.loans[l.id] || {}) };
        if (v == null) { delete o.balance; delete o.at; } else { o.balance = v; o.at = todayStr(); }
        if (Object.keys(o).length) store.loans[l.id] = o; else delete store.loans[l.id];
      });
    });
    on('[data-loan-limit]', el => {
      const l = liabs().find(x => x.id === el.dataset.loanLimit);
      if (!l) return;
      openNumberEdit(`${l.institution} ${l.name} 한도`, l.limit, '마이너스통장 총 한도. 잔여한도 = 한도 − 사용 중인 금액', v => {
        const o = { ...(store.loans[l.id] || {}) };
        if (v == null) delete o.limit; else o.limit = v;
        if (Object.keys(o).length) store.loans[l.id] = o; else delete store.loans[l.id];
      });
    });
    on('[data-balance]', el => {
      const acc = data.accounts.find(x => x.id === el.dataset.balance);
      openNumberEdit(acc.institution + ' 잔액', store.balances[acc.id] ?? acc.balance, '비우고 저장하면 미입력으로 돌아갑니다.', v => { if (v == null) delete store.balances[acc.id]; else store.balances[acc.id] = v; });
    });
    on('[data-fc]', el => {
      const key = el.dataset.fc, i = forecastInputs();
      const titles = { cash: '현재 현금', income: '월 수입', variableCost: '월 변동비', otherFixed: '기타 고정비' };
      const help = { cash: '비우면 계좌 잔액 합계를 씁니다.', income: '월평균 실수령액', variableCost: `최근 평균(${won(i.avgVar)})`, otherFixed: '카드 외 고정 지출 합계' }[key];
      openNumberEdit(titles[key], store.forecast[key] ?? i[key], help, v => { if (v == null) delete store.forecast[key]; else store.forecast[key] = v; });
    });
    on('[data-setting]', el => openNumberEdit('코인 환율', settings().usdKrw, '1달러당 원화', v => { if (v == null) delete store.settings.usdKrw; else store.settings.usdKrw = v; }));
    on('[data-fuel-card]', el => openFuelCard(el.dataset.fuelCard));
    on('[data-stock-principal]', () => openStockPrincipal());
    on('[data-billing-card]', el => openBillingCard(el.dataset.billingCard));
    on('[data-crypto-token]', openCryptoToken);
    on('[data-coin-principal]', () => openNumberEdit('누적 순투입 원금', settings().coinPrincipalKrw, '코인 시장에 넣은 돈 − 뺀 돈 (원화). 비우면 평단 기준 손익으로 돌아갑니다.', v => { if (v == null) store.settings.coinPrincipalKrw = 0; else store.settings.coinPrincipalKrw = v; }));
    on('[data-coin-flip]', () => { ui.coinBack = !ui.coinBack; render(); });
    on('[data-crypto-refresh]', () => syncCrypto({ silent: false }));
    on('[data-coin-range]', el => { ui.coinRange = el.dataset.coinRange; render(); });
    on('[data-coin-cost]', el => openCoinCost(el.dataset.coinCost));
    on('[data-coin-chart]', el => openCoinChart(el.dataset.coinChart));
    on('[data-stock-chart]', el => openPriceChart({ kind: 'stock', code: el.dataset.stockChart, market: el.dataset.market, exchange: el.dataset.exchange, name: el.dataset.name, sub: el.dataset.stockChart }));
    on('[data-reset]', () => { try { localStorage.removeItem(STORE_KEY); } catch {} location.reload(); });
  }

  window.addEventListener('hashchange', () => { closeSheet(); render(); scrollTo(0, 0); });
  render();

  // 저장소가 Upstash Redis(무료 월 50만 명령)로 바뀌어 한도 걱정이 없다. 앱을 열 때 바로 조회하고,
  // 화면을 보는 동안 5분마다 갱신. 연달아 열고 닫을 때 중복 조회만 1분 간격으로 막는다.
  const SMS_AUTO_SYNC_INTERVAL_MS = 60 * 1000;
  let lastSmsAutoSyncAt = 0;
  try { lastSmsAutoSyncAt = Number(localStorage.getItem('pom_sms_auto_sync_at_v1')) || 0; } catch {}
  function autoSyncSmsWithinQuota() {
    if (document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (now - lastSmsAutoSyncAt < SMS_AUTO_SYNC_INTERVAL_MS) return;
    lastSmsAutoSyncAt = now;
    try { localStorage.setItem('pom_sms_auto_sync_at_v1', String(now)); } catch {}
    syncFromPomServer({ silent:true });
  }
  autoSyncSmsWithinQuota();
  syncCrypto();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      autoSyncSmsWithinQuota();
      syncCrypto();
    }
  });
  setInterval(() => { if (document.visibilityState === 'visible') syncCrypto(); }, 5 * 60 * 1000); // 5분 (서버 저장소 한도 절약)
  setInterval(autoSyncSmsWithinQuota, 5 * 60 * 1000);
})();
