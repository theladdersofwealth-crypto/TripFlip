import { BookingAffiliateBadge } from "@/components/BookingAffiliateBadge";
import { Icon } from "@/components/Icon";
import { esimoaPlansLink } from "@/services/esimoa";

export function EsimoaBookingCard({ country }: { country: string }) {
  const link = esimoaPlansLink(country);
  return <section className="book-card" aria-label="여행 eSIM">
    <div className="row"><Icon name="card" size={20} /><b>여행 eSIM</b></div>
    <a className="btn btn-block" href={link.href} target="_blank"
      rel={link.affiliate ? "noopener noreferrer sponsored" : "noopener noreferrer"} data-usage-outbound="outbound">
      {link.filtered ? `${country} eSIM 요금제 보기` : "이심모아에서 eSIM 요금제 찾기"} {link.affiliate && <BookingAffiliateBadge />} <Icon name="link" />
    </a>
  </section>;
}
