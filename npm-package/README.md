# intentdb

> Zero-dependency, real-time PostgreSQL client over HTTPS for IntentDB.

No port 5432 required. Works in Next.js, Node.js, Vercel, Cloudflare Workers, Bun, and Deno.

---

## Installation

```bash
npm install intentdb
```

---

## Setup

Set your connection string in `.env`:

```env
DATABASE_URL=https://YOUR_API_KEY@yourdomain.com
```

---

## Usage

### 1. Tagged Template SQL (Neon / Supabase Style)

```js
import { intentdb } from 'intentdb';

const db = intentdb();

// Directly returns rows:
const users = await db`SELECT * FROM users WHERE active = ${true}`;
```

### 2. Standard Query

```js
const { rows, rowCount } = await db.query('SELECT * FROM users WHERE id = $1', [1]);
```

### 3. Transactions

```js
await db.transaction([
  { query: 'UPDATE accounts SET balance = balance - $1 WHERE id = $2', params: [50, 1] },
  { query: 'UPDATE accounts SET balance = balance + $1 WHERE id = $2', params: [50, 2] },
]);
```

### 4. Real-time Latency Ping

```js
const { status, response } = await db.ping();
console.log(status, response); // "ok", "8ms"
```

---

## Features

- **Zero dependencies** — uses native global `fetch`.
- **Zero hardcoded links** — all configuration comes directly from your `DATABASE_URL`.
- **Real-time live responses** — requests are sent with `cache: 'no-store'`.
- **Full TypeScript support** — autocomplete on queries and results.
