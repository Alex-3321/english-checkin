'use strict';
/* 英语打卡系统 v2 —— 零依赖：node:http + node:sqlite + node:crypto
 * 功能：注册/登录、签到打卡、头像、个人相册、隐私开关、好友、私聊、超管后台
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;

/* ---------------- 极简 .env 加载（零依赖，不覆盖已存在的环境变量） ---------------- */
(function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
})();
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data.db');
const SECRET_FILE = path.join(ROOT, '.secret');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_UPLOAD = 5 * 1024 * 1024;
const TZ = 'Asia/Shanghai';

fs.mkdirSync(AVATAR_DIR, { recursive: true });

/* ---------------- 会话密钥 ---------------- */
let SECRET = process.env.APP_SECRET || '';
if (!SECRET) {
  if (fs.existsSync(SECRET_FILE)) SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  else { SECRET = crypto.randomBytes(32).toString('base64url'); fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 }); }
}

/* ---------------- 数据库 ---------------- */
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    class_name    TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    total_score   INTEGER NOT NULL DEFAULT 0,
    avatar        TEXT,
    is_public     INTEGER NOT NULL DEFAULT 1,
    role          TEXT NOT NULL DEFAULT 'student',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('checkin','upload')),
    image_path TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_records_user_time ON records(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_records_time ON records(created_at);

  CREATE TABLE IF NOT EXISTS friends (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    friend_id  INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, friend_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id    INTEGER NOT NULL,
    to_id      INTEGER NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at    TEXT,
    FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_id)   REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(from_id, to_id, id);
  CREATE INDEX IF NOT EXISTS idx_msg_to ON messages(to_id, id);

  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE IF NOT EXISTS likes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id    INTEGER NOT NULL,
    to_id      INTEGER NOT NULL,
    day        TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (from_id, to_id, day),
    FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_id)   REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_likes_to ON likes(to_id);

  CREATE TABLE IF NOT EXISTS friend_requests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id    INTEGER NOT NULL,
    to_id      INTEGER NOT NULL,
    message    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    handled_at TEXT,
    FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_id)   REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_req_to ON friend_requests(to_id, status);
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_req_pending ON friend_requests(from_id, to_id) WHERE status='pending';
`);

/* ---------------- v2.1 迁移：打卡唯一性 + 软删除 ---------------- */
(() => {
  const cols = db.prepare('PRAGMA table_info(records)').all().map((c) => c.name);
  if (!cols.includes('record_day')) db.exec('ALTER TABLE records ADD COLUMN record_day TEXT');
  if (!cols.includes('deleted_at')) db.exec('ALTER TABLE records ADD COLUMN deleted_at TEXT');
  db.exec("UPDATE records SET record_day = substr(created_at, 1, 10) WHERE record_day IS NULL OR record_day = ''");
  try {
    /* 同一天同一用户只允许一条打卡（照片）；签到同理 */
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uniq_upload_day ON records(user_id, record_day) WHERE type='upload'");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uniq_checkin_day ON records(user_id, record_day) WHERE type='checkin'");
  } catch (e) {
    console.error('[migrate] 唯一索引创建失败（可能存在历史重复数据）:', e.message);
  }
})();

/* ---------------- v2.2 迁移：AI 评级 / 积分 / 图片去重 / 申诉 ---------------- */
(() => {
  const cols = db.prepare('PRAGMA table_info(records)').all().map((c) => c.name);
  const add = (name, ddl) => { if (!cols.includes(name)) db.exec(`ALTER TABLE records ADD COLUMN ${ddl}`); };
  add('level', 'level TEXT');
  add('comment', 'comment TEXT');
  add('points', 'points INTEGER');
  add('image_md5', 'image_md5 TEXT');
  db.exec("UPDATE records SET points = CASE WHEN type='checkin' THEN 10 ELSE 20 END WHERE points IS NULL");
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uniq_image_md5 ON records(image_md5) WHERE image_md5 IS NOT NULL");
  } catch (e) { console.error('[migrate] image_md5 唯一索引失败:', e.message); }

  const acols = db.prepare('PRAGMA table_info(appeals)').all().map((c) => c.name);
  if (acols.length) {
    if (!acols.includes('ai_explain')) db.exec('ALTER TABLE appeals ADD COLUMN ai_explain TEXT');
    if (!acols.includes('admin_reply')) db.exec('ALTER TABLE appeals ADD COLUMN admin_reply TEXT');
    if (!acols.includes('orig_level')) db.exec('ALTER TABLE appeals ADD COLUMN orig_level TEXT');
    db.exec("UPDATE appeals SET orig_level = (SELECT level FROM records r WHERE r.id = appeals.record_id) WHERE orig_level IS NULL");
  }

  const ucols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!ucols.includes('is_hidden')) db.exec('ALTER TABLE users ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0');
  if (!ucols.includes('current_token')) db.exec('ALTER TABLE users ADD COLUMN current_token TEXT');
  const qcols = db.prepare('PRAGMA table_info(read_quota)').all().map((c) => c.name);
  if (qcols.length && !qcols.includes('current_seq')) db.exec('ALTER TABLE read_quota ADD COLUMN current_seq INTEGER NOT NULL DEFAULT 0');
  if (qcols.length && !qcols.includes('current_batch')) db.exec('ALTER TABLE read_quota ADD COLUMN current_batch INTEGER NOT NULL DEFAULT 0');
  if (qcols.length && !qcols.includes('difficulty')) db.exec('ALTER TABLE read_quota ADD COLUMN difficulty TEXT');

  if (!ucols.includes('allow_multi_device')) db.exec('ALTER TABLE users ADD COLUMN allow_multi_device INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      seq INTEGER NOT NULL,
      title_en TEXT, title_cn TEXT, level TEXT, intro_cn TEXT,
      body_json TEXT NOT NULL,
      summary_cn TEXT,
      source TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, day, seq),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS article_reads (
      user_id INTEGER NOT NULL,
      article_id INTEGER NOT NULL,
      seconds INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (user_id, article_id)
    );
    CREATE TABLE IF NOT EXISTS read_daily (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      seconds INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      last_at TEXT,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS user_words (
      user_id INTEGER NOT NULL,
      word_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      learned INTEGER NOT NULL DEFAULT 0,
      learned_at TEXT,
      PRIMARY KEY (user_id, word_id)
    );
    CREATE TABLE IF NOT EXISTS word_daily (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      draws INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS read_served (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      seq INTEGER NOT NULL,
      article_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, day, seq)
    );
    CREATE TABLE IF NOT EXISTS read_quota (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      generated INTEGER NOT NULL DEFAULT 0,
      refreshed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS appeals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id    INTEGER NOT NULL,
      user_id      INTEGER NOT NULL,
      reason       TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      result_level TEXT,
      created_at   TEXT NOT NULL,
      handled_at   TEXT,
      ai_explain   TEXT,
      admin_reply  TEXT,
      orig_level   TEXT,
      FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_appeal_pending ON appeals(record_id) WHERE status='pending';

    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at    TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
  `);
})();

/* ---------------- 时间（严格 Asia/Shanghai，存储即北京时间） ---------------- */
const bd = require('./lib/business-day');
const aiGrader = require('./lib/ai-grader');
const readingLib = require('./lib/reading-library');
const WORDS = require('./lib/words');
const aiQueue = require('./lib/ai-queue');
const { nowDate, partsCN, businessDay, minutesOfDay, minutesToHHMM } = bd;

function nowCN(d = nowDate()) {
  const p = partsCN(d);
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${ms}+08:00`;
}
function todayStr() { const p = partsCN(); return `${p.year}-${p.month}-${p.day}`; }   // 自然日（仅展示用）
function dayStartCN(day) { return `${day}T00:00:00.000+08:00`; }
function addDay(day) {
  const d = new Date(`${day}T00:00:00+08:00`);
  d.setTime(d.getTime() + 86400000);
  const p = partsCN(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/* 自然季度：1-3 / 4-6 / 7-9 / 10-12 */
function quarterInfo(ref = nowDate()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
    .formatToParts(ref).reduce((a, x) => (a[x.type] = x.value, a), {});
  const y = Number(p.year), m = Number(p.month);
  const q = Math.floor((m - 1) / 3) + 1;
  const startMonth = (q - 1) * 3 + 1;
  const startISO = `${y}-${String(startMonth).padStart(2, '0')}-01T00:00:00.000+08:00`;
  return { year: y, quarter: q, startMonth, startISO, label: `${y} 年 Q${q}`, months: `${startMonth}-${startMonth + 2} 月` };
}
function adminResetAt() {
  const row = db.prepare("SELECT value FROM settings WHERE key='quarter_reset_at'").get();
  return row ? row.value : null;
}
/* 本季统计起点 = max(自然季度起点, 管理员清零时刻) */
function seasonCutoff() {
  const q = quarterInfo().startISO;
  const r = adminResetAt();
  return r && r > q ? r : q;
}

/* ---------------- 密码 ---------------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16), iter = 210000;
  const hash = crypto.pbkdf2Sync(pw, salt, iter, 32, 'sha256');
  return `pbkdf2$${iter}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [algo, iter, s, h] = String(stored).split('$');
    if (algo !== 'pbkdf2') return false;
    const salt = Buffer.from(s, 'base64'), expect = Buffer.from(h, 'base64');
    const got = crypto.pbkdf2Sync(pw, salt, Number(iter), expect.length, 'sha256');
    return crypto.timingSafeEqual(expect, got);
  } catch { return false; }
}

/* ---------------- 会话 ---------------- */
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return (!p.exp || p.exp < Date.now()) ? null : p; } catch { return null; }
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const PUBLIC_COLS = 'id, student_id, name, class_name, total_score, avatar, is_public, is_hidden, role, created_at';

