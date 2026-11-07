// 장소 확장: 제미나이·GPT 결과(place-expand/results/*.txt)를 비교해 worldV1에 합친다. 둘 다 고른 곳 우선, 등급이 갈리면 낮은 쪽, 한쪽만 고른 C·D는 제외.
const fs = require("fs");
const D = "/mnt/project-files/tripflip-data/place-expand/results/";
const S = "/tmp/claude-0/-home-claude-tripflip/dc356b0a-1aa1-5c86-95b6-209aa82591b9/scratchpad";
const ts = fs.readFileSync("src/data/worldV1.ts", "utf8");
const PH = "const WORLD_PLACES_RAW = ";
const ps = ts.indexOf(PH), pe = ts.indexOf("];", ps) + 2;
const P = JSON.parse(ts.slice(ps + PH.length, pe - 1));
const RH = "export const WORLD_REGIONS: WorldRegion[] = ";
const rs = ts.indexOf(RH);
const R = JSON.parse(ts.slice(rs + RH.length, ts.indexOf("];", rs) + 1));
const cand = require(S + "/cand-full.json");
const coord = {};
for (const r of cand.regions) for (const it of r.items || []) coord[it[0]] = [it[3], it[4]];
const GR = "SABCD";
const CONCEPTS = new Set(["관광", "휴양", "액티비티", "쇼핑", "미식"]);
const TAGS = new Set(["역사·문화","자연경관","명소","해변·섬","야경·야시장","테마파크","체험","사진촬영","핫플","시장","쇼핑몰·아웃렛","온천","해양","트레킹·하이킹","스키","골프","로컬푸드","카페·디저트","마사지·스파"]);
// §2-1 기준으로 Claude가 뺀 것: 관람 투어가 없는 경기장, 체인 매장, 오를 수 없는 산봉우리(전망대·마을이 장소)
const DROP = /Crypto\.com Arena|Lumen Field|T-Mobile Park|Kia Center|Camping World|Bell Centre|Circuit Gilles|Goodison|Hill Dickinson|McDonald|Rogers Centre|Roy Thomson|^Dom$|Weisshorn|Lyskamm|Dent Blanche|Allalinhorn|Täschhorn|Dufourspitze|Aletschhorn|Mönch|^Eiger$|^Triglav$|Monte Rosa|Julian Alps|Brenner Pass|Prenj|Čabulja|Velež|Grosser Mythen|Stol \/|Taunus|Olkkajärvi|Vikajärvi|Norvajärvi|Saarenpudas|Kotisaari|Vancouver Public Library|Eurotower|Transamerica|Seattle Central Library|Florida Mall|San Juan Shopping|Le Relais|Mont Bélair|Stadacona|Fort Charlesbourg|Interstate/i;
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^the/, "");
function load(f, src) {
  return fs.readFileSync(D + f, "utf8").trim().split("\n").map((l) => {
    const [region, q, ko, en, g, c, t] = l.split("|").map((x) => x.trim());
    return { region, qid: q.startsWith("Q") ? q : null, ko, en, grade: GR.includes(g) ? g : "C", concepts: (c || "").split(",").map((x) => x.trim()).filter((x) => CONCEPTS.has(x)), tag: TAGS.has(t) ? t : t === "베이커리·디저트" ? "카페·디저트" : "명소", src };
  });
}
const all = [...load(process.argv[2] ?? "gemini-all.txt", "G"), ...load(process.argv[3] ?? "gpt-all.txt", "P")].filter((x) => !DROP.test(x.en));
const groups = {};
for (const x of all) {
  const k = x.region + "|" + (x.qid || norm(x.en).slice(0, 14));
  (groups[k] ??= []).push(x);
}
// QID가 있는 쪽과 NEW 쪽이 같은 장소면 영문명으로 한 번 더 묶는다
const byName = {};
for (const [k, g] of Object.entries(groups)) {
  const nk = g[0].region + "|" + norm(g[0].en).slice(0, 10);
  if (byName[nk]) { byName[nk].push(...g); delete groups[k]; } else byName[nk] = groups[k];
}
const have = {};
for (const p of P) (have[p.region] ??= new Set()).add(norm(p.en).slice(0, 10)), p.qid && have[p.region].add(p.qid);
const km = (a, b, c, d) => { const t = Math.PI / 180; const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(x)); };
const regById = Object.fromEntries(R.map((r) => [r.id, r]));
const TARGET = +(process.env.TARGET ?? 22);
const out = [];
const stats = { both: 0, single: 0, dup: 0 };
const perRegion = {};
for (const g of Object.values(groups)) (perRegion[g[0].region] ??= []).push(g);
for (const [rid, gs] of Object.entries(perRegion)) {
  const reg = regById[rid];
  const fresh = gs.filter((g) => !g.some((x) => have[rid]?.has(x.qid) || have[rid]?.has(norm(x.en).slice(0, 10))));
  stats.dup += gs.length - fresh.length;
  const scored = fresh.map((g) => {
    const srcs = new Set(g.map((x) => x.src));
    const grade = g.map((x) => x.grade).sort((a, b) => GR.indexOf(b) - GR.indexOf(a))[0]; // 갈리면 낮은 쪽
    const base = g.find((x) => x.src === "G") || g[0];
    return { g, both: srcs.size === 2, grade, base, concepts: [...new Set(g.flatMap((x) => x.concepts))] };
  }).sort((a, b) => Number(b.both) - Number(a.both) || GR.indexOf(a.grade) - GR.indexOf(b.grade));
  const room = Math.max(0, TARGET - P.filter((p) => p.region === rid).length);
  let n = 0;
  for (const s of scored) {
    if (n >= room) break;
    if (!s.both && GR.indexOf(s.grade) >= 3) continue; // 한쪽만 고른 C·D는 뺀다
    const qid = s.g.find((x) => x.qid)?.qid;
    const c = qid && coord[qid];
    let travel = "미확인", penalty = 0;
    if (c && reg) {
      const d = km(reg.lat, reg.lon, c[0], c[1]);
      if (d > 280) continue;
      [travel, penalty] = d <= 100 ? ["2시간 이하(추정)", 0] : d <= 160 ? ["2~3시간(추정)", 0.5] : ["3~5시간(추정)", 1];
    }
    n++;
    s.both ? stats.both++ : stats.single++;
    out.push({ id: `${rid}-x${P.filter((p) => p.region === rid).length + n}`, region: rid, name: s.base.ko, en: s.base.en, concepts: s.concepts.length ? s.concepts : ["관광"], tags: [s.base.tag], travel, penalty, grade: s.grade, ...(qid ? { qid } : {}), ...(c ? { lat: c[0], lon: c[1] } : {}) });
  }
}
fs.writeFileSync("src/data/worldV1.ts", ts.slice(0, ps) + PH + "[\n" + [...P, ...out].map((x) => JSON.stringify(x)).join(",\n") + "\n];" + ts.slice(pe));
const cnt = {};
for (const p of [...P, ...out]) cnt[p.region] = (cnt[p.region] || 0) + 1;
const ids = Object.keys(perRegion);
console.log("added", out.length, stats, "min/avg in 63:", Math.min(...ids.map((i) => cnt[i])), (ids.reduce((s, i) => s + cnt[i], 0) / ids.length).toFixed(1));
console.log(Object.entries(out.reduce((a, p) => ((a[p.grade] = (a[p.grade] || 0) + 1), a), {})));
