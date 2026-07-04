// 계정 시스템 — 파일 저장, 비번 해싱, 랭크/레벨/전적
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'data', 'accounts.json');
let db = { users: {}, nickTaken: {} };
let tokenIndex = {};

// DATABASE_URL 있으면 Postgres, 없으면 파일 저장 (로컬)
let pool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    console.log('계정 저장: Postgres');
  } catch (e) { console.error('pg 모듈 없음, 파일 저장으로 대체:', e.message); pool = null; }
} else {
  console.log('계정 저장: 파일 (로컬)');
}

function rebuildIndex() {
  tokenIndex = {}; db.nickTaken = {};
  for (const [idl, u] of Object.entries(db.users)) {
    if (u.token) tokenIndex[u.token] = idl;
    if (u.nick) db.nickTaken[u.nick.toLowerCase()] = idl;
  }
}
function loadFileSync() {
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { db = { users: {}, nickTaken: {} }; }
  db.users ||= {}; rebuildIndex();
}
async function loadFromDB() {
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS ff_users (idl TEXT PRIMARY KEY, data JSONB)');
    const { rows } = await pool.query('SELECT idl, data FROM ff_users');
    db = { users: {}, nickTaken: {} };
    for (const r of rows) db.users[r.idl] = r.data;
    rebuildIndex();
    console.log('계정 ' + rows.length + '개 DB에서 로드됨');
  } catch (e) { console.error('DB 로드 실패, 파일로 대체:', e.message); pool = null; loadFileSync(); }
}
let saveTimer = null;
function saveFile() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); }
    catch (e) { console.error('accounts save fail:', e.message); }
  }, 300);
}
// 특정 유저를 저장소에 반영
function persist(idl) {
  if (pool) {
    const u = db.users[idl]; if (!u) return;
    pool.query('INSERT INTO ff_users(idl, data) VALUES($1, $2) ON CONFLICT(idl) DO UPDATE SET data = excluded.data', [idl, u])
      .catch(e => console.error('DB 저장 실패:', e.message));
  } else saveFile();
}

loadFileSync();          // 로컬은 즉시
if (pool) loadFromDB();  // DB 있으면 덮어씀 (비동기)

// ── 비번 해싱 ──
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 32).toString('hex'); }
function makeToken() { return crypto.randomBytes(24).toString('hex'); }

// ── 레벨 / 랭크 ──
function levelOf(xp) { return 1 + Math.floor(xp / 100); }
function xpInLevel(xp) { return xp % 100; }              // 0~99 (다음 레벨까지 100)
const RANKS = [
  { rp: 0,    name: '브론즈',   icon: '🥉', color: '#b08d57' },
  { rp: 120,  name: '실버',     icon: '🥈', color: '#b8c0cc' },
  { rp: 300,  name: '골드',     icon: '🥇', color: '#e0b84a' },
  { rp: 600,  name: '플래티넘', icon: '💠', color: '#4ec3c0' },
  { rp: 1000, name: '다이아',   icon: '💎', color: '#7ab8ff' },
  { rp: 1600, name: '마스터',   icon: '👑', color: '#c88bff' },
];
function rankOf(rp) { let r = RANKS[0]; for (const t of RANKS) if (rp >= t.rp) r = t; return r; }

function profileOf(u) {
  if (!u) return null;
  const rank = rankOf(u.rp);
  const total = u.wins + u.losses;
  return {
    id: u.id, nick: u.nick, guest: false,
    level: levelOf(u.xp), xp: u.xp, xpInLevel: xpInLevel(u.xp),
    rp: u.rp, rank: rank.name, rankIcon: rank.icon, rankColor: rank.color,
    wins: u.wins, losses: u.losses,
    winRate: total ? Math.round(u.wins / total * 100) : 0,
  };
}

// ── API ──
function validId(id)   { return /^[A-Za-z0-9_]{3,16}$/.test(id || ''); }
function validNick(n)  { const s = String(n || '').trim(); return s.length >= 1 && s.length <= 12; }

function signup(id, pw, nick) {
  id = String(id || '').trim(); nick = String(nick || '').trim();
  if (!validId(id)) return { error: '아이디는 영문/숫자 3~16자예요.' };
  if (String(pw || '').length < 4) return { error: '비밀번호는 4자 이상이어야 해요.' };
  if (!validNick(nick)) return { error: '닉네임은 1~12자예요.' };
  const idl = id.toLowerCase(), nickl = nick.toLowerCase();
  if (db.users[idl]) return { error: '이미 있는 아이디예요.' };
  if (db.nickTaken[nickl]) return { error: '이미 사용 중인 닉네임이에요.' };
  const salt = crypto.randomBytes(12).toString('hex');
  const token = makeToken();
  const u = { id, nick, salt, hash: hashPw(pw, salt), token, wins: 0, losses: 0, xp: 0, rp: 0, createdAt: Date.now() };
  db.users[idl] = u; db.nickTaken[nickl] = idl; tokenIndex[token] = idl; persist(idl);
  return { ok: true, token, profile: profileOf(u) };
}
function login(id, pw) {
  const idl = String(id || '').trim().toLowerCase();
  const u = db.users[idl];
  if (!u || u.hash !== hashPw(pw, u.salt)) return { error: '아이디 또는 비밀번호가 틀렸어요.' };
  if (!u.token) { u.token = makeToken(); tokenIndex[u.token] = idl; persist(idl); }
  return { ok: true, token: u.token, profile: profileOf(u) };
}
function byToken(token) { const idl = tokenIndex[token]; return idl ? db.users[idl] : null; }
function meByToken(token) { const u = byToken(token); return u ? { ok: true, profile: profileOf(u) } : { error: '세션 만료' }; }

// 결과 반영 (result: 'win'|'loss'|'draw')
function recordResult(token, result) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return null;
  if (result === 'win')  { u.wins++;   u.xp += 20; u.rp += 25; }
  else if (result === 'loss') { u.losses++; u.xp += 8;  u.rp = Math.max(0, u.rp - 12); }
  else { u.xp += 10; }   // 무승부
  persist(idl);
  return profileOf(u);
}

module.exports = { signup, login, byToken, meByToken, recordResult, profileOf };
