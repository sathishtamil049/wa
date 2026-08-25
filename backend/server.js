// ════════════════════════════════════════════════════════════════════════
//  MilkPro WhatsApp Sender — Express API (Express + MySQL / MariaDB)
//  Run:  npm install → npm run db:test → npm run dev
//
//  READ endpoints never modify milk data. WRITE endpoints (producers,
//  milk entries, advances, WhatsApp statuses) use parameterized queries
//  with positional placeholders only — works with any mysql2 config.
// ════════════════════════════════════════════════════════════════════════
import express from "express";
import cors from "cors";
import "dotenv/config";
import { pool, ping, safeConfig } from "./config/database.js";

const app = express();
// Dev-friendly CORS: mirrors the caller when CORS_ORIGIN is empty/unset.
app.use(cors({ origin: process.env.CORS_ORIGIN?.trim() ? process.env.CORS_ORIGIN.split(",") : true }));
app.use(express.json({ limit: "64kb" }));

/** Wrap async handlers so rejections hit the error middleware. */
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

// ── tiny validators ─────────────────────────────────────────────────────
const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const bad = (res, msg) => res.status(400).json({ error: msg });

// ── Health ──────────────────────────────────────────────────────────────
app.get("/api/health", h(async (_req, res) => {
  await ping();
  res.json({ status: "ok", db: safeConfig(), time: new Date().toISOString() });
}));

// ── Dashboard stats ─────────────────────────────────────────────────────
app.get("/api/dashboard", h(async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : today();
  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT me.member_id)                        AS producers,
            COUNT(*)                                            AS entries,
            COALESCE(SUM(me.milk_ltr), 0)                       AS litres,
            COALESCE(SUM(me.amount), 0)                         AS amount,
            COALESCE(SUM(COALESCE(a.amount, 0)), 0)             AS advance,
            COALESCE(SUM(me.amount - COALESCE(a.amount, 0)), 0) AS net,
            SUM(wm.status IS NULL OR wm.status = 'pending')     AS pending,
            SUM(wm.status = 'opened')                           AS opened,
            SUM(wm.status = 'sent')                             AS sent,
            SUM(wm.status = 'failed')                           AS failed,
            SUM(wm.status = 'skipped')                          AS skipped
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
  const q = String(req.query.q ?? "").trim().slice(0, 60);
  const [rows] = await pool.query(
    `SELECT me.id            AS collection_id,
            m.id             AS producer_id,
            m.member_code, m.name, m.phone,
            me.entry_date, me.shift, me.milk_ltr, me.fat, me.snf, me.rate_per_ltr, me.amount,
            COALESCE(a.amount, 0)               AS advance_deduction,
            (me.amount - COALESCE(a.amount, 0)) AS net_payable,
            COALESCE(wm.status, 'pending')      AS wa_status,
            wm.opened_at, wm.sent_at, wm.failed_at, wm.error_message
     FROM milk_entries me
     JOIN members m        ON m.id = me.member_id
     LEFT JOIN advances a  ON a.member_id = me.member_id AND a.advance_date = me.entry_date
     LEFT JOIN whatsapp_messages wm ON wm.collection_id = me.id
     WHERE me.entry_date = ?
       AND (? = '' OR me.shift = ?)
       AND (? = '' OR COALESCE(wm.status, 'pending') = ?)
       AND (? = '' OR m.name LIKE ? OR m.member_code LIKE ? OR m.phone LIKE ?)
     ORDER BY m.name, me.shift`,
    [date, shift, shift, status, status, q, `%${q}%`, `%${q}%`, `%${q}%`],
  );
  res.json({ date, count: rows.length, rows });
}));

// ══════════ PRODUCERS (members) — full CRUD ═════════════════════════════

