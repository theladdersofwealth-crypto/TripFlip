import { Icon } from "./Icon";
import { UNKNOWN } from "@/lib/labels";

export function DemoBadge({ label = "DEMO" }: { label?: string }) {
  return <span className="badge badge-demo" title="시연용 샘플 데이터 (SAMPLE_DATA)">{label}</span>;
}

export function PremiumBadge() {
  return <span className="badge badge-premium">PREMIUM</span>;
}

export function FreeBadge() {
  return <span className="badge badge-free">FREE</span>;
}

/** 값이 없으면 "미확인" 칩. tone: ok(확인·있음) / no(확인·없음) */
export function Chip({ icon, children, tone }: { icon?: string; children: React.ReactNode; tone?: "ok" | "no" | "teal" | "unknown" }) {
  return (
    <span className={`chip ${tone ? `chip-${tone}` : ""}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function TriChip({ icon, value, yes, no }: { icon: string; value: boolean | null; yes: string; no: string }) {
  if (value === null) return <Chip icon={icon} tone="unknown">{yes.replace(/ 있음| 가능| 필요/, "")} {UNKNOWN}</Chip>;
  return <Chip icon={icon} tone={value ? "ok" : "no"}>{value ? yes : no}</Chip>;
}

export function Dots({ value, max = 5, kind }: { value: number | null; max?: number; kind?: "fatigue" }) {
  if (value === null) return <span className="faint small">{UNKNOWN}</span>;
  return (
    <span className={`dots ${kind ?? ""}`} aria-label={`${value}/${max}`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < value ? "on" : ""} />)}
    </span>
  );
}

export function Attr({ k, v }: { k: string; v: React.ReactNode | null | undefined }) {
  const unknown = v === null || v === undefined || v === "";
  return (
    <div className="attr">
      <div className="k">{k}</div>
      <div className={`v ${unknown ? "unknown" : ""}`}>{unknown ? UNKNOWN : v}</div>
    </div>
  );
}

export function Empty({ icon = "info", title, desc, action }: { icon?: string; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="ico"><Icon name={icon} size={26} /></div>
      <b>{title}</b>
      {desc && <p className="muted small">{desc}</p>}
      {action}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 19 }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="닫기"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
