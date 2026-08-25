# MilkPro WhatsApp Sender — Backend (Express + MySQL / XAMPP)

Self-contained API for the MilkPro WhatsApp Sender. Reads the existing
`members` / `milk_entries` / `advances` tables (never modifies them) and
tracks WhatsApp statuses in its own `whatsapp_messages` table.

> 📦 **Hosting on cPanel?** Follow **[DEPLOYMENT.md](DEPLOYMENT.md)** —
> it covers the MySQL database, the Node.js app (Passenger), env vars,
> and uploading the built frontend step by step.

## 1 · Prepare XAMPP

1. Open the **XAMPP Control Panel** → click **Start** next to **MySQL**.
   The row must turn green and say *Running*. (XAMPP ships MariaDB — fully
   compatible with `mysql2`.)
2. If MySQL **won't start**: another program already uses port 3306
   (an old MySQL install is the usual cause). Stop that service, or change
   XAMPP's port via *MySQL → Config → my.ini* and note the new port.
3. Click **Admin** next to MySQL to open **phpMyAdmin**.

## 2 · Create the database

In phpMyAdmin: choose your server (left side) → **Import** tab →
**Choose File** → select `database/schema.sql` → **Go**.

This creates the `milkpro` database, all four tables, the default message
template, and sample producers/entries dated **today** so the dashboard has
data immediately. Re-running the import is safe.

> To use your real data instead: keep `whatsapp_messages` + `settings` from
> the script, and adapt the three milk-table names/columns in
> `server.js` queries to your existing database. Only column names in the
> SQL need changing — nothing else.

## 3 · Configure credentials

```
copy .env.example .env        (Windows)   — the file must be named exactly ".env"
```

XAMPP defaults (the values in `.env.example` already match):

| Key           | XAMPP default     | Common mistake                          |
| ------------- | ----------------- | --------------------------------------- |
| `DB_HOST`     | `127.0.0.1`       | using a hostname instead of the IP      |
| `DB_PORT`     | `3306`            | XAMPP reconfigured to another port      |
| `DB_USER`     | `root`            |                                         |
| `DB_PASSWORD` | **empty**         | writing `DB_PASSWORD=root` ← causes *Access denied* |
| `DB_NAME`     | `milkpro`         | database never imported (step 2)        |

⚠ No quotes, no spaces around `=`, one `KEY=value` per line. On Windows,
make sure Explorer didn't save it as `.env.txt`.

## 4 · Install & diagnose

```bash
cd backend
npm install
npm run db:test        # ← tells you EXACTLY what is wrong, with the fix
```

Expected output when everything is right:

```
✅ Found ...\.env
✅ Connected to MySQL/MariaDB 10.4.x at 127.0.0.1:3306
✅ Database "milkpro" exists
✅ Table members … milk_entries … advances … whatsapp_messages
🎉 ALL CHECKS PASSED
```

## 5 · Run the API

```bash
npm run dev            # http://localhost:3001
```

Check `http://localhost:3001/api/health` — it returns `{ status: "ok" }`
plus the (password-masked) DB config.

### Endpoints

**v2 note:** `server.js` now auto-creates any missing tables/columns at boot
(`whatsapp_messages`, `settings`, plus `village`/`animal`/`status` on members
and the one-entry-per-shift unique key). If the frontend ever shows
"Could not load collection from the API", just restart the Node app once —
or check `GET /api/diagnose` to see exactly which table is missing.

```
GET  /api/health
GET  /api/diagnose
GET  /api/dashboard?date=YYYY-MM-DD
GET  /api/producers?all=1
POST /api/producers                    { code, name, phone, village?, animal? }
PUT  /api/producers/:id
DELETE /api/producers/:id(?hard=1)     soft-archive by default; hard only if no history
POST /api/collection                   { member_id, entry_date, shift, milk_ltr, fat, snf, rate_per_ltr }
PUT  /api/collection/:id
DELETE /api/collection/:id             also removes its WhatsApp tracking row
GET  /api/collection?date=&shift=AM|PM&status=&q=
POST /api/whatsapp/message/:collectionId/opened   { phone, message }
POST /api/whatsapp/message/:collectionId/sent
POST /api/whatsapp/message/:collectionId/failed   { error }
POST /api/whatsapp/message/:collectionId/skipped
POST /api/whatsapp/messages/bulk-status           { ids, status }
GET  /api/whatsapp/history?from=&to=&status=&shift=&producer_id=&page=&limit=
GET  /api/whatsapp/template
PUT  /api/whatsapp/template                       { template }
```

## Troubleshooting — error → fix

| Error you see | Meaning | Fix |
| --- | --- | --- |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL not running / wrong port | Start MySQL in XAMPP; verify port via phpMyAdmin URL |
| `ER_ACCESS_DENIED_ERROR` | Wrong user or password | XAMPP default: `root` + **empty** password → `DB_PASSWORD=` |
| `ER_BAD_DB_ERROR` | Database doesn't exist | Import `database/schema.sql` in phpMyAdmin |
| `ETIMEDOUT` | Firewall/antivirus blocking | Use `127.0.0.1`, allow node through Windows Firewall |
| `EAI_AGAIN` / `ENOTFOUND` | Hostname can't resolve | Use `DB_HOST=127.0.0.1` |
| `.env` values are `undefined` | File misnamed / not in cwd | Name it exactly `.env`, run node from the `backend` folder |
| `require is not defined` | Module system mismatch | This project uses ES modules (`"type": "module"`) — use `import`, not `require` |
| `ER_NOT_SUPPORTED_AUTH_MODE` | Old mysql2 vs MySQL 8 auth | `npm i mysql2@latest` |

## Connecting the React frontend

The web app **auto-detects** the API at startup:

1. It pings `GET /api/health` (2.5 s timeout).
2. If it answers → the header chip turns green **"MySQL · Live"** and every page
   (dashboard, collection, sender, history, export, template) reads/writes
   through the API. Status changes (opened / sent / failed / skipped) are
   saved to `whatsapp_messages` in MySQL.
3. If it doesn't → the chip shows amber **"Demo data"** and the app runs on
   built-in sample data in localStorage. Click the chip (or *Retry connection*
   in the sidebar) after starting the backend to re-check.

Setup:

```
1. Replace backend/server.js with the latest version from this repo
   (it adds dev-friendly CORS + /api/producers + /api/whatsapp/history-counts)
2. In backend/.env: make the CORS_ORIGIN line empty  →  CORS_ORIGIN=
   (an old value like http://localhost:5173 blocks the app if you serve it
    from another port; empty = mirror any origin while developing)
3. npm run dev   (backend on :3001)
4. Serve/preview the React app; the chip should turn green within ~2 s
```

If the API runs on another host/port, create a `.env` in the **frontend**
project root with:

```
VITE_API_URL=http://192.168.1.20:3001
```

and rebuild. Quick checks if the chip stays amber:

- `curl http://localhost:3001/api/health` from a terminal → must return JSON
- Browser devtools → Network → the health request must not be `CORS error`
  (if it is, re-check the empty `CORS_ORIGIN` line and restart the backend)
- Backend console must print `🥛 MilkPro API listening on http://localhost:3001`

## Security notes

- Credentials live only in `.env` (never committed; add `.env` to `.gitignore`).
- Every query is parameterized; inputs are validated and length-capped.
- `whatsapp_messages.UNIQUE(collection_id)` prevents duplicate records per
  collection entry; upserts keep one row per producer per entry.
- Error responses never leak credentials or stack traces.
