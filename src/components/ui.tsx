import { ReactNode, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cx } from "../lib/util";

// ─────────────────────────── status system ───────────────────────────

const TONES: Record<string, { text: string; chip: string; dot: string; pulse?: boolean }> = {
  RUNNING: { text: "text-run", chip: "bg-run/10 text-run border-run/30", dot: "bg-run", pulse: true },
  SUCCESS: { text: "text-ok", chip: "bg-ok/10 text-ok border-ok/30", dot: "bg-ok" },
  COMPLETED: { text: "text-ok", chip: "bg-ok/10 text-ok border-ok/30", dot: "bg-ok" },
  APPROVED: { text: "text-ok", chip: "bg-ok/10 text-ok border-ok/30", dot: "bg-ok" },
  CONNECTED: { text: "text-ok", chip: "bg-ok/10 text-ok border-ok/30", dot: "bg-ok", pulse: true },
  ACTIVE: { text: "text-ok", chip: "bg-ok/10 text-ok border-ok/30", dot: "bg-ok", pulse: true },
  FAILED: { text: "text-bad", chip: "bg-bad/10 text-bad border-bad/30", dot: "bg-bad" },
  OFFLINE: { text: "text-bad", chip: "bg-bad/10 text-bad border-bad/30", dot: "bg-bad" },
  REJECTED: { text: "text-bad", chip: "bg-bad/10 text-bad border-bad/30", dot: "bg-bad" },
  CANCELLED: { text: "text-dim", chip: "bg-ink-700/60 text-mid border-edge", dot: "bg-dim" },
  WAITING: { text: "text-dim", chip: "bg-ink-700/40 text-dim border-edge", dot: "bg-dim" },
  PENDING: { text: "text-dim", chip: "bg-ink-700/40 text-dim border-edge", dot: "bg-dim" },
  IDLE: { text: "text-dim", chip: "bg-ink-700/40 text-dim border-edge", dot: "bg-dim" },
  SKIPPED: { text: "text-dim", chip: "bg-ink-700/40 text-dim border-edge", dot: "bg-dim" },
  QUEUED: { text: "text-mid", chip: "bg-ink-700/50 text-mid border-edge", dot: "bg-mid" },
  PAUSED: { text: "text-warn", chip: "bg-warn/10 text-warn border-warn/30", dot: "bg-warn", pulse: true },
  AWAITING_APPROVAL: { text: "text-warn", chip: "bg-warn/10 text-warn border-warn/30", dot: "bg-warn", pulse: true },
  DEGRADED: { text: "text-warn", chip: "bg-warn/10 text-warn border-warn/30", dot: "bg-warn", pulse: true },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const t = TONES[status] ?? TONES.WAITING;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-medium tracking-wide", t.chip, className)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", t.dot, t.pulse && "animate-pulse-soft")} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cx("inline-block h-1.5 w-1.5 rounded-full", className)} />;
}

// ─────────────────────────── primitives ───────────────────────────

export function StatCard({ label, value, sub, icon, accent = "text-brand", spark }: {
  label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; accent?: string; spark?: number[];
}) {
  return (
    <div className="card card-hover p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-dim">{label}</p>
        <span className={cx("shrink-0", accent)}>{icon}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="num text-[26px] font-semibold leading-none text-hi">{value}</p>
        {spark && <Sparkline data={spark} className="mb-0.5 h-8 w-20 shrink-0" />}
      </div>
      {sub && <div className="mt-2 text-[11.5px] text-dim">{sub}</div>}
    </div>
  );
}

export function Sparkline({ data, className, stroke = "#2dd4bf" }: { data: number[]; className?: string; stroke?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${30 - ((v - min) / (max - min || 1)) * 26 - 2}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
      <polyline points={`0,30 ${pts} 100,30`} fill={stroke} opacity="0.07" stroke="none" />
    </svg>
  );
}

