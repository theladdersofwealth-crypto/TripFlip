// Public tracking identifier supplied by TripFlip's owner. This is not an API key.
export const ESIMOA_REF = "p_8elyec1x";

// Country URLs published by the vendor (home links and public country listings).
// An unmapped region gets the general finder, never another territory's list.
const COUNTRY_PATH = new Map<string, string>([
  ["일본", "jp"], ["베트남", "vn"], ["태국", "th"], ["대만", "tw"], ["중국", "cn"],
  ["필리핀", "ph"], ["미국", "us"], ["괌(미국령)", "gu"], ["홍콩", "hk"], ["싱가포르", "sg"],
  ["말레이시아", "my"], ["마카오", "mo"], ["인도네시아", "id"], ["프랑스", "fr"], ["호주", "au"],
]);

export function esimoaPlansLink(country: string, referral = ESIMOA_REF) {
  const code = COUNTRY_PATH.get(country.trim());
  const url = new URL(code ? `/ko/plans/${code}` : "/ko/plans", "https://www.esimoa.com");
  const affiliate = /^p_[a-z0-9]{8}$/i.test(referral);
  if (affiliate) url.searchParams.set("ref", referral);
  return { href: url.href, filtered: Boolean(code), affiliate };
}