/* ================= 段位系统 ================= */
const RANKS = [
  { key: 'nascent',      en: 'Nascent',      cn: '微光初现', base: 0 },
  { key: 'ascendant',    en: 'Ascendant',    cn: '渐入佳境', base: 200 },
  { key: 'virtuoso',     en: 'Virtuoso',     cn: '游刃有余', base: 700 },
  { key: 'paragon',      en: 'Paragon',      cn: '卓尔不群', base: 1400 },
  { key: 'erudite',      en: 'Erudite',      cn: '博文约礼', base: 2100 },
  { key: 'steadfast',    en: 'Steadfast',    cn: '跬步千里', base: 2700 },
  { key: 'sublime',      en: 'Sublime',      cn: '高山仰止', base: 3200 },
  { key: 'transcendent', en: 'Transcendent', cn: '超然物外', base: 3500 },
  { key: 'zenith',       en: 'Zenith',       cn: '十年磨剑', base: 3800 },
];

function rankInfo(score) {
  score = Number(score) || 0;
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].base) idx = i;
  const cur = RANKS[idx], nxt = RANKS[idx + 1] || null;
  return {
    tier_key: cur.key,
    tier_en: cur.en,
    tier_cn: cur.cn,
    tier_base: cur.base,
    tier_index: idx,
    tier_next_key: nxt ? nxt.key : null,
    tier_next_en: nxt ? nxt.en : null,
    tier_next_cn: nxt ? nxt.cn : null,
    tier_next_base: nxt ? nxt.base : null,
    tier_need: nxt ? Math.max(0, nxt.base - score) : 0,
    tier_progress: nxt ? Math.max(0, Math.min(1, (score - cur.base) / (nxt.base - cur.base))) : 1,
    tier_is_max: !nxt,
  };
}
/* 返回 { user } | { code: 'invalid' | 'kicked' } */
function resolveSession(req) {
  const p = verify(cookies(req).sid);
  if (!p || !p.iat) return { code: 'invalid' };
  const user = db.prepare(`SELECT ${PUBLIC_COLS}, current_token, allow_multi_device FROM users WHERE id = ?`).get(p.uid);
  if (!user) return { code: 'invalid' };
  const born = Date.parse(user.created_at);
  if (Number.isFinite(born) && p.iat < born) return { code: 'invalid' };

  /* 单设备登录：cookie 里的 sn 必须等于库里最新的 current_token。
     allow_multi_device = 1 的账号（超级管理员 3321）跳过此校验，可多端并存。 */
  if (!user.allow_multi_device) {
    if (!user.current_token) return { code: 'invalid' };        /* 老会话（无顶号机制）→ 正常重新登录 */
    if (p.sn !== user.current_token) return { code: 'kicked' };  /* 被新设备顶掉 */
  }
  return { user };
}
function currentUser(req) {
  const r = resolveSession(req);
  return r.user || null;
}
const COOKIE = (v, age) => `sid=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

/* ---------------- HTTP 工具 ---------------- */
function sendJSON(res, code, obj, extra) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  }, extra || {}));
  res.end(body);
}
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) throw new Error('no boundary');
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  const parts = [];
  let idx = buf.indexOf(boundary);
  while (idx !== -1) {
    const start = idx + boundary.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    const headerStart = start + 2;
    const headerEnd = buf.indexOf('\r\n\r\n', headerStart);
    if (headerEnd === -1) break;
    const headers = buf.slice(headerStart, headerEnd).toString('utf8');
    const next = buf.indexOf(boundary, headerEnd + 4);
    if (next === -1) break;
    const data = buf.slice(headerEnd + 4, next - 2);
    const nameM = /name="([^"]*)"/i.exec(headers);
    parts.push({ name: nameM ? nameM[1] : '', data });
    idx = next;
  }
  return parts;
}
function sniffImage(d) {
  if (!d || d.length < 12) return null;
  if (d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff) return 'jpg';
  if (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47) return 'png';
  if (d.slice(0, 4).toString() === 'RIFF' && d.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (d.slice(0, 3).toString() === 'GIF') return 'gif';
  return null;
}

function isFriend(a, b) {
  return !!db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?').get(a, b);
}
function likeCount(id) {
  return db.prepare('SELECT COUNT(*) c FROM likes WHERE to_id=?').get(id).c;
}

/* ---------------- 积分 ---------------- */
const PTS = { checkin: 10, upload: 20 };
function quarterScore(uid) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(points),0) s
    FROM records WHERE user_id=? AND created_at>=? AND deleted_at IS NULL`).get(uid, seasonCutoff());
  return row ? row.s : 0;
}

/* ================= 沉浸阅读 ================= */
const READ = { perMinute: 1, perArticleCap: 6, dailyCap: 12, batchSize: 10 };
const BATCH_COUNT = () => Math.ceil(readingLib.ARTICLES.length / READ.batchSize);
const tierSize = (d) => readingLib.byDifficulty(d).length;
const batchSizeFor = (d) => Math.min(READ.batchSize, Math.max(1, tierSize(d) || READ.batchSize));
const batchCountFor = (d) => Math.max(1, Math.ceil((tierSize(d) || READ.batchSize) / batchSizeFor(d)));
const DAY_MS = 864e5;

function readQuota(uid, day) {
  let q = db.prepare('SELECT * FROM read_quota WHERE user_id=? AND day=?').get(uid, day);
  if (!q) {
    db.prepare('INSERT INTO read_quota (user_id,day,generated,refreshed) VALUES (?,?,0,0)').run(uid, day);
    q = { generated: 0, refreshed: 0 };
  }
  return q;
}

function readDaily(uid, day) {
  let r = db.prepare('SELECT * FROM read_daily WHERE user_id=? AND day=?').get(uid, day);
  if (!r) {
    db.prepare('INSERT INTO read_daily (user_id,day,seconds,points) VALUES (?,?,0,0)').run(uid, day);
    r = { seconds: 0, points: 0, last_at: null };
  }
  return r;
}

function articleRow(row) {
  const body = JSON.parse(row.body_json);
  const read = db.prepare('SELECT seconds,points FROM article_reads WHERE user_id=? AND article_id=?').get(row.user_id, row.id) || { seconds: 0, points: 0 };
  return {
    id: row.id, day: row.day, seq: row.seq,
    title_en: row.title_en, title_cn: row.title_cn, level: row.level,
    intro_cn: row.intro_cn, summary_cn: row.summary_cn, source: row.source,
    paragraphs: body, created_at: row.created_at,
    read_seconds: read.seconds, points: read.points,
  };
}

function readProgress(uid, day, article) {
  const daily = readDaily(uid, day);
  const q = readQuota(uid, day);
  return {
    day,
    daily_seconds: daily.seconds,
    daily_points: daily.points,
    daily_cap: READ.dailyCap,
    article_points: article ? article.points : 0,
    article_cap: READ.perArticleCap,
    article_seconds: article ? article.read_seconds : 0,
    generated: q.generated,
    generate_limit: READ.dailyArticles,
    refreshed: q.refreshed,
    refresh_limit: READ.dailyArticles,
  };
}

