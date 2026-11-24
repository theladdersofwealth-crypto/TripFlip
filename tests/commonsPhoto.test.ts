import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPhoto, titleMatches } from "../src/lib/commonsPhoto";

const page = (title: string, lic: string, mime = "image/jpeg") => ({ title, imageinfo: [{ thumburl: `https://upload.wikimedia.org/x/${title}`, descriptionurl: "https://commons.wikimedia.org/wiki/" + title, mime, extmetadata: { LicenseShortName: { value: lic }, Artist: { value: "<a href='x'>Kim</a>" } } }] });

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
