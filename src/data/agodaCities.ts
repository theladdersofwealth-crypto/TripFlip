/**
 * 아고다 도시 번호(검색 결과 주소의 city=번호). 권역 id → 번호.
 * 출처: 형님이 아고다에서 직접 검색한 결과 주소(2026-11-25). 확인된 번호만 넣는다(추측 금지).
 * 번호가 없는 권역은 아고다가 이름 검색(textToSearch)만으로는 결과를 못 열어 홈으로 간다.
 */
export const AGODA_CITY: Record<string, number> = {
  "jap-takamatsu": 88749,
};