app.get("/api/members", h(async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 60);
  const status = ["active", "inactive"].includes(req.query.status) ? req.query.status : "";
  const [rows] = await pool.query(
    `SELECT m.id, m.member_code AS code, m.name, m.phone, m.status,
            (SELECT COUNT(*) FROM milk_entries me WHERE me.member_id = m.id) AS entries
     FROM members m
     WHERE (? = '' OR m.status = ?)
       AND (? = '' OR m.name LIKE ? OR m.member_code LIKE ? OR m.phone LIKE ?)
     ORDER BY m.name`,
    [status, status, q, `%${q}%`, `%${q}%`, `%${q}%`],
  );
  res.json({ count: rows.length, rows });
});

/** Validates a member payload; returns clean object or an error string. */
const cleanMember = (b) => {
  const code = String(b?.code ?? "").trim().slice(0, 20);
  const name = String(b?.name ?? "").trim().slice(0, 100);
  const phone = String(b?.phone ?? "").replace(/\D/g, "").slice(0, 15);
  const status = b?.status === "inactive" ? "inactive" : "active";
  if (code.length < 2) return { error: "Producer ID must be at least 2 characters" };
  if (name.length < 2) return { error: "Name must be at least 2 characters" };
  if (phone.length < 10) return { error: "Phone must be at least 10 digits" };
  return { code, name, phone, status };
};

app.post("/api/members", h(async (req, res) => {
  const c = cleanMember(req.body);
  if (c.error) return bad(res, c.error);
  try {
    const [r] = await pool.query(
      "INSERT INTO members (member_code, name, phone, status) VALUES (?, ?, ?, ?)",
      [c.code, c.name, c.phone, c.status],
    );
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `Producer ID "${c.code}" already exists` });
    throw e;
  }
}));

app.put("/api/members/:id", h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return bad(res, "Invalid producer id");
  const c = cleanMember(req.body);
  if (c.error) return bad(res, c.error);
  try {
    const [r] = await pool.query(
      "UPDATE members SET member_code = ?, name = ?, phone = ?, status = ? WHERE id = ?",
      [c.code, c.name, c.phone, c.status, id],
    );
    r.affectedRows ? res.json({ ok: true }) : res.status(404).json({ error: "Producer not found" });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `Producer ID "${c.code}" already exists` });
    throw e;
  }
}));

app.delete("/api/members/:id", h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return bad(res, "Invalid producer id");
  const [c] = await pool.query("SELECT COUNT(*) AS n FROM milk_entries WHERE member_id = ?", [id]);
  if (c[0].n > 0) {
    return res.status(409).json({ error: `Producer has ${c[0].n} collection entries — delete those first (or mark the producer Inactive)` });
  }
  const [r] = await pool.query("DELETE FROM members WHERE id = ?", [id]);
  r.affectedRows ? res.json({ ok: true }) : res.status(404).json({ error: "Producer not found" });
}));

// kept for older frontends
app.get("/api/producers", h(async (_req, res) => {
  const [rows] = await pool.query(
    "SELECT id, member_code AS code, name, phone FROM members WHERE status = 'active' ORDER BY name",
  );
  res.json({ count: rows.length, rows });
}));

// ══════════ MILK ENTRIES — add / edit / delete ══════════════════════════

const cleanEntry = (b) => {
  const member_id = Number(b?.member_id ?? b?.producer_id);
  const entry_date = String(b?.entry_date ?? "").slice(0, 10);
  const shift = b?.shift === "PM" ? "PM" : "AM";
  const milk_ltr = num(b?.milk_ltr, 0.1, 999);
  const fat = num(b?.fat, 1, 15);
  const snf = num(b?.snf, 5, 12);
  const rate = num(b?.rate_per_ltr, 1, 999);
  const advance = num(b?.advance ?? b?.advance_deduction ?? 0, 0, 999999) ?? 0;
  if (!Number.isInteger(member_id) || member_id <= 0) return { error: "Choose a producer" };
  if (!isDate(entry_date)) return { error: "Invalid date" };
  if (milk_ltr === null) return { error: "Milk litres must be between 0.1 and 999" };
  if (fat === null) return { error: "FAT must be between 1 and 15" };
  if (snf === null) return { error: "SNF must be between 5 and 12" };
  if (rate === null) return { error: "Rate must be between ₹1 and ₹999" };
  return { member_id, entry_date, shift, milk_ltr, fat, snf, rate, advance };
};

