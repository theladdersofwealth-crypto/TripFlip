import { CONCEPTS, type Concept } from "@/data/regionsV1";
import type { RegionQuery } from "@/services/regionScore";

/** Older searches can have several subthemes. The new picker only exposes the first. */
export function resultThemes(q: RegionQuery) {
  const main = q.interests?.[0] ?? q.main;
  const sub = (q.interests?.length ? q.interests.slice(1) : q.subs).find((c) => c !== main && CONCEPTS.includes(c)) ?? null;
  return { main, sub };
}

export function withResultThemes(q: RegionQuery, main: Concept, sub: Concept | null): RegionQuery {
  const subs = sub && sub !== main && CONCEPTS.includes(sub) ? [sub] : [];
  return { ...q, main, subs, interests: [main, ...subs] };
}
