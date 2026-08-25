// ════════════════════════════════════════════════════════════════════════
//  MilkPro WhatsApp Sender — Express API (MySQL / MariaDB, XAMPP + cPanel)
//  Run:  npm install → npm run db:test → npm run dev
//  v2: auto-heals missing tables/columns at boot, producer & entry CRUD.
// ════════════════════════════════════════════════════════════════════════
import express from "express";
import cors from "cors";
import "dotenv/config";
import { pool, ping, safeConfig } from "./config/database.js";

const app = express();
// CORS_ORIGIN empty/absent → mirror the requesting origin (dev + cPanel friendly)
const origins = (process.env.CORS_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: "64kb" }));

const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");
const round2 = (n) => Math.round(n * 100) / 100;

// ── Schema auto-heal (safe to re-run; never touches existing rows) ────────
async function ensureSchema() {
  const run = async (sql) => { try { await pool.query(sql); return true; } catch (e) { return e; } };

  await run(`CREATE TABLE IF NOT EXISTS members (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    member_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    village VARCHAR(60) NULL,
    animal ENUM('Buffalo','Cow','Mixed') NOT NULL DEFAULT 'Mixed',
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await run(`CREATE TABLE IF NOT EXISTS milk_entries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    member_id INT UNSIGNED NOT NULL,
    entry_date DATE NOT NULL,
    shift ENUM('AM','PM') NOT NULL,
    milk_ltr DECIMAL(8,2) NOT NULL DEFAULT 0,
    fat DECIMAL(4,1) NOT NULL DEFAULT 0,
    snf DECIMAL(4,1) NOT NULL DEFAULT 0,
    rate_per_ltr DECIMAL(8,2) NOT NULL DEFAULT 0,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_date_shift (entry_date, shift)
  ) ENGINE=InnoDB`);

  await run(`CREATE TABLE IF NOT EXISTS advances (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    member_id INT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    advance_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_member_date (member_id, advance_date)
  ) ENGINE=InnoDB`);

  await run(`CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    producer_id INT UNSIGNED NOT NULL,
    collection_id INT UNSIGNED NOT NULL,
    phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('pending','opened','sent','failed','skipped') NOT NULL DEFAULT 'pending',
    opened_at DATETIME NULL,
    sent_at DATETIME NULL,
    failed_at DATETIME NULL,
    error_message VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_collection (collection_id),
    KEY idx_producer (producer_id),
    KEY idx_status (status)
  ) ENGINE=InnoDB`);

  await run(`CREATE TABLE IF NOT EXISTS settings (
    k VARCHAR(64) PRIMARY KEY,
    v TEXT NOT NULL
  ) ENGINE=InnoDB`);

  // Upgrade older databases: add newer columns (1060 = column already exists)
  for (const sql of [
    "ALTER TABLE members ADD COLUMN village VARCHAR(60) NULL",
    "ALTER TABLE members ADD COLUMN animal ENUM('Buffalo','Cow','Mixed') NOT NULL DEFAULT 'Mixed'",
    "ALTER TABLE members ADD COLUMN status ENUM('active','inactive') NOT NULL DEFAULT 'active'",
  ]) {
    const r = await run(sql);
    if (r !== true && r?.errno !== 1060) console.warn(`[schema] ${r.message}`);
  }

  // One entry per member/date/shift (1061 = key exists, 1062 = rows conflict)
  const uk = await run("ALTER TABLE milk_entries ADD UNIQUE KEY uq_member_date_shift (member_id, entry_date, shift)");
  if (uk !== true && uk?.errno !== 1061 && uk?.errno !== 1062) console.warn(`[schema] ${uk.message}`);

  await run(`INSERT INTO settings (k, v) VALUES ('message_template',
    'Hello {producer_name},\\n\\nToday''s Milk Collection\\n\\nDate: {date}\\nShift: {shift}\\nMilk: {milk_ltr} Ltr\\nFAT: {fat}\\nSNF: {snf}\\nRate: ₹{rate_per_ltr}/Ltr\\n\\nMilk Amount: ₹{milk_amount}\\nAdvance Deduction: ₹{advance_deduction}\\nNet Payable: ₹{net_payable}\\n\\nThank you.\\nMilk Producers Management System')
    ON DUPLICATE KEY UPDATE k = k`);
}

// ── Health & diagnostics ──────────────────────────────────────────────────
app.get("/api/health", h(async (_req, res) => {
  await ping();
  res.json({ status: "ok", db: safeConfig(), time: new Date().toISOString() });
}));

app.get("/api/diagnose", h(async (_req, res) => {
  const tables = ["members", "milk_entries", "advances", "whatsapp_messages", "settings"];
  const report = {};
  for (const t of tables) {
    try {
      const [r] = await pool.query(`SELECT COUNT(*) AS n FROM ${t}`);
      report[t] = { ok: true, rows: Number(r[0].n) };
    } catch (e) {
      report[t] = { ok: false, error: e.code ?? e.message };
    }
  }
  const missing = tables.filter((t) => !report[t].ok);
  res.json({
    status: missing.length ? "degraded" : "ok",
    missing_tables: missing,
    tables: report,
    db: safeConfig(),
    hint: missing.length
      ? "Restart the app once (schema auto-heals at boot) or import database/schema.sql in phpMyAdmin."
      : "All tables present.",
  });
}));

// ── Dashboard stats ───────────────────────────────────────────────────────
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

// ── Daily collection (filters: shift, status, q) ──────────────────────────
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

// ── Schema inspector: shows the REAL column names of your existing tables ──
// Use this to adapt the SQL queries when your database predates schema.sql.
app.get("/api/inspect", h(async (_req, res) => {
  const [dbRows] = await pool.query("SELECT DATABASE() AS db");
  const tables = ["members", "milk_entries", "advances", "whatsapp_messages", "settings"];
  const report = { database: dbRows[0]?.db, tables: {} };
  for (const t of tables) {
    try {
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`${t}\``);
      report.tables[t] = cols.map((c) => ({ column: c.Field, type: c.Type, null: c.Null === "YES", key: c.Key, default: c.Default }));
    } catch {
      report.tables[t] = null; // table missing
    }
  }
  res.json(report);
}));

