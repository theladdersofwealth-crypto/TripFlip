import type { Place, Restaurant, Zone } from "@/lib/types";

// =====================================================================
// SAMPLE_DATA — 나트랑 시연용 데이터
// - 실제 'Nha Trang POI' / 'Restaurant DB' 파일이 제공되지 않아 만든 DEMO 데이터다.
// - 방문지 이름은 실재 장소명이지만, 체류시간·아이 적합도·피로도·실내외 여부는
//   일정 생성 시연을 위한 DEMO 값이다. 운영시간·주소·가격은 확인 전이므로 null(미확인).
// - 음식점은 실존 업체를 사칭하지 않도록 모두 가상의 "샘플" 식당이다.
// =====================================================================

export const NHA_TRANG_ZONES: Zone[] = [
  { id: "nt-north", destinationId: "nha-trang", name: "나트랑 북부", description: "혼총곶·뽀나가르 참탑 일대", goodFor: ["sightseeing", "culture", "relax"], kidFriendly: true, note: "시내와 가깝고 북부 관광지 접근이 쉬움", source: "DEMO" },
  { id: "nt-center", destinationId: "nha-trang", name: "시내 중심", description: "쩐푸 해변·야시장 일대", goodFor: ["food", "shopping", "night", "sightseeing"], kidFriendly: true, note: "식당·쇼핑 선택지가 많고 도보 이동 가능", source: "DEMO" },
  { id: "nt-south", destinationId: "nha-trang", name: "남부 항구", description: "선착장·박물관 일대", goodFor: ["activity", "nature"], kidFriendly: null, note: "섬 투어·빈원더스 이동이 편리", source: "DEMO" },
  { id: "nt-island", destinationId: "nha-trang", name: "혼째섬", description: "빈원더스 일대", goodFor: ["kids", "activity", "relax"], kidFriendly: true, note: "섬 내 리조트·테마파크 중심, 시내 이동은 불편", source: "DEMO" },
  { id: "nt-west", destinationId: "nha-trang", name: "서부 근교", description: "머드 온천 일대", goodFor: ["relax", "nature"], kidFriendly: null, note: "숙박보다는 방문 위주 지역", source: "DEMO" },
  { id: "nt-camranh", destinationId: "nha-trang", name: "깜란", description: "공항 인근 리조트 지역", goodFor: ["relax", "kids"], kidFriendly: true, note: "리조트 휴양에 집중, 시내 관광은 이동이 김", source: "DEMO" },
];

const base = { destinationId: "nha-trang", hours: null, address: null, source: "DEMO" as const };

