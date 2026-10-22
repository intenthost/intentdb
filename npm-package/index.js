// ═══════════════════════════════════════════════════════════════
//  intentdb — Zero-Dependency Real-Time PostgreSQL Client
//  Connects to your IntentDB Gateway over HTTPS.
//  No port 5432, no cold starts, no hardcoded links.
// ═══════════════════════════════════════════════════════════════

function parseConnection(connStr) {
  const raw = connStr || (typeof process !== 'undefined' && process.env ? process.env.DATABASE_URL : null);
  if (!raw) {
    throw new Error('[intentdb] Missing connection string. Set DATABASE_URL in .env or pass intentdb("https://KEY@domain.com")');
  }

  const normalized = raw.replace(/^intentdb:\/\//, 'https://');
  const parsed = new URL(normalized.startsWith('http://') || normalized.startsWith('https://') ? normalized : `https://${normalized}`);

  const origin = parsed.origin;
  const key = decodeURIComponent(parsed.username || '');

  return { origin, key };
}

async function request(origin, key, endpoint, body) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  const res = await fetch(`${origin}${endpoint}`, {
    method: 'POST',
    headers,
    cache: 'no-store',
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data && data.message ? data.message : `HTTP ${res.status}`;
    const err = new Error(`[intentdb] ${msg}`);
    if (data && data.code) err.code = data.code;
    if (data && data.detail) err.detail = data.detail;
    if (data && data.hint) err.hint = data.hint;
    throw err;
  }

  return data;
}

export function intentdb(connectionString) {
  const { origin, key } = parseConnection(connectionString);

  // Core executor: handles template strings or query string
  async function db(stringsOrSql, ...values) {
    if (Array.isArray(stringsOrSql) && 'raw' in stringsOrSql) {
      // Tagged template string: db`SELECT * FROM users WHERE id = ${1}`
      let query = stringsOrSql[0];
      const params = [];
      for (let i = 1; i < stringsOrSql.length; i++) {
        params.push(values[i - 1]);
        query += `$${params.length}` + stringsOrSql[i];
      }
      const data = await request(origin, key, '/query', { query, params });
      return data.rows || [];
    }

    if (typeof stringsOrSql === 'string') {
      // Function call: db('SELECT * FROM users WHERE id = $1', [1])
      const params = Array.isArray(values[0]) ? values[0] : [];
      const data = await request(origin, key, '/query', { query: stringsOrSql, params });
      return data;
    }

    throw new Error('[intentdb] Invalid query arguments');
  }

  // Explicit method: db.query(sql, params) -> { rows, rowCount, command, fields }
  db.query = async (query, params = []) => {
    return request(origin, key, '/query', { query, params });
  };

  // Atomic transaction: db.transaction([...])
  db.transaction = async (queries) => {
    return request(origin, key, '/transaction', { queries });
  };

  // Parallel batch: db.batch([...])
  db.batch = async (queries) => {
    return request(origin, key, '/batch', { queries });
  };

  // Real-time status & round-trip check: db.ping() -> { status: 'ok', response: '8ms' }
  db.ping = async () => {
    const res = await fetch(`${origin}/`, {
      method: 'GET',
      cache: 'no-store',
    });
    return res.json();
  };

  return db;
}

// Aliases
export const createClient = intentdb;
export const sql = (strings, ...values) => intentdb()(strings, ...values);
export default intentdb;
