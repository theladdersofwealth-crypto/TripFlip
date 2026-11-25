import Link from "next/link";
import { AFFILIATE_NOTE } from "@/lib/legal";

// 첫 화면 자주 묻는 질문(11/25). 확인된 사실만 적고, 모르는 건 "미확인"으로 둔다.
const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: "트립플립에서 바로 예약되나요?", a: "아니요. 트립플립은 예약·결제를 직접 하지 않아요. 예약 버튼을 누르면 아고다·클룩 같은 예약 사이트로 이동하고, 예약·결제·취소는 그 사이트에서 해요." },
  { q: "보여 주는 가격은 정확한가요?", a: "아니요, 추정이에요. 항공·숙소 금액은 최근 수집한 최저가의 평균 등으로 계산한 참고값이라 실제 예약가와 달라요. 정확한 요금·남은 객실은 예약 사이트에서 확인해 주세요." },
  { q: "무료인가요?", a: "네. 추천·일정 만들기·회원 가입 모두 무료예요. 비회원은 추천 1~3위까지 볼 수 있고, 가입하면 전체 순위와 자세한 일정을 볼 수 있어요." },
  { q: "트립플립은 어떻게 돈을 버나요?", a: AFFILIATE_NOTE },
  { q: "추천 자료는 어디서 오나요?", a: <>Wikidata·Wikivoyage 같은 공개 자료와 AI 추정값을 함께 써요. 추정값은 화면에 &lsquo;추정&rsquo;으로 표시하고, 영업시간·가족 편의시설처럼 확인 못 한 정보는 미확인으로 둬요. <Link href="/guide#data">데이터 출처 보기</Link></> },
];

/** 안내 탭(/guide)의 자주 묻는 질문. 문의처는 안내 탭의 약관·문의에 있다 */
export function HomeFaq({ bare = false }: { bare?: boolean }) {
  const items = FAQ.map((f, i) => <details key={f.q} open={i === 0}><summary>{f.q}</summary><p className="small muted">{f.a}</p></details>);
  if (bare) return <div className="home-faq guide-faq">{items}</div>;
  return <section className="home-faq" aria-labelledby="home-faq-title">
    <h2 id="home-faq-title">자주 묻는 질문</h2>
    {items}
  </section>;
}
