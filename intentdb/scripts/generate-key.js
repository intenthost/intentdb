#!/usr/bin/env node
// ─── API Key Generator ────────────────────────────────────────
//  Run: node scripts/generate-key.js
//  Generates a cryptographically secure random API key
//  and outputs the value to add to your .env file.
// ─────────────────────────────────────────────────────────────

const crypto = require('crypto');

const key    = crypto.randomBytes(40).toString('base64url');
const masked = key.slice(0, 8) + '...' + key.slice(-4);

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║       IntentDB API Key Generator             ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');
console.log('✅  Generated API Key:');
console.log('');
console.log('    ' + key);
console.log('');
console.log('📋  Add this to your gateway .env:');
console.log('');
console.log(`    API_KEY=${key}`);
console.log('');
console.log('🔗  Your client DATABASE_URL will be:');
console.log('');
console.log(`    DATABASE_URL=https://${key}@db.yourdomain.com/your_db_name`);
console.log('');
console.log('⚠️   KEEP THIS SECRET. Never commit it to git.');
console.log('');
