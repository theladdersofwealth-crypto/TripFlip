// POM 데이터 (공개 저장소용: 개인 금융정보 제거본, 원본은 비공개 백업). 구글 시트 + Vercel API 연결 후 이 파일은 샘플 데이터로 교체하고 실데이터는 저장소에서 제거한다.
// 구조는 구글 시트 탭과 1:1로 맞춘다: transactions / accounts / assets / investments / liabilities / settings
window.POM_DATA = {
  asOf: '2026-11-03',

  // 소비 '대상' 축 (누구를 위해 썼나)
  members: [
    { id:'family',   name:'가족' },
    { id:'children', name:'자녀' },
    { id:'yunseok',  name:'본인' },
    { id:'seyoung',  name:'배우자' }
  ],

  // 소비 '카테고리' 축 (무엇에 썼나)
  categories: ['생활비','식비','외식비','간식비','사치품','여행경비','고정비/준고정비','육아·교육','의료','교통','유류비','차량관리','주거·관리비','통신','보험','문화/여가','골프','경조사','쇼핑','의류비','대출상환','기타','미분류'],

  // 결제수단. sms=자동 수신, manual=앱에서 수기 입력 (롯데카드는 나눠쓰기 외 사용이 드물어 수기)
  cards: [
    { id:'shinhan', name:'신한카드',      source:'sms' },
    { id:'hyundai', name:'현대카드',      source:'sms' },
    { id:'woori',   name:'우리카드',      source:'sms' },
    { id:'kb',      name:'KB국민카드',    source:'sms' },
    { id:'samsung', name:'삼성카드', source:'sms' },
    { id:'nh',      name:'NH농협카드',    source:'sms' },
    { id:'lotte',   name:'롯데카드',      source:'manual' },
    { id:'cash',    name:'현금·계좌이체', source:'manual' }
  ],

  // 거래 원장. kind: expense(지출) | income(수입) | refund(환불, 지출에서 차감) | transfer(이체, 집계 제외)
  transactions: [],

  // 계좌. balance가 null이면 '미입력' (앱에서 직접 입력 가능, 이후 API 연동)
  accounts: [
    { id:'shinhan', institution:'신한은행',   type:'deposit', balance:null },
    { id:'kb',      institution:'국민은행',   type:'deposit', balance:null },
    { id:'woori',   institution:'우리은행',   type:'deposit', balance:null },
    { id:'sbi',     institution:'SBI저축은행', type:'deposit', balance:null },
    { id:'busan',   institution:'부산은행',   type:'deposit', balance:null },
    { id:'im',      institution:'iM뱅크',     type:'deposit', balance:null }
  ],

  assets: {
    realEstate: [],
    vehicles: []
  },

  investments: {
    // 실제 값은 한국투자증권 연동(/api/stocks)에서 받는다. 연동 전에는 0
    stocks: {
      broker: '한국투자 증권',
      value: 0,
      pnl: 0,
      rate: 0,
      status: '연동 전 · 설정에서 연동 비밀번호를 넣으면 실제 잔고가 나옵니다',
      holdings: []
    },
    // 실제 값은 거래소 연동(/api/crypto)에서 받는다. 연동 전에는 0
    coin: {
      exchange: 'Binance',
      usd: 0,
      status: '연동 전',
      holdings: []
    }
  },

  // 부채. monthlyPayment가 없으면 이자만 (잔액 × 금리 / 12) 로 월 비용을 계산
  liabilities: [],

  settings: {
    usdKrw: 1400,
    coinPrincipalKrw: 0, // 코인 누적 순투입 원금(원화), 코인 화면에서 수정
    vehicleDepreciation: 0.12, // 차량 연 감가율 (설정에서 변경)
    fuelKeywords: ['주유소','주유','SK에너지','GS칼텍스','GS CALTEX','S-OIL','S OIL','에쓰오일','현대오일뱅크','HD현대오일뱅크','알뜰주유소','E1','SK가스'],
    fuelVehicleByCard: {}
  }
};
