import { useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { DEFAULT_TEMPLATE, TEMPLATE_VARS } from "../lib/data";
import { copyText, renderTemplate, inrPlain, qty, fmtDate } from "../lib/utils";
import { Icon } from "../components/icons";
import { Btn } from "../components/ui";
import { WaBubble } from "../components/modals";
import { cn } from "../lib/utils";

export function Templates() {
  const { template, saveTemplate, toast, rows, date } = useApp();
  const [draft, setDraft] = useState(template);
  const [sampleId, setSampleId] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const uniqueProducers = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of rows) if (!seen.has(r.producerId)) seen.set(r.producerId, r.producer.name);
    return [...seen.entries()];
  }, [rows]);

  const sampleRow = useMemo(() => {
    if (sampleId !== null) {
      const hit = rows.find((r) => r.producerId === sampleId);
      if (hit) return hit;
    }
    return rows[0] ?? null;
  }, [rows, sampleId]);

  const preview = useMemo(() => (sampleRow ? renderTemplate(draft, sampleRow) : ""), [draft, sampleRow]);

  const insertVar = (v: string) => {
    const ta = taRef.current;
    if (!ta) { setDraft((d) => d + v); return; }
    const start = ta.selectionStart ?? draft.length;
    const end = ta.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + v + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + v.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const sampleValues: Array<[string, string]> = sampleRow
    ? [
        ["{producer_name}", sampleRow.producer.name],
        ["{producer_id}", sampleRow.producer.code],
        ["{date}", fmtDate(sampleRow.date)],
        ["{shift}", sampleRow.shift === "AM" ? "Morning (AM)" : "Evening (PM)"],
        ["{milk_ltr}", qty(sampleRow.milkLtr)],
        ["{fat}", qty(sampleRow.fat)],
        ["{snf}", qty(sampleRow.snf)],
        ["{rate_per_ltr}", inrPlain(sampleRow.rate)],
        ["{milk_amount}", inrPlain(sampleRow.amount)],
        ["{advance_deduction}", inrPlain(sampleRow.advance)],
        ["{net_payable}", inrPlain(sampleRow.net)],
      ]
    : [];

  const dirty = draft !== template;

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {/* editor */}
      <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card xl:col-span-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-extrabold text-ink">Message template</h3>
            <p className="text-xs text-ink-soft">Used for every producer message · click a variable to insert it at the cursor</p>
          </div>
          <span className={cn("rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide ring-1", dirty ? "bg-amber-50 text-amberish ring-amber-200" : "bg-pine-50 text-pine-700 ring-pine-200")}>
            {dirty ? "Unsaved changes" : "Saved"}
          </span>
        </div>

        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={15}
          spellCheck={false}
          className="mt-4 w-full resize-y rounded-xl border border-stone-200 bg-paper/50 p-4 font-mono text-[13px] leading-relaxed text-ink transition-colors focus:border-pine-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pine-100"
          aria-label="Message template"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-soft">
          <span className="tnum">{draft.length} characters · ~{Math.ceil(draft.length / 160)} SMS segment(s) if mirrored by SMS</span>
          <span className="tnum">{date}</span>
        </div>

        <p className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Available variables</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TEMPLATE_VARS.map((v) => (
            <button key={v} onClick={() => insertVar(v)}
              className="group inline-flex items-center gap-1 rounded-lg border border-pine-200 bg-pine-50 px-2 py-1 font-mono text-[11.5px] font-semibold text-pine-800 transition-all duration-150 hover:border-pine-400 hover:bg-pine-100 active:scale-95">
              <Icon name="pencil" size={11} className="opacity-0 transition-opacity group-hover:opacity-60" />
              {v}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
          <Btn variant="primary" icon="check" disabled={!dirty} onClick={() => { saveTemplate(draft); toast("success", "Template saved — new messages will use it"); }}>Save template</Btn>
          <Btn variant="outline" icon="refresh" disabled={!dirty} onClick={() => { setDraft(template); toast("info", "Reverted to last saved template"); }}>Reset</Btn>
          <Btn variant="ghost" icon="history" onClick={() => { setDraft(DEFAULT_TEMPLATE); toast("info", "Default template restored — press Save to keep it"); }}>Restore default</Btn>
          <Btn variant="ghost" icon="copy" className="ml-auto" onClick={async () => { (await copyText(draft)) ? toast("success", "Template copied") : toast("error", "Copy failed"); }}>Copy</Btn>
        </div>
      </div>

      {/* preview + reference */}
      <div className="space-y-4 xl:col-span-2">
        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-extrabold text-ink">Live preview</h3>
              <p className="text-xs text-ink-soft">Rendered exactly as the producer receives it</p>
            </div>
            <select value={sampleId ?? ""} onChange={(e) => setSampleId(e.target.value === "" ? null : Number(e.target.value))}
              className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-xs font-bold text-ink focus:border-pine-500 focus:outline-none">
              <option value="">Sample: first producer</option>
              {uniqueProducers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          {sampleRow ? (
            <>
              <div className="mt-3"><WaBubble text={preview} /></div>
              <div className="mt-3 flex gap-2">
                <Btn variant="outline" size="sm" icon="copy" onClick={async () => { (await copyText(preview)) ? toast("success", "Preview copied") : toast("error", "Copy failed"); }}>Copy preview</Btn>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft"><Icon name="user" size={13} className="text-pine-600" />{sampleRow.producer.name} · {sampleRow.producer.code} · {fmtDate(sampleRow.date)} {sampleRow.shift}</span>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-ink-soft">No collection rows for this date.</p>
          )}
        </div>

        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card" style={{ animationDelay: "140ms" }}>
          <h3 className="font-display text-base font-extrabold text-ink">Variable reference</h3>
          <p className="text-xs text-ink-soft">Sample values from {sampleRow ? `${sampleRow.producer.name}'s ${sampleRow.shift} entry` : "today"}</p>
          <ul className="mt-3 divide-y divide-stone-100">
            {sampleValues.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <code className="rounded bg-pine-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-pine-800">{k}</code>
                <span className="truncate font-semibold text-ink tnum">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
