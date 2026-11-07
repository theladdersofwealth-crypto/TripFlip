// GPT·제미나이 장소 속성(시간대|체류분|아이) 결과를 합쳐 src/data/placeAttrs.ts 로 만든다.
// 실행: node scripts/merge-place-attrs.cjs  (결과 폴더의 gpt-*.txt, gemini-*.txt 를 모두 읽음)
const fs = require("fs");
const D = "/mnt/project-files/tripflip-data/place-attr/results/";
const SLOT = { 오전: "오전", 아침: "오전", 점심: "오후", 오후: "오후", 저녁: "저녁", 종일: "종일", 아무때나: "아무때나" };
const KID = { 하: 0, 중: 1, 상: 2 };
const load = (pre) => {
  const m = {};
  for (const f of fs.readdirSync(D).filter((f) => f.startsWith(pre)))
    for (const l of fs.readFileSync(D + f, "utf8").split("\n")) {
      const [id, s, min, k] = l.trim().split("|").map((x) => x?.trim());
      if (SLOT[s] && +min > 0 && k in KID) m[id] = { s: SLOT[s], min: +min, k: KID[k] };
    }
  return m;
};
const G = load("gpt"), M = load("gemini");
const out = {};
const stat = { both: 0, one: 0 };
for (const id of new Set([...Object.keys(G), ...Object.keys(M)])) {
  const a = G[id], b = M[id];
  if (!a || !b) { const x = a ?? b; out[id] = [x.s, x.min, x.k]; stat.one++; continue; }
  stat.both++;
  const min = Math.max(30, Math.round((a.min + b.min) / 2 / 30) * 30);
  let s;
  if (a.s === b.s) s = a.s;
  else if (a.s === "종일" || b.s === "종일") s = min >= 240 ? "종일" : (a.s === "종일" ? b.s : a.s);
  else if (a.s === "아무때나") s = b.s;
  else if (b.s === "아무때나") s = a.s;
  else s = a.s; // 오전·오후·저녁이 갈리면 GPT
  out[id] = [s, min, Math.min(a.k, b.k)];
}
const kids = ["하", "중", "상"];
const rows = Object.entries(out).map(([id, [s, m, k]]) => `${JSON.stringify(id)}:[${JSON.stringify(s)},${m},${JSON.stringify(kids[k])}]`);
fs.writeFileSync("src/data/placeAttrs.ts", `// 생성 파일: scripts/merge-place-attrs.cjs. GPT·제미나이 추정(실측 아님). 갈리면 체류=평균, 아이=낮은 쪽, 종일은 평균 4시간 이상일 때만.
export type Slot = "오전" | "오후" | "저녁" | "종일" | "아무때나";
export const PLACE_ATTRS: Record<string, [Slot, number, "상" | "중" | "하"]> = {\n${rows.join(",\n")}\n};\n`);
const c = {}; Object.values(out).forEach(([s]) => (c[s] = (c[s] || 0) + 1));
console.log(Object.keys(out).length, stat, c);
