// Xotelo 각 기능이 지금 되는지 한 번 점검한다(수동 실행용). 결과는 data 브랜치 probe/xotelo-<날짜>.json
import { mkdir, writeFile } from "node:fs/promises";
const OUT = process.argv[2] ?? "store/probe";
const keys = ["g293928-d7620255", "g294217-d2031570", "g298566-d302242", "g298085-d2368744", "g469418-d6920092"];
const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const urls = [
  ["list", "https://data.xotelo.com/api/list?location_key=g293928&limit=5&offset=0"],
  ...keys.map((k) => [`rates ${k}`, `https://data.xotelo.com/api/rates?hotel_key=${k}&chk_in=${d(30)}&chk_out=${d(31)}&currency=USD`]),
  ["heatmap", `https://data.xotelo.com/api/heatmap?hotel_key=${keys[0]}&chk_out=${d(31)}`],
];
const out = { checkedAt: new Date().toISOString(), results: [] };
for (const [name, url] of urls) {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    const ok = r.ok && j && !j.error;
    out.results.push({ name, http: r.status, ok, error: j?.error ?? null, sample: t.slice(0, 400) });
    console.log(`${ok ? "✅" : "❌"} ${name}: HTTP ${r.status} ${t.slice(0, 160)}`);
  } catch (e) { out.results.push({ name, ok: false, network: String(e) }); console.log(`❌ ${name}: ${e}`); }
  await new Promise((s) => setTimeout(s, 1500));
}
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/xotelo-${d(0)}.json`, JSON.stringify(out, null, 1));
