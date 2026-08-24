import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import type { EnrichedRow } from "../lib/store";
import { getCollections, lastNDates, producerById, toISO } from "../lib/data";
import type { MsgStatus } from "../lib/data";
import { cn, fmtDate, inr, STATUS_META } from "../lib/utils";
import * as api from "../lib/api";
import { EXPORT_FIELDS, exportRowsToXlsx } from "../lib/excel";
import type { ExportFieldKey } from "../lib/excel";
import { Icon } from "../components/icons";
import { Btn, ShiftChip, StatusBadge } from "../components/ui";

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${`${d.getDate()}`.padStart(2, "0")}`;
}

export function ExportPage() {
  const { date, messages, messageFor, toast, mode } = useApp();
  const [from, setFrom] = useState(isoAddDays(date, -6));
  const [to, setTo] = useState(date);
  const [shift, setShift] = useState<"ALL" | "AM" | "PM">("ALL");
  const [status, setStatus] = useState<"ALL" | MsgStatus>("ALL");
  const [fields, setFields] = useState<Set<ExportFieldKey>>(new Set(EXPORT_FIELDS.map((f) => f.key)));
  const [exporting, setExporting] = useState(false);
  const [liveRows, setLiveRows] = useState<EnrichedRow[] | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  const dateList = useMemo(() => {
    if (!from || !to || from > to) return [] as string[];
    return lastNDates(Math.min(61, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1), to)
      .filter((d) => d >= from && d <= to);
  }, [from, to]);
  const rangeKey = dateList.join(",");
  const tooWide = mode === "live" && dateList.length > 31;

  useEffect(() => {
    if (mode !== "live") return;
    if (tooWide || dateList.length === 0) { setLiveRows(dateList.length === 0 ? [] : null); return; }
    let cancelled = false;
    setLiveLoading(true);
    void Promise.all(dateList.map((d) => api.fetchCollection(d))).then((results) => {
      if (cancelled) return;
      const out: EnrichedRow[] = [];
      for (const r of results) if (r) out.push(...r);
      out.sort((a, b) => (a.date === b.date ? a.producer.name.localeCompare(b.producer.name) : a.date < b.date ? 1 : -1));
      setLiveRows(out);
      setLiveLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, rangeKey, tooWide]);

  const rows = useMemo<EnrichedRow[]>(() => {
    if (mode === "live") {
      if (!liveRows) return [];
      return liveRows.filter(
        (r) => (shift === "ALL" || r.shift === shift) && (status === "ALL" || (r.msg?.status ?? "pending") === status),
      );
    }
    const out: EnrichedRow[] = [];
    for (const d of dateList) {
      for (const c of getCollections(d)) {
        if (shift !== "ALL" && c.shift !== shift) continue;
        const msg = messages[c.id];
        if (status !== "ALL" && (msg?.status ?? "pending") !== status) continue;
        out.push({ ...c, producer: producerById.get(c.producerId)!, msg });
      }
    }
    return out;
  }, [mode, liveRows, dateList, shift, status, messages]);

  const toggleField = (k: ExportFieldKey) => setFields((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const orderedFields = EXPORT_FIELDS.filter((f) => fields.has(f.key)).map((f) => f.key);

  const doExport = () => {
    if (rows.length === 0 || orderedFields.length === 0) { toast("error", "Nothing to export — adjust filters or fields"); return; }
    setExporting(true);
    window.setTimeout(() => {
      try {
        exportRowsToXlsx(rows, orderedFields, `milk-collection_${from}_to_${to}`, messageFor);
        toast("success", `Exported ${rows.length} rows × ${orderedFields.length} columns to .xlsx`);
      } catch {
        toast("error", "Export failed — please try again");
      } finally {
        setExporting(false);
      }
    }, 450);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        {/* range + filters */}
        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card">
          <h3 className="font-display text-base font-extrabold text-ink">Export range</h3>
          <p className="text-xs text-ink-soft">Pulls read-only collection rows for every date in the range</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-bold text-ink-soft">From
              <input type="date" value={from} max={toISO(new Date())} onChange={(e) => e.target.value && setFrom(e.target.value)}
                className="mt-1 block h-9.5 w-40 rounded-lg border border-stone-200 px-2.5 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none tnum" />
            </label>
            <label className="text-xs font-bold text-ink-soft">To
              <input type="date" value={to} max={toISO(new Date())} onChange={(e) => e.target.value && setTo(e.target.value)}
                className="mt-1 block h-9.5 w-40 rounded-lg border border-stone-200 px-2.5 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none tnum" />
            </label>
            <label className="text-xs font-bold text-ink-soft">Shift
              <select value={shift} onChange={(e) => setShift(e.target.value as "ALL" | "AM" | "PM")}
                className="mt-1 block h-9.5 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none">
                <option value="ALL">Both</option><option value="AM">AM</option><option value="PM">PM</option>
              </select>
            </label>
            <label className="text-xs font-bold text-ink-soft">WhatsApp status
              <select value={status} onChange={(e) => setStatus(e.target.value as "ALL" | MsgStatus)}
                className="mt-1 block h-9.5 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none">
                <option value="ALL">Any</option>
                {(Object.keys(STATUS_META) as MsgStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-pine-50/70 px-4 py-3 ring-1 ring-pine-100">
            <Icon name="sheet" size={17} className="text-pine-700" />
            <p className="text-[13px] font-bold text-pine-900 tnum">
              {rows.length} rows ready · {orderedFields.length} columns
            </p>
            <Btn variant="primary" icon="download" className="ml-auto" onClick={doExport} disabled={exporting || rows.length === 0}>
              {exporting ? "Generating…" : "Download .xlsx"}
            </Btn>
          </div>
        </div>

        {/* preview */}
        <div className="anim-fade-up overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-card" style={{ animationDelay: "90ms" }}>
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <h3 className="font-display text-sm font-extrabold text-ink">Preview · first 5 rows</h3>
            <span className="text-[11px] font-bold text-ink-soft tnum">{from} → {to}</span>
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-soft">
              {tooWide ? "Live export supports ranges up to 31 days — narrow the dates to continue."
                : liveLoading ? "Querying MySQL for this range…"
                : "No rows in this range — widen the dates or clear the status filter."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead>
                  <tr className="bg-stone-50/80 text-[10px] uppercase tracking-wider text-ink-soft">
                    <th className="px-3 py-2 font-bold">Date</th><th className="px-3 py-2 font-bold">Producer</th><th className="px-3 py-2 font-bold">Shift</th>
                    <th className="px-3 py-2 text-right font-bold">Milk</th><th className="px-3 py-2 text-right font-bold">Rate</th><th className="px-3 py-2 text-right font-bold">Net</th><th className="px-3 py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.slice(0, 5).map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-pine-50/40">
                      <td className="px-3 py-2 font-semibold tnum">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2 font-bold text-ink">{r.producer.name} <span className="text-[10px] text-pine-600">{r.producer.code}</span></td>
                      <td className="px-3 py-2"><ShiftChip shift={r.shift} /></td>
                      <td className="px-3 py-2 text-right font-semibold tnum">{r.milkLtr.toFixed(1)} L</td>
                      <td className="px-3 py-2 text-right tnum">₹{r.rate.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-bold text-pine-800 tnum">{inr(r.net)}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.msg?.status ?? "pending"} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* field picker */}
      <div className="anim-fade-up h-fit rounded-xl border border-stone-200/80 bg-white p-5 shadow-card" style={{ animationDelay: "150ms" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-extrabold text-ink">Columns</h3>
            <p className="text-xs text-ink-soft">Choose what lands in the sheet</p>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setFields(new Set(EXPORT_FIELDS.map((f) => f.key)))} className="rounded-md px-2 py-1 text-[11px] font-bold text-pine-700 hover:bg-pine-50">All</button>
            <button onClick={() => setFields(new Set(["code", "name", "phone", "date", "shift", "milkLtr", "net"]))} className="rounded-md px-2 py-1 text-[11px] font-bold text-ink-soft hover:bg-stone-100">Minimal</button>
          </div>
        </div>
        <ul className="mt-3 space-y-1">
          {EXPORT_FIELDS.map((f, i) => {
            const on = fields.has(f.key);
            return (
              <li key={f.key}>
                <button onClick={() => toggleField(f.key)}
                  className={cn("anim-fade-up flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-all", on ? "bg-pine-50 text-pine-900 ring-1 ring-pine-100" : "text-ink-soft hover:bg-stone-50")}
                  style={{ animationDelay: `${i * 25}ms` }}>
                  <span className={cn("inline-flex h-4.5 w-4.5 items-center justify-center rounded border transition-colors", on ? "border-pine-600 bg-pine-600 text-white" : "border-stone-300 bg-white")}>
                    {on && <Icon name="check" size={11} strokeWidth={3} />}
                  </span>
                  {f.label}
                  {(f.key === "message" || f.key === "status") && <span className="ml-auto rounded bg-wapp-50 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-wapp-700">WhatsApp</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft ring-1 ring-stone-100">
          <Icon name="info" size={12} className="mr-1 inline text-pine-600" />
          Export never writes back to the milk database — collection records and advance accounting stay untouched.
        </p>
      </div>
    </div>
  );
}
