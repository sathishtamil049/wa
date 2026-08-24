import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import type { EnrichedRow } from "../lib/store";
import type { MsgStatus } from "../lib/data";
import { cn, copyText, inr, qty, waLink, STATUS_META } from "../lib/utils";
import { exportRowsToXlsx, EXPORT_FIELDS } from "../lib/excel";
import { Icon } from "../components/icons";
import { Btn, StatusBadge, ShiftChip, EmptyState, Avatar } from "../components/ui";
import { WaBubble, MessagePreviewModal } from "../components/modals";

export function Sender() {
  const { rows, date, openMsg, markSent, bulkMarkSent, toast, messageFor, prefs, go } = useApp();
  const [search, setSearch] = useState("");
  const [shift, setShift] = useState<"ALL" | "AM" | "PM">(prefs.defaultShift);
  const [status, setStatus] = useState<"ALL" | MsgStatus>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<EnrichedRow[] | null>(null);
  const [previewRow, setPreviewRow] = useState<EnrichedRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (shift !== "ALL" && r.shift !== shift) return false;
      if (status !== "ALL" && (r.msg?.status ?? "pending") !== status) return false;
      if (q && !`${r.producer.name} ${r.producer.code} ${r.producer.phone}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, shift, status]);

  const pendingCount = rows.filter((r) => !r.msg || r.msg.status === "pending" || r.msg.status === "failed").length;
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const selRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const openWhatsApp = (row: EnrichedRow) => {
    const rec = openMsg(row);
    window.open(waLink(row.producer.phone, prefs.countryCode, rec.message), "_blank", "noopener");
    toast("info", `WhatsApp opened for ${row.producer.name}`);
  };

  return (
    <div className="space-y-4">
      {/* compliance strip */}
      <div className="anim-fade-up flex items-start gap-3 rounded-xl border border-wapp-400/30 bg-wapp-50 px-4 py-3.5">
        <span className="mt-0.5 shrink-0 text-wapp-600"><Icon name="shield" size={19} /></span>
        <div className="text-[13px] leading-relaxed text-pine-900">
          <p className="font-bold">You stay in control of every message.</p>
          <p className="text-pine-800/85">MilkPro prepares a personalised, pre-filled chat via <code className="rounded bg-white/70 px-1 font-mono text-[11.5px]">wa.me</code> links — it never bypasses WhatsApp login, CAPTCHA or anti-spam limits, and never clicks Send on your behalf. {pendingCount > 0 ? <strong className="tnum">{pendingCount} messages are waiting.</strong> : "Everything is delivered."}</p>
        </div>
        <Btn variant="wapp" size="sm" icon="whatsapp" className="ml-auto hidden shrink-0 sm:inline-flex" onClick={() => go("collection")}>View collection</Btn>
      </div>

      {/* toolbar */}
      <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-3.5 shadow-card" style={{ animationDelay: "60ms" }}>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative min-w-[190px] flex-1">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search producer…"
              className="h-9.5 w-full rounded-lg border border-stone-200 bg-paper/60 pl-9 pr-3 text-sm font-medium focus:border-pine-500 focus:bg-white focus:outline-none" />
          </label>
          <div className="flex rounded-lg border border-stone-200 bg-paper/60 p-0.5">
            {(["ALL", "AM", "PM"] as const).map((s) => (
              <button key={s} onClick={() => setShift(s)} className={cn("rounded-md px-3 py-1.5 text-xs font-bold transition-all", shift === s ? "bg-pine-700 text-white shadow-sm" : "text-ink-soft hover:text-pine-700")}>
                {s === "ALL" ? "Both" : s}
              </button>
            ))}
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as "ALL" | MsgStatus)}
            className="h-9.5 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none">
            <option value="ALL">Any status</option>
            {(Object.keys(STATUS_META) as MsgStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-dashed border-stone-200 pt-2.5">
          <Btn variant="outline" size="sm" icon="check" onClick={() => setSelected(new Set(filtered.map((r) => r.id)))}>Select all ({filtered.length})</Btn>
          <Btn variant="ghost" size="sm" icon="x" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>Clear selection</Btn>
          <span className="mx-1 hidden h-5 w-px bg-stone-200 sm:block" />
          <Btn variant="wapp" size="sm" icon="send" disabled={selected.size === 0} onClick={() => setQueue(selRows)}>Send selected</Btn>
          <Btn variant="outline" size="sm" icon="copy" disabled={selected.size === 0} onClick={async () => {
            const text = selRows.map((r) => messageFor(r)).join("\n\n──────────────\n\n");
            (await copyText(text)) ? toast("success", `${selRows.length} messages copied to clipboard`) : toast("error", "Copy failed");
          }}>Copy selected</Btn>
          <Btn variant="outline" size="sm" icon="sheet" disabled={selected.size === 0} onClick={() => {
            exportRowsToXlsx(selRows, EXPORT_FIELDS.map((f) => f.key), `milk-whatsapp-${date}-selected`, messageFor);
            toast("success", `Exported ${selRows.length} entries to .xlsx`);
          }}>Export selected</Btn>
          <Btn variant="outline" size="sm" icon="check-circle" disabled={selected.size === 0} onClick={() => {
            bulkMarkSent([...selected]); toast("success", `${selected.size} messages marked as Sent`); setSelected(new Set());
          }}>Mark selected sent</Btn>
        </div>
      </div>

      {/* queue list */}
      {filtered.length === 0 ? (
        <EmptyState icon="whatsapp" title="No producers in this view" desc="Adjust the filters or pick another working date from the header." />
      ) : (
        <div className="anim-fade-up overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-card" style={{ animationDelay: "120ms" }}>
          <ul className="divide-y divide-stone-100">
            {filtered.map((r) => {
              const st = r.msg?.status ?? "pending";
              const isSel = selected.has(r.id);
              return (
                <li key={r.id} className={cn("flex flex-col gap-3 px-4 py-3.5 transition-colors sm:flex-row sm:items-center", isSel ? "bg-pine-50/70" : "hover:bg-pine-50/40")}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <input type="checkbox" checked={isSel} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} aria-label={`Select ${r.producer.name}`} />
                    <Avatar name={r.producer.name} size={40} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 text-[14.5px] font-bold text-ink">
                        {r.producer.name}
                        <span className="text-[11px] font-bold text-pine-600">{r.producer.code}</span>
                        <ShiftChip shift={r.shift} />
                      </p>
                      <p className="text-xs text-ink-soft tnum">+{prefs.countryCode} {r.producer.phone} · {qty(r.milkLtr)} L · {inr(r.amount)} · <strong className="text-pine-700">Net {inr(r.net)}</strong></p>
                    </div>
                  </div>
                  <button className="hidden min-w-0 flex-1 cursor-pointer rounded-lg border border-stone-200 bg-paper/60 px-3 py-2 text-left transition-colors hover:border-pine-300 hover:bg-white lg:block" onClick={() => setPreviewRow(r)} title="Preview message">
                    <p className="truncate text-[12px] text-ink-soft">{messageFor(r).replace(/\n/g, " · ")}</p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={st} size="sm" />
                    <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-ink-soft transition-colors hover:border-pine-300 hover:text-pine-700" onClick={() => setPreviewRow(r)} title="Preview" aria-label="Preview message">
                      <Icon name="eye" size={15} />
                    </button>
                    <Btn variant="wapp" size="sm" icon="whatsapp" onClick={() => openWhatsApp(r)}>Open WhatsApp</Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {queue && <SendFlow queue={queue} onClose={() => setQueue(null)} />}
      <MessagePreviewModal row={previewRow} open={previewRow !== null} onClose={() => setPreviewRow(null)} />
    </div>
  );
}

// --- guided one-at-a-time send flow -----------------------------------------
function SendFlow({ queue, onClose }: { queue: EnrichedRow[]; onClose: () => void }) {
  const { openMsg, markSent, markFailed, markSkipped, messageFor, prefs, toast } = useApp();
  const [phase, setPhase] = useState<"confirm" | "run" | "done">(prefs.confirmBulk ? "confirm" : "run");
  const [idx, setIdx] = useState(0);
  const [opened, setOpened] = useState(false);
  const [counts, setCounts] = useState({ sent: 0, failed: 0, skipped: 0 });
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const row = queue[Math.min(idx, queue.length - 1)];
  const total = queue.length;
  const isLast = idx >= total - 1;

  const advance = (patch: Partial<typeof counts>) => {
    setCounts((c) => ({ ...c, ...patch }));
    setOpened(false);
    if (isLast) {
      setLeaving(true);
      timer.current = window.setTimeout(() => setPhase("done"), 350);
    } else {
      setLeaving(true);
      timer.current = window.setTimeout(() => { setIdx((i) => i + 1); setLeaving(false); }, Math.min(prefs.bulkDelay, 900));
    }
  };

  const openChat = () => {
    const rec = openMsg(row);
    window.open(waLink(row.producer.phone, prefs.countryCode, rec.message), "_blank", "noopener");
    setOpened(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-pine-950/55 backdrop-blur-[3px]" onClick={phase === "run" ? undefined : onClose} />
      <div className="anim-pop relative w-full max-w-xl rounded-2xl bg-white shadow-lift ring-1 ring-pine-900/10">
        {/* progress header */}
        <div className="rounded-t-2xl bg-pine-950 px-5 py-4 text-white" style={{ backgroundImage: "radial-gradient(420px 160px at 90% -40%, rgb(37 211 102 / 0.25), transparent)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-wapp-400">
                {phase === "confirm" ? "Ready to send" : phase === "done" ? "Queue complete" : `Sending ${idx + 1} of ${total}`}
              </p>
              <h3 className="font-display mt-0.5 text-lg font-extrabold leading-tight">
                {phase === "confirm" ? `${total} personalised messages` : phase === "done" ? "Nice work — queue finished" : `Current producer: ${row.producer.name}`}
              </h3>
            </div>
            {phase !== "run" && (
              <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-pine-200 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            )}
            {phase === "run" && (
              <button onClick={() => { toast("info", "Bulk queue cancelled — statuses are preserved"); onClose(); }} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/20">
                Cancel queue
              </button>
            )}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-wapp-500 transition-all duration-500" style={{ width: `${phase === "done" ? 100 : (idx / total) * 100}%` }} />
          </div>
        </div>

        {phase === "confirm" && (
          <div className="px-5 py-4">
            <div className="flex flex-wrap gap-1.5">
              {queue.slice(0, 8).map((q) => (
                <span key={q.id} className="rounded-full bg-pine-50 px-2.5 py-1 text-[11.5px] font-bold text-pine-800 ring-1 ring-pine-100">{q.producer.name}</span>
              ))}
              {queue.length > 8 && <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11.5px] font-bold text-ink-soft tnum">+{queue.length - 8} more</span>}
            </div>
            <div className="mt-4 space-y-2 rounded-xl bg-paper/70 p-3.5 text-[13px] leading-relaxed text-ink-soft ring-1 ring-stone-100">
              <p className="flex items-start gap-2"><Icon name="whatsapp" size={15} className="mt-0.5 shrink-0 text-wapp-600" />Each conversation opens one at a time in a new WhatsApp Web tab.</p>
              <p className="flex items-start gap-2"><Icon name="send" size={15} className="mt-0.5 shrink-0 text-pine-600" />You press <strong className="text-ink">Send inside WhatsApp yourself</strong> — MilkPro only pre-fills the chat.</p>
              <p className="flex items-start gap-2"><Icon name="check-circle" size={15} className="mt-0.5 shrink-0 text-pine-600" />After each chat you mark it Sent, Failed or Skip to move to the next producer.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Btn variant="ghost" onClick={onClose}>Not now</Btn>
              <Btn variant="wapp" icon="whatsapp" size="lg" onClick={() => setPhase("run")}>Start sending {total} messages</Btn>
            </div>
          </div>
        )}

        {phase === "run" && (
          <div className={cn("px-5 py-4 transition-opacity duration-200", leaving && "opacity-40")}>
            <div className="flex items-center gap-3">
              <Avatar name={row.producer.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[16px] font-extrabold text-ink">{row.producer.name}</p>
                <p className="text-xs text-ink-soft tnum">+{prefs.countryCode} {row.producer.phone} · {qty(row.milkLtr)} L · Net {inr(row.net)}</p>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide", opened ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200" : "bg-stone-100 text-stone-500 ring-1 ring-stone-200")}>
                {opened ? "Chat opened" : "Not opened yet"}
              </span>
            </div>
            <div className="mt-3 max-h-56 overflow-y-auto rounded-xl">
              <WaBubble text={messageFor(row)} />
            </div>
            <div className="mt-4 grid gap-2">
              {!opened ? (
                <Btn variant="wapp" size="lg" icon="whatsapp" iconRight="external" onClick={openChat}>
                  Step 1 — Open WhatsApp for {row.producer.name.split(" ")[0]}
                </Btn>
              ) : (
                <p className="anim-fade-up flex items-center justify-center gap-2 rounded-lg bg-wapp-50 px-3 py-2 text-center text-xs font-bold text-wapp-700 ring-1 ring-wapp-100">
                  <Icon name="info" size={14} /> WhatsApp tab is open — review the chat, then press Send there.
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Btn variant="primary" icon="check" disabled={!opened} onClick={() => { markSent(row.id); advance({ sent: 1 }); toast("success", `${row.producer.name} marked Sent`); }}>
                  Sent · next
                </Btn>
                <Btn variant="outline" icon="x-circle" className="!text-danger hover:!border-red-300" disabled={!opened} onClick={() => { markFailed(row.id, "User reported delivery issue"); advance({ failed: 1 }); }}>
                  Failed
                </Btn>
                <Btn variant="outline" icon="chevron-right" disabled={!opened} onClick={() => { markSkipped(row.id); advance({ skipped: 1 }); }}>
                  Skip
                </Btn>
              </div>
              <p className="text-center text-[11px] text-ink-soft tnum">
                {counts.sent} sent · {counts.failed} failed · {counts.skipped} skipped · {total - idx - 1} remaining
              </p>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="px-5 py-6 text-center">
            <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-wapp-100 text-wapp-600">
              <Icon name="check-circle" size={28} />
            </span>
            <h4 className="font-display mt-3 text-xl font-extrabold text-ink">Queue finished</h4>
            <p className="mt-1 text-sm text-ink-soft">You processed {total} producers. Statuses are saved and visible in Message History.</p>
            <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 gap-2">
              {[
                ["Sent", counts.sent, "text-wapp-700 bg-wapp-50 ring-wapp-100"],
                ["Failed", counts.failed, "text-danger bg-red-50 ring-red-100"],
                ["Skipped", counts.skipped, "text-amberish bg-amber-50 ring-amber-100"],
              ].map(([k, v, cls]) => (
                <div key={k as string} className={cn("rounded-xl px-3 py-2.5 ring-1", cls as string)}>
                  <p className="font-display text-xl font-extrabold tnum">{v as number}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">{k as string}</p>
                </div>
              ))}
            </div>
            <Btn variant="primary" size="lg" className="mt-5" onClick={onClose}>Back to Sender</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
