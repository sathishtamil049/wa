import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import type { EnrichedRow } from "../lib/store";
import type { MsgStatus } from "../lib/data";
import { PRODUCERS } from "../lib/data";
import { cn, copyText, fmtDate, inr, qty, waLink, STATUS_META } from "../lib/utils";
import { exportRowsToXlsx, EXPORT_FIELDS } from "../lib/excel";
import { Icon } from "../components/icons";
import { Btn, IconBtn, StatusBadge, ShiftChip, EmptyState, Avatar } from "../components/ui";
import { MessagePreviewModal, ProducerModal } from "../components/modals";

export function Collection() {
  const { rows, date, openMsg, markSent, retryMsg, bulkMarkSent, toast, messageFor, prefs } = useApp();
  const [search, setSearch] = useState("");
  const [shift, setShift] = useState<"ALL" | "AM" | "PM">("ALL");
  const [status, setStatus] = useState<"ALL" | MsgStatus>("ALL");
  const [producerId, setProducerId] = useState<"ALL" | number>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewRow, setPreviewRow] = useState<EnrichedRow | null>(null);
  const [producerModal, setProducerModal] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (shift !== "ALL" && r.shift !== shift) return false;
      if (status !== "ALL" && (r.msg?.status ?? "pending") !== status) return false;
      if (producerId !== "ALL" && r.producerId !== producerId) return false;
      if (q && !(`${r.producer.name} ${r.producer.code} ${r.producer.phone}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, search, shift, status, producerId]);

  const totals = useMemo(
    () => ({
      ltr: filtered.reduce((s, r) => s + r.milkLtr, 0),
      amount: filtered.reduce((s, r) => s + r.amount, 0),
      adv: filtered.reduce((s, r) => s + r.advance, 0),
      net: filtered.reduce((s, r) => s + r.net, 0),
    }),
    [filtered],
  );

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((r) => r.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const openWhatsApp = (row: EnrichedRow) => {
    const rec = openMsg(row);
    window.open(waLink(row.producer.phone, prefs.countryCode, rec.message), "_blank", "noopener");
    toast("info", `WhatsApp opened for ${row.producer.name}`);
  };

  const copyMessage = async (row: EnrichedRow) => {
    (await copyText(messageFor(row))) ? toast("success", `Message for ${row.producer.name} copied`) : toast("error", "Copy failed");
  };

  const exportSelected = () => {
    const list = rows.filter((r) => selected.has(r.id));
    exportRowsToXlsx(list, EXPORT_FIELDS.map((f) => f.key), `milk-collection-${date}-selected`, messageFor);
    toast("success", `Exported ${list.length} entries to Excel`);
  };

  const selRows = rows.filter((r) => selected.has(r.id));

  return (
    <div className="space-y-4">
      {/* filter bar */}
      <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-3.5 shadow-card">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative min-w-[200px] flex-1">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code or phone…"
              className="h-9.5 w-full rounded-lg border border-stone-200 bg-paper/60 pl-9 pr-3 text-sm font-medium text-ink placeholder:text-ink-soft/60 transition-colors focus:border-pine-500 focus:bg-white focus:outline-none" />
          </label>
          <div className="flex rounded-lg border border-stone-200 bg-paper/60 p-0.5">
            {(["ALL", "AM", "PM"] as const).map((s) => (
              <button key={s} onClick={() => setShift(s)} className={cn("rounded-md px-3 py-1.5 text-xs font-bold transition-all", shift === s ? "bg-pine-700 text-white shadow-sm" : "text-ink-soft hover:text-pine-700")}>
                {s === "ALL" ? "Both" : s}
              </button>
            ))}
          </div>
          <select value={producerId} onChange={(e) => setProducerId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
            className="h-9.5 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none">
            <option value="ALL">All producers</option>
            {PRODUCERS.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as "ALL" | MsgStatus)}
            className="h-9.5 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none">
            <option value="ALL">Any status</option>
            {(Object.keys(STATUS_META) as MsgStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <Btn variant="ghost" size="sm" icon="refresh" onClick={() => { setSearch(""); setShift("ALL"); setStatus("ALL"); setProducerId("ALL"); }}>Reset</Btn>
          <span className="ml-auto hidden items-center gap-1.5 rounded-lg bg-pine-50 px-2.5 py-1.5 text-xs font-bold text-pine-800 sm:inline-flex tnum">
            <Icon name="filter" size={13} /> {filtered.length} of {rows.length} entries
          </span>
        </div>
      </div>

      {/* table (desktop) */}
      <div className="anim-fade-up hidden overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-card lg:block" style={{ animationDelay: "80ms" }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/80 text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
                <th className="w-10 px-3 py-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
                <th className="px-2 py-3 font-bold">ID</th>
                <th className="px-2 py-3 font-bold">Producer</th>
                <th className="px-2 py-3 font-bold">Phone</th>
                <th className="px-2 py-3 font-bold">Date</th>
                <th className="px-2 py-3 font-bold">Shift</th>
                <th className="px-2 py-3 text-right font-bold">Milk Ltr</th>
                <th className="px-2 py-3 text-right font-bold">FAT</th>
                <th className="px-2 py-3 text-right font-bold">SNF</th>
                <th className="px-2 py-3 text-right font-bold">Rate/Ltr</th>
                <th className="px-2 py-3 text-right font-bold">Amount</th>
                <th className="px-2 py-3 text-right font-bold">Advance</th>
                <th className="px-2 py-3 text-right font-bold">Net Payable</th>
                <th className="px-2 py-3 font-bold">Status</th>
                <th className="px-2 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((r, i) => {
                const st = r.msg?.status ?? "pending";
                return (
                  <tr key={r.id} className={cn("group transition-colors hover:bg-pine-50/50", selected.has(r.id) && "bg-pine-50/70")} style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}>
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.producer.name}`} /></td>
                    <td className="px-2 py-2.5 font-bold text-pine-700">{r.producer.code}</td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        <Avatar name={r.producer.name} size={28} />
                        <button className="font-bold text-ink hover:text-pine-700 hover:underline underline-offset-2" onClick={() => setProducerModal(r.producerId)}>{r.producer.name}</button>
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-ink-soft tnum">{r.producer.phone}</td>
                    <td className="px-2 py-2.5 text-ink-soft tnum">{fmtDate(r.date)}</td>
                    <td className="px-2 py-2.5"><ShiftChip shift={r.shift} /></td>
                    <td className="px-2 py-2.5 text-right font-bold tnum">{qty(r.milkLtr)}</td>
                    <td className="px-2 py-2.5 text-right tnum">{qty(r.fat)}</td>
                    <td className="px-2 py-2.5 text-right tnum">{qty(r.snf)}</td>
                    <td className="px-2 py-2.5 text-right tnum">{qty(r.rate)}</td>
                    <td className="px-2 py-2.5 text-right font-semibold tnum">{inr(r.amount)}</td>
                    <td className="px-2 py-2.5 text-right tnum text-amberish">{r.advance > 0 ? `−${inr(r.advance)}` : "—"}</td>
                    <td className="px-2 py-2.5 text-right font-extrabold text-pine-800 tnum">{inr(r.net)}</td>
                    <td className="px-2 py-2.5"><StatusBadge status={st} size="sm" /></td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                        <IconBtn icon="whatsapp" label="Open WhatsApp" tone="wapp" onClick={() => openWhatsApp(r)} />
                        <IconBtn icon="eye" label="Preview message" tone="pine" onClick={() => setPreviewRow(r)} />
                        <IconBtn icon="copy" label="Copy message" onClick={() => void copyMessage(r)} />
                        <IconBtn icon="check" label="Mark sent" tone="pine" disabled={st === "sent"} onClick={() => { markSent(r.id); toast("success", `${r.producer.name} marked as Sent`); }} />
                        <IconBtn icon="refresh" label="Retry" tone="danger" disabled={st !== "failed"} onClick={() => { retryMsg(r.id); toast("info", `${r.producer.name} reset to Pending`); }} />
                        <IconBtn icon="user" label="View producer" onClick={() => setProducerModal(r.producerId)} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-pine-200 bg-pine-50/60 text-[13px] font-bold">
                  <td colSpan={6} className="px-3 py-3 text-pine-800">Totals · {filtered.length} entries</td>
                  <td className="px-2 py-3 text-right tnum">{totals.ltr.toFixed(1)}</td>
                  <td colSpan={3} className="px-2 py-3" />
                  <td className="px-2 py-3 text-right tnum">{inr(totals.amount)}</td>
                  <td className="px-2 py-3 text-right text-amberish tnum">−{inr(totals.adv)}</td>
                  <td className="px-2 py-3 text-right text-pine-800 tnum">{inr(totals.net)}</td>
                  <td colSpan={2} className="px-2 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-6"><EmptyState icon="search" title="No entries match your filters" desc="Try a different date, shift or status — or reset the filters." action={<Btn variant="primary" size="sm" onClick={() => { setSearch(""); setShift("ALL"); setStatus("ALL"); setProducerId("ALL"); }}>Reset filters</Btn>} /></div>
        )}
      </div>

      {/* cards (mobile / tablet) */}
      <div className="space-y-3 lg:hidden">
        {filtered.length === 0 && <EmptyState icon="search" title="No entries match" desc="Try different filters or another date." />}
        {filtered.map((r) => {
          const st = r.msg?.status ?? "pending";
          return (
            <div key={r.id} className={cn("anim-fade-up rounded-xl border bg-white p-4 shadow-card transition-colors", selected.has(r.id) ? "border-pine-400 ring-2 ring-pine-200" : "border-stone-200/80")}>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.producer.name}`} />
                <Avatar name={r.producer.name} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px] font-bold text-ink">{r.producer.name}</p>
                  <p className="text-[11.5px] text-ink-soft tnum">{r.producer.code} · {r.producer.phone}</p>
                </div>
                <StatusBadge status={st} size="sm" />
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-paper/70 p-2.5 text-center ring-1 ring-stone-100">
                {[
                  ["Milk", `${qty(r.milkLtr)} L`],
                  ["FAT/SNF", `${qty(r.fat)}/${qty(r.snf)}`],
                  ["Rate", `₹${qty(r.rate)}`],
                  ["Net", inr(r.net)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[9.5px] font-bold uppercase tracking-wider text-ink-soft">{k}</p>
                    <p className="text-[13px] font-extrabold text-ink tnum">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-ink-soft tnum">
                <ShiftChip shift={r.shift} /> <span className="ml-1.5">Amount {inr(r.amount)} · Advance {r.advance ? inr(r.advance) : "₹0.00"}</span>
              </p>
              <div className="mt-3 flex gap-2">
                <Btn variant="wapp" size="sm" icon="whatsapp" className="flex-1" onClick={() => openWhatsApp(r)}>Open WhatsApp</Btn>
                <Btn variant="outline" size="sm" icon="copy" onClick={() => void copyMessage(r)}>Copy</Btn>
                <IconBtn icon="eye" label="Preview message" tone="pine" onClick={() => setPreviewRow(r)} />
                <IconBtn icon="check" label="Mark sent" tone="pine" disabled={st === "sent"} onClick={() => { markSent(r.id); toast("success", `${r.producer.name} marked as Sent`); }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* bulk bar */}
      {selected.size > 0 && (
        <div className="anim-pop fixed bottom-20 left-1/2 z-40 w-[min(94vw,680px)] -translate-x-1/2 lg:bottom-6">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-pine-800 bg-pine-950 px-4 py-3 shadow-lift">
            <span className="mr-1 text-sm font-bold text-white tnum">{selected.size} selected</span>
            <Btn variant="wapp" size="sm" icon="whatsapp" onClick={() => { const first = selRows[0]; if (first) openWhatsApp(first); }}>Open first chat</Btn>
            <Btn variant="dark" size="sm" icon="copy" className="ring-1 ring-white/20" onClick={async () => {
              const text = selRows.map((r) => messageFor(r)).join("\n\n──────────────\n\n");
              (await copyText(text)) ? toast("success", `${selRows.length} messages copied`) : toast("error", "Copy failed");
            }}>Copy messages</Btn>
            <Btn variant="dark" size="sm" icon="sheet" className="ring-1 ring-white/20" onClick={exportSelected}>Export</Btn>
            <Btn variant="dark" size="sm" icon="check" className="ring-1 ring-white/20" onClick={() => { bulkMarkSent([...selected]); toast("success", `${selected.size} entries marked as Sent`); setSelected(new Set()); }}>Mark sent</Btn>
            <button onClick={() => setSelected(new Set())} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-pine-200 hover:bg-white/10 hover:text-white" aria-label="Clear selection">
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
      )}

      <MessagePreviewModal row={previewRow} open={previewRow !== null} onClose={() => setPreviewRow(null)} />
      <ProducerModal producerId={producerModal} open={producerModal !== null} onClose={() => setProducerModal(null)} />
    </div>
  );
}
