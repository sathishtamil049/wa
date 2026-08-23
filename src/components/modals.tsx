import { useApp } from "../lib/store";
import type { EnrichedRow } from "../lib/store";
import { copyText, fmtDate, inr, qty, waLink } from "../lib/utils";
import { lastNDates, getCollections, producerById } from "../lib/data";
import { Icon } from "./icons";
import { Btn, Modal, StatusBadge, ShiftChip, Avatar } from "./ui";

export function WaBubble({ text, time }: { text: string; time?: string }) {
  return (
    <div className="rounded-xl bg-[#efeae2] p-3 sm:p-4" style={{ backgroundImage: "radial-gradient(rgb(13 55 33 / 0.045) 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
      <div className="wa-bubble ml-2 max-w-md px-3 py-2">
        <pre className="whitespace-pre-wrap font-body text-[13px] leading-relaxed text-[#111b21]">{text}</pre>
        <span className="mt-1 flex items-center justify-end gap-1 text-[10px] font-medium text-[#667781]">
          {time ?? new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          <svg width="14" height="10" viewBox="0 0 16 11" fill="none" className="text-[#53bdeb]"><path d="M11.07.65a.5.5 0 0 0-.7 0L5.5 5.5 3.63 3.65a.5.5 0 1 0-.7.7l2.2 2.2a.5.5 0 0 0 .7 0L11.07 1.35a.5.5 0 0 0 0-.7z" fill="currentColor" /><path d="M14.57.65a.5.5 0 0 0-.7 0L9 5.5l.7.7 5.57-5.55a.5.5 0 0 0-.7-.7z" fill="currentColor" transform="translate(-1.5 0)" /></svg>
        </span>
      </div>
    </div>
  );
}

export function MessagePreviewModal({ row, open, onClose }: { row: EnrichedRow | null; open: boolean; onClose: () => void }) {
  const { messageFor, openMsg, markSent, toast, prefs } = useApp();
  if (!row) return null;
  const msg = messageFor(row);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="flex items-center gap-2">{row.producer.name} <StatusBadge status={row.msg?.status ?? "pending"} size="sm" /></span>}
      subtitle={`${row.producer.code} · ${fmtDate(row.date)} · ${row.shift} shift · ${qty(row.milkLtr)} L`}
      width="max-w-xl"
      footer={
        <>
          <Btn variant="ghost" icon="copy" onClick={async () => { (await copyText(msg)) ? toast("success", "Message copied to clipboard") : toast("error", "Copy failed"); }}>
            Copy
          </Btn>
          <Btn variant="outline" icon="check" onClick={() => { markSent(row.id); toast("success", `Marked ${row.producer.name} as Sent`); onClose(); }}>
            Mark Sent
          </Btn>
          <Btn
            variant="wapp"
            icon="whatsapp"
            onClick={() => {
              const rec = openMsg(row);
              window.open(waLink(row.producer.phone, prefs.countryCode, rec.message), "_blank", "noopener");
              toast("info", `WhatsApp opened for ${row.producer.name}`);
            }}
          >
            Open WhatsApp
          </Btn>
        </>
      }
    >
      <div className="flex items-center gap-3 pb-3">
        <Avatar name={row.producer.name} size={40} />
        <div>
          <p className="text-sm font-bold text-ink">{row.producer.name}</p>
          <p className="text-xs text-ink-soft tnum">+{prefs.countryCode} {row.producer.phone}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="font-display text-lg font-extrabold text-pine-700 tnum">{inr(row.net)}</p>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">Net payable</p>
        </div>
      </div>
      <WaBubble text={msg} />
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-soft">
        <Icon name="shield" size={13} className="text-pine-600" />
        Opens a pre-filled chat in WhatsApp Web — you press Send yourself.
      </p>
    </Modal>
  );
}

export function ProducerModal({ producerId, open, onClose }: { producerId: number | null; open: boolean; onClose: () => void }) {
  const { date } = useApp();
  if (producerId === null) return null;
  const p = producerById.get(producerId)!;
  const dates = lastNDates(7, date);
  const week: Array<{ date: string; shift: string; ltr: number; amt: number }> = [];
  for (const d of dates) {
    for (const c of getCollections(d)) {
      if (c.producerId === producerId) week.push({ date: d, shift: c.shift, ltr: c.milkLtr, amt: c.amount });
    }
  }
  const totalLtr = week.reduce((s, w) => s + w.ltr, 0);
  const totalAmt = week.reduce((s, w) => s + w.amt, 0);

  return (
    <Modal open={open} onClose={onClose} title={p.name} subtitle={`Producer profile · member since ${fmtDate(p.joined)}`} width="max-w-xl">
      <div className="flex items-center gap-3">
        <Avatar name={p.name} size={52} />
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          {[
            ["Code", p.code],
            ["Phone", `+91 ${p.phone}`],
            ["Village", p.village],
            ["Animal", p.animal],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{k}</p>
              <p className="text-[13px] font-semibold text-ink">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-pine-50 p-3.5 ring-1 ring-pine-100">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-pine-600">7-day milk</p>
          <p className="font-display text-xl font-extrabold text-pine-800 tnum">{totalLtr.toFixed(1)} L</p>
        </div>
        <div className="rounded-xl bg-wapp-50 p-3.5 ring-1 ring-wapp-100">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-wapp-700">7-day amount</p>
          <p className="font-display text-xl font-extrabold text-wapp-700 tnum">{inr(totalAmt)}</p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-stone-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-stone-50 text-[10.5px] uppercase tracking-wider text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-bold">Date</th>
              <th className="px-3 py-2 font-bold">Shift</th>
              <th className="px-3 py-2 text-right font-bold">Milk Ltr</th>
              <th className="px-3 py-2 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {week.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-soft">No entries in the last 7 days</td></tr>
            )}
            {[...week].reverse().map((w, i) => (
              <tr key={i} className="transition-colors hover:bg-pine-50/50">
                <td className="px-3 py-2 font-semibold text-ink tnum">{fmtDate(w.date)}</td>
                <td className="px-3 py-2"><ShiftChip shift={w.shift as "AM" | "PM"} /></td>
                <td className="px-3 py-2 text-right font-semibold tnum">{w.ltr.toFixed(1)}</td>
                <td className="px-3 py-2 text-right font-semibold tnum">{inr(w.amt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
