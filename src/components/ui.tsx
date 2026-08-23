import { useEffect, useRef, useState } from "react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { cn } from "../lib/utils";
import type { MsgStatus } from "../lib/data";
import { STATUS_META } from "../lib/utils";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { useApp } from "../lib/store";

// --- Button -----------------------------------------------------------------
type BtnVariant = "primary" | "wapp" | "outline" | "ghost" | "danger" | "dark";
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
}
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-pine-700 text-white hover:bg-pine-800 active:scale-[0.98] shadow-sm",
  wapp: "bg-wapp-600 text-white hover:bg-wapp-700 active:scale-[0.98] shadow-sm",
  outline: "border border-stone-300 bg-white text-ink hover:border-pine-400 hover:text-pine-700 active:scale-[0.98]",
  ghost: "text-ink-soft hover:bg-pine-50 hover:text-pine-800 active:scale-[0.98]",
  danger: "bg-danger text-white hover:bg-[#b23527] active:scale-[0.98] shadow-sm",
  dark: "bg-pine-950 text-pine-100 hover:bg-pine-900 active:scale-[0.98]",
};
const btnSizes = {
  sm: "h-8 px-2.5 text-xs gap-1.5 rounded-lg",
  md: "h-9.5 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-xl",
};

export function Btn({ variant = "outline", size = "md", icon, iconRight, className, children, ...rest }: BtnProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-all duration-150 select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-500",
        "disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap",
        btnVariants[variant],
        btnSizes[size],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}
    </button>
  );
}

export function IconBtn({ icon, label, onClick, tone = "neutral", disabled }: { icon: IconName; label: string; onClick?: () => void; tone?: "neutral" | "wapp" | "danger" | "pine"; disabled?: boolean }) {
  const tones = {
    neutral: "text-ink-soft hover:bg-pine-50 hover:text-pine-800",
    wapp: "text-wapp-600 hover:bg-wapp-50 hover:text-wapp-700",
    danger: "text-danger hover:bg-red-50",
    pine: "text-pine-700 hover:bg-pine-50",
  };
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 active:scale-90 disabled:opacity-35 disabled:pointer-events-none", tones[tone])}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

// --- Badge ------------------------------------------------------------------
export function StatusBadge({ status, size = "md" }: { status: MsgStatus; size?: "sm" | "md" }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset", m.badge, size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-xs")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function ShiftChip({ shift }: { shift: "AM" | "PM" }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide ring-1 ring-inset", shift === "AM" ? "bg-amber-50 text-amberish ring-amber-300/50" : "bg-pine-50 text-pine-700 ring-pine-200")}>
      {shift === "AM" ? "☀ AM" : "☾ PM"}
    </span>
  );
}

// --- Modal ------------------------------------------------------------------
export function Modal({ open, onClose, title, subtitle, width = "max-w-lg", children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; width?: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-pine-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn("anim-pop relative w-full rounded-2xl bg-white shadow-lift ring-1 ring-pine-900/10 max-h-[92vh] flex flex-col", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-bold text-ink leading-tight">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
          </div>
          <IconBtn icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 px-5 py-3.5 bg-stone-50/60 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, body, confirmLabel = "Confirm", danger = false }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Btn>
      </>}>
      <div className="flex gap-3 text-sm text-ink-soft">
        <span className={cn("mt-0.5 shrink-0", danger ? "text-danger" : "text-pine-600")}>
          <Icon name={danger ? "alert" : "info"} size={20} />
        </span>
        <div>{body}</div>
      </div>
    </Modal>
  );
}