export const NHA_TRANG_PLACES: Place[] = [
  { ...base, id: "nt-po-nagar", name: "뽀나가르 참탑", nameEn: "Po Nagar Cham Towers", category: "문화·역사", prefs: ["culture", "history", "sightseeing", "photo"], zoneId: "nt-north", indoor: "outdoor", rainOk: false, grade: 4, kidScore: 3, fatigue: 2, stayMinutes: 60, minKidAge: null, bestTime: "morning", reservation: null, stroller: null, reason: "시내 북쪽에서 짧게 둘러보기 좋은 대표 유적지" },
  { ...base, id: "nt-hon-chong", name: "혼총곶", nameEn: "Hon Chong Promontory", category: "자연·전망", prefs: ["nature", "photo", "sightseeing"], zoneId: "nt-north", indoor: "outdoor", rainOk: false, grade: 3, kidScore: 3, fatigue: 2, stayMinutes: 45, minKidAge: null, bestTime: "morning", reservation: null, stroller: null, reason: "바다 전망 바위 지대, 북부 일정과 묶기 좋음" },
  { ...base, id: "nt-ba-ho", name: "바호 폭포", nameEn: "Ba Ho Waterfalls", category: "자연·트레킹", prefs: ["nature", "activity"], zoneId: "nt-north", indoor: "outdoor", rainOk: false, grade: 3, kidScore: 1, fatigue: 5, stayMinutes: 180, minKidAge: 8, bestTime: "morning", reservation: null, stroller: false, reason: "바위를 오르는 트레킹형 코스, 체력 소모 큼" },
  { ...base, id: "nt-long-son", name: "롱선사", nameEn: "Long Son Pagoda", category: "문화·사원", prefs: ["culture", "history", "sightseeing"], zoneId: "nt-center", indoor: "outdoor", rainOk: false, grade: 3, kidScore: 2, fatigue: 3, stayMinutes: 60, minKidAge: null, bestTime: "morning", reservation: null, stroller: null, reason: "계단을 올라 대불을 보는 시내 사원" },
  { ...base, id: "nt-cathedral", name: "나트랑 대성당", nameEn: "Nha Trang Cathedral", category: "문화·사진", prefs: ["culture", "photo", "sightseeing"], zoneId: "nt-center", indoor: "mixed", rainOk: null, grade: 3, kidScore: 3, fatigue: 1, stayMinutes: 30, minKidAge: null, bestTime: "any", reservation: null, stroller: null, reason: "시내 이동 중 짧게 들르기 좋은 사진 명소" },
  { ...base, id: "nt-yersin", name: "알렉상드르 예르생 박물관", nameEn: "Alexandre Yersin Museum", category: "역사·박물관", prefs: ["history", "culture"], zoneId: "nt-center", indoor: "indoor", rainOk: true, grade: 2, kidScore: 2, fatigue: 1, stayMinutes: 45, minKidAge: null, bestTime: "any", reservation: null, stroller: null, reason: "해변가 소규모 실내 박물관" },
  { ...base, id: "nt-tran-phu", name: "쩐푸 해변", nameEn: "Tran Phu Beach", category: "해변·휴양", prefs: ["relax", "nature", "kids", "photo"], zoneId: "nt-center", indoor: "outdoor", rainOk: false, grade: 4, kidScore: 4, fatigue: 2, stayMinutes: 90, minKidAge: null, bestTime: "afternoon", reservation: null, stroller: null, reason: "시내와 바로 붙은 해변, 늦은 오후 산책·모래놀이" },
  { ...base, id: "nt-dam-market", name: "담 시장", nameEn: "Dam Market", category: "시장·쇼핑", prefs: ["shopping", "food", "culture"], zoneId: "nt-center", indoor: "mixed", rainOk: true, grade: 3, kidScore: 2, fatigue: 3, stayMinutes: 60, minKidAge: null, bestTime: "morning", reservation: null, stroller: false, reason: "현지 시장 구경과 기념품 쇼핑" },
  { ...base, id: "nt-night-market", name: "나트랑 야시장", nameEn: "Nha Trang Night Market", category: "야시장·쇼핑", prefs: ["night", "shopping", "food"], zoneId: "nt-center", indoor: "outdoor", rainOk: false, grade: 3, kidScore: 3, fatigue: 2, stayMinutes: 60, minKidAge: null, bestTime: "evening", reservation: null, stroller: null, reason: "저녁 식사 후 가볍게 걷기 좋은 야시장" },
  { ...base, id: "nt-center-mall", name: "나트랑 센터", nameEn: "Nha Trang Center", category: "쇼핑몰", prefs: ["shopping", "kids"], zoneId: "nt-center", indoor: "indoor", rainOk: true, grade: 2, kidScore: 4, fatigue: 1, stayMinutes: 90, minKidAge: null, bestTime: "afternoon", reservation: null, stroller: null, reason: "냉방되는 실내 쇼핑몰, 더위·비 피하기 좋음" },
  { ...base, id: "nt-oceanography", name: "국립 해양학 박물관", nameEn: "National Oceanographic Museum", category: "박물관·아이", prefs: ["kids", "culture", "nature"], zoneId: "nt-south", indoor: "indoor", rainOk: true, grade: 4, kidScore: 5, fatigue: 1, stayMinutes: 75, minKidAge: null, bestTime: "any", reservation: null, stroller: null, reason: "해양 생물 전시, 실내라 아이 동반·우천 시 좋음" },
  { ...base, id: "nt-lotte-mart", name: "롯데마트 나트랑", nameEn: "Lotte Mart Nha Trang", category: "마트·쇼핑", prefs: ["shopping"], zoneId: "nt-south", indoor: "indoor", rainOk: true, grade: 2, kidScore: 4, fatigue: 1, stayMinutes: 60, minKidAge: null, bestTime: "afternoon", reservation: null, stroller: null, reason: "기념품·생필품 쇼핑, 실내" },
  { ...base, id: "nt-island-tour", name: "섬 호핑 투어", nameEn: "Island Hopping Tour", category: "투어·액티비티", prefs: ["activity", "nature"], zoneId: "nt-south", indoor: "outdoor", rainOk: false, grade: 4, kidScore: 2, fatigue: 4, stayMinutes: 240, minKidAge: 5, bestTime: "morning", reservation: true, stroller: false, reason: "보트로 섬을 도는 반일 투어, 사전 예약 필요(DEMO)" },
  { ...base, id: "nt-vinwonders", name: "빈원더스 나트랑", nameEn: "VinWonders Nha Trang", category: "테마파크", prefs: ["kids", "activity"], zoneId: "nt-island", indoor: "mixed", rainOk: null, grade: 5, kidScore: 5, fatigue: 4, stayMinutes: 300, minKidAge: null, bestTime: "morning", reservation: null, stroller: null, reason: "놀이기구·워터파크·아쿠아리움이 모인 섬 테마파크, 하루 일정 핵심" },
  { ...base, id: "nt-i-resort", name: "아이리조트 머드 온천", nameEn: "I-Resort Mud Bath", category: "온천·휴양", prefs: ["relax", "kids"], zoneId: "nt-west", indoor: "outdoor", rainOk: null, grade: 4, kidScore: 4, fatigue: 2, stayMinutes: 150, minKidAge: null, bestTime: "afternoon", reservation: null, stroller: null, reason: "머드 온천·풀, 가족 반나절 휴양 코스" },
  { ...base, id: "nt-thap-ba", name: "탑바 온천", nameEn: "Thap Ba Hot Spring", category: "온천·휴양", prefs: ["relax"], zoneId: "nt-west", indoor: "outdoor", rainOk: null, grade: 3, kidScore: 3, fatigue: 2, stayMinutes: 120, minKidAge: null, bestTime: "afternoon", reservation: null, stroller: null, reason: "머드 온천 대안 코스" },
];

