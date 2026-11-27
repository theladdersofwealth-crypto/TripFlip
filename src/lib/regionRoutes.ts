// Only recommendation results opt into opening the booking tab.
export function regionBookingHref(regionId: string): string {
  return `/r/${encodeURIComponent(regionId)}?tab=${encodeURIComponent("예약")}`;
}