// ── Producer directory + CRUD ─────────────────────────────────────────────
app.get("/api/producers", h(async (req, res) => {
  const all = req.query.all === "1";
  const [rows] = await pool.query(
    `SELECT m.id, m.member_code AS code, m.name, m.phone, m.village, m.animal, m.status,
            DATE(m.created_at) AS joined,
            (SELECT COUNT(*) FROM milk_entries me WHERE me.member_id = m.id AND me.entry_date = CURDATE()) AS entries_today
     FROM members m ${all ? "" : "WHERE m.status = 'active'"}
     ORDER BY m.name`,
  );
  res.json({ count: rows.length, rows });
}));

const producerRules = (b) => {
  const name = String(b?.name ?? "").trim();
  const code = String(b?.code ?? "").trim();
  const phone = String(b?.phone ?? "").replace(/\D/g, "");
  const village = String(b?.village ?? "").trim().slice(0, 60) || null;
  const animal = ["Buffalo", "Cow", "Mixed"].includes(b?.animal) ? b.animal : "Mixed";
  if (name.length < 2 || name.length > 60) return { error: "Name must be 2–60 characters" };
  if (!/^[A-Za-z0-9-]{2,20}$/.test(code)) return { error: "Code must be 2–20 letters/digits (e.g. MP-027)" };
  if (!/^\d{10,13}$/.test(phone)) return { error: "Phone must be 10–13 digits" };
  return { name, code, phone, village, animal };
};

app.post("/api/producers", h(async (req, res) => {
  const v = producerRules(req.body);
  if (v.error) return res.status(400).json(v);
  const [dup] = await pool.query(
    "SELECT id FROM members WHERE member_code = ? OR phone = ? LIMIT 1", [v.code, v.phone]);
  if (dup.length) return res.status(409).json({ error: "A producer with this code or phone already exists" });
  const [r] = await pool.query(
    "INSERT INTO members (member_code, name, phone, village, animal, status) VALUES (?, ?, ?, ?, ?, 'active')",
    [v.code, v.name, v.phone, v.village, v.animal]);
  res.status(201).json({ id: r.insertId, ...v, status: "active" });
}));

app.put("/api/producers/:id", h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  const v = producerRules(req.body);
  if (v.error) return res.status(400).json(v);
  const status = req.body?.status === "inactive" ? "inactive" : "active";
  const [dup] = await pool.query(
    "SELECT id FROM members WHERE (member_code = ? OR phone = ?) AND id <> ? LIMIT 1", [v.code, v.phone, id]);
  if (dup.length) return res.status(409).json({ error: "Another producer already uses this code or phone" });
  await pool.query(
    "UPDATE members SET member_code = ?, name = ?, phone = ?, village = ?, animal = ?, status = ? WHERE id = ?",
    [v.code, v.name, v.phone, v.village, v.animal, status, id]);
  res.json({ id, ...v, status });
}));

app.delete("/api/producers/:id", h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  if (req.query.hard === "1") {
    const [refs] = await pool.query("SELECT COUNT(*) AS n FROM milk_entries WHERE member_id = ?", [id]);
    if (Number(refs[0].n) > 0) {
      return res.status(409).json({ error: "This producer has milk history — deactivating instead of deleting keeps accounts correct. Use ?hard=1 only on fresh records." });
    }
    await pool.query("DELETE FROM members WHERE id = ?", [id]);
    return res.json({ deleted: true, id });
  }
  await pool.query("UPDATE members SET status = 'inactive' WHERE id = ?", [id]);
  res.json({ deactivated: true, id });
}));

