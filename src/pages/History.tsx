import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { producerById, PRODUCERS } from "../lib/data";
import type { MsgStatus } from "../lib/data";
import { cn, copyText, fmtDate, fmtTime, waLink, STATUS_META } from "../lib/utils";
import * as api from "../lib/api";
import type { HistoryApiRow } from "../lib/api";
import { Icon } from "../components/icons";
import { Btn, StatusBadge, ShiftChip, EmptyState, Pagination, Avatar, Modal } from "../components/ui";
import { WaBubble } from "../components/modals";

const PAGE_SIZE = 8;

export function History() {
  const { messages, toast, retryMsg, reopenMsg, prefs, go, mode } = useApp();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [producerId, setProducerId] = useState<"ALL" | number>("ALL");
  const [status, setStatus] = useState<"ALL" | MsgStatus>("ALL");
  const [shift, setShift] = useState<"ALL" | "AM" | "PM">("ALL");
  const [page, setPage] = useState(1);
  const [viewRow, setViewRow] = useState<HistoryApiRow | null>(null);

  // ── live mode data ───────────────────────────────────────────────────────
  const [liveRows, setLiveRows] = useState<HistoryApiRow[] | null>(null);
  const [liveTotal, setLiveTotal] = useState(0);
  const [liveCounts, setLiveCounts] = useState<Record<MsgStatus, number> | null>(null);
  const [producers, setProducers] = useState<Array<{ id: number; code: string; name: string }> | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    if (!producers) void api.fetchProducers().then((p) => { if (!cancelled && p) setProducers(p); });
    return () => { cancelled = true; };
  }, [mode, producers]);

  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    setLiveLoading(true);
    void Promise.all([
      api.fetchHistory({ from: from || undefined, to: to || undefined, status, shift, producerId, page, limit: PAGE_SIZE }),
      api.fetchHistoryCounts(from || undefined, to || undefined),
    ]).then(([h, c]) => {
      if (cancelled) return;
      if (h) { setLiveRows(h.rows); setLiveTotal(h.total); }
      if (c) setLiveCounts(c);
      setLiveLoading(false);
    });
    return () => { cancelled = true; };
  }, [mode, from, to, status, shift, producerId, page]);

  // ── demo mode data (local store) ────────────────────────────────────────
  const demoAll = useMemo<HistoryApiRow[]>(() => {
    if (mode === "live") return [];
    return Object.values(messages)
      .map((m): HistoryApiRow => {
        const [date, pid, sh] = m.collectionId.split("|");
        const p = producerById.get(Number(pid));
        return {
          id: m.id,
          collectionId: m.collectionId,
          producerName: p?.name ?? `Producer #${pid}`,
          producerCode: p?.code ?? "—",
          phone: m.phone,
          date,
          shift: sh as "AM" | "PM",
          message: m.message,
          status: m.status,
          openedAt: m.openedAt,
          sentAt: m.sentAt,
          failedAt: m.failedAt,
          error: m.error,
          updatedAt: m.updatedAt,
        };
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [messages, mode]);

  const demoFiltered = useMemo(() => {
    return demoAll.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (producerId !== "ALL" && Number(r.collectionId.split("|")[1]) !== producerId) return false;
      if (status !== "ALL" && r.status !== status) return false;
      if (shift !== "ALL" && r.shift !== shift) return false;
      return true;
    });
  }, [demoAll, from, to, producerId, status, shift]);

  // ── unified view state ──────────────────────────────────────────────────
  const isLive = mode === "live";
  const rowsShown: HistoryApiRow[] = isLive ? (liveRows ?? []) : demoFiltered;
  const total = isLive ? liveTotal : demoFiltered.length;
  const pages = isLive ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : Math.max(1, Math.ceil(demoFiltered.length / PAGE_SIZE));
  const safePage = isLive ? page : Math.min(page, pages);
  const pageRows = isLive ? rowsShown : demoFiltered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = useMemo<Record<MsgStatus, number>>(() => {
    if (isLive && liveCounts) return liveCounts;
    const c: Record<MsgStatus, number> = { pending: 0, opened: 0, sent: 0, failed: 0, skipped: 0 };
    for (const r of demoAll) c[r.status]++;
    return c;
  }, [isLive, liveCounts, demoAll]);

  const producerOptions = isLive
    ? (producers ?? []).map((p) => ({ id: p.id, label: p.name }))
    : PRODUCERS.map((p) => ({ id: p.id, label: p.name }));

  const openChat = (r: HistoryApiRow) => {
    reopenMsg(r.collectionId);
    window.open(waLink(r.phone, prefs.countryCode, r.message), "_blank", "noopener");
    toast("info", `WhatsApp reopened for ${r.producerName}`);
  };

  return (
    <div className="space-y-4">
      {/* summary chips */}
      <div className="anim-fade-up grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(Object.keys(STATUS_META) as MsgStatus[]).map((s, i) => (
          <button key={s} onClick={() => { setStatus(status === s ? "ALL" : s); setPage(1); }}
            className={cn("anim-fade-up rounded-xl border bg-white p-3 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5", status === s ? "border-pine-500 ring-2 ring-pine-200" : "border-stone-200/80")}
            style={{ animationDelay: `${i * 50}ms` }}>
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[s].dot)} /> {STATUS_META[s].label}
            </span>
            <span className="font-display mt-1 block text-xl font-extrabold text-ink tnum">{liveLoading && isLive && !liveCounts ? "…" : counts[s]}</span>
          </button>
        ))}
      </div>

      {/* filters */}
      <div className="anim-fade-up flex flex-wrap items-center gap-2.5 rounded-xl border border-stone-200/80 bg-white p-3.5 shadow-card" style={{ animationDelay: "80ms" }}>
        <label className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">From
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-stone-200 px-2 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none tnum" />
        </label>
        <label className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">To
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-stone-200 px-2 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none tnum" />
        </label>
        <select value={producerId} onChange={(e) => { setProducerId(e.target.value === "ALL" ? "ALL" : Number(e.target.value)); setPage(1); }}
          className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none">
          <option value="ALL">All producers</option>
          {producerOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={shift} onChange={(e) => { setShift(e.target.value as "ALL" | "AM" | "PM"); setPage(1); }}
          className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none">
          <option value="ALL">Both shifts</option><option value="AM">AM</option><option value="PM">PM</option>
        </select>
        <Btn variant="ghost" size="sm" icon="refresh" onClick={() => { setFrom(""); setTo(""); setProducerId("ALL"); setStatus("ALL"); setShift("ALL"); setPage(1); }}>Reset</Btn>
        <span className="ml-auto text-xs font-bold text-ink-soft tnum">
          {isLive && liveLoading ? "Querying MySQL…" : `${total} records${isLive ? " · MySQL" : " · local"}`}
        </span>
      </div>

      {/* table */}
      {pageRows.length === 0 && !liveLoading ? (
        <EmptyState icon="history" title={total === 0 && !isLive && demoAll.length === 0 ? "No messages tracked yet" : "Nothing matches these filters"}
          desc={total === 0 && !isLive && demoAll.length === 0 ? "Open WhatsApp chats from the Sender — every open, send, failure and skip lands here with timestamps." : "Loosen the date range or clear the filters to see more."}
          action={total === 0 && !isLive && demoAll.length === 0 ? <Btn variant="wapp" icon="whatsapp" onClick={() => go("sender")}>Open WhatsApp Sender</Btn> : undefined} />
      ) : (
        <div className="anim-fade-up overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-card" style={{ animationDelay: "140ms" }}>
          <div className={cn("overflow-x-auto transition-opacity duration-200", liveLoading && "opacity-50 pointer-events-none")}>
            <table className="w-full min-w-[880px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-3 py-3 font-bold">Producer</th>
                  <th className="px-3 py-3 font-bold">Phone</th>
                  <th className="px-3 py-3 font-bold">Message</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 font-bold">Opened</th>
                  <th className="px-3 py-3 font-bold">Sent</th>
                  <th className="px-3 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pageRows.map((r) => (
                  <tr key={r.id} className="group transition-colors hover:bg-pine-50/50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-ink tnum">{fmtDate(r.date)}</p>
                      <ShiftChip shift={r.shift} />
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={r.producerName} size={30} />
                        <span>
                          <span className="block font-bold text-ink">{r.producerName}</span>
                          <span className="block text-[11px] text-ink-soft">{r.producerCode}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-soft tnum">{r.phone}</td>
                    <td className="max-w-[260px] px-3 py-3">
                      <button className="w-full truncate text-left text-xs text-ink-soft transition-colors hover:text-pine-700" onClick={() => setViewRow(r)} title="View full message">
                        {r.message.replace(/\n/g, " · ")}
                      </button>
                      {r.error && <p className="mt-0.5 truncate text-[10.5px] font-semibold text-danger">{r.error}</p>}
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} size="sm" /></td>
                    <td className="px-3 py-3 text-xs text-ink-soft tnum">{r.openedAt ? fmtTime(r.openedAt) : "—"}</td>
                    <td className="px-3 py-3 text-xs font-semibold text-wapp-700 tnum">{r.sentAt ? fmtTime(r.sentAt) : "—"}</td>
                    <td className="px-3 py-3">
                      <span className="flex items-center justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                        <button className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-pine-50 hover:text-pine-700" title="View" onClick={() => setViewRow(r)}><Icon name="eye" size={15} /></button>
                        <button className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-pine-50 hover:text-pine-700" title="Copy message" onClick={async () => { (await copyText(r.message)) ? toast("success", "Message copied") : toast("error", "Copy failed"); }}><Icon name="copy" size={15} /></button>
                        <button className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-red-50 hover:text-danger disabled:opacity-30" title="Retry (reset to Pending)" disabled={r.status !== "failed"} onClick={() => { retryMsg(r.collectionId); toast("info", `${r.producerName} reset to Pending`); }}><Icon name="refresh" size={15} /></button>
                        <button className="rounded-lg p-1.5 text-wapp-600 transition-colors hover:bg-wapp-50" title="Open WhatsApp" onClick={() => openChat(r)}><Icon name="whatsapp" size={15} /></button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-stone-100 px-3 pb-3">
            <Pagination page={safePage} pages={pages} onPage={setPage} shown={pageRows.length} total={total} />
          </div>
        </div>
      )}

      {/* view modal */}
      <Modal open={viewRow !== null} onClose={() => setViewRow(null)} title={viewRow?.producerName ?? ""} subtitle={viewRow ? `${viewRow.producerCode} · ${fmtDate(viewRow.date)} · ${viewRow.shift} shift · +${prefs.countryCode} ${viewRow.phone}` : undefined} width="max-w-xl"
        footer={viewRow ? (
          <>
            <Btn variant="ghost" icon="copy" onClick={async () => { (await copyText(viewRow.message)) ? toast("success", "Message copied") : toast("error", "Copy failed"); }}>Copy</Btn>
            <Btn variant="wapp" icon="whatsapp" onClick={() => { openChat(viewRow); }}>Open WhatsApp</Btn>
          </>
        ) : undefined}>
        {viewRow && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <StatusBadge status={viewRow.status} />
              <p className="text-[11px] text-ink-soft tnum">
                {viewRow.openedAt && `Opened ${fmtTime(viewRow.openedAt)} · `}{viewRow.sentAt && `Sent ${fmtTime(viewRow.sentAt)}`}
              </p>
            </div>
            <WaBubble text={viewRow.message} />
          </>
        )}
      </Modal>
    </div>
  );
}