// --- Toasts -----------------------------------------------------------------
export function ToastHost() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-20 lg:bottom-6 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={cn("anim-slide-left pointer-events-auto flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm font-semibold shadow-lift ring-1",
          t.kind === "success" && "bg-pine-900 text-pine-50 ring-pine-700",
          t.kind === "error" && "bg-[#3d1512] text-red-100 ring-red-900",
          t.kind === "info" && "bg-white text-ink ring-stone-200")}>
          <span className={cn(t.kind === "success" ? "text-wapp-400" : t.kind === "error" ? "text-red-400" : "text-pine-600")}>
            <Icon name={t.kind === "success" ? "check-circle" : t.kind === "error" ? "x-circle" : "info"} size={17} />
          </span>
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismissToast(t.id)} className="opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// --- Empty state ------------------------------------------------------------
export function EmptyState({ icon = "inbox", title, desc, action }: { icon?: IconName; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="anim-fade-up flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-pine-50 text-pine-500">
        <Icon name={icon} size={22} />
      </span>
      <p className="font-display text-base font-bold text-ink">{title}</p>
      {desc && <p className="mt-1 max-w-sm text-sm text-ink-soft">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// --- Pagination -------------------------------------------------------------
export function Pagination({ page, pages, onPage, shown, total }: { page: number; pages: number; onPage: (p: number) => void; shown: number; total: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3">
      <p className="text-xs text-ink-soft">
        Showing <strong className="text-ink tnum">{shown}</strong> of <strong className="text-ink tnum">{total}</strong> messages
      </p>
      <div className="flex items-center gap-1">
        <IconBtn icon="chevron-left" label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} />
        {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 7).map((p) => (
          <button key={p} onClick={() => onPage(p)}
            className={cn("h-8 min-w-8 rounded-lg px-2 text-xs font-bold tnum transition-colors", p === page ? "bg-pine-700 text-white" : "text-ink-soft hover:bg-pine-50")}>
            {p}
          </button>
        ))}
        {pages > 7 && <span className="px-1 text-xs text-ink-soft">… {pages}</span>}
        <IconBtn icon="chevron-right" label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} />
      </div>
    </div>
  );
}

// --- Count-up number --------------------------------------------------------
export function useCountUp(target: number, duration = 750): number {
  const [val, setVal] = useState(target);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) { setVal(target); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// --- Stat card ---------------------------------------------------------------
export function StatCard({ label, value, format, icon, tone = "pine", sub, delay = 0 }: { label: string; value: number; format: (n: number) => string; icon: IconName; tone?: "pine" | "wapp" | "amber" | "red" | "sky" | "stone"; sub?: ReactNode; delay?: number }) {
  const v = useCountUp(value);
  const tones = {
    pine: "bg-pine-100 text-pine-700",
    wapp: "bg-wapp-100 text-wapp-700",
    amber: "bg-amber-100 text-amberish",
    red: "bg-red-100 text-danger",
    sky: "bg-sky-100 text-sky-700",
    stone: "bg-stone-100 text-stone-500",
  };
  return (
    <div className="anim-fade-up group rounded-xl border border-stone-200/80 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
        <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110", tones[tone])}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <p className="font-display text-[26px] leading-none font-extrabold text-ink tnum mt-1.5">{format(v)}</p>
      {sub && <div className="mt-1.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}

// --- Progress ring -----------------------------------------------------------
export function Ring({ pct, size = 120, stroke = 11, label }: { pct: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [offset, setOffset] = useState(c);
  useEffect(() => {
    const t = window.setTimeout(() => setOffset(c - (Math.min(100, Math.max(0, pct)) / 100) * c), 60);
    return () => window.clearTimeout(t);
  }, [pct, c]);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e4ebe5" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-wapp-500)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)" }} />
      </svg>
      <div className="absolute text-center">
        <p className="font-display text-2xl font-extrabold text-ink tnum">{Math.round(pct)}%</p>
        {label && <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{label}</p>}
      </div>
    </div>
  );
}

// --- Sparkline ----------------------------------------------------------------
export function Spark({ points, width = 120, height = 34, stroke = "var(--color-pine-500)" }: { points: number[]; width?: number; height?: number; stroke?: string }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 0.001);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => `${(i * step).toFixed(1)},${(height - 3 - ((p - min) / range) * (height - 8)).toFixed(1)}`);
  const path = `M${coords.join(" L")}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={stroke} opacity="0.08" stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" pathLength={1} className="anim-draw" />
      <circle cx={width} cy={Number(coords[coords.length - 1].split(",")[1])} r="3" fill={stroke} />
    </svg>
  );
}

// --- Avatar --------------------------------------------------------------------
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const hues = ["bg-pine-600", "bg-wapp-600", "bg-amberish", "bg-pine-800", "bg-[#3a7ca5]"];
  const h = hues[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % hues.length];
  const init = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white", h)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {init}
    </span>
  );
}