// ── Milk entry CRUD (amount always computed server-side) ──────────────────
const entryRules = (b) => {
  const member_id = Number(b?.member_id ?? b?.producer_id);
  const entry_date = String(b?.entry_date ?? b?.date ?? "");
  const shift = ["AM", "PM"].includes(b?.shift) ? b.shift : null;
  const milk_ltr = Number(b?.milk_ltr);
  const fat = Number(b?.fat);
  const snf = Number(b?.snf);
  const rate_per_ltr = Number(b?.rate_per_ltr ?? b?.rate);
  if (!Number.isInteger(member_id) || member_id <= 0) return { error: "Choose a producer" };
  if (!isDate(entry_date)) return { error: "Invalid date" };
  if (!shift) return { error: "Shift must be AM or PM" };
  if (!(milk_ltr > 0 && milk_ltr <= 5000)) return { error: "Milk litres must be between 0.1 and 5000" };
  if (!(fat >= 0 && fat <= 15)) return { error: "FAT must be 0–15" };
  if (!(snf >= 0 && snf <= 15)) return { error: "SNF must be 0–15" };
  if (!(rate_per_ltr > 0 && rate_per_ltr <= 1000)) return { error: "Rate must be ₹0.01–₹1000 per litre" };
  return { member_id, entry_date, shift, milk_ltr: round2(milk_ltr), fat: round2(fat), snf: round2(snf), rate_per_ltr: round2(rate_per_ltr) };
};

app.post("/api/collection", h(async (req, res) => {
  const v = entryRules(req.body);
  if (v.error) return res.status(400).json(v);
  const amount = round2(v.milk_ltr * v.rate_per_ltr);
  try {
    const [r] = await pool.query(
      `INSERT INTO milk_entries (member_id, entry_date, shift, milk_ltr, fat, snf, rate_per_ltr, amount)
       VALUES (:member_id, :entry_date, :shift, :milk_ltr, :fat, :snf, :rate_per_ltr, :amount)`,
      { ...v, amount });
    res.status(201).json({ id: r.insertId, ...v, amount });
  } catch (e) {
    if (e.errno === 1062) return res.status(409).json({ error: "An entry for this producer, date and shift already exists" });
    throw e;
  }
}));

app.put("/api/collection/:id", h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  const v = entryRules(req.body);
  if (v.error) return res.status(400).json(v);
  const amount = round2(v.milk_ltr * v.rate_per_ltr);
  try {
    await pool.query(
      `UPDATE milk_entries SET member_id = :member_id, entry_date = :entry_date, shift = :shift,
        milk_ltr = :milk_ltr, fat = :fat, snf = :snf, rate_per_ltr = :rate_per_ltr, amount = :amount
       WHERE id = :id`,
      { ...v, amount, id });
    res.json({ id, ...v, amount });
  } catch (e) {
    if (e.errno === 1062) return res.status(409).json({ error: "Another entry already exists for this producer, date and shift" });
    throw e;
  }
}));

app.delete("/api/collection/:id", h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  await pool.query("DELETE FROM whatsapp_messages WHERE collection_id = ?", [id]);
  const [r] = await pool.query("DELETE FROM milk_entries WHERE id = ?", [id]);
  res.json({ deleted: r.affectedRows > 0, id });
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

// ── Message history ───────────────────────────────────────────────────────
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

// ── Message template ──────────────────────────────────────────────────────
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

// ── Errors ────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `No route: ${req.method} ${req.path}` }));
app.use((err, _req, res, _next) => {
  console.error(`[db] ${err.code ?? "ERR"}: ${err.sqlMessage ?? err.message}`);
  const hint =
    err.code === "ER_ACCESS_DENIED_ERROR" ? "Check DB_USER / DB_PASSWORD in .env (XAMPP default: root, empty password)"
    : err.code === "ER_BAD_DB_ERROR" ? "Database not found — check DB_NAME (cPanel prefixes it, e.g. user_milkpro)"
    : err.code === "ECONNREFUSED" ? "MySQL is not running — start it (XAMPP) or check DB_HOST in cPanel"
    : err.code === "ER_NO_SUCH_TABLE" ? `${err.message} — restart the app once (it auto-creates missing tables) or check /api/diagnose`
    : err.code === "ER_BAD_FIELD_ERROR" ? `${err.sqlMessage ?? err.message} — your existing table uses different column names. Open /api/inspect to see the real columns, then tell the developer.`
    : err.code === "ER_DUP_ENTRY" ? `${err.sqlMessage ?? err.message} — a record with this key already exists`
    : "Run `npm run db:test` for a full diagnosis";
  res.status(500).json({
    error: "Database error",
    code: err.code ?? "UNKNOWN",
    sql: (err.sqlMessage ?? err.message ?? "").slice(0, 300),
    detail: hint,
  });
});

const PORT = Number(process.env.PORT || 3001);
ensureSchema()
  .then(() => console.log("[schema] tables verified / created"))
  .catch((e) => console.warn(`[schema] auto-heal skipped: ${e.message}`))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`\n🥛 MilkPro API listening on http://localhost:${PORT}`);
      console.log(`   DB config: ${JSON.stringify(safeConfig())}\n`);
    });
  });
