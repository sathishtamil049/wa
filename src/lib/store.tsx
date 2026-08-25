import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_TEMPLATE, getCollections, PRODUCERS, producerById, toISO } from "./data";
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
  message: string; // snapshot rendered at send time
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
  bulkDelay: number; // ms between bulk steps
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

export interface ProducerInput {
  id?: number;
  code: string;
  name: string;
  phone: string;
  status: "active" | "inactive";
}

export interface EntryFormInput {
  id?: string; // collection id when editing
  producerId: number;
  date: string;
  shift: "AM" | "PM";
  milkLtr: number;
  fat: number;
  snf: number;
  rate: number;
  advance: number;
}

export type CrudResult = { ok: true } | { ok: false; error: string };

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

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const toProducer = (m: { id: number; code: string; name: string; phone: string }): Producer => ({
  id: m.id,
  code: m.code,
  name: m.name,
  phone: m.phone,
  village: "—",
  animal: "Mixed",
  joined: "",
});

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
  refresh: () => Promise<void>;
  // ── directory & CRUD ──
  producers: Producer[];
  memberEntries: Record<number, number>; // producer id → total entry count (live mode)
  saveProducer: (input: ProducerInput) => Promise<CrudResult>;
  deleteProducer: (id: number) => Promise<CrudResult>;
  saveEntry: (input: EntryFormInput) => Promise<CrudResult>;
  deleteEntry: (id: string) => Promise<CrudResult>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>("dashboard");
  const [date, setDate] = useState<string>(toISO(new Date()));
  const [messages, setMessages] = useState<Record<string, MsgRecord>>(() => load(LS_MESSAGES, {}));
  const [template, setTemplate] = useState<string>(() => load(LS_TEMPLATE, DEFAULT_TEMPLATE));
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...load(LS_PREFS, {}) }));
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mode, setMode] = useState<DbMode>("checking");
  const [liveRows, setLiveRows] = useState<EnrichedRow[] | null>(null);
  const [apiMembers, setApiMembers] = useState<api.MemberApi[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // demo-mode CRUD overlays (session only)
  const [demoMembers, setDemoMembers] = useState<Producer[] | null>(null);
  const [entryPatches, setEntryPatches] = useState<Record<string, Partial<EnrichedRow>>>({});
  const [entryDeleted, setEntryDeleted] = useState<string[]>([]);
  const [entryAdded, setEntryAdded] = useState<EnrichedRow[]>([]);

  const toastId = useRef(0);
  const announced = useRef(false);
  const modeRef = useRef<DbMode>("checking");
  modeRef.current = mode;

  useEffect(() => {
    try {
      localStorage.setItem(LS_MESSAGES, JSON.stringify(messages));
    } catch { /* storage full — ignore */ }
  }, [messages]);
  useEffect(() => {
    localStorage.setItem(LS_TEMPLATE, JSON.stringify(template));
  }, [template]);
  useEffect(() => {
    localStorage.setItem(LS_PREFS, JSON.stringify(prefs));
  }, [prefs]);

  const toast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // ── live loaders ─────────────────────────────────────────────────────────
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
      if (announceError) toast("error", "Could not load collection from the API");
      return false;
    },
    [toast],
  );

  const loadMembers = useCallback(async () => {
    const m = await api.fetchMembers();
    if (m) setApiMembers(m);
    return m !== null;
  }, []);

  const refresh = useCallback(async () => {
    if (modeRef.current === "live") {
      await Promise.all([loadLive(date, false), loadMembers()]);
    }
  }, [date, loadLive, loadMembers]);

  // ── backend detection ────────────────────────────────────────────────────
  const detect = useCallback(async () => {
    setMode("checking");
    const h = await api.health();
    if (h) {
      setMode("live");
      const t = await api.fetchTemplate();
      if (t) setTemplate(t);
      void loadLive(date, false);
      void loadMembers();
      if (!announced.current) {
        announced.current = true;
        window.setTimeout(() => toast("success", `Connected to MySQL via MilkPro API (${api.API_BASE})`), 500);
      }
    } else {
      setMode("demo");
      setLiveRows(null);
      setApiMembers(null);
      if (!announced.current) {
        announced.current = true;
        window.setTimeout(() => toast("info", "API offline — running on demo data. Start the backend with `npm run dev`"), 500);
      }
    }
  }, [date, loadLive, loadMembers, toast]);

  useEffect(() => {
    void detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === "live") {
      void loadLive(date);
      void loadMembers();
    }
  }, [mode, date, loadLive, loadMembers]);

  // ── producers directory ──────────────────────────────────────────────────
  const producers: Producer[] = useMemo(() => {
    if (mode === "live" && apiMembers) return apiMembers.map(toProducer);
    return demoMembers ?? PRODUCERS;
  }, [mode, apiMembers, demoMembers]);

  const memberEntries: Record<number, number> = useMemo(() => {
    const out: Record<number, number> = {};
    if (mode === "live" && apiMembers) {
      for (const m of apiMembers) out[m.id] = m.entries;
    } else {
      for (const r of getCollections(date)) out[r.producerId] = (out[r.producerId] ?? 0) + 1;
    }
    return out;
  }, [mode, apiMembers, date]);

  // ── rows: live (+ optimistic overlays) or demo (+ session overlays) ──────
  const rows: EnrichedRow[] = useMemo(() => {
    const base: EnrichedRow[] =
      mode === "live" && liveRows
        ? liveRows.map((r) => (messages[r.id] ? { ...r, msg: messages[r.id] } : r))
        : getCollections(date).map((c) => ({
            ...c,
            producer: producerById.get(c.producerId)!,
            msg: messages[c.id],
          }));
    let out = base.filter((r) => !entryDeleted.includes(r.id)).map((r) => (entryPatches[r.id] ? { ...r, ...entryPatches[r.id] } : r));
    out = [...out, ...entryAdded.filter((r) => r.date === date)];
    return out;
  }, [mode, liveRows, date, messages, entryDeleted, entryPatches, entryAdded]);

  const messageFor = useCallback(
    (row: EnrichedRow) => row.msg?.message || renderTemplate(template, row),
    [template],
  );

  // ── status mutations (optimistic locally, mirrored to the API when live) ─
  const upsert = useCallback((collectionId: string, patch: Partial<MsgRecord>, require?: MsgRecord) => {
    setMessages((prev) => {
      const existing = prev[collectionId] ?? require;
      if (!existing) return prev;
      return {
        ...prev,
        [collectionId]: { ...existing, ...patch, updatedAt: new Date().toISOString() },
      };
    });
  }, []);

  const openMsg = useCallback(
    (row: EnrichedRow): MsgRecord => {
      const now = new Date().toISOString();
      const existing = messages[row.id];
      const body = existing?.message || renderTemplate(template, row);
      const record: MsgRecord =
        existing ?? {
          id: `wa_${row.id.replace(/\|/g, "_")}`,
          collectionId: row.id,
          producerId: row.producerId,
          phone: row.producer.phone,
          message: body,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
      const next = { ...record, status: "opened" as MsgStatus, openedAt: now, updatedAt: now };
      setMessages((prev) => ({ ...prev, [row.id]: next }));
      if (modeRef.current === "live") void api.postOpened(row.id, row.producer.phone, body);
      return next;
    },
    [messages, template],
  );

  const markSent = useCallback((id: string) => {
    const now = new Date().toISOString();
    upsert(id, { status: "sent", sentAt: now, error: undefined });
    if (modeRef.current === "live") void api.postSent(id);
  }, [upsert]);

  const markFailed = useCallback((id: string, error: string) => {
    const now = new Date().toISOString();
    upsert(id, { status: "failed", failedAt: now, error });
    if (modeRef.current === "live") void api.postFailed(id, error);
  }, [upsert]);

  const markSkipped = useCallback((id: string) => {
    const now = new Date().toISOString();
    upsert(id, { status: "skipped", skippedAt: now });
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
      for (const id of ids) {
        if (next[id]) next[id] = { ...next[id], status: "sent", sentAt: now, updatedAt: now };
      }
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

  // ── CRUD: producers ───────────────────────────────────────────────────────
  const saveProducer = useCallback(
    async (input: ProducerInput): Promise<CrudResult> => {
      const body: api.MemberInput = { code: input.code, name: input.name, phone: input.phone, status: input.status };
      if (modeRef.current === "live") {
        const res = input.id ? await api.updateMember(input.id, body) : await api.createMember(body);
        if (!res) return { ok: false, error: "API unreachable — nothing was saved" };
        if (!res.ok) return { ok: false, error: String(res.data.error ?? "Save failed") };
        await loadMembers();
        return { ok: true };
      }
      // demo: session-only
      const list = demoMembers ?? PRODUCERS;
      if (list.some((p) => p.code.toLowerCase() === input.code.toLowerCase() && p.id !== input.id)) {
        return { ok: false, error: `Producer ID "${input.code}" already exists` };
      }
      const nextId = input.id ?? Math.max(0, ...list.map((p) => p.id)) + 1;
      const nextList: Producer[] = [
        ...list.filter((p) => p.id !== nextId),
        { id: nextId, code: input.code, name: input.name, phone: input.phone, village: "—", animal: "Mixed" as const, joined: "" },
      ].sort((a, b) => a.name.localeCompare(b.name));
      setDemoMembers(nextList);
      return { ok: true };
    },
    [demoMembers, loadMembers],
  );

  const deleteProducer = useCallback(
    async (id: number): Promise<CrudResult> => {
      if (modeRef.current === "live") {
        const res = await api.deleteMember(id);
        if (!res) return { ok: false, error: "API unreachable — nothing was deleted" };
        if (!res.ok) return { ok: false, error: String(res.data.error ?? "Delete failed") };
        await loadMembers();
        return { ok: true };
      }
      const hasEntries = (demoMembers ?? PRODUCERS).some(() => false) ||
        Object.entries(memberEntries).some(([pid, n]) => Number(pid) === id && n > 0);
      if (hasEntries) return { ok: false, error: "Producer has collection entries — delete those first" };
      setDemoMembers((demoMembers ?? PRODUCERS).filter((p) => p.id !== id));
      return { ok: true };
    },
    [demoMembers, loadMembers, memberEntries],
  );

  // ── CRUD: milk entries ────────────────────────────────────────────────────
  const saveEntry = useCallback(
    async (input: EntryFormInput): Promise<CrudResult> => {
      const body: api.EntryInput = {
        member_id: input.producerId,
        entry_date: input.date,
        shift: input.shift,
        milk_ltr: input.milkLtr,
        fat: input.fat,
        snf: input.snf,
        rate_per_ltr: input.rate,
        advance: input.advance,
      };
      if (modeRef.current === "live") {
        const numericId = input.id && !input.id.startsWith("demo") ? Number(input.id) : null;
        const res = numericId ? await api.updateMilkEntry(numericId, body) : await api.createMilkEntry(body);
        if (!res) return { ok: false, error: "API unreachable — nothing was saved" };
        if (!res.ok) return { ok: false, error: String(res.data.error ?? "Save failed") };
        await Promise.all([loadLive(input.date, false), loadMembers()]);
        return { ok: true };
      }
      // demo: session-only
      const producer = (demoMembers ?? PRODUCERS).find((p) => p.id === input.producerId);
      if (!producer) return { ok: false, error: "Producer not found" };
      const amount = round2(input.milkLtr * input.rate);
      const row: EnrichedRow = {
        id: input.id?.startsWith("demo") || !input.id ? `demo_${Date.now()}` : input.id,
        producerId: producer.id,
        producer,
        date: input.date,
        shift: input.shift,
        milkLtr: input.milkLtr,
        fat: input.fat,
        snf: input.snf,
        rate: input.rate,
        amount,
        advance: input.advance,
        net: round2(amount - input.advance),
      };
      const eid = input.id;
      if (eid) {
        if (eid.startsWith("demo")) {
          setEntryAdded((a) => [...a.filter((r) => r.id !== eid), row]);
        } else {
          setEntryPatches((p) => ({ ...p, [eid]: row }));
        }
      } else {
        setEntryAdded((a) => [...a, row]);
      }
      return { ok: true };
    },
    [demoMembers, loadLive, loadMembers],
  );

  const deleteEntry = useCallback(
    async (id: string): Promise<CrudResult> => {
      if (modeRef.current === "live" && !id.startsWith("demo")) {
        const res = await api.deleteMilkEntry(Number(id));
        if (!res) return { ok: false, error: "API unreachable — nothing was deleted" };
        if (!res.ok) return { ok: false, error: String(res.data.error ?? "Delete failed") };
        await loadLive(date, false);
        return { ok: true };
      }
      if (id.startsWith("demo")) {
        setEntryAdded((a) => a.filter((r) => r.id !== id));
      } else {
        setEntryDeleted((d) => [...d, id]);
      }
      return { ok: true };
    },
    [date, loadLive],
  );

  const value: AppState = {
    route,
    go: setRoute,
    date,
    setDate,
    rows,
    messages,
    template,
    prefs,
    toasts,
    toast,
    dismissToast,
    openMsg,
    markSent,
    markFailed,
    markSkipped,
    retryMsg,
    reopenMsg,
    bulkMarkSent,
    clearMessages,
    saveTemplate,
    savePrefs,
    messageFor,
    mode,
    refreshing,
    reconnect,
    refresh,
    producers,
    memberEntries,
    saveProducer,
    deleteProducer,
    saveEntry,
    deleteEntry,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
