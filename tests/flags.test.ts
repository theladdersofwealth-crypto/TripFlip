import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { ALL_REGIONS } from "../src/services/regionScore";
import { FLAG_CODES, flagSrc } from "../src/components/FlagBg";

const FLAG_DIR = new URL("../public/flags/", import.meta.url);

test("358개 권역 전부 국가·지역 깃발이 연결된다(97개 국가·지역)", () => {
  assert.equal(ALL_REGIONS.length, 358);
  const countries = new Set(ALL_REGIONS.map((r) => r.country));
  assert.equal(countries.size, 97);
  const missing = ALL_REGIONS.filter((r) => !flagSrc(r.country)).map((r) => `${r.id}(${r.country})`);
  assert.deepEqual(missing, []);
  // 매핑표에 앱에 없는 국가가 남지 않게(오타 방지)
  assert.deepEqual(Object.keys(FLAG_CODES).filter((c) => !countries.has(c)), []);
});

test("깃발 코드는 ISO 3166-1 alpha-2 소문자이고 국가마다 다르다", () => {
  const codes = Object.values(FLAG_CODES);
  for (const c of codes) assert.match(c, /^[a-z]{2}$/);
  assert.equal(new Set(codes).size, codes.length);
});

test("깃발 파일이 모두 있고, 쓰지 않는 파일은 없으며, viewBox가 있는 SVG다", () => {
  const files = readdirSync(FLAG_DIR).filter((f) => f.endsWith(".svg")).sort();
  assert.deepEqual(files, Object.values(FLAG_CODES).map((c) => `${c}.svg`).sort());
  for (const f of files) {
    const svg = readFileSync(new URL(f, FLAG_DIR), "utf8");
    assert.match(svg, /<svg[^>]*\sviewBox="[\d.\s-]+"/, f);
    assert.doesNotMatch(svg, /<script|\son\w+=|href="(?!#)[^"]+"/i, f);
  }
});

test("간소화 국기가 아닌 원본: 스페인 국장·미국 별·몽골 소욤보·캄보디아 앙코르와트가 들어 있다", () => {
  const size = (c: string) => readFileSync(new URL(`${c}.svg`, FLAG_DIR)).length;
  // 단순 가로줄 국기는 수백 바이트. 문양이 있으면 훨씬 크다.
  assert.ok(size("es") > 20_000, "스페인 국장");
  assert.ok(size("kh") > 5_000, "캄보디아 앙코르와트");
  assert.ok(existsSync(new URL("mn.svg", FLAG_DIR)));
  assert.match(readFileSync(new URL("us.svg", FLAG_DIR), "utf8"), /<use|<path/);
  assert.equal(flagSrc("스페인"), "/flags/es.svg");
  assert.equal(flagSrc("괌(미국령)"), "/flags/gu.svg");
  assert.equal(flagSrc("없는나라"), null);
});
