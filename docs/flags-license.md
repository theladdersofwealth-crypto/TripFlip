# 국기 이미지 출처·라이선스

`public/flags/*.svg` (97개, 파일명 = ISO 3166-1 alpha-2)는 추천 카드 배경에 쓴다. 앱 국가명 → 코드 매핑은 `src/components/FlagBg.tsx`의 `FLAG_CODES`, 전 권역 검증은 `tests/flags.test.ts`.

- 96개: npm `svg-country-flags` 1.2.10 (hjnilsson/country-flags). 위키백과 원본 SVG, 공식 가로세로 비율, 라이선스 Public Domain("PD").
- 키르기스스탄(`kg.svg`): 2023년 개정 국기. 문양은 npm `flag-icons` 7.6.0 (MIT, Copyright (c) 2013 Panayiotis Lipiridis)에서 가져와 가로를 공식 비율 5:3으로 넓혔다.

flag-icons MIT 고지: Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

괌·북마리아나·뉴칼레도니아(카낙 깃발)·프랑스령 폴리네시아·쿡 제도·푸에르토리코·홍콩·마카오는 각 지역 깃발을 쓴다.
