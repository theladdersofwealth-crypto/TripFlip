# TripFlip 인수인계

다른 개발자나 AI가 이 저장소를 기준으로 이어서 편집할 수 있도록 정리한 문서입니다.

## 서비스 목표

목적지를 정하지 못한 사용자가 여행 시기·박수·다양한 동행·서로 다른 취향·전체 예산을 선택하면 권역을 추천합니다. 권역 선택 후 관광·식사 일정을 바꾸고, 항공·숙소 검색을 거쳐 계획을 저장합니다.

무료 운영이 원칙입니다. 사용자 조회마다 유료 AI API를 호출하거나 새로운 유료 서비스를 연결하지 않습니다. 현재는 Next.js/React/TypeScript의 계산 코드와 정적 데이터로 실행됩니다.

## 저장소와 실행

- 저장소: https://github.com/ohysky/TripFlip
- 운영 주소: https://trip-flip.vercel.app (Cloudflare Pages로 이전 중, 2026-11-05)
- 기본 브랜치: `main`. 앱은 정적 내보내기(`output: "export"`, 결과 `out/`)라 Cloudflare Pages 무료 플랜(상업적 이용 가능)에 그대로 올라갑니다.
  - Cloudflare Pages 설정: 빌드 명령 `npm run build`, 출력 폴더 `out`, 환경변수 `NODE_VERSION=22`. `data` 브랜치는 배포 제외.
  - `/trip/[id]`(저장된 여행)는 `public/_redirects`로 껍데기 페이지 하나가 처리합니다.
- 개발은 별도 브랜치와 PR에서 진행합니다. 실제 배포 여부는 Vercel 상태와 운영 화면을 확인합니다.
- Node 24 이상, Python 3.10 이상을 사용합니다. API 키 없이 실행할 수 있습니다.

```bash
npm ci
npm run dev
```

## 어디를 고치면 되는가

| 작업 | 주요 파일 |
|---|---|
| 첫 조건 입력 | `src/app/page.tsx`, `src/components/DateEditor.tsx`, `src/components/CompanionChooser.tsx` |
| 구성원별 상세 설정 | `src/components/PartyEditor.tsx`, `src/lib/travelParty.ts` |
| 권역 점수·경비 | `src/services/regionScore.ts` |
| 결과 카드 | `src/app/results/page.tsx` |
| 일정판·장소/식당 선택 | `src/app/r/[id]/page.tsx`, `src/services/planner.ts` |
| 하루 시간표 | `src/app/r/[id]/day/[n]/page.tsx`, `src/services/itineraryV1.ts` |
| 항공·숙소 링크 | `src/app/book/[id]/page.tsx`, `src/services/booking.ts` |
| 계획 저장·복원·내보내기 | `src/lib/flow.ts`, `src/lib/planDownload.ts`, `src/app/my-trips/page.tsx` |
| 공통 스타일 | `src/app/globals.css` |

## 현재 자료와 한계

- 기존 세계 164권역·3,649개 장소와 시범 자료를 보존했습니다. 전체 자료의 권리·정체성·최신성 검수는 완료되지 않았습니다.
- Wikidata에서 시범 5권역·10장소의 이름·좌표를 출처 확인했습니다. 품질 등급이나 현장 접근성까지 확인한 것은 아닙니다.
- Wikivoyage 식당 105곳·카페 12곳, 총 117곳을 연결했습니다. 기존 후보와 중복되는 업체가 있으므로 117곳 전체가 순증한 수치는 아닙니다.
- 식당 자료는 나트랑 17·다낭 35·푸꾸옥 6·홍콩 48·오사카 11곳입니다. 좌표가 있는 78곳만 자동 동선 후보에 사용합니다. 주소만 있는 39곳은 위치 확인이 필요하다고 표시합니다.
- 식당 원문은 `data/imports/sources/wikivoyage`, 앱 데이터는 `public/dining/catalog.json`과 `src/data/dining.ts`에 있습니다. CC BY-SA 4.0의 출처 표시·변경 표시·동일 조건 공유를 유지해야 합니다.
- 가이드 등록은 현재 영업·메뉴·가격·아기의자·키즈메뉴 확인을 뜻하지 않습니다. 별점·가족 등급·편의시설을 임의로 채우면 안 됩니다.
- 실시간 항공·숙박 가격, 숙소 청결 세부평점·정원, 실제 도로 이동시간은 연결되지 않았습니다. 외부 링크는 현재 일반 검색 링크입니다.
- 계획은 해당 기기·브라우저에 저장합니다. 로그인 동기화나 계획 파일 가져오기는 아직 없습니다.

## 데이터 갱신

```bash
npm run catalog:extract
npm run catalog:build
npm run dining:build
```

`data/generated/`의 원본 보관·SQLite·검수 작업 파일은 Git에서 제외됩니다. 승인한 공개 자료만 `public/catalog/`로 내보냅니다. 식당 갱신은 원문 해시와 리비전을 검사하고 `data/generated/dining.sqlite` 및 정적 JSON을 생성합니다. 새 원문을 받으면 조회 시각·라이선스·레코드 내용을 다시 확인해야 합니다.

## 반드시 유지할 동작

1. 가족 조합별 DB를 만들지 않고 구성원 조건을 조합해 계산합니다. 성인 자녀는 실제 나이가 18세 이상이면 성인 인원에 반영합니다.
2. 관계·성별·나이만으로 취향이나 보행 능력을 단정하지 않습니다. AI 추정 0점과 확인된 이용 금지는 별개입니다.
3. 숙박비는 박수, 식비는 여행일수로 계산합니다. 객실 수 미정 시 비용 가정은 실제 투숙 정원 보장이 아닙니다.
4. 기존 저장 계획과 고정 칸을 보존합니다. 새 데이터의 좌표를 모른다고 도시 중심으로 대신 채우지 않습니다.
5. 첫 화면과 선택창의 기본 조작을 간단하게 유지하고, 세부 설정·점수 설명·출처는 펼쳐볼 수 있게 합니다.

## 검증

```bash
npm run typecheck
npm test
npm run test:catalog
npx playwright install chromium
npm run test:e2e
npm run build
```

최근 기준은 TypeScript 테스트 28개, Python 테스트 22개, 모바일 E2E 3개로 총 53개입니다. E2E는 자체 개발 서버를 실행합니다. `/tmp/tripflip-browsers`를 쓰는 환경에서는 `PLAYWRIGHT_BROWSERS_PATH=/tmp/tripflip-browsers npm run test:e2e`로 실행합니다.

## 다음 편집 우선순위

실제 식당 메뉴·동행 편의시설과 숙소 청결·객실 정책의 근거를 보강하고, 부족한 권역으로 확장합니다. 항공편 시간·숙소 위치 확정 후의 동선 재계산도 남아 있습니다. 무료 호스팅에도 용량·상용 이용 조건이 있으므로 유료 전환을 임의로 활성화하지 않습니다.

추가 근거: `docs/implementation-v3.md`, `docs/data-contract.md`, `docs/pilot-sources.md`, `docs/dining-and-selection.md`, `docs/verification.md`.
