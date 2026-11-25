// 추천 카드 윗부분 배경(D안, 형님 확정 11/25): 해당 국가 국기를 어둡게 눌러 깔고 영문 지역명을 크게 얹는다.
// 국기는 외부 이미지 없이 단순화한 자체 SVG(세부 문양 생략). 단순화로 다른 나라와 헷갈릴 국기는 넣지 않고,
// 국기가 없으면 기존 그라데이션만 쓴다(지어내지 않음).

type Part = string;
const W = 300, H = 200;
const rect = (x: number, y: number, w: number, h: number, c: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
/** 가로 줄(위→아래). 색 뒤 숫자는 비율 */
function hs(...cs: (string | [string, number])[]): Part {
  const items = cs.map((c) => (Array.isArray(c) ? c : [c, 1] as [string, number]));
  const tot = items.reduce((a, [, n]) => a + n, 0);
  let y = 0;
  return items.map(([c, n]) => { const h = (H * n) / tot; const s = rect(0, y, W, h + 0.5, c); y += h; return s; }).join("");
}
/** 세로 줄(왼→오른) */
function vs(...cs: (string | [string, number])[]): Part {
  const items = cs.map((c) => (Array.isArray(c) ? c : [c, 1] as [string, number]));
  const tot = items.reduce((a, [, n]) => a + n, 0);
  let x = 0;
  return items.map(([c, n]) => { const w = (W * n) / tot; const s = rect(x, 0, w + 0.5, H, c); x += w; return s; }).join("");
}
const circ = (cx: number, cy: number, r: number, c: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`;
const ring = (cx: number, cy: number, r: number, c: string, w: number) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}"/>`;
const poly = (pts: string, c: string) => `<polygon points="${pts}" fill="${c}"/>`;
function star(cx: number, cy: number, R: number, c: string, r = R * 0.4, rot = -90): Part {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) { const a = ((rot + i * 36) * Math.PI) / 180, rr = i % 2 ? r : R; p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); }
  return poly(p.join(" "), c);
}
function sun(cx: number, cy: number, R: number, r: number, n: number, c: string): Part {
  const p: string[] = [];
  for (let i = 0; i < n * 2; i++) { const a = ((-90 + (i * 180) / n) * Math.PI) / 180, rr = i % 2 ? r : R; p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); }
  return poly(p.join(" "), c);
}
/** 북유럽 십자 (bw = 테두리 색·두께) */
function nordic(bg: string, cross: string, border?: string): Part {
  const x = 84, t = 28, b = 8;
  let s = rect(0, 0, W, H, bg);
  if (border) s += rect(x - b, 0, t + 2 * b, H, border) + rect(0, (H - t) / 2 - b, W, t + 2 * b, border);
  return s + rect(x, 0, t, H, cross) + rect(0, (H - t) / 2, W, t, cross);
}
/** 초승달(바탕색 원으로 파냄) */
const crescent = (cx: number, cy: number, r: number, fg: string, bg: string, dx = r * 0.28) => circ(cx, cy, r, fg) + circ(cx + dx, cy, r * 0.8, bg);
/** 영국 유니언잭 (w×h 영역) */
function union(w = W, h = H): Part {
  const sw = h * 0.2, rw = h * 0.067;
  return rect(0, 0, w, h, "#012169") +
    `<path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#fff" stroke-width="${sw}"/>` +
    `<path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#c8102e" stroke-width="${rw}"/>` +
    rect(w / 2 - h / 6, 0, h / 3, h, "#fff") + rect(0, h / 3, w, h / 3, "#fff") +
    rect(w / 2 - h / 10, 0, h / 5, h, "#c8102e") + rect(0, h * 0.4, w, h / 5, "#c8102e");
}
const canton = (inner: Part, w: number, h: number) => `<svg width="${w}" height="${h}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${inner}</svg>`;
function stripes(n: number, a: string, b: string): Part { return hs(...Array.from({ length: n }, (_, i) => (i % 2 ? b : a))); }
const RED = "#d52b1e", WHITE = "#fff";

