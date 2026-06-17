/* =============================================================================
 * SWIFT INVESTMENTS — BACKEND SERVER
 * =============================================================================
 * A complete, beginner-friendly backend with ZERO npm packages to install.
 * It uses only features built into Node.js (v22+):
 *   - node:http   -> the web server
 *   - node:sqlite -> a real SQL database stored in a single file (swift.db)
 *   - node:crypto -> secure password hashing + session ids
 *
 * It does two jobs:
 *   1. Serves a JSON REST API under  /api/...
 *   2. Serves the front-end (public/index.html) so the WHOLE app runs from
 *      ONE command on ONE address: http://localhost:4000
 *
 * Run it with:   node server.js     (see START-HERE.md for the full guide)
 * ===========================================================================*/

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');
// DB location: defaults to a file next to this script. On a host with a
// persistent disk (see render.yaml), set DB_FILE=/data/swift.db so data survives
// restarts and redeploys.
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'swift.db');

/* =============================================================================
 * 1. DATABASE  — create the file + tables on first run, then seed demo data.
 * ===========================================================================*/
const db = new DatabaseSync(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT UNIQUE, phone TEXT,
    password_hash TEXT, salt TEXT,
    role TEXT DEFAULT 'user', tier TEXT DEFAULT 'VIP 1',
    joined TEXT, avatar TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS wallets (
    user_id INTEGER PRIMARY KEY,
    balance REAL DEFAULT 0, invested REAL DEFAULT 0, available REAL DEFAULT 0,
    today_pl REAL DEFAULT 0, total_pl REAL DEFAULT 0, total_pl_pct REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS performance (
    user_id INTEGER, ord INTEGER, label TEXT, value REAL
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, name TEXT, price REAL, daily REAL, days INTEGER,
    day_of INTEGER DEFAULT 0, status TEXT DEFAULT 'active',
    start TEXT DEFAULT (date('now'))
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, txid TEXT, date TEXT, type TEXT, amount REAL, status TEXT
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, title TEXT, body TEXT, time TEXT, tone TEXT, unread INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY, user_id INTEGER, expires INTEGER
  );
`);

/* The VIP plans (single source of truth for prices/payouts on the server). */
const PLANS = [
  { name: 'VIP 1',        price: 100,  daily: 20,   days: 30, tag: 'Starter',    accent: 'brand' },
  { name: 'VIP 2',        price: 200,  daily: 40,   days: 30, tag: 'Popular',    accent: 'brand' },
  { name: 'VIP 3',        price: 500,  daily: 250,  days: 30, tag: null,         accent: 'navy'  },
  { name: 'Mega VIP',     price: 1000, daily: 500,  days: 30, tag: null,         accent: 'navy'  },
  { name: 'Super VIP',    price: 2000, daily: 500,  days: 30, tag: null,         accent: 'gold'  },
  { name: 'Ultimate VIP', price: 5000, daily: 1000, days: 30, tag: 'Best value', accent: 'gold'  }
];

/* ---- Security helpers (password hashing with scrypt) ---------------------- */
function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), useSalt, 64).toString('hex');
  return { salt: useSalt, hash };
}
function verifyPassword(password, salt, expectedHash) {
  const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(check, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---- Seed a demo account once so the app has data to show ----------------- */
function seedDemo() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@swift.io');
  if (existing) return existing.id;

  const { salt, hash } = hashPassword('demo1234');
  const info = db.prepare(
    'INSERT INTO users (name, email, phone, password_hash, salt, role, tier, joined, avatar) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run('Emma Highest', 'demo@swift.io', '0541234567', hash, salt, 'user', 'VIP 2', 'Mar 2024', 'EH');
  const uid = info.lastInsertRowid;

  db.prepare('INSERT INTO wallets (user_id, balance, invested, available, today_pl, total_pl, total_pl_pct) VALUES (?,?,?,?,?,?,?)')
    .run(uid, 3250, 2000, 1250, 120, 640, 24.5);

  const perf = [['Mon',2610],['Tue',2680],['Wed',2740],['Thu',2810],['Fri',2960],['Sat',3080],['Sun',3250]];
  perf.forEach((p, i) => db.prepare('INSERT INTO performance (user_id, ord, label, value) VALUES (?,?,?,?)').run(uid, i, p[0], p[1]));

  db.prepare('INSERT INTO subscriptions (user_id, name, price, daily, days, day_of, status) VALUES (?,?,?,?,?,?,?)').run(uid, 'VIP 2', 200, 40, 30, 12, 'active');
  db.prepare('INSERT INTO subscriptions (user_id, name, price, daily, days, day_of, status) VALUES (?,?,?,?,?,?,?)').run(uid, 'VIP 1', 100, 20, 30, 24, 'active');

  const txns = [
    ['TXN-10241','2026-06-15','Income',60,'Completed'],
    ['TXN-10238','2026-06-14','Deposit',500,'Completed'],
    ['TXN-10231','2026-06-12','Investment',200,'Completed'],
    ['TXN-10225','2026-06-10','Withdrawal',300,'Pending'],
    ['TXN-10219','2026-06-08','Income',40,'Completed'],
    ['TXN-10204','2026-06-05','Withdrawal',150,'Failed']
  ];
  txns.forEach(t => db.prepare('INSERT INTO transactions (user_id, txid, date, type, amount, status) VALUES (?,?,?,?,?,?)').run(uid, t[0], t[1], t[2], t[3], t[4]));

  const notes = [
    ['Daily income credited','\u20b560.00 added from your active plans.','2h','profit',1],
    ['Deposit confirmed','\u20b5500.00 added to your wallet.','5h','brand',1],
    ['Withdrawal pending','\u20b5300.00 withdrawal is under review.','1d','loss',0]
  ];
  notes.forEach(n => db.prepare('INSERT INTO notifications (user_id, title, body, time, tone, unread) VALUES (?,?,?,?,?,?)').run(uid, n[0], n[1], n[2], n[3], n[4]));

  console.log('Seeded demo account -> email: demo@swift.io  password: demo1234');
  return uid;
}
const DEMO_ID = seedDemo();

/* =============================================================================
 * 2. SESSIONS  — who is making the request?
 * ===========================================================================*/
function createSession(userId) {
  const sid = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  db.prepare('INSERT INTO sessions (sid, user_id, expires) VALUES (?,?,?)').run(sid, userId, expires);
  return sid;
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
/* Returns the logged-in user id, or the demo user id so the app always works.
 * NOTE (production): remove the demo fallback and return 401 when no session. */
function currentUserId(req) {
  const sid = parseCookies(req).sid;
  if (sid) {
    const s = db.prepare('SELECT user_id, expires FROM sessions WHERE sid = ?').get(sid);
    if (s && s.expires > Date.now()) return s.user_id;
  }
  return DEMO_ID;
}

/* =============================================================================
 * 3. SMALL HTTP HELPERS
 * ===========================================================================*/
function sendJson(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); } });
  });
}
function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}
function summaryOf(uid) {
  const w = db.prepare('SELECT balance, invested, available, today_pl, total_pl, total_pl_pct FROM wallets WHERE user_id = ?').get(uid) || {};
  return {
    balance: w.balance || 0, invested: w.invested || 0, available: w.available || 0,
    todayPL: w.today_pl || 0, totalPL: w.total_pl || 0, totalPLPct: w.total_pl_pct || 0
  };
}
function nextTxId() { return 'TXN-' + Math.floor(10000 + Math.random() * 89999); }
function today() { return new Date().toISOString().slice(0, 10); }

/* =============================================================================
 * 4. API ROUTES
 * ===========================================================================*/
async function handleApi(req, res, route) {
  const method = req.method;
  const uid = currentUserId(req);

  // ---- Auth -----------------------------------------------------------------
  if (route === '/auth/register' && method === 'POST') {
    const b = await readBody(req);
    if (!b.email || !b.password) return sendJson(res, 400, { error: 'Email and password are required.' });
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(b.email)) return sendJson(res, 409, { error: 'That email is already registered.' });
    const { salt, hash } = hashPassword(b.password);
    const avatar = (b.name || 'New User').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
    const info = db.prepare('INSERT INTO users (name, email, phone, password_hash, salt, tier, joined, avatar) VALUES (?,?,?,?,?,?,?,?)')
      .run(b.name || 'New User', b.email, b.phone || '', hash, salt, 'VIP 1', 'Jun 2026', avatar);
    const newId = info.lastInsertRowid;
    db.prepare('INSERT INTO wallets (user_id, balance, invested, available) VALUES (?,0,0,0)').run(newId);
    const sid = createSession(newId);
    return sendJson(res, 200, { ok: true, user: publicUser(newId) }, cookieHeader(sid));
  }

  if (route === '/auth/login' && method === 'POST') {
    const b = await readBody(req);
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(b.email || '');
    if (!u || !verifyPassword(b.password || '', u.salt, u.password_hash)) {
      return sendJson(res, 401, { error: 'Invalid email or password.' });
    }
    const sid = createSession(u.id);
    return sendJson(res, 200, { ok: true, user: publicUser(u.id) }, cookieHeader(sid));
  }

  if (route === '/auth/logout' && method === 'POST') {
    const sid = parseCookies(req).sid;
    if (sid) db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' });
  }

  // ---- Read endpoints (match the front-end api object) ----------------------
  if (route === '/me' && method === 'GET') return sendJson(res, 200, publicUser(uid));
  if (route === '/portfolio/summary' && method === 'GET') return sendJson(res, 200, summaryOf(uid));
  if (route === '/portfolio/performance' && method === 'GET') {
    const rows = db.prepare('SELECT label, value FROM performance WHERE user_id = ? ORDER BY ord').all(uid);
    return sendJson(res, 200, { labels: rows.map(r => r.label), values: rows.map(r => r.value) });
  }
  if (route === '/plans' && method === 'GET') return sendJson(res, 200, PLANS);
  if (route === '/plans/active' && method === 'GET') {
    const rows = db.prepare("SELECT name, daily, days, day_of FROM subscriptions WHERE user_id = ? AND status = 'active'").all(uid);
    return sendJson(res, 200, rows.map(r => ({ name: r.name, daily: r.daily, days: r.days, dayOf: r.day_of })));
  }
  if (route === '/transactions' && method === 'GET') {
    const rows = db.prepare('SELECT txid AS id, date, type, amount, status FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC').all(uid);
    return sendJson(res, 200, rows);
  }
  if (route === '/notifications' && method === 'GET') {
    const rows = db.prepare('SELECT id, title, body, time, tone, unread FROM notifications WHERE user_id = ? ORDER BY id DESC').all(uid);
    return sendJson(res, 200, rows.map(r => ({ id: r.id, title: r.title, body: r.body, time: r.time, tone: r.tone, unread: !!r.unread })));
  }

  // ---- Money actions --------------------------------------------------------
  if (route === '/wallet/deposit' && method === 'POST') {
    const b = await readBody(req);
    const amount = Number(b.amount);
    if (!amount || amount <= 0) return sendJson(res, 400, { error: 'Enter a valid amount.' });
    db.prepare('UPDATE wallets SET balance = balance + ?, available = available + ? WHERE user_id = ?').run(amount, amount, uid);
    db.prepare('INSERT INTO transactions (user_id, txid, date, type, amount, status) VALUES (?,?,?,?,?,?)').run(uid, nextTxId(), today(), 'Deposit', amount, 'Completed');
    db.prepare('INSERT INTO notifications (user_id, title, body, time, tone, unread) VALUES (?,?,?,?,?,1)').run(uid, 'Deposit confirmed', '\u20b5' + amount.toFixed(2) + ' added to your wallet.', 'now', 'profit');
    return sendJson(res, 200, { ok: true, summary: summaryOf(uid) });
  }

  if (route === '/wallet/withdraw' && method === 'POST') {
    const b = await readBody(req);
    const amount = Number(b.amount);
    if (!amount || amount <= 0) return sendJson(res, 400, { error: 'Enter a valid amount.' });
    const w = summaryOf(uid);
    if (amount > w.available) return sendJson(res, 400, { error: 'Amount exceeds your available balance.' });
    db.prepare('UPDATE wallets SET balance = balance - ?, available = available - ? WHERE user_id = ?').run(amount, amount, uid);
    db.prepare('INSERT INTO transactions (user_id, txid, date, type, amount, status) VALUES (?,?,?,?,?,?)').run(uid, nextTxId(), today(), 'Withdrawal', amount, 'Pending');
    db.prepare('INSERT INTO notifications (user_id, title, body, time, tone, unread) VALUES (?,?,?,?,?,1)').run(uid, 'Withdrawal requested', '\u20b5' + amount.toFixed(2) + ' to ' + (b.account || 'your account') + ' is under review.', 'now', 'loss');
    return sendJson(res, 200, { ok: true, summary: summaryOf(uid) });
  }

  if (route === '/plans/subscribe' && method === 'POST') {
    const b = await readBody(req);
    const planName = b.plan && b.plan.name ? b.plan.name : b.plan;
    const plan = PLANS.find(p => p.name === planName);
    if (!plan) return sendJson(res, 400, { error: 'Unknown plan.' });
    const w = summaryOf(uid);
    if (plan.price > w.available) return sendJson(res, 400, { error: 'Top up your wallet to subscribe to ' + plan.name + '.' });
    db.prepare('UPDATE wallets SET available = available - ?, invested = invested + ? WHERE user_id = ?').run(plan.price, plan.price, uid);
    db.prepare('INSERT INTO subscriptions (user_id, name, price, daily, days, day_of, status) VALUES (?,?,?,?,?,0,?)').run(uid, plan.name, plan.price, plan.daily, plan.days, 'active');
    db.prepare('INSERT INTO transactions (user_id, txid, date, type, amount, status) VALUES (?,?,?,?,?,?)').run(uid, nextTxId(), today(), 'Investment', plan.price, 'Completed');
    db.prepare('INSERT INTO notifications (user_id, title, body, time, tone, unread) VALUES (?,?,?,?,?,1)').run(uid, 'Plan activated', 'You subscribed to ' + plan.name + '. Daily income starts tomorrow.', 'now', 'brand');
    return sendJson(res, 200, { ok: true, plan: plan, summary: summaryOf(uid) });
  }

  return sendJson(res, 404, { error: 'Unknown API route: ' + route });
}

function publicUser(uid) {
  const u = db.prepare('SELECT name, email, phone, tier, joined, avatar, role FROM users WHERE id = ?').get(uid) || {};
  return { name: u.name, email: u.email, phone: u.phone, tier: u.tier, joined: u.joined, avatar: u.avatar, role: u.role };
}
function cookieHeader(sid) {
  return { 'Set-Cookie': 'sid=' + sid + '; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax' };
}

/* =============================================================================
 * 5. STATIC FILES  — serve the front-end (public/index.html)
 * ===========================================================================*/
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  let filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Single-page app fallback: serve index.html for unknown paths.
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); return res.end('Not found. Did you copy the front-end into server/public/index.html?'); }
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* =============================================================================
 * 6. START THE SERVER
 * ===========================================================================*/
const server = http.createServer(async (req, res) => {
  try {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname.startsWith('/api/')) return await handleApi(req, res, u.pathname.slice(4));
    return serveStatic(req, res, u.pathname);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Server error' });
  }
});
server.listen(PORT, () => {
  console.log('Swift Investments backend running at http://localhost:' + PORT);
  console.log('API base: http://localhost:' + PORT + '/api');
});
