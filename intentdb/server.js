'use strict';

// ═══════════════════════════════════════════════════════════
//  IntentDB Gateway  —  server.js
//  Single-file Node.js PostgreSQL HTTP Bridge
//  All responses are pure JSON. No HTML, no UI.
// ═══════════════════════════════════════════════════════════

const http       = require('http');
const dns        = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const { Pool }   = require('pg');
const crypto     = require('crypto');
const fs         = require('fs');
const pathModule = require('path');
require('dotenv').config();

// ─── Environment configuration ───────────────────────────────
const REQUIRED = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'API_KEY'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.warn(`[intentdb] Warning: Missing required env vars: ${missing.join(', ')}`);
}

// ─── Persistent PostgreSQL Connection Pool ───────────────────
let pool = null;
if (!missing.length) {
  pool = new Pool({
    host                       : process.env.DB_HOST,
    port                       : parseInt(process.env.DB_PORT, 10) || 5432,
    database                   : process.env.DB_NAME,
    user                       : process.env.DB_USER,
    password                   : process.env.DB_PASS,
    max                        : parseInt(process.env.POOL_MAX, 10) || 20,
    min                        : parseInt(process.env.POOL_MIN, 10) || 2,
    idleTimeoutMillis          : 30000,
    connectionTimeoutMillis    : 10000,
    keepAlive                  : true,
    keepAliveInitialDelayMillis: 10000,
    statement_timeout          : parseInt(process.env.STATEMENT_TIMEOUT, 10) || 30000,
    query_timeout              : parseInt(process.env.QUERY_TIMEOUT, 10)     || 30000,
  });

  pool.on('error', err => console.error('[pool] client error:', err.message));
}

// ─── Helpers ──────────────────────────────────────────────────

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type'                : 'application/json',
    'Content-Length'              : Buffer.byteLength(payload),
    'Connection'                  : 'keep-alive',
    'Access-Control-Allow-Origin' : process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
    'Cache-Control'               : 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma'                      : 'no-cache',
    'Expires'                     : '0',
    'Surrogate-Control'           : 'no-store',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function getApiKey(req) {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-api-key'] || '');
}

function verifyKey(key) {
  const expected = process.env.API_KEY;
  if (!key || !expected || key.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected)); }
  catch { return false; }
}

function pgErr(err) {
  return {
    status : 'error',
    message: err.message,
    ...(err.code   && { code  : err.code   }),
    ...(err.detail && { detail: err.detail }),
    ...(err.hint   && { hint  : err.hint   }),
  };
}

// ─── Route handler ────────────────────────────────────────────

