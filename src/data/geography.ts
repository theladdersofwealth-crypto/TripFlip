import type { Continent } from "@/lib/types";

// SAMPLE_DATA — TripFlip Travel Master 구조(Continent → Subregion → Country → Tourism Area)를
// 그대로 따르는 소규모 시연용 데이터. 실제 마스터 파일을 받으면 이 파일을 교체한다.
export const GEOGRAPHY: Continent[] = [
  {
    id: "asia",
    name: "아시아",
    subregions: [
      {
        id: "southeast-asia",
        name: "동남아시아",
        countries: [
          {
            id: "vn",
            name: "베트남",
            nameEn: "Vietnam",
            areas: [
              { id: "vn-nhatrang", name: "나트랑", nameEn: "Nha Trang", administrativeDivision: "카인호아성", geographicCoverage: "나트랑 시내 · 깜란 · 인근 섬", duplicateNote: null, destinationId: "nha-trang" },
              { id: "vn-danang", name: "다낭", nameEn: "Da Nang", administrativeDivision: "다낭시", geographicCoverage: null, duplicateNote: null, destinationId: "da-nang" },
              { id: "vn-phuquoc", name: "푸꾸옥", nameEn: "Phu Quoc", administrativeDivision: "끼엔장성", geographicCoverage: null, duplicateNote: null, destinationId: "phu-quoc" },
            ],
          },
          {
            id: "ph",
            name: "필리핀",
            nameEn: "Philippines",
            areas: [{ id: "ph-cebu", name: "세부", nameEn: "Cebu", administrativeDivision: "세부주", geographicCoverage: null, duplicateNote: null, destinationId: "cebu" }],
          },
          {
            id: "th",
            name: "태국",
            nameEn: "Thailand",
            areas: [{ id: "th-bangkok", name: "방콕", nameEn: "Bangkok", administrativeDivision: null, geographicCoverage: null, duplicateNote: null, destinationId: "bangkok" }],
          },
        ],
      },
      {
        id: "east-asia",
        name: "동아시아",
        countries: [
          {
            id: "jp",
            name: "일본",
            nameEn: "Japan",
            areas: [{ id: "jp-okinawa", name: "오키나와", nameEn: "Okinawa", administrativeDivision: "오키나와현", geographicCoverage: null, duplicateNote: null, destinationId: "okinawa" }],
          },
          {
            id: "kr",
            name: "대한민국",
            nameEn: "South Korea",
            areas: [{ id: "kr-jeju", name: "제주", nameEn: "Jeju", administrativeDivision: "제주특별자치도", geographicCoverage: null, duplicateNote: null, destinationId: "jeju" }],
          },
        ],
      },
    ],
  },
  { id: "europe", name: "유럽", subregions: [] },
  { id: "oceania", name: "오세아니아", subregions: [] },
];
