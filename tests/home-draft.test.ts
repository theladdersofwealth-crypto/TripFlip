import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_QUERY, loadHomeDraft, loadQuery, saveHomeDraft, saveQuery } from "../src/lib/flow";

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } });
});

test("아직 추천하지 않은 홈 조건과 입력 단계는 기존 추천과 별개로 복원한다", () => {
  const draft = { ...DEFAULT_QUERY, startDate: "2027-04-03", endDate: "2027-04-17", stay: "하이엔드" as const, roomCount: 2 };
  const progress = { open: 2, question: 1, done: [true, true, false], choice: null };
  assert.equal(loadHomeDraft().hasSearch, false);
  saveHomeDraft(draft, progress);
  assert.deepEqual(loadHomeDraft(), { q: draft, progress, hasSearch: false });
  assert.deepEqual(loadQuery(), DEFAULT_QUERY);
  saveQuery(draft);
  saveHomeDraft(draft, progress);
  assert.deepEqual(loadHomeDraft(), { q: draft, progress, hasSearch: true });
});

test("다른 화면에서 명시적으로 적용한 새 조건에 과거 홈 초안을 덮어쓰지 않는다", () => {
  saveQuery(DEFAULT_QUERY);
  saveHomeDraft({ ...DEFAULT_QUERY, roomCount: 2 }, { open: 2, question: 1, done: [true, true, false], choice: null });
  const applied = { ...DEFAULT_QUERY, startDate: "2027-03-05", endDate: "2027-03-09" };
  saveQuery(applied);
  assert.deepEqual(loadHomeDraft(), { q: applied, progress: null, hasSearch: true });
});


test("지역 선택은 검색 조건·홈 초안에 보존되고 이전 조건은 전체를 의미한다", () => {
  const legacy = { ...DEFAULT_QUERY };
  assert.equal(loadQuery().preferredAreas, undefined);
  saveQuery(legacy);
  assert.equal(loadQuery().preferredAreas, undefined);
  const next = { ...legacy, preferredAreas: ["central-eastern-europe", "southeast-asia"] as const };
  const selected = { ...next, preferredAreas: [...next.preferredAreas] };
  const progress = { open: 0, question: 2, done: [false, false, false], choice: null };
  saveHomeDraft(selected, progress);
  assert.deepEqual(loadHomeDraft().q.preferredAreas, selected.preferredAreas);
  assert.equal(loadQuery().preferredAreas, undefined);
  saveQuery(selected);
  assert.deepEqual(loadQuery().preferredAreas, selected.preferredAreas);
});