function seedRand(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 为某个用户当天挑 10 篇：优先从未出现过的文章里选，池子不够时用最久未用的补 */
function pickDailySet(uid, day, n, difficulty) {
  const used = new Set(db.prepare('SELECT article_id FROM read_served WHERE user_id=?').all(uid).map((r) => r.article_id));
  const rand = seedRand(Number(String(uid).replace(/\D/g, '')) * 7919 + Number(String(day).replace(/\D/g, '')));
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const tier = readingLib.byDifficulty(difficulty).map((a) => a.id);
  const others = readingLib.ARTICLES.filter((a) => a.difficulty !== difficulty).map((a) => a.id);
  const order = shuffle(tier).concat(shuffle(others));
  const unseen = order.filter((id) => !used.has(id));
  let picks = unseen.slice(0, n);
  if (picks.length < n) {
    const stat = new Map(db.prepare('SELECT article_id, COUNT(*) c, MAX(day) d FROM read_served WHERE user_id=? GROUP BY article_id').all(uid).map((r) => [r.article_id, r]));
    const rest = order.filter((id) => !picks.includes(id)).sort((x, y) => {
      const A = stat.get(x) || { c: 0, d: '' }, B = stat.get(y) || { c: 0, d: '' };
      return A.c - B.c || String(A.d).localeCompare(String(B.d)) || x - y;
    });
    picks = picks.concat(rest.slice(0, n - picks.length));
  }
  return picks;
}

function ensureBatch(uid, day, batch) {
  const q0 = readQuota(uid, day);
  const size = batchSizeFor(q0.difficulty);
  const from = (batch - 1) * size + 1;
  const to = batch * size;
  const rows = db.prepare('SELECT seq, article_id FROM read_served WHERE user_id=? AND day=?').all(uid, day);
  const have = new Map(rows.map((r) => [r.seq, r.article_id]));
  const missing = [];
  for (let s = from; s <= to; s++) if (!have.has(s)) missing.push(s);
  if (!missing.length) return;
  const usedToday = new Set(rows.map((r) => r.article_id));
  const usedAll = new Set(db.prepare('SELECT article_id FROM read_served WHERE user_id=?').all(uid).map((r) => r.article_id));
  const need = missing.length + usedToday.size;
  const q = readQuota(uid, day);
  const picks = pickDailySet(uid, day, Math.max(need, size), q.difficulty).filter((id) => !usedToday.has(id));
  for (const seq of missing) {
    const id = picks.shift();
    if (!id) break;
    db.prepare('INSERT OR IGNORE INTO read_served (user_id,day,seq,article_id) VALUES (?,?,?,?)').run(uid, day, seq, id);
  }
}

function batchOf(seq) { return Math.ceil(seq / READ.batchSize); }

function listItem(row) {
  const lib = readingLib.byId(row.article_id);
  if (!lib) return null;
  const read = db.prepare('SELECT seconds,points FROM article_reads WHERE user_id=? AND article_id=?').get(row.user_id || 0, lib.id) || { seconds: 0, points: 0 };
  return { id: lib.id, seq: row.seq, title_cn: lib.title_cn, title_en: lib.title_en, level: lib.level, difficulty: lib.difficulty, kind: lib.kind, words: lib.words || 0, read_seconds: read.seconds, points: read.points };
}

function readListPayload(uid, day) {
  const q = readQuota(uid, day);
  const curBatch = Number(q.current_batch) || 1;
  const batches = [];
  const size = batchSizeFor(q.difficulty);
  for (let b = curBatch; b <= curBatch; b++) {
    const rows = db.prepare(`SELECT seq, article_id FROM read_served WHERE user_id=? AND day=? AND seq BETWEEN ? AND ? ORDER BY seq`)
      .all(uid, day, (b - 1) * size + 1, b * size);
    batches.push({
      batch: b,
      items: rows.map((r) => {
        const lib = readingLib.byId(r.article_id);
        if (!lib) return null;
        const read = db.prepare('SELECT seconds,points FROM article_reads WHERE user_id=? AND article_id=?').get(uid, lib.id) || { seconds: 0, points: 0 };
        return { id: lib.id, seq: r.seq, title_cn: lib.title_cn, title_en: lib.title_en, level: lib.level, difficulty: lib.difficulty, kind: lib.kind, words: lib.words || 0, read_seconds: read.seconds, points: read.points };
      }).filter(Boolean),
    });
  }
  const daily = readDaily(uid, day);
  return {
    day,
    batches,
    difficulty: q.difficulty || null,
    need_difficulty: !q.difficulty,
    current_batch: curBatch,
    batch_count: batchCountFor(q.difficulty || '初级'),
    remaining_refresh: Math.max(0, batchCountFor(q.difficulty || '初级') - curBatch),
    library_size: readingLib.ARTICLES.length,
    progress: {
      day,
      daily_seconds: daily.seconds,
      daily_points: daily.points,
      daily_cap: READ.dailyCap,
      article_cap: READ.perArticleCap,
      refreshed: Math.max(0, curBatch - 1),
      refresh_limit: batchCountFor(q.difficulty || '初级') - 1,
    },
  };
}

/* 取某天第 seq 篇 */
function servedArticle(uid, day, seq, create) {
  let row = db.prepare('SELECT article_id FROM read_served WHERE user_id=? AND day=? AND seq=?').get(uid, day, seq);
  if (!row && create) {
    const art = readingLib.pickFor(uid, day, seq);
    db.prepare('INSERT OR IGNORE INTO read_served (user_id,day,seq,article_id) VALUES (?,?,?,?)').run(uid, day, seq, art.id);
    row = { article_id: art.id };
  }
  if (!row) return null;
  const lib = readingLib.byId(row.article_id);
  if (!lib) return null;
  const read = db.prepare('SELECT seconds,points FROM article_reads WHERE user_id=? AND article_id=?').get(uid, lib.id) || { seconds: 0, points: 0 };
  return {
    id: lib.id, key: lib.key, title_en: lib.title_en, title_cn: lib.title_cn,
    level: lib.level, intro_cn: lib.intro_cn, summary_cn: lib.summary_cn,
    paragraphs: lib.paragraphs, source: lib.source, license: lib.license, kind: lib.kind,
    read_seconds: read.seconds, points: read.points,
  };
}

function dayList(day, n) {
  const out = [];
  const base = new Date(`${day}T12:00:00+08:00`).getTime();
  for (let i = 0; i < n; i++) out.push(new Date(base - i * DAY_MS).toISOString().slice(0, 10));
  return out;
}

function readHistory(uid, n) {
  const days = dayList(businessDay(), n || 3);
  const quotas = new Map(db.prepare(`SELECT day, current_seq FROM read_quota WHERE user_id=? AND day IN (${days.map(() => '?').join(',')})`)
    .all(uid, ...days).map((r) => [r.day, Number(r.current_seq) || 0]));
  const rows = db.prepare(`SELECT day, seq, article_id FROM read_served WHERE user_id=? AND day IN (${days.map(() => '?').join(',')}) ORDER BY day DESC, seq ASC`)
    .all(uid, ...days).filter((r) => r.seq <= (r.day === businessDay() ? (quotas.get(r.day) || READ.dailyArticles) : (quotas.get(r.day) || 0)));
  const byDay = new Map(days.map((d) => [d, []]));
  for (const r of rows) {
    const lib = readingLib.byId(r.article_id);
    if (!lib) continue;
    const d = byDay.get(r.day);
    if (d) d.push({ id: lib.id, seq: r.seq, title_en: lib.title_en, title_cn: lib.title_cn, level: lib.level, source: lib.source });
  }
  return days.map((d) => ({ day: d, items: byDay.get(d) }));
}

/* 阅读积分结算：每分钟 1 分，单篇封顶 6，每日封顶 12 */
function settleReading(uid, day, articleId, addSeconds) {
  const daily = readDaily(uid, day);
  const rec = db.prepare('SELECT * FROM article_reads WHERE user_id=? AND article_id=?').get(uid, articleId)
    || { seconds: 0, points: 0 };
  const newDailySeconds = daily.seconds + addSeconds;
  const newArticleSeconds = rec.seconds + addSeconds;

  const articlePts = Math.min(READ.perArticleCap, Math.floor(newArticleSeconds / 60) * READ.perMinute);
  const dailyPts = Math.min(READ.dailyCap, Math.floor(newDailySeconds / 60) * READ.perMinute);
  const gain = Math.max(0, Math.min(articlePts - rec.points, dailyPts - daily.points));

  db.prepare(`INSERT INTO article_reads (user_id,article_id,seconds,points,updated_at) VALUES (?,?,?,?,?)
              ON CONFLICT(user_id,article_id) DO UPDATE SET seconds=excluded.seconds, points=excluded.points, updated_at=excluded.updated_at`)
    .run(uid, articleId, newArticleSeconds, rec.points + gain, nowCN());
  db.prepare(`UPDATE read_daily SET seconds=?, points=?, last_at=? WHERE user_id=? AND day=?`)
    .run(newDailySeconds, daily.points + gain, nowCN(), uid, day);
  if (gain > 0) db.prepare('UPDATE users SET total_score = total_score + ? WHERE id=?').run(gain, uid);
  return { gain, seconds: newDailySeconds, points: daily.points + gain, article_points: rec.points + gain };
}
/* 是否在当前「业务日」已有该类型记录 */
function hasToday(uid, type) {
  return !!db.prepare('SELECT 1 FROM records WHERE user_id=? AND type=? AND record_day=?')
    .get(uid, type, businessDay());
}
function bumpTotal(uid, pts) {
  db.prepare('UPDATE users SET total_score = total_score + ? WHERE id=?').run(pts, uid);
}

/* ---------------- 站点标题（可在后台修改，env 作为初始值） ---------------- */
const DEFAULT_SITE_TITLE = process.env.SITE_TITLE || '朗英 英语协会';

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row && row.value != null ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key,value) VALUES (?,?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}
function siteTitle() {
  return getSetting('site_title', DEFAULT_SITE_TITLE);
}
/* 首次启动写入默认值，之后以数据库为准 */
if (!db.prepare("SELECT 1 FROM settings WHERE key='site_title'").get()) {
  setSetting('site_title', DEFAULT_SITE_TITLE);
}

/* ---------------- 管理员保证存在 ---------------- */
/* 超管固定身份：学号 3321 不满足普通用户的 8-12 位规则，
 * 但登录接口本身不做格式校验（只查库 + 验密），因此天然可登录；
 * 注册接口仍然严格执行 8-12 位，两者互不影响。 */
const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID || '3321';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || '';

function ensureAdmin() {
  const row = db.prepare("SELECT id FROM users WHERE role='super_admin'").get();
  if (row) return;
  if (!SUPER_ADMIN_PASSWORD) {
    console.warn('[boot] 未配置 SUPER_ADMIN_PASSWORD，跳过超级管理员初始化（见 .env.example）');
    return;
  }
  db.prepare(`INSERT INTO users (student_id,name,class_name,password_hash,total_score,avatar,is_public,role,created_at)
              VALUES (?,?,?,?,0,NULL,1,'super_admin',?)`)
    .run(SUPER_ADMIN_ID, '超级管理员', '系统', hashPassword(SUPER_ADMIN_PASSWORD), nowCN());
}
ensureAdmin();

/* ---------------- 校验 ---------------- */
const RE_STUDENT = /^\d{8,12}$/;
const RE_NAME_CN = /^[\u4e00-\u9fa5·]{2,16}$/;
function validateRegister(b) {
  const student_id = String(b.student_id || '').trim();
  const name = String(b.name || '').trim();
  const class_name = String(b.class_name || '').trim();
  const password = String(b.password || '');
  if (!RE_STUDENT.test(student_id)) return { error: '学号必须是 8-12 位纯数字' };
  if (!RE_NAME_CN.test(name)) return { error: '姓名请填写中文真实姓名（2-16 个汉字）' };
  if (!class_name || class_name.length > 32) return { error: '请填写班级（不超过 32 字）' };
  if (password.length < 6) return { error: '密码不能少于 6 位' };
  return { student_id, name, class_name, password };
}

