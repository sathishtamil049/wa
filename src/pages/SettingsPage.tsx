import { useState } from "react";
import { useApp } from "../lib/store";
import type { Prefs } from "../lib/store";
import { cn } from "../lib/utils";
import { Icon } from "../components/icons";
import { Btn, ConfirmModal } from "../components/ui";

export function SettingsPage() {
  const { prefs, savePrefs, toast, clearMessages, messages, go } = useApp();
  const [form, setForm] = useState<Prefs>(prefs);
  const [confirmClear, setConfirmClear] = useState(false);

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(prefs);
  const msgCount = Object.keys(messages).length;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        {/* centre profile */}
        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card">
          <h3 className="font-display text-base font-extrabold text-ink">Centre profile</h3>
          <p className="text-xs text-ink-soft">Shown on reports and used to personalise defaults</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-ink-soft">Dairy / centre name
              <input value={form.centerName} onChange={(e) => set("centerName", e.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-100" />
            </label>
            <label className="text-xs font-bold text-ink-soft">Administrator name
              <input value={form.adminName} onChange={(e) => set("adminName", e.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-100" />
            </label>
            <label className="text-xs font-bold text-ink-soft">WhatsApp country code
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-soft">+</span>
                <input value={form.countryCode} onChange={(e) => set("countryCode", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric"
                  className="h-10 w-full rounded-lg border border-stone-200 bg-white pl-7 pr-3 text-sm font-semibold text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-100 tnum" />
              </div>
              <span className="mt-1 block text-[10.5px] font-medium text-ink-soft/80">Producer numbers are appended to this code in wa.me links</span>
            </label>
            <label className="text-xs font-bold text-ink-soft">Default shift filter (Sender)
              <select value={form.defaultShift} onChange={(e) => set("defaultShift", e.target.value as Prefs["defaultShift"])}
                className="mt-1 block h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-ink focus:border-pine-500 focus:outline-none">
                <option value="ALL">Both shifts</option><option value="AM">AM only</option><option value="PM">PM only</option>
              </select>
            </label>
          </div>
        </div>

        {/* sending behaviour */}
        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card" style={{ animationDelay: "80ms" }}>
          <h3 className="font-display text-base font-extrabold text-ink">Bulk sending behaviour</h3>
          <p className="text-xs text-ink-soft">Applies to the guided queue in WhatsApp Sender</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-ink-soft">Pause between producers
              <div className="relative mt-1">
                <input type="number" min={200} max={5000} step={100} value={form.bulkDelay}
                  onChange={(e) => set("bulkDelay", Math.max(200, Math.min(5000, Number(e.target.value) || 0)))}
                  className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 pr-14 text-sm font-semibold text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-100 tnum" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-soft">ms</span>
              </div>
              <span className="mt-1 block text-[10.5px] font-medium text-ink-soft/80">A human-paced pause keeps sending comfortable and safe</span>
            </label>
            <div className="rounded-lg border border-stone-200 bg-paper/50 px-3.5 py-3">
              <button onClick={() => set("confirmBulk", !form.confirmBulk)} className="flex w-full items-center gap-3 text-left">
                <span className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200", form.confirmBulk ? "bg-pine-600" : "bg-stone-300")}>
                  <span className={cn("inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform duration-200", form.confirmBulk ? "translate-x-[22px]" : "translate-x-[3px]")} />
                </span>
                <span>
                  <span className="block text-[13px] font-bold text-ink">Confirmation before bulk send</span>
                  <span className="block text-[11px] text-ink-soft">Show the producer list before the queue starts</span>
                </span>
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-stone-100 pt-4">
            <Btn variant="primary" icon="check" disabled={!dirty} onClick={() => { savePrefs(form); toast("success", "Settings saved"); }}>Save settings</Btn>
            <Btn variant="ghost" disabled={!dirty} onClick={() => { setForm(prefs); toast("info", "Changes discarded"); }}>Discard</Btn>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* data card */}
        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card" style={{ animationDelay: "120ms" }}>
          <h3 className="font-display text-base font-extrabold text-ink">Local message store</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            WhatsApp message statuses are tracked in a local <code className="rounded bg-stone-100 px-1 font-mono text-[10.5px]">whatsapp_messages</code> table
            ({msgCount} record{msgCount === 1 ? "" : "s"}), one per producer per collection entry — duplicates are prevented by the collection id key.
          </p>
          <div className="mt-3 space-y-1.5 rounded-lg bg-paper/60 p-3 font-mono text-[10.5px] leading-relaxed text-ink-soft ring-1 ring-stone-100">
            <p>id · producer_id · collection_id</p>
            <p>phone · message · status</p>
            <p>opened_at · sent_at · failed_at</p>
            <p>error_message · created_at · updated_at</p>
          </div>
          <Btn variant="danger" size="sm" icon="alert" className="mt-4 w-full" onClick={() => setConfirmClear(true)} disabled={msgCount === 0}>
            Reset all statuses ({msgCount})
          </Btn>
        </div>

        {/* integration card */}
        <div className="anim-fade-up rounded-xl bg-pine-950 p-5 text-white shadow-lift" style={{ animationDelay: "160ms", backgroundImage: "radial-gradient(380px 200px at 100% 0%, rgb(37 211 102 / 0.18), transparent)" }}>
          <h3 className="font-display text-base font-extrabold">Database integration</h3>
          <ul className="mt-3 space-y-2 text-[12.5px] text-pine-200">
            {[
              ["users", "members — read-only, never modified"],
              ["droplet", "milk_entries — daily FAT/SNF/rate rows"],
              ["arrow-down", "advances — deduction amounts per day"],
              ["shield", "parameterised queries · no credential exposure"],
            ].map(([ic, txt]) => (
              <li key={ic} className="flex items-start gap-2.5">
                <span className="mt-0.5 text-wapp-400"><Icon name={ic as never} size={14} /></span>{txt}
              </li>
            ))}
          </ul>
          <Btn variant="wapp" size="sm" icon="message" className="mt-4" onClick={() => go("templates")}>Edit message template</Btn>
        </div>

        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card" style={{ animationDelay: "200ms" }}>
          <p className="text-[11px] leading-relaxed text-ink-soft">
            <strong className="text-ink">MilkPro WhatsApp Sender v1.4</strong> · module of the Milk Producers Management System.
            Architecture is ready to extend to the official WhatsApp Business Platform for high-volume sending.
          </p>
        </div>
      </div>

      <ConfirmModal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => { clearMessages(); toast("success", "All WhatsApp statuses were reset to Pending"); }}
        title="Reset all message statuses?"
        body={<span>This clears <strong>{msgCount}</strong> tracked WhatsApp record(s) — opened/sent/failed timestamps included. Collection data is <strong>not</strong> touched. This cannot be undone.</span>}
        confirmLabel="Yes, reset everything"
        danger
      />
    </div>
  );
}
