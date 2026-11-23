// 숙소 한글 표기표(src/data/hotelKo.ts)를 만든다. 원본: data/hotel-ko/hotel-ko.tsv (영문<TAB>한글, 한 줄에 한 곳)
// 숙소 키는 src/data/hotelNames.ts(수집 목록)에서 이름으로 찾는다. 새 숙소는 tsv에 줄을 더하고 다시 실행.
// 실행: node --import tsx scripts/build-hotel-ko.mjs
import { readFile, writeFile } from "node:fs/promises";
import { HOTEL_NAMES } from "../src/data/hotelNames.ts";
const keyOf = new Map(Object.entries(HOTEL_NAMES).map(([k, n]) => [n, k]));
const rows = (await readFile(new URL("../data/hotel-ko/hotel-ko.tsv", import.meta.url), "utf8")).split("\n").filter(Boolean).map((l) => l.split("\t"));
const d = {};
for (const [en, ko] of rows) if (en && ko) d[en] ??= [ko, keyOf.get(en) ?? ""];
const names = Object.keys(d).sort();
await writeFile(new URL("../src/data/hotelKo.ts", import.meta.url),
  `// 생성 파일: scripts/build-hotel-ko.mjs 로 만든다(원본 data/hotel-ko/hotel-ko.tsv). 손으로 고치지 말 것. ${names.length}곳.\n` +
  `// 한글 표기는 영문 이름을 읽는 대로 옮긴 것(공식 한글명과 다를 수 있음). 키는 트립어드바이저 숙소 키(수집 목록에서 이름으로 맞춤, 없으면 빈 값).\n` +
  `// 목록에 없는 숙소는 영문 이름 그대로 보여 준다.\nexport const HOTEL_KO: Record<string, [ko: string, taKey: string]> = {\n${names.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(d[n])},`).join("\n")}\n};\n`);
console.log(names.length);
