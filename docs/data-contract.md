# 무료 데이터 적재 계약 v1

운영 시 유료 AI/API 호출 없이 동작하는 **로컬 적재 → 검수 → SQLite → 권역별 JSON** 파이프라인이다. 기존 데이터는 원본과 함께 보존하지만, 이번 이관만으로 확인된 사실이나 상용 재배포 가능 데이터로 승격하지 않는다.

## 실행

Node 24와 Python 3.10 이상만 필요하다. 추가 Python/npm 패키지, 환경변수, API 키, 네트워크 요청은 없다. 프로젝트 루트에서 실행한다.

```bash
node --experimental-strip-types scripts/catalog/extract.mjs
python scripts/catalog/pipeline.py build
python -m unittest discover -s tests -p 'catalog*.py' -v
```

원본 TS 파일은 읽기만 한다. 스냅샷 파일명에는 SHA-256이 들어간다. `data/generated/`는 재생성 가능한 로컬 작업 산출물이며 대략 수십 MB이므로 Git 추적에서 제외하는 것을 권한다. 외부 서비스에 자동 수집 요청을 보내거나 기존 GitHub Actions를 실행하지 않는다.

| 경로 | 용도 |
|---|---|
| `data/generated/raw/extracted.json` | 기존 8개 데이터 모듈의 추출값과 원본 파일 해시 |
| `data/generated/raw/snapshots/` | 원본 TS 내용 보존 |
| `data/generated/raw/imports/` | 새 CSV/JSON 입력 원본의 해시별 보존 |
| `data/generated/staging/imports/` | 수입한 레코드; 아직 공개 데이터가 아님 |
| `data/generated/review/records.json` | 유효 레코드, 버전 해시, 공개 보류 사유 |
| `data/generated/review/quarantine.json` | 범위·참조·스키마 오류와 충돌 레코드 |
| `data/generated/review/issues.json` | 정확한 이름 일치로 통합한 별칭 등의 이력 |
| `data/generated/catalog.sqlite` | 레코드·출처·검수 상태·오류를 검색하는 관리용 DB |
| `data/generated/summary.json` | 실제 보유량·미확인·추정·누락 현황 |
| `public/catalog/manifest.json` | 공개 승인 데이터 색인과 집계 현황 |
| `public/catalog/approved.json` | 앱 번들 어댑터를 위한 승인 레코드 모음 |
| `public/catalog/regions/{id}.json` | 승인된 권역의 관광지·식당·숙소 |

## 무엇을 저장하는가

레코드 종류는 `region`, `place`, `restaurant`, `hotel`이다. 가족 조합별 별도 DB를 만들지 않는다. 개인화는 이 속성과 사용자 조건을 함께 계산한다.

각 레코드의 `fields`에는 값과 상태, 출처 ID, 추정 방법을 저장한다.

| 상태 | 뜻 |
|---|---|
| `verified` | 확인일과 증거가 있는 확인값. AI 출처로 지정할 수 없다. |
| `estimated` | AI·규칙·과거 자료에 따른 추정값. 이용 불가의 근거가 될 수 없다. |
| `unverified` | 기존 자료 등에 값은 있으나 이 적재 작업에서 확인하지 못함. |
| `unknown` | 값이 `null`이다. 0·false·빈 문자열로 대신 채우지 않는다. |

출처의 `kind`는 `official`, `manual`, `open_data`, `wikidata`, `osm`, `legacy`, `legacy_xotelo`, `legacy_ai`, `ai`, `editorial`, `demo`, `user`이다. `editorial`은 자체 여행 분류이며 확인 사실의 근거가 될 수 없다. `url`, `path`, `checkedAt`, `license`, `note`를 함께 관리한다. 출처 확인일은 적재일로 덮어쓰지 않는다. `verified`는 확인일과 URL 또는 증거 메모를 요구한다. 이 검사는 입력의 증거 기재 여부를 검사할 뿐, 사이트 내용이 실제 맞는지를 자동 보증하지 않는다.

기존 `PLACE_FIT`의 0점도 추정 선호도다. `accessRestrictions` 등 제한 필드에 `useAsHardConstraint: true`를 주려면 `verified` 상태의 증거가 있어야 한다. 전체 호텔 평점에서 청결도·객실 정원·아동 정책을 유추하지 않는다.

기존 시범 권역 ID `NT/HK/DN/PQ/OS`는 전 세계 권역 ID에 대응시킨다. 같은 권역의 **정규화된 영문명이 정확히 일치할 때만** 별칭으로 묶는다. 유사 이름을 임의로 합치지 않는다. 원본은 스냅샷에 남는다. 식당 분류는 기존 태그·이름에 따른 임시 분류이므로 명소·시장과 실제 상호의 구분도 검수해야 한다.

## 새 데이터 수입과 수정

