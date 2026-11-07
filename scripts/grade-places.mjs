// 장소 등급(S~D)을 네이버 블로그 후기로 산정한다 (정의서 V1 §3-1).
// 네이버 검색 API는 본문이 아니라 제목·요약만 주므로 요약 문장으로 판정한다.
// 실행: NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node scripts/grade-places.mjs [저장 폴더] [권역코드,...]
import { mkdir, readFile, writeFile } from "node:fs/promises";

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;
if (!ID || !SECRET) {
  console.error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 없습니다");
  process.exit(1);
}
const OUT_DIR = process.argv[2] ?? "data/grades";
const ONLY = process.argv[3]?.split(",");

const MIN_VALID = 30;
const PAGES = 10; // 100건 × 10 = 최대 1,000건
const GRADES = ["S", "A", "B", "C", "D"];

// 후기 1개 판정표 (§3-1). 여러 표현이 함께 있으면 가장 낮은 등급.
const RULES = {
  S: ["다시 오고 싶", "이것만 보러", "이거 하나 때문에", "이것 때문에", "인생 여행지"],
  A: ["꼭 가", "무조건 가", "강추", "강력 추천", "또 가고 싶", "다시 가고 싶", "필수 코스", "필수코스"],
  B: ["가볼 만", "가볼만", "나쁘지 않", "괜찮았", "무난"],
  C: ["굳이", "비슷한 곳", "한국에도", "기대 이하", "그저 그"],
  D: ["비추", "다시는 안", "최악", "돈 아까", "실망"],
};
const SPONSORED = ["협찬", "체험단", "원고료", "제공받", "소정의", "광고"];

const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;|&gt;/g, "");
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function judge(text) {
  let grade = null;
  for (const g of GRADES) if (RULES[g].some((k) => text.includes(k))) grade = g; // 뒤(낮은 등급)가 덮어쓴다
  return grade;
}

function median(counts, n) {
  let acc = 0;
  for (const g of GRADES) {
    acc += counts[g];
    if (acc > n / 2) return g;
  }
  return null;
}

async function search(query, start) {
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=100&start=${start}&sort=sim`;
  const res = await fetch(url, { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET } });
  if (!res.ok) return { error: `${res.status} ${await res.text()}`.slice(0, 200), items: [] };
  return { items: (await res.json()).items ?? [] };
}

const places = JSON.parse(await readFile(new URL("./places-v1.json", import.meta.url)));
const since = new Date();
since.setFullYear(since.getFullYear() - 2);
const sinceStr = since.toISOString().slice(0, 10).replaceAll("-", "");

const out = { gradedAt: new Date().toISOString(), source: "네이버 검색 API 블로그 (제목·요약)", minValid: MIN_VALID, places: [] };
for (const p of places.filter((x) => !ONLY || ONLY.includes(x.region))) {
  const name = p.name.replace(/\s*\(.*\)/, "");
  const key = name.split(/[\s·]/)[0]; // 관련 글 확인용 핵심 단어
  const query = `${p.regionName} ${name} 후기`;
  const counts = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  let seen = 0, old = 0, sponsored = 0, offTopic = 0, noJudge = 0, error;
  const samples = [];
  for (let i = 0; i < PAGES; i++) {
    const r = await search(query, i * 100 + 1);
    if (r.error) { error = r.error; break; }
    for (const it of r.items) {
      seen++;
      const text = `${strip(it.title)} ${strip(it.description)}`;
      if (it.postdate < sinceStr) { old++; continue; }
      if (SPONSORED.some((k) => text.includes(k))) { sponsored++; continue; }
      if (!text.includes(key)) { offTopic++; continue; }
      const g = judge(text);
      if (!g) { noJudge++; continue; }
      counts[g]++;
      if (samples.length < 6) samples.push({ g, text: text.slice(0, 120), date: it.postdate });
    }
    if (r.items.length < 100) break;
    await sleep(150);
  }
  const valid = GRADES.reduce((s, g) => s + counts[g], 0);
  const grade = valid >= MIN_VALID ? median(counts, valid) : null;
  out.places.push({ id: p.id, region: p.region, name: p.name, query, tempGrade: p.tempGrade, grade: grade ?? "미확인", valid, counts, seen, excluded: { old, sponsored, offTopic, noJudge }, ...(error ? { error } : {}), samples });
  console.log(`${p.name}: ${grade ?? "미확인"} (유효 ${valid}/${seen}, 임시 ${p.tempGrade})`);
}

await mkdir(OUT_DIR, { recursive: true });
const file = `${OUT_DIR}/${new Date().toISOString().slice(0, 10)}.json`;
await writeFile(file, JSON.stringify(out, null, 1));
console.log(`저장: ${file}`);
