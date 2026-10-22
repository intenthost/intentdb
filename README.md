# IntentDB Gateway — cPanel public_html Setup

---

## What to Upload

Upload **everything except the `client/` folder** directly into `public_html`:

```
public_html/
├── server.js              ← upload this
├── package.json           ← upload this
├── ecosystem.config.js    ← upload this
├── .env.example           ← upload this
├── .htaccess              ← upload this
├── docs.html              ← upload this (optional: minimal single-page docs & SQL console)
└── scripts/
    └── generate-key.js   ← upload this
```

The `client/` folder is only used in your app (Vercel, Next.js, etc.) — do NOT upload it to the server.

---

## Step 1 — Upload Files

1. Open **cPanel → File Manager**
2. Navigate into `public_html/`
3. If you want a subdomain (e.g. `db.yourdomain.com`), first create the subdomain in cPanel → **Domains** → Subdomains, then upload into the folder it creates (e.g. `public_html/db/`)
4. Upload all the files listed above into that folder
5. For the `scripts/` subfolder: create the folder first, then upload `generate-key.js` inside it

---

## Step 2 — Create the Node.js App in cPanel

1. In cPanel, search for **"Setup Node.js App"**
2. Click **"Create Application"**
3. Fill in:

| Field | Value |
|-------|-------|
| Node.js version | **18** or higher |
| Application mode | **Production** |
| Application root | `public_html` (or `public_html/db` if using a subfolder) |
| Application startup file | `server.js` |
| Application URL | your domain or subdomain |

4. Click **Create**

> This is what makes visiting your domain show the Node.js JSON response instead of files. cPanel automatically writes the Apache proxy config into your `.htaccess`.

---

## Step 3 — Create .env

1. In **File Manager**, open your `public_html/` (or `public_html/db/`)
2. Click **+ File** → name it `.env` → click **Edit**
3. Paste and fill in:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=youraccount_dbname
DB_USER=youraccount_dbuser
DB_PASS=your_actual_password

POOL_MIN=2
POOL_MAX=20

API_KEY=PASTE_GENERATED_KEY_HERE

PORT=3000
CORS_ORIGIN=*
LOG_REQUESTS=true
```

4. Click **Save Changes**

> Find `DB_NAME` and `DB_USER` in cPanel → **PostgreSQL Databases**

---

## Step 4 — Generate API Key

In cPanel → **Terminal**:

```bash
cd ~/public_html
node scripts/generate-key.js
```

Copy the generated key → paste as `API_KEY=` in `.env` → Save.

If using a subfolder:
```bash
cd ~/public_html/db
node scripts/generate-key.js
```

---

## Step 5 — Install Dependencies

In cPanel → **Setup Node.js App** → click the **edit (pencil) icon** on your app → scroll down → click **"Run NPM Install"**

Or in Terminal:
```bash
cd ~/public_html
npm install
```

---

## Step 6 — Start the App

In **Setup Node.js App** → click **▶ Start** next to your app.

Status changes to **Running** ✅

---

## Step 7 — Test

Visit your domain in the browser:

```
https://yourdomain.com/
```

You will see the live, real-time response time (no cache, pure JSON):
```json
{"status":"ok","response":"8ms"}
```

No `service`, no `version`, no `uptime` — just the actual live round-trip time between user, database, and user.

Test a real query:
```bash
curl -X POST https://yourdomain.com/query \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT now() AS time"}'
```

Response:
```json
{"status":"ok","rows":[{"time":"2026-10-22T..."}],"rowCount":1,"command":"SELECT"}
```

---

## Step 8 — Keep It Running 24/7 with PM2

cPanel's Start button runs the app but may not restart it after a crash. Use PM2 for true 24/7:

In cPanel → **Terminal**:

```bash
cd ~/public_html

# Install PM2 locally (no sudo needed)
npm install pm2

# Start
./node_modules/.bin/pm2 start ecosystem.config.js

# Save process list
./node_modules/.bin/pm2 save
```

Add a **Cron Job** to restart on server reboot:
1. cPanel → **Cron Jobs**
2. Common Settings → **"Once At Reboot"**
3. Command:
```bash
cd ~/public_html && ./node_modules/.bin/pm2 start ecosystem.config.js
```

---

## Routes

| URL | Auth | Returns |
|-----|------|---------|
| `GET /` | none | `{"status":"ok","response":"8ms"}` (real-time live DB ping) |
| `GET /health` | none | `{"status":"ok","response":"8ms"}` (alias to root) |
| `GET /docs` | none | Minimal single-page docs & SQL console (disable via `ENABLE_DOCS=false`) |
| `GET /stats` | API key | Pool and memory metrics |
| `POST /query` | API key | SQL query result |
| `POST /transaction` | API key | Atomic multi-query result |
| `POST /batch` | API key | Parallel queries result |

---

## Using in Any App

Set in your app's `.env`:

```env
DATABASE_URL=https://YOUR_API_KEY@yourdomain.com
```

### Option A — Using the `intentdb` npm package (Recommended)

Zero dependencies, zero hardcoded links, full TypeScript support:

```bash
npm install intentdb
```

```js
import { intentdb } from 'intentdb';

// Automatically connects to process.env.DATABASE_URL
const db = intentdb();

// Tagged template SQL (Neon / Supabase style):
const users = await db`SELECT * FROM users WHERE active = ${true}`;

// Or standard query:
const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [1]);

// Transactions:
await db.transaction([
  { query: 'UPDATE accounts SET balance = balance - $1 WHERE id = $2', params: [50, 1] },
  { query: 'UPDATE accounts SET balance = balance + $1 WHERE id = $2', params: [50, 2] },
]);

// Real-time latency ping:
const { status, response } = await db.ping(); // { status: "ok", response: "8ms" }
```

---

### Option B — Inline (Zero npm, No files)

If you don't want to install any package, paste these 2 lines:

```js
const _u = new URL(process.env.DATABASE_URL);
const db = (q, p = []) => fetch(`${_u.origin}/query`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_u.username}` },
  cache: 'no-store',
  body: JSON.stringify({ query: q, params: p })
}).then(r => r.json());

const { rows } = await db('SELECT * FROM users WHERE id = $1', [1]);
```

