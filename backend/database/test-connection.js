#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
//  MilkPro DB diagnostic — run from the backend folder:
//
//      node database/test-connection.js
//
//  It checks each step (env file → server → login → database → tables)
//  and tells you EXACTLY what failed and how to fix it with XAMPP.
// ════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => console.log(`  ❌ ${m}`);
const info = (m) => console.log(`  ℹ️  ${m}`);
const hint = (m) => console.log(`\n  💡 FIX: ${m}\n`);

console.log("\n── MilkPro database diagnostic ─────────────────────────────");
info(`Node ${process.version} on ${process.platform}`);

// 1 ── Is .env even there? ────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  bad(`No .env file found in ${process.cwd()}`);
  hint(`Copy .env.example to a file named exactly ".env" in this folder.
     On Windows, enable "File name extensions" in Explorer — it is very
     common to accidentally create ".env.txt", which Node cannot read.`);
  process.exit(1);
}
ok(`Found ${envPath}`);
const parsed = dotenv.config({ path: envPath }).parsed ?? {};
if (parsed.DB_PASSWORD === "root") {
  info('DB_PASSWORD is "root" — XAMPP\'s default root password is EMPTY.');
}

const cfg = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME || "milkpro",
};
info(`Connecting to  ${cfg.user}@${cfg.host}:${cfg.port}  →  database "${cfg.database}"`);
info(`Password:      ${cfg.password ? `<set · ${cfg.password.length} chars>` : "<empty — XAMPP default>"}`);

const HINTS = {
  ECONNREFUSED:
    "MySQL is not accepting connections on " + cfg.host + ":" + cfg.port + ".\n" +
    "     1. Open XAMPP Control Panel — the MySQL row must say Running (green). Click Start.\n" +
    "     2. If MySQL won't start, another program already uses port " + cfg.port + " (a previous\n" +
    "        MySQL install, or Skype/IIS on old setups). Stop that service, or change XAMPP's\n" +
    "        MySQL port (Config → my.ini) and set DB_PORT to match.\n" +
    "     3. Verify the port: in XAMPP, click Admin next to MySQL — the phpMyAdmin URL shows it.",
  ER_ACCESS_DENIED_ERROR:
    "The server is reachable but the login was rejected.\n" +
    "     1. XAMPP default: user=root with an EMPTY password → the .env line must be\n" +
    "        DB_PASSWORD=   (nothing after the =, no quotes, no spaces).\n" +
    "     2. If you set a root password in phpMyAdmin earlier, put exactly that in .env.\n" +
    "     3. Check for invisible spaces/quotes in the .env line.",
  ER_BAD_DB_ERROR:
    `The login works, but database "${cfg.database}" does not exist.\n` +
    "     Open phpMyAdmin → Import tab → choose database/schema.sql → Go.\n" +
    "     (Or match DB_NAME to a database you already have.)",
  ETIMEDOUT:
    "The connection timed out — a firewall/antivirus is blocking the port,\n" +
    "     or DB_HOST points at a machine that is not this computer. Use 127.0.0.1.",
  EAI_AGAIN:
  ENOTFOUND:
    `"${cfg.host}" could not be resolved. Use DB_HOST=127.0.0.1 instead of a hostname.`,
  PROTOCOL_CONNECTION_LOST:
    "MySQL dropped the connection — it may have crashed. Restart MySQL in XAMPP.",
  ER_NOT_SUPPORTED_AUTH_MODE:
    "Old mysql2 vs newer MySQL auth plugin. Fix with: npm i mysql2@latest",
};

// 2 ── Reach the server & log in (no database selected yet) ───────────────
let serverConn;
try {
  serverConn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password,
    connectTimeout: 6000,
  });
  const [v] = await serverConn.query("SELECT VERSION() AS v");
  ok(`Connected to MySQL/MariaDB ${v[0].v} at ${cfg.host}:${cfg.port}`);
} catch (e) {
  bad(`Cannot connect: ${e.code ?? ""} ${e.message}`);
  hint(HINTS[e.code] ??
    "Unexpected error. Paste the full message above into the project README\n" +
    "     troubleshooting table, or check that mysql2 is installed: npm install");
  process.exit(1);
}

// 3 ── Does the database exist? ───────────────────────────────────────────
try {
  await serverConn.query(`USE \`${cfg.database.replace(/`/g, "")}\``);
  ok(`Database "${cfg.database}" exists`);
} catch (e) {
  bad(`Database "${cfg.database}" not found (${e.code}).`);
  const [dbs] = await serverConn.query("SHOW DATABASES");
  info(`Databases on this server: ${dbs.map((d) => d.Database).join(", ")}`);
  hint(HINTS.ER_BAD_DB_ERROR);
  process.exit(1);
}

// 4 ── Are the tables there? ──────────────────────────────────────────────
try {
  const [tables] = await serverConn.query("SHOW TABLES");
  const names = tables.map((t) => Object.values(t)[0]);
  for (const need of ["members", "milk_entries", "advances", "whatsapp_messages"]) {
    names.includes(need) ? ok(`Table ${need}`) : bad(`Table ${need} is missing`);
  }
  if (names.length === 0) {
    hint(`The database is empty — import database/schema.sql in phpMyAdmin.`);
    process.exit(1);
  }
  for (const t of ["members", "milk_entries", "advances"]) {
    if (!names.includes(t)) continue;
    const [c] = await serverConn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    info(`${t}: ${c[0].n} rows`);
  }
} catch (e) {
  bad(`Table check failed: ${e.message}`);
  process.exit(1);
}

await serverConn.end();
console.log("\n🎉 ALL CHECKS PASSED — run `npm run dev` and open http://localhost:3001/api/health\n");