const rbase = {
  destinationId: "nha-trang",
  hours: null,
  priceLevel: null,
  negativeSummary: null,
  lastVerified: null,
  confidence: "DEMO",
  source: "DEMO" as const,
};

export const NHA_TRANG_RESTAURANTS: Restaurant[] = [
  { ...rbase, id: "nt-r-pho", name: "샘플 쌀국수집 (시내)", cuisine: "베트남 · 쌀국수", zoneId: "nt-center", signature: "소고기 쌀국수", reservation: false, kidsChair: true, kidsMenu: null, kidFriendlyMenu: "맑은 국물 쌀국수", spicy: "mild", clean: null, aircon: true, card: null, rainOk: true, seats6: true, mealTypes: ["lunch", "dinner"] },
  { ...rbase, id: "nt-r-seafood-center", name: "샘플 해산물 레스토랑 (시내)", cuisine: "해산물", zoneId: "nt-center", signature: "해산물 구이", reservation: true, kidsChair: true, kidsMenu: null, kidFriendlyMenu: "볶음밥", spicy: "medium", clean: null, aircon: null, card: null, rainOk: null, seats6: true, mealTypes: ["dinner"] },
  { ...rbase, id: "nt-r-korean", name: "샘플 한식당 (시내)", cuisine: "한식", zoneId: "nt-center", signature: null, reservation: null, kidsChair: true, kidsMenu: null, kidFriendlyMenu: "계란말이·미역국", spicy: "mild", clean: null, aircon: true, card: null, rainOk: true, seats6: true, mealTypes: ["lunch", "dinner"] },
  { ...rbase, id: "nt-r-pizza", name: "샘플 피자·파스타 (시내)", cuisine: "양식", zoneId: "nt-center", signature: "피자", reservation: null, kidsChair: null, kidsMenu: true, kidFriendlyMenu: "키즈 파스타", spicy: "mild", clean: null, aircon: true, card: null, rainOk: true, seats6: null, mealTypes: ["lunch", "dinner"] },
  { ...rbase, id: "nt-r-north-home", name: "샘플 베트남 가정식 (북부)", cuisine: "베트남 가정식", zoneId: "nt-north", signature: "껌땀(덮밥)", reservation: null, kidsChair: null, kidsMenu: null, kidFriendlyMenu: null, spicy: "mild", clean: null, aircon: false, card: null, rainOk: null, seats6: true, mealTypes: ["lunch"] },
  { ...rbase, id: "nt-r-north-cafe", name: "샘플 브런치 카페 (북부)", cuisine: "카페 · 브런치", zoneId: "nt-north", signature: null, reservation: null, kidsChair: true, kidsMenu: true, kidFriendlyMenu: "팬케이크", spicy: "mild", clean: null, aircon: true, card: null, rainOk: true, seats6: null, mealTypes: ["lunch"] },
  { ...rbase, id: "nt-r-north-seafood", name: "샘플 해산물 식당 (북부)", cuisine: "해산물", zoneId: "nt-north", signature: null, reservation: null, kidsChair: null, kidsMenu: null, kidFriendlyMenu: null, spicy: "medium", clean: null, aircon: false, card: null, rainOk: null, seats6: true, mealTypes: ["dinner"] },
  { ...rbase, id: "nt-r-south", name: "샘플 항구 식당 (남부)", cuisine: "베트남 · 해산물", zoneId: "nt-south", signature: null, reservation: null, kidsChair: null, kidsMenu: null, kidFriendlyMenu: "볶음밥", spicy: "mild", clean: null, aircon: null, card: null, rainOk: null, seats6: true, mealTypes: ["lunch", "dinner"] },
  { ...rbase, id: "nt-r-island", name: "샘플 푸드코트 (혼째섬)", cuisine: "푸드코트", zoneId: "nt-island", signature: null, reservation: false, kidsChair: null, kidsMenu: null, kidFriendlyMenu: null, spicy: null, clean: null, aircon: null, card: null, rainOk: true, seats6: true, mealTypes: ["lunch", "dinner"] },
  { ...rbase, id: "nt-r-west", name: "샘플 로컬 식당 (서부)", cuisine: "베트남", zoneId: "nt-west", signature: null, reservation: null, kidsChair: false, kidsMenu: null, kidFriendlyMenu: null, spicy: "medium", clean: null, aircon: false, card: null, rainOk: null, seats6: null, mealTypes: ["lunch"] },
  { ...rbase, id: "nt-r-camranh", name: "샘플 리조트 레스토랑 (깜란)", cuisine: "인터내셔널", zoneId: "nt-camranh", signature: null, reservation: null, kidsChair: true, kidsMenu: true, kidFriendlyMenu: "키즈 메뉴", spicy: "mild", clean: null, aircon: true, card: null, rainOk: true, seats6: true, mealTypes: ["lunch", "dinner"] },
];

/**
 * DEMO 지역 간 이동시간 추정(분, 택시 기준).
 * 실제 지도/경로 API 가 아니다. routing 서비스가 Provider 교체 전까지만 사용한다.
 */
export const NHA_TRANG_ZONE_MATRIX: Record<string, Record<string, number>> = {
  "nt-north": { "nt-north": 10, "nt-center": 12, "nt-south": 25, "nt-island": 45, "nt-west": 20, "nt-camranh": 50 },
  "nt-center": { "nt-center": 8, "nt-south": 15, "nt-island": 30, "nt-west": 15, "nt-camranh": 40 },
  "nt-south": { "nt-south": 8, "nt-island": 15, "nt-west": 20, "nt-camranh": 30 },
  "nt-island": { "nt-island": 10, "nt-west": 35, "nt-camranh": 40 },
  "nt-west": { "nt-west": 10, "nt-camranh": 45 },
  "nt-camranh": { "nt-camranh": 10 },
};
