import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_TEMPLATE, getCollections, producerById, toISO } from "./data";
import type { Collection, MsgStatus, Producer } from "./data";
import { renderTemplate } from "./utils";

export type Route = "dashboard" | "collection" | "sender" | "history" | "templates" | "export" | "settings";

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
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>("dashboard");
  const [date, setDate] = useState<string>(toISO(new Date()));
  const [messages, setMessages] = useState<Record<string, MsgRecord>>(() => load(LS_MESSAGES, {}));
  const [template, setTemplate] = useState<string>(() => load(LS_TEMPLATE, DEFAULT_TEMPLATE));
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...load(LS_PREFS, {}) }));
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

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

  const rows: EnrichedRow[] = useMemo(() => {
    const collections = getCollections(date);
    return collections.map((c) => ({
      ...c,
      producer: producerById.get(c.producerId)!,
      msg: messages[c.id],
    }));
  }, [date, messages]);

  const messageFor = useCallback(
    (row: EnrichedRow) => row.msg?.message ?? renderTemplate(template, row),
    [template],
  );

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
      const record: MsgRecord =
        existing ?? {
          id: `wa_${row.id.replace(/\|/g, "_")}`,
          collectionId: row.id,
          producerId: row.producerId,
          phone: row.producer.phone,
          message: renderTemplate(template, row),
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
      const next = { ...record, status: "opened" as MsgStatus, openedAt: now, updatedAt: now };
      setMessages((prev) => ({ ...prev, [row.id]: next }));
      return next;
    },
    [messages, template],
  );

  const markSent = useCallback((id: string) => {
    const now = new Date().toISOString();
    upsert(id, { status: "sent", sentAt: now, error: undefined });
  }, [upsert]);

  const markFailed = useCallback((id: string, error: string) => {
    const now = new Date().toISOString();
    upsert(id, { status: "failed", failedAt: now, error });
  }, [upsert]);

  const markSkipped = useCallback((id: string) => {
    const now = new Date().toISOString();
    upsert(id, { status: "skipped", skippedAt: now });
  }, [upsert]);

  const retryMsg = useCallback((id: string) => {
    upsert(id, { status: "pending", error: undefined, failedAt: undefined });
  }, [upsert]);

  const reopenMsg = useCallback((id: string) => {
    upsert(id, { status: "opened", openedAt: new Date().toISOString() });
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
  }, []);

  const clearMessages = useCallback(() => setMessages({}), []);
  const saveTemplate = useCallback((t: string) => setTemplate(t), []);
  const savePrefs = useCallback((p: Prefs) => setPrefs(p), []);

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
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
