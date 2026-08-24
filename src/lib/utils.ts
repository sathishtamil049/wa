import type { Collection, MsgStatus, Producer } from "./data";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const inrFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat("en-IN");

export const inr = (n: number) => `₹${inrFmt.format(n)}`;
export const inrPlain = (n: number) => inrFmt.format(n);
export const num = (n: number) => numFmt.format(n);
export const qty = (n: number) => n.toFixed(1);

export function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}
export function fmtDateLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(d);
}
export function fmtTime(ts: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}
export function timeAgo(ts: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// --- message rendering ------------------------------------------------------
export type RenderRow = Collection & { producer: Producer };

export function renderTemplate(template: string, { producer: p, ...c }: RenderRow): string {
  const map: Record<string, string> = {
    "{producer_name}": p.name,
    "{producer_id}": p.code,
    "{date}": fmtDate(c.date),
    "{shift}": c.shift === "AM" ? "Morning (AM)" : "Evening (PM)",
    "{milk_ltr}": qty(c.milkLtr),
    "{fat}": qty(c.fat),
    "{snf}": qty(c.snf),
    "{rate_per_ltr}": inrPlain(c.rate),
    "{milk_amount}": inrPlain(c.amount),
    "{advance_deduction}": inrPlain(c.advance),
    "{net_payable}": inrPlain(c.net),
  };
  return template.replace(/\{[a-z_]+\}/g, (tok) => map[tok] ?? tok);
}

export function waLink(phone: string, countryCode: string, message: string): string {
  const digits = countryCode.replace(/\D/g, "") || "91";
  return `https://wa.me/${digits}${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

// --- status metadata --------------------------------------------------------
export const STATUS_META: Record<MsgStatus, { label: string; badge: string; dot: string }> = {
  pending: { label: "Pending", badge: "bg-stone-100 text-stone-600 ring-stone-300/70", dot: "bg-stone-400" },
  opened: { label: "Opened", badge: "bg-sky-50 text-sky-700 ring-sky-300/60", dot: "bg-sky-500" },
  sent: { label: "Sent", badge: "bg-wapp-50 text-wapp-700 ring-wapp-400/40", dot: "bg-wapp-500" },
  failed: { label: "Failed", badge: "bg-red-50 text-danger ring-red-300/60", dot: "bg-danger" },
  skipped: { label: "Skipped", badge: "bg-amber-50 text-amberish ring-amber-300/50", dot: "bg-amberish" },
};
