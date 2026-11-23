// 숙소 키 → 영문 이름 표. 앱이 /summary(숙소 키별 평균가)에 이름을 붙일 때 쓴다.
// 원본: workers/collector/src/hotels.json(고정 목록) + 수집 서버 KV hotels-ext(11/11 이후 찾은 목록)
// 실행: node scripts/build-hotel-names.mjs
import { readFile, writeFile } from "node:fs/promises";
const base = JSON.parse(await readFile(new URL("../workers/collector/src/hotels.json", import.meta.url), "utf8"));
const ext = await fetch("https://tripflip-collector.ohysky0127.workers.dev/get?key=hotels-ext", { headers: { "x-read-key": process.env.READ_KEY ?? "" } }).then((r) => r.json()); // READ_KEY: 수집 서버 조회 키
const names = {};
for (const src of [base.regions, ext.regions]) for (const reg of Object.values(src)) for (const [key, name] of reg.hotels) names[key] ??= name;
const keys = Object.keys(names).sort();
await writeFile(new URL("../src/data/hotelNames.ts", import.meta.url),
  `// 생성 파일: scripts/build-hotel-names.mjs 로 만든다. 손으로 고치지 말 것. ${new Date().toISOString().slice(0, 10)} 기준 ${keys.length}곳.\n` +
  `// 트립어드바이저 숙소 키 → 영문 이름 (Xotelo 수집 목록)\nexport const HOTEL_NAMES: Record<string, string> = {\n${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(names[k])},`).join("\n")}\n};\n`);
console.log(keys.length);