/* ---------------- 业务接口 ---------------- */
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  /* ---- 公开：注册 / 登录 ---- */
  if (p === '/api/register' && method === 'POST') {
    const raw = JSON.parse((await readBody(req)).toString() || '{}');
    const v = validateRegister(raw);
    if (v.error) return sendJSON(res, 400, { error: v.error });
    if (db.prepare('SELECT 1 FROM users WHERE student_id=?').get(v.student_id)) return sendJSON(res, 409, { error: '该学号已注册' });

    const sn = crypto.randomUUID();
    const info = db.prepare(`INSERT INTO users (student_id,name,class_name,password_hash,total_score,is_public,role,created_at,current_token)
                             VALUES (?,?,?,?,0,1,'student',?,?)`)
      .run(v.student_id, v.name, v.class_name, hashPassword(v.password), nowCN(), sn);
    const uid = Number(info.lastInsertRowid);
    const u = db.prepare(`SELECT ${PUBLIC_COLS} FROM users WHERE id=?`).get(uid);
    return sendJSON(res, 200, { ok: true, user: u },
      { 'Set-Cookie': COOKIE(sign({ uid, iat: nowDate().getTime(), exp: nowDate().getTime() + 30 * 864e5, sn }), 30 * 86400) });
  }

  if (p === '/api/login' && method === 'POST') {
    const b = JSON.parse((await readBody(req)).toString() || '{}');
    /* 登录不做学号格式校验：超管 3321 仅 4 位，普通用户 8-12 位，
       两者都能登录，格式限制只作用于注册。 */
    const sid = String(b.student_id || '').trim();
    const pw = String(b.password || '');
    const row = db.prepare('SELECT * FROM users WHERE student_id=?').get(sid);
    if (!row || !verifyPassword(pw, row.password_hash)) return sendJSON(res, 401, { error: '学号或密码错误' });

    /* 顶号：每次登录生成新会话号；非白名单账号直接覆盖库里的 current_token */
    const sn = crypto.randomUUID();
    if (!row.allow_multi_device) {
      db.prepare('UPDATE users SET current_token=? WHERE id=?').run(sn, row.id);
    }
    const u = db.prepare(`SELECT ${PUBLIC_COLS} FROM users WHERE id=?`).get(row.id);
    return sendJSON(res, 200, { ok: true, user: u },
      { 'Set-Cookie': COOKIE(sign({ uid: row.id, iat: nowDate().getTime(), exp: nowDate().getTime() + 30 * 864e5, sn }), 30 * 86400) });
  }

  /* ---- 公开：站点配置（登录页也要用） ---- */
  if (p === '/api/site' && method === 'GET') {
    return sendJSON(res, 200, { title: siteTitle() });
  }

  /* ---- 以下全部需要登录 ---- */
  const sess = resolveSession(req);
  if (!sess.user) {
    if (sess.code === 'kicked') {
      return sendJSON(res, 401, { error: '您的账号已在其他设备登录，当前设备已下线', code: 'SESSION_KICKED' });
    }
    return sendJSON(res, 401, { error: '未登录', code: 'UNAUTHENTICATED' });
  }
  const me = sess.user;
  const isAdmin = me.role === 'super_admin';

  if (p === '/api/logout' && method === 'POST') {
    if (!me.allow_multi_device) db.prepare('UPDATE users SET current_token=NULL WHERE id=?').run(me.id);
    return sendJSON(res, 200, { ok: true }, {
      'Set-Cookie': COOKIE('', 0),
      /* 通知浏览器清空本站 cookie / 缓存 / localStorage / sessionStorage */
      'Clear-Site-Data': '"cache", "cookies", "storage"',
    });
  }

  if (p === '/api/me' && method === 'GET') {

    return sendJSON(res, 200, {
      user: (() => {
        const total = db.prepare('SELECT total_score FROM users WHERE id=?').get(me.id).total_score;
        return { ...me, total_score: total, ...rankInfo(total) };
      })(),
      quarter: quarterInfo(),
      season_cutoff: seasonCutoff(),
      quarter_score: quarterScore(me.id),
      today: todayStr(),
      business_day: businessDay(),
      reset_hour: bd.RESET_HOUR,
      day_open: Number(partsCN().hour) >= bd.RESET_HOUR,
      checked_in: hasToday(me.id, 'checkin'),
      uploaded: hasToday(me.id, 'upload'),
      server_time: nowCN(),
      site_title: siteTitle(),
    });
  }

  if (p === '/api/check-in' && method === 'POST') {
    if (me.role === 'super_admin') return sendJSON(res, 400, { error: '管理员不参与打卡' });
    if (hasToday(me.id, 'checkin')) return sendJSON(res, 400, { error: '今日已签到，不可重复提交' });
    const cday = businessDay();
    try {
      db.prepare('INSERT INTO records (user_id,type,image_path,created_at,record_day,points) VALUES (?,?,NULL,?,?,?)')
        .run(me.id, 'checkin', nowCN(), cday, PTS.checkin);
    } catch (e) {
      if (/UNIQUE/i.test(e.message)) return sendJSON(res, 400, { error: '今日已签到，不可重复提交' });
      throw e;
    }
    bumpTotal(me.id, PTS.checkin);
    return sendJSON(res, 200, { ok: true, gained: PTS.checkin, quarter_score: quarterScore(me.id) });
  }

  if (p === '/api/upload' && method === 'POST') {
    if (me.role === 'super_admin') return sendJSON(res, 400, { error: '管理员不参与打卡' });
    if (hasToday(me.id, 'upload')) return sendJSON(res, 400, { error: '今日已打卡，不可重复提交或修改' });

    const buf = await readBody(req, MAX_UPLOAD + 2 * 1024 * 1024);
    const parts = parseMultipart(buf, req.headers['content-type']);
    const file = parts.find((x) => x.data && x.data.length > 0);
    if (!file) return sendJSON(res, 400, { error: '没有收到图片' });
    if (file.data.length > MAX_UPLOAD) return sendJSON(res, 413, { error: '图片不能超过 5MB' });
    const ext = sniffImage(file.data);
    if (!ext) return sendJSON(res, 400, { error: '只支持 jpg/png/webp/gif 图片' });

    /* 防作弊：同一张图不允许重复使用 */
    const hash = aiGrader.md5(file.data);
    if (db.prepare('SELECT 1 FROM records WHERE image_md5=?').get(hash)) {
      return sendJSON(res, 409, { error: '请勿重复使用历史照片' });
    }

    /* AI 阅卷：失败/超时自动降级为 B 级 */
    let grade;
    try {
      grade = await aiQueue.run(() => aiGrader.gradeImage(file.data, `image/${ext}`));
    } catch (e) {
      const reason = e.code === 'QUEUE_TIMEOUT' ? '排队超时' : e.message;
      console.error('[ai] 阅卷失败（' + reason + '），降级为 B');
      grade = { level: 'B', comment: 'AI老师繁忙，本次按B级发放积分', degraded: true };
    }

    if (grade.level === 'INVALID') {
      return sendJSON(res, 200, {
        ok: true, accepted: false, level: 'INVALID',
        comment: grade.comment,
        message: '打卡失败，请上传真实的英语学习照片或背词APP截图',
      });
    }

    const pts = aiGrader.POINTS[grade.level] || 25;
    const fname = `${me.id}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), file.data, { mode: 0o644 });

    try {
      db.prepare(`INSERT INTO records (user_id,type,image_path,created_at,record_day,level,comment,points,image_md5)
                  VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(me.id, 'upload', fname, nowCN(), businessDay(), grade.level, grade.comment, pts, hash);
    } catch (e) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, fname)); } catch {}
      if (/UNIQUE/i.test(e.message)) return sendJSON(res, 409, { error: '请勿重复使用历史照片' });
      throw e;
    }
    bumpTotal(me.id, pts);

    return sendJSON(res, 200, {
      ok: true, accepted: true,
      level: grade.level, points: pts, comment: grade.comment,
      degraded: !!grade.degraded,
      image: `/uploads/${fname}`,
      quarter_score: quarterScore(me.id),
    });
  }

  if (p === '/api/avatar' && method === 'POST') {
    const buf = await readBody(req, MAX_UPLOAD + 2 * 1024 * 1024);
    const parts = parseMultipart(buf, req.headers['content-type']);
    const file = parts.find((x) => x.data && x.data.length > 0);
    if (!file) return sendJSON(res, 400, { error: '没有收到图片' });
    if (file.data.length > MAX_UPLOAD) return sendJSON(res, 413, { error: '头像不能超过 5MB' });
    const ext = sniffImage(file.data);
    if (!ext) return sendJSON(res, 400, { error: '只支持图片文件' });
    const fname = `a-${me.id}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(AVATAR_DIR, fname), file.data, { mode: 0o644 });
    const old = me.avatar;
    db.prepare('UPDATE users SET avatar=? WHERE id=?').run(`/uploads/avatars/${fname}`, me.id);
    if (old) { const f = path.join(ROOT, old.replace(/^\//, '')); try { fs.unlinkSync(f); } catch {} }
    return sendJSON(res, 200, { ok: true, avatar: `/uploads/avatars/${fname}` });
  }

  if (p === '/api/privacy' && method === 'PATCH') {
    const b = JSON.parse((await readBody(req)).toString() || '{}');
    const pub = b.is_public ? 1 : 0;
    db.prepare('UPDATE users SET is_public=? WHERE id=?').run(pub, me.id);
    return sendJSON(res, 200, { ok: true, is_public: pub });
  }

  if (p === '/api/leaderboard' && method === 'GET') {
    const rows = db.prepare(`
      SELECT u.id, u.student_id, u.name, u.class_name, u.avatar, u.total_score,
             COALESCE(SUM(r.points),0) AS score,
             SUM(CASE r.type WHEN 'checkin' THEN 1 ELSE 0 END) AS checkin_days,
             SUM(CASE r.type WHEN 'upload' THEN 1 ELSE 0 END) AS upload_days
      FROM users u LEFT JOIN records r ON r.user_id=u.id AND r.created_at>=? AND r.deleted_at IS NULL
      WHERE u.role='student' AND COALESCE(u.is_hidden,0)=0
      GROUP BY u.id ORDER BY score DESC, u.total_score DESC, u.created_at ASC`).all(seasonCutoff());
    const readMap = new Map(db.prepare('SELECT user_id, SUM(points) s FROM read_daily WHERE day>=? GROUP BY user_id')
      .all(seasonCutoff().slice(0, 10)).map((x) => [x.user_id, x.s]));
    const wordMap = new Map(db.prepare('SELECT user_id, SUM(points) s FROM word_daily WHERE day>=? GROUP BY user_id')
      .all(seasonCutoff().slice(0, 10)).map((x) => [x.user_id, x.s]));
    for (const r of rows) r.score += (readMap.get(r.id) || 0) + (wordMap.get(r.id) || 0);
    /* 历史平均打卡时间：用真实点击时间戳（北京时间 HH:mm）求平均，早起者更早 */
    const acc = new Map();
    for (const c of db.prepare("SELECT user_id, created_at FROM records WHERE type='checkin' AND deleted_at IS NULL").all()) {
      const m = minutesOfDay(new Date(c.created_at));
      const a = acc.get(c.user_id) || { sum: 0, n: 0 };
      a.sum += m; a.n += 1; acc.set(c.user_id, a);
    }

    const enriched = rows.map((r) => {
      const a = acc.get(r.id);
      const avg = a && a.n ? a.sum / a.n : null;
      return { ...r, avg_min: avg, avg_time: minutesToHHMM(avg), ...rankInfo(r.total_score) };
    });

    /* 排序：本季积分降序 → 平均打卡时间升序（早者靠前，无记录排最后）→ 总积分降序 */
    enriched.sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      if (x.avg_min == null && y.avg_min == null) return y.total_score - x.total_score;
      if (x.avg_min == null) return 1;
      if (y.avg_min == null) return -1;
      if (x.avg_min !== y.avg_min) return x.avg_min - y.avg_min;
      return y.total_score - x.total_score;
    });

    return sendJSON(res, 200, {
      quarter: quarterInfo(), season_cutoff: seasonCutoff(),
      ranking: enriched.map((r, i) => ({ ...r, rank: i + 1 })),
    });
  }

  /* 用户搜索（加好友用） */
  if (p === '/api/users/search' && method === 'GET') {
    const q = String(url.searchParams.get('q') || '').trim();
    if (!q) return sendJSON(res, 200, { items: [] });
    const rows = db.prepare(`
      SELECT id, student_id, name, class_name, avatar FROM users
      WHERE role='student' AND COALESCE(is_hidden,0)=0 AND (student_id LIKE ? OR name LIKE ?) AND id<>?
      ORDER BY name LIMIT 20`).all(`%${q}%`, `%${q}%`, me.id);
    return sendJSON(res, 200, { items: rows });
  }

  /* 个人主页 */
  const mProfile = /^\/api\/users\/(\d+)$/.exec(p);
  if (mProfile && method === 'GET') {
    const id = Number(mProfile[1]);
    const u = db.prepare(`SELECT ${PUBLIC_COLS} FROM users WHERE id=?`).get(id);
    if (!u) return sendJSON(res, 404, { error: '用户不存在' });
    /* 幽灵号：对普通用户表现为「查无此人」 */
    if (u.is_hidden && id !== me.id && !isAdmin) return sendJSON(res, 404, { error: '用户不存在' });
    const canSee = id === me.id || isAdmin || u.is_public === 1;
    const photos = canSee
      ? db.prepare(`SELECT r.id, r.image_path, r.created_at, r.level, r.points,
                      (SELECT a.status FROM appeals a WHERE a.record_id=r.id ORDER BY a.id DESC LIMIT 1) AS appeal_status
                    FROM records r WHERE r.user_id=? AND r.type='upload' AND r.deleted_at IS NULL
                    ORDER BY r.created_at DESC LIMIT 200`).all(id)
      : [];
    const pending = db.prepare("SELECT id FROM friend_requests WHERE from_id=? AND to_id=? AND status='pending'").get(me.id, id);
    return sendJSON(res, 200, {
      user: {
        ...u,
        ...rankInfo(u.total_score),
        is_friend: isFriend(me.id, id),
        likes: likeCount(id),
        liked_today: !!db.prepare('SELECT 1 FROM likes WHERE from_id=? AND to_id=? AND day=?').get(me.id, id, todayStr()),
        is_self: id === me.id,
        request_pending: !!pending,
      },
      can_see_photos: canSee,
      photos: photos.map((x) => ({ id: x.id, url: `/uploads/${x.image_path}`, at: x.created_at,
                                   level: x.level, points: x.points, appeal_status: x.appeal_status })),
      quarter_score: quarterScore(id),
    });
  }



  /* ================= 抽词卡牌 ================= */
  const WORD_LIMIT = 3, WORD_DRAW_SIZE = 5, WORD_DRAW_POINTS = 2, WORD_LEARN_POINTS = 2;

  function wordState(uid, day) {
    const d = db.prepare('SELECT draws, points FROM word_daily WHERE user_id=? AND day=?').get(uid, day) || { draws: 0, points: 0 };
    const rows = db.prepare(`SELECT uw.word_id, uw.learned FROM user_words uw WHERE uw.user_id=? AND uw.day=?`).all(uid, day);
    const items = rows.map((r) => {
      const w = WORDS[r.word_id - 1];
      return w ? { id: w.id, w: w.w, pos: w.pos, zh: w.zh, ex: w.ex, learned: !!r.learned } : null;
    }).filter(Boolean);
    return { day, draws: d.draws, draws_left: Math.max(0, WORD_LIMIT - d.draws), limit: WORD_LIMIT, points_today: d.points, words: items };
  }

  function wordOptions(word) {
    const pool = WORDS.filter((x) => x.id !== word.id && x.zh !== word.zh);
    const picks = [];
    while (picks.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(i, 1)[0].zh);
    }
    const opts = picks.concat(word.zh);
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return opts;
  }

  if (p === '/api/words/state' && method === 'GET') {
    return sendJSON(res, 200, wordState(me.id, businessDay()));
  }

  if (p === '/api/words/draw' && method === 'POST') {
    const day = businessDay();
    const st = wordState(me.id, day);
    if (st.draws_left <= 0) return sendJSON(res, 429, { error: `每天最多抽 ${WORD_LIMIT} 次` });
    const owned = new Set(db.prepare('SELECT word_id FROM user_words WHERE user_id=?').all(me.id).map((r) => r.word_id));
    let pool = WORDS.filter((w) => !owned.has(w.id));
    if (pool.length < WORD_DRAW_SIZE) pool = WORDS.filter((w) => !st.words.some((x) => x.id === w.id));
    const picked = [];
    while (picked.length < WORD_DRAW_SIZE && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    if (!picked.length) return sendJSON(res, 429, { error: '词库已抽完' });
    for (const w of picked) {
      db.prepare('INSERT OR IGNORE INTO user_words (user_id,word_id,day,learned) VALUES (?,?,?,0)').run(me.id, w.id, day);
    }
    db.prepare('INSERT INTO word_daily (user_id,day,draws,points) VALUES (?,?,1,?) ON CONFLICT(user_id,day) DO UPDATE SET draws=draws+1, points=points+?')
      .run(me.id, day, WORD_DRAW_POINTS, WORD_DRAW_POINTS);
    db.prepare('UPDATE users SET total_score = total_score + ? WHERE id=?').run(WORD_DRAW_POINTS, me.id);
    return sendJSON(res, 200, {
      words: picked.map((w) => ({ id: w.id, w: w.w, pos: w.pos, zh: w.zh, ex: w.ex, options: wordOptions(w), learned: false })),
      gained: WORD_DRAW_POINTS,
      state: wordState(me.id, day),
    });
  }

  if (p === '/api/words/learn' && method === 'POST') {
    const b = JSON.parse((await readBody(req)).toString() || '{}');
    const wid = Number(b.word_id);
    const day = businessDay();
    const row = db.prepare('SELECT learned FROM user_words WHERE user_id=? AND word_id=?').get(me.id, wid);
    if (!row) return sendJSON(res, 404, { error: '还没有抽到这个词' });
    if (row.learned) return sendJSON(res, 200, { ok: true, gained: 0, state: wordState(me.id, day) });
    db.prepare('UPDATE user_words SET learned=1, learned_at=? WHERE user_id=? AND word_id=?').run(nowCN(), me.id, wid);
    db.prepare('INSERT INTO word_daily (user_id,day,draws,points) VALUES (?,?,0,?) ON CONFLICT(user_id,day) DO UPDATE SET points=points+?')
      .run(me.id, day, WORD_LEARN_POINTS, WORD_LEARN_POINTS);
    db.prepare('UPDATE users SET total_score = total_score + ? WHERE id=?').run(WORD_LEARN_POINTS, me.id);
    return sendJSON(res, 200, { ok: true, gained: WORD_LEARN_POINTS, state: wordState(me.id, day) });
  }

  /* ================= 沉浸阅读 ================= */
  if ((p === '/api/read/today' || p === '/api/read/list') && method === 'GET') {
    const day = businessDay();
    const q = readQuota(me.id, day);
    if (!q.difficulty) {
      return sendJSON(res, 200, {
        need_difficulty: true,
        difficulty: null,
        day,
        batches: [],
        current_batch: 0,
        batch_count: batchCountFor(q.difficulty || '初级'),
        remaining_refresh: 0,
        library_size: readingLib.ARTICLES.length,
        progress: { day, daily_seconds: readDaily(me.id, day).seconds, daily_points: readDaily(me.id, day).points, daily_cap: READ.dailyCap, article_cap: READ.perArticleCap, refreshed: 0, refresh_limit: BATCH_COUNT() - 1 },
      });
    }
    const batch = Number(q.current_batch) || 1;
    ensureBatch(me.id, day, batch);
    db.prepare('UPDATE read_quota SET current_batch=? WHERE user_id=? AND day=?').run(batch, me.id, day);
    return sendJSON(res, 200, readListPayload(me.id, day));
  }

  if (p === '/api/read/difficulty' && method === 'POST') {
    const b = JSON.parse((await readBody(req)).toString() || '{}');
    const level = String(b.level || '');
    if (!['初级', '中级', '高级'].includes(level)) return sendJSON(res, 400, { error: '难度不合法' });
    const day = businessDay();
    readQuota(me.id, day);
    db.prepare('UPDATE read_quota SET difficulty=?, current_batch=1, refreshed=0 WHERE user_id=? AND day=?').run(level, me.id, day);
    db.prepare('DELETE FROM read_served WHERE user_id=? AND day=?').run(me.id, day);
    ensureBatch(me.id, day, 1);
    return sendJSON(res, 200, readListPayload(me.id, day));
  }

  if (p === '/api/read/refresh' && method === 'POST') {
    const day = businessDay();
    const q = readQuota(me.id, day);
    const cur = Number(q.current_batch) || 1;
    if (cur >= batchCountFor(q.difficulty || '初级')) return sendJSON(res, 429, { error: '该难度今天的文章已经全部领完' });
    const next = cur + 1;
    ensureBatch(me.id, day, next);
    db.prepare('UPDATE read_quota SET current_batch=?, refreshed=refreshed+1 WHERE user_id=? AND day=?').run(next, me.id, day);
    return sendJSON(res, 200, readListPayload(me.id, day));
  }

  if (p === '/api/read/report' && method === 'POST') {
    const b = JSON.parse((await readBody(req)).toString() || '{}');
    const aid = Number(b.article_id);
    const claim = Math.max(0, Math.min(60, Number(b.seconds) || 0));
    const day = businessDay();
    const served = db.prepare('SELECT 1 FROM read_served WHERE user_id=? AND day=? AND article_id=?').get(me.id, day, aid);
    if (!served) return sendJSON(res, 400, { error: '文章不存在或已过期' });

    const daily = readDaily(me.id, day);
    let allowed = claim;
    if (daily.last_at) {
      const elapsed = (Date.now() - new Date(daily.last_at).getTime()) / 1000;
      allowed = Math.min(claim, Math.max(0, elapsed + 3));   /* 真实时间差封顶，防刷 */
    }
    const add = Math.max(0, Math.round(allowed));
    const result = add > 0 ? settleReading(me.id, day, aid, add) : { gain: 0, seconds: daily.seconds, points: daily.points };
    db.prepare('UPDATE read_daily SET last_at=? WHERE user_id=? AND day=?').run(nowCN(), me.id, day);
    const article = servedArticle(me.id, day, Number(readQuota(me.id, day).current_seq) || 1, false);
    const dailyNow = readDaily(me.id, day);
    return sendJSON(res, 200, {
      ...result,
      article_points: article ? article.points : 0,
      progress: {
        day,
        daily_seconds: dailyNow.seconds,
        daily_points: dailyNow.points,
        daily_cap: READ.dailyCap,
        article_cap: READ.perArticleCap,
      },
    });
  }

  if (p === '/api/read/status' && method === 'GET') {
    const day = businessDay();
    const q = readQuota(me.id, day);
    const daily = readDaily(me.id, day);
    return sendJSON(res, 200, {
      progress: {
        day,
        daily_seconds: daily.seconds,
        daily_points: daily.points,
        daily_cap: READ.dailyCap,
        article_cap: READ.perArticleCap,
        refreshed: Math.max(0, (Number(q.current_batch) || 1) - 1),
        refresh_limit: batchCountFor(q.difficulty || '初级') - 1,
      },
    });
  }

  const mReadArticle = /^\/api\/read\/article\/(\d+)$/.exec(p);
  if (mReadArticle && method === 'GET') {
    const aid = Number(mReadArticle[1]);
    const days = dayList(businessDay(), 3);
    const served = db.prepare(`SELECT 1 FROM read_served WHERE user_id=? AND article_id=? AND day IN (${days.map(() => '?').join(',')})`)
      .all(me.id, aid, ...days);
    if (!served.length) return sendJSON(res, 404, { error: '该文章已超过 3 天，无法查阅' });
    const lib = readingLib.byId(aid);
    if (!lib) return sendJSON(res, 404, { error: '文章不存在' });
    const read = db.prepare('SELECT seconds,points FROM article_reads WHERE user_id=? AND article_id=?').get(me.id, aid) || { seconds: 0, points: 0 };
    return sendJSON(res, 200, {
      article: { ...lib, source: lib.source, license: lib.license, read_seconds: read.seconds, points: read.points },
      archived: !db.prepare('SELECT 1 FROM read_served WHERE user_id=? AND day=? AND article_id=?').get(me.id, businessDay(), aid),
    });
  }

  if (p === '/api/read/history' && method === 'GET') {
    return sendJSON(res, 200, { days: readHistory(me.id, 3) });
  }

  /* 站内通知 */
  if (p === '/api/notifications' && method === 'GET') {
    const rows = db.prepare('SELECT id,title,body,created_at,read_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50').all(me.id);
    return sendJSON(res, 200, {
      items: rows.map((x) => ({ id: x.id, title: x.title, body: x.body, at: x.created_at, read: !!x.read_at })),
      unread_count: rows.filter((x) => !x.read_at).length,
    });
  }
  if (p === '/api/notifications/read-all' && method === 'POST') {
    db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(nowCN(), me.id);
    return sendJSON(res, 200, { ok: true });
  }
  const mNotifRead = /^\/api\/notifications\/(\d+)\/read$/.exec(p);
  if (mNotifRead && method === 'POST') {
    db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').run(nowCN(), Number(mNotifRead[1]), me.id);
    return sendJSON(res, 200, { ok: true });
  }

  /* 用户申诉：对某条打卡记录申请复评 */
  const mAppeal = /^\/api\/records\/(\d+)\/appeal$/.exec(p);
  if (mAppeal && method === 'POST') {
    const rid = Number(mAppeal[1]);
    const b = JSON.parse((await readBody(req)).toString() || '{}');
    const reason = String(b.reason || '').trim();
    if (!reason) return sendJSON(res, 400, { error: '请填写申诉理由' });
    if (reason.length > 200) return sendJSON(res, 400, { error: '申诉理由不超过 200 字' });
    const rec = db.prepare('SELECT id,user_id,type,level,image_path FROM records WHERE id=?').get(rid);
    if (!rec || rec.type !== 'upload') return sendJSON(res, 404, { error: '记录不存在' });
    if (rec.user_id !== me.id && !isAdmin) return sendJSON(res, 403, { error: '无权申诉' });
    if (db.prepare("SELECT 1 FROM appeals WHERE record_id=? AND status='pending'").get(rid))
      return sendJSON(res, 409, { error: '该记录已有待处理申诉' });

    /* AI 复核前置：拿到一段解释文字（失败不影响申诉） */
    let explain = '';
    try {
      const buf = fs.readFileSync(path.join(UPLOAD_DIR, rec.image_path));
      const mime = rec.image_path.endsWith('.png') ? 'image/png' : 'image/jpeg';
      explain = await aiQueue.run(() => aiGrader.reviewAppeal(buf, mime, rec.level || 'B', reason));
    } catch (e) {
      console.error('[appeal] AI 复核失败:', e.message);
      explain = '（AI 复核暂不可用，已直接转人工处理）';
    }

    db.prepare('INSERT INTO appeals (record_id,user_id,reason,status,created_at,ai_explain,orig_level) VALUES (?,?,?,?,?,?,?)')
      .run(rid, me.id, reason, 'pending', nowCN(), explain, rec.level || null);
    return sendJSON(res, 200, { ok: true, ai_explain: explain });
  }

  /* 我的申诉记录 */
  if (p === '/api/appeals' && method === 'GET') {
    const rows = db.prepare(`
      SELECT a.id,a.reason,a.status,a.result_level,a.ai_explain,a.admin_reply,a.created_at,a.handled_at,
             a.orig_level, r.level AS cur_level, r.points AS orig_points, r.image_path
      FROM appeals a JOIN records r ON r.id=a.record_id
      WHERE a.user_id=? ORDER BY a.id DESC LIMIT 50`).all(me.id);
    return sendJSON(res, 200, {
      items: rows.map((x) => ({
        id: x.id, reason: x.reason, status: x.status, result_level: x.result_level,
        ai_explain: x.ai_explain, admin_reply: x.admin_reply,
        created_at: x.created_at, handled_at: x.handled_at,
        orig_level: x.orig_level, orig_points: x.orig_points,
        image: x.image_path ? `/uploads/${x.image_path}` : null,
      })),
    });
  }

  /* 点赞 */
  const mLike = /^\/api\/like\/(\d+)$/.exec(p);
  if (mLike && method === 'POST') {
    const target = Number(mLike[1]);
    if (target === me.id) return sendJSON(res, 400, { error: '不能给自己点赞' });
    const u = db.prepare("SELECT id FROM users WHERE id=?").get(target);
    if (!u) return sendJSON(res, 404, { error: '用户不存在' });
    try {
      db.prepare('INSERT INTO likes (from_id,to_id,day,created_at) VALUES (?,?,?,?)')
        .run(me.id, target, todayStr(), nowCN());
    } catch (e) {
      if (/UNIQUE/i.test(e.message)) return sendJSON(res, 409, { error: '今天已经赞过 TA 了' });
      throw e;
    }
    return sendJSON(res, 200, { ok: true, likes: likeCount(target) });
  }

  if (p === '/api/friends' && method === 'GET') {
    const rows = db.prepare(`
      SELECT u.id, u.student_id, u.name, u.class_name, u.avatar
      FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? ORDER BY u.name`).all(me.id);
    return sendJSON(res, 200, { items: rows });
  }
  if (p === '/api/friends' && method === 'POST') {
    const b = JSON.parse((await readBody(req)).toString() || '{}');
    const fid = Number(b.friend_id);
    if (!fid || fid === me.id) return sendJSON(res, 400, { error: '参数错误' });
    const u = db.prepare("SELECT id FROM users WHERE id=? AND role='student' AND COALESCE(is_hidden,0)=0").get(fid);
    if (!u) return sendJSON(res, 404, { error: '用户不存在' });
    const ts = nowCN();
    db.prepare('INSERT OR IGNORE INTO friends (user_id,friend_id,created_at) VALUES (?,?,?)').run(me.id, fid, ts);
    db.prepare('INSERT OR IGNORE INTO friends (user_id,friend_id,created_at) VALUES (?,?,?)').run(fid, me.id, ts);
    return sendJSON(res, 200, { ok: true });
  }
  /* 好友申请 */
  if (p === '/api/friend-requests' && method === 'GET') {
    const incoming = db.prepare(`
      SELECT r.id, r.message, r.created_at, u.id AS from_id, u.name, u.class_name, u.avatar
      FROM friend_requests r JOIN users u ON u.id=r.from_id
      WHERE r.to_id=? AND r.status='pending' ORDER BY r.id DESC`).all(me.id);
    const outgoing = db.prepare(`
      SELECT r.id, r.status, r.created_at, u.id AS to_id, u.name
      FROM friend_requests r JOIN users u ON u.id=r.to_id
      WHERE r.from_id=? ORDER BY r.id DESC LIMIT 20`).all(me.id);
    return sendJSON(res, 200, { incoming, outgoing, pending_count: incoming.length });
  }

  if (p === '/api/friend-requests' && method === 'POST') {
    const b = JSON.parse((await readBody(req)).toString() || '{}');
    const to = Number(b.to);
    const message = String(b.message || '').trim();
    if (!to || to === me.id) return sendJSON(res, 400, { error: '参数错误' });
    if (!message) return sendJSON(res, 400, { error: '请填写自我介绍' });
    if (message.length > 100) return sendJSON(res, 400, { error: '自我介绍太长（≤100 字）' });
    if (!db.prepare("SELECT 1 FROM users WHERE id=? AND role='student'").get(to)) return sendJSON(res, 404, { error: '用户不存在' });
    if (isFriend(me.id, to)) return sendJSON(res, 409, { error: '你们已经是好友了' });
    /* 对方也申请过我 → 直接成为好友 */
    const reverse = db.prepare("SELECT id FROM friend_requests WHERE from_id=? AND to_id=? AND status='pending'").get(to, me.id);
    if (reverse) {
      const ts = nowCN();
      db.prepare("UPDATE friend_requests SET status='accepted', handled_at=? WHERE id=?").run(ts, reverse.id);
      db.prepare('INSERT OR IGNORE INTO friends (user_id,friend_id,created_at) VALUES (?,?,?)').run(me.id, to, ts);
      db.prepare('INSERT OR IGNORE INTO friends (user_id,friend_id,created_at) VALUES (?,?,?)').run(to, me.id, ts);
      return sendJSON(res, 200, { ok: true, auto_accepted: true });
    }
    try {
      db.prepare('INSERT INTO friend_requests (from_id,to_id,message,status,created_at) VALUES (?,?,?,?,?)')
        .run(me.id, to, message, 'pending', nowCN());
    } catch (e) {
      if (/UNIQUE/i.test(e.message)) return sendJSON(res, 409, { error: '已经发送过申请，等待对方处理' });
      throw e;
    }
    return sendJSON(res, 200, { ok: true });
  }

  const mReqAct = /^\/api\/friend-requests\/(\d+)\/(accept|reject)$/.exec(p);
  if (mReqAct && method === 'POST') {
    const rid = Number(mReqAct[1]);
    const action = mReqAct[2];
    const req = db.prepare('SELECT * FROM friend_requests WHERE id=?').get(rid);
    if (!req) return sendJSON(res, 404, { error: '申请不存在' });
    if (req.to_id !== me.id) return sendJSON(res, 403, { error: '无权处理该申请' });
    if (req.status !== 'pending') return sendJSON(res, 400, { error: '该申请已处理' });
    const ts = nowCN();
    if (action === 'accept') {
      db.prepare("UPDATE friend_requests SET status='accepted', handled_at=? WHERE id=?").run(ts, rid);
      db.prepare('INSERT OR IGNORE INTO friends (user_id,friend_id,created_at) VALUES (?,?,?)').run(me.id, req.from_id, ts);
      db.prepare('INSERT OR IGNORE INTO friends (user_id,friend_id,created_at) VALUES (?,?,?)').run(req.from_id, me.id, ts);
      return sendJSON(res, 200, { ok: true, accepted: true });
    }
    db.prepare("UPDATE friend_requests SET status='rejected', handled_at=? WHERE id=?").run(ts, rid);
    return sendJSON(res, 200, { ok: true, rejected: true });
  }

  const mDel = /^\/api\/friends\/(\d+)$/.exec(p);
  if (mDel && method === 'DELETE') {
    const fid = Number(mDel[1]);
    db.prepare('DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)').run(me.id, fid, fid, me.id);
    return sendJSON(res, 200, { ok: true });
  }

  /* 会话列表 */
  if (p === '/api/chats' && method === 'GET') {
    const rows = db.prepare(`
      SELECT u.id, u.name, u.class_name, u.avatar,
             (SELECT body FROM messages m WHERE (m.from_id=u.id AND m.to_id=?) OR (m.from_id=? AND m.to_id=u.id) ORDER BY m.id DESC LIMIT 1) AS last_body,
             (SELECT created_at FROM messages m WHERE (m.from_id=u.id AND m.to_id=?) OR (m.from_id=? AND m.to_id=u.id) ORDER BY m.id DESC LIMIT 1) AS last_at,
             (SELECT COUNT(*) FROM messages m WHERE m.from_id=u.id AND m.to_id=? AND m.read_at IS NULL) AS unread
      FROM friends f JOIN users u ON u.id=f.friend_id
      WHERE f.user_id=? ORDER BY COALESCE(last_at,'') DESC`).all(me.id, me.id, me.id, me.id, me.id, me.id);
    return sendJSON(res, 200, { items: rows });
  }

  /* 消息 */
  if (p === '/api/messages' && method === 'GET') {
    const peer = Number(url.searchParams.get('peer'));
    const after = Number(url.searchParams.get('after') || 0);
    if (!peer) return sendJSON(res, 400, { error: '缺少 peer' });
    if (!isFriend(me.id, peer)) return sendJSON(res, 403, { error: '仅好友之间可以聊天' });
    const rows = db.prepare(`
      SELECT id, from_id, to_id, body, created_at FROM messages
      WHERE id>? AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))
      ORDER BY id ASC LIMIT 200`).all(after, me.id, peer, peer, me.id);
    db.prepare("UPDATE messages SET read_at=? WHERE from_id=? AND to_id=? AND read_at IS NULL").run(nowCN(), peer, me.id);
    return sendJSON(res, 200, { items: rows });
  }
  if (p === '/api/messages' && method === 'POST') {
    const b = JSON.parse((await readBody(req)).toString() || '{}');
    const to = Number(b.to);
    const body = String(b.body || '').trim();
    if (!to || !body) return sendJSON(res, 400, { error: '消息不能为空' });
    if (body.length > 1000) return sendJSON(res, 400, { error: '消息过长' });
    if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(to)) return sendJSON(res, 404, { error: '收件人不存在' });
    if (!isFriend(me.id, to)) return sendJSON(res, 403, { error: '仅好友之间可以聊天' });
    const info = db.prepare('INSERT INTO messages (from_id,to_id,body,created_at) VALUES (?,?,?,?)')
      .run(me.id, to, body, nowCN());
    return sendJSON(res, 200, { ok: true, id: Number(info.lastInsertRowid) });
  }

  /* ---------------- 管理员 ---------------- */
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin) return sendJSON(res, 403, { error: '需要管理员权限' });

    if (p === '/api/admin/overview' && method === 'GET') {
      const users = db.prepare(`
        SELECT u.id,u.student_id,u.name,u.class_name,u.total_score,u.is_public,u.is_hidden,u.avatar,u.created_at,
               (SELECT COUNT(*) FROM records r WHERE r.user_id=u.id) AS records,
               (SELECT COUNT(*) FROM records r WHERE r.user_id=u.id AND r.type='upload' AND r.created_at>=?) AS season_uploads
        FROM users u WHERE u.role='student' ORDER BY u.total_score DESC`).all(seasonCutoff());
      const totals = db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get();
      const recs = db.prepare('SELECT COUNT(*) c FROM records').get();
      return sendJSON(res, 200, {
        quarter: quarterInfo(), season_cutoff: seasonCutoff(),
        site_title: siteTitle(),
        stats: { users: totals.c, records: recs.c },
        users: users.map((u) => ({ ...u, quarter_score: quarterScore(u.id) })),
      });
    }

    const mAU = /^\/api\/admin\/users\/(\d+)$/.exec(p);
    if (mAU && method === 'GET') {
      const id = Number(mAU[1]);
      const u = db.prepare(`SELECT ${PUBLIC_COLS} FROM users WHERE id=?`).get(id);
      if (!u) return sendJSON(res, 404, { error: '用户不存在' });
      const photos = db.prepare("SELECT id,image_path,created_at,deleted_at FROM records WHERE user_id=? AND type='upload' ORDER BY created_at DESC").all(id);
      const recs = db.prepare('SELECT type,created_at FROM records WHERE user_id=? ORDER BY created_at DESC LIMIT 300').all(id);
      return sendJSON(res, 200, {
        user: u, quarter_score: quarterScore(id), records: recs,
        photos: photos.map((x) => ({ id: x.id, url: `/uploads/${x.image_path}`, at: x.created_at, deleted: !!x.deleted_at })),
      });
    }

    /* 管理员软删除违规照片：只标记，不删文件 */
    const mDelPhoto = /^\/api\/admin\/records\/(\d+)\/delete$/.exec(p);
    if (mDelPhoto && method === 'POST') {
      const rid = Number(mDelPhoto[1]);
      const rec = db.prepare("SELECT id,user_id,type,deleted_at,points FROM records WHERE id=?").get(rid);
      if (!rec || rec.type !== 'upload') return sendJSON(res, 404, { error: '记录不存在' });
      if (rec.deleted_at) return sendJSON(res, 200, { ok: true, already: true });
      db.prepare('UPDATE records SET deleted_at=? WHERE id=?').run(nowCN(), rid);
      db.prepare('UPDATE users SET total_score = MAX(total_score - ?, 0) WHERE id=?').run(rec.points || 0, rec.user_id);
      return sendJSON(res, 200, { ok: true, soft_deleted: true });
    }

    if (p === '/api/admin/site' && method === 'PUT') {
      const b = JSON.parse((await readBody(req)).toString() || '{}');
      const title = String(b.title || '').trim();
      if (!title) return sendJSON(res, 400, { error: '标题不能为空' });
      if (title.length > 40) return sendJSON(res, 400, { error: '标题不超过 40 字' });
      setSetting('site_title', title);
      return sendJSON(res, 200, { ok: true, title });
    }
    if (p === '/api/admin/site' && method === 'GET') {
      return sendJSON(res, 200, { title: siteTitle(), default: DEFAULT_SITE_TITLE });
    }

    if (p === '/api/admin/appeals/count' && method === 'GET') {
      const c = db.prepare("SELECT COUNT(*) c FROM appeals WHERE status='pending'").get().c;
      return sendJSON(res, 200, { pending: c });
    }

    if (p === '/api/admin/appeals' && method === 'GET') {
      const rows = db.prepare(`
        SELECT a.id, a.reason, a.status, a.created_at, a.record_id, a.ai_explain, a.admin_reply,
               r.level, r.points, r.image_path,
               u.id AS user_id, u.name, u.student_id, u.class_name
        FROM appeals a
        JOIN records r ON r.id = a.record_id
        JOIN users u ON u.id = a.user_id
        WHERE a.status='pending'
        ORDER BY a.id DESC`).all();
      return sendJSON(res, 200, {
        items: rows.map((x) => ({ ...x, image: `/uploads/${x.image_path}` })),
        pending_count: rows.length,
      });
    }

    const mAppealResolve = /^\/api\/admin\/appeals\/(\d+)$/.exec(p);
    if (mAppealResolve && method === 'PUT') {
      const aid = Number(mAppealResolve[1]);
      const b = JSON.parse((await readBody(req)).toString() || '{}');
      const level = String(b.level || '').toUpperCase();
      const reply = String(b.reply || '').trim();
      if (!['A', 'B', 'C', 'INVALID'].includes(level)) return sendJSON(res, 400, { error: '等级必须是 A/B/C/INVALID' });
      if (!reply) return sendJSON(res, 400, { error: '请填写管理员回复/改判原因' });
      if (reply.length > 300) return sendJSON(res, 400, { error: '回复不超过 300 字' });
      const appeal = db.prepare('SELECT * FROM appeals WHERE id=?').get(aid);
      if (!appeal || appeal.status !== 'pending') return sendJSON(res, 404, { error: '申诉不存在或已处理' });
      const rec = db.prepare('SELECT * FROM records WHERE id=?').get(appeal.record_id);
      if (!rec) return sendJSON(res, 404, { error: '记录不存在' });

      /* 判无效：直接删除记录 + 物理删除照片 + 扣回积分 */
      if (level === 'INVALID') {
        const delta = -(rec.points || 0);
        db.prepare('DELETE FROM records WHERE id=?').run(rec.id);
        if (rec.image_path) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, rec.image_path)); } catch {}
        }
        if (delta !== 0) {
          db.prepare('UPDATE users SET total_score = MAX(total_score + ?, 0) WHERE id=?').run(delta, rec.user_id);
        }
        db.prepare("UPDATE appeals SET status='resolved', result_level='INVALID', admin_reply=?, handled_at=? WHERE id=?").run(reply, nowCN(), aid);
        return sendJSON(res, 200, { ok: true, level: 'INVALID', points: 0, delta, deleted: true, reply });
      }

      const newPts = aiGrader.POINTS[level] || 0;
      const delta = newPts - (rec.points || 0);
      db.prepare('UPDATE records SET level=?, points=?, comment=? WHERE id=?')
        .run(level, newPts, `管理员复评：${level} 级`, rec.id);
      if (delta !== 0) {
        db.prepare('UPDATE users SET total_score = MAX(total_score + ?, 0) WHERE id=?').run(delta, rec.user_id);
      }
      db.prepare("UPDATE appeals SET status='resolved', result_level=?, admin_reply=?, handled_at=? WHERE id=?").run(level, reply, nowCN(), aid);
      return sendJSON(res, 200, { ok: true, level, points: newPts, delta, reply });
    }

    if (p === '/api/admin/notifications' && method === 'POST') {
      const b = JSON.parse((await readBody(req)).toString() || '{}');
      const title = String(b.title || '').trim();
      const body = String(b.body || '').trim();
      const ids = Array.isArray(b.user_ids) ? b.user_ids.map(Number).filter(Boolean) : [];
      if (!title || !body) return sendJSON(res, 400, { error: '标题和内容不能为空' });
      const targets = ids.length ? ids : db.prepare("SELECT id FROM users WHERE role='student'").all().map((x) => x.id);
      const ins = db.prepare('INSERT INTO notifications (user_id,title,body,created_at) VALUES (?,?,?,?)');
      const ts = nowCN();
      db.exec('BEGIN');
      for (const uid of targets) ins.run(uid, title, body, ts);
      db.exec('COMMIT');
      return sendJSON(res, 200, { ok: true, count: targets.length });
    }

    if (p === '/api/admin/reset-quarter' && method === 'POST') {
      db.prepare("INSERT INTO settings (key,value) VALUES ('quarter_reset_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .run(nowCN());
      return sendJSON(res, 200, { ok: true, reset_at: adminResetAt() });
    }

    if (p === '/api/admin/export.csv' && method === 'GET') {
      const rows = db.prepare(`SELECT id,student_id,name,class_name,total_score,is_public,created_at FROM users WHERE role='student' ORDER BY total_score DESC`).all();
      const head = '学号,姓名,班级,总积分,本季积分,记录公开,注册时间\n';
      const body = rows.map((r) => [
        r.student_id, r.name, r.class_name, r.total_score, quarterScore(r.id),
        r.is_public ? '是' : '否', r.created_at,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const csv = '\uFEFF' + head + body;
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="checkin-${todayStr()}.csv"`,
        'Content-Length': Buffer.byteLength(csv),
        'Cache-Control': 'no-store',
      });
      return res.end(csv);
    }

    return sendJSON(res, 404, { error: 'not found' });
  }

  return sendJSON(res, 404, { error: 'not found' });
}

