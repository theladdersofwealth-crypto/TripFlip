# Pilot open-data sources

2026-11-03에 Wikidata 공식 `wbgetentities` API를 직접 조회해 확인한 무료 데이터 15건입니다. 신규 수집은 API 키·유료 모델·유료 데이터 공급자를 사용하지 않았습니다.

## 확인 범위

- Wikidata의 구조화 데이터는 CC0입니다: https://www.wikidata.org/wiki/Wikidata:Licensing
- 각 레코드의 `name`, `en`, `wikidataId`, 지구 좌표 `P625`만 원문과 대조했습니다.
- `verified`는 해당 출처에 기재된 값을 확인했다는 의미이며, 현장 조사·최신 영업 상태·정확한 출입구 위치를 보장하지 않습니다.
- 한국어 Wikidata label이 없는 곳은 영어 이름을 그대로 사용했습니다. 다른 곳에서 번역 이름을 가져와 검증된 값처럼 붙이지 않았습니다.
- `concepts`와 `tags`는 TripFlip이 새로 작성한 계획용 분류입니다. `estimated`로 분리하고 현장 적합도 사실로 사용하지 않습니다.
- 품질 등급·체류시간·영업시간·출입 제한·유모차 접근성·가격은 채우지 않았습니다.

## 확인한 엔티티

|유형|저장 ID|원문 이름|Wikidata|확인한 리비전|
|---|---|---|---|---|
|region|`vie-nhatrang`|냐짱 / Nha Trang|[Q19491](https://www.wikidata.org/wiki/Q19491)|2560022941|
|region|`vie-danang`|다낭 / Da Nang|[Q25282](https://www.wikidata.org/wiki/Q25282)|2562338119|
|region|`vie-phuquoc`|푸꾸옥섬 / Phú Quốc|[Q146695](https://www.wikidata.org/wiki/Q146695)|2541716908|
|region|`hon-hongkong`|홍콩 / Hong Kong|[Q8646](https://www.wikidata.org/wiki/Q8646)|2563803747|
|region|`jap-osaka`|오사카시 / Osaka|[Q35765](https://www.wikidata.org/wiki/Q35765)|2563559021|
|place|`wikidata:Q600269`|포 나가 / Po Nagar|[Q600269](https://www.wikidata.org/wiki/Q600269)|2424864625|
|place|`wikidata:Q2277986`|롱선사 / Long Sơn Pagoda|[Q2277986](https://www.wikidata.org/wiki/Q2277986)|2478531583|
|place|`wikidata:Q10796763`|미케 해변 / My Khe Beach|[Q10796763](https://www.wikidata.org/wiki/Q10796763)|2552647023|
|place|`wikidata:Q5305270`|롱교 / Dragon River Bridge|[Q5305270](https://www.wikidata.org/wiki/Q5305270)|2484989062|
|place|`wikidata:Q48078466`|Hòn Thơm cable car / Hòn Thơm cable car|[Q48078466](https://www.wikidata.org/wiki/Q48078466)|2530912417|
|place|`wikidata:Q1749599`|Phu Quoc National Park / Phu Quoc National Park|[Q1749599](https://www.wikidata.org/wiki/Q1749599)|2316927060|
|place|`wikidata:Q17541`|빅토리아 피크 / Victoria Peak|[Q17541](https://www.wikidata.org/wiki/Q17541)|2517773244|
|place|`wikidata:Q605959`|홍콩 디즈니랜드 / Hong Kong Disneyland|[Q605959](https://www.wikidata.org/wiki/Q605959)|2562318034|
|place|`wikidata:Q321242`|오사카성 / Osaka Castle|[Q321242](https://www.wikidata.org/wiki/Q321242)|2564217657|
|place|`wikidata:Q1375103`|유니버설 스튜디오 재팬 / Universal Studios Japan|[Q1375103](https://www.wikidata.org/wiki/Q1375103)|2562301771|

## 기존 자료에서 발견한 불일치

`src/data/worldV1.ts`의 `vie-nhatrang-660`은 “나트랑 해변 / Nha Trang Beach”라는 이름에 `Q117326038`을 연결하고 있었습니다. 2026-11-03 공식 API에서 해당 QID의 영어 label은 **Nha Trang Beach Hotel**이었습니다. 해변과 호텔의 좌표가 가까워도 같은 장소라고 할 수 없으므로 이번 관광지 데이터에서 제외했습니다. 기존 원본은 이 작업에서 수정하지 않았습니다.

- 확인 엔티티: https://www.wikidata.org/wiki/Q117326038
- 원본 QID와 좌표가 있다는 사실만으로 올바른 장소가 확인된 것은 아닙니다.

## 적재 및 검수

`data/imports/wikidata-pilot.json`은 공통 canonical schema를 따릅니다. 5개 권역은 기존 canonical ID를 유지하므로 최초 적재 시 명시적인 교체 절차를 사용해야 합니다. 관광지 ID는 `wikidata:Q...`이고 기존 후보 ID를 aliases로 남겼습니다.

```bash
npm run catalog:extract
python scripts/catalog/pipeline.py build
python scripts/catalog/pipeline.py import data/imports/wikidata-pilot.json --replace
python scripts/catalog/pipeline.py build
```

가져오기만으로 공개되지 않습니다. 검수자가 레코드와 출처를 확인하고, `review --state approved --reviews <원장경로>`로 해당 레코드 해시에 대한 승인을 기록한 뒤 같은 원장을 지정해 다시 build해야 합니다. 세부 명령은 `docs/data-contract.md`를 따릅니다.

운영 시에는 소수 엔티티 조회로 원문을 재확인한 뒤 갱신하며, 앱 조회마다 Wikidata API를 호출하지 않습니다.

## 보존한 원문 응답

- 파일: `data/imports/sources/wikidata-pilot-2026-11-03.json`
- 메타데이터: `data/imports/sources/wikidata-pilot-2026-11-03.manifest.json`
- 조회 시각(UTC): `2026-11-03T15:16:41.507878+00:00`
- 바이트 수: 854995
- SHA256: `e06fef3dbf71fae79c82b0ae0af3ccaa075461fda501b4969af4d33768ab0c68`
- `info|labels|claims`를 요청한 HTTP 응답 본문 바이트를 그대로 보존했습니다. 요청 URL과 사용한 엔티티 목록은 메타데이터 파일에 있습니다.
- 이 응답에서 각 엔티티의 `lastrevid`를 확인했습니다. seed의 출처 note는 해당 리비전과 보존 파일을 가리킵니다.
- 기존 `worldV1` ID와 일부 시범 ID를 aliases로 연결했으나, aliases는 중복 식별 보조이며 기존의 등급·제한사항을 검증된 값으로 승격하지 않습니다.
