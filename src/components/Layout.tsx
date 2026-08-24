import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useApp } from "../lib/store";
import type { Route } from "../lib/store";
import { toISO } from "../lib/data";
import { cn, fmtDateLong } from "../lib/utils";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { ToastHost } from "./ui";

const NAV: Array<{ route: Route; label: string; icon: IconName }> = [
  { route: "dashboard", label: "Dashboard", icon: "dashboard" },
  { route: "collection", label: "Milk Collection", icon: "droplet" },
  { route: "sender", label: "WhatsApp Sender", icon: "whatsapp" },
  { route: "history", label: "Message History", icon: "history" },
  { route: "templates", label: "Templates", icon: "message" },
  { route: "export", label: "Export", icon: "sheet" },
  { route: "settings", label: "Settings", icon: "gear" },
];

const TITLES: Record<Route, { title: string; sub: string }> = {
  dashboard: { title: "Dashboard", sub: "Daily collection overview & delivery pulse" },
  collection: { title: "Daily Milk Collection", sub: "Entries read from the Milk Producers database" },
  sender: { title: "WhatsApp Sender", sub: "Personalised messages — you stay in control of sending" },
  history: { title: "Message History", sub: "Every message tracked with its delivery status" },
  templates: { title: "Message Templates", sub: "Personalise with live variable preview" },
  export: { title: "Excel Export", sub: "Download collection data as .xlsx" },
  settings: { title: "Settings", sub: "Centre preferences & module configuration" },
};

