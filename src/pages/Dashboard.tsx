import { useMemo } from "react";
import { useApp } from "../lib/store";
import { getCollections, lastNDates } from "../lib/data";
import { cn, fmtDate, fmtDateLong, inr, num, timeAgo, STATUS_META } from "../lib/utils";
import type { MsgStatus } from "../lib/data";
import { Icon } from "../components/icons";
import { Btn, Ring, StatCard, EmptyState, Avatar } from "../components/ui";

export function Dashboard() {
  const { rows, date, go, messages } = useApp();

  const totals = useMemo(() => {
    const producers = new Set(rows.map((r) => r.producerId)).size;
    const litres = rows.reduce((s, r) => s + r.milkLtr, 0);
    const amount = rows.reduce((s, r) => s + r.amount, 0);
    const advance = rows.reduce((s, r) => s + r.advance, 0);
    const net = rows.reduce((s, r) => s + r.net, 0);
    const status: Record<MsgStatus, number> = { pending: 0, opened: 0, sent: 0, failed: 0, skipped: 0 };
    for (const r of rows) status[r.msg?.status ?? "pending"]++;
    const am = rows.filter((r) => r.shift === "AM").reduce((s, r) => s + r.milkLtr, 0);
    const pm = rows.filter((r) => r.shift === "PM").reduce((s, r) => s + r.milkLtr, 0);
    return { producers, litres, amount, advance, net, status, am, pm };
  }, [rows]);

  const week = useMemo(() => {
    return lastNDates(7, date).map((d) => {
      const cs = getCollections(d);
      return { date: d, litres: cs.reduce((s, c) => s + c.milkLtr, 0), amount: cs.reduce((s, c) => s + c.amount, 0) };
    });
  }, [date]);
  const maxLtr = Math.max(...week.map((w) => w.litres), 1);

  const activity = useMemo(
    () =>
      Object.values(messages)
        .filter((m) => m.status !== "pending")
        .sort((a, b) => (b.updatedAt < a.updatedAt ? -1 : 1))
        .slice(0, 6),
    [messages],
  );

  const delivered = totals.status.sent + totals.status.opened;
  const pct = rows.length ? (totals.status.sent / rows.length) * 100 : 0;
  const pendingTotal = totals.status.pending + totals.status.failed;

  return (
    <div className="space-y-5">
      {/* greeting strip */}
      <div className="anim-fade-up relative overflow-hidden rounded-2xl bg-pine-950 px-5 py-5 text-white shadow-lift sm:px-7"
        style={{ backgroundImage: "radial-gradient(700px 260px at 85% -20%, rgb(37 211 102 / 0.22), transparent), radial-gradient(420px 220px at 10% 120%, rgb(21 92 54 / 0.5), transparent)" }}>
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-wapp-400">{fmtDateLong(date)}</p>
            <h2 className="font-display mt-1 text-2xl sm:text-[28px] font-extrabold leading-tight">
              {totals.litres > 0 ? `${num(Math.round(totals.litres))} litres collected today` : "No collection yet today"}
            </h2>
            <p className="mt-1 text-sm text-pine-200">
              {totals.producers} producers · {rows.length} entries · {pendingTotal > 0 ? `${pendingTotal} WhatsApp messages waiting` : "all messages delivered ✓"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="wapp" icon="whatsapp" onClick={() => go("sender")}>Open Sender</Btn>
            <Btn variant="dark" icon="sheet" className="ring-1 ring-white/20" onClick={() => go("export")}>Export Excel</Btn>
          </div>
        </div>
      </div>

      {/* primary stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Today's Producers" value={totals.producers} format={(n) => num(Math.round(n))} icon="users" tone="pine" delay={0}
          sub={<span>{rows.length} entries across AM + PM</span>} />
        <StatCard label="Total Milk" value={totals.litres} format={(n) => `${num(Math.round(n * 10) / 10)} L`} icon="droplet" tone="sky" delay={60}
          sub={<span>Avg FAT {rows.length ? (rows.reduce((s, r) => s + r.fat, 0) / rows.length).toFixed(1) : "–"} · SNF {rows.length ? (rows.reduce((s, r) => s + r.snf, 0) / rows.length).toFixed(1) : "–"}</span>} />
        <StatCard label="Total Milk Amount" value={totals.amount} format={(n) => inr(n)} icon="rupee" tone="wapp" delay={120}
          sub={<span>Gross before deductions</span>} />
        <StatCard label="Total Net Payable" value={totals.net} format={(n) => inr(n)} icon="send" tone="pine" delay={180}
          sub={<span>After advance deductions</span>} />
      </div>

      {/* secondary stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Advance Deduction" value={totals.advance} format={(n) => inr(n)} icon="arrow-down" tone="amber" delay={0} />
        <StatCard label="Pending WhatsApp" value={pendingTotal} format={(n) => num(Math.round(n))} icon="clock" tone="stone" delay={60}
          sub={<span>{totals.status.failed} failed · {totals.status.opened} opened</span>} />
        <StatCard label="Sent" value={totals.status.sent} format={(n) => num(Math.round(n))} icon="check-circle" tone="wapp" delay={120} />
        <StatCard label="Failed / Skipped" value={totals.status.failed + totals.status.skipped} format={(n) => num(Math.round(n))} icon="x-circle" tone="red" delay={180} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* 7-day chart */}
        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card xl:col-span-2" style={{ animationDelay: "120ms" }}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-display text-base font-extrabold text-ink">Last 7 days collection</h3>
              <p className="text-xs text-ink-soft">Litres per day across all producers</p>
            </div>
            <span className="rounded-lg bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700 tnum">
              {week.reduce((s, w) => s + w.litres, 0).toFixed(0)} L total
            </span>
          </div>
          <div className="mt-5 flex h-44 items-end gap-2 sm:gap-3">
            {week.map((w, i) => {
              const h = Math.max(6, (w.litres / maxLtr) * 100);
              const isToday = w.date === date;
              return (
                <div key={w.date} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-pine-950 px-2.5 py-1.5 text-center opacity-0 shadow-lift transition-all duration-150 group-hover:opacity-100">
                    <p className="text-[10px] font-bold text-pine-200">{fmtDate(w.date)}</p>
                    <p className="text-xs font-extrabold text-white tnum">{w.litres.toFixed(1)} L · {inr(w.amount)}</p>
                  </div>
                  <span className="text-[10.5px] font-bold text-ink-soft tnum opacity-0 transition-opacity group-hover:opacity-100">{w.litres.toFixed(0)}</span>
                  <div
                    className={cn("anim-bar w-full max-w-11 rounded-t-lg transition-all duration-200 group-hover:opacity-90", isToday ? "bg-wapp-500 shadow-[0_0_0_3px_rgb(37_211_102/0.25)]" : "bg-pine-600/85 group-hover:bg-pine-500")}
                    style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }}
                  />
                  <span className={cn("text-[10.5px] font-bold", isToday ? "text-wapp-700" : "text-ink-soft")}>
                    {new Date(`${w.date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* delivery ring */}
        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card" style={{ animationDelay: "180ms" }}>
          <h3 className="font-display text-base font-extrabold text-ink">WhatsApp delivery</h3>
          <p className="text-xs text-ink-soft">Status of today's {rows.length} messages</p>
          <div className="mt-4 flex items-center justify-center">
            <Ring pct={rows.length ? pct : 0} label="sent" size={132} />
          </div>
          <div className="mt-4 space-y-2">
            {(["sent", "opened", "pending", "failed", "skipped"] as MsgStatus[]).map((s) => {
              const count = totals.status[s];
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className={cn("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
                  <span className="flex-1 font-semibold text-ink-soft">{STATUS_META[s].label}</span>
                  <span className="font-bold text-ink tnum">{count}</span>
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                    <span className={cn("block h-full rounded-full transition-all duration-700", STATUS_META[s].dot)} style={{ width: rows.length ? `${(count / rows.length) * 100}%` : "0%" }} />
                  </span>
                </div>
              );
            })}
          </div>
          {delivered === 0 && rows.length > 0 && (
            <Btn variant="wapp" icon="whatsapp" className="mt-4 w-full" onClick={() => go("sender")}>Start sending now</Btn>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* shift split */}
        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card" style={{ animationDelay: "220ms" }}>
          <h3 className="font-display text-base font-extrabold text-ink">Shift split</h3>
          <p className="text-xs text-ink-soft">Milk volume by collection shift</p>
          {(["AM", "PM"] as const).map((shift) => {
            const v = shift === "AM" ? totals.am : totals.pm;
            const share = totals.litres ? (v / totals.litres) * 100 : 0;
            const entries = rows.filter((r) => r.shift === shift);
            return (
              <div key={shift} className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold text-ink">
                    <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-extrabold", shift === "AM" ? "bg-amber-100 text-amberish" : "bg-pine-100 text-pine-700")}>
                      {shift === "AM" ? "☀ AM" : "☾ PM"}
                    </span>
                    {entries.length} entries
                  </span>
                  <span className="font-extrabold text-ink tnum">{v.toFixed(1)} L · {share.toFixed(0)}%</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-stone-100">
                  <div className={cn("h-full rounded-full transition-all duration-1000", shift === "AM" ? "bg-amberish" : "bg-pine-600")} style={{ width: `${share}%` }} />
                </div>
              </div>
            );
          })}
          <div className="mt-5 rounded-lg bg-stone-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-soft ring-1 ring-stone-100">
            <Icon name="info" size={13} className="mr-1 inline text-pine-600" />
            Rate is computed from FAT &amp; SNF per entry — accounting logic of the Milk Advance System is never modified.
          </div>
        </div>

        {/* recent activity */}
        <div className="anim-fade-up rounded-xl border border-stone-200/80 bg-white p-5 shadow-card xl:col-span-2" style={{ animationDelay: "260ms" }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-extrabold text-ink">Recent message activity</h3>
              <p className="text-xs text-ink-soft">Latest WhatsApp statuses across all days</p>
            </div>
            <Btn variant="ghost" size="sm" iconRight="chevron-right" onClick={() => go("history")}>View history</Btn>
          </div>
          {activity.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon="whatsapp" title="No messages tracked yet" desc="Open a WhatsApp chat from the Sender and statuses will appear here in real time." action={<Btn variant="wapp" icon="whatsapp" onClick={() => go("sender")}>Go to Sender</Btn>} />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-stone-100">
              {activity.map((m) => {
                const prod = rows.find((r) => r.producerId === m.producerId)?.producer.name ?? `Producer #${m.producerId}`;
                return (
                  <li key={m.id} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-pine-50/40">
                    <Avatar name={prod} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-ink">{prod}</p>
                      <p className="text-[11px] text-ink-soft tnum">+91 {m.phone} · {timeAgo(m.updatedAt)}</p>
                    </div>
                    <span className="text-xs font-semibold text-ink-soft tnum">
                      {m.status === "sent" && m.sentAt ? `Sent ${timeAgo(m.sentAt)}` : m.status === "opened" && m.openedAt ? `Opened ${timeAgo(m.openedAt)}` : m.status === "failed" ? "Failed to deliver" : "Skipped in queue"}
                    </span>
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_META[m.status].dot)} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