/* ---------------- 静态与图片访问控制 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
function serveFile(res, filePath, cache) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': cache || 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}
function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base + path.sep) || p === base ? p : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    if (url.pathname.startsWith('/uploads/')) {
      const me = currentUser(req);
      if (!me) { res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('请先登录'); return; }
      const isAdmin = me.role === 'super_admin';
      if (url.pathname.startsWith('/uploads/avatars/')) {
        return serveFile(res, safeJoin(AVATAR_DIR, url.pathname.slice('/uploads/avatars/'.length)), 'private, max-age=86400');
      }
      const fname = url.pathname.slice('/uploads/'.length);
      const rec = db.prepare("SELECT r.user_id, r.deleted_at, u.is_public FROM records r JOIN users u ON u.id=r.user_id WHERE r.image_path=?").get(fname);
      if (!rec) { res.writeHead(404); res.end('Not Found'); return; }
      if (rec.deleted_at && !isAdmin) { res.writeHead(404); res.end('Not Found'); return; }
      if (!(isAdmin || rec.user_id === me.id || rec.is_public === 1)) { res.writeHead(403); res.end('无权查看'); return; }
      return serveFile(res, safeJoin(UPLOAD_DIR, fname), 'private, max-age=86400');
    }

    let rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    if (rel.endsWith('/')) rel += 'index.html';
    const f = safeJoin(PUBLIC_DIR, rel);
    if (!f) { res.writeHead(400); res.end('bad path'); return; }
    return serveFile(res, f, 'no-cache');
  } catch (e) {
    console.error('[error]', e && e.stack || e);
    sendJSON(res, 500, { error: '服务器错误' });
  }
});

server.listen(PORT, HOST, () => console.log(`english-checkin v2 on http://${HOST}:${PORT}`));
process.on('SIGTERM', () => server.close(() => { db.close(); process.exit(0); }));
