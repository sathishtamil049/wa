import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import type { ProducerFull } from "../lib/store";
import type { ProducerInput } from "../lib/api";
import { cn, inr, qty, waLink } from "../lib/utils";
import { Icon } from "../components/icons";
import { Btn, IconBtn, EmptyState, Avatar, Modal, ConfirmModal } from "../components/ui";

const emptyForm = { name: "", code: "", phone: "", village: "", animal: "Mixed" as "Buffalo" | "Cow" | "Mixed" };
type FormT = typeof emptyForm;

export function Producers() {
  const { producers, rows, addProducer, updateProducer, removeProducer, toggleProducer, toast, openMsg, prefs, mode, date } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "active" | "inactive">("ALL");
  const [form, setForm] = useState<FormT | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormT, string>>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<ProducerFull | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const todayStats = useMemo(() => {
    const per = new Map<number, { ltr: number; entries: number; net: number }>();
    for (const r of rows) {
      const s = per.get(r.producerId) ?? { ltr: 0, entries: 0, net: 0 };
      s.ltr += r.milkLtr; s.entries += 1; s.net += r.net;
      per.set(r.producerId, s);
    }
    return per;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return producers.filter((p) => {
      if (filter !== "ALL" && p.status !== filter) return false;
      if (q && !`${p.name} ${p.code} ${p.phone} ${p.village}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [producers, search, filter]);

  const counts = useMemo(() => ({
    total: producers.length,
    active: producers.filter((p) => p.status === "active").length,
    inactive: producers.filter((p) => p.status === "inactive").length,
    collecting: todayStats.size,
  }), [producers, todayStats]);

  const nextCode = useMemo(() => {
    const max = producers.reduce((m, p) => {
      const n = parseInt(p.code.replace(/\D/g, ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    return `MP-${String(max + 1).padStart(3, "0")}`;
  }, [producers]);

  const validate = (f: FormT): Partial<Record<keyof FormT, string>> => {
    const e: Partial<Record<keyof FormT, string>> = {};
    if (f.name.trim().length < 2) e.name = "Name needs at least 2 characters";
    if (!/^[A-Za-z0-9-]{2,20}$/.test(f.code.trim())) e.code = "2–20 letters/digits, e.g. MP-027";
    if (!/^\d{10,13}$/.test(f.phone.trim())) e.phone = "Enter 10–13 digits, no spaces";
    const dupCode = producers.find((p) => p.code.toLowerCase() === f.code.trim().toLowerCase() && p.id !== editId);
    if (!e.code && dupCode) e.code = `${dupCode.name} already uses ${dupCode.code}`;
    const dupPhone = producers.find((p) => p.phone === f.phone.trim() && p.id !== editId);
    if (!e.phone && dupPhone) e.phone = `${dupPhone.name} is registered with this number`;
    return e;
  };

  const openAdd = () => { setEditId(null); setForm({ ...emptyForm, code: nextCode }); setErrors({}); };
  const openEdit = (p: ProducerFull) => { setEditId(p.id); setForm({ name: p.name, code: p.code, phone: p.phone, village: p.village === "—" ? "" : p.village, animal: p.animal }); setErrors({}); };

  const submit = async () => {
    if (!form) return;
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const payload: ProducerInput = { name: form.name.trim(), code: form.code.trim().toUpperCase(), phone: form.phone.trim(), village: form.village.trim() || null, animal: form.animal };
    const err = editId ? await updateProducer(editId, payload) : await addProducer(payload);
    setSaving(false);
    if (err) { toast("error", err); return; }
    toast("success", editId ? `${payload.name} updated${mode === "live" ? " in MySQL" : ""}` : `${payload.name} added to the register${mode === "live" ? " (saved to MySQL)" : ""}`);
    setForm(null);
  };

  const quickWhatsApp = (p: ProducerFull) => {
    const todays = rows.filter((r) => r.producerId === p.id);
    const row = todays[0];
    if (row) {
      const rec = openMsg(row);
      window.open(waLink(p.phone, prefs.countryCode, rec.message), "_blank", "noopener");
    } else {
      window.open(waLink(p.phone, prefs.countryCode, `Hello ${p.name}, greetings from ${prefs.centerName}.`), "_blank", "noopener");
    }
    toast("info", `WhatsApp opened for ${p.name}`);
  };

  const doDelete = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    const err = await removeProducer(toDelete.id);
    setBusyId(null);
    if (err) { toast("error", err); return; }
    toast("success", `${toDelete.name} archived — history and accounts stay intact`);
  };

  const statTiles = [
    { label: "Registered", value: counts.total, icon: "users" as const, cls: "text-pine-700 bg-pine-100" },
    { label: "Active", value: counts.active, icon: "check-circle" as const, cls: "text-wapp-700 bg-wapp-100" },
    { label: "Archived", value: counts.inactive, icon: "archive" as const, cls: "text-amberish bg-amber-100" },
    { label: "Collecting today", value: counts.collecting, icon: "droplet" as const, cls: "text-sky-700 bg-sky-100" },
  ];

  return (
    <div className="space-y-4">
      {/* stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statTiles.map((s, i) => (
          <div key={s.label} className="anim-fade-up flex items-center gap-3 rounded-xl border border-stone-200/80 bg-white p-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift" style={{ animationDelay: `${i * 55}ms` }}>
            <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", s.cls)}><Icon name={s.icon} size={17} /></span>
            <div>
              <p className="font-display text-xl font-extrabold leading-none text-ink tnum">{s.value}</p>
              <p className="mt-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* toolbar */}
      <div className="anim-fade-up flex flex-wrap items-center gap-2.5 rounded-xl border border-stone-200/80 bg-white p-3.5 shadow-card" style={{ animationDelay: "90ms" }}>
        <label className="relative min-w-[200px] flex-1">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, phone or village…"
            className="h-9.5 w-full rounded-lg border border-stone-200 bg-paper/60 pl-9 pr-3 text-sm font-medium text-ink placeholder:text-ink-soft/60 transition-colors focus:border-pine-500 focus:bg-white focus:outline-none" />
        </label>
        <div className="flex rounded-lg border border-stone-200 bg-paper/60 p-0.5">
          {(["ALL", "active", "inactive"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={cn("rounded-md px-3 py-1.5 text-xs font-bold capitalize transition-all", filter === s ? "bg-pine-700 text-white shadow-sm" : "text-ink-soft hover:text-pine-700")}>
              {s === "ALL" ? `All (${counts.total})` : s === "active" ? `Active (${counts.active})` : `Archived (${counts.inactive})`}
            </button>
          ))}
        </div>
        <Btn variant="primary" icon="plus" onClick={openAdd}>Add producer</Btn>
      </div>

      {/* table */}
      {filtered.length === 0 ? (
        <EmptyState icon="users" title={producers.length === 0 ? "No producers yet" : "No producers match"}
          desc={producers.length === 0 ? "Add your first milk producer to start recording collections." : "Try a different search or switch the status filter."}
          action={<Btn variant="primary" icon="plus" onClick={openAdd}>Add producer</Btn>} />
      ) : (
        <div className="anim-fade-up overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-card" style={{ animationDelay: "140ms" }}>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1080px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
                  <th className="px-4 py-3 font-bold">Producer</th>
                  <th className="px-3 py-3 font-bold">Phone</th>
                  <th className="px-3 py-3 font-bold">Village</th>
                  <th className="px-3 py-3 font-bold">Animal</th>
                  <th className="px-3 py-3 font-bold">Joined</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 text-right font-bold">Today ({date.slice(8)})</th>
                  <th className="px-3 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((p, i) => {
                  const t = todayStats.get(p.id);
                  const inactive = p.status === "inactive";
                  return (
                    <tr key={p.id} className={cn("anim-fade-up group transition-colors hover:bg-pine-50/50", inactive && "opacity-60")} style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <Avatar name={p.name} size={36} />
                          <span>
                            <span className="block font-bold text-ink">{p.name}</span>
                            <span className="block text-[11px] font-bold text-pine-600">{p.code}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-ink-soft tnum">+{prefs.countryCode} {p.phone}</td>
                      <td className="px-3 py-3 text-ink-soft">{p.village}</td>
                      <td className="px-3 py-3">
                        <span className={cn("rounded-md px-2 py-0.5 text-[10.5px] font-extrabold ring-1 ring-inset", p.animal === "Buffalo" ? "bg-stone-100 text-stone-600 ring-stone-300/60" : p.animal === "Cow" ? "bg-amber-50 text-amberish ring-amber-300/50" : "bg-pine-50 text-pine-700 ring-pine-200")}>
                          {p.animal}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-soft tnum">{p.joined ? p.joined.slice(0, 7) : "—"}</td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold ring-1 ring-inset", inactive ? "bg-stone-100 text-stone-500 ring-stone-300/60" : "bg-wapp-50 text-wapp-700 ring-wapp-400/40")}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", inactive ? "bg-stone-400" : "bg-wapp-500")} />
                          {inactive ? "Archived" : "Active"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {t ? (
                          <span className="tnum">
                            <span className="block font-extrabold text-ink">{qty(t.ltr)} L</span>
                            <span className="block text-[11px] font-semibold text-pine-700">{inr(t.net)} · {t.entries} entr{t.entries === 1 ? "y" : "ies"}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-ink-soft/70">no entry</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center justify-end gap-0.5 opacity-75 transition-opacity group-hover:opacity-100">
                          <IconBtn icon="whatsapp" label="Open WhatsApp" tone="wapp" onClick={() => quickWhatsApp(p)} />
                          <IconBtn icon="pencil" label="Edit producer" tone="pine" onClick={() => openEdit(p)} />
                          <IconBtn icon={inactive ? "check" : "archive"} label={inactive ? "Reactivate" : "Archive (deactivate)"} onClick={async () => { await toggleProducer(p.id); toast("success", `${p.name} ${inactive ? "reactivated" : "archived"}`); }} />
                          <IconBtn icon="trash" label="Archive producer" tone="danger" disabled={busyId === p.id} onClick={() => setToDelete(p)} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <ul className="divide-y divide-stone-100 lg:hidden">
            {filtered.map((p) => {
              const t = todayStats.get(p.id);
              const inactive = p.status === "inactive";
              return (
                <li key={p.id} className={cn("p-4", inactive && "opacity-60")}>
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-bold text-ink">{p.name} <span className="text-[11px] text-pine-600">{p.code}</span></p>
                      <p className="text-xs text-ink-soft tnum">+{prefs.countryCode} {p.phone} · {p.village} · {p.animal}</p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold", inactive ? "bg-stone-100 text-stone-500" : "bg-wapp-50 text-wapp-700")}>{inactive ? "Archived" : "Active"}</span>
                  </div>
                  {t && <p className="mt-2 rounded-lg bg-pine-50/70 px-3 py-1.5 text-xs font-bold text-pine-800 tnum">Today: {qty(t.ltr)} L · {inr(t.net)} net</p>}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Btn variant="wapp" size="sm" icon="whatsapp" onClick={() => quickWhatsApp(p)}>WhatsApp</Btn>
                    <Btn variant="outline" size="sm" icon="pencil" onClick={() => openEdit(p)}>Edit</Btn>
                    <Btn variant="ghost" size="sm" icon={inactive ? "check" : "archive"} onClick={async () => { await toggleProducer(p.id); toast("success", `${p.name} ${inactive ? "reactivated" : "archived"}`); }}>
                      {inactive ? "Reactivate" : "Archive"}
                    </Btn>
                    <Btn variant="ghost" size="sm" icon="trash" className="!text-danger" onClick={() => setToDelete(p)}>Remove</Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* add / edit modal */}
      <Modal open={form !== null} onClose={() => setForm(null)} title={editId ? "Edit producer" : "Add producer"}
        subtitle={editId ? "Changes are written straight to the members table" : "Registers a new member in the dairy"}
        footer={<>
          <Btn variant="ghost" onClick={() => setForm(null)}>Cancel</Btn>
          <Btn variant="primary" icon="check" onClick={submit} disabled={saving}>{saving ? "Saving…" : editId ? "Save changes" : "Add producer"}</Btn>
        </>}>
        {form && (
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Full name" error={errors.name} className="sm:col-span-2">
              <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ramesh Patel"
                className={inputCls(!!errors.name)} />
            </Field>
            <Field label="Member code" error={errors.code}>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="MP-027"
                className={cn(inputCls(!!errors.code), "font-mono")} />
            </Field>
            <Field label="Phone (WhatsApp)" error={errors.phone}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-soft tnum">+{prefs.countryCode}</span>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 13) })} inputMode="numeric" placeholder="98XXXXXXXX"
                  className={cn(inputCls(!!errors.phone), "pl-10 tnum")} />
              </div>
            </Field>
            <Field label="Village">
              <input value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} placeholder="e.g. Anand" className={inputCls(false)} />
            </Field>
            <Field label="Animal">
              <select value={form.animal} onChange={(e) => setForm({ ...form, animal: e.target.value as FormT["animal"] })} className={inputCls(false)}>
                <option>Buffalo</option><option>Cow</option><option>Mixed</option>
              </select>
            </Field>
            <p className="flex items-start gap-2 rounded-lg bg-pine-50/70 px-3 py-2.5 text-[11.5px] leading-relaxed text-pine-900 ring-1 ring-pine-100 sm:col-span-2">
              <Icon name="whatsapp" size={14} className="mt-0.5 shrink-0 text-wapp-600" />
              Daily collection messages are sent to this number via WhatsApp. Keep it current — the sender validates it before opening a chat.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={doDelete}
        title={`Archive ${toDelete?.name}?`}
        confirmLabel="Archive producer"
        danger
        body={<span>Archiving sets <strong>{toDelete?.code}</strong> to inactive: they disappear from new collection entries and sender queues, but all milk history, advances and WhatsApp records are <strong>preserved</strong>. You can reactivate anytime.</span>}
      />
    </div>
  );
}

const inputCls = (err: boolean) => cn(
  "h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold text-ink transition-colors focus:outline-none focus:ring-2",
  err ? "border-red-300 focus:border-danger focus:ring-red-100" : "border-stone-200 focus:border-pine-500 focus:ring-pine-100",
);

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block text-xs font-bold text-ink-soft", className)}>
      {label}
      <span className="mt-1 block">{children}</span>
      {error && (
        <span className="anim-fade-up mt-1 flex items-center gap-1 text-[11px] font-semibold text-danger">
          <Icon name="alert" size={11} /> {error}
        </span>
      )}
    </label>
  );
}
