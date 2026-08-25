# Deploying MilkPro WhatsApp Sender on cPanel

Full production setup: **frontend** as static files in `public_html`,
**backend** as a Node.js app (Passenger) on a subdomain, **MySQL** via
cPanel's database manager.

```
┌─────────────────────────────────────────────────────────────┐
│  https://yourdomain.com          → public_html/  (dist/)    │
│  https://api.yourdomain.com      → Node.js app  (backend/)  │
│  MySQL: username_milkpro         → cPanel database          │
└─────────────────────────────────────────────────────────────┘
```

> **Does your plan support Node.js?** In cPanel look for **"Setup Node.js App"**
> (CloudLinux). If it's missing, ask your host to enable it — without it an
> Express API cannot run on shared hosting. All backend dependencies are
> pure JavaScript, so no compilation is needed on the server.

---

## Step 1 · Create the MySQL database

1. cPanel → **MySQL® Databases**
2. **Create database** → name it `milkpro` (cPanel prefixes it, e.g. `yourname_milkpro`)
3. **Create user** → e.g. `milkuser` with a **strong password** — write both down
4. Scroll to **Add User To Database** → select both → **All Privileges** → Add
5. cPanel → **phpMyAdmin** → select your new database (left side) → **Import** tab →
   choose `backend/database/schema.sql` → **Go**

⚠ On cPanel the database host is **`localhost`** and names are always
prefixed: real name = `yourname_milkpro`, real user = `yourname_milkuser`.

## Step 2 · Upload the backend

1. cPanel → **File Manager** → home directory (e.g. `/home/yourname/`)
2. **New Folder** → `milkpro-api`
3. Upload these files/folders from `backend/` into it:
   `server.js`, `package.json`, `config/`, `database/`
   (skip `.env` — you'll set env vars in Step 4; never upload `node_modules`)

## Step 3 · Create the Node.js application

1. cPanel → **Setup Node.js App** → **Create Application**
2. Fill exactly:

   | Field            | Value                                    |
   | ---------------- | ---------------------------------------- |
   | Node.js version  | **20.x** or higher (≥ 18 required)       |
   | Application mode | **Production**                           |
   | Application root | `milkpro-api`                            |
   | Application URL  | `api.yourdomain.com` (create this **subdomain** first in cPanel → Domains, pointing anywhere — Passenger takes it over) |
   | Startup file     | `server.js`                              |

3. **Create**. cPanel shows the app with a pencil (edit) icon.

## Step 4 · Environment variables

Open the app (pencil icon) → **Environment variables** → add each:

```
DB_HOST        = localhost
DB_PORT        = 3306
DB_USER        = yourname_milkuser
DB_PASSWORD    = <the password from Step 1>
DB_NAME        = yourname_milkpro
CORS_ORIGIN    = https://yourdomain.com
```

(`PORT` is injected automatically by Passenger — don't set it. The server
reads `process.env.PORT` and binds to whatever Passenger assigns.)

Alternative: upload a `.env` file into `milkpro-api/` with the same values —
`dotenv` picks it up. The cPanel env-var UI is preferred because nothing
sensitive sits on disk.

## Step 5 · Install dependencies & start

1. In **Setup Node.js App** → click the **Run NPM Install** button next to
   your app (or via SSH: activate the virtualenv shown in the app panel,
   then `cd ~/milkpro-api && npm install --production`)
2. Back in the app panel → **Restart** (top right)
3. Open `https://api.yourdomain.com/api/health` in your browser.
   You must see `{ "status": "ok", "db": { ... } }`.

## Step 6 · Build & upload the frontend

On **your computer**, in the frontend project root:

```bash
# point the app at the live API (must match the subdomain from Step 3)
# Windows PowerShell:
$env:VITE_API_URL="https://api.yourdomain.com"; npm run build
# Windows cmd:
set VITE_API_URL=https://api.yourdomain.com && npm run build
# Mac / Linux:
VITE_API_URL=https://api.yourdomain.com npm run build
```

Then:

1. cPanel → **File Manager** → `public_html/`
2. Upload **the contents** of the `dist/` folder (index.html, assets/, config.js, .htaccess…)
   — not the folder itself. If a default `index.html`/`cgi-bin` exists, remove or move it.
3. cPanel → **SSL/TLS Status** → run **AutoSSL** so both domains get https.
4. Visit `https://yourdomain.com` — the header chip should turn green
   **MySQL · Live** within a couple of seconds.

**Easier alternative to the rebuild:** skip `VITE_API_URL` entirely — after
uploading, open `public_html/config.js` in File Manager and uncomment:

```js
window.__MILKPRO_API__ = "https://api.yourdomain.com";
```

The app reads it at boot, so this works with any build and needs no rebuild
when you change hosting details later.

## Verification checklist

- [ ] `https://api.yourdomain.com/api/health` returns `"status":"ok"`
- [ ] Frontend header shows the green **MySQL · Live** chip
- [ ] Dashboard numbers match phpMyAdmin (`SELECT SUM(milk_ltr) FROM milk_entries WHERE entry_date = CURDATE()`)
- [ ] Open WhatsApp for one producer → a row appears in `whatsapp_messages` in phpMyAdmin
- [ ] Browser console shows **no** CORS errors (if it does: recheck `CORS_ORIGIN` is the exact frontend URL with `https://`)

## Updating the app later

1. Upload changed backend files → Node.js App panel → **Restart**
2. Frontend: rebuild with the same `VITE_API_URL`, re-upload `dist/` contents

## Troubleshooting (cPanel-specific)

| Symptom | Cause / fix |
| --- | --- |
| App shows **"Application startup failed"** | Node.js App panel → your app → logs link (or `~/milkpro-api/stderr.log`) — the real error is there |
| 502 / "The application failed to start" | Missing `npm install` — run it from the panel button |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER`/`DB_PASSWORD` — remember the `yourname_` prefix |
| `ER_BAD_DB_ERROR` | `DB_NAME` missing the `yourname_` prefix, or schema never imported |
| Frontend chip stays **Demo data** | DevTools → Network → check the `/api/health` request: blocked = CORS/URL mismatch; 404 = wrong Application URL; timeout = app not running |
| `ERR_OSSL_EVP_UNSUPPORTED` or old-Node errors | Pick Node 18/20+ in the app panel (never the ancient 10.x/12.x defaults) |
| phpMyAdmin import of schema.sql fails on `CREATE DATABASE` | Your host restricts DB creation to the UI — edit the file: delete the `CREATE DATABASE`/`USE` lines and import the rest into the DB you made in Step 1 |

## If your plan has no Node.js at all

Options, simplest first:
1. Host **only the frontend** on cPanel and keep the backend running on your
   local machine / office PC (set `VITE_API_URL` to your machine's reachable
   address — suitable for a single-centre, LAN-style setup).
2. Ask the host to enable CloudLinux "Setup Node.js App" (many do on request).
3. Move the 4-file backend to any cheap VPS (DigitalOcean/Hetzner/Contabo) —
   `npm install && npm start` behind nginx, same `.env`.
