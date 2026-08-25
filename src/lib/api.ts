// ── MilkPro API client ─────────────────────────────────────────────────────
// Talks to the Express backend (backend/server.js). Every call is fail-soft:
// on timeout / network error it returns null so the app drops to demo mode.
// Override the base URL with VITE_API_URL in a .env at the project root.

import type { MsgStatus } from "./data";
import type { EnrichedRow, MsgRecord } from "./store";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

// Runtime override: edit /config.js (public/config.js in this repo) to point
// at a different API without rebuilding — handy for cPanel uploads.
declare global {
  interface Window {
    __MILKPRO_API__?: string;
  }
}

export const API_BASE: string = (
  (typeof window !== "undefined" && window.__MILKPRO_API__) ||
  env.VITE_API_URL ||
  "http://localhost:3001"
).replace(/\/+$/, "");

export interface HistoryApiRow {
  id: string;
  collectionId: string;
  producerName: string;
  producerCode: string;
  phone: string;
  date: string;
  shift: "AM" | "PM";
  message: string;
  status: MsgStatus;
  openedAt?: string;
  sentAt?: string;
  failedAt?: string;
  error?: string;
  updatedAt: string;
}

async function req<T>(path: string, init?: RequestInit, timeoutMs = 3500): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

const post = (path: string, body?: unknown) =>
  req<{ ok?: boolean }>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

const slice10 = (v: unknown): string => {
  const s = String(v ?? "");
  // dateStrings:true returns "YYYY-MM-DD HH:MM:SS"; be tolerant of ISO too.
  return s.length >= 10 ? s.slice(0, 10) : s;
};
const toTime = (v: unknown): string | undefined => {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2} /.test(s)) return new Date(s.replace(" ", "T")).toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

// ── health / meta ──────────────────────────────────────────────────────────
export async function health(): Promise<{ db?: Record<string, unknown> } | null> {
  const j = await req<{ status?: string; db?: Record<string, unknown> }>("/api/health", undefined, 2500);
  return j?.status === "ok" ? { db: j.db } : null;
}

export async function fetchProducers(): Promise<Array<{ id: number; code: string; name: string; phone: string }> | null> {
  const j = await req<{ rows?: Array<{ id: number; code: string; name: string; phone: string }> }>("/api/producers");
  return j?.rows ?? null;
}

// ── collection ─────────────────────────────────────────────────────────────
interface ApiCollectionRow {
  collection_id: number;
  producer_id: number;
  member_code: string;
  name: string;
  phone: string | number;
  entry_date: string;
  shift: "AM" | "PM";
  milk_ltr: string | number;
  fat: string | number;
  snf: string | number;
  rate_per_ltr: string | number;
  amount: string | number;
  advance_deduction: string | number;
  net_payable: string | number;
  wa_status: MsgStatus | null;
  opened_at?: string;
  sent_at?: string;
  failed_at?: string;
  error_message?: string | null;
}

function mapCollectionRow(r: ApiCollectionRow): EnrichedRow {
  const id = String(r.collection_id);
  let msg: MsgRecord | undefined;
  if (r.wa_status) {
    msg = {
      id: `wa_${id}`,
      collectionId: id,
      producerId: r.producer_id,
      phone: String(r.phone),
      message: "", // snapshot lives server-side; UI renders from template
      status: r.wa_status,
      openedAt: toTime(r.opened_at),
      sentAt: toTime(r.sent_at),
      failedAt: toTime(r.failed_at),
      error: r.error_message ?? undefined,
      createdAt: "",
      updatedAt: toTime(r.sent_at) ?? toTime(r.opened_at) ?? new Date().toISOString(),
    };
  }
  return {
    id,
    producerId: r.producer_id,
    producer: { id: r.producer_id, code: r.member_code, name: r.name, phone: String(r.phone), village: "—", animal: "Mixed", joined: "" },
    date: slice10(r.entry_date),
    shift: r.shift,
    milkLtr: Number(r.milk_ltr),
    fat: Number(r.fat),
    snf: Number(r.snf),
    rate: Number(r.rate_per_ltr),
    amount: Number(r.amount),
    advance: Number(r.advance_deduction),
    net: Number(r.net_payable),
    msg,
  };
}

export async function fetchCollection(date: string): Promise<EnrichedRow[] | null> {
  const j = await req<{ rows?: ApiCollectionRow[] }>(`/api/collection?date=${encodeURIComponent(date)}`);
  if (!j?.rows) return null;
  return j.rows.map(mapCollectionRow);
}

// ── whatsapp status writes ─────────────────────────────────────────────────
export const postOpened = (collectionId: string, phone: string, message: string) =>
  post(`/api/whatsapp/message/${collectionId}/opened`, { phone, message });