양식은 `data/templates/records.example.json`과 `.csv`에 있다. 둘 다 **미검수 양식 예시**이며 실제 추천 데이터가 아니다. JSON은 배열 또는 `{ "records": [...] }` 형식이다. CSV의 복합값은 `fields_json`, `sources_json`, `aliases_json`에 JSON으로 넣는다.

```bash
python scripts/catalog/pipeline.py import my-records.json
python scripts/catalog/pipeline.py build
```

같은 원본을 다시 수입해도 레코드는 늘어나지 않는다. 같은 ID·같은 내용은 통합하고, 같은 ID에 서로 다른 내용이 있으면 양쪽을 격리한다. 기존 레코드를 의도적으로 수정할 때는 먼저 빌드한 뒤 `import --replace`를 사용한다. 기존 내용의 해시를 지정해 대체하며 **기존 승인은 새 내용에 승계되지 않는다.** 여러 차례 수정도 단일 대체 이력이 연결되면 마지막 내용을 사용하며, 같은 버전을 서로 다르게 수정한 분기나 연결이 끊긴 변경은 격리한다.

```bash
python scripts/catalog/pipeline.py import corrected-records.json --replace
python scripts/catalog/pipeline.py build
```

## 공개 승인

검수자만 확인 후 다음 명령을 실행한다. 파이프라인은 자체적으로 승인을 만들지 않는다.

```bash
python scripts/catalog/pipeline.py review --id stable-record-id \
  --reviewer reviewer-name --state approved --reviews data/catalog-reviews.json
python scripts/catalog/pipeline.py build --reviews data/catalog-reviews.json
```

`data/catalog-reviews.json`은 재생성 산출물이 아니라 **검수 원장**이므로 별도로 백업·버전 관리한다. CLI `build`는 이 파일을 기본으로 사용하며, 다른 파일을 쓸 때 `--reviews`를 지정한다. 승인에는 레코드 내용 해시를 고정한다. 값·출처가 바뀌면 재검수해야 한다. 거절은 `--state rejected`로 기록한다. ID마다 검수하며 일괄 자동승인은 없다.

공개하려면 다음 조건을 모두 충족해야 한다.

- 스키마·값 범위·권역 참조 검사를 통과한다.
- 장소·업체 이름의 실재 여부를 확인한 `verified` 이름이 있다.
- 사용한 출처의 라이선스가 식별되고 현재 데이터 이용 방식에 맞는지 검수됐다.
- 레코드의 현재 해시에 대한 승인 기록이 있다.
- 권역 레코드도 승인돼 있다. 부모 권역이 미승인이면 소속 데이터도 공개하지 않는다.
- DEMO가 아니다. 기존 나트랑의 가상 식당 11개를 비롯한 DEMO는 승인 기록이 있어도 공개하지 않는다.

라이선스 기본 허용 목록은 `CC0-1.0`, `CC-BY-4.0`, `ODbL-1.0`, `PUBLIC-DOMAIN`, `OWNED`, `PERMISSION`이다. 이는 자동 법률 판단이 아닌 보수적인 입력 게이트다. OSM 출처는 `ODbL-1.0`을 명시해야 하며 CC BY/ODbL에는 `attribution`과 출처 URL도 필요하다. `PERMISSION`에는 이용 허락 근거를 적는다. ODbL 파생 DB의 공유 의무, 출처별 권리·사진·리뷰 재사용 조건은 별도로 검수해야 한다. 원래 공개돼 있었다거나 무료 API였다는 이유로 라이선스를 채우지 않는다.

이번 기존 자료 이관에서는 필드별 권리와 확인 근거가 충분히 기록돼 있지 않아 **기본 공개 승인 수는 0일 수 있다.** 이는 데이터가 삭제됐다는 의미가 아니다. SQLite와 검수 목록에는 보존되며, 앱의 기존 추정 데이터와 새로 승인된 카탈로그의 상태를 구분해서 보여줘야 한다.

## 앱 읽기 계약

`manifest.json`은 `{ schemaVersion, dataVersion, regions, summary }`를 반환한다. `regions`의 항목은 `{ id, name, counts, url }`이다. 해당 `url`만 필요할 때 읽으면 된다. 지역 파일은 `{ schemaVersion, dataVersion, region, places, restaurants, hotels }`이다. `approved.json`은 `{ schemaVersion, dataVersion, records }`로 같은 승인 레코드를 한 번에 제공한다. `fields`의 상태·출처를 유지해 화면과 추천 엔진에서 추정·미확인·확인을 구분한다. 기존 앱과 합칠 때는 `id`뿐 아니라 `aliases`도 대조해 같은 장소가 중복되지 않게 한다.

`summary`의 집계는 검수 상태 안내용이다. 미검수 장소의 이름이나 원본 행은 공개 집계에 포함하지 않는다. 정보가 부족한 지역을 적합도가 낮은 지역으로 단정해서는 안 된다. 일정 저장 시 `dataVersion`을 함께 남기면 이후 자료 변경을 설명할 수 있다.
