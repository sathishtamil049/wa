// ════════════════════════════════════════════════════════════════════════
//  MilkPro WhatsApp Sender — Express API (read-only against milk data)
//  Run:  npm install → npm run db:test → npm run dev
//  Never modifies members / milk_entries / advances.
// ════════════════════════════════════════════════════════════════════════
import express from "express";
import cors from "cors";
import "dotenv/config";
import { pool, ping, safeConfig } from "./config/database.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json({ limit: "64kb" }));

/** Wrap async handlers so rejections hit the error middleware. */
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

// ── Health ──────────────────────────────────────────────────────────────
app.get("/api/health", h(async (_req, res) => {
  await ping();
  res.json({ status: "ok", db: safeConfig(), time: new Date().toISOString() });
}));

// ── Dashboard stats ─────────────────────────────────────────────────────
app.get("/api/dashboard", h(async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : today();
  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT me.member_id)                                   AS producers,
            COUNT(*)                                                       AS entries,
            COALESCE(SUM(me.milk_ltr), 0)                                  AS litres,
            COALESCE(SUM(me.amount), 0)                                    AS amount,
            COALESCE(SUM(COALESCE(a.amount, 0)), 0)                        AS advance,
            COALESCE(SUM(me.amount - COALESCE(a.amount, 0)), 0)            AS net,
            SUM(wm.status IS NULL OR wm.status = 'pending')                AS pending,
            SUM(wm.status = 'opened')                                      AS opened,
            SUM(wm.status = 'sent')                                        AS sent,
            SUM(wm.status = 'failed')                                      AS failed,
            SUM(wm.status = 'skipped')                                     AS skipped
     FROM milk_entries me
     JOIN members m        ON m.id = me.member_id
     LEFT JOIN advances a  ON a.member_id = me.member_id AND a.advance_date = me.entry_date
     LEFT JOIN whatsapp_messages wm ON wm.collection_id = me.id
     WHERE me.entry_date = ?`,
    [date],
  );
  res.json({ date, ...rows[0] });
}));

// ── Daily collection (filters: shift, status, q) ────────────────────────
app.get("/api/collection", h(async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : today();
  const shift = ["AM", "PM"].includes(req.query.shift) ? req.query.shift : "";
  const status = ["pending", "opened", "sent", "failed", "skipped"].includes(req.query.status) ? req.query.status : "";
  const q = String(req.query.q ?? "").trim();
  const [rows] = await pool.query(
    `SELECT me.id            AS collection_id,
            m.id             AS producer_id,
            m.member_code, m.name, m.phone,
            me.entry_date, me.shift, me.milk_ltr, me.fat, me.snf, me.rate_per_ltr, me.amount,
            COALESCE(a.amount, 0)                    AS advance_deduction,
            (me.amount - COALESCE(a.amount, 0))      AS net_payable,
            COALESCE(wm.status, 'pending')           AS wa_status,
            wm.opened_at, wm.sent_at, wm.failed_at, wm.error_message
     FROM milk_entries me
     JOIN members m        ON m.id = me.member_id
     LEFT JOIN advances a  ON a.member_id = me.member_id AND a.advance_date = me.entry_date
     LEFT JOIN whatsapp_messages wm ON wm.collection_id = me.id
     WHERE me.entry_date = :date
       AND (:shift  = '' OR me.shift = :shift)
       AND (:status = '' OR COALESCE(wm.status, 'pending') = :status)
       AND (:q = '' OR m.name LIKE :like OR m.member_code LIKE :like OR m.phone LIKE :like)
     ORDER BY m.name, me.shift`,
    { date, shift, status, q, like: `%${q}%` },
  );
  res.json({ date, count: rows.length, rows });
}));

// ── WhatsApp status endpoints (upsert; UNIQUE(collection_id) prevents dupes) ──
const touchStatus = async (collectionId, status, extra = {}) => {
  const [entry] = await pool.query(
    `SELECT me.id, me.member_id, m.phone
     FROM milk_entries me JOIN members m ON m.id = me.member_id
     WHERE me.id = ?`,
    [collectionId],
  );
  if (entry.length === 0) return null;
  const { member_id, phone } = entry[0];
  await pool.query(
    `INSERT INTO whatsapp_messages
       (producer_id, collection_id, phone, message, status, opened_at, sent_at, failed_at, error_message)
     VALUES (:producer_id, :collection_id, :phone, :message, :status,
             :opened_at, :sent_at, :failed_at, :error_message)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       opened_at     = IFNULL(VALUES(opened_at), opened_at),
       sent_at       = VALUES(sent_at),
       failed_at     = VALUES(failed_at),
       error_message = VALUES(error_message),
       message       = IF(VALUES(message) = '', message, VALUES(message))`,
    {
      producer_id: member_id,
      collection_id: collectionId,
      phone: String(extra.phone ?? phone).replace(/\D/g, "").slice(0, 20),
      message: String(extra.message ?? "").slice(0, 4000),
      status,
      opened_at: status === "opened" ? new Date() : null,
      sent_at: status === "sent" ? new Date() : null,
      failed_at: status === "failed" ? new Date() : null,
      error_message: status === "failed" ? String(extra.error ?? "").slice(0, 255) : null,
    },
  );
  return { collection_id: collectionId, status };
};

const cid = (req) => Number(req.params.collectionId);
const valid = (n) => Number.isInteger(n) && n > 0;

app.post("/api/whatsapp/message/:collectionId/opened", h(async (req, res) => {
  if (!valid(cid(req))) return res.status(400).json({ error: "Invalid collection id" });
  const r = await touchStatus(cid(req), "opened", req.body);
  r ? res.json(r) : res.status(404).json({ error: "Collection entry not found" });
}));
app.post("/api/whatsapp/message/:collectionId/sent", h(async (req, res) => {
  if (!valid(cid(req))) return res.status(400).json({ error: "Invalid collection id" });
  const r = await touchStatus(cid(req), "sent", req.body);
  r ? res.json(r) : res.status(404).json({ error: "Collection entry not found" });
}));
app.post("/api/whatsapp/message/:collectionId/failed", h(async (req, res) => {
  if (!valid(cid(req))) return res.status(400).json({ error: "Invalid collection id" });
  const r = await touchStatus(cid(req), "failed", req.body);
  r ? res.json(r) : res.status(404).json({ error: "Collection entry not found" });
}));
app.post("/api/whatsapp/message/:collectionId/skipped", h(async (req, res) => {
  if (!valid(cid(req))) return res.status(400).json({ error: "Invalid collection id" });
  const r = await touchStatus(cid(req), "skipped", req.body);
  r ? res.json(r) : res.status(404).json({ error: "Collection entry not found" });
}));

app.post("/api/whatsapp/messages/bulk-status", h(async (req, res) => {
  const { ids, status } = req.body ?? {};
  if (!Array.isArray(ids) || !["sent", "failed", "skipped", "pending"].includes(status)) {
    return res.status(400).json({ error: "Expected { ids: number[], status }" });
  }
  const col = { sent: "sent_at", failed: "failed_at" }[status];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let updated = 0;
    for (const id of ids.slice(0, 500)) {
      if (!valid(Number(id))) continue;
      const [r] = await conn.query(
        `UPDATE whatsapp_messages SET status = ?, ${col ? col + " = NOW()," : ""} error_message = NULL
         WHERE collection_id = ?`,
        [status, Number(id)],
      );
      updated += r.affectedRows;
    }
    await conn.commit();
    res.json({ updated });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// ── Message history ─────────────────────────────────────────────────────
app.get("/api/whatsapp/history", h(async (req, res) => {
  const from = isDate(req.query.from) ? req.query.from : "1970-01-01";
  const to = isDate(req.query.to) ? req.query.to : "2999-12-31";
  const status = ["pending", "opened", "sent", "failed", "skipped"].includes(req.query.status) ? req.query.status : "";
  const shift = ["AM", "PM"].includes(req.query.shift) ? req.query.shift : "";
  const producerId = Number(req.query.producer_id) || 0;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const [rows] = await pool.query(
    `SELECT wm.id, wm.collection_id, wm.phone, wm.message, wm.status,
            wm.opened_at, wm.sent_at, wm.failed_at, wm.error_message, wm.updated_at,
            m.name AS producer_name, m.member_code,
            me.entry_date, me.shift
     FROM whatsapp_messages wm
     JOIN members m      ON m.id = wm.producer_id
     JOIN milk_entries me ON me.id = wm.collection_id
     WHERE me.entry_date BETWEEN :from AND :to
       AND (:status = '' OR wm.status = :status)
       AND (:shift  = '' OR me.shift  = :shift)
       AND (:producer = 0 OR wm.producer_id = :producer)
     ORDER BY wm.updated_at DESC
     LIMIT :limit OFFSET :offset`,
    { from, to, status, shift, producer: producerId, limit, offset: (page - 1) * limit },
  );
  const [c] = await pool.query("SELECT COUNT(*) AS n FROM whatsapp_messages");
  res.json({ page, limit, total: c[0].n, rows });
}));

// ── Message template ────────────────────────────────────────────────────
app.get("/api/whatsapp/template", h(async (_req, res) => {
  const [rows] = await pool.query("SELECT v FROM settings WHERE k = 'message_template'");
  res.json({ template: rows[0]?.v ?? "" });
}));
app.put("/api/whatsapp/template", h(async (req, res) => {
  const template = String(req.body?.template ?? "").trim();
  if (template.length < 10 || template.length > 4000) {
    return res.status(400).json({ error: "Template must be 10–4000 characters" });
  }
  await pool.query(
    "INSERT INTO settings (k, v) VALUES ('message_template', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
    [template],
  );
  res.json({ saved: true });
}));

// ── Errors ──────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `No route: ${req.method} ${req.path}` }));
app.use((err, _req, res, _next) => {
  console.error(`[db] ${err.code ?? "ERR"}: ${err.message}`);
  res.status(500).json({
    error: "Database error",
    detail: err.code === "ER_ACCESS_DENIED_ERROR"
      ? "Check DB_USER / DB_PASSWORD in .env (XAMPP default: root, empty password)"
      : err.code === "ER_BAD_DB_ERROR"
        ? "Database not found — import database/schema.sql in phpMyAdmin"
        : err.code === "ECONNREFUSED"
          ? "MySQL is not running — start it from the XAMPP Control Panel"
          : "Run `npm run db:test` for a full diagnosis",
  });
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`\n🥛 MilkPro API listening on http://localhost:${PORT}`);
  console.log(`   DB config: ${JSON.stringify(safeConfig())}\n`);
});
