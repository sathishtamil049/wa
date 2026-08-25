import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_TEMPLATE, getCollections, producerById, PRODUCERS, r2, toISO } from "./data";
import type { Collection, MsgStatus, Producer } from "./data";
import { renderTemplate } from "./utils";
import * as api from "./api";

export type Route = "dashboard" | "collection" | "producers" | "sender" | "history" | "templates" | "export" | "settings";
export type DbMode = "checking" | "live" | "demo";

export interface MsgRecord {
  id: string;
  collectionId: string;
  producerId: number;
  phone: string;
  message: string;
  status: MsgStatus;
  openedAt?: string;
  sentAt?: string;
  failedAt?: string;
  skippedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Prefs {
  centerName: string;
  adminName: string;
  countryCode: string;
  bulkDelay: number;
  confirmBulk: boolean;
  defaultShift: "ALL" | "AM" | "PM";
}

export interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

export interface EnrichedRow extends Collection {
  producer: Producer;
  msg?: MsgRecord;
}

export type ProducerFull = Producer & { status: "active" | "inactive"; entriesToday?: number };

export interface EntryInput {
  producerId: number;
  date: string;
  shift: "AM" | "PM";
  milkLtr: number;
  fat: number;
  snf: number;
  rate: number;
}

interface EntryOverlay {
  added: Collection[];
  edited: Record<string, Collection>;
  removed: string[];
}

const DEFAULT_PREFS: Prefs = {
  centerName: "Milk Producers Management System",
  adminName: "Admin",
  countryCode: "91",
  bulkDelay: 1200,
  confirmBulk: true,
  defaultShift: "ALL",
};

const LS_MESSAGES = "milkpro.messages.v1";
const LS_TEMPLATE = "milkpro.template.v1";
const LS_PREFS = "milkpro.prefs.v1";
const LS_PRODUCERS = "milkpro.producers.local.v1";
const LS_ENTRIES = "milkpro.entries.overlay.v1";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore quota */ }
}

interface AppState {
  route: Route;
  go: (r: Route) => void;
  date: string;
  setDate: (d: string) => void;
  rows: EnrichedRow[];
  messages: Record<string, MsgRecord>;
  template: string;
  prefs: Prefs;
  toasts: ToastItem[];
  toast: (kind: ToastItem["kind"], text: string) => void;
  dismissToast: (id: number) => void;
  openMsg: (row: EnrichedRow) => MsgRecord;
  markSent: (collectionId: string) => void;
  markFailed: (collectionId: string, error: string) => void;
  markSkipped: (collectionId: string) => void;
  retryMsg: (collectionId: string) => void;
  reopenMsg: (collectionId: string) => void;
  bulkMarkSent: (ids: string[]) => void;
  clearMessages: () => void;
  saveTemplate: (t: string) => void;
  savePrefs: (p: Prefs) => void;
  messageFor: (row: EnrichedRow) => string;
  mode: DbMode;
  refreshing: boolean;
  reconnect: () => void;
  // producers
  producers: ProducerFull[];
  addProducer: (p: api.ProducerInput) => Promise<string | null>;
  updateProducer: (id: number, p: api.ProducerInput) => Promise<string | null>;
  removeProducer: (id: number) => Promise<string | null>;
  toggleProducer: (id: number) => Promise<void>;
  // entries
  addEntry: (e: EntryInput) => Promise<string | null>;
  updateEntry: (id: string, e: EntryInput) => Promise<string | null>;
  removeEntry: (id: string) => Promise<string | null>;
}

const Ctx = createContext<AppState | null>(null);

const seedProducers: ProducerFull[] = PRODUCERS.map((p) => ({ ...p, status: "active" as const }));

