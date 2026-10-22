'use strict';

// ═══════════════════════════════════════════════════════════════
//  intentdb — CommonJS Entrypoint
//  Connects to your IntentDB Gateway over HTTPS.
//  Zero dependencies, zero hardcoded links, real-time responses.
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

function intentdb(connectionString) {
  const { origin, key } = parseConnection(connectionString);

  async function db(stringsOrSql, ...values) {
    if (Array.isArray(stringsOrSql) && 'raw' in stringsOrSql) {
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
      const params = Array.isArray(values[0]) ? values[0] : [];
      const data = await request(origin, key, '/query', { query: stringsOrSql, params });
      return data;
    }

    throw new Error('[intentdb] Invalid query arguments');
  }

  db.query = async (query, params = []) => {
    return request(origin, key, '/query', { query, params });
  };

  db.transaction = async (queries) => {
    return request(origin, key, '/transaction', { queries });
  };

  db.batch = async (queries) => {
    return request(origin, key, '/batch', { queries });
  };

  db.ping = async () => {
    const res = await fetch(`${origin}/`, {
      method: 'GET',
      cache: 'no-store',
    });
    return res.json();
  };

  return db;
}

function sql(strings, ...values) {
  return intentdb()(strings, ...values);
}

module.exports = intentdb;
module.exports.intentdb = intentdb;
module.exports.createClient = intentdb;
module.exports.sql = sql;
module.exports.default = intentdb;
