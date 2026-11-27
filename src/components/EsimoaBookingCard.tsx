import { Icon } from "@/components/Icon";
import { esimoaPlansLink } from "@/services/esimoa";

export function EsimoaBookingCard({ country }: { country: string }) {
  const link = esimoaPlansLink(country);
  return <section className="book-card" aria-label="여행 eSIM">
    <div className="row"><Icon name="card" size={20} /><b>여행 eSIM</b></div>
    <a className="btn btn-block" href={link.href} target="_blank"
      rel={link.affiliate ? "noopener noreferrer sponsored" : "noopener noreferrer"} data-usage-outbound="outbound">
      {link.filtered ? `${country} eSIM 요금제 보기` : "이심모아에서 eSIM 요금제 찾기"} <Icon name="link" />
    </a>
    <p className="xs muted">{link.affiliate ? "이심모아 제휴 링크 · " : ""}요금 확인과 결제는 이심모아에서 진행해요.</p>
  </section>;
}