export function AppProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>("dashboard");
  const [date, setDate] = useState<string>(toISO(new Date()));
  const [messages, setMessages] = useState<Record<string, MsgRecord>>(() => load(LS_MESSAGES, {}));
  const [template, setTemplate] = useState<string>(() => load(LS_TEMPLATE, DEFAULT_TEMPLATE));
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...load(LS_PREFS, {}) }));
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mode, setMode] = useState<DbMode>("checking");
  const [liveRows, setLiveRows] = useState<EnrichedRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [producers, setProducers] = useState<ProducerFull[]>(() => load(LS_PRODUCERS, seedProducers));
  const [overlay, setOverlay] = useState<EntryOverlay>(() => load(LS_ENTRIES, { added: [], edited: {}, removed: [] }));
  const toastId = useRef(0);
  const announced = useRef(false);
  const modeRef = useRef<DbMode>("checking");
  modeRef.current = mode;

  useEffect(() => save(LS_MESSAGES, messages), [messages]);
  useEffect(() => save(LS_TEMPLATE, template), [template]);
  useEffect(() => save(LS_PREFS, prefs), [prefs]);
  useEffect(() => save(LS_PRODUCERS, producers), [producers]);
  useEffect(() => save(LS_ENTRIES, overlay), [overlay]);

  const toast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // ── live collection loader ───────────────────────────────────────────────
  const loadLive = useCallback(
    async (d: string, announceError = true) => {
      setRefreshing(true);
      const rows = await api.fetchCollection(d);
      setRefreshing(false);
      if (rows) {
        setLiveRows(rows);
        setMessages((prev) => {
          const next = { ...prev };
          for (const r of rows) if (r.msg) next[r.id] = r.msg;
          return next;
        });
        return true;
      }
      if (announceError) {
        const detail = api.getLastError();
        toast("error", detail ? `API error — ${detail.slice(0, 110)}` : "Could not load collection from the API");
      }
      return false;
    },
    [toast],
  );

  const loadProducersLive = useCallback(async () => {
    const list = await api.fetchProducers(true);
    if (list) {
      setProducers(list.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        phone: p.phone,
        village: p.village ?? "—",
        animal: p.animal ?? "Mixed",
        joined: p.joined ?? "",
        status: p.status ?? "active",
        entriesToday: p.entries_today ?? 0,
      })));
    }
  }, []);

  // ── backend detection ────────────────────────────────────────────────────
  const detect = useCallback(async () => {
    setMode("checking");
    const h = await api.health();
    if (h) {
      setMode("live");
      const t = await api.fetchTemplate();
      if (t) setTemplate(t);
      void loadLive(date, false);
      void loadProducersLive();
      if (!announced.current) {
        announced.current = true;
        window.setTimeout(() => toast("success", `Connected to MySQL via MilkPro API (${api.API_BASE})`), 500);
      }
    } else {
      setMode("demo");
      setLiveRows(null);
      if (!announced.current) {
        announced.current = true;
        window.setTimeout(() => toast("info", "API offline — running on demo data. Start the backend with `npm run dev`"), 500);
      }
    }
  }, [date, loadLive, loadProducersLive, toast]);

  useEffect(() => {
    void detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === "live") void loadLive(date);
  }, [mode, date, loadLive]);

  // ── rows: live API rows (with optimistic overlays) or demo + local edits ─
  const producerMap = useMemo(() => new Map(producers.map((p) => [p.id, p])), [producers]);

  const rows: EnrichedRow[] = useMemo(() => {
    const withMsg = (r: Collection): EnrichedRow => ({
      ...r,
      producer: producerMap.get(r.producerId) ?? producerById.get(r.producerId) ?? {
        id: r.producerId, code: `#${r.producerId}`, name: `Producer ${r.producerId}`, phone: "0000000000", village: "—", animal: "Mixed", joined: "",
      },
      msg: messages[r.id],
    });

    if (mode === "live" && liveRows) {
      return liveRows.map((r) => (messages[r.id] ? { ...r, msg: messages[r.id] } : r));
    }
    const removed = new Set(overlay.removed);
    const seeded = getCollections(date)
      .filter((c) => !removed.has(c.id))
      .map((c) => overlay.edited[c.id] ?? c);
    const added = overlay.added.filter((c) => c.date === date);
    return [...seeded, ...added].map(withMsg);
  }, [mode, liveRows, date, messages, overlay, producerMap]);

  const messageFor = useCallback(
    (row: EnrichedRow) => row.msg?.message || renderTemplate(template, row),
    [template],
  );

  // ── status mutations ─────────────────────────────────────────────────────
  const upsert = useCallback((collectionId: string, patch: Partial<MsgRecord>, require?: MsgRecord) => {
    setMessages((prev) => {
      const existing = prev[collectionId] ?? require;
      if (!existing) return prev;
      return { ...prev, [collectionId]: { ...existing, ...patch, updatedAt: new Date().toISOString() } };
    });
  }, []);

  const openMsg = useCallback(
    (row: EnrichedRow): MsgRecord => {
      const now = new Date().toISOString();
      const existing = messages[row.id];
      const message = existing?.message || renderTemplate(template, row);
      const record: MsgRecord =
        existing ?? {
          id: `wa_${row.id.replace(/\|/g, "_")}`,
          collectionId: row.id,
          producerId: row.producerId,
          phone: row.producer.phone,
          message,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
      const next = { ...record, status: "opened" as MsgStatus, openedAt: now, updatedAt: now };
      setMessages((prev) => ({ ...prev, [row.id]: next }));
      if (modeRef.current === "live") void api.postOpened(row.id, row.producer.phone, message);
      return next;
    },
    [messages, template],
  );

  const markSent = useCallback((id: string) => {
    upsert(id, { status: "sent", sentAt: new Date().toISOString(), error: undefined });
    if (modeRef.current === "live") void api.postSent(id);
  }, [upsert]);

  const markFailed = useCallback((id: string, error: string) => {
    upsert(id, { status: "failed", failedAt: new Date().toISOString(), error });
    if (modeRef.current === "live") void api.postFailed(id, error);
  }, [upsert]);

  const markSkipped = useCallback((id: string) => {
    upsert(id, { status: "skipped", skippedAt: new Date().toISOString() });
    if (modeRef.current === "live") void api.postSkipped(id);
  }, [upsert]);

  const retryMsg = useCallback((id: string) => {
    upsert(id, { status: "pending", error: undefined, failedAt: undefined });
    if (modeRef.current === "live") void api.postBulkStatus([id], "pending");
  }, [upsert]);

  const reopenMsg = useCallback((id: string) => {
    upsert(id, { status: "opened", openedAt: new Date().toISOString() });
    if (modeRef.current === "live") void api.postOpened(id, "", "");
  }, [upsert]);

  const bulkMarkSent = useCallback((ids: string[]) => {
    const now = new Date().toISOString();
    setMessages((prev) => {
      const next = { ...prev };
      for (const id of ids) if (next[id]) next[id] = { ...next[id], status: "sent", sentAt: now, updatedAt: now };
      return next;
    });
    if (modeRef.current === "live") void api.postBulkStatus(ids, "sent");
  }, []);

  const clearMessages = useCallback(() => setMessages({}), []);

  const saveTemplate = useCallback((t: string) => {
    setTemplate(t);
    if (modeRef.current === "live") void api.putTemplate(t);
  }, []);

  const savePrefs = useCallback((p: Prefs) => setPrefs(p), []);
  const reconnect = useCallback(() => void detect(), [detect]);

  // ── producer CRUD ────────────────────────────────────────────────────────
  const addProducer = useCallback(async (p: api.ProducerInput): Promise<string | null> => {
    if (modeRef.current === "live") {
      const res = await api.createProducer(p);
      if (!res.ok) return res.error ?? "Failed to add producer";
      void loadProducersLive();
      return null;
    }
    const id = Math.max(0, ...producers.map((x) => x.id)) + 1;
    setProducers((list) => [...list, { id, code: p.code, name: p.name, phone: p.phone, village: p.village ?? "—", animal: p.animal ?? "Mixed", joined: toISO(new Date()), status: "active" }]);
    return null;
  }, [producers, loadProducersLive]);

  const updateProducer = useCallback(async (id: number, p: api.ProducerInput): Promise<string | null> => {
    if (modeRef.current === "live") {
      const res = await api.updateProducer(id, p);
      if (!res.ok) return res.error ?? "Failed to update producer";
      void loadProducersLive();
      return null;
    }
    setProducers((list) => list.map((x) => x.id === id ? { ...x, code: p.code, name: p.name, phone: p.phone, village: p.village ?? x.village, animal: p.animal ?? x.animal, status: p.status ?? x.status } : x));
    return null;
  }, [loadProducersLive]);

  const removeProducer = useCallback(async (id: number): Promise<string | null> => {
    if (modeRef.current === "live") {
      const res = await api.deleteProducer(id);
      if (!res.ok) return res.error ?? "Failed to remove producer";
      void loadProducersLive();
      return null;
    }
    setProducers((list) => list.map((x) => x.id === id ? { ...x, status: "inactive" } : x));
    return null;
  }, [loadProducersLive]);

  const toggleProducer = useCallback(async (id: number) => {
    const target = producers.find((p) => p.id === id);
    if (!target) return;
    const nextStatus = target.status === "active" ? "inactive" : "active";
    setProducers((list) => list.map((x) => x.id === id ? { ...x, status: nextStatus } : x));
    if (modeRef.current === "live") {
      const res = await api.updateProducer(id, { name: target.name, code: target.code, phone: target.phone, village: target.village, animal: target.animal, status: nextStatus });
      if (!res.ok) {
        setProducers((list) => list.map((x) => x.id === id ? { ...x, status: target.status } : x));
        toast("error", res.error ?? "Could not change status");
      }
    }
  }, [producers, toast]);

  // ── entry CRUD ───────────────────────────────────────────────────────────
  const toCollection = (e: EntryInput, id: string): Collection => ({
    id,
    producerId: e.producerId,
    date: e.date,
    shift: e.shift,
    milkLtr: e.milkLtr,
    fat: e.fat,
    snf: e.snf,
    rate: e.rate,
    amount: r2(e.milkLtr * e.rate),
    advance: 0,
    net: r2(e.milkLtr * e.rate),
  });

  const apiPayload = (e: EntryInput): api.EntryInput => ({
    member_id: e.producerId,
    entry_date: e.date,
    shift: e.shift,
    milk_ltr: e.milkLtr,
    fat: e.fat,
    snf: e.snf,
    rate_per_ltr: e.rate,
  });

  const addEntry = useCallback(async (e: EntryInput): Promise<string | null> => {
    if (modeRef.current === "live") {
      const res = await api.createEntry(apiPayload(e));
      if (!res.ok) return res.error ?? "Failed to add entry";
      toast("success", "Milk entry saved to database");
      void loadLive(e.date);
      return null;
    }
    const id = `local_${Date.now()}_${Math.floor(Math.random() * 999)}`;
    setOverlay((o) => ({ ...o, added: [...o.added, toCollection(e, id)] }));
    toast("success", "Milk entry added (demo data)");
    return null;
  }, [loadLive, toast]);

  const updateEntry = useCallback(async (id: string, e: EntryInput): Promise<string | null> => {
    if (modeRef.current === "live") {
      const res = await api.updateEntry(id, apiPayload(e));
      if (!res.ok) return res.error ?? "Failed to update entry";
      toast("success", "Entry updated in database");
      void loadLive(e.date);
      return null;
    }
    if (id.startsWith("local_")) {
      setOverlay((o) => ({ ...o, added: o.added.map((c) => (c.id === id ? toCollection(e, id) : c)) }));
    } else {
      setOverlay((o) => ({ ...o, edited: { ...o.edited, [id]: toCollection(e, id) } }));
    }
    toast("success", "Entry updated (demo data)");
    return null;
  }, [loadLive, toast]);

  const removeEntry = useCallback(async (id: string): Promise<string | null> => {
    if (modeRef.current === "live") {
      const res = await api.deleteEntry(id);
      if (!res.ok) return res.error ?? "Failed to delete entry";
      toast("success", "Entry deleted from database");
      setMessages((prev) => { const n = { ...prev }; delete n[id]; return n; });
      void loadLive(date);
      return null;
    }
    setOverlay((o) => id.startsWith("local_")
      ? { ...o, added: o.added.filter((c) => c.id !== id) }
      : { ...o, removed: [...o.removed, id], edited: Object.fromEntries(Object.entries(o.edited).filter(([k]) => k !== id)) });
    setMessages((prev) => { const n = { ...prev }; delete n[id]; return n; });
    toast("success", "Entry deleted (demo data)");
    return null;
  }, [date, loadLive, toast]);

  const value: AppState = {
    route, go: setRoute, date, setDate, rows, messages, template, prefs, toasts, toast, dismissToast,
    openMsg, markSent, markFailed, markSkipped, retryMsg, reopenMsg, bulkMarkSent, clearMessages,
    saveTemplate, savePrefs, messageFor, mode, refreshing, reconnect,
    producers, addProducer, updateProducer, removeProducer, toggleProducer,
    addEntry, updateEntry, removeEntry,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
