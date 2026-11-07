// 위키 조회수로 AI 등급을 한 단계 올리는 목록을 만든다. 정의서 V3 §2-3 (2026-11-05 형님 확정).
// 규칙: 조회수(한국어+영어, 최근 12개월)가 조회수 있는 장소 중 상위 5%면 AI 등급 한 단계 올림. 내림은 없음. S는 그대로.
// 입력: data 브랜치 wiki-pageviews/YYYY-MM.json (git show origin/data:wiki-pageviews/2026-10.json > /tmp/wp.json)
// 사용: node scripts/build-wiki-boost.mjs /tmp/wp.json
import { readFile, writeFile } from "node:fs/promises";

const TOP = 0.05;
const UP = { A: "S", B: "A", C: "B", D: "C" };
const src = JSON.parse(await readFile(process.argv[2], "utf8"));
const s = await readFile(new URL("../src/data/worldV1.ts", import.meta.url), "utf8");
const a = s.indexOf("[", s.indexOf("const WORLD_PLACES_RAW"));
let depth = 0, inStr = false, j = a;
for (; j < s.length; j++) {
  const c = s[j];
  if (c === '"' && s[j - 1] !== "\\") inStr = !inStr;
  if (inStr) continue;
  if (c === "[") depth++;
  else if (c === "]" && --depth === 0) break;
}
const places = JSON.parse(s.slice(a, j + 1));
const rows = places
  .map((p) => { const r = src.places[p.id]; return { id: p.id, grade: p.grade, views: (r?.ko?.views ?? 0) + (r?.en?.views ?? 0) }; })
  .filter((r) => r.views > 0)
  .sort((x, y) => y.views - x.views);
const cut = Math.ceil(rows.length * TOP);
const boost = Object.fromEntries(rows.slice(0, cut).filter((r) => UP[r.grade]).map((r) => [r.id, UP[r.grade]]));

await writeFile(new URL("../src/data/wikiBoost.ts", import.meta.url), `// scripts/build-wiki-boost.mjs 결과물. 손으로 고치지 말 것.
// 위키백과 조회수(${src.period.start}~${src.period.end}, 한국어+영어, 사람 조회) 상위 5%(${cut}/${rows.length}곳)면 AI 등급 한 단계 올림. 내림 없음.
// 출처: Wikidata sitelinks(CC0) + Wikimedia Pageviews API. 등급 자체는 여전히 추정값이다.
import type { Grade } from "@/data/regionsV1";

export const WIKI_BOOST: Record<string, Grade> = ${JSON.stringify(boost, null, 0).replaceAll(',"', ',\n  "')};

/** 올린 장소에는 wikiBoost 표시를 붙인다(화면에 "위키 조회수 상위" 배지). */
export function applyWikiBoost<T extends { id: string; grade: Grade | null }>(p: T): T & { wikiBoost?: true } {
  const g = WIKI_BOOST[p.id];
  return g && p.grade ? { ...p, grade: g, wikiBoost: true } : p;
}
`);
console.log({ withViews: rows.length, top: cut, boosted: Object.keys(boost).length });