export function ProgressBar({ value, tone = "bg-brand", className }: { value: number; tone?: string; className?: string }) {
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-ink-700", className)}>
      <div className={cx("h-full rounded-full transition-all duration-700 ease-out", tone)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge px-6 py-14 text-center">
      <div className="text-dim">{icon}</div>
      <p className="font-display text-sm font-semibold text-mid">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-dim">{hint}</p>}
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-edge bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-mid">{children}</kbd>;
}

export function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="group flex w-full items-center justify-between gap-4 py-2.5 text-left" aria-pressed={on}>
      <span>
        <span className="block text-[13px] font-medium text-hi">{label}</span>
        {desc && <span className="block text-[11.5px] text-dim">{desc}</span>}
      </span>
      <span className={cx("relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200", on ? "border-brand/50 bg-brand/25" : "border-edge bg-ink-700")}>
        <span className={cx("absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all duration-200", on ? "left-[18px] bg-brand" : "left-[3px] bg-dim")} />
      </span>
    </button>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-edge bg-ink-850 p-0.5">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={cx("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", value === o.v ? "bg-ink-600 text-hi" : "text-dim hover:text-mid")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, tone }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; tone?: "warn";
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/75 backdrop-blur-[3px] animate-fade-in" onClick={onClose} />
      <div className={cx("relative w-full animate-fade-up rounded-xl border bg-ink-850 shadow-2xl shadow-black/60", wide ? "max-w-2xl" : "max-w-lg", tone === "warn" ? "border-warn/40" : "border-edge")}>
        <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <h3 className="font-display text-sm font-semibold text-hi">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-dim transition-colors hover:bg-ink-700 hover:text-hi" aria-label="Close dialog">
            <X size={15} />
          </button>
        </div>
        <div className="max-h-[76vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────── JSON viewer ───────────────────────────

export function JSONViewer({ data, name, depth = 0 }: { data: unknown; name?: string; depth?: number }) {
  if (data === null || data === undefined) return <Line k={name} v="null" c="text-dim" />;
  if (typeof data === "string") return <Line k={name} v={`"${data}"`} c="text-ok" />;
  if (typeof data === "number") return <Line k={name} v={String(data)} c="text-run" />;
  if (typeof data === "boolean") return <Line k={name} v={String(data)} c="text-warn" />;
  const entries = Array.isArray(data) ? data.map((v, i) => [String(i), v] as const) : Object.entries(data as Record<string, unknown>);
  return (
    <Collapsible k={name} count={entries.length} isArray={Array.isArray(data)} depth={depth}>
      {entries.map(([k, v]) => <JSONViewer key={k} name={k} data={v} depth={depth + 1} />)}
    </Collapsible>
  );
}

function Line({ k, v, c }: { k?: string; v: string; c: string }) {
  return (
    <div className="whitespace-pre-wrap break-all py-px pl-4 text-[11.5px] leading-relaxed">
      {k !== undefined && <span className="text-mid">{k}: </span>}
      <span className={c}>{v}</span>
    </div>
  );
}

function Collapsible({ k, count, isArray, depth, children }: { k?: string; count: number; isArray: boolean; depth: number; children: ReactNode }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <div className="pl-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 py-px font-mono text-[11.5px] text-mid hover:text-hi">
        <span className="text-dim">{open ? "▾" : "▸"}</span>
        {k !== undefined && <span>{k}: </span>}
        <span className="text-dim">{isArray ? `[${count}]` : `{${count}}`}</span>
      </button>
      {open && <div className="border-l border-edge/70">{children}</div>}
    </div>
  );
}

// ─────────────────────────── toast stack ───────────────────────────

const TOAST_META = {
  info: { icon: <Info size={15} />, cls: "border-run/40 text-run" },
  success: { icon: <CheckCircle2 size={15} />, cls: "border-ok/40 text-ok" },
  warn: { icon: <AlertTriangle size={15} />, cls: "border-warn/40 text-warn" },
  error: { icon: <XCircle size={15} />, cls: "border-bad/40 text-bad" },
} as const;

export function ToastCard({ kind, title, detail, onClose }: { kind: keyof typeof TOAST_META; title: string; detail?: string; onClose: () => void }) {
  const m = TOAST_META[kind];
  return (
    <div className={cx("pointer-events-auto flex w-80 animate-slide-in items-start gap-2.5 rounded-lg border bg-ink-800/95 px-3.5 py-3 shadow-xl shadow-black/50 backdrop-blur", m.cls)}>
      <span className="mt-0.5 shrink-0">{m.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold text-hi">{title}</p>
        {detail && <p className="mt-0.5 truncate text-[11.5px] text-mid">{detail}</p>}
      </div>
      <button onClick={onClose} className="shrink-0 rounded p-0.5 text-dim hover:text-hi" aria-label="Dismiss notification"><X size={13} /></button>
    </div>
  );
}
