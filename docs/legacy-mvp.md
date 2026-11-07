# TripFlip (트립플립) — 1차 MVP

> 나에게 맞는 여행을 발견하다

여행 조건 → 여행지 발견 → 숙박 지역 → 방문지·음식점 → **실제 이동 가능한 일정**까지 좁혀 주고,
만든 일정을 **필요한 구간만** 다시 최적화하는 개인화 여행 플래너의 작동하는 MVP입니다.

## 실행 방법

```bash
npm install
npm run dev        # http://localhost:3000
# 또는
npm run build && npm start
```

- 환경변수 없이 실행됩니다. 유료 API를 쓰지 않습니다.
- Vercel: 저장소를 Import하면 별도 설정 없이 배포됩니다 (Framework: Next.js).
- Node 18.18 이상 (검증: Node 22).

## 사용 기술

- Next.js 15 (App Router) + React 19 + TypeScript 5
- UI 라이브러리 없음. 순수 CSS(`src/app/globals.css`)와 인라인 SVG 아이콘
- 상태 저장: `localStorage` (`tripflip:v1`), 로그인 없음
- 로고: 제공받은 공식 로고 이미지를 잘라서 그대로 사용 (`public/logo-full.png`, `public/app-icon.png`)

## 폴더 구조

```
src/
  app/                    화면 (라우트)
    page.tsx              홈
    plan/                 여행 조건 입력
    discover/             여행지 발견 (Flip 카드)
    search/               이미 여행지가 있어요 (대륙→권역→국가→지역)
    create/[dest]/        여행 생성 (숙소·식사시간·필수/제외 장소·예약 일정·교통)
    trip/[id]/            여행 상세 (일정 | 방문지 | 음식점 | 숙소-준비중)
    trips/                내 여행 (저장 목록, Free 3개 한도)
    premium/              Free / Premium 안내
  components/             DestinationCard, TripForm, DayTimeline, PlaceCard,
                          RestaurantCard, WeatherBadge, AppShell, ui(Badge/Chip/Sheet…)
  data/                   DEMO 데이터 + repository(데이터 접근 계층)
  services/
    recommendation.ts     일정 생성 + 재최적화 엔진 (UI와 분리)
    discovery.ts          여행지 발견 / 숙박 지역 추천
    routing.ts            이동시간 Provider (현재 DEMO 지역 매트릭스)
    weather.ts            날씨 Provider (현재 미연결)
    demo.ts               기본 Demo 시나리오
  store/TripStore.tsx     전역 상태 + localStorage 영속화
  lib/                    타입, 라벨, 시간 유틸
```

## 현재 구현 기능 (모두 실제 동작)

| Flow | 내용 |
|---|---|
| 홈 | 주요 CTA 3개, 여행지 카드 가로 스크롤, 테마 시작, Demo 일정 바로 열기 |
| 여행 조건 입력 | 출발지, 날짜, 성인/어린이/연령, 유모차, 여행 스타일(가성비·가심비·프리미엄), 강도, 취향(복수) |
| 여행지 발견 | 카드를 한 장씩 넘기며 탐색(버튼·스와이프), 카드 뒤집어 상세 보기, 내 조건 일치 태그, 즐겨찾기 |
| 여행지 검색 | Continent → Subregion → Country → Tourism Area + 이름 검색 (ID 비노출) |
| 여행 생성 | 숙소 이름/위치, **숙박 지역 추천받기**, 체크인/아웃, 식사시간, 필수·제외 장소, 이미 예약한 일정, 렌터카/대중교통/택시 |
| 일정 결과 | **1일차/2일차** 크게 + 실제 날짜 보조표시, 날씨 영역, 타임라인, 이동시간 연결선, 경고(시간 겹침·운영시간 미확인·아이 피로) |
| 일정 수정 | 삭제 → **빈 시간 다시 추천**(그 시간대만), 다른 장소로 변경, 시간 변경, 순서 변경(↑↓, 시간 재계산), 즐겨찾기 |
| 여유 시간 | 일정 사이 60분 이상 비면 “이 시간 추천받기” |
| 강도 재조정 | 여유롭게/보통/알차게 전환 시 즐겨찾기·필수·예약 일정은 유지하고 일정 수·휴식만 조정 |
| 하루 단위 조정 | “오늘 너무 빡세요”, “실내 중심으로”, 비 예보 시 “실내 일정으로 조정할까요?” |
| 방문지 탭 | 시각적 카드 + 펼침 상세 (등급, 체류, 아이 적합도, 피로도, 실내/실외, 우천, 운영시간, 이동시간, 추천 이유), 필터 |
| 음식점 탭 | 카드 + 상세 (아기의자, 키즈메뉴, 매운 정도, 6인 착석, 냉방, 카드결제, 부정 후기, 신뢰도, 마지막 확인일 …), 필터 |
| 저장 | 모든 수정 자동 저장 + “여행 저장” 버튼, 새로고침해도 유지, 여행 삭제 |
| Free/Premium | FREE / PREMIUM 배지, 출시 기념 90일 무료 안내, Free 저장 3개 한도 |

### 일정 생성 규칙 (services/recommendation.ts)