export const postSent = (collectionId: string) => post(`/api/whatsapp/message/${collectionId}/sent`);
export const postFailed = (collectionId: string, error: string) =>
  post(`/api/whatsapp/message/${collectionId}/failed`, { error });
export const postSkipped = (collectionId: string) => post(`/api/whatsapp/message/${collectionId}/skipped`);
export const postBulkStatus = (ids: string[], status: MsgStatus) =>
  post("/api/whatsapp/messages/bulk-status", { ids: ids.map(Number).filter((n) => n > 0), status });

// ── history ────────────────────────────────────────────────────────────────
export interface HistoryQuery {
  from?: string;
  to?: string;
  status?: "ALL" | MsgStatus;
  shift?: "ALL" | "AM" | "PM";
  producerId?: "ALL" | number;
  page?: number;
  limit?: number;
}

export async function fetchHistory(q: HistoryQuery): Promise<{ rows: HistoryApiRow[]; total: number } | null> {
  const p = new URLSearchParams();
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.status && q.status !== "ALL") p.set("status", q.status);
  if (q.shift && q.shift !== "ALL") p.set("shift", q.shift);
  if (q.producerId && q.producerId !== "ALL") p.set("producer_id", String(q.producerId));
  p.set("page", String(q.page ?? 1));
  p.set("limit", String(q.limit ?? 8));
  const j = await req<{ total?: number; rows?: Array<Record<string, unknown>> }>(`/api/whatsapp/history?${p.toString()}`);
  if (!j?.rows) return null;
  const rows = j.rows.map((r): HistoryApiRow => ({
    id: String(r.collection_id),
    collectionId: String(r.collection_id),
    producerName: String(r.producer_name ?? ""),
    producerCode: String(r.member_code ?? ""),
    phone: String(r.phone ?? ""),
    date: slice10(r.entry_date),
    shift: (r.shift as "AM" | "PM") ?? "AM",
    message: String(r.message ?? ""),
    status: (r.status as MsgStatus) ?? "pending",
    openedAt: toTime(r.opened_at),
    sentAt: toTime(r.sent_at),
    failedAt: toTime(r.failed_at),
    error: (r.error_message as string) ?? undefined,
    updatedAt: toTime(r.updated_at) ?? new Date().toISOString(),
  }));
  return { rows, total: Number(j.total ?? rows.length) };
}

export async function fetchHistoryCounts(from?: string, to?: string): Promise<Record<MsgStatus, number> | null> {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  const j = await req<Record<string, number>>(`/api/whatsapp/history-counts?${p.toString()}`);
  if (!j) return null;
  return {
    pending: Number(j.pending ?? 0),
    opened: Number(j.opened ?? 0),
    sent: Number(j.sent ?? 0),
    failed: Number(j.failed ?? 0),
    skipped: Number(j.skipped ?? 0),
  };
}

// ── template ───────────────────────────────────────────────────────────────
export async function fetchTemplate(): Promise<string | null> {
  const j = await req<{ template?: string }>("/api/whatsapp/template");
  return j?.template?.trim() ? j.template : null;
}
export async function putTemplate(template: string): Promise<boolean> {
  const j = await req<{ saved?: boolean }>("/api/whatsapp/template", {
    method: "PUT",
    body: JSON.stringify({ template }),
  });
  return j?.saved === true;
}

// ── CRUD: like `req` but also parses error bodies on 4xx ──────────────────
interface CrudResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

async function crud(path: string, init?: RequestInit): Promise<CrudResult | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON body */
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface MemberApi {
  id: number;
  code: string;
  name: string;
  phone: string;
  status: "active" | "inactive";
  entries: number;
}

export interface MemberInput {
  code: string;
  name: string;
  phone: string;
  status: "active" | "inactive";
}

export interface EntryInput {
  member_id: number;
  entry_date: string;
  shift: "AM" | "PM";
  milk_ltr: number;
  fat: number;
  snf: number;
  rate_per_ltr: number;
  advance: number;
}

export async function fetchMembers(q = "", status: "ALL" | "active" | "inactive" = "ALL"): Promise<MemberApi[] | null> {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (status !== "ALL") p.set("status", status);
  const j = await req<{ rows?: MemberApi[] }>(`/api/members?${p.toString()}`);
  return j?.rows ?? null;
}

export const createMember = (body: MemberInput) => crud("/api/members", { method: "POST", body: JSON.stringify(body) });
export const updateMember = (id: number, body: MemberInput) =>
  crud(`/api/members/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteMember = (id: number) => crud(`/api/members/${id}`, { method: "DELETE" });

export const createMilkEntry = (body: EntryInput) => crud("/api/milk-entries", { method: "POST", body: JSON.stringify(body) });
export const updateMilkEntry = (id: number, body: EntryInput) =>
  crud(`/api/milk-entries/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteMilkEntry = (id: number) => crud(`/api/milk-entries/${id}`, { method: "DELETE" });
