# 최근 5년 권역 기후 자료

- 기준: 마지막으로 끝난 달력 연도 5개(2021–2025). 달력 월 12개의 5개년 평균이다. 기후 평년(30년)이나 여행 날짜의 예보가 아니다. 여행지 대표 좌표의 격자값이며 관측소 실측은 아니다.
- 평균기온과 평균 일 최고기온은 Copernicus ERA5 2m 기온의 °C 환산값이다. 총강수량은 눈과 비를 합친 물의 양이며, ERA5 평균 강수율 × 월별 초 수를 각 연도에 적용한 뒤 평균한다. 2024년 2월의 윤일을 포함한다.
- 적설 수분량은 **쌓인 눈을 모두 녹였을 때의 물 두께(mm)**의 월평균이다. 그달에 새로 내린 눈의 양이나 실제 쌓인 눈의 깊이(cm)가 아니다. 둘은 밀도와 눈이 녹는 속도에 따라 달라져 임의 환산하지 않는다.
- 강수일수는 NASA POWER에서 하루 강수량이 1mm 이상인 날의 월별 개수를 5개년 평균한 수치다. 일조는 기존과 같이 맑은 하늘 대비 일사량으로 추정한다. 결측 일조는 0이 아니다. 과거 아시아 시범지 5곳 기반 보정식을 다른 기후대에 일괄 적용하지 않는다.
- 산악·해안·작은 섬에서는 한 격자 안 고도·육지/해수 차이로 대표성이 떨어질 수 있다. 새 권역 좌표는 여행지 대표점이지 기상관측소의 위치가 아니다. 눈·강수량을 새 점수 항목으로 추가하지 않으며 기존 기후 판정식은 유지한다.
- 앱 기후 자료는 최신 5년만 사용한다. 예전 2015–2024년 자료는 데이터 브랜치의 역사 파일에 남으며 앱의 최신 데이터로 쓰지 않는다. 본 항목은 실시간 서비스가 아니라 검증 후 반영하는 정적 자료다.

## 출처·이용 조건

- Contains modified Copernicus Climate Change Service information (2026). Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data this product contains.
- Copernicus Climate Change Service / ECMWF: [ERA5](https://doi.org/10.24381/cds.f17050d7), accessed via [NSF NCAR GDEX](https://doi.org/10.5065/BH6N-5N20) and the [Planette ERA5 Archive](https://registry.opendata.aws/planette_era5_reanalysis/) (2026-11-27). Redistribution and adaptation use the source's [Copernicus Products licence](https://cds.climate.copernicus.eu/licences/licence-to-use-copernicus-products). [Hersbach et al., 2020](https://doi.org/10.1002/qj.3803).
- [NASA Langley Research Center POWER Project](https://power.larc.nasa.gov/docs/referencing/), daily API, accessed 2026-11-27. API version and archive snapshot are pinned in the generated file's header. [Terms](https://registry.opendata.aws/nasa-power/).

## 재수집

원본 임시 파일은 커밋하지 않는다. 대량 조회는 NASA 지침에 따라 최대 5개 동시 요청으로 제한한다. 새 권역을 추가하면 목록을 별도로 수정하는 대신 앱 좌표에서 다시 생성한다.

```sh
python -m pip install xarray zarr icechunk 'dask[array]'
node --import tsx scripts/export-climate-centers.mjs > /tmp/tripflip-centers.json
python scripts/collect-climate-era5.py /tmp/tripflip-centers.json /tmp/tripflip-era5.json G7V43KR1PC5RX60G1DN0
python scripts/collect-climate-power.py /tmp/tripflip-centers.json /tmp/tripflip-power-2021-2025
python scripts/build-recent-climate.py /tmp/tripflip-centers.json /tmp/tripflip-era5.json /tmp/tripflip-power-2021-2025 src/data/worldWeather.ts
```

## 이번 변경의 추천 영향

같은 조건(성인 2명, 5박, 중·동유럽, 관광, 예산 미정)으로 입력만 고정하고 최신 데이터 적재 전과 후를 비교했다. 사용자의 캡처에 있었던 정확한 입력을 재현한 것은 아니다.

| 권역 | 5월 점수 / 순위 | 1월 점수 / 순위 |
|---|---|---|
| 그단스크 | 35 → 40 / 22 → 14 | 35 → 28 / 14 → 23 |
| 크라쿠프 | 40 → 45 / 15 → 4 | 40 → 33 / 2 → 13 |
| 브라티슬라바 | 32 → 36 / 27 → 21 | 32 → 24 / 24 → 27 |

5월은 세 권역 모두 기후 미확인에서 '보통'으로 바뀌었고, 1월은 '혹한기'로 분류되었다. 기존 점수 공식은 유지했다. 트롬쇠·로포텐의 1·11·12월에는 일조 추정값을 만들지 않았다(6칸). 해당 월에는 확인 가능한 기온으로 이미 혹한기 조건을 충족하므로 기후 판정은 미확인이 아니다.
