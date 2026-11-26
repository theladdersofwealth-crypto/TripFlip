// 여행지 검색용 지역 분류. 나라 기준, 지리·여행 관행을 고려한 앱 분류(권역별 중복 없음).
export const TRAVEL_AREAS = [
  {
    "id": "east-asia",
    "label": "동북아"
  },
  {
    "id": "southeast-asia",
    "label": "동남아"
  },
  {
    "id": "south-asia",
    "label": "남아시아"
  },
  {
    "id": "central-asia",
    "label": "중앙아시아"
  },
  {
    "id": "middle-east",
    "label": "중동·캅카스"
  },
  {
    "id": "western-europe",
    "label": "서유럽"
  },
  {
    "id": "southern-europe",
    "label": "남유럽"
  },
  {
    "id": "central-eastern-europe",
    "label": "동·중부유럽"
  },
  {
    "id": "northern-europe",
    "label": "북유럽"
  },
  {
    "id": "north-america",
    "label": "북미"
  },
  {
    "id": "central-america",
    "label": "중미·카리브"
  },
  {
    "id": "south-america",
    "label": "남미"
  },
  {
    "id": "oceania",
    "label": "오세아니아"
  },
  {
    "id": "africa",
    "label": "아프리카"
  }
] as const;
export type TravelArea = typeof TRAVEL_AREAS[number]["id"];
const COUNTRY_AREA: Readonly<Record<string, TravelArea>> = {
  "일본": "east-asia",
  "중국": "east-asia",
  "대만": "east-asia",
  "홍콩": "east-asia",
  "마카오": "east-asia",
  "몽골": "east-asia",
  "베트남": "southeast-asia",
  "태국": "southeast-asia",
  "필리핀": "southeast-asia",
  "싱가포르": "southeast-asia",
  "인도네시아": "southeast-asia",
  "말레이시아": "southeast-asia",
  "캄보디아": "southeast-asia",
  "라오스": "southeast-asia",
  "브루나이": "southeast-asia",
  "몰디브": "south-asia",
  "스리랑카": "south-asia",
  "네팔": "south-asia",
  "부탄": "south-asia",
  "인도": "south-asia",
  "우즈베키스탄": "central-asia",
  "카자흐스탄": "central-asia",
  "키르기스스탄": "central-asia",
  "튀르키예": "middle-east",
  "아랍에미리트": "middle-east",
  "조지아": "middle-east",
  "키프로스": "middle-east",
  "요르단": "middle-east",
  "오만": "middle-east",
  "아르메니아": "middle-east",
  "카타르": "middle-east",
  "프랑스": "western-europe",
  "영국": "western-europe",
  "아일랜드": "western-europe",
  "네덜란드": "western-europe",
  "벨기에": "western-europe",
  "스페인": "southern-europe",
  "포르투갈": "southern-europe",
  "이탈리아": "southern-europe",
  "그리스": "southern-europe",
  "몰타": "southern-europe",
  "크로아티아": "southern-europe",
  "슬로베니아": "southern-europe",
  "보스니아": "southern-europe",
  "몬테네그로": "southern-europe",
  "알바니아": "southern-europe",
  "북마케도니아": "southern-europe",
  "세르비아": "southern-europe",
  "독일": "central-eastern-europe",
  "오스트리아": "central-eastern-europe",
  "스위스": "central-eastern-europe",
  "체코": "central-eastern-europe",
  "헝가리": "central-eastern-europe",
  "폴란드": "central-eastern-europe",
  "루마니아": "central-eastern-europe",
  "불가리아": "central-eastern-europe",
  "슬로바키아": "central-eastern-europe",
  "핀란드": "northern-europe",
  "노르웨이": "northern-europe",
  "아이슬란드": "northern-europe",
  "덴마크": "northern-europe",
  "에스토니아": "northern-europe",
  "스웨덴": "northern-europe",
  "미국": "north-america",
  "캐나다": "north-america",
  "멕시코": "north-america",
  "도미니카공화국": "central-america",
  "코스타리카": "central-america",
  "쿠바": "central-america",
  "과테말라": "central-america",
  "푸에르토리코": "central-america",
  "볼리비아": "south-america",
  "아르헨티나": "south-america",
  "페루": "south-america",
  "브라질": "south-america",
  "에콰도르": "south-america",
  "칠레": "south-america",
  "콜롬비아": "south-america",
  "괌(미국령)": "oceania",
  "호주": "oceania",
  "북마리아나(사이판)": "oceania",
  "뉴질랜드": "oceania",
  "피지": "oceania",
  "팔라우": "oceania",
  "뉴칼레도니아": "oceania",
  "프랑스령 폴리네시아": "oceania",
  "바누아투": "oceania",
  "쿡 제도": "oceania",
  "남아프리카공화국": "africa",
  "모리셔스": "africa",
  "이집트": "africa",
  "모로코": "africa",
  "탄자니아": "africa",
  "세이셸": "africa",
  "케냐": "africa",
  "나미비아": "africa",
  "마다가스카르": "africa"
};
export function travelAreaOf(country: string): TravelArea | undefined {
  return Object.prototype.hasOwnProperty.call(COUNTRY_AREA, country) ? COUNTRY_AREA[country] : undefined;
}
/** 허용된 ID만, 중복 제거 및 고정 순서. 비어 있으면 전체(구버전 조건 포함). */
export function normalizeTravelAreas(value: unknown): TravelArea[] {
  return Array.isArray(value) ? TRAVEL_AREAS.filter((a) => value.includes(a.id)).map((a) => a.id) : [];
}
export function travelAreaSummary(value: unknown): string {
  const selected = normalizeTravelAreas(value);
  return selected.length === 0 ? "상관없음" : selected.length === 1
    ? TRAVEL_AREAS.find((a) => a.id === selected[0])!.label
    : `${TRAVEL_AREAS.find((a) => a.id === selected[0])!.label} 외 ${selected.length - 1}개`;
}
