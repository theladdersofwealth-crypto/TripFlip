import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPhoto, titleMatches } from "../src/lib/commonsPhoto";

const page = (title: string, lic: string, mime = "image/jpeg", extra: Record<string, { value?: string }> = {}) => ({ title, imageinfo: [{ thumburl: `https://upload.wikimedia.org/x/${title}`, descriptionurl: "https://commons.wikimedia.org/wiki/" + title, mime, extmetadata: { LicenseShortName: { value: lic }, Artist: { value: "<a href='x'>Kim</a>" }, ...extra } }] });

test("제목에 장소 핵심 단어가 있어야 채택", () => {
  assert.ok(titleMatches("Po Nagar Cham Towers Nha Trang 2019", "Po Nagar Cham Towers"));
  assert.ok(titleMatches("Chùa Long Sơn, Nha Trang", "Long Son Pagoda"));
  assert.ok(!titleMatches("Nha Trang beach sunset", "Long Son Pagoda"));
});

test("라이선스: 상업 이용 가능한 것만, 작가 태그 제거", () => {
  assert.equal(pickPhoto([page("File:Long Son Pagoda.jpg", "CC BY-NC 2.0")], "Long Son Pagoda"), null);
  assert.equal(pickPhoto([page("File:Long Son Pagoda.svg", "CC0", "image/svg+xml")], "Long Son Pagoda"), null);
  const p = pickPhoto([page("File:Beach.jpg", "CC0"), page("File:Long Son Pagoda 1.jpg", "CC BY-SA 4.0")], "Long Son Pagoda");
  assert.equal(p?.license, "CC BY-SA 4.0");
  assert.equal(p?.artist, "Kim");
  assert.ok(pickPhoto([page("File:Long Son Pagoda.jpg", "Public domain")], "Long Son Pagoda"));
});

test("초상권·상표 제한 사진 제외, CC BY인데 작가 없으면 제외, 라이선스 링크 전달", () => {
  const T = "File:Long Son Pagoda.jpg", E = "Long Son Pagoda";
  assert.equal(pickPhoto([page(T, "CC BY-SA 4.0", "image/jpeg", { Restrictions: { value: "personality" } })], E), null);
  assert.equal(pickPhoto([page(T, "CC BY 4.0", "image/jpeg", { Artist: { value: "" } })], E), null);
  assert.equal(pickPhoto([page(T, "CC0", "image/jpeg", { Artist: { value: "" } })], E)?.artist, "미확인");
  assert.equal(pickPhoto([page(T, "CC BY-SA 4.0", "image/jpeg", { LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" } })], E)?.licenseUrl, "https://creativecommons.org/licenses/by-sa/4.0");
});
