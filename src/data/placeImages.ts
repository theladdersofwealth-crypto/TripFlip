// 장소별 직접 넣은 이미지(형님 11/24). 비어 있으면 위키미디어 공용 자동 조회 → 폴백 색 블록 순서.
// 제미나이 일러스트 등은 public/place-img/<장소id>.webp (가로 240px, 약 50KB 이하)로 넣고 여기에 한 줄 추가.
// 구글 지도 사진은 저장·수집 금지(약관). 상업 이용 가능한 이미지만.
export interface PlaceImage {
  src: string; // "/place-img/NT-001.webp" 처럼 사이트 안 경로
  credit?: string; // 예: "일러스트: 트립플립(제미나이 생성)" / CC BY면 "사진: 작가 · CC BY 4.0"
  link?: string; // 원본·라이선스 페이지
}

export const PLACE_IMAGES: Record<string, PlaceImage> = {};
