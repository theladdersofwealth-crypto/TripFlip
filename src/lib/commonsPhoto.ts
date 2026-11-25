// 위키미디어 공용 사진을 폰(브라우저)에서 실시간 조회 — 나트랑앱 NTCommons와 같은 방식.
// 저장·호스팅 비용 없음(썸네일은 upload.wikimedia.org 그대로). 결과는 이 기기에 7일 캐시.
// 상업 이용 가능한 라이선스(CC0·퍼블릭 도메인·CC BY·CC BY-SA)만 쓰고, 작가·라이선스를 화면에 표시한다.
// 엉뚱한 사진을 막으려고 파일 제목에 장소 영문명 핵심 단어가 들어간 것만 채택한다.

export interface CommonsPhoto { src: string; artist: string; license: string; page: string; licenseUrl?: string }

const KEY = "tripflip.commons.v2"; // v2: 초상권·상표 표시 사진 제외 규칙 추가 → 예전 캐시 다시 판정
const TTL = 7 * 24 * 3600 * 1000;
const OK_LICENSE = /^(cc0|public domain|pd\b|pd-|cc by(-sa)? ?\d)/i;
const GENERIC = new Set(["the", "and", "of", "de", "la", "le", "temple", "beach", "park", "market", "street", "museum", "island", "bay", "night", "old", "town", "city", "tower", "palace", "church", "pagoda", "bridge", "garden", "gardens", "mountain", "mount", "lake", "river", "falls", "waterfall", "national", "center", "centre", "square", "hill", "shrine", "station", "area", "village", "cave", "tour", "great", "new", "san", "santa", "saint", "st"]);

type Cache = Record<string, { t: number; v: CommonsPhoto | null }>;
let mem: Cache | null = null;
const inflight = new Map<string, Promise<CommonsPhoto | null>>();

function load(): Cache {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) || "{}") as Cache; } catch { mem = {}; }
  return mem!;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(mem ?? {})); } catch { /* 저장 못 해도 화면은 정상 */ }
}

export function cachedCommons(id: string): CommonsPhoto | null | undefined {
  const c = load()[id];
  return c && Date.now() - c.t < TTL ? c.v : undefined;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** 파일 제목이 장소 이름과 맞는지: 핵심 단어(일반 명사 제외) 모두 포함. 핵심 단어가 없으면 이름 전체 포함. */
export function titleMatches(title: string, en: string): boolean {
  const t = ` ${norm(title)} `;
  const words = norm(en).split(" ").filter((w) => w.length >= 3 && !GENERIC.has(w));
  if (!words.length) return t.includes(` ${norm(en)} `);
  return words.every((w) => t.includes(` ${w} `) || t.includes(` ${w}s `));
}

interface Page { title: string; imageinfo?: { thumburl?: string; descriptionurl?: string; mime?: string; extmetadata?: Record<string, { value?: string }> }[] }

export function pickPhoto(pages: Page[], en: string): CommonsPhoto | null {
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    const m = ii?.extmetadata ?? {};
    const lic = strip(m.LicenseShortName?.value);
    if (!ii?.thumburl || !/^image\/(jpeg|png|webp)$/.test(ii.mime ?? "")) continue;
    if (!OK_LICENSE.test(lic)) continue;
    if (!titleMatches(p.title.replace(/^File:/, "").replace(/\.\w+$/, ""), en)) continue;
    // 초상권(personality)·상표(trademarked) 등 사용 제한 표시가 붙은 사진은 쓰지 않는다
    if (strip(m.Restrictions?.value)) continue;
    // CC BY 계열은 작가 표시가 필수 → 작가를 모르면 쓰지 않는다(CC0·퍼블릭 도메인은 "미확인" 허용)
    const artist = strip(m.Artist?.value).slice(0, 60);
    if (!artist && /^cc by/i.test(lic)) continue;
    const licUrl = strip(m.LicenseUrl?.value);
    return { src: ii.thumburl, artist: artist || "미확인", license: lic, page: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`, ...(/^https?:\/\//.test(licUrl) ? { licenseUrl: licUrl } : {}) };
  }
  return null;
}

export function commonsPhoto(id: string, en: string, area: string): Promise<CommonsPhoto | null> {
  const hit = cachedCommons(id);
  if (hit !== undefined) return Promise.resolve(hit);
  const running = inflight.get(id);
  if (running) return running;
  const q = new URLSearchParams({
    action: "query", format: "json", origin: "*", generator: "search", gsrnamespace: "6", gsrlimit: "8",
    gsrsearch: `"${en}" ${area} filetype:bitmap`, prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "240",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Restrictions",
  });
  const job = fetch(`https://commons.wikimedia.org/w/api.php?${q}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { query?: { pages?: Record<string, Page & { index?: number }> } }) => {
      const pages = Object.values(j.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const v = pickPhoto(pages, en);
      load()[id] = { t: Date.now(), v };
      save();
      return v;
    })
    .catch(() => null) // 네트워크 오류는 캐시하지 않음(다음에 다시 시도)
    .finally(() => inflight.delete(id));
  inflight.set(id, job);
  return job;
}
