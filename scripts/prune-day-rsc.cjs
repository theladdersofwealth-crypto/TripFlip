// Cloudflare Pages는 배포당 파일 20,000개까지만 받는다.
// 일차 페이지(/r/<권역>/day/<n>)는 권역 수 × 30일이라 .html과 .txt(화면 이동용 RSC 조각)를 합치면 한도를 넘는다.
// 일차 페이지의 .txt만 지운다. 없으면 Next가 그 주소를 일반 페이지 이동으로 열어서 화면은 그대로 뜬다.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "out", "r");
let removed = 0;
if (fs.existsSync(root)) {
  for (const region of fs.readdirSync(root)) {
    const dayDir = path.join(root, region, "day");
    if (!fs.existsSync(dayDir)) continue;
    for (const f of fs.readdirSync(dayDir)) {
      if (f.endsWith(".txt")) { fs.unlinkSync(path.join(dayDir, f)); removed++; }
    }
  }
}
let total = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : total++; };
const out = path.join(__dirname, "..", "out");
if (fs.existsSync(out)) walk(out);
console.log(`prune-day-rsc: 일차 .txt ${removed}개 삭제, out 파일 ${total}개 (Pages 한도 20,000)`);
if (total > 20000) { console.error("out 파일이 20,000개를 넘습니다."); process.exit(1); }
