"use client";
import { CONCEPTS } from "@/data/regionsV1";
import type { Concept } from "@/data/regionsV1";
import type { TravelMember } from "@/lib/travelParty";

const RELATIONS: { value: TravelMember["relationship"]; label: string }[] = [
  { value: "self", label: "본인" }, { value: "spouse", label: "배우자" },
  { value: "partner", label: "연인" }, { value: "friend", label: "친구" },
  { value: "child", label: "자녀" }, { value: "parent", label: "부모님" },
  { value: "parentInLaw", label: "배우자 부모님" }, { value: "other", label: "기타 일행" },
];
const labelOf = (m: TravelMember) => m.name || RELATIONS.find((r) => r.value === m.relationship)?.label || "일행";

export function PartyEditor({ members, onChange }: { members: TravelMember[]; onChange: (members: TravelMember[]) => void }) {
  const update = (id: string, change: Partial<TravelMember>) => onChange(members.map((m) => m.id === id ? { ...m, ...change } : m));
  const ageChange = (value: string) => value === "" ? null : Math.min(120, Math.max(0, Math.floor(Number(value))));
  const add = (relationship: TravelMember["relationship"]) => {
    if (members.length >= 20) return;
    onChange([...members, { id: crypto.randomUUID(), name: RELATIONS.find((r) => r.value === relationship)!.label, relationship, age: null, mobility: "standard", stroller: false, preferences: [] }]);
  };
  const togglePref = (m: TravelMember, pref: Concept) => update(m.id, { preferences: m.preferences.includes(pref) ? m.preferences.filter((p) => p !== pref) : [...m.preferences, pref] });
  return (
    <div className="party-editor">
      <p className="small muted">총 {members.length}명 · 함께 가는 사람을 한 명씩 추가해 주세요.</p>
      <div className="stack" style={{ gap: 10 }}>
        {members.map((m, index) => (
          <div className="party-member" key={m.id}>
            <div className="party-member-head">
              <span className="party-number" aria-hidden="true">{index + 1}</span>
              <label className="party-relation"><span className="xs muted">관계</span>
                <select className="input" aria-label={`${index + 1}번째 구성원 관계`} value={m.relationship} onChange={(e) => {
                  const relationship = e.target.value as TravelMember["relationship"];
                  update(m.id, { relationship, name: m.name === RELATIONS.find((r) => r.value === m.relationship)?.label ? RELATIONS.find((r) => r.value === relationship)!.label : m.name });
                }}>{RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
              </label>
              {m.relationship === "child" && <label className="party-age"><span className="xs muted">만 나이</span><input className="input" type="number" inputMode="numeric" min={0} max={120} step={1} aria-label={`${index + 1}번째 구성원 나이`} value={m.age ?? ""} placeholder="입력" onChange={(e) => update(m.id, { age: ageChange(e.target.value) })} /></label>}
              <button type="button" className="icon-btn" aria-label={`${index + 1}번째 ${labelOf(m)} 삭제`} disabled={members.length <= 1} onClick={() => onChange(members.filter((x) => x.id !== m.id))}>×</button>
            </div>
            <details className="party-details">
              <summary>이름·이동·개인 취향{m.mobility === "limited" || m.stroller || m.preferences.length ? " · 설정됨" : " (선택)"}</summary>
              <div className="party-details-body">
                <label className="small bold">구분할 이름<input className="input" aria-label={`${index + 1}번째 구성원 이름`} value={m.name} maxLength={30} onChange={(e) => update(m.id, { name: e.target.value })} placeholder="예: 엄마, 첫째" /></label>
                {m.relationship !== "child" && <label className="small bold">만 나이 (선택)<input className="input" type="number" inputMode="numeric" min={0} max={120} step={1} aria-label={`${index + 1}번째 구성원 나이`} value={m.age ?? ""} onChange={(e) => update(m.id, { age: ageChange(e.target.value) })} placeholder="미입력" /></label>}
                <label className="check-row small"><input type="checkbox" checked={m.mobility === "limited"} onChange={(e) => update(m.id, { mobility: e.target.checked ? "limited" : "standard" })} />긴 도보·계단이 부담스러워요</label>
                <label className="check-row small"><input type="checkbox" checked={m.stroller} onChange={(e) => update(m.id, { stroller: e.target.checked })} />유모차를 사용해요</label>
                <span className="small bold">이 사람의 취향</span>
                <div className="chips">{CONCEPTS.map((c) => <button type="button" key={c} className={`toggle-chip ${m.preferences.includes(c) ? "on" : ""}`} aria-pressed={m.preferences.includes(c)} onClick={() => togglePref(m, c)}>{c}</button>)}</div>
                <p className="xs muted">선택하지 않으면 공통 취향을 적용해요. 성인 자녀도 실제 나이로 입력할 수 있어요.</p>
              </div>
            </details>
          </div>
        ))}
      </div>
      <div className="chips party-add">{RELATIONS.filter((r) => r.value !== "self").map((r) => <button type="button" className="toggle-chip" key={r.value} disabled={members.length >= 20} onClick={() => add(r.value)}>+ {r.label}</button>)}</div>
      {members.length >= 20 && <p className="xs muted">한 번에 최대 20명까지 입력할 수 있어요.</p>}
    </div>
  );
}