const FLAGS: Record<string, () => Part> = {
  일본: () => rect(0, 0, W, H, WHITE) + circ(150, 100, 60, "#bc002d"),
  베트남: () => rect(0, 0, W, H, "#da251d") + star(150, 104, 62, "#ffcd00", 24),
  중국: () => rect(0, 0, W, H, "#de2910") + star(50, 50, 30, "#ffde00") + star(100, 20, 10, "#ffde00") + star(120, 40, 10, "#ffde00") + star(120, 70, 10, "#ffde00") + star(100, 90, 10, "#ffde00"),
  대만: () => rect(0, 0, W, H, "#fe0000") + rect(0, 0, 150, 100, "#000095") + sun(75, 50, 34, 19, 12, WHITE) + circ(75, 50, 17, "#000095") + circ(75, 50, 14.5, WHITE),
  홍콩: () => rect(0, 0, W, H, "#de2910") + [0, 1, 2, 3, 4].map((i) => `<path transform="translate(150 100) rotate(${i * 72})" d="M0 0 C-16 -18 -14 -48 6 -58 C0 -44 12 -26 0 0Z" fill="#fff"/>`).join(""),
  마카오: () => rect(0, 0, W, H, "#00785e") + [[-38, -38], [-20, -50], [0, -56], [20, -50], [38, -38]].map(([x, y], i) => star(150 + x, 92 + y, i === 2 ? 9 : 6, "#fbd116")).join("") +
    `<path d="M150 110 C134 96 136 74 150 62 C164 74 166 96 150 110Z M150 110 C126 108 116 92 118 78 C134 82 146 96 150 110Z M150 110 C174 108 184 92 182 78 C166 82 154 96 150 110Z" fill="#fff"/>` +
    [126, 134, 142].map((y, i) => `<line x1="${124 + i * 6}" y1="${y}" x2="${176 - i * 6}" y2="${y}" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`).join(""),
  미국: () => stripes(13, "#b22234", WHITE) + rect(0, 0, 120, 108, "#3c3b6e"),
  푸에르토리코: () => stripes(5, "#ed0000", WHITE) + poly("0,0 173,100 0,200", "#0050f0") + star(55, 100, 26, WHITE),
  태국: () => hs("#a51931", WHITE, ["#2d2a4a", 2], WHITE, "#a51931"),
  필리핀: () => hs("#0038a8", "#ce1126") + poly("0,0 173,100 0,200", WHITE) + sun(55, 100, 24, 12, 8, "#fcd116"),
  싱가포르: () => hs("#ef3340", WHITE) + crescent(52, 50, 30, WHITE, "#ef3340", 12) + [[80, 28], [98, 42], [92, 64], [68, 64], [62, 42]].map(([x, y]) => star(x, y, 6, WHITE)).join(""),
  인도네시아: () => hs("#ce1126", WHITE),
  말레이시아: () => stripes(14, "#cc0001", WHITE) + rect(0, 0, 150, 114, "#010066") + crescent(62, 57, 36, "#fc0", "#010066", 12) + sun(112, 57, 22, 9, 14, "#fc0"),
  스페인: () => hs("#aa151b", ["#f1bf00", 2], "#aa151b"),
  호주: () => rect(0, 0, W, H, "#012169") + canton(union(), 150, 100) + star(75, 150, 22, WHITE) + star(225, 160, 10, WHITE) + star(195, 95, 10, WHITE) + star(225, 40, 10, WHITE) + star(260, 85, 10, WHITE),
  뉴질랜드: () => rect(0, 0, W, H, "#012169") + canton(union(), 150, 100) + star(225, 160, 13, "#c8102e") + star(195, 95, 12, "#c8102e") + star(225, 40, 12, "#c8102e") + star(260, 85, 12, "#c8102e"),
  튀르키예: () => rect(0, 0, W, H, "#e30a17") + crescent(110, 100, 50, WHITE, "#e30a17", 14) + star(170, 100, 22, WHITE, 9, 180),
  오스트리아: () => hs("#ed2939", WHITE, "#ed2939"),
  독일: () => hs("#000", "#dd0000", "#ffce00"),
  몽골: () => vs("#c4272f", "#015197", "#c4272f"),
  캐나다: () => vs([RED, 1], [WHITE, 2], [RED, 1]) + poly("150,40 160,62 176,56 170,90 186,80 194,96 210,98 196,116 200,124 156,120 156,150 144,150 144,120 100,124 104,116 90,98 106,96 114,80 130,90 124,56 140,62", RED),
  캄보디아: () => hs("#032ea1", ["#e00025", 2], "#032ea1"),
  멕시코: () => vs("#006847", WHITE, "#ce1126") + ring(150, 100, 22, "#8c5a2b", 6),
  몰디브: () => rect(0, 0, W, H, "#d21034") + rect(50, 50, 200, 100, "#007e3a") + crescent(150, 100, 32, WHITE, "#007e3a", 12),
  핀란드: () => nordic(WHITE, "#002f6c"),
  스웨덴: () => nordic("#006aa7", "#fecc00"),
  덴마크: () => nordic("#c8102e", WHITE),
  노르웨이: () => nordic("#ba0c2f", "#00205b", WHITE),
  아이슬란드: () => nordic("#02529c", "#dc1e35", WHITE),
  도미니카공화국: () => rect(0, 0, W, H, WHITE) + rect(0, 0, 130, 80, "#002d62") + rect(170, 0, 130, 80, "#ce1126") + rect(0, 120, 130, 80, "#ce1126") + rect(170, 120, 130, 80, "#002d62"),
  모리셔스: () => hs("#ea2839", "#1a206d", "#ffd500", "#00a551"),
  코스타리카: () => hs("#002b7f", WHITE, ["#ce1126", 2], WHITE, "#002b7f"),
  팔라우: () => rect(0, 0, W, H, "#4aadd6") + circ(130, 100, 50, "#ffde00"),
  프랑스: () => vs("#002395", WHITE, "#ed2939"),
  이탈리아: () => vs("#009246", WHITE, "#ce2b37"),
  아일랜드: () => vs("#169b62", WHITE, "#ff883e"),
  루마니아: () => vs("#002b7f", "#fcd116", "#ce1126"),
  벨기에: () => vs("#000", "#fdda24", "#ef3340"),
  페루: () => vs("#d91023", WHITE, "#d91023"),
  몰타: () => vs(WHITE, "#cf142b"),
  영국: () => union(),
  스위스: () => rect(0, 0, W, H, "#d52b1e") + rect(135, 50, 30, 100, WHITE) + rect(100, 85, 100, 30, WHITE),
  조지아: () => rect(0, 0, W, H, WHITE) + rect(135, 0, 30, H, "#ff0000") + rect(0, 85, W, 30, "#ff0000"),
  체코: () => hs(WHITE, "#d7141a") + poly("0,0 150,100 0,200", "#11457e"),
  라오스: () => hs("#ce1126", ["#002868", 2], "#ce1126") + circ(150, 100, 40, WHITE),
  크로아티아: () => hs("#ff0000", WHITE, "#171796") + Array.from({ length: 12 }, (_, i) => rect(132 + (i % 3) * 12, 72 + Math.floor(i / 3) * 12, 12, 12, (i % 3 + Math.floor(i / 3)) % 2 ? WHITE : "#ff0000")).join(""),
  포르투갈: () => vs(["#006600", 2], ["#ff0000", 3]) + ring(120, 100, 32, "#ffcc00", 10),
  그리스: () => stripes(9, "#0d5eaf", WHITE) + rect(0, 0, 111, 111, "#0d5eaf") + rect(44, 0, 22, 111, WHITE) + rect(0, 44, 111, 22, WHITE),
  헝가리: () => hs("#ce2939", WHITE, "#477050"),
  네덜란드: () => hs("#ae1c28", WHITE, "#21468b"),
  불가리아: () => hs(WHITE, "#00966e", "#d62612"),
  세르비아: () => hs("#c6363c", "#0c4076", WHITE),
  에스토니아: () => hs("#0072ce", "#000", WHITE),
  폴란드: () => hs(WHITE, "#dc143c"),
  아르메니아: () => hs("#d90012", "#0033a0", "#f2a800"),
  아랍에미리트: () => hs("#00732f", WHITE, "#000") + rect(0, 0, 75, H, "#ff0000"),
  요르단: () => hs("#000", WHITE, "#007a3d") + poly("0,0 150,100 0,200", "#ce1126") + star(50, 100, 12, WHITE),
  이집트: () => hs("#ce1126", WHITE, "#000") + circ(150, 100, 16, "#c09300"),
  우즈베키스탄: () => hs("#0099b5", WHITE, "#1eb53a") + rect(0, 64, W, 4, "#ce1126") + rect(0, 132, W, 4, "#ce1126") + crescent(42, 32, 20, WHITE, "#0099b5", 8),
  카자흐스탄: () => rect(0, 0, W, H, "#00afca") + circ(150, 90, 34, "#fec50c"),
  키르기스스탄: () => rect(0, 0, W, H, "#e8112d") + sun(150, 100, 56, 36, 20, "#ffef00") + circ(150, 100, 30, "#ffef00"),
  북마케도니아: () => rect(0, 0, W, H, "#d20000") + `<path d="M0 0L${W} ${H}M${W} 0L0 ${H}M150 0V${H}M0 100H${W}" stroke="#ffe600" stroke-width="18"/>` + circ(150, 100, 32, "#d20000") + circ(150, 100, 26, "#ffe600"),
  볼리비아: () => hs("#d52b1e", "#f9e300", "#007934"),
  아르헨티나: () => hs("#74acdf", WHITE, "#74acdf") + circ(150, 100, 20, "#f6b40e"),
  콜롬비아: () => hs(["#fcd116", 2], "#003893", "#ce1126"),
  에콰도르: () => hs(["#ffdd00", 2], "#034ea2", "#ed1c24") + ring(150, 80, 26, "#8c5a2b", 6),
  칠레: () => hs(WHITE, "#d52b1e") + rect(0, 0, 100, 100, "#0039a6") + star(50, 50, 22, WHITE),
  쿠바: () => stripes(5, "#002a8f", WHITE) + poly("0,0 173,100 0,200", "#cf142b") + star(55, 100, 24, WHITE),
  브라질: () => rect(0, 0, W, H, "#009c3b") + poly("150,20 280,100 150,180 20,100", "#ffdf00") + circ(150, 100, 44, "#002776"),
  모로코: () => rect(0, 0, W, H, "#c1272d") + `<polygon points="${[0, 1, 2, 3, 4].map((i) => { const a = ((-90 + i * 144) * Math.PI) / 180; return `${(150 + 50 * Math.cos(a)).toFixed(1)},${(104 + 50 * Math.sin(a)).toFixed(1)}`; }).join(" ")}" fill="none" stroke="#006233" stroke-width="8"/>`,
  인도: () => hs("#ff9933", WHITE, "#138808") + ring(150, 100, 22, "#000080", 4),
  마다가스카르: () => rect(0, 0, 100, H, WHITE) + rect(100, 0, 200, 100, "#fc3d32") + rect(100, 100, 200, 100, "#007e3a"),
  카타르: () => vs([WHITE, 1], ["#8a1538", 2.5]),
};

/** 국가 → 단순화 SVG 국기(내부 요소). 모르면 null */
export function flagSvg(country: string): string | null {
  const f = FLAGS[country];
  const s = f ? f() : "";
  return s || null;
}

/** 카드 윗배경. 국기가 없으면 fallback 그라데이션, 영문명이 없으면 영문 생략 */
export function FlagBg({ country, en, fallback }: { country: string; en?: string; fallback: string }) {
  const svg = flagSvg(country);
  const name = (en ?? "").trim().toUpperCase();
  return <div className={`rank-bg${svg ? " has-flag" : ""}`} aria-hidden style={svg ? undefined : { background: fallback }}>
    {svg && <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" dangerouslySetInnerHTML={{ __html: svg }} />}
    {name && <span className="rank-en" style={{ fontSize: `min(${Math.min(30, Math.round(150 / name.length))}cqw, 120px)` }}>{name}</span>}
  </div>;
}