async function handle(req, res) {
  const start  = Date.now();
  const method = req.method;
  const path   = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '') || '/';

  // Preflight
  if (method === 'OPTIONS') return send(res, 204, {});

  // Missing configuration diagnostics
  if (missing.length > 0) {
    return send(res, 500, {
      status  : 'error',
      response: `Configuration error: Missing required env vars in .env (${missing.join(', ')}).`,
      hint    : 'Create or update the .env file with DB_HOST, DB_NAME, DB_USER, DB_PASS, API_KEY'
    });
  }

  if (!pool) {
    return send(res, 500, {
      status  : 'error',
      response: 'Database pool is not initialized.',
    });
  }

  // ── GET / & GET /health ─ real-time DB round-trip response ─
  if (method === 'GET' && (path === '/' || path === '/health')) {
    try {
      await pool.query('SELECT 1');
      const roundTrip = `${Math.max(1, Date.now() - start)}ms`;
      console.log(`${method} ${path} 200 (${roundTrip})`);
      return send(res, 200, {
        status  : 'ok',
        response: roundTrip,
      });
    } catch (err) {
      console.error(`${method} ${path} 503:`, err.message);
      return send(res, 503, {
        status  : 'error',
        response: err.message,
      });
    }
  }

  // ── GET /docs ─ interactive documentation (disabled if ENABLE_DOCS=false) ──
  if (method === 'GET' && path === '/docs') {
    if (process.env.ENABLE_DOCS === 'false') {
      return send(res, 404, { status: 'error', message: 'Documentation is disabled on this server' });
    }
    const docsPath = pathModule.join(__dirname, 'docs.html');
    if (!fs.existsSync(docsPath)) {
      return send(res, 404, { status: 'error', message: 'docs.html not found' });
    }
    const html = fs.readFileSync(docsPath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    return res.end(html);
  }

  // ── Auth required for everything below ─────────────────────
  if (!verifyKey(getApiKey(req))) {
    console.warn(`${method} ${path} 401 (${Date.now() - start}ms)`);
    return send(res, 401, { status: 'error', message: 'Invalid or missing API key' });
  }

  // ── GET /stats ──────────────────────────────────────────────
  if (method === 'GET' && path === '/stats') {
    console.log(`${method} ${path} 200 (${Date.now() - start}ms)`);
    return send(res, 200, {
      status: 'ok',
      pool  : { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: pool.options.max, min: pool.options.min },
      proc  : { uptime: Math.floor(process.uptime()), mem: process.memoryUsage(), pid: process.pid, node: process.version },
    });
  }

  // Only POST beyond this point
  if (method !== 'POST') {
    return send(res, 405, { status: 'error', message: `Method ${method} not allowed` });
  }

  let body;
  try { body = await readBody(req); }
  catch {
    return send(res, 400, { status: 'error', message: 'Invalid JSON body' });
  }

  // ── POST /query ─────────────────────────────────────────────
  if (path === '/query') {
    const sql    = body.query || body.text;
    const params = body.params || body.values || [];

    if (!sql || typeof sql !== 'string') {
      return send(res, 400, { status: 'error', message: 'Body must include a "query" string' });
    }

    try {
      const r = await pool.query(sql, params);
      console.log(`${method} ${path} 200 (${Date.now() - start}ms)`);
      return send(res, 200, {
        status  : 'ok',
        rows    : r.rows,
        rowCount: r.rowCount,
        command : r.command,
        fields  : r.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
      });
    } catch (err) {
      console.error(`${method} ${path} 400:`, err.message);
      return send(res, 400, pgErr(err));
    }
  }

  // ── POST /transaction ─ atomic multi-query ──────────────────
  if (path === '/transaction') {
    const queries = body.queries;
    if (!Array.isArray(queries) || queries.length === 0) {
      return send(res, 400, { status: 'error', message: '"queries" must be a non-empty array' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const q of queries) {
        const r = await client.query(q.query || q.text, q.params || q.values || []);
        results.push({ rows: r.rows, rowCount: r.rowCount, command: r.command });
      }
      await client.query('COMMIT');
      console.log(`${method} ${path} 200 (${Date.now() - start}ms)`);
      return send(res, 200, { status: 'ok', results });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`${method} ${path} 400:`, err.message);
      return send(res, 400, pgErr(err));
    } finally {
      client.release();
    }
  }

  // ── POST /batch ─ parallel independent queries ──────────────
  if (path === '/batch') {
    const queries = body.queries;
    if (!Array.isArray(queries) || queries.length === 0) {
      return send(res, 400, { status: 'error', message: '"queries" must be a non-empty array' });
    }

    const settled = await Promise.allSettled(
      queries.map(q =>
        pool.query(q.query || q.text, q.params || q.values || []).then(r => ({
          status  : 'ok',
          rows    : r.rows,
          rowCount: r.rowCount,
          command : r.command,
        }))
      )
    );

    console.log(`${method} ${path} 200 (${Date.now() - start}ms)`);
    return send(res, 200, {
      status : 'ok',
      results: settled.map(r =>
        r.status === 'fulfilled' ? r.value : { status: 'error', message: r.reason?.message }
      ),
    });
  }

  return send(res, 404, {
    status : 'error',
    message: `Route not found: ${method} ${path}`,
    routes : ['GET /', 'GET /health', 'GET /stats', 'POST /query', 'POST /transaction', 'POST /batch', 'GET /docs'],
  });
}

// ─── Warm pool connections on boot (non-blocking) ────────────
async function warmPool() {
  if (!pool) return;
  try {
    const count   = parseInt(process.env.POOL_MIN, 10) || 2;
    const clients = [];
    for (let i = 0; i < count; i++) clients.push(await pool.connect());
    clients.forEach(c => c.release());
    console.log(`[intentdb] pool ready (${count} connections warm)`);
  } catch (err) {
    console.warn('[intentdb] Pool warm deferred:', err.message);
  }
}

// ─── Start HTTP Server immediately ────────────────────────────
// Support TCP port or Passenger Unix socket / pipe
const PORT   = process.env.PORT || 3000;
const server = http.createServer(handle);

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 30000;

server.on('connection', (socket) => {
  socket.setNoDelay(true);
});

// Self-keepalive every 45s to prevent cPanel/Passenger/LiteSpeed from sleeping
setInterval(() => {
  if (pool) {
    pool.query('SELECT 1').catch(() => {});
  }
}, 45000);

// Auto-recover from port conflicts if multiple subdomains share port 3000
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && !isNaN(Number(PORT))) {
    const nextPort = Number(PORT) + 1;
    console.warn(`[intentdb] Port ${PORT} in use, trying port ${nextPort}...`);
    server.listen(nextPort);
  } else {
    console.error('[intentdb] Server error:', err.message);
  }
});

server.listen(PORT, () => {
  console.log(`[intentdb] listening on ${PORT}`);
  if (pool) {
    console.log(`[intentdb] db → ${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`);
  }
  warmPool().catch(() => {});
});

process.on('SIGTERM', async () => {
  console.log('[intentdb] SIGTERM — shutting down');
  server.close();
  if (pool) await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[intentdb] SIGINT — shutting down');
  server.close();
  if (pool) await pool.end();
  process.exit(0);
});
