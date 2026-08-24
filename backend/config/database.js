// Shared MySQL/MariaDB pool for the whole API.
// Credentials come ONLY from .env — never hard-code them here.
import mysql from "mysql2/promise";
import "dotenv/config";

const config = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD ?? "", // empty string is valid (XAMPP default)
  database: process.env.DB_NAME || "milkpro",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  dateStrings: true, // return DATE/DATETIME as "YYYY-MM-DD HH:MM:SS" strings
};

export const pool = mysql.createPool(config);

/** Lightweight check used by /api/health and the CLI diagnostic. */
export async function ping() {
  const [rows] = await pool.query("SELECT 1 + 1 AS ok");
  return rows[0].ok === 2;
}

/** Masked config for safe logging (never prints the password). */
export function safeConfig() {
  const pw = process.env.DB_PASSWORD;
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    password: pw ? `<set · ${pw.length} chars>` : "<empty — XAMPP default>",
  };
}