- 하루 상한: 여유롭게 2곳·240분 / 보통 3곳·360분 / 알차게 5곳·540분. 첫날·마지막 날은 절반, 3세 이하 아이 동반 시 체류 예산 15% 감소
- **하루에 몰아넣지 않기**: 날짜마다 앵커(핵심 장소)를 먼저 배정한 뒤 하루씩 번갈아 1곳씩 채움
- **동선**: 하루의 앵커 지역에서 이동 25분 이내 장소만 묶고, 하루 안에서는 가까운 순 + 오전형/오후형/저녁형 순서
- **식사시간 고정**: 사용자가 정한 점심·저녁 시간에 동선 근처 식당 배치, 같은 식당 반복 지양, 아이 동반 시 아기의자·안 매움·냉방, 6인 이상이면 착석 가능 여부 반영
- **휴식 도배 금지**: 휴식은 3세 이하 낮잠 블록 + 하루 최대 1회 자유시간만. 나머지 빈 시간은 “여유 시간 추천받기”로 남김
- 테마파크처럼 반나절 이상 장소는 그 안에서 점심을 먹고 오전/오후로 나눠 표시
- 아이 최소 연령 미달 장소 제외, 유모차 불가 장소 감점, 비 예보일엔 실내 가점
- **운영시간을 만들지 않음**: 모든 방문지 운영시간은 “미확인”으로 표시하고 방문 전 확인 안내

## Mock 데이터 여부

제공된 실제 데이터 파일(Travel Master, Nha Trang POI, Restaurant DB, Hotel DB)이 없어서 **모든 데이터는 DEMO(SAMPLE_DATA)** 입니다. 코드 주석과 UI 배지로 구분합니다.

| 데이터 | 상태 |
|---|---|
| 여행지 7곳 (`data/destinations.ts`) | DEMO. 점수 없음 → 태그로만 표시. 자동 일정은 나트랑만 지원 |
| 지리 계층 (`data/geography.ts`) | DEMO. Travel Master 구조 그대로 |
| 나트랑 방문지 16곳 | 장소명은 실제, 체류시간·아이 적합도·피로도·실내외는 DEMO 추정, **운영시간·주소는 미확인** |
| 나트랑 음식점 11곳 | **가상의 샘플 식당** (실존 업체 아님). 가격·영업시간·후기·확인일은 미확인 |
| 이동시간 | 지역(Zone) 간 DEMO 추정 매트릭스. UI에 “(추정)” 표시 |
| 날씨 | **연결 안 됨** — 값을 만들지 않고 “미연결/미확인” 표시. 비 예보는 사용자가 켜는 “DEMO 시뮬레이션”으로만 시연 |

## 실제 API로 교체해야 할 부분

| 영역 | 교체 지점 |
|---|---|
| 여행 데이터 DB | `src/data/repository.ts`의 함수 구현만 교체 (UI는 repository만 사용) |
| 지도/이동시간 | `src/services/routing.ts` → `RoutingProvider` 구현 후 `setRoutingProvider()` (Google/Mapbox/Naver/Kakao) |
| 날씨 | `src/services/weather.ts` → `WeatherProvider` 구현 후 `setWeatherProvider()` |
| AI 추천 | `generateRecommendation()`이 `TripRecommendation { destination, dates, profile, days[] }`를 반환. 같은 구조로 API 응답을 받으면 됨 |
| 저장 | `src/lib/storage.ts` (localStorage) → 로그인 후 서버 저장 |

## 향후 개발 우선순위

1. 실제 Travel Master / Nha Trang POI / Restaurant / Hotel 데이터 연결 (운영시간·좌표 확인 데이터)
2. 지도 Provider 연결 → 실제 이동시간, 지도 뷰
3. Weather API 연결 → 비 예보 시 자동 제안 (Premium)
4. 숙소 탭 + 숙소별 일정 비교 (Premium)
5. AI 일정 수정(자연어 “아이 때문에 오후 줄여줘” 등) 백엔드
6. 로그인·클라우드 저장, 공유/PDF 여행계획서
7. 드래그 앤 드롭 순서 변경, 일정 추가(방문지 탭에서 바로 넣기)

## 의도적으로 구현하지 않은 것

- 실제 결제, 항공·호텔 예약, 실시간 가격·날씨·리뷰 (지시서 금지 항목)
- 관리자 페이지, AI 챗봇 UI, 전세계 DB 조사
- 나트랑 이외 여행지의 자동 일정 (데이터가 없어 “데이터 준비중” 표시)
- 숙소 탭 (탭 자리만 “준비중”으로 확보)
- 로그인 (localStorage로 대체)
- 드래그 앤 드롭 (↑↓ 버튼으로 대체)

## QA 결과 (390×844 모바일 / 768 태블릿 / 1366 데스크톱, Playwright)

- 모든 화면 가로 스크롤 없음 (scrollWidth = 390)
- 홈 → 조건 입력 → 발견(넘기기·뒤집기·준비중 안내) → 여행 생성(숙박 지역 추천) → 일정 → 방문지/음식점 탭 Flow 통과
- 일정 삭제 → 빈 시간 다시 추천: 해당 시간대만 교체, 삭제한 장소는 후보에서 제외, 뒤 일정은 유지(필요 시 시간만 밀림)
- 강도 보통→여유롭게→알차게 전환, 비 시뮬레이션 → 실내 조정 동작
- 새로고침 후 일정·강도·즐겨찾기 유지
- Empty State: 내 여행 없음, 즐겨찾기 없음, 없는 여행 ID, 데이터 없는 대륙
- 콘솔 에러 0건
