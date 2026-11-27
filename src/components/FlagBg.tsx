// 추천 카드 윗부분 배경(D안, 형님 확정 11/25): 해당 국가·지역 깃발을 어둡게 깔고 영문 지역명을 크게 얹는다.
// 깃발은 public/flags/{ISO 3166-1 alpha-2}.svg 원본(공식 가로세로 비율). 출처·라이선스: docs/flags-license.md
// 깃발은 잘리지 않게 높이에 맞춰 통째로 오른쪽에 두고, 남는 칸은 같은 깃발을 흐리게 채운다.
// 등록되지 않은 국가는 기존 그라데이션만 쓴다(지어내지 않음).

/** 앱의 국가·지역 이름 → ISO 3166-1 alpha-2 (깃발 파일명) */
export const FLAG_CODES: Record<string, string> = {
  베트남: "vn", 홍콩: "hk", 일본: "jp", 중국: "cn", 미국: "us", 태국: "th", 필리핀: "ph", 대만: "tw", 싱가포르: "sg", 마카오: "mo",
  인도네시아: "id", 스페인: "es", 말레이시아: "my", "괌(미국령)": "gu", 호주: "au", 튀르키예: "tr", 오스트리아: "at", 독일: "de", 몽골: "mn", 캐나다: "ca",
  캄보디아: "kh", 멕시코: "mx", "북마리아나(사이판)": "mp", 뉴질랜드: "nz", 슬로베니아: "si", 몰디브: "mv", 핀란드: "fi", 도미니카공화국: "do", 남아프리카공화국: "za", 스리랑카: "lk",
  보스니아: "ba", 모리셔스: "mu", 코스타리카: "cr", 피지: "fj", 팔라우: "pw", 프랑스: "fr", 이탈리아: "it", 영국: "gb", 스위스: "ch", 체코: "cz",
  라오스: "la", 크로아티아: "hr", 포르투갈: "pt", 그리스: "gr", 헝가리: "hu", 네덜란드: "nl", 아랍에미리트: "ae", 우즈베키스탄: "uz", 카자흐스탄: "kz", 이집트: "eg",
  볼리비아: "bo", 아르헨티나: "ar", 페루: "pe", 네팔: "np", 노르웨이: "no", 몬테네그로: "me", 몰타: "mt", 아이슬란드: "is", 알바니아: "al", 조지아: "ge",
  키프로스: "cy", 폴란드: "pl", 모로코: "ma", 요르단: "jo", 탄자니아: "tz", 브라질: "br", 에콰도르: "ec", 칠레: "cl", 콜롬비아: "co", 쿠바: "cu",
  부탄: "bt", 인도: "in", 키르기스스탄: "kg", 뉴칼레도니아: "nc", "프랑스령 폴리네시아": "pf", 덴마크: "dk", 루마니아: "ro", 벨기에: "be", 북마케도니아: "mk", 아일랜드: "ie",
  에스토니아: "ee", 세이셸: "sc", 오만: "om", 케냐: "ke", 과테말라: "gt", 푸에르토리코: "pr", 브루나이: "bn", 바누아투: "vu", "쿡 제도": "ck", 불가리아: "bg",
  세르비아: "rs", 스웨덴: "se", 슬로바키아: "sk", 아르메니아: "am", 나미비아: "na", 마다가스카르: "mg", 카타르: "qa",
};

/** 국가 → 깃발 이미지 경로. 모르면 null */
export function flagSrc(country: string): string | null {
  const code = FLAG_CODES[country];
  return code ? `/flags/${code}.svg` : null;
}

/** 카드 윗배경. 깃발이 없으면 fallback 그라데이션, 영문명이 없으면 영문 생략 */
export function FlagBg({ country, en, fallback }: { country: string; en?: string; fallback: string }) {
  const src = flagSrc(country);
  const name = (en ?? "").trim().toUpperCase();
  return <div className={`rank-bg${src ? " has-flag" : ""}`} aria-hidden style={src ? undefined : { background: fallback }}>
    {src && <>
      <img className="rank-flag-fill" src={src} alt="" loading="lazy" decoding="async" />
      <img className="rank-flag" src={src} alt="" loading="lazy" decoding="async" data-flag={FLAG_CODES[country]} />
    </>}
    {name && <span className="rank-en" style={{ fontSize: `min(${Math.min(30, Math.round(150 / name.length))}cqw, 120px)` }}>{name}</span>}
  </div>;
}