/** Upsert the day's advance for a member (0 removes it). */
const upsertAdvance = async (conn, member_id, advance_date, amount) => {
  const [ex] = await conn.query("SELECT id FROM advances WHERE member_id = ? AND advance_date = ?", [member_id, advance_date]);
  if (amount <= 0) {
    if (ex.length) await conn.query("DELETE FROM advances WHERE id = ?", [ex[0].id]);
    return;
  }
  if (ex.length) {
    await conn.query("UPDATE advances SET amount = ? WHERE id = ?", [amount, ex[0].id]);
  } else {
    await conn.query("INSERT INTO advances (member_id, amount, advance_date) VALUES (?, ?, ?)", [member_id, amount, advance_date]);
  }
};

app.post("/api/milk-entries", h(async (req, res) => {
  const c = cleanEntry(req.body);
  if (c.error) return bad(res, c.error);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO milk_entries (member_id, entry_date, shift, milk_ltr, fat, snf, rate_per_ltr, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(? * ?, 2))`,
      [c.member_id, c.entry_date, c.shift, c.milk_ltr, c.fat, c.snf, c.rate, c.milk_ltr, c.rate],
    );
    await upsertAdvance(conn, c.member_id, c.entry_date, c.advance);
    await conn.commit();
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

app.put("/api/milk-entries/:id", h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return bad(res, "Invalid entry id");
  const c = cleanEntry(req.body);
  if (c.error) return bad(res, c.error);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `UPDATE milk_entries
          SET member_id = ?, entry_date = ?, shift = ?, milk_ltr = ?, fat = ?, snf = ?,
              rate_per_ltr = ?, amount = ROUND(? * ?, 2)
        WHERE id = ?`,
      [c.member_id, c.entry_date, c.shift, c.milk_ltr, c.fat, c.snf, c.rate, c.milk_ltr, c.rate, id],
    );
    if (!r.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ error: "Entry not found" });
    }
    await upsertAdvance(conn, c.member_id, c.entry_date, c.advance);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

app.delete("/api/milk-entries/:id", h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return bad(res, "Invalid entry id");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM whatsapp_messages WHERE collection_id = ?", [id]);
    const [r] = await conn.query("DELETE FROM milk_entries WHERE id = ?", [id]);
    await conn.commit();
    r.affectedRows ? res.json({ ok: true }) : res.status(404).json({ error: "Entry not found" });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// ══════════ WHATSAPP STATUSES ═══════════════════════════════════════════

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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       opened_at     = IFNULL(VALUES(opened_at), opened_at),
       sent_at       = VALUES(sent_at),
       failed_at     = VALUES(failed_at),
       error_message = VALUES(error_message),
       message       = IF(VALUES(message) = '', message, VALUES(message))`,
    [
      member_id,
      collectionId,
      String(extra.phone ?? phone).replace(/\D/g, "").slice(0, 20),
      String(extra.message ?? "").slice(0, 4000),
      status,
      status === "opened" ? new Date() : null,
      status === "sent" ? new Date() : null,
      status === "failed" ? new Date() : null,
      status === "failed" ? String(extra.error ?? "").slice(0, 255) : null,
    ],
  );
  return { collection_id: collectionId, status };
};

const cid = (req) => Number(req.params.collectionId);
const valid = (n) => Number.isInteger(n) && n > 0;

app.post("/api/whatsapp/message/:collectionId/opened", h(async (req, res) => {
  if (!valid(cid(req))) return bad(res, "Invalid collection id");
  const r = await touchStatus(cid(req), "opened", req.body);
  r ? res.json(r) : res.status(404).json({ error: "Collection entry not found" });
}));
app.post("/api/whatsapp/message/:collectionId/sent", h(async (req, res) => {
  if (!valid(cid(req))) return bad(res, "Invalid collection id");
  const r = await touchStatus(cid(req), "sent", req.body);
  r ? res.json(r) : res.status(404).json({ error: "Collection entry not found" });
}));
app.post("/api/whatsapp/message/:collectionId/failed", h(async (req, res) => {
  if (!valid(cid(req))) return bad(res, "Invalid collection id");
  const r = await touchStatus(cid(req), "failed", req.body);
  r ? res.json(r) : res.status(404).json({ error: "Collection entry not found" });
}));
app.post("/api/whatsapp/message/:collectionId/skipped", h(async (req, res) => {
  if (!valid(cid(req))) return bad(res, "Invalid collection id");
  const r = await touchStatus(cid(req), "skipped", req.body);
  r ? res.json(r) : res.status(404).json({ error: "Collection entry not found" });
}));

app.post("/api/whatsapp/messages/bulk-status", h(async (req, res) => {
  const { ids, status } = req.body ?? {};
  if (!Array.isArray(ids) || !["sent", "failed", "skipped", "pending"].includes(status)) {
    return bad(res, "Expected { ids: number[], status }");
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
     JOIN members m       ON m.id = wm.producer_id
     JOIN milk_entries me ON me.id = wm.collection_id
     WHERE me.entry_date BETWEEN ? AND ?
       AND (? = '' OR wm.status = ?)
       AND (? = '' OR me.shift = ?)
       AND (? = 0 OR wm.producer_id = ?)
     ORDER BY wm.updated_at DESC
     LIMIT ? OFFSET ?`,
    [from, to, status, status, shift, shift, producerId, producerId, limit, (page - 1) * limit],
  );
  const [c] = await pool.query("SELECT COUNT(*) AS n FROM whatsapp_messages");
  res.json({ page, limit, total: c[0].n, rows });
}));

app.get("/api/whatsapp/history-counts", h(async (req, res) => {
  const from = isDate(req.query.from) ? req.query.from : "1970-01-01";
  const to = isDate(req.query.to) ? req.query.to : "2999-12-31";
  const [rows] = await pool.query(
    `SELECT wm.status, COUNT(*) AS n
       FROM whatsapp_messages wm
       JOIN milk_entries me ON me.id = wm.collection_id
      WHERE me.entry_date BETWEEN ? AND ?
      GROUP BY wm.status`,
    [from, to],
  );
  const out = { pending: 0, opened: 0, sent: 0, failed: 0, skipped: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  res.json(out);
}));

// ── Message template ────────────────────────────────────────────────────
app.get("/api/whatsapp/template", h(async (_req, res) => {
  const [rows] = await pool.query("SELECT v FROM settings WHERE k = 'message_template'");
  res.json({ template: rows[0]?.v ?? "" });
}));
app.put("/api/whatsapp/template", h(async (req, res) => {
  const template = String(req.body?.template ?? "").trim();
  if (template.length < 10 || template.length > 4000) {
    return bad(res, "Template must be 10–4000 characters");
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
    detail:
      err.code === "ER_ACCESS_DENIED_ERROR"
        ? "Check DB_USER / DB_PASSWORD (XAMPP default: root, empty password)"
        : err.code === "ER_BAD_DB_ERROR"
          ? "Database not found — check DB_NAME (cPanel adds a yourname_ prefix)"
          : err.code === "ER_NO_SUCH_TABLE"
            ? "Tables missing — import database/schema.sql (select your database in phpMyAdmin first)"
            : err.code === "ECONNREFUSED"
              ? "MySQL is not running"
              : "Run `npm run db:test` for a full diagnosis",
  });
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`\n🥛 MilkPro API listening on http://localhost:${PORT}`);
  console.log(`   DB config: ${JSON.stringify(safeConfig())}\n`);
});