function ModeChip() {
  const { mode, reconnect, refreshing } = useApp();
  const busy = mode === "checking" || refreshing;
  return (
    <button
      onClick={() => { if (!busy) reconnect(); }}
      title={mode === "live" ? "Connected to the MilkPro Express API + MySQL — click to re-check" : mode === "demo" ? "API not reachable — using built-in demo data. Click to retry connection." : "Checking API…"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-extrabold transition-all duration-150",
        mode === "live" && "border-wapp-400/40 bg-wapp-50 text-wapp-700 hover:bg-wapp-100",
        mode === "demo" && "border-amber-300/50 bg-amber-50 text-amberish hover:bg-amber-100",
        mode === "checking" && "border-stone-200 bg-white text-ink-soft",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", mode === "live" && "bg-wapp-500 pulse-dot", mode === "demo" && "bg-amberish", mode === "checking" && "bg-stone-400 animate-pulse", busy && mode !== "checking" && "animate-pulse")} />
      {mode === "live" ? "MySQL · Live" : mode === "demo" ? "Demo data" : "Connecting…"}
    </button>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-ink-soft tnum">
      <Icon name="clock" size={13} className="text-pine-500" />
      {now.toLocaleTimeString("en-IN", { hour12: false })}
    </span>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { route, go, rows, prefs, mode, reconnect } = useApp();
  const pending = rows.filter((r) => !r.msg || r.msg.status === "pending" || r.msg.status === "failed").length;
  return (
    <div className="flex h-full flex-col">
      <button onClick={() => { go("dashboard"); onNavigate?.(); }} className="flex items-center gap-3 px-5 pb-5 pt-6 text-left">
        <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-wapp-500 text-pine-950 shadow-[0_0_0_4px_rgb(37_211_102/0.18)]">
          <Icon name="milk-can" size={21} strokeWidth={2} />
        </span>
        <span>
          <span className="block font-display text-[17px] font-extrabold leading-none text-white">MilkPro</span>
          <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-pine-300">WhatsApp Sender</span>
        </span>
      </button>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        <p className="px-2.5 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-pine-400/80">Console</p>
        {NAV.map((item) => {
          const active = route === item.route;
          return (
            <button
              key={item.route}
              onClick={() => { go(item.route); onNavigate?.(); }}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold transition-all duration-150",
                active ? "bg-white/10 text-white" : "text-pine-200/75 hover:bg-white/5 hover:text-white",
              )}
            >
              <span className={cn("absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-wapp-400 transition-all duration-200", active ? "opacity-100" : "opacity-0 group-hover:opacity-40")} />
              <Icon name={item.icon} size={17} className={active ? "text-wapp-400" : ""} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.route === "sender" && pending > 0 && (
                <span className="rounded-full bg-wapp-500 px-1.5 py-0.5 text-[10px] font-extrabold text-pine-950 tnum">{pending}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", mode === "live" ? "bg-wapp-500 pulse-dot" : mode === "demo" ? "bg-amberish" : "bg-stone-400 animate-pulse")} />
          <p className="text-[11px] font-bold text-pine-100">
            {mode === "live" ? "MySQL · connected" : mode === "demo" ? "Demo mode · local data" : "Connecting to API…"}
          </p>
        </div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-pine-300/80">
          {mode === "live"
            ? "Read-only · members, milk_entries, advances · centre: " + prefs.centerName.split(" ").slice(0, 2).join(" ")
            : mode === "demo"
              ? "Backend offline — showing seeded sample data. Start it with `npm run dev` in /backend."
              : "Probing http://localhost:3001 …"}
        </p>
        {mode === "demo" && (
          <button onClick={reconnect} className="mt-2 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10.5px] font-bold text-wapp-400 transition-colors hover:bg-white/15">
            <Icon name="refresh" size={11} /> Retry connection
          </button>
        )}
      </div>

      <div className="border-t border-white/10 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-pine-700 font-display text-xs font-bold text-white">
            {prefs.adminName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-white">{prefs.adminName}</p>
            <p className="text-[10.5px] text-pine-300/80">Administrator</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { route, date, setDate, rows } = useApp();
  const [drawer, setDrawer] = useState(false);
  const today = toISO(new Date());
  const meta = TITLES[route];
  const litres = rows.reduce((s, r) => s + r.milkLtr, 0);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-pine-950 lg:flex"
        style={{ backgroundImage: "radial-gradient(600px 300px at 20% 0%, rgb(37 211 102 / 0.10), transparent), radial-gradient(400px 400px at 100% 100%, rgb(21 92 54 / 0.35), transparent)" }}>
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-pine-950/50 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
          <aside className="anim-drawer absolute inset-y-0 left-0 w-[268px] bg-pine-950 shadow-lift">
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-paper/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1360px] items-center gap-3 px-4 py-3 sm:px-6">
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-ink lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Icon name="list" size={17} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[19px] sm:text-[21px] font-extrabold leading-tight text-ink truncate">{meta.title}</h1>
              <p className="hidden sm:block text-[11.5px] text-ink-soft truncate">{meta.sub}</p>
            </div>
            <Clock />
            <ModeChip />
            <label className="relative inline-flex items-center">
              <Icon name="calendar" size={15} className="pointer-events-none absolute left-2.5 text-pine-600" />
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="h-9.5 rounded-lg border border-stone-200 bg-white pl-8.5 pr-2 text-xs font-bold text-ink shadow-sm transition-colors hover:border-pine-400 focus:border-pine-500 focus:outline-none tnum"
                aria-label="Working date"
              />
            </label>
            <span className="hidden xl:inline-flex items-center gap-1.5 rounded-lg bg-pine-100 px-2.5 py-1.5 text-[11px] font-bold text-pine-800 tnum">
              <Icon name="droplet" size={13} />
              {fmtDateLong(date)} · {litres.toFixed(0)} L
            </span>
          </div>
        </header>

        <main key={route} className="anim-fade-up mx-auto max-w-[1360px] px-4 pb-28 pt-5 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {NAV.slice(0, 5).map((item) => (
            <MobileTab key={item.route} item={item} active={route === item.route} />
          ))}
        </div>
      </nav>

      <ToastHost />
    </div>
  );
}

function MobileTab({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  const { go } = useApp();
  return (
    <button onClick={() => go(item.route)} className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition-colors", active ? "text-pine-700" : "text-ink-soft/70")}>
      <span className={cn("rounded-lg px-2.5 py-0.5 transition-colors", active && "bg-pine-100")}>
        <Icon name={item.icon} size={17} />
      </span>
      {item.label.split(" ")[0]}
    </button>
  );
}
