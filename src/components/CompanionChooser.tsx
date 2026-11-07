"use client";
import { useEffect, useId, useRef, useState } from "react";
import { PartyEditor } from "./PartyEditor";
import type { TravelMember } from "@/lib/travelParty";
import { childBandOf } from "@/lib/travelParty";

const PRESETS = [
  { label: "혼자", roles: ["self"] },
  { label: "부부·연인", roles: ["self", "spouse"] },
  { label: "친구", roles: ["self", "friend"] },
  { label: "아이와", roles: ["self", "spouse", "child"] },
  { label: "부모님과", roles: ["self", "spouse", "parent"] },
] as const;
const LABEL = { self: "본인", spouse: "배우자", partner: "연인", friend: "친구", child: "자녀", parent: "부모님", parentInLaw: "배우자 부모님", other: "일행" };

export function CompanionChooser({ members, onChange, error }: { members: TravelMember[]; onChange: (members: TravelMember[]) => void; error: string | null }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = scroll; previous?.focus(); };
  }, [open]);
  const children = members.filter((m) => childBandOf(m) !== null).length;
  const adults = members.length - children;
  const [undo, setUndo] = useState<{ prev: TravelMember[]; note: string } | null>(null);
  const choose = (roles: typeof PRESETS[number]["roles"]) => {
    // 이미 선택된 유형을 다시 누르면 기존 구성원 정보(나이·보행·취향)를 그대로 둔다.
    if (matches(roles)) { if (roles.some((r) => r === "child")) setOpen(true); return; }
    // 다른 유형으로 바꿀 때도 같은 관계의 구성원은 다시 쓴다(배우자↔연인 동일 취급).
    const pool = [...members];
    const same = (a: TravelMember["relationship"], b: TravelMember["relationship"]) => a === b || (a === "spouse" && b === "partner") || (a === "partner" && b === "spouse");
    const next = roles.map((relationship) => {
      const i = pool.findIndex((m) => same(m.relationship, relationship));
      if (i >= 0) return pool.splice(i, 1)[0];
      return { id: crypto.randomUUID(), name: LABEL[relationship], relationship, age: null, mobility: "standard" as const, stroller: false, preferences: [] };
    });
    const dropped = pool.filter((m) => m.age !== null || m.preferences.length || m.mobility !== "standard" || m.stroller);
    setUndo(dropped.length ? { prev: members, note: `${dropped.map((m) => m.name).join("·")} 정보가 빠졌어요.` } : null);
    onChange(next);
    if (roles.some((r) => r === "child")) setOpen(true);
  };
  const matches = (roles: typeof PRESETS[number]["roles"]) => roles.length === members.length && roles.every((role, i) => role === members[i].relationship || role === "spouse" && members[i].relationship === "partner");
  return <>
    <div className="companion-presets" aria-label="동행 간편 선택">{PRESETS.map((p) => <button type="button" key={p.label} className={`toggle-chip ${matches(p.roles) ? "on" : ""}`} aria-pressed={matches(p.roles)} onClick={() => choose(p.roles)}>{p.label}</button>)}</div>
    {undo && <p className="xs muted" role="status">{undo.note} <button type="button" className="text-button xs" onClick={() => { onChange(undo.prev); setUndo(null); }}>되돌리기</button></p>}
    <button type="button" className="companion-summary" aria-label="구성원 설정" onClick={() => setOpen(true)}><span><b>성인 {adults}명{children ? ` · 자녀 ${children}명` : ""}</b><span className="xs muted">총 {members.length}명</span></span><span className="small">구성원 설정 ›</span></button>
    {error && <button type="button" className="form-error small text-button" onClick={() => setOpen(true)}>{error} · 설정하기</button>}
    {open && <dialog ref={dialog} className="simple-dialog" aria-labelledby={titleId} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="dialog-header"><div><h2 id={titleId}>함께 가는 사람</h2><p className="xs muted">인원과 자녀 나이만 먼저 정해요.</p></div><button type="button" className="icon-btn" aria-label="동행 설정 닫기" onClick={() => setOpen(false)}>×</button></div>
      <div className="dialog-content"><PartyEditor members={members} onChange={onChange} />{error && <p role="alert" className="form-error small">{error}</p>}</div>
      <div className="dialog-footer"><button type="button" className="btn btn-primary btn-block" onClick={() => setOpen(false)}>설정 완료</button></div>
    </dialog>}
  </>;
}
