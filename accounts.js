// 계정 시스템 — 파일 저장, 비번 해싱, 랭크/레벨/전적
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 저장 위치. 시험은 진짜 계정 파일을 건드리면 안 되므로 환경변수로 갈아끼울 수 있게 둔다.
// (운영에서는 Postgres 를 쓰므로 이 파일은 로컬 전용이다.)
const FILE = process.env.FF_DATA_FILE || path.join(__dirname, 'data', 'accounts.json');
let db = { users: {}, nickTaken: {}, clans: {}, coupons: {} };
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
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { db = { users: {}, nickTaken: {}, clans: {}, coupons: {} }; }
  db.coupons = db.coupons || {};
  db.users ||= {}; db.clans ||= {}; rebuildIndex();
}
// DB가 잠깐 죽어도 영구히 포기하면 안 된다.
// (무료 Postgres 정지 기간에 재시작되면서 pool 을 버리는 바람에, DB를 되살린 뒤에도
//  앱이 임시 파일만 보며 계정이 사라진 것처럼 보였다. 같은 일이 반복되지 않게 재시도한다.)
let dbReady = false;
let dbRetryTimer = null;
let dbLastError = null;

function scheduleDbRetry(delay = 20000) {
  if (dbRetryTimer || !pool) return;
  dbRetryTimer = setTimeout(() => { dbRetryTimer = null; loadFromDB(); }, delay);
}

// DB가 죽어 있는 동안 파일에만 생긴 계정을 살아난 DB로 옮긴다 (DB에 있는 건 절대 덮지 않음)
async function rescueFileOnlyUsers() {
  let fileDb = null;
  try { fileDb = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return; }
  const fUsers = (fileDb && fileDb.users) || {};
  const fClans = (fileDb && fileDb.clans) || {};
  let n = 0, c = 0;
  for (const [idl, u] of Object.entries(fUsers)) {
    if (Object.prototype.hasOwnProperty.call(db.users, idl)) continue;   // DB 우선
    try {
      await pool.query('INSERT INTO ff_users(idl, data) VALUES($1, $2) ON CONFLICT(idl) DO NOTHING', [idl, u]);
      db.users[idl] = u; n++;
    } catch (_) {}
  }
  for (const [cid, cl] of Object.entries(fClans)) {
    if (Object.prototype.hasOwnProperty.call(db.clans, cid)) continue;
    try {
      await pool.query('INSERT INTO ff_clans(cid, data) VALUES($1, $2) ON CONFLICT(cid) DO NOTHING', [cid, cl]);
      db.clans[cid] = cl; c++;
    } catch (_) {}
  }
  if (n || c) { rebuildIndex(); console.log(`DB 정지 중 파일에만 있던 계정 ${n}개, 클랜 ${c}개를 DB로 구제`); }
}

async function loadFromDB() {
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS ff_users (idl TEXT PRIMARY KEY, data JSONB)');
    await pool.query('CREATE TABLE IF NOT EXISTS ff_clans (cid TEXT PRIMARY KEY, data JSONB)');
    await pool.query('CREATE TABLE IF NOT EXISTS ff_meta (k TEXT PRIMARY KEY, data JSONB)');
    await pool.query('CREATE TABLE IF NOT EXISTS ff_coupons (code TEXT PRIMARY KEY, data JSONB)');
    const { rows } = await pool.query('SELECT idl, data FROM ff_users');
    const clanRows = (await pool.query('SELECT cid, data FROM ff_clans')).rows;
    const cpnRows = (await pool.query('SELECT code, data FROM ff_coupons')).rows;
    const prevReady = dbReady;
    db = { users: {}, nickTaken: {}, clans: {}, coupons: {} };
    for (const r of rows) db.users[r.idl] = r.data;
    for (const r of clanRows) db.clans[r.cid] = r.data;
    // 쿠폰 사용 기록이 날아가면 같은 쿠폰을 무한히 다시 받을 수 있다 — 반드시 DB에서 읽는다
    for (const r of cpnRows) db.coupons[r.code] = r.data;
    try {
      const meta = await pool.query("SELECT data FROM ff_meta WHERE k = 'reports'");
      db.reports = (meta.rows[0] && meta.rows[0].data) || [];
    } catch (_) { db.reports = []; }
    try {
      const sm = await pool.query("SELECT data FROM ff_meta WHERE k = 'season'");
      db.season = (sm.rows[0] && sm.rows[0].data) || null;
    } catch (_) { db.season = null; }
    rebuildIndex();
    dbReady = true; dbLastError = null;
    console.log('계정 ' + rows.length + '개, 클랜 ' + clanRows.length + '개, 쿠폰 ' + cpnRows.length + '개 DB에서 로드됨');
    if (!prevReady) await rescueFileOnlyUsers();   // 정지 기간에 생긴 계정 회수
  } catch (e) {
    dbReady = false; dbLastError = e.message;
    console.error('DB 연결 실패 — 임시로 파일을 쓰고 20초 뒤 재시도:', e.message);
    loadFileSync();
    scheduleDbRetry();
  }
}
// 운영 점검용 — 지금 어디에 저장 중인지 (자격증명은 노출하지 않음)
function storeInfo() {
  return { mode: pool ? (dbReady ? 'postgres' : 'file(임시 — DB 재연결 대기)') : 'file',
           dbConfigured: !!pool, dbReady, lastError: dbLastError,
           users: Object.keys(db.users || {}).length, clans: Object.keys(db.clans || {}).length };
}
let saveTimer = null;
function saveFile() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); }
    catch (e) { console.error('accounts save fail:', e.message); }
  }, 300);
}
// ff_meta 에 통째로 보관하는 것들 (시즌 표시·백업 스냅샷 등)
function persistMeta(key, data) {
  if (pool && dbReady) {
    pool.query('INSERT INTO ff_meta(k, data) VALUES($1, $2) ON CONFLICT(k) DO UPDATE SET data = excluded.data',
      [key, JSON.stringify(data)]).catch(e => console.error('메타 저장 실패(' + key + '):', e.message));
  } else saveFile();
}
async function readMeta(key) {
  if (!(pool && dbReady)) return db['meta_' + key] || null;
  try {
    const r = await pool.query('SELECT data FROM ff_meta WHERE k = $1', [key]);
    return (r.rows[0] && r.rows[0].data) || null;
  } catch (_) { return null; }
}

// ── 백업 ──────────────────────────────────────────────────────────────────
// 코인·전적·클랜은 한 번 날아가면 되돌릴 방법이 없다. 하루 한 번 통째로 떠서
// ff_meta 에 넣어 두고(같은 DB라 DB 자체가 죽으면 소용없다), 관리자가 받아
// 바깥에 보관할 수 있게 통로를 연다.
function snapshot() {
  return {
    at: new Date().toISOString(),
    users: db.users || {}, clans: db.clans || {}, coupons: db.coupons || {},
    season: db.season || null,
    counts: { users: Object.keys(db.users || {}).length, clans: Object.keys(db.clans || {}).length },
  };
}
const SNAP_KEEP = 7;                     // 최근 7일치만 둔다
function snapKey(d = new Date()) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return 'snap:' + kst.toISOString().slice(0, 10);
}
async function saveSnapshot() {
  const key = snapKey();
  const snap = snapshot();
  if (pool && dbReady) {
    try {
      await pool.query('INSERT INTO ff_meta(k, data) VALUES($1, $2) ON CONFLICT(k) DO UPDATE SET data = excluded.data',
        [key, JSON.stringify(snap)]);
      // 오래된 것 정리 — 무한히 쌓이면 DB만 무거워진다
      const { rows } = await pool.query("SELECT k FROM ff_meta WHERE k LIKE 'snap:%' ORDER BY k DESC");
      for (const r of rows.slice(SNAP_KEEP)) await pool.query('DELETE FROM ff_meta WHERE k = $1', [r.k]);
      console.log(`[백업] ${key} 저장 (계정 ${snap.counts.users}개, 클랜 ${snap.counts.clans}개)`);
      return { ok: true, key, counts: snap.counts };
    } catch (e) { return { error: e.message }; }
  }
  // 파일 모드 — data/backup 아래에 날짜별로 떨군다
  try {
    const dir = path.join(path.dirname(FILE), 'backup');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, key.replace('snap:', '') + '.json'), JSON.stringify(snap));
    const olds = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse().slice(SNAP_KEEP);
    for (const f of olds) fs.unlinkSync(path.join(dir, f));
    return { ok: true, key, counts: snap.counts, file: true };
  } catch (e) { return { error: e.message }; }
}
async function snapshotList() {
  if (pool && dbReady) {
    try {
      const { rows } = await pool.query("SELECT k, data->>'at' AS at, data->'counts' AS counts FROM ff_meta WHERE k LIKE 'snap:%' ORDER BY k DESC");
      return { ok: true, list: rows };
    } catch (e) { return { error: e.message }; }
  }
  try {
    const dir = path.join(path.dirname(FILE), 'backup');
    if (!fs.existsSync(dir)) return { ok: true, list: [] };
    return { ok: true, list: fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse().map(f => ({ k: 'snap:' + f.replace('.json', '') })) };
  } catch (e) { return { error: e.message }; }
}

// 신고 기록 저장 — 유저 단위가 아니라 통째로 보관한다
function persistReports() {
  if (pool && dbReady) {
    pool.query("INSERT INTO ff_meta(k, data) VALUES('reports', $1) ON CONFLICT(k) DO UPDATE SET data = excluded.data",
      [JSON.stringify(db.reports || [])]).catch(e => console.error('신고 저장 실패:', e.message));
  } else saveFile();
}
// 특정 유저를 저장소에 반영
function persist(idl) {
  if (pool && dbReady) {
    const u = db.users[idl]; if (!u) return;
    pool.query('INSERT INTO ff_users(idl, data) VALUES($1, $2) ON CONFLICT(idl) DO UPDATE SET data = excluded.data', [idl, u])
      .catch(e => console.error('DB 저장 실패:', e.message));
  } else saveFile();
}
// 특정 유저를 저장소에서 영구 삭제 (계정 삭제 — 구글플레이 필수 정책)
function purge(idl) {
  if (pool && dbReady) {
    pool.query('DELETE FROM ff_users WHERE idl = $1', [idl])
      .catch(e => console.error('DB 삭제 실패:', e.message));
  } else saveFile();
}
// 클랜 저장 / 삭제 (파일 모드에서는 db 전체가 직렬화되므로 saveFile 한 번이면 충분)
function persistClan(cid) {
  if (pool && dbReady) {
    const c = db.clans[cid]; if (!c) return;
    pool.query('INSERT INTO ff_clans(cid, data) VALUES($1, $2) ON CONFLICT(cid) DO UPDATE SET data = excluded.data', [cid, c])
      .catch(e => console.error('클랜 저장 실패:', e.message));
  } else saveFile();
}
function purgeClan(cid) {
  if (pool && dbReady) {
    pool.query('DELETE FROM ff_clans WHERE cid = $1', [cid])
      .catch(e => console.error('클랜 삭제 실패:', e.message));
  } else saveFile();
}

loadFileSync();          // 로컬은 즉시
if (pool) loadFromDB();  // DB 있으면 덮어씀 (비동기)

// ── 비번 해싱 ──
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 32).toString('hex'); }
function makeToken() { return crypto.randomBytes(24).toString('hex'); }

// ── 레벨 / 랭크 ──
// 현재 레벨에서 다음 레벨까지 필요한 XP (누진 곡선)
function xpForNext(level) {
  if (level < 10) return level * 25 + 25;   // 초반(1~10렙) 완화 — 빠른 성취감
  if (level < 20) return level * 100;
  return level * 150;
}
// 누적 XP → { level, inLevel(현재 레벨 진척), need(다음 레벨까지) } — While 루프로 잉여 이월
function levelInfo(totalXp) {
  let level = 1, rem = Math.max(0, Math.floor(totalXp || 0));
  while (rem >= xpForNext(level)) { rem -= xpForNext(level); level++; }
  return { level, inLevel: rem, need: xpForNext(level) };
}
function levelOf(xp) { return levelInfo(xp).level; }
function xpInLevel(xp) { return levelInfo(xp).inLevel; }
// ── 급수 / 단 / ACE ────────────────────────────────────────────────────────
// 바둑식 사다리. 급수는 RP 만 채우면 자동으로 오르고 내려가지 않는다.
// 단부터는 승단전(5판 3승)을 통과해야 오른다 — RP 를 채우는 것은 "자격"일 뿐이다.
// 9단 위에는 정원 100명의 ACE 가 있고, 여긴 RP 순위로 자리가 오간다.
//
// 아이콘은 이미 그려 둔 그림에서만 골랐다. 그림 없는 이모지를 쓰면 그 등급만
// 시스템 이모지로 떠서 혼자 이질적으로 보인다.
const RANKS = [
  { id: '10K', name: '10급', tier: 'kyu', min: 0,    max: 99,   icon: '\uD83E\uDD49', color: '#9a8a72' },
  { id: '9K',  name: '9급',  tier: 'kyu', min: 100,  max: 224,  icon: '\uD83E\uDD49', color: '#a89478' },
  { id: '8K',  name: '8급',  tier: 'kyu', min: 225,  max: 374,  icon: '\uD83E\uDD49', color: '#b8a07e' },
  { id: '7K',  name: '7급',  tier: 'kyu', min: 375,  max: 549,  icon: '\uD83E\uDD48', color: '#a8b0bc' },
  { id: '6K',  name: '6급',  tier: 'kyu', min: 550,  max: 749,  icon: '\uD83E\uDD48', color: '#b8c0cc' },
  { id: '5K',  name: '5급',  tier: 'kyu', min: 750,  max: 974,  icon: '\uD83E\uDD48', color: '#c8d0dc' },
  { id: '4K',  name: '4급',  tier: 'kyu', min: 975,  max: 1274, icon: '\uD83E\uDD47', color: '#d8b04a' },
  { id: '3K',  name: '3급',  tier: 'kyu', min: 1275, max: 1624, icon: '\uD83E\uDD47', color: '#e0b84a' },
  { id: '2K',  name: '2급',  tier: 'kyu', min: 1625, max: 2024, icon: '\uD83E\uDD47', color: '#eac457' },
  { id: '1K',  name: '1급',  tier: 'kyu', min: 2025, max: 2474, icon: '\uD83C\uDFC5', color: '#ffd94a' },

  { id: '1D',  name: '초단', tier: 'dan', min: 2475, max: 2824, icon: '\uD83D\uDCA0', color: '#4ec3c0', danLevel: 1 },
  { id: '2D',  name: '2단',  tier: 'dan', min: 2825, max: 3174, icon: '\uD83D\uDCA0', color: '#4ec9d8', danLevel: 2 },
  { id: '3D',  name: '3단',  tier: 'dan', min: 3175, max: 3524, icon: '\uD83D\uDCA0', color: '#54c0e8', danLevel: 3 },
  { id: '4D',  name: '4단',  tier: 'dan', min: 3525, max: 3874, icon: '\uD83D\uDC8E', color: '#6ab4ff', danLevel: 4 },
  { id: '5D',  name: '5단',  tier: 'dan', min: 3875, max: 4224, icon: '\uD83D\uDC8E', color: '#7ab8ff', danLevel: 5 },
  { id: '6D',  name: '6단',  tier: 'dan', min: 4225, max: 4574, icon: '\uD83D\uDC8E', color: '#8ea8ff', danLevel: 6 },
  { id: '7D',  name: '7단',  tier: 'dan', min: 4575, max: 4924, icon: '\uD83D\uDC51', color: '#a88bff', danLevel: 7 },
  { id: '8D',  name: '8단',  tier: 'dan', min: 4925, max: 5274, icon: '\uD83D\uDC51', color: '#c39bff', danLevel: 8 },
  { id: '9D',  name: '9단',  tier: 'dan', min: 5275, max: null, icon: '\uD83D\uDC51', color: '#d8a0ff', danLevel: 9 },
];
const ACE_RANK = { id: 'ACE', name: 'ACE', tier: 'ace', icon: '\u2B50', color: '#ffd94a' };
const ACE_CAPACITY = 100;

// RP 계산 상수
const RP_CONFIG = {
  baseWin: 25, baseLose: -18,
  promoFailPenalty: -100,
  rankPoints: { 1: 25, 2: 8, 3: -8, 4: -22 },   // 다인전 순위별
  streakStart: 3, streakBonusPer: 5, streakBonusMax: 15,
  mmrHighFactor: 1.3, mmrEvenFactor: 1.0, mmrLowFactor: 0.7, mmrBand: 300,
};
const PROMO = { bestOf: 5, winsNeeded: 3 };

const rankIndex = (id) => RANKS.findIndex((r) => r.id === id);
const LAST_KYU = RANKS.filter((r) => r.tier === 'kyu').slice(-1)[0];   // 1급
const rankAbove = (id) => { const i = rankIndex(id); return i >= 0 && i < RANKS.length - 1 ? RANKS[i + 1] : null; };

// RP 로만 따진 등급 (자격 판정용). 표시용은 displayRankOf 를 쓴다 —
// 단부터는 승단전을 통과해야 오르므로 RP 만으로 정할 수 없다.
function rankOf(rp) {
  const v = Number(rp) || 0;
  for (const r of RANKS) {
    if (r.max === null) { if (v >= r.min) return r; }
    else if (v >= r.min && v <= r.max) return r;
  }
  return RANKS[0];
}

// 예전 계정에는 rank 가 없다 (RP 만으로 등급을 정하던 시절). 한 번 세워 준다.
// 안 하면 RP 가 아무리 높아도 전부 10급으로 떨어져 보인다.
// 단으로는 자동 진입이 없으므로 1급까지만 올린다 — 그 위는 승단전을 거쳐야 한다.
function ensureRank(u) {
  if (!u || u.rank) return u;
  const byRp = rankOf(u.rp || 0);
  u.rank = byRp.tier === 'kyu' ? byRp.id : LAST_KYU.id;
  if (u.mmr === undefined || u.mmr === null) u.mmr = u.rp || 0;
  return u;
}

// 화면에 보일 등급. ACE 가 가장 위.
function displayRankOf(u) {
  if (!u) return RANKS[0];
  ensureRank(u);
  if (u.isAce) return { ...ACE_RANK, standing: u.aceStanding || null };
  const i = rankIndex(u.rank || '10K');
  return i >= 0 ? RANKS[i] : RANKS[0];
}

// ── RP 계산 ────────────────────────────────────────────────────────────────
// MMR 은 RP 와 따로 도는 숨은 실력 점수다. 지금 급수의 기대치보다 실력이 높으면
// 승급을 가속하고, 낮으면 늦춰서 거품(운으로 올라온 자리)이 오래 남지 않게 한다.
function mmrFactorOf(u) {
  const cur = RANKS[rankIndex(u.rank || '10K')] || RANKS[0];
  const diff = ((u.mmr === undefined || u.mmr === null) ? (u.rp || 0) : u.mmr) - cur.min;
  if (diff > RP_CONFIG.mmrBand) return RP_CONFIG.mmrHighFactor;
  if (diff < -RP_CONFIG.mmrBand) return RP_CONFIG.mmrLowFactor;
  return RP_CONFIG.mmrEvenFactor;
}
// 연승 보너스는 이긴 판에만, 상한을 둔다 (연승이 길수록 무한히 벌어지지 않게)
function streakBonusOf(streak) {
  if (streak < RP_CONFIG.streakStart) return 0;
  return Math.min((streak - RP_CONFIG.streakStart + 1) * RP_CONFIG.streakBonusPer,
                  RP_CONFIG.streakBonusMax);
}
// mode: 'winlose'(1:1) | 'rank'(다인전 순위)
// streak 은 "이 판까지 포함한 연승 수" 를 밖에서 넘긴다.
// 여기서 직접 세면, 호출부가 이미 연승을 올린 뒤라 한 판씩 앞서간다.
function calcRpDelta(u, mode, result, streak) {
  let base, isWin;
  if (mode === 'rank') {
    base = RP_CONFIG.rankPoints[result.place];
    if (base === undefined) base = 0;
    isWin = result.place === 1;
  } else {
    isWin = !!result.didWin;
    base = isWin ? RP_CONFIG.baseWin : RP_CONFIG.baseLose;
  }
  const f = mmrFactorOf(u);
  const st = (streak === undefined || streak === null) ? (u.winStreak || 0) : streak;
  const bonus = isWin ? streakBonusOf(st) : 0;
  return { delta: Math.round(base * f) + bonus, streak: st, bonus, isWin, base, factor: f };
}

// ── 승급 자격 갱신 ─────────────────────────────────────────────────────────
// 급수는 RP 만 채우면 자동으로 오르고 내려가지 않는다.
// 단으로는 자동 진입이 없다 — 자격만 주고, 승단전을 통과해야 오른다.
function refreshRankState(u) {
  u.rp = Math.max(0, u.rp || 0);
  ensureRank(u);
  if (u.promo) return;                       // 승단전 중에는 등급이 고정된다

  const cur = RANKS[rankIndex(u.rank)] || RANKS[0];
  if (cur.tier === 'kyu') {
    // RP 가 급수 구간을 통째로 넘어섰으면 1급까지는 올려 준다.
    // "급수일 때만 올린다" 로 두면, RP 가 단 구간까지 치솟은 사람이
    // 낮은 급수에 그대로 묶여 영원히 못 올라간다.
    const byRp = rankOf(u.rp);
    const target = byRp.tier === 'kyu' ? byRp : LAST_KYU;
    if (rankIndex(target.id) > rankIndex(u.rank)) u.rank = target.id;
  }
  const next = rankAbove(u.rank);
  if (next && next.promoteMatch !== false && next.tier === 'dan') {
    u.promoEligible = (u.rp >= next.min);
  } else {
    u.promoEligible = false;
  }
}

// ── 승단전 ─────────────────────────────────────────────────────────────────
function startPromo(u) {
  if (!u.promoEligible || u.promo) return false;
  u.promo = { wins: 0, losses: 0 };
  return true;
}
// 결과 한 판 반영. 3승이면 승단, 3패면 실패(RP -100).
function promoResult(u, didWin) {
  if (!u.promo) return null;
  if (didWin) u.promo.wins++; else u.promo.losses++;
  const need = PROMO.winsNeeded, lim = PROMO.bestOf - PROMO.winsNeeded + 1;
  if (u.promo.wins >= need) {
    const next = rankAbove(u.rank);
    if (next) u.rank = next.id;
    u.promo = null; u.promoEligible = false;
    return { done: true, passed: true, rank: u.rank };
  }
  if (u.promo.losses >= lim) {
    u.rp = Math.max(0, (u.rp || 0) + RP_CONFIG.promoFailPenalty);
    u.promo = null; u.promoEligible = false;
    return { done: true, passed: false, penalty: RP_CONFIG.promoFailPenalty };
  }
  return { done: false, wins: u.promo.wins, losses: u.promo.losses,
           need, bestOf: PROMO.bestOf };
}

// ── ACE 정원제 ─────────────────────────────────────────────────────────────
// 9단과 현 ACE 를 한 줄로 세워 상위 100명만 ACE 로 둔다.
// 판이 끝날 때마다 전체를 훑으면 사람이 늘수록 무거워지므로,
// 9단·ACE 가 얽힌 경우에만 돌린다.
function refreshAce() {
  const pool = [];
  for (const idl of Object.keys(db.users)) {
    const u = db.users[idl];
    if (u && (u.rank === '9D' || u.isAce)) pool.push(u);
  }
  pool.sort((a, b) => (b.rp || 0) - (a.rp || 0));
  pool.forEach((u, i) => {
    if (i < ACE_CAPACITY) { u.isAce = true; u.aceStanding = i + 1; }
    else { u.isAce = false; u.aceStanding = null; u.rank = '9D'; }
  });
  return pool.length;
}
const aceRelevant = (u) => !!(u && (u.rank === '9D' || u.isAce));

// ── 시즌 소프트 리셋 ───────────────────────────────────────────────────────
// 급수는 그대로 두고 단·ACE 만 한 단계 아래로 내린다.
// 최고 기록은 따로 남겨 둔다 — 리셋으로 지워지면 억울하다.
function seasonReset() {
  let moved = 0;
  for (const idl of Object.keys(db.users)) {
    const u = db.users[idl]; if (!u) continue;
    const cur = RANKS[rankIndex(u.rank || '10K')] || RANKS[0];
    if (u.isAce || cur.tier === 'dan') {
      u.bestRank = bestRankOf(u);
      const below = Math.max(0, rankIndex(u.rank) - 1);
      u.rank = RANKS[below].id;
      u.rp = RANKS[below].min;
      moved++;
    }
    u.isAce = false; u.aceStanding = null;
    u.winStreak = 0; u.promo = null; u.promoEligible = false;
    persist(idl);
  }
  return { moved };
}
// ── 시즌은 언제 바뀌는가 ──────────────────────────────────────────────────
// 달이 바뀌면 새 시즌. 한국 시간 기준이다 — 서버가 어디에 있든 유저가 보는
// 달과 같아야 한다. seasonReset() 은 만들어만 두고 아무도 안 불러서, 시즌이
// 영영 안 바뀌고 있었다.
function seasonKey(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);   // UTC+9
  return kst.getUTCFullYear() + '-' + String(kst.getUTCMonth() + 1).padStart(2, '0');
}
// 첫 시즌을 1로 놓고 몇 번째인지 센다 (화면에 "시즌 3" 처럼 쓴다)
const SEASON_EPOCH = '2025-08';
function seasonNo(key = seasonKey()) {
  const [y1, m1] = SEASON_EPOCH.split('-').map(Number);
  const [y2, m2] = key.split('-').map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}
function seasonState() {
  const key = seasonKey();
  return { key, no: seasonNo(key), current: db.season && db.season.key };
}
// 달이 바뀌었으면 소프트 리셋을 돌린다. 서버가 뜰 때와 한 시간마다 확인한다 —
// 정확히 자정에 도는 것보다, 언제 재시작해도 한 번은 도는 편이 안전하다.
function checkSeason() {
  const key = seasonKey();
  if (db.season && db.season.key === key) return null;
  const first = !db.season;                    // 처음이면 리셋 없이 표시만 남긴다
  const out = first ? { moved: 0 } : seasonReset();
  db.season = { key, no: seasonNo(key), startedAt: Date.now(), lastMoved: out.moved };
  persistMeta('season', db.season);
  console.log(`[시즌] ${key} 시작 (시즌 ${db.season.no}) — ${first ? '첫 기록' : out.moved + '명 하향'}`);
  return { key, no: db.season.no, moved: out.moved, first };
}

// 지금까지 가장 높이 올라간 등급 id
function bestRankOf(u) {
  const now = u.isAce ? 'ACE' : (u.rank || '10K');
  const prev = u.bestRank || '10K';
  if (now === 'ACE') return 'ACE';
  if (prev === 'ACE') return 'ACE';
  return rankIndex(now) > rankIndex(prev) ? now : prev;
}

// 스포이드 쓰기 — 담아 둔 색으로 되돌리고 한 개를 쓴다.
// 되돌린 뒤에도 담긴 색은 남긴다(같은 색을 또 담아 두려고 다시 살 필요는 없게).
function usePipette(token) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  u.items = u.items || {};
  if (!(u.items.dye_pipette > 0)) return { error: '스포이드가 없어요.' };
  if (!u.dyeSaved) return { error: '담아 둔 색이 없어요.' };
  if (u.nickColor === u.dyeSaved) return { error: '이미 그 색이에요.' };
  u.items.dye_pipette--;
  if (u.items.dye_pipette <= 0) delete u.items.dye_pipette;
  u.nickColor = u.dyeSaved;
  persist(idl);
  return { ok: true, dye: u.nickColor, left: u.items.dye_pipette || 0, profile: profileOf(u) };
}

// 화면에 그릴 진행 정보 — 다음 등급까지 얼마나 남았는지, 승단전 중인지
function rankInfoOf(u) {
  if (!u) return null;
  ensureRank(u);
  if (u.isAce) return { tier: 'ace', standing: u.aceStanding || null, capacity: ACE_CAPACITY };
  const cur = RANKS[rankIndex(u.rank || '10K')] || RANKS[0];
  const next = rankAbove(cur.id);
  const out = { tier: cur.tier, rankId: cur.id, nextName: next ? next.name : null };
  if (u.promo) {
    out.promo = { wins: u.promo.wins, losses: u.promo.losses,
                  need: PROMO.winsNeeded, bestOf: PROMO.bestOf };
  } else if (next && next.tier === 'dan' && (u.rp || 0) >= next.min) {
    // 저장된 promoEligible 은 대전 결과 때만 갱신된다. 그 값을 믿으면
    // 로그인 직후처럼 아직 안 돈 시점에 "자격 없음" 으로 보인다.
    // 여기서는 RP 로 바로 판단해 화면과 실제가 어긋나지 않게 한다.
    out.promoReady = true;
  } else if (next) {
    out.need = Math.max(0, next.min - (u.rp || 0));   // 다음 등급까지 남은 RP
    out.from = cur.min; out.to = next.min;
  }
  return out;
}

function profileOf(u) {
  if (!u) return null;
  const rank = displayRankOf(u);
  const total = u.wins + u.losses;
  return {
    id: u.id, nick: u.nick, guest: false,
    nickLocked: !!u.nickSet,   // false면 아직 무료 닉 설정 기회 남음 (소셜 첫 로그인 — provider 무관)
    level: levelOf(u.xp), xp: u.xp, xpInLevel: xpInLevel(u.xp), xpNeeded: levelInfo(u.xp).need,
    rp: u.rp, rank: rank.name, rankIcon: rank.icon, rankColor: rank.color,
    rankId: rank.id, rankTier: rank.tier, aceStanding: rank.standing || null,
    // 다음 등급까지 얼마나 남았는지 · 승단전 상태
    rankInfo: rankInfoOf(u),
    wins: u.wins, losses: u.losses,
    winRate: total ? Math.round(u.wins / total * 100) : 0,
    coins: u.coins || 0,
    shards: u.shards || 0,
    cycle: cycleProgress(u), cycleDone: (u.stats || {}).cycle || 0,   // 오늘 진행 · 누적 완성 횟수
    sinceLegend: u.sinceLegend || 0,
    nickColor: u.nickColor || null,          // 염색약 결과 (색 키)
    dyeSaved: u.dyeSaved || null,            // 스포이드에 담아 둔 색
    pipettes: (u.items && u.items.dye_pipette) || 0,
    cardBack: u.cardBack || null,            // 장착 중인 카드백
    avatar: u.avatar || null,                // 장착 중인 아바타 (랭킹·게임 화면에서 남도 본다)
    winStamp: u.winStamp || null,            // 낙찰 도장
    victoryFx: u.victoryFx || null,          // 승리 연출
    placeFx: u.placeFx || null,              // 카드 놓는 이펙트
    items: u.items || {},                    // 보유 아이템 { id: 개수 or true }
    streak: u.winStreak || 0,                // 현재 연승
    loginStreak: u.loginStreak || 0,         // 연속 출석 일수
    history: (u.history || []).slice(0, 10), // 최근 전적
    plate: u.plate || null,                  // 장착 명패
    table: u.table || null,                  // 장착 테이블 스킨
    cardFace: u.cardFace || null,            // 장착 카드 앞면 스킨
    title: u.title || null,                  // 장착 칭호 id
    titleInfo: u.title && TITLES[u.title] ? { name: TITLES[u.title].name, icon: TITLES[u.title].icon, color: TITLES[u.title].color } : null,
  };
}

// ── API ──
// __proto__/constructor 등 예약어 차단 — 객체 키로 쓰이므로 프로토타입 오염 방지
const RESERVED_KEY = /^(__proto__|constructor|prototype|hasownproperty|tostring|valueof)$/i;
// 욕설·비하 차단.
//
// 두 갈래로 나눠 둔다.
//   · SUB  — 어디에 끼어 있든 걸러야 하는 말 (닉네임 안에 숨겨 써도 잡힌다)
//   · WORD — 짧고 흔한 영단어라 단어 경계로만 잡는 것. 안 그러면 'Sextet',
//            'Assassin', 'Grass' 같은 멀쩡한 이름이 같이 걸린다.
//
// 사이에 기호·숫자를 끼워 피해 가는 걸 막으려고, 검사 전에 한 번 눌러 편다
// (normForBad): 기호 제거 + 흔한 치환(0→o, 1→i, 3→e, @→a, $→s) + 자모 분리 복원.
const BAD_SUB = /시발|씨발|씨빨|쉬발|시빨|십발|씹|병신|븅신|빙신|지랄|새끼|색기|섹스|좆|존나|니미|애미|에미|느금|보지|자지|걸레|창녀|창년|미친놈|미친년|개새|호로|썅|썩을|엠창|틀딱|짱깨|쪽바리|한남충|김치녀|메갈|일베|운영자|관리자|fuck|fuk|fck|shit|bitch|bastard|asshole|nigg|nigr|cunt|slut|whore|dick|pussy|penis|vagina|blowjob|handjob|porn|hentai|rape|pedo|nazi|hitler|kkk|retard|faggot|fagot|motherfuck|wtf|stfu|admin|moderator/i;
const BAD_WORD = /^(?:sex|ass|anal|cum|tit|tits|boob|boobs|damn|hell|crap|piss|suck|sucks|gay|homo|jap|chink|gook|spic|kike|coon|die|kill|gm|op|god)$/i;

// 검사 전에 눌러 펴기 — s1_2#발 같은 우회를 막는다
function normForBad(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s._\-*~^!?,'"`|/\\+=()\[\]{}<>:;]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
    .replace(/@/g, 'a').replace(/\$/g, 's');
}
function hasBadWord(s) {
  const n = normForBad(s);
  if (!n) return false;
  if (BAD_SUB.test(n)) return true;
  // 짧은 영단어는 통째로 같을 때만 (Assassin 같은 멀쩡한 이름을 살리려고)
  return BAD_WORD.test(n);
}

// 닉네임 규칙
//   · 2~8자 (예전엔 1~12자였다. 한 글자는 서로 못 알아보고, 열두 글자는 판에서 잘렸다)
//   · 자음·모음만으로는 안 된다 (ㅋㅋ, ㅏㅏ 같은 건 이름이 아니다)
//   · 욕설·비속어는 한국어·영어 모두 차단
const NICK_MIN = 2, NICK_MAX = 8;
// 완성되지 않은 한글 낱자 (ㄱ~ㅎ, ㅏ~ㅣ)
const JAMO_ONLY = /^[\u3131-\u318E]+$/;
function validId(id)   { return /^[A-Za-z0-9_]{3,16}$/.test(id || '') && !RESERVED_KEY.test(id); }
// 왜 문제인지까지 돌려준다 — "사용할 수 없어요" 만 뜨면 뭘 고쳐야 할지 모른다
function nickProblem(n) {
  const s = String(n || '').trim();
  // 문구를 템플릿으로 짜면 소스에 통째로 안 남아, 번역 사전의 짝 검사가 못 본다
  if (s.length < NICK_MIN) return '닉네임은 2자 이상이어야 해요.';
  if (s.length > NICK_MAX) return '닉네임은 8자 이내여야 해요.';
  if (JAMO_ONLY.test(s.replace(/\s/g, ''))) return '자음·모음만으로는 만들 수 없어요.';
  if (RESERVED_KEY.test(s)) return '사용할 수 없는 닉네임이에요.';
  if (hasBadWord(s)) return '사용할 수 없는 표현이 들어 있어요.';
  return null;
}
function validNick(n) { return nickProblem(n) === null; }

const TOKEN_TTL = 30 * 24 * 3600 * 1000;   // 토큰 30일 만료
// 신규 계정 창단 보너스 — 코인 200 + '창단 멤버' 칭호 (플래그로 1회만)
const FOUNDER_COINS = 200, TUTORIAL_COINS = 100;
function grantFounder(u) {
  if (u.founder) return;
  u.founder = true;
  u.coins = (u.coins || 0) + FOUNDER_COINS;
  u.titles = u.titles || {};
  u.titles.t_founder = true;
}
function signup(id, pw, nick) {
  id = String(id || '').trim(); nick = String(nick || '').trim();
  if (!validId(id)) return { error: '아이디는 영문/숫자 3~16자예요.' };
  if (/^kakao_/i.test(id)) return { error: '사용할 수 없는 아이디예요.' };   // 카카오 계정 키와 충돌 방지
  if (String(pw || '').length < 6) return { error: '비밀번호는 6자 이상이어야 해요.' };
  { const bad = nickProblem(nick); if (bad) return { error: bad }; }
  const idl = id.toLowerCase(), nickl = nick.toLowerCase();
  if (db.users[idl]) return { error: '이미 있는 아이디예요.' };
  if (db.nickTaken[nickl]) return { error: '이미 사용 중인 닉네임이에요.' };
  const salt = crypto.randomBytes(12).toString('hex');
  const token = makeToken();
  const u = { id, nick, nickSet: true, salt, hash: hashPw(pw, salt), token, tokenExp: Date.now() + TOKEN_TTL, wins: 0, losses: 0, xp: 0, rp: 0, createdAt: Date.now() };   // 일반 가입은 폼에서 닉 확정
  grantFounder(u);
  db.users[idl] = u; db.nickTaken[nickl] = idl; tokenIndex[token] = idl; persist(idl);
  return { ok: true, token, profile: profileOf(u) };
}
function login(id, pw) {
  const idl = String(id || '').trim().toLowerCase();
  const u = db.users[idl];
  if (!u || !u.hash || u.hash !== hashPw(pw, u.salt)) return { error: '아이디 또는 비밀번호가 틀렸어요.' };   // 카카오 계정은 비번 없음
  // 로그인마다 토큰 갱신·만료 연장
  if (u.token) delete tokenIndex[u.token];
  u.token = makeToken(); u.tokenExp = Date.now() + TOKEN_TTL;
  tokenIndex[u.token] = idl; persist(idl);
  return { ok: true, token: u.token, profile: profileOf(u) };
}
// ── 임시 계정 (코드 로그인) ────────────────────────────────────────────────
//
// 아이디·비밀번호 없이 코드 한 줄로 들어오는 계정. 시험용·손님용이다.
//
// 지켜야 할 것:
//   · 코드는 절대 그대로 저장하지 않는다. 비밀번호와 같은 방식으로 해시만 남긴다 —
//     저장소가 새어도 코드는 못 건진다. 그래서 만들 때 딱 한 번만 보여 준다.
//   · 코드를 잃어버리면 복구가 아니라 재발급이다(rotateTempCode).
//   · 만료가 있다. 시험용 계정이 영원히 열려 있으면 그게 곧 뒷문이다.
//   · 헷갈리는 글자(0/O, 1/I/L)를 뺀 32글자로 12자 — 약 60비트.
//     초당 백만 번을 찍어도 수만 년이 걸린다. 그래도 서버는 시도 횟수를 센다.
//   · 비교는 timingSafeEqual 로. 문자열 == 은 앞자리부터 달라지는 지점이 시간에
//     드러나서, 이론상 한 글자씩 맞춰 나갈 수 있다.
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 0 O 1 I L 제외
const TEMP_CODE_LEN = 12;
const TEMP_TTL = 30 * 24 * 3600 * 1000;                     // 30일

function makeTempCode() {
  let out = '';
  // randomBytes 를 알파벳 길이로 나머지 연산하면 앞쪽 글자가 조금 더 자주 나온다.
  // 치우친 만큼 경우의 수가 줄므로, 남는 값은 버리고 다시 뽑는다.
  const n = TEMP_ALPHABET.length, limit = 256 - (256 % n);
  while (out.length < TEMP_CODE_LEN) {
    for (const b of crypto.randomBytes(TEMP_CODE_LEN)) {
      if (b >= limit) continue;
      out += TEMP_ALPHABET[b % n];
      if (out.length === TEMP_CODE_LEN) break;
    }
  }
  return out.replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');      // 보기 좋게 네 자리씩
}
const normTempCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// 코드를 넣으면 그 계정에 붙는다. 코드 자체는 안 남기고 해시만 남긴다.
function setTempCode(u, code) {
  u.tempSalt = crypto.randomBytes(12).toString('hex');
  u.tempHash = hashPw(normTempCode(code), u.tempSalt);
  u.tempExp = Date.now() + TEMP_TTL;
  u.temp = true;
}

// 임시 계정 n 개를 만든다. 코드는 돌려주는 이 순간이 처음이자 마지막이다.
function createTempAccounts(count = 5, opts = {}) {
  const n = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
  const coins = Math.max(0, Math.min(100000, Math.floor(Number(opts.coins) || 3000)));
  const out = [];
  for (let i = 0; i < n; i++) {
    // 아이디·닉네임이 겹치지 않을 때까지 뒤에 숫자를 올린다
    let k = 1, id, nick;
    do { id = `guest${String(k).padStart(2, '0')}`; k++; } while (db.users[id.toLowerCase()]);
    k = 1;
    do { nick = `손님${k}`; k++; } while (db.nickTaken[nick.toLowerCase()]);

    const code = makeTempCode();
    const u = {
      id, nick, nickSet: true,
      salt: null, hash: null,                 // 비밀번호 로그인은 막는다 — 코드만 통한다
      token: makeToken(), tokenExp: Date.now() + TOKEN_TTL,
      wins: 0, losses: 0, xp: 0, rp: 0, coins, createdAt: Date.now(),
    };
    setTempCode(u, code);
    db.users[id.toLowerCase()] = u;
    db.nickTaken[nick.toLowerCase()] = id.toLowerCase();
    tokenIndex[u.token] = id.toLowerCase();
    persist(id.toLowerCase());
    out.push({ id, nick, code, expiresAt: u.tempExp });      // code 는 여기서만 나온다
  }
  return { ok: true, accounts: out };
}

// 코드를 다시 발급한다(잃어버렸을 때). 옛 코드는 그 즉시 못 쓴다.
function rotateTempCode(id) {
  const idl = String(id || '').trim().toLowerCase();
  const u = Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u || !u.temp) return { error: '임시 계정이 아니에요.' };
  const code = makeTempCode();
  setTempCode(u, code);
  persist(idl);
  return { ok: true, id: u.id, nick: u.nick, code, expiresAt: u.tempExp };
}

// 코드를 끈다. 지우는 게 아니라 못 쓰게만 한다(전적은 남긴다).
function revokeTempCode(id) {
  const idl = String(id || '').trim().toLowerCase();
  const u = Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u || !u.temp) return { error: '임시 계정이 아니에요.' };
  u.tempHash = null; u.tempSalt = null; u.tempExp = 0;
  persist(idl);
  return { ok: true, id: u.id };
}

// 지금 살아 있는 임시 계정 목록. 코드는 없다 — 남아 있지 않으니 보여 줄 수도 없다.
function tempAccountList() {
  const out = [];
  for (const idl of Object.keys(db.users)) {
    const u = db.users[idl];
    if (!u || !u.temp) continue;
    out.push({ id: u.id, nick: u.nick, coins: u.coins || 0,
      active: !!u.tempHash && Date.now() < (u.tempExp || 0), expiresAt: u.tempExp || 0 });
  }
  return { ok: true, accounts: out };
}

// 코드로 로그인. 맞는 계정을 찾을 때까지 전부 훑되, 비교는 일정 시간으로 한다.
function codeLogin(code) {
  const norm = normTempCode(code);
  if (norm.length !== TEMP_CODE_LEN) return { error: '코드가 올바르지 않아요.' };
  const now = Date.now();
  let found = null;
  for (const idl of Object.keys(db.users)) {
    const u = db.users[idl];
    if (!u || !u.temp || !u.tempHash || !u.tempSalt) continue;
    const got = Buffer.from(hashPw(norm, u.tempSalt), 'hex');
    const want = Buffer.from(u.tempHash, 'hex');
    if (got.length === want.length && crypto.timingSafeEqual(got, want)) { found = { idl, u }; break; }
  }
  if (!found) return { error: '코드가 올바르지 않아요.' };
  if (!found.u.tempExp || now > found.u.tempExp) return { error: '기한이 지난 코드예요.' };

  if (found.u.token) delete tokenIndex[found.u.token];
  found.u.token = makeToken(); found.u.tokenExp = now + TOKEN_TTL;
  found.u.lastCodeLogin = now;
  tokenIndex[found.u.token] = found.idl;
  persist(found.idl);
  return { ok: true, token: found.u.token, profile: profileOf(found.u) };
}

function byToken(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return null;
  if (u.tokenExp && Date.now() > u.tokenExp) { delete tokenIndex[token]; return null; }  // 만료
  return u;
}
function meByToken(token) { const u = byToken(token); return u ? { ok: true, profile: profileOf(u) } : { error: '세션 만료' }; }

// 계정 영구 삭제 — 구글플레이 정책(계정 생성 앱은 삭제 수단 제공 의무).
// 일반 계정은 비밀번호 재확인, 소셜 계정은 토큰만으로 삭제. 되돌릴 수 없음.
function deleteAccount(token, password) {
  const idl = tokenIndex[token];
  const u = idl ? db.users[idl] : null;
  if (!u) return { error: '세션이 만료됐어요. 다시 로그인해주세요.' };
  if (u.hash) {   // 비번 계정은 본인 확인 (공용 기기에서의 오·악의적 삭제 방지)
    if (!password) return { error: '비밀번호를 입력해주세요.', needPw: true };
    if (u.hash !== hashPw(password, u.salt)) return { error: '비밀번호가 틀렸어요.', needPw: true };
  }
  // 친구·클랜에 남는 유령 참조 정리 (탈퇴자가 남의 목록에 계속 뜨는 것 방지)
  for (const other of [...(u.friends || []), ...(u.freqIn || []), ...(u.freqOut || [])]) {
    const o = Object.prototype.hasOwnProperty.call(db.users, other) ? db.users[other] : null;
    if (!o) continue;
    if (Array.isArray(o.friends)) o.friends = o.friends.filter(x => x !== idl);
    if (Array.isArray(o.freqIn))  o.freqIn  = o.freqIn.filter(x => x !== idl);
    if (Array.isArray(o.freqOut)) o.freqOut = o.freqOut.filter(x => x !== idl);
    persist(other);
  }
  if (u.clan) leaveClanByIdl(idl);   // 클랜장이면 위임 또는 해체까지 처리

  if (u.token) delete tokenIndex[u.token];
  if (u.nick) delete db.nickTaken[String(u.nick).toLowerCase()];
  delete db.users[idl];
  purge(idl);
  return { ok: true };
}

// 닉네임 설정 — 카카오 첫 설정은 무료 1회, 이후엔 닉네임 변경권 소모
function setNick(token, nick) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '세션이 만료됐어요. 다시 로그인해주세요.' };
  const freeSet = !u.nickSet;                              // 소셜 첫 설정(카카오·구글)은 provider 무관 무료 1회
  const hasTicket = ((u.items || {}).nick_change || 0) > 0;
  if (!freeSet && !hasTicket) return { error: '닉네임 변경권이 필요해요. (상점에서 구매)' };
  nick = String(nick || '').trim();
  { const bad = nickProblem(nick); if (bad) return { error: bad }; }
  const nl = nick.toLowerCase();
  if (db.nickTaken[nl] && db.nickTaken[nl] !== idl) return { error: '이미 사용 중인 닉네임이에요.' };
  if (u.nick) delete db.nickTaken[u.nick.toLowerCase()];
  if (!freeSet) u.items.nick_change--;                     // 변경권 1장 소모
  u.nick = nick; u.nickSet = true; db.nickTaken[nl] = idl; persist(idl);
  return { ok: true, profile: profileOf(u) };
}

// ── 상점 ──
const SHOP = {
  dye_random:  { name: '랜덤 닉네임 염색약', icon: '🎨', price: 300,  type: 'dye',
                 desc: '닉네임 색을 랜덤으로! 골드 8%·무지개 2%' },
  nick_change: { name: '닉네임 변경권',       icon: '✏️', price: 500,  type: 'ticket',
                 desc: '닉네임을 한 번 바꿀 수 있어요' },
  back_night:  { name: '미드나잇 카드백',     icon: '🌙', price: 500,  type: 'cardback',
                 desc: '깊은 밤하늘 카드 뒷면 (상대에게도 보여요)' },
  back_gold:   { name: '황금 카드백',         icon: '🎖', price: 800,  type: 'cardback',
                 desc: '번쩍이는 황금 카드 뒷면' },
  back_obang:  { name: '오방색 카드백',       icon: '🎏', price: 1200, type: 'cardback',
                 desc: '전통 오방색 카드 뒷면' },
  back_ruby:   { name: '루비 카드백',         icon: '❤️‍🔥', price: 700,  type: 'cardback',
                 desc: '와인빛으로 물든 카드 뒷면' },
  back_galaxy: { name: '은하수 카드백',       icon: '🌌', price: 1500, type: 'cardback',
                 desc: '별이 흐르는 프리미엄 카드 뒷면' },
  emote_party: { name: '파티 이모트 팩',      icon: '🎉', price: 400,  type: 'emotes',
                 desc: '광대·악마·해골 등 장난스러운 8종' },
  emote_animal:{ name: '동물 이모트 팩',      icon: '🐾', price: 400,  type: 'emotes',
                 desc: '강아지·고양이·여우 등 동물 8종' },
  emote_battle:{ name: '승부사 이모트 팩',    icon: '⚔️', price: 400,  type: 'emotes',
                 desc: '칼·방패·트로피 등 승부용 8종' },
  np_wood:  { name: '나무 명패',   icon: '🪵', price: 400,  type: 'plate', desc: '닉네임을 감싸는 소박한 나무 명패' },
  np_neon:  { name: '네온 명패',   icon: '💜', price: 800,  type: 'plate', desc: '보랏빛 네온 명패 · 경험치 +5%' },
  np_gold:  { name: '황금 명패',   icon: '🏅', price: 1000, type: 'plate', desc: '번쩍이는 황금 명패 · 코인 획득 +4%' },
  np_daily: { name: '행운의 명패', icon: '🍀', price: 1500, type: 'plate', desc: '장착 중이면 매일 출석 보상 +50🪙' },
  np_lv50:  { name: '레벨50 한정 명패', icon: '🎖️', price: 0, type: 'plate', milestone: true, desc: '레벨 50 달성자 한정 · 코인·경험치 각 +3%' },
  dye_rare: { name: '희귀 염색약 확정권', icon: '💎', price: 0, type: 'dye_rare', milestone: true, desc: '희귀 색상(청록·핑크·라임) 확정 — 레벨20 보상' },
  // 스포이드 — 염색약은 눌러 보기 전엔 무슨 색이 나올지 모른다. 마음에 드는
  // 색을 들고 있으면 새 염색약이 무섭다. 그 색을 담아 두었다가 한 번 되돌린다.
  dye_pipette: { name: '염색 스포이드', icon: '🧪', price: 0, type: 'pipette', shard: 350,
                 desc: '지금 닉네임 색을 담아 둔다 · 언제든 한 번 그 색으로 되돌린다 (1회용)' },
  tbl_blue:  { name: '블루 테이블',   icon: '🔵', price: 600,  type: 'table', desc: '차분한 심해 블루 테이블' },
  tbl_purple:{ name: '퍼플 테이블',   icon: '🟣', price: 700,  type: 'table', desc: '고급스러운 자주빛 테이블' },
  tbl_gold:  { name: '골드 테이블',   icon: '🟡', price: 1200, type: 'table', desc: '럭셔리 카지노 골드 테이블' },
  tbl_forest:{ name: '그린 펠트 테이블', icon: '🟢', price: 600, type: 'table', desc: '클래식 카지노 그린 펠트' },
  face_neon: { name: '네온 카드',     icon: '🃏', price: 700,  type: 'cardface', desc: '숫자가 네온으로 빛나는 카드 앞면' },
  face_classic:{ name: '클래식 카드', icon: '♠️', price: 900,  type: 'cardface', desc: '트럼프풍 세리프 숫자 카드 앞면' },
  face_gold: { name: '황금 숫자 카드', icon: '👑', price: 1000, type: 'cardface', desc: '숫자가 황금빛으로 빛나는 카드 앞면' },
  np_ruby:   { name: '루비 명패',     icon: '❤️‍🔥', price: 1200, type: 'plate', desc: '와인빛 루비 명패 · 연승 보너스 1.25배' },

  // ── 크리스탈 세트 — 카드백·명패·테이블·카드앞면을 맞춰 쓰면 한 벌이 된다 ──
  back_crystal: { name: '크리스탈 카드백', icon: '🔮', price: 1600, type: 'cardback',
                  desc: '빛을 쪼개는 수정 결정면 뒷면' },
  np_crystal:   { name: '크리스탈 명패',   icon: '🔮', price: 1300, type: 'plate',
                  desc: '얼음처럼 맑은 명패 · 경험치 +8%' },
  tbl_crystal:  { name: '크리스탈 테이블', icon: '🧊', price: 1400, type: 'table',
                  desc: '살얼음이 낀 듯한 서늘한 테이블' },
  face_crystal: { name: '크리스탈 카드',   icon: '💠', price: 1100, type: 'cardface',
                  desc: '숫자가 수정처럼 맑게 비치는 앞면' },

  // ── 파편 세트 — 파편으로만 얻는다 ──
  // 코인으로 못 사고 뽑기에서도 안 나온다. 중복이 굳어 만들어진 물건이라
  // 중복을 겪은 사람만 가질 수 있게 했다. 뽑기는 컬렉션이 찰수록 값이
  // 떨어지는데(전부 가지면 남는 건 파편뿐), 이 줄이 그 끝을 받쳐 준다.
  back_shard:  { name: '파편 카드백',   icon: '🔷', price: 0, type: 'cardback', shard: 550,
                 desc: '깨진 빛이 맞물린 뒷면 · 파편으로만' },
  np_shard:    { name: '파편 명패',     icon: '🔷', price: 0, type: 'plate', shard: 650,
                 desc: '금이 간 결정 명패 · 파편 획득 +10% · 파편으로만' },
  tbl_shard:   { name: '파편 테이블',   icon: '🔷', price: 0, type: 'table', shard: 500,
                 desc: '조각난 빛이 깔린 테이블 · 파편으로만' },
  face_shard:  { name: '파편 카드',     icon: '🔷', price: 0, type: 'cardface', shard: 450,
                 desc: '숫자가 갈라져 빛나는 앞면 · 파편으로만' },
  ava_shard:   { name: '파편 아바타',   icon: '🔷', price: 0, type: 'avatar', shard: 400,
                 desc: '조각으로 이루어진 얼굴 · 파편으로만' },
  vfx_shard:   { name: '파편 폭발',     icon: '🔷', price: 0, type: 'victory', shard: 600,
                 desc: '이기면 화면이 조각나 흩어진다 · 파편으로만' },

  // ── 단품 ──
  back_obsidian:{ name: '흑요석 카드백',   icon: '🌑', price: 1800, type: 'cardback',
                  desc: '검은 유리에 금이 흐르는 뒷면' },
  back_hanji:   { name: '한지 카드백',     icon: '📜', price: 900,  type: 'cardback',
                  desc: '닥종이 결에 먹으로 친 뒷면' },
  emote_taunt:  { name: '도발 이모트 팩',  icon: '🫖', price: 500,  type: 'emotes',
                  desc: '티백·느린박수·하품 등 약올리기 8종' },

  // ── 승리 연출 — 이길 때 화면에 터진다. 상대에게도 보인다 ──
  vfx_confetti: { name: '색종이 축포',   icon: '🎊', price: 900,  type: 'victory',
                  desc: '승리하면 색종이가 쏟아진다' },
  vfx_coinrain: { name: '금화비',        icon: '💰', price: 1400, type: 'victory',
                  desc: '승리하면 금화가 떨어진다' },
  vfx_thunder:  { name: '벼락',          icon: '⚡', price: 1400, type: 'victory',
                  desc: '승리하면 벼락이 내리친다' },
  vfx_firework: { name: '불꽃놀이',      icon: '🎆', price: 2200, type: 'victory',
                  desc: '승리하면 밤하늘에 불꽃이 터진다' },

  // ── 아바타 — 프로필·랭킹·게임 화면에 계속 보인다 ──
  ava_rookie:   { name: '초심자 아바타', icon: '🙂', price: 300,  type: 'avatar', desc: '이제 막 시작한 얼굴' },
  ava_gambler:  { name: '승부사 아바타', icon: '🎩', price: 800,  type: 'avatar', desc: '중절모를 눌러쓴 승부사' },
  ava_fox:      { name: '여우 아바타',   icon: '🦊', price: 800,  type: 'avatar', desc: '속내를 알 수 없는 여우' },
  ava_dealer:   { name: '딜러 아바타',   icon: '🃏', price: 1300, type: 'avatar', desc: '판을 굴리는 딜러' },
  ava_cat:      { name: '도둑고양이 아바타', icon: '🐱', price: 1300, type: 'avatar', desc: '남의 패를 노리는 고양이' },
  ava_king:     { name: '왕 아바타',     icon: '👑', price: 2000, type: 'avatar', desc: '경매장의 왕' },
  ava_phantom:  { name: '괴도 아바타',   icon: '🎭', price: 2000, type: 'avatar', desc: '정체를 감춘 괴도' },

  // ── 낙찰 도장 — 이겼을 때 배팅 카드에 찍힌다 ──
  stamp_win:    { name: 'WIN 도장',      icon: '🏷', price: 0,    type: 'stamp', basic: true, desc: '기본 낙찰 도장' },
  stamp_seal:   { name: '붉은 인장',     icon: '🔴', price: 700,  type: 'stamp', desc: '옛 도장처럼 붉게 찍힌다' },
  stamp_star:   { name: '별 도장',       icon: '⭐', price: 1100, type: 'stamp', desc: '별이 박히듯 찍힌다' },
  stamp_crown:  { name: '왕관 도장',     icon: '👑', price: 1800, type: 'stamp', desc: '왕관이 내려앉는다' },

  // ── 카드 놓는 이펙트 — 내가 카드를 낼 때 ──
  place_dust:   { name: '먼지',          icon: '💨', price: 0,    type: 'place', basic: true, desc: '기본 — 옅은 먼지가 인다' },
  place_spark:  { name: '반짝임',        icon: '✨', price: 600,  type: 'place', desc: '카드를 낼 때 반짝인다' },
  place_ember:  { name: '불티',          icon: '🔥', price: 1200, type: 'place', desc: '카드를 낼 때 불티가 튄다' },

  // ── 흑요석 세트 (명패·테이블·앞면) ──
  np_obsidian:  { name: '흑요석 명패',     icon: '🌑', price: 2000, type: 'plate',
                  desc: '금이 흐르는 검은 명패 · 코인 획득 +6%' },
  tbl_obsidian: { name: '흑요석 테이블',   icon: '🌑', price: 1700, type: 'table',
                  desc: '검은 유리를 깐 듯한 테이블' },
  face_obsidian:{ name: '흑요석 카드',     icon: '🌑', price: 1300, type: 'cardface',
                  desc: '숫자가 금빛으로 새겨진 앞면' },

  // ── 화투 에디션 (카드백·명패·테이블·앞면) ──
  // 우리 카드 종류가 2·3·4·6 인데 화투 월과 그대로 맞아떨어진다.
  //   2 → 2월 매조(홍매화) · 3 → 3월 벚꽃 · 4 → 4월 흑싸리 · 6 → 6월 모란
  // 가운데 큰 숫자가 곧 "몇 월" 이라 새로 외울 것이 없다.
  back_hwatu:   { name: '화투 카드백',     icon: '🎴', price: 1600, type: 'cardback',
                  desc: '붉은 등 · 화투짝을 엎어 놓은 뒷면' },
  np_hwatu:     { name: '화투 명패',       icon: '🎴', price: 1600, type: 'plate',
                  desc: '붉은 판에 검은 테 · 골드 획득 +5%' },
  tbl_hwatu:    { name: '화투 담요',       icon: '🎴', price: 1500, type: 'table',
                  desc: '붉은 담요를 깔았다' },
  face_hwatu:   { name: '화투 카드',       icon: '🎴', price: 2400, type: 'cardface',
                  desc: '숫자가 곧 월 — 2월 매조·3월 벚꽃·4월 흑싸리·6월 모란' },

  // ── 한지 세트 (명패·테이블·앞면) ──
  np_hanji:     { name: '한지 명패',       icon: '📜', price: 900,  type: 'plate',
                  desc: '먹으로 쓴 이름표 · 경험치 +3%' },
  tbl_hanji:    { name: '한지 테이블',     icon: '📜', price: 800,  type: 'table',
                  desc: '닥종이를 깐 차분한 테이블' },
  face_hanji:   { name: '먹글씨 카드',     icon: '📜', price: 800,  type: 'cardface',
                  desc: '붓으로 쓴 듯한 숫자 앞면' },
};

// ── 명패 효과 ──────────────────────────────────────────────────────────────
// 비싼 명패에는 장식 말고 실익도 붙인다. 다만 RP 는 절대 건드리지 않는다 —
// 랭킹이 곧 RP 순위라서 돈으로 등수를 사는 꼴이 되고, RP 는 사람들 사이
// 제로섬이라 보너스를 주면 총량이 부풀어 랭킹 자체가 뜻을 잃는다.
// 그래서 코인(경제)·경험치(성장)·연승 보너스만 건드린다.
//
// 코인 명패가 경험치 명패보다 세 보이는 건 어쩔 수 없다 — 코인은 바로 쓰지만
// 경험치는 레벨을 거쳐 돌아오기 때문이다. 그래서 두 가지로 좁혔다.
//   · 레벨업마다 코인을 주도록 바꿔(LEVELUP_COIN) 경험치도 결국 돈이 되게 했다
//   · 코인 보너스 상단을 15% → 10% 로 낮췄다
// 그래도 완전히 같아지진 않는다. 코인 명패는 "버는 사람", 경험치 명패는
// "빨리 크는 사람" 을 위한 것으로 성격을 갈랐다.
// 수치는 한 번 낮췄다. 처음엔 코인 +8~15% 로 잡았는데 실제로 굴려 보니
// 명패 하나로 벌이가 눈에 띄게 달라져, 명패가 "장식" 이 아니라 "필수" 가 됐다.
// 꾸미는 재미가 먼저고 효과는 덤이어야 해서 대략 절반으로 줄였다.
const PLATE_FX = {
  np_wood:     {},                              // 입문용 — 장식만
  np_hanji:    { xp: 0.03 },
  np_neon:     { xp: 0.05 },
  np_gold:     { coin: 0.04 },                  // 황금 = 돈
  np_ruby:     { streak: 0.25 },                // 연승 보너스 1.25배
  np_crystal:  { xp: 0.08 },
  np_daily:    {},                              // 출석 +50 은 따로 처리
  np_obsidian: { coin: 0.06 },                  // 최고가지만 과하지 않게
  np_lv50:     { coin: 0.03, xp: 0.03 },        // 마일스톤 — 양쪽 조금씩
  np_shard:    { shard: 0.10 },                 // 파편으로 산 명패 = 파편이 더 붙는다
  np_hwatu:    { coin: 0.05 },                  // 화투 = 판돈 — 돈 쪽으로
};

// 명패 효과를 사람이 읽을 문구로. 화면에 따로 적어 두면 값을 손댈 때 어긋난다 —
// 실제로 쓰는 표(PLATE_FX)에서 그대로 만들어 내려보낸다.
const FX_LABEL = { coin: '골드 획득', xp: '경험치', shard: '파편 획득', streak: '연승 보너스' };
function plateFxText(id) {
  const fx = Object.prototype.hasOwnProperty.call(PLATE_FX, id) ? PLATE_FX[id] : null;
  if (!fx) return null;
  const parts = [];
  for (const k of ['coin', 'xp', 'shard', 'streak']) {
    if (!fx[k]) continue;
    parts.push(`${FX_LABEL[k]} +${Math.round(fx[k] * 100)}%`);
  }
  if (id === 'np_daily') parts.push(`출석 +${PLATE_DAILY_BONUS}`);
  return parts.length ? parts.join(' · ') : null;
}

// ── 세트 보너스 ────────────────────────────────────────────────────────────
// 카드백·명패·테이블·카드앞면을 같은 테마로 맞춰 끼면 덤이 붙는다.
// 모으는 값어치를 만들되, 한 벌 값이 비싸므로 덤은 작게 잡았다.
const SETS = {
  crystal:  { back: 'back_crystal',  plate: 'np_crystal',  table: 'tbl_crystal',  face: 'face_crystal',  name: '크리스탈' },
  obsidian: { back: 'back_obsidian', plate: 'np_obsidian', table: 'tbl_obsidian', face: 'face_obsidian', name: '흑요석' },
  hanji:    { back: 'back_hanji',    plate: 'np_hanji',    table: 'tbl_hanji',    face: 'face_hanji',    name: '한지' },
  shard:    { back: 'back_shard',    plate: 'np_shard',    table: 'tbl_shard',    face: 'face_shard',    name: '파편' },
  hwatu:    { back: 'back_hwatu',    plate: 'np_hwatu',    table: 'tbl_hwatu',    face: 'face_hwatu',    name: '화투' },
};
const SET_BONUS = { coin: 0.03, xp: 0.03 };

// 지금 장착한 것으로 완성된 세트가 있으면 그 키를 돌려준다
function setOf(u) {
  for (const [key, s] of Object.entries(SETS))
    if (u.cardBack === s.back && u.plate === s.plate && u.table === s.table && u.cardFace === s.face) return key;
  return null;
}

// 이 계정에 걸려 있는 보상 배율 — 명패 + 세트를 합친 값
function bonusOf(u) {
  const p = (u.plate && Object.prototype.hasOwnProperty.call(PLATE_FX, u.plate)) ? PLATE_FX[u.plate] : {};
  const set = setOf(u);
  return {
    coin: (p.coin || 0) + (set ? SET_BONUS.coin : 0),
    xp: (p.xp || 0) + (set ? SET_BONUS.xp : 0),
    streak: p.streak || 0,
    shard: p.shard || 0,        // 뽑기 중복으로 받는 파편에 붙는다
    set,
    setName: set ? SETS[set].name : null,
  };
}


// ── 뽑기 ───────────────────────────────────────────────────────────────────
// 원칙
//  · 뽑기 결과는 전부 서버에서만 정한다. 클라이언트는 "뽑았다" 는 요청만 보낸다.
//  · 확률을 화면에 표시해야 한다(게임산업법·구글 정책). 그래서 GACHA_RATE 를
//    그대로 내려보내 UI 가 같은 값을 쓰게 한다 — 코드와 표시가 어긋날 여지를 없앤다.
//  · 코스메틱 뽑기의 최대 적은 중복이다. 중복은 파편으로 바꿔 주고, 파편을 모으면
//    원하는 것을 확정으로 바꿀 수 있게 해서 "뽑을수록 목표에 가까워지게" 만든다.
// 뽑기 값은 "1회에 기대되는 상점 가치" 에 맞춘다.
// 등급별 평균 상점가 × 출현확률을 더하면 1회당 566코인어치가 나온다.
//   일반 317×59.3% · 고급 764×27.7% · 희귀 1095×9.9% · 전설 1850×3.2%
// 예전엔 300이라 중복을 무시해도 1.9배 남는 장사였다. 그러면 상점에서
// 뭘 사든 손해라서 상점이 통째로 죽는다 — 뽑기만 돌리는 게 늘 정답이 된다.
// 기대값보다 아주 조금 싸게 잡아, 뽑기가 여전히 매력적이되 상점을
// 무의미하게 만들지는 않는 선에 둔다. (원하는 걸 못 고르는 게 그 차액의 값이다)
const GACHA_COST = 500;          // 1회 — 기대 상점가치 566보다 조금 아래
const GACHA_COST10 = 4500;       // 10연 (10% 할인)
const GACHA_RATE = { common: 0.60, rare: 0.28, epic: 0.10, legend: 0.02 };
const SHARD_ON_DUP = { common: 5, rare: 15, epic: 40, legend: 100 };
const PITY_LEGEND = 50;          // 이 횟수 안에 전설 하나는 반드시

// 파편으로 원하는 것을 확정으로 사는 값. 등급별로 다르다.
//
// 예전엔 등급과 무관하게 300 고정이었는데, 그러면 중복 때 5파편밖에 안 주는
// 일반품을 100파편짜리 전설과 같은 값에 사는 꼴이라 전설 말고는 아무도 안 고른다.
// 일반·고급·희귀 교환이 통째로 죽은 선택지였다.
//
// 그래서 "그 등급 중복 보상의 10배" 로 맞췄다. 전부 보유한 상태에서 1회당
// 기대 파편이 14.2 이므로 뽑기 횟수로 환산하면:
//   일반 3.5회 · 고급 10.6회 · 희귀 28회 · 전설 49회
// 전설이 천장(50회)과 거의 같은 게 핵심이다 —
//   50번 뽑으면 무작위 전설 하나, 700파편을 모으면 원하는 전설 하나.
// 확정으로 고르는 값이 운에 맡기는 값과 같으니 어느 쪽을 택해도 손해가 아니다.
const SHARD_COST = { common: 50, rare: 150, epic: 400, legend: 700 };

// 파편으로만 살 수 있는 것. 코인으로도 못 사고 뽑기에서도 안 나온다.
// 값은 상품 정의의 shard 필드에서 끌어온다 — 두 곳에 적으면 언젠가 어긋난다.
const SHARD_ONLY = {};
for (const id of Object.keys(SHOP)) {
  if (Object.prototype.hasOwnProperty.call(SHOP, id) && SHOP[id].shard > 0) SHARD_ONLY[id] = SHOP[id].shard;
}

// 어떤 상품이 어느 등급인지. 여기 없는 상품은 뽑기에 안 나온다
// (닉네임 변경권·확정권처럼 기능성인 것, 마일스톤 한정품).
const GACHA_TIER = {
  common: ['np_wood', 'tbl_forest', 'tbl_blue', 'stamp_win', 'place_dust', 'ava_rookie'],
  rare:   ['back_night', 'back_ruby', 'back_hanji', 'face_neon', 'face_classic',
           'tbl_purple', 'tbl_hanji', 'np_neon', 'np_hanji',
           'stamp_seal', 'place_spark', 'ava_gambler', 'ava_fox', 'vfx_confetti'],
  epic:   ['back_obang', 'back_galaxy', 'back_crystal', 'face_gold', 'face_crystal',
           'tbl_gold', 'tbl_crystal', 'np_gold', 'np_ruby', 'np_crystal',
           'back_hwatu', 'tbl_hwatu', 'np_hwatu',
           'emote_party', 'emote_animal', 'emote_battle', 'emote_taunt',
           'stamp_star', 'place_ember', 'ava_dealer', 'ava_cat', 'vfx_coinrain', 'vfx_thunder'],
  legend: ['back_obsidian', 'face_obsidian', 'tbl_obsidian', 'np_obsidian', 'face_hwatu',
           'stamp_crown', 'ava_king', 'ava_phantom', 'vfx_firework'],
};
const TIERS = ['common', 'rare', 'epic', 'legend'];
// 상품 → 등급 역인덱스
const TIER_OF = {};
for (const t of TIERS) for (const id of GACHA_TIER[t]) TIER_OF[id] = t;

// 천장을 포함한 "실제로 나오는" 확률.
// 기본 확률만 적으면 표시와 실제가 어긋난다 — 천장이 전설을 끌어올리고
// 그만큼 나머지 등급이 줄기 때문이다(실측 전설 2% → 3.03%).
// 확률 표시는 실제 값이어야 하므로, 천장 카운터를 상태로 두고 정확히 계산한다.
function effectiveRates() {
  const p = GACHA_RATE.legend;
  // 천장 카운터가 k 일 때 다음 뽑기에서 전설이 나올 확률 → 정상 상태 분포를 구한다
  // 한 번의 전설 사이 평균 뽑기 횟수
  let expected = 0, surv = 1;
  for (let k = 1; k < PITY_LEGEND; k++) { expected += k * p * surv; surv *= (1 - p); }
  expected += PITY_LEGEND * surv;                 // 49번 안 나오면 50번째는 확정
  const legend = 1 / expected;                    // 전설이 차지하는 실제 비율
  const restShare = 1 - legend;                   // 나머지 등급이 나눠 가질 몫
  const baseRest = 1 - p;                         // 기본 확률에서 전설을 뺀 몫
  const out = {};
  for (const t of TIERS) out[t] = t === 'legend' ? legend : (GACHA_RATE[t] / baseRest) * restShare;
  return out;
}
const EFFECTIVE = effectiveRates();

// 화면에 띄울 확률표 — 서버가 쥔 값을 그대로 내보내 표시와 실제가 어긋날 수 없게 한다
function gachaInfo() {
  return {
    cost: GACHA_COST, cost10: GACHA_COST10,
    exchange: SHARD_COST.legend, pity: PITY_LEGEND,   // exchange = 가장 비싼 값(요약 표시용)
    rates: TIERS.map((t) => ({
      tier: t,
      rate: EFFECTIVE[t],          // 화면에 적는 값 = 천장까지 반영한 실제 확률
      baseRate: GACHA_RATE[t],     // 천장을 빼면 이 값 (참고용)
      shard: SHARD_ON_DUP[t],
      cost: SHARD_COST[t],         // 파편으로 확정 구매하는 값
      count: GACHA_TIER[t].filter((id) => Object.prototype.hasOwnProperty.call(SHOP, id)).length,
    })),
    // 교환소에 늘어놓을 목록. 무엇이 얼마인지는 서버가 정하고 화면은 그리기만 한다.
    // 파편 전용품을 앞에 둔다 — 여기서만 얻을 수 있으니 제일 먼저 보여야 한다.
    pool: [
      ...Object.keys(SHARD_ONLY).map((id) => ({
        id, tier: 'only', cost: SHARD_ONLY[id],
        name: SHOP[id].name, icon: SHOP[id].icon, only: true,
      })),
      ...TIERS.flatMap((t) => GACHA_TIER[t]
        .filter((id) => Object.prototype.hasOwnProperty.call(SHOP, id))
        .map((id) => ({ id, tier: t, cost: SHARD_COST[t], name: SHOP[id].name, icon: SHOP[id].icon }))),
    ],
  };
}

function pickTier(rand) {
  let acc = 0;
  for (const t of TIERS) { acc += GACHA_RATE[t]; if (rand < acc) return t; }
  return 'common';
}

// 한 번 뽑는다. 이미 가진 것이면 파편으로 바꾼다.
function rollOne(u) {
  // 천장 — 이만큼 뽑도록 전설이 안 나왔으면 이번엔 전설
  u.gachaCount = (u.gachaCount || 0) + 1;
  u.sinceLegend = (u.sinceLegend || 0) + 1;
  let tier = (u.sinceLegend >= PITY_LEGEND) ? 'legend' : pickTier(Math.random());
  // 그 등급에 실제로 존재하는 상품만 후보로 (카탈로그에서 지운 게 있어도 안전하게)
  let pool = GACHA_TIER[tier].filter((id) => Object.prototype.hasOwnProperty.call(SHOP, id));
  if (!pool.length) { tier = 'common'; pool = GACHA_TIER.common.filter((id) => Object.prototype.hasOwnProperty.call(SHOP, id)); }
  if (!pool.length) return null;
  const id = pool[Math.floor(Math.random() * pool.length)];
  if (tier === 'legend') u.sinceLegend = 0;

  u.items = u.items || {};
  const dup = !!u.items[id];
  if (dup) {
    // 파편 명패를 차고 있으면 중복 파편이 더 붙는다. 올림이라 0이 되진 않는다.
    const base = SHARD_ON_DUP[tier] || 5;
    const sh = base + Math.round(base * (bonusOf(u).shard || 0));
    u.shards = (u.shards || 0) + sh;
    return { id, tier, dup: true, shard: sh, name: SHOP[id].name, icon: SHOP[id].icon };
  }
  u.items[id] = true;
  return { id, tier, dup: false, shard: 0, name: SHOP[id].name, icon: SHOP[id].icon };
}

const gachaLocks = new Set();
function rollGacha(token, count) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const n = Number(count) === 10 ? 10 : 1;              // 1회 또는 10연만
  if (gachaLocks.has(idl)) return { error: '잠시 후 다시 시도해 주세요.' };
  gachaLocks.add(idl);
  try {
    const cost = n === 10 ? GACHA_COST10 : GACHA_COST;
    if ((u.coins || 0) < cost) return { error: `코인이 부족해요. (보유 ${u.coins || 0} / 필요 ${cost})` };
    u.coins -= cost;
    const got = [];
    for (let i = 0; i < n; i++) { const r = rollOne(u); if (r) got.push(r); }
    persist(idl);
    return { ok: true, results: got, spent: cost, profile: profileOf(u) };
  } finally { gachaLocks.delete(idl); }
}

// 파편으로 원하는 것을 확정 교환
function exchangeShard(token, itemId) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  if (!Object.prototype.hasOwnProperty.call(SHOP, itemId)) return { error: '없는 아이템이에요.' };
  const isOnly = Object.prototype.hasOwnProperty.call(SHARD_ONLY, itemId);
  if (!isOnly && !Object.prototype.hasOwnProperty.call(TIER_OF, itemId)) {
    return { error: '파편으로 바꿀 수 없는 아이템이에요.' };
  }
  if (gachaLocks.has(idl)) return { error: '잠시 후 다시 시도해 주세요.' };
  gachaLocks.add(idl);
  try {
    u.items = u.items || {};
    if (u.items[itemId] && SHOP[itemId].type !== 'pipette') return { error: '이미 보유한 아이템이에요.' };
    // 값은 서버가 정한다. 클라이언트가 보낸 값은 쓰지 않는다.
    const cost = isOnly ? SHARD_ONLY[itemId] : SHARD_COST[TIER_OF[itemId]];
    if ((u.shards || 0) < cost) return { error: `파편이 부족해요. (보유 ${u.shards || 0} / 필요 ${cost})` };
    u.shards -= cost;
    // 스포이드는 사는 순간의 색을 담는다 — 담을 색이 없으면 살 이유도 없다
    if (SHOP[itemId].type === 'pipette') {
      if (!u.nickColor) { u.shards += cost; return { error: '지금 담을 색이 없어요. 염색을 먼저 해주세요.' }; }
      u.items[itemId] = (u.items[itemId] || 0) + 1;
      u.dyeSaved = u.nickColor;
    } else {
      u.items[itemId] = true;
    }
    persist(idl);
    return { ok: true, itemId, cost, name: SHOP[itemId].name, profile: profileOf(u),
             saved: SHOP[itemId].type === 'pipette' ? u.dyeSaved : undefined };
  } finally { gachaLocks.delete(idl); }
}

// 염색약 뽑기 풀 (weight 비율)
const DYE_POOL = [
  { key: 'red',     w: 12 }, { key: 'blue',   w: 12 }, { key: 'green', w: 12 },
  { key: 'orange',  w: 12 }, { key: 'purple', w: 12 },
  { key: 'cyan',    w: 10 }, { key: 'pink',   w: 10 }, { key: 'lime',  w: 10 },
  { key: 'gold',    w: 8 },
  { key: 'rainbow', w: 2 },
];
function rollDye() {
  const total = DYE_POOL.reduce((s, d) => s + d.w, 0);
  let x = Math.random() * total;
  for (const d of DYE_POOL) { x -= d.w; if (x <= 0) return d.key; }
  return 'red';
}
const RARE_DYES = ['cyan', 'pink', 'lime'];   // 희귀 등급 (레벨20 확정권)
function rollRareDye() { return RARE_DYES[Math.floor(Math.random() * RARE_DYES.length)]; }

// ── 레벨 마일스톤 보상 (최초 1회) ──
const MILESTONES = {
  10: { icon: '🪙', label: 'Lv.10 달성 — 코인 300', coins: 300 },
  20: { icon: '💎', label: 'Lv.20 달성 — 희귀 염색약 확정권', ticket: 'dye_rare_ticket' },
  50: { icon: '🎖️', label: 'Lv.50 달성 — 한정판 명패', plate: 'np_lv50' },
};
// 레벨업 보상 — 오른 레벨 하나당 (레벨 × 30) 코인.
// 예전엔 Lv10·20·50 에서만 뭘 줘서, 그 사이 구간은 올라도 아무 일이 없었다.
// 경험치가 값어치를 가져야 경험치 명패도 고를 이유가 생긴다.
const LEVELUP_COIN = 30;
function grantLevelCoins(u, fromLevel, toLevel) {
  let total = 0;
  for (let lv = fromLevel + 1; lv <= toLevel; lv++) total += lv * LEVELUP_COIN;
  if (total > 0) u.coins = (u.coins || 0) + total;
  return total;
}

function grantMilestones(u) {
  u.milestones = u.milestones || {};
  const level = levelOf(u.xp);
  const got = [];
  for (const key of Object.keys(MILESTONES)) {
    const lv = +key;
    if (level < lv || u.milestones[lv]) continue;   // 미도달 or 이미 수령
    u.milestones[lv] = true;
    const m = MILESTONES[lv];
    if (m.coins) u.coins = (u.coins || 0) + m.coins;
    if (m.ticket) { u.items = u.items || {}; u.items[m.ticket] = (u.items[m.ticket] || 0) + 1; }
    if (m.plate) { u.items = u.items || {}; u.items[m.plate] = true; }   // 인벤토리 지급 (상점서 장착)
    got.push({ level: lv, icon: m.icon, label: m.label });
  }
  return got;
}
function shopList() {
  return Object.entries(SHOP).map(([id, it]) => {
    const out = { id, ...it };
    if (it.type === 'plate') out.fxText = plateFxText(id);   // 명패 효과 (표에서 그대로)
    return out;
  });
}
const buyLocks = new Set();   // 재화 처리 재진입(중복 구매) 방지 락
function buyItem(token, itemId) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  if (buyLocks.has(idl)) return { error: '잠시 후 다시 시도해 주세요.' };   // 락 획득
  buyLocks.add(idl);
  try {
    return doBuy(idl, u, itemId);
  } finally { buyLocks.delete(idl); }
}
function doBuy(idl, u, itemId) {
  if (!Object.prototype.hasOwnProperty.call(SHOP, itemId)) return { error: '없는 상품이에요.' };
  const it = SHOP[itemId]; if (!it) return { error: '없는 상품이에요.' };
  u.items = u.items || {}; u.coins = u.coins || 0;
  // 희귀 염색약 확정권 사용 (레벨20 보상 티켓 소모)
  if (it.type === 'dye_rare') {
    if (!(u.items.dye_rare_ticket > 0)) return { error: '희귀 염색약 확정권이 없어요.' };
    u.items.dye_rare_ticket--;
    const dye = rollRareDye(); u.nickColor = dye;
    persist(idl);
    return { ok: true, profile: profileOf(u), dye };
  }
  if (it.milestone) return { error: '레벨 보상으로만 얻을 수 있어요.' };   // 마일스톤 아이템은 구매 불가
  if (it.shard > 0) return { error: '파편으로만 얻을 수 있어요. (뽑기 → 교환소)' };   // 파편 전용
  if ((it.type === 'cardback' || it.type === 'emotes' || it.type === 'plate' || it.type === 'table' || it.type === 'cardface') && u.items[itemId]) return { error: '이미 보유한 아이템이에요.' };
  if (u.coins < it.price) return { error: `코인이 부족해요. (보유 ${u.coins} / 필요 ${it.price})` };
  u.coins -= it.price;
  let dye = null;
  if (it.type === 'dye') { dye = rollDye(); u.nickColor = dye; }                 // 즉시 발라짐
  else if (it.type === 'ticket') u.items[itemId] = (u.items[itemId] || 0) + 1;   // 소모권 적립
  else {
    u.items[itemId] = true;                                                     // 사면 바로 장착
    if (it.type === 'cardback') u.cardBack = itemId;
    if (it.type === 'plate') u.plate = itemId;
    if (it.type === 'table') u.table = itemId;
    if (it.type === 'cardface') u.cardFace = itemId;
  }
  persist(idl);
  return { ok: true, profile: profileOf(u), dye };
}
// 장착·해제 (itemId=null이면 kind 슬롯 해제)
const SLOT = {
  cardback: 'cardBack', plate: 'plate', table: 'table', cardface: 'cardFace',
  victory: 'victoryFx',   // 이길 때 터지는 화면 효과
  avatar:  'avatar',      // 프로필 그림
  stamp:   'winStamp',    // 낙찰 도장 모양
  place:   'placeFx',     // 카드를 내려놓을 때 파티클
};
function equipItem(token, itemId, kind) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  if (itemId) {
    const it = SHOP[itemId];
    if (!it || !SLOT[it.type] || !(u.items || {})[itemId]) return { error: '보유하지 않은 아이템이에요.' };
    u[SLOT[it.type]] = itemId;
  } else if (SLOT[kind]) {
    u[SLOT[kind]] = null;
  }
  persist(idl);
  return { ok: true, profile: profileOf(u) };
}
// 칭호 장착 (titleId=null이면 해제)
function equipTitle(token, titleId) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  if (titleId && !(Object.prototype.hasOwnProperty.call(u.titles || {}, titleId) && u.titles[titleId])) return { error: '아직 획득하지 못한 칭호예요.' };
  u.title = titleId || null;
  persist(idl);
  return { ok: true, profile: profileOf(u) };
}

// ── 카카오 간편로그인 ──
// 겹치지 않는 닉네임 만들기 (카카오 닉 그대로 → 겹치면 #2, #3…)
function uniqueNick(base) {
  let nick = String(base || '플레이어').trim().slice(0, 12) || '플레이어';
  if (!db.nickTaken[nick.toLowerCase()]) return nick;
  for (let i = 2; i < 1000; i++) {
    const n = nick.slice(0, 9) + '#' + i;
    if (!db.nickTaken[n.toLowerCase()]) return n;
  }
  return 'P' + (Date.now() % 1000000);
}
// kakaoId(카카오 회원번호)로 계정 찾기 — 없으면 자동 가입
// 소셜 로그인 공통 (provider: 'kakao'|'google', extId: 소셜 고유번호) — 없으면 자동 가입
function socialLogin(provider, extId, extNick) {
  const idl = provider + '_' + String(extId);
  let u = db.users[idl];
  if (!u) {
    const nick = uniqueNick(extNick);
    u = { id: idl, nick, nickSet: false, provider, token: makeToken(), tokenExp: Date.now() + TOKEN_TTL, wins: 0, losses: 0, xp: 0, rp: 0, createdAt: Date.now() };   // 닉은 첫 로그인 모달에서 확정
    grantFounder(u);
    db.users[idl] = u; db.nickTaken[nick.toLowerCase()] = idl; tokenIndex[u.token] = idl; persist(idl);
    return { ok: true, token: u.token, profile: profileOf(u), isNew: true };
  }
  if (u.token) delete tokenIndex[u.token];
  u.token = makeToken(); u.tokenExp = Date.now() + TOKEN_TTL;
  tokenIndex[u.token] = idl; persist(idl);
  return { ok: true, token: u.token, profile: profileOf(u) };
}
function kakaoLogin(kakaoId, kNick)   { return socialLogin('kakao', kakaoId, kNick); }
function googleLogin(googleId, gNick) { return socialLogin('google', googleId, gNick); }

// 랭킹 (RP 상위)
function topPlayers(limit = 100) {
  return Object.values(db.users)
    .sort((a, b) => (b.rp - a.rp) || (b.wins - a.wins))
    .slice(0, Math.min(limit, 100))
    .map((u, i) => { const p = profileOf(u); return { no: i + 1, nick: p.nick, nickColor: p.nickColor, plate: p.plate, titleInfo: p.titleInfo, level: p.level, rank: p.rank, rankIcon: p.rankIcon, rankColor: p.rankColor, rp: p.rp, wins: p.wins, losses: p.losses }; });
}

// ── 보상 테이블 ──
// 코인: 전문가 AI가 압도적 / RP: 멀티 전용 (AI 농사 방지) / XP: 난이도 차등
// 보상 테이블 (기획서 기준) — 클라이언트 값 신뢰 금지, 전량 서버 계산
const REWARDS = {
  ai_easy:   { win: { coins: 5,  xp: 5 },  loss: { coins: 0,  xp: 0 }, draw: { coins: 0,  xp: 3 } },
  ai_hard:   { win: { coins: 15, xp: 10 }, loss: { coins: 0,  xp: 3 }, draw: { coins: 5,  xp: 5 } },
  ai_expert: { win: { coins: 40, xp: 20 }, loss: { coins: 5,  xp: 5 }, draw: { coins: 15, xp: 10 } },
  multi:     { win: { coins: 60, xp: 50, rp: 25 }, loss: { coins: 25, xp: 20, rp: -13 }, draw: { coins: 25, xp: 15, rp: 0 } },
};
function rewardKey(vsBot, difficulty) {
  if (!vsBot) return 'multi';
  if (difficulty === 'expert') return 'ai_expert';
  if (difficulty === 'easy') return 'ai_easy';
  return 'ai_hard';   // normal/hard 둘 다 중간 취급
}

const DAILY_LOGIN = 30;        // 1일 접속 보상
const FIRST_WIN_BONUS = 100;   // 하루 첫 승 보너스 (PvP승 or 전문가 AI승)
const PLATE_DAILY_BONUS = 50;  // 🍀 행운의 명패 착용 시 출석 추가
// 진행 조건 필터 — 이보다 짧으면 "판을 돌리기만 한 것"으로 보고 보상을 안 준다.
// 60초였는데 실제 판이 대부분 그 아래라 정상적으로 끝낸 판까지 걸렸다.
// 턴 수(5턴) 쪽이 이미 즉시 포기를 막고 있으므로 시간 기준은 30초로 낮춘다.
const MIN_TURNS = 5, MIN_PLAYTIME = 30;
const MATCH_LIMIT = 3;         // 같은 상대와 하루 보상 인정 판수
// 미접속 RP 감소 — 단·ACE 에만 건다.
// 급수는 "한 번 오르면 안 내려간다" 가 원칙이라 여기서 깎으면 규칙이 어긋난다.
// 등급 자체는 RP 와 별개로 저장되므로, 깎여도 단이 내려가진 않는다 —
// 다만 ACE 자리다툼과 다음 승단 자격에는 그대로 반영된다.
const DECAY_DAYS = 3, DECAY_PER_DAY = 10;
const PLATE_RP_WEIGHT = 10;    // 플래티넘(500+) 3연승 이상 RP 가중치

// ── 시간 (KST 자정 기준) ──
const KST = 9 * 3600 * 1000;
function kstDayIndex(ts = Date.now()) { return Math.floor((ts + KST) / 86400000); }   // KST 기준 일 인덱스(정수)
function todayStr() { const d = new Date(Date.now() + KST); return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate(); }

// ── 매치 로그 (자만추/저격 방지) — 같은 두 유저 하루 판수 카운트 (인메모리) ──
const matchLogs = new Map();   // match_key → { day, count }
function matchKey(a, b) { return [String(a).toLowerCase(), String(b).toLowerCase()].sort().join('__'); }
function bumpMatchCount(a, b) {
  const mk = matchKey(a, b), day = kstDayIndex();
  let e = matchLogs.get(mk);
  if (!e || e.day !== day) e = { day, count: 0 };
  e.count++; matchLogs.set(mk, e);
  return e.count;
}
setInterval(() => { const day = kstDayIndex(); for (const [k, e] of matchLogs) if (e.day !== day) matchLogs.delete(k); }, 3600000);

// ── 칭호 (조건 달성 시 자동 획득) ──
// 칭호는 지표마다 세 단계다. 하나를 달성해도 다음 목표가 남아 있어야
// "다 모았다" 로 끝나지 않는다. 위로 갈수록 대략 3~5배씩 벌린다.
// goalKey '__never' 는 조건으로 절대 안 풀린다는 뜻 — 수동·쿠폰 지급 전용.
const TITLES = {
  // ── 수동 지급 ──
  t_founder:  { name: '창단 멤버',     icon: '🏛️', color: '#ffd94a', cond: '초기 가입자',          goalKey: '__never',     goal: Infinity },
  t_invite:   { name: '초대 패왕',     icon: '📣', color: '#ff6fae', cond: '단 한 명에게만',        goalKey: '__never',     goal: Infinity },

  // ── 총 승수 ──
  t_tutor:    { name: '새내기 졸업',   icon: '🎓', color: '#7dd87d', cond: '첫 승리',              goalKey: 'wins',        goal: 1 },
  t_win50:    { name: '승리의 맛',     icon: '🏅', color: '#8fe08a', cond: '통산 50승',            goalKey: 'wins',        goal: 50 },
  t_win200:   { name: '승리 수집가',   icon: '⭐', color: '#ffd94a', cond: '통산 200승',           goalKey: 'wins',        goal: 200 },

  // ── 연승 ──
  t_streak:   { name: '연승 제조기',   icon: '🔥', color: '#ffab5e', cond: '5연승 달성',           goalKey: 'bestStreak',  goal: 5 },
  t_streak10: { name: '파죽지세',      icon: '⚡', color: '#ff8a3a', cond: '10연승 달성',          goalKey: 'bestStreak',  goal: 10 },
  t_streak20: { name: '무패의 폭풍',   icon: '❤️‍🔥', color: '#ff5a5a', cond: '20연승 달성',          goalKey: 'bestStreak',  goal: 20 },

  // ── 졸개의 배신 ──
  t_betray:   { name: '배신의 달인',   icon: '⚔️', color: '#ff8a8a', cond: '졸개의 배신 5회',      goalKey: 'betray',      goal: 5 },
  t_betray20: { name: '배신의 화신',   icon: '🌑', color: '#c07a9a', cond: '졸개의 배신 20회',     goalKey: 'betray',      goal: 20 },
  t_betray50: { name: '배신의 군주',   icon: '🃏', color: '#e05a8a', cond: '졸개의 배신 50회',     goalKey: 'betray',      goal: 50 },

  // ── 전문가 AI ──
  t_expert:   { name: '전문가 사냥꾼', icon: '🎯', color: '#ffd94a', cond: '전문가 AI 10승',       goalKey: 'expertWins',  goal: 10 },
  t_expert30: { name: '기계 사냥꾼',   icon: '🔍', color: '#ffc23a', cond: '전문가 AI 30승',       goalKey: 'expertWins',  goal: 30 },
  t_expert100:{ name: '기계 학살자',   icon: '♠️', color: '#e8a020', cond: '전문가 AI 100승',      goalKey: 'expertWins',  goal: 100 },

  // ── 멀티플레이 ──
  t_debut:    { name: '온라인 데뷔',   icon: '🌐', color: '#7ab8ff', cond: '첫 멀티플레이 승리',   goalKey: 'multiWins',   goal: 1 },
  t_multi:    { name: '경매왕',        icon: '👑', color: '#c39bff', cond: '멀티플레이 20승',      goalKey: 'multiWins',   goal: 20 },
  t_multi60:  { name: '경매 제왕',     icon: '🎪', color: '#a86fff', cond: '멀티플레이 60승',      goalKey: 'multiWins',   goal: 60 },

  // ── 출석 ──
  t_daily7:   { name: '성실한 단골',   icon: '📅', color: '#8fe08a', cond: '7일 연속 출석',        goalKey: 'loginStreak', goal: 7 },
  t_daily30:  { name: '개근상',        icon: '🍀', color: '#6fd07a', cond: '30일 연속 출석',       goalKey: 'loginStreak', goal: 30 },
  t_daily100: { name: '터줏대감',      icon: '🌙', color: '#5ab8d8', cond: '100일 연속 출석',      goalKey: 'loginStreak', goal: 100 },

  // ── 레벨 ──
  t_lv10:     { name: '숙련된 승부사', icon: '🎖️', color: '#ffab5e', cond: '레벨 10 달성',         goalKey: 'level',       goal: 10 },
  t_lv25:     { name: '노련한 승부사', icon: '📜', color: '#e0a860', cond: '레벨 25 달성',         goalKey: 'level',       goal: 25 },
  t_lv50:     { name: '완숙한 승부사', icon: '🏁', color: '#f0e0c0', cond: '레벨 50 달성',         goalKey: 'level',       goal: 50 },

  // ── 코인 ──
  t_rich:     { name: '큰손',          icon: '💰', color: '#ffd94a', cond: '코인 2,000 보유',      goalKey: 'coins',       goal: 2000 },
  t_rich5k:   { name: '갑부',          icon: '💎', color: '#ffe27a', cond: '코인 5,000 보유',      goalKey: 'coins',       goal: 5000 },
  t_rich15k:  { name: '재벌',          icon: '🎩', color: '#fff0a8', cond: '코인 15,000 보유',     goalKey: 'coins',       goal: 15000 },

  // ── 누적 판수 ──
  t_vet:      { name: '백전노장',      icon: '🛡️', color: '#c8a86a', cond: '누적 50판 플레이',     goalKey: 'games',       goal: 50 },
  t_vet200:   { name: '천전노장',      icon: '🚩', color: '#b09050', cond: '누적 200판 플레이',    goalKey: 'games',       goal: 200 },
  t_vet500:   { name: '만전노장',      icon: '🎖', color: '#9a7a40', cond: '누적 500판 플레이',    goalKey: 'games',       goal: 500 },

  // ── 싸이클링 (2·3·4·6 으로 한 번씩 낙찰 승리) ──
  t_cycle1:   { name: '사이클 입문',   icon: '🔁', color: '#7ad8c8', cond: '싸이클링 1회 완성',    goalKey: 'cycle',       goal: 1 },
  t_cycle5:   { name: '사이클 장인',   icon: '🔄', color: '#4ec8b8', cond: '싸이클링 5회 완성',    goalKey: 'cycle',       goal: 5 },
  t_cycle20:  { name: '사이클 마스터', icon: '🎊', color: '#2fb8a8', cond: '싸이클링 20회 완성',   goalKey: 'cycle',       goal: 20 },

  // ── 토너먼트 (8강 · 2인전) ──
  t_tour1:    { name: '토너먼트 우승',   icon: '🏆', color: '#ffd94a', cond: '토너먼트 우승 1회',   goalKey: 'tourWins',    goal: 1 },
  t_tour5:    { name: '토너먼트 강자',   icon: '🥇', color: '#ffc93a', cond: '토너먼트 우승 5회',   goalKey: 'tourWins',    goal: 5 },
  t_tour20:   { name: '무관의 제왕',     icon: '👑', color: '#ffb62a', cond: '토너먼트 우승 20회',  goalKey: 'tourWins',    goal: 20 },
};
function statOf(u, key) {
  if (key === 'wins') return u.wins || 0;
  if (key === 'level') return levelOf(u.xp);
  if (key === 'coins') return u.coins || 0;
  if (key === 'games') return (u.wins || 0) + (u.losses || 0);
  if (key === 'loginStreak') return u.loginStreak || 0;
  return (u.stats || {})[key] || 0;
}
function checkTitles(u) {   // 새로 획득한 칭호 목록 반환
  u.titles = u.titles || {};
  const newly = [];
  for (const [id, t] of Object.entries(TITLES)) {
    if (!u.titles[id] && statOf(u, t.goalKey) >= t.goal) {
      u.titles[id] = true;
      newly.push({ id, name: t.name, icon: t.icon });
    }
  }
  return newly;
}

// ── 일일 미션 (자동 수령) — 8종 풀에서 매일 3개 로테이션 ──
const MISSIONS = {
  m_play3:   { name: '아무 대전 3판 플레이',   goal: 3, reward: 30, ev: 'play' },
  m_play5:   { name: '아무 대전 5판 플레이',   goal: 5, reward: 50, ev: 'play' },
  m_win1:    { name: '1승 거두기',             goal: 1, reward: 40, ev: 'win' },
  m_win3:    { name: '3승 거두기',             goal: 3, reward: 80, ev: 'win' },
  m_multi1:  { name: '멀티플레이 1판',         goal: 1, reward: 50, ev: 'multi_play' },
  m_expert1: { name: '전문가 AI와 1판',        goal: 1, reward: 40, ev: 'expert_play' },
  m_streak2: { name: '2연승 달성하기',         goal: 1, reward: 60, ev: 'streak2' },
  m_betray:  { name: '졸개의 배신 성공하기',   goal: 1, reward: 80, ev: 'betray' },
};
// 오늘의 미션 3개 — 날짜 시드로 결정 (모든 유저 동일, 매일 교체)
function dailyMissionIds() {
  const keys = Object.keys(MISSIONS);
  let seed = kstDayIndex();
  const pick = [];
  const pool = keys.slice();
  for (let i = 0; i < 3 && pool.length; i++) {
    seed = (seed * 48271 + 11) % 2147483647;             // 단순 LCG
    pick.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return pick;
}
function missionState(u) {   // 날짜 바뀌면 자동 리셋 + 오늘의 미션 세트 배정
  const day = todayStr();
  if (!u.missions || u.missions.day !== day) u.missions = { day, set: dailyMissionIds(), prog: {}, claimed: {} };
  if (!u.missions.set) u.missions.set = dailyMissionIds();   // 구버전 데이터 마이그레이션
  return u.missions;
}
// 진행도 +1. 목표를 채우면 "완료" 로 표시만 하고 코인은 주지 않는다 —
// 수령은 미션 창에서 직접 누른다(claimMission). 예전엔 즉시 지급이라
// 판이 끝나는 순간 코인이 슬쩍 늘어 있어서 뭘로 받았는지 알기 어려웠다.
// 반환값은 "이번에 새로 완료된 것" 이다(이미 완료된 건 다시 안 알린다).
function missionEvent(u, ev) {
  const m = missionState(u); const done = [];
  for (const id of m.set) {
    const def = MISSIONS[id]; if (!def) continue;
    if (def.ev !== ev) continue;
    const was = (m.prog[id] || 0) >= def.goal;
    if (was) continue;                                   // 이미 다 찼으면 더 안 센다
    m.prog[id] = Math.min((m.prog[id] || 0) + 1, def.goal);
    if (m.prog[id] >= def.goal) done.push({ id, name: def.name, reward: def.reward });
  }
  return done;
}
// 게임 도중 발생한 이벤트(졸개의 배신)는 게임 종료 보상에 합쳐서 알림
function betrayEvent(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return;
  u.stats = u.stats || {}; u.stats.betray = (u.stats.betray || 0) + 1;
  const pend = u._pend = u._pend || { missions: [], titles: [] };
  pend.missions.push(...missionEvent(u, 'betray'));
  pend.titles.push(...checkTitles(u));
  persist(idl);
}
// ── 싸이클링 (일일퀘스트) ──────────────────────────────────────────────────
// 오늘 2·3·4·6 세트로 각각 한 번씩 우승하면 완성. 야구의 싸이클링 안타에서 따왔다.
//
// 매일 0시(KST)에 초기화된다 — 진행 상태를 미션 상태 안에 두어 날짜가 바뀌면
// 미션들과 함께 통째로 리셋되게 했다. 따로 관리하면 리셋 시점이 어긋난다.
//
// 6 세트는 23장이 필요해 가장 어렵다. 하루 안에 넷을 다 채우려면 노려서
// 덱을 짜야 하므로, 다른 일일미션(30~80코인)보다 훨씬 크게 준다.
const CYCLE_KINDS = [2, 3, 4, 6];
const CYCLE_REWARD = 400;
const CYCLE_ID = 'm_cycle';

// 오늘 어떤 종류로 이겼는지
function cycleProgress(u) {
  const got = (u && u.missions && u.missions.cycle) || {};
  return CYCLE_KINDS.map((k) => ({ kind: k, done: !!got[k] }));
}
const cycleCount = (u) => cycleProgress(u).filter((x) => x.done).length;

// 세트 우승 한 건을 기록한다. 넷이 다 차면 오늘치 보상.
// setKind 가 2·3·4·6 이 아니면(무승부·진행도 판정 등) 아무 일도 안 한다.
function cycleWin(u, setKind) {
  const k = Number(setKind);
  if (!CYCLE_KINDS.includes(k)) return null;
  const m = missionState(u);          // 날짜가 바뀌었으면 여기서 리셋된다
  m.cycle = m.cycle || {};
  if (m.cycleDone) return null;                // 오늘치는 이미 완성했다
  const fresh = !m.cycle[k];
  m.cycle[k] = true;
  const got = cycleCount(u);
  if (got < CYCLE_KINDS.length) {
    return { kind: k, fresh, done: false, got, total: CYCLE_KINDS.length,
             progress: cycleProgress(u) };
  }
  // 완성. 코인은 여기서 주지 않는다 — 미션 창에서 수령한다.
  // 칭호용 누적은 "해냈다" 는 기록이라 수령과 무관하게 여기서 올린다.
  m.cycleDone = true;
  u.stats = u.stats || {};
  u.stats.cycle = (u.stats.cycle || 0) + 1;    // 칭호용 누적 (초기화 안 됨)
  return { kind: k, fresh, done: true, amount: CYCLE_REWARD, total: u.stats.cycle,
           got, progress: cycleProgress(u) };
}

// 튜토리얼 완료 보상 — 코인 100 (플래그로 1회만)
function claimTutorial(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  if (u.tutorialDone) return { claimed: false, profile: profileOf(u) };
  u.tutorialDone = true;
  u.coins = (u.coins || 0) + TUTORIAL_COINS;
  persist(idl);
  return { claimed: true, amount: TUTORIAL_COINS, profile: profileOf(u) };
}
// 미션 현황 (클라 표시용)
function missionList(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const m = missionState(u);
  // done(다 채움) 과 claimed(수령함) 은 다르다. 화면이 "수령" 버튼을 띄울지
  // 판단하려면 둘 다 필요하다.
  const list = m.set.filter(id => MISSIONS[id]).map(id => { const def = MISSIONS[id];
    const prog = Math.min(m.prog[id] || 0, def.goal);
    return { id, name: def.name, goal: def.goal, reward: def.reward,
             prog, done: prog >= def.goal, claimed: !!m.claimed[id] };
  });
  // 싸이클링은 매일 고정으로 붙는다 (무작위 3개와 별개).
  // 진행도를 숫자 하나로 줄이면 "어느 종류가 남았는지" 를 못 보여주므로
  // 종류별 상태를 같이 내려보낸다.
  const cGot = cycleCount(u);
  list.push({
    id: CYCLE_ID, name: '싸이클링 — 네 종류 모두 우승',
    goal: CYCLE_KINDS.length, reward: CYCLE_REWARD,
    prog: cGot, done: cGot >= CYCLE_KINDS.length, claimed: !!m.claimed[CYCLE_ID],
    cycle: cycleProgress(u),
  });
  return { ok: true, list };
}

// ══════════════════════════════════════════════════════════
//  토너먼트 참가비·상금
// ══════════════════════════════════════════════════════════
// 돈이 오가므로 금액은 전부 여기서 정한다. 화면이 보낸 값은 쓰지 않는다.
// 참가비는 들어갈 때 한 번 빠지고, 대회가 못 열리면 돌려준다.
const tourLocks = new Set();

function tourEnter(token, fee) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const cost = Number(fee) || 0;
  if (cost <= 0) return { error: '참가비가 올바르지 않아요.' };
  if (tourLocks.has(idl)) return { error: '잠시 후 다시 시도해 주세요.' };
  tourLocks.add(idl);
  try {
    if ((u.coins || 0) < cost) return { error: '코인이 부족해요.' };
    u.coins -= cost;
    persist(idl);
    return { ok: true, coins: u.coins, profile: profileOf(u) };
  } finally { tourLocks.delete(idl); }
}

// 참가비 환불 (정원 미달로 못 열렸거나, 시작 전에 나갔을 때)
function tourRefund(token, fee) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  u.coins = (u.coins || 0) + (Number(fee) || 0);
  persist(idl);
  return { ok: true, coins: u.coins, profile: profileOf(u) };
}

// 상금. 같은 대회에서 두 번 받지 못하게 대회 번호를 적어 둔다 —
// 여기가 새면 상금이 두 번 나간다.
function tourPrize(token, tourId, rank, amount) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const amt = Number(amount) || 0;
  const key = String(tourId || '');
  if (!key) return { error: '대회를 알 수 없어요.' };
  if (!u.tourPaid || typeof u.tourPaid !== 'object') u.tourPaid = {};
  if (Object.prototype.hasOwnProperty.call(u.tourPaid, key)) return { error: '이미 받은 상금이에요.' };
  u.tourPaid[key] = rank;
  // 기록이 무한히 쌓이지 않게 최근 것만 남긴다
  const keys = Object.keys(u.tourPaid);
  if (keys.length > 30) for (const k of keys.slice(0, keys.length - 30)) delete u.tourPaid[k];

  u.stats = u.stats || {};
  if (rank === 1) u.stats.tourWins = (u.stats.tourWins || 0) + 1;
  u.stats.tourPlays = (u.stats.tourPlays || 0) + 1;
  if (amt > 0) u.coins = (u.coins || 0) + amt;
  const titles = checkTitles(u);
  persist(idl);
  return { ok: true, amount: amt, rank, coins: u.coins, titles, profile: profileOf(u) };
}

// ── 미니게임 코인 ─────────────────────────────────────────
// 판에 거는 돈은 걸 때마다 바로 빠지고, 이긴 사람이 판돈을 받는다.
// 중간에 창을 닫아도 이미 빠진 돈은 그대로다 — 지는 판에서 도망쳐도 이득이 없다.
// 금액은 서버(server.js)가 규칙에서 계산한 값만 넘긴다.
const miniLocks = new Set();
function miniStake(token, amount) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const cost = Math.floor(Number(amount) || 0);
  if (cost <= 0) return { error: '금액이 올바르지 않아요.' };
  if (miniLocks.has(idl)) return { error: '잠시 후 다시 시도해 주세요.' };
  miniLocks.add(idl);
  try {
    if ((u.coins || 0) < cost) return { error: '코인이 부족해요.' };
    u.coins -= cost;
    persist(idl);
    return { ok: true, coins: u.coins };
  } finally { miniLocks.delete(idl); }
}

// won 이 null 이면 전적은 안 센다 — 자리에서 일어나며 밑천만 되돌려받는 경우.
function miniPay(token, amount, won) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  u.stats = u.stats || {};
  if (won !== null && won !== undefined) {
    u.stats.miniPlays = (u.stats.miniPlays || 0) + 1;
    if (won) u.stats.miniWins = (u.stats.miniWins || 0) + 1;
  }
  if (amt > 0) u.coins = (u.coins || 0) + amt;
  persist(idl);
  return { ok: true, amount: amt, coins: u.coins, profile: profileOf(u) };
}

// 미션 보상 수령. 서버에서만 판정한다 — 화면이 보낸 금액은 절대 믿지 않는다.
const misLocks = new Set();      // 같은 미션 동시 요청으로 두 번 지급되는 것 방지
function claimMission(token, id) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const key = String(id || '');
  const isCycle = key === CYCLE_ID;
  if (!isCycle && !Object.prototype.hasOwnProperty.call(MISSIONS, key)) return { error: '없는 미션이에요.' };

  const lockKey = idl + '|' + key;
  if (misLocks.has(lockKey)) return { error: '잠시 후 다시 시도해 주세요.' };
  misLocks.add(lockKey);
  try {
    const m = missionState(u);       // 날짜가 바뀌었으면 여기서 리셋된다
    if (m.claimed[key]) return { error: '이미 받았어요.' };

    let reward;
    if (isCycle) {
      if (cycleCount(u) < CYCLE_KINDS.length) return { error: '아직 다 못 채웠어요.' };
      reward = CYCLE_REWARD;
    } else {
      if (!m.set.includes(key)) return { error: '오늘 미션이 아니에요.' };
      const def = MISSIONS[key];
      if ((m.prog[key] || 0) < def.goal) return { error: '아직 다 못 채웠어요.' };
      reward = def.reward;
    }
    m.claimed[key] = true;
    u.coins = (u.coins || 0) + reward;
    persist(idl);
    return { ok: true, id: key, amount: reward, profile: profileOf(u) };
  } finally {
    misLocks.delete(lockKey);
  }
}
// 칭호 현황 (진행도 포함)
function titleList(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  return {
    ok: true, equipped: u.title || null,
    list: Object.entries(TITLES).map(([id, t]) => ({
      id, name: t.name, icon: t.icon, color: t.color, cond: t.cond,
      owned: !!((u.titles || {})[id]), prog: Math.min(statOf(u, t.goalKey), t.goal), goal: t.goal,
    })),
  };
}

// 랭크 감소: 다이아(900RP) 이상이 3일 이상 미접속 시 미접속 일수 × 10 RP 차감
function applyRankDecay(u, todayIdx) {
  const cur = RANKS[rankIndex(u.rank || '10K')] || RANKS[0];
  if (!(u.isAce || cur.tier === 'dan') || u.lastLoginIdx == null) return 0;
  const days = todayIdx - u.lastLoginIdx;
  if (days < DECAY_DAYS) return 0;
  const dec = days * DECAY_PER_DAY;
  u.rp = Math.max(0, u.rp - dec);
  refreshRankState(u);          // 승단 자격이 풀릴 수 있다
  if (aceRelevant(u)) refreshAce();
  return dec;
}
// 1일 접속 보상 (KST 자정 기준, 하루 1회)
function claimDaily(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return null;
  const today = kstDayIndex();
  const decay = applyRankDecay(u, today);   // 접속 전 랭크 감소 정산
  if (u.lastLoginIdx === today) { if (decay) persist(idl); return { claimed: false, decay, profile: profileOf(u) }; }
  // 연속 출석: 어제도 접속했으면 스택+1, 끊기면 1부터 (스택당 +10, 최대 +70 → 총 30~100)
  u.loginStreak = (u.lastLoginIdx === today - 1) ? (u.loginStreak || 1) + 1 : 1;
  u.lastLoginIdx = today;
  const streakBonus = Math.min((u.loginStreak - 1) * 10, 70);
  const plateBonus = u.plate === 'np_daily' ? PLATE_DAILY_BONUS : 0;   // 🍀 행운의 명패
  const amount = DAILY_LOGIN + streakBonus + plateBonus;
  u.coins = (u.coins || 0) + amount;
  const titles = checkTitles(u);   // 연속출석·큰손 등 출석 시점 달성 칭호
  persist(idl);
  return { claimed: true, amount, plateBonus, streak: u.loginStreak, streakBonus, decay, titles, profile: profileOf(u) };
}

// ── 친구 초대 보상 — 초대받은 신규 계정과 초대자 둘 다 +100 (플래그 1회) ──
const REFER_COINS = 100, REFER_CAP = 50;   // 초대자 최대 50회까지 지급
function applyReferral(token, refCode) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  if (u.referredBy) return { error: '이미 초대 보상을 받았어요.' };
  const refl = String(refCode || '').trim().toLowerCase();
  // hasOwnProperty로 조회 — db.users['__proto__'] 등이 Object.prototype을 반환해 오염되는 것 차단
  if (!Object.prototype.hasOwnProperty.call(db.users, refl)) return { error: '유효하지 않은 초대 코드예요.' };
  const ref = db.users[refl];
  if (!ref || refl === idl) return { error: '유효하지 않은 초대 코드예요.' };
  if (Date.now() - (u.createdAt || 0) > 72 * 3600 * 1000) return { error: '가입 3일 이내에만 등록할 수 있어요.' };
  u.referredBy = refl;
  u.coins = (u.coins || 0) + REFER_COINS;
  if ((ref.refCount || 0) < REFER_CAP) {   // 초대자 남용 방지 상한
    ref.refCount = (ref.refCount || 0) + 1;
    ref.coins = (ref.coins || 0) + REFER_COINS;
    persist(refl);
  }
  persist(idl);
  return { ok: true, amount: REFER_COINS, profile: profileOf(u) };
}

// ── 쿠폰 ───────────────────────────────────────────────────────────────────
// 코인을 찍어내는 기능이라 방어를 촘촘히 뒀다.
//  · 코드는 서버가 무작위 생성한다 (추측 불가). 헷갈리는 0/O, 1/I/L 은 뺐다.
//  · 계정당 1회 + 쿠폰별 총 사용 한도. 둘 다 있어야 이벤트/개별보상 양쪽을 덮는다.
//  · 실패 횟수를 계정·IP 로 제한해 무차별 대입을 막는다.
//  · 사용 기록은 Postgres 에 남긴다 — 파일에만 두면 재배포 때 날아가 무한 수령이 된다.

const CPN_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // 0/O, 1/I/L 제외
const CPN_FAIL_USER = 10;        // 계정당 하루 실패 허용
const CPN_FAIL_IP = 20;          // IP당 1시간 실패 허용
const cpnFailUser = new Map();   // idl -> { day, n }
const cpnFailIp = new Map();     // ip  -> { at, n }

function genCouponCode() {
  const g = (n) => Array.from({ length: n }, () => CPN_CHARS[crypto.randomInt(CPN_CHARS.length)]).join('');
  return `${g(4)}-${g(4)}-${g(4)}`;                     // 31^12 ≈ 8×10^17 — 대입 불가능
}
// 하이픈·공백·대소문자를 흘려도 되게 정규화해서 저장·조회한다
const normCoupon = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const prettyCoupon = (c) => (c.match(/.{1,4}/g) || [c]).join('-');

function persistCoupon(code) {
  if (pool && dbReady) {
    pool.query('INSERT INTO ff_coupons(code, data) VALUES($1, $2) ON CONFLICT(code) DO UPDATE SET data = excluded.data',
      [code, JSON.stringify(db.coupons[code])]).catch((e) => console.error('쿠폰 저장 실패:', e.message));
  } else saveFile();
}

// 발행 — 관리자만 (서버에서 환경변수 키로 확인한 뒤 호출한다)
function createCoupons(count, coins, opts = {}) {
  // Number(x) || 기본값 으로 쓰면 0 이 기본값으로 바뀐다.
  // maxUses:0 은 "무제한"이라는 뜻이라 그 0 을 반드시 살려야 한다.
  const intOr = (v, dflt) => { const x = Math.floor(Number(v)); return Number.isFinite(x) ? x : dflt; };

  // 칭호만 주는 쿠폰이면 코인은 0 이어도 된다.
  // hasOwnProperty 로 막지 않으면 '__proto__' 같은 걸 칭호로 넘길 수 있다.
  const title = opts.title ? String(opts.title) : null;
  if (title && !Object.prototype.hasOwnProperty.call(TITLES, title)) return { error: '없는 칭호예요.' };

  const amount = intOr(coins, title ? 0 : NaN);
  if (!Number.isFinite(amount) || amount < 0) return { error: '지급할 코인을 0 이상으로 입력해주세요.' };
  if (!title && amount < 1) return { error: '지급할 코인을 1 이상으로 입력해주세요.' };
  if (amount > 100000) return { error: '한 장에 줄 수 있는 코인은 100,000까지예요.' };

  const n = Math.max(1, Math.min(200, intOr(count, 1)));
  const maxUses = Math.max(0, Math.min(100000, intOr(opts.maxUses, 1)));   // 0 = 무제한
  const days = Math.max(0, intOr(opts.days, 0));
  const expiresAt = days > 0 ? Date.now() + days * 86400000 : null;
  const memo = String(opts.memo || '').slice(0, 60);
  const minLevel = Math.max(0, Math.min(99, intOr(opts.minLevel, 0)));
  // 코드를 직접 정할 수 있다 (예: 초대 패왕처럼 사람에게 직접 건네는 한 장).
  // 직접 정할 땐 한 장만 만든다 — 여러 장이면 코드가 겹친다.
  const want = opts.code ? normCoupon(opts.code) : null;
  if (want) {
    if (want.length < 8 || want.length > 20) return { error: '코드는 영문·숫자 8~20자로 정해주세요.' };
    if (Object.prototype.hasOwnProperty.call(db.coupons, want)) return { error: '이미 있는 코드예요.' };
    if (n > 1) return { error: '코드를 직접 정할 땐 1장만 만들 수 있어요.' };
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    let code = want;
    if (!code) {
      do { code = normCoupon(genCouponCode()); }
      while (Object.prototype.hasOwnProperty.call(db.coupons, code));
    }
    db.coupons[code] = { code, coins: amount, title, maxUses, uses: 0, usedBy: {}, expiresAt, minLevel, memo, createdAt: Date.now() };
    persistCoupon(code);
    out.push(prettyCoupon(code));
  }
  return { ok: true, codes: out, coins: amount, title, maxUses, expiresAt, memo };
}

function couponList() {
  return Object.values(db.coupons)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 300)
    .map((c) => ({
      code: prettyCoupon(c.code), coins: c.coins, uses: c.uses, maxUses: c.maxUses,
      title: c.title || null,
      titleName: c.title && Object.prototype.hasOwnProperty.call(TITLES, c.title) ? TITLES[c.title].name : null,
      expiresAt: c.expiresAt, memo: c.memo, minLevel: c.minLevel, createdAt: c.createdAt,
      dead: (c.maxUses > 0 && c.uses >= c.maxUses) || (c.expiresAt && Date.now() > c.expiresAt),
    }));
}

// 실패 횟수 제한 — 무차별 대입 방어
function cpnTooManyFails(idl, ip) {
  const today = kstDayIndex();
  const fu = cpnFailUser.get(idl);
  if (fu && fu.day === today && fu.n >= CPN_FAIL_USER) return true;
  if (ip) {
    const fi = cpnFailIp.get(ip);
    if (fi && Date.now() - fi.at < 3600000 && fi.n >= CPN_FAIL_IP) return true;
  }
  return false;
}
function cpnNoteFail(idl, ip) {
  const today = kstDayIndex();
  const fu = cpnFailUser.get(idl);
  if (fu && fu.day === today) fu.n++; else cpnFailUser.set(idl, { day: today, n: 1 });
  if (ip) {
    const fi = cpnFailIp.get(ip);
    if (fi && Date.now() - fi.at < 3600000) fi.n++; else cpnFailIp.set(ip, { at: Date.now(), n: 1 });
  }
}

const cpnLocks = new Set();      // 같은 쿠폰 동시 요청으로 두 번 지급되는 것 방지
function redeemCoupon(token, code, ip) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  if (cpnTooManyFails(idl, ip)) return { error: '시도가 너무 많아요. 잠시 후 다시 시도해주세요.' };

  const key = normCoupon(code);
  if (!key || key.length < 8) { cpnNoteFail(idl, ip); return { error: '쿠폰 번호를 확인해주세요.' }; }
  if (!Object.prototype.hasOwnProperty.call(db.coupons, key)) { cpnNoteFail(idl, ip); return { error: '없는 쿠폰이에요.' }; }

  const lockKey = key + '|' + idl;
  if (cpnLocks.has(lockKey)) return { error: '잠시 후 다시 시도해 주세요.' };
  cpnLocks.add(lockKey);
  try {
    const c = db.coupons[key];
    if (c.expiresAt && Date.now() > c.expiresAt) return { error: '기간이 지난 쿠폰이에요.' };
    if (Object.prototype.hasOwnProperty.call(c.usedBy, idl)) return { error: '이미 사용한 쿠폰이에요.' };
    if (c.maxUses > 0 && c.uses >= c.maxUses) return { error: '이미 모두 사용된 쿠폰이에요.' };
    if (c.minLevel && levelOf(u.xp) < c.minLevel) return { error: `레벨 ${c.minLevel} 이상만 쓸 수 있어요.` };

    // 이미 그 칭호를 가진 사람이 또 쓰면 한 장이 헛되이 사라진다.
    // 한 명만 쓸 수 있는 쿠폰이라 더더욱 막아야 한다.
    if (c.title && (u.titles || {})[c.title]) return { error: '이미 가진 칭호예요.' };

    c.usedBy[idl] = Date.now();
    c.uses++;
    if (c.coins) u.coins = (u.coins || 0) + c.coins;
    let title = null;
    if (c.title && Object.prototype.hasOwnProperty.call(TITLES, c.title)) {
      u.titles = u.titles || {};
      u.titles[c.title] = true;
      title = { id: c.title, name: TITLES[c.title].name, icon: TITLES[c.title].icon, color: TITLES[c.title].color };
    }
    persistCoupon(key);
    persist(idl);
    return { ok: true, amount: c.coins, title, profile: profileOf(u) };
  } finally { cpnLocks.delete(lockKey); }
}

// 4인전 온라인 멀티 전용 RP 반영.
// 승/패 전적·코인·XP 는 건드리지 않는다 — 4인전 기록이 2인전 전적에 섞이면 안 되기 때문.
// 어뷰징 판단(사람 수·같은 IP·짧은 판)은 호출부에서 끝내고 여기서는 반영만 한다.
// place 를 주면 순위제 RP 규칙(1위 +25 … 4위 -22)으로 계산한다.
// delta 만 주는 옛 방식도 그대로 받는다 — 호출부를 한 번에 다 못 바꾸므로.
function applyRp4(token, delta, place) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return null;
  const before = u.rp || 0;
  const beforeRankId = u.isAce ? 'ACE' : (u.rank || '10K');

  let promo = null;
  if (place && u.promo) {
    // 승단전 중에는 RP 가 아니라 승단전 전적으로 센다 (1위만 승리로 인정)
    promo = promoResult(u, place === 1);
  } else {
    let d;
    if (place) {
      const won = place === 1;
      const st = won ? (u.winStreak || 0) + 1 : 0;
      d = calcRpDelta(u, 'rank', { place }, st).delta;
      u.winStreak = st;
      u.mmr = ((u.mmr === undefined || u.mmr === null) ? before : u.mmr) + (won ? 20 : -15);
    } else {
      d = Number(delta) || 0;
    }
    u.rp = Math.max(0, before + d);
  }
  refreshRankState(u);
  if (u.promoEligible && !u.promo) { startPromo(u); promo = promo || { started: true,
    wins: 0, losses: 0, need: PROMO.winsNeeded, bestOf: PROMO.bestOf }; }
  if (aceRelevant(u)) refreshAce();
  u.bestRank = bestRankOf(u);
  const afterRankId = u.isAce ? 'ACE' : u.rank;

  persist(idl);
  return { profile: profileOf(u), before, after: u.rp, delta: u.rp - before,
           promo, rankChange: afterRankId !== beforeRankId ? 'up' : null };
}

// 결과 반영 (result: 'win'|'loss'|'draw') → { profile, rewards }
// opts: { vsBot, difficulty, turns, playtimeSec, sameIp, friendly, oppUid }
function recordResult(token, result, opts = {}) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return null;
  const base = (REWARDS[rewardKey(opts.vsBot, opts.difficulty)] || REWARDS.multi)[result] || { coins: 0, xp: 0 };
  const beforeLevel = levelOf(u.xp), beforeRank = displayRankOf(u).name;
  const today = kstDayIndex();

  // ── 어뷰징 필터 (순차 적용) → 걸리면 모든 보상 0, 전적만 기록 ──
  let blocked = false, reason = null;
  // 2. 진행 조건: 너무 짧은 판(턴/시간)은 보상 없음 (솔로·멀티 공통)
  //    단, 탈주 패배는 페널티(RP-13)를 그대로 부과해야 하므로 예외
  const tooShort = (opts.turns || 0) < MIN_TURNS || (opts.playtimeSec || 0) < MIN_PLAYTIME;
  const forfeitLoss = opts.forfeit && result === 'loss';
  const quickBotWin = opts.vsBot && result === 'win';   // AI전 승리는 빨리 이겨도 인정 (실력)
  if (tooShort && !forfeitLoss && !quickBotWin) { blocked = true; reason = 'short'; }
  // 3. 자만추/저격 방지 (PvP 한정)
  //
  // 친선전(비밀번호 방)은 코인·경험치를 준다. 친구끼리 하는 판을 통째로
  // 보상에서 빼면 "친구랑 하면 손해" 가 되어 아무도 안 쓴다.
  // 대신 RP 는 안 준다 — 랭킹은 RP 순서라 짜고 치면 순위가 통째로 망가진다.
  // 코인·경험치는 각자 쌓는 것이라 짜고 쳐도 남에게 피해가 없다.
  // 무한 파밍은 아래 세 겹이 막는다: 5턴·30초 최소 진행, 같은 상대 하루 3판.
  //
  // 같은 IP 는 성격이 다르다. 친구가 아니라 한 사람이 계정 두 개를 돌리는 것에
  // 가깝고, 이건 상대 동의가 필요 없어 무한히 찍어낼 수 있다 — 그대로 막는다.
  const noRpFriendly = !opts.vsBot && !!opts.friendly;
  if (!opts.vsBot && !blocked) {
    if (opts.sameIp) { blocked = true; reason = 'sameip'; }
    else if (opts.oppUid && bumpMatchCount(u.id, opts.oppUid) > MATCH_LIMIT) { blocked = true; reason = 'repeat'; }
  }

  // 전적·연승 갱신 (연승은 PvP승 또는 전문가 AI승만 +1, 패배 시 초기화)
  const winnable = result === 'win' && (!opts.vsBot || opts.difficulty === 'expert');
  if (result === 'win') u.wins++;
  else if (result === 'loss') u.losses++;
  if (winnable) u.winStreak = (u.winStreak || 0) + 1;
  else if (result === 'loss') u.winStreak = 0;

  // 5. AI 고의 패작 필터: AI전 3연패부터 패배 보상 0, 승/무 시 초기화
  if (opts.vsBot) {
    if (result === 'loss') u.aiLossStreak = (u.aiLossStreak || 0) + 1;
    else u.aiLossStreak = 0;
  }

  // 칭호용 통계
  u.stats = u.stats || {};
  if (u.winStreak > (u.stats.bestStreak || 0)) u.stats.bestStreak = u.winStreak;
  if (result === 'win') {
    if (opts.vsBot && opts.difficulty === 'expert') u.stats.expertWins = (u.stats.expertWins || 0) + 1;
    if (!opts.vsBot) u.stats.multiWins = (u.stats.multiWins || 0) + 1;
  }

  // 싸이클링 — 어떤 세트로 이겼는지 모은다. 넷을 다 채우면 400코인.
  // 어뷰징으로 걸린 판(blocked)은 세지 않는다 — 안 그러면 짧은 판을 돌려
  // 세트만 갈아 끼우는 식으로 뚫린다. 세트 우승이 아니면(진행도 판정 등)
  // cycleWin 이 스스로 무시한다.
  let cycle = null;
  if (result === 'win' && !blocked) cycle = cycleWin(u, opts.setKind);

  // 일일 미션 진행 (자동 수령 — 코인 즉시 지급)
  const missions = [];
  missions.push(...missionEvent(u, 'play'));
  if (!opts.vsBot) missions.push(...missionEvent(u, 'multi_play'));
  if (opts.vsBot && opts.difficulty === 'expert') missions.push(...missionEvent(u, 'expert_play'));
  if (result === 'win') missions.push(...missionEvent(u, 'win'));
  if (winnable && u.winStreak === 2) missions.push(...missionEvent(u, 'streak2'));

  // RP 는 랜덤 매칭에서만. 봇매치·아이템전·친선전은 코인·경험치만 준다.
  let coins = base.coins || 0, xp = base.xp || 0;
  // RP 는 급수/단 사다리 규칙으로 계산한다 (MMR 보정 + 연승 보너스).
  // 승단전 중이면 RP 가 아니라 승단전 전적으로 처리하므로 여기서는 0.
  let rp = 0, rpCalc = null;
  const rankable = !opts.vsBot && !opts.noRank && !noRpFriendly && !blocked && base.rp !== undefined;
  if (rankable && !u.promo) {
    // 연승은 위에서 이미 이 판까지 반영됐다 — 그 값을 그대로 쓴다
    rpCalc = calcRpDelta(u, 'winlose', { didWin: result === 'win' }, u.winStreak || 0);
    if (result !== 'draw') rp = rpCalc.delta;
  }
  let firstWin = 0, streak = 0;

  if (blocked) {
    coins = 0; xp = 0; rp = 0;                                  // 어뷰징 → 재화 전량 0
  } else {
    if (opts.vsBot && result === 'loss' && (u.aiLossStreak || 0) >= 3) coins = 0;   // 고의 패작 방지
    if (winnable && u.lastWinIdx !== today) { firstWin = FIRST_WIN_BONUS; u.lastWinIdx = today; }   // 하루 첫 승
    if (winnable && u.winStreak >= 2) streak = Math.min((u.winStreak - 1) * 10, 50);                // 연승 보너스
    // 플래티넘(500+) 양학 방지: 멀티 3연승 이상 시 RP 가중치 +10 → 강자를 빠르게 상위 티어로
    if (!opts.vsBot && !noRpFriendly && result === 'win' && u.winStreak >= 3 && (u.rp || 0) >= 500) rp += PLATE_RP_WEIGHT;
  }
  // 명패 효과 — 루비 명패는 연승 보너스를 더 준다
  const fx = bonusOf(u);
  if (streak > 0 && fx.streak > 0) streak += Math.round(streak * fx.streak);
  coins += firstWin + streak;

  // 명패·세트 보너스 (코인·경험치). 어뷰징으로 막힌 판에는 붙지 않는다.
  let plateCoin = 0, plateXp = 0;
  if (coins > 0 && fx.coin > 0) { plateCoin = Math.round(coins * fx.coin); coins += plateCoin; }
  if (xp > 0 && fx.xp > 0) { plateXp = Math.round(xp * fx.xp); xp += plateXp; }

  // 클랜 보너스 — 클랜장·부클랜장 +10%, 일반 클랜원 +5%.
  // 어뷰징으로 막혀 보상이 0인 판에는 당연히 안 붙는다.
  let clanBonus = 0;
  if (coins > 0) {
    const rate = clanCoinBonus(u);
    if (rate > 0) { clanBonus = Math.round(coins * rate); coins += clanBonus; }
  }

  u.xp += xp;
  u.coins = Math.max(0, (u.coins || 0) + coins);

  // ── 급수/단 사다리 ──
  // 승단전 중이면 RP 가 아니라 승단전 전적으로 처리한다. 그래야 승단전 도중에
  // 등급이 흔들리지 않는다.
  let promo = null, rankChange = null;
  if (rankable) {
    const won = result === 'win';
    if (u.promo) {
      promo = promoResult(u, won);
      if (promo && promo.done) rankChange = promo.passed ? 'up' : 'fail';
    } else if (rp) {
      u.rp = Math.max(0, (u.rp || 0) + rp);
      // MMR 은 RP 와 따로 도는 숨은 실력 점수 — 이기면 +20, 지면 -15
      u.mmr = ((u.mmr === undefined || u.mmr === null) ? (u.rp || 0) : u.mmr) + (won ? 20 : -15);
    }
    const beforeRankId = u.isAce ? 'ACE' : u.rank;
    refreshRankState(u);
    // 자격이 찼으면 다음 랭킹전이 곧 승단전이 된다 — 따로 신청할 필요 없이 바로 붙는다
    if (u.promoEligible && !u.promo) { startPromo(u); promo = promo || { started: true,
      wins: 0, losses: 0, need: PROMO.winsNeeded, bestOf: PROMO.bestOf }; }
    if (aceRelevant(u)) refreshAce();
    const afterRankId = u.isAce ? 'ACE' : u.rank;
    if (!rankChange && afterRankId !== beforeRankId) rankChange = 'up';
    u.bestRank = bestRankOf(u);
  } else if (rp) {
    u.rp = Math.max(0, u.rp + rp);
  }

  // 레벨업 보상 + 마일스톤 (Lv10/20/50 최초 1회) — XP 반영 후 검사
  const lvNow = levelOf(u.xp);
  const levelCoins = grantLevelCoins(u, beforeLevel, lvNow);
  const milestones = grantMilestones(u);

  // 최근 전적 (최대 10)
  u.history = u.history || [];
  // RP 도 같이 남긴다. 코인만 적어 두면 "이 판에서 등급이 얼마나 움직였는지"
  // 를 나중에 알 길이 없다. 랭크가 안 걸린 판은 0 이 아니라 아예 안 적는다 —
  // 0 과 "해당 없음" 은 다르다.
  u.history.unshift({ vs: opts.oppLabel || (opts.vsBot ? 'AI' : '상대'), result, coins,
                      ...(rankable ? { rp } : {}), at: Date.now() });
  if (u.history.length > 10) u.history.length = 10;
  persist(idl);

  // 칭호 획득 체크 + 게임 중 쌓인 알림(_pend, 예: 졸개의 배신) 합치기
  const titles = checkTitles(u);
  if (u._pend) {
    missions.push(...u._pend.missions);
    titles.push(...u._pend.titles.filter(t => !titles.some(x => x.id === t.id)));
    delete u._pend;
  }
  persist(idl);

  const afterLevel = levelOf(u.xp), afterRank = displayRankOf(u).name;
  return {
    profile: profileOf(u),
    rewards: {
      coins, xp, rp, firstWin, streak, clanBonus, plateCoin, plateXp, setName: fx.setName, levelCoins,
      streakCount: u.winStreak, blocked, reason, noRpFriendly,
      levelUp: afterLevel > beforeLevel ? afterLevel : 0,
      rankUp: (afterRank !== beforeRank && rp > 0) ? afterRank : 0,
      missions, titles, milestones, cycle, promo, rankChange, rankInfo: rankInfoOf(u),
    },
  };
}

// 내 랭킹 순위 (RP 기준 1-based)
function myRank(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return null;
  const sorted = Object.values(db.users).sort((a, b) => (b.rp - a.rp) || (b.wins - a.wins));
  const pos = sorted.findIndex(x => x.id.toLowerCase() === u.id.toLowerCase());
  const p = profileOf(u);
  return { no: pos + 1, total: sorted.length, nick: p.nick, nickColor: p.nickColor, plate: p.plate,
    titleInfo: p.titleInfo, rank: p.rank, rankIcon: p.rankIcon, rankColor: p.rankColor,
    rp: p.rp, wins: p.wins, losses: p.losses };
}

// ══════════════════════════════════════════════════════════
//  친구
// ══════════════════════════════════════════════════════════
const MAX_FRIENDS = 50;
const MAX_REQS = 30;

// 친구/요청 배열을 안전하게 꺼낸다 (기존 계정엔 필드가 없으므로 지연 초기화)
function farr(u, key) { if (!Array.isArray(u[key])) u[key] = []; return u[key]; }
function userByNick(nick) {
  const idl = db.nickTaken[String(nick || '').trim().toLowerCase()];
  return idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
}
// 친구 목록에 넣을 요약 정보
function friendCard(idl) {
  const u = Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return null;
  const r = displayRankOf(u);
  return { idl, nick: u.nick, level: levelOf(u.xp), rank: r.name, rankIcon: r.icon, rankColor: r.color,
           rp: u.rp, nickColor: u.nickColor || null, clan: clanTagOf(u) };
}

function friendList(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const map = a => a.map(friendCard).filter(Boolean);
  return { ok: true, me: idl,
    friends: map(farr(u, 'friends')),
    reqIn:   map(farr(u, 'freqIn')),
    reqOut:  map(farr(u, 'freqOut')) };
}

function sendFriendReq(token, nick) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const t = userByNick(nick);
  if (!t) return { error: '그런 닉네임의 유저가 없어요.' };
  const tid = String(t.id).toLowerCase();
  if (tid === idl) return { error: '자기 자신은 추가할 수 없어요.' };
  if (farr(u, 'friends').includes(tid)) return { error: '이미 친구예요.' };
  if (farr(u, 'freqOut').includes(tid)) return { error: '이미 요청을 보냈어요.' };
  if (farr(u, 'friends').length >= MAX_FRIENDS) return { error: `친구는 최대 ${MAX_FRIENDS}명까지예요.` };
  if (farr(t, 'freqIn').length >= MAX_REQS) return { error: '상대의 요청함이 가득 찼어요.' };

  // 상대가 이미 나에게 보낸 요청이 있으면 바로 친구 성립
  if (farr(u, 'freqIn').includes(tid)) return acceptFriendReq(token, tid);

  farr(u, 'freqOut').push(tid);
  farr(t, 'freqIn').push(idl);
  persist(idl); persist(tid);
  return { ok: true, sent: t.nick, toIdl: tid };
}

function acceptFriendReq(token, fromIdl) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  fromIdl = String(fromIdl || '').toLowerCase();
  if (!farr(u, 'freqIn').includes(fromIdl)) return { error: '받은 요청이 아니에요.' };
  const t = Object.prototype.hasOwnProperty.call(db.users, fromIdl) ? db.users[fromIdl] : null;
  // 요청은 어느 경우든 목록에서 제거 (상대가 탈퇴했어도 정리)
  u.freqIn = farr(u, 'freqIn').filter(x => x !== fromIdl);
  if (!t) { persist(idl); return { error: '상대가 탈퇴했어요.' }; }
  t.freqOut = farr(t, 'freqOut').filter(x => x !== idl);
  if (farr(u, 'friends').length >= MAX_FRIENDS) { persist(idl); persist(fromIdl); return { error: `친구는 최대 ${MAX_FRIENDS}명까지예요.` }; }
  if (!farr(u, 'friends').includes(fromIdl)) farr(u, 'friends').push(fromIdl);
  if (!farr(t, 'friends').includes(idl)) farr(t, 'friends').push(idl);
  persist(idl); persist(fromIdl);
  return { ok: true, nick: t.nick, friendIdl: fromIdl };
}

function declineFriendReq(token, fromIdl) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  fromIdl = String(fromIdl || '').toLowerCase();
  u.freqIn = farr(u, 'freqIn').filter(x => x !== fromIdl);
  const t = Object.prototype.hasOwnProperty.call(db.users, fromIdl) ? db.users[fromIdl] : null;
  if (t) { t.freqOut = farr(t, 'freqOut').filter(x => x !== idl); persist(fromIdl); }
  persist(idl);
  return { ok: true };
}

function cancelFriendReq(token, toIdl) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  toIdl = String(toIdl || '').toLowerCase();
  u.freqOut = farr(u, 'freqOut').filter(x => x !== toIdl);
  const t = Object.prototype.hasOwnProperty.call(db.users, toIdl) ? db.users[toIdl] : null;
  if (t) { t.freqIn = farr(t, 'freqIn').filter(x => x !== idl); persist(toIdl); }
  persist(idl);
  return { ok: true };
}

function removeFriend(token, otherIdl) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  otherIdl = String(otherIdl || '').toLowerCase();
  u.friends = farr(u, 'friends').filter(x => x !== otherIdl);
  const t = Object.prototype.hasOwnProperty.call(db.users, otherIdl) ? db.users[otherIdl] : null;
  if (t) { t.friends = farr(t, 'friends').filter(x => x !== idl); persist(otherIdl); }
  persist(idl);
  return { ok: true };
}

// 소켓 알림 대상 조회용 — 특정 유저의 친구 idl 배열
function friendIdlsOf(idl) {
  const u = Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  return u ? farr(u, 'friends').slice() : [];
}
function nickOfIdl(idl) {
  const u = Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  return u ? u.nick : null;
}

// ══════════════════════════════════════════════════════════
//  클랜
// ══════════════════════════════════════════════════════════
const CLAN_COST = 1000;         // 창설 비용 (코인)
const CLAN_MIN_LEVEL = 5;       // 창설 가능 최소 레벨 — 뜨내기 클랜 난립 방지
const CLAN_MAX_MEMBERS = 30;
const CLAN_NAME_RE = /^[가-힣a-zA-Z0-9 ]{2,12}$/;
const CLAN_TAG_RE  = /^[A-Z0-9]{2,4}$/;

function clanOf(u) {
  const cid = u && u.clan;
  return cid && Object.prototype.hasOwnProperty.call(db.clans, cid) ? db.clans[cid] : null;
}
function clanTagOf(u) { const c = clanOf(u); return c ? { tag: c.tag, name: c.name } : null; }
function clanNameTaken(name) {
  const n = String(name).trim().toLowerCase();
  return Object.values(db.clans).some(c => c.name.toLowerCase() === n);
}
function clanTagTaken(tag) {
  const t = String(tag).trim().toUpperCase();
  return Object.values(db.clans).some(c => c.tag === t);
}
function newClanId() {
  let id; do { id = crypto.randomBytes(5).toString('hex'); } while (Object.prototype.hasOwnProperty.call(db.clans, id));
  return id;
}
// 클랜 총 RP·인원 (탈퇴/탈퇴계정 정리 포함)
function clanStats(c) {
  const members = c.members.filter(m => Object.prototype.hasOwnProperty.call(db.users, m));
  const rp = members.reduce((s, m) => s + (db.users[m].rp || 0), 0);
  const wins = members.reduce((s, m) => s + (db.users[m].wins || 0), 0);
  return { count: members.length, rp, wins };
}
// 부클랜장은 따로 임명하지 않는다 — 클랜장을 뺀 인원 중 RP가 가장 높은 사람이
// 자동으로 맡는다. 저장하지 않고 그때그때 계산하므로 RP가 바뀌면 바로 따라간다.
function viceOf(c) {
  if (!c || !c.members) return null;
  let best = null, bestRp = -1;
  for (const m of c.members) {
    if (m === c.owner) continue;
    const u = Object.prototype.hasOwnProperty.call(db.users, m) ? db.users[m] : null;
    if (!u) continue;
    const rp = u.rp || 0;
    // 동점이면 아이디 순으로 고정해, 볼 때마다 부클랜장이 바뀌지 않게 한다
    if (rp > bestRp || (rp === bestRp && best && m < best)) { best = m; bestRp = rp; }
  }
  return best;
}

// 클랜 보너스 배율 — 클랜장·부클랜장 +10%, 일반 클랜원 +5%
function clanCoinBonus(u) {
  const c = clanOf(u); if (!c) return 0;
  const idl = String(u.id).toLowerCase();
  if (c.owner === idl || viceOf(c) === idl) return 0.10;
  return 0.05;
}

function clanView(c, viewerIdl) {
  const st = clanStats(c);
  const isOwner = c.owner === viewerIdl;
  const vice = viceOf(c);
  return {
    id: c.id, name: c.name, tag: c.tag, notice: c.notice || '',
    owner: c.owner, ownerNick: nickOfIdl(c.owner),
    createdAt: c.createdAt, memberCount: st.count, totalRp: st.rp, totalWins: st.wins,
    max: CLAN_MAX_MEMBERS, isOwner, vice: vice, viceNick: vice ? nickOfIdl(vice) : null,
    isVice: vice === viewerIdl,
    members: c.members.map(m => {
      const card = friendCard(m); if (!card) return null;
      return { ...card, isOwner: m === c.owner, isVice: m === vice };
    }).filter(Boolean).sort((a, b) => (b.isOwner - a.isOwner) || (b.isVice - a.isVice) || (b.rp - a.rp)),
    // 가입 신청자는 클랜장에게만 보임
    applicants: isOwner ? (c.applicants || []).map(friendCard).filter(Boolean) : [],
    applicantCount: (c.applicants || []).length,
  };
}

function createClan(token, name, tag) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  if (clanOf(u)) return { error: '이미 클랜에 소속되어 있어요.' };
  name = String(name || '').trim(); tag = String(tag || '').trim().toUpperCase();
  if (!CLAN_NAME_RE.test(name)) return { error: '클랜 이름은 한글·영문·숫자 2~12자예요.' };
  if (!CLAN_TAG_RE.test(tag))  return { error: '태그는 영문 대문자·숫자 2~4자예요.' };
  if (hasBadWord(name) || hasBadWord(tag)) return { error: '사용할 수 없는 이름이에요.' };
  if (clanNameTaken(name)) return { error: '이미 있는 클랜 이름이에요.' };
  if (clanTagTaken(tag))   return { error: '이미 사용 중인 태그예요.' };
  const lv = levelOf(u.xp);
  if (lv < CLAN_MIN_LEVEL) return { error: `레벨 ${CLAN_MIN_LEVEL} 이상만 클랜을 만들 수 있어요. (현재 Lv.${lv})` };
  if ((u.coins || 0) < CLAN_COST) return { error: `창설 비용 🪙${CLAN_COST}이 필요해요. (보유 ${u.coins || 0})` };

  u.coins -= CLAN_COST;
  const id = newClanId();
  const c = { id, name, tag, owner: idl, members: [idl], applicants: [], notice: '', createdAt: Date.now() };
  db.clans[id] = c;
  u.clan = id;
  persistClan(id); persist(idl);
  return { ok: true, clan: clanView(c, idl), coins: u.coins };
}

function myClan(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const c = clanOf(u);
  const meta = { cost: CLAN_COST, coins: u.coins || 0, minLevel: CLAN_MIN_LEVEL, myLevel: levelOf(u.xp) };
  if (!c) return { ok: true, clan: null, ...meta };
  return { ok: true, clan: clanView(c, idl), ...meta };
}

// 클랜 랭킹 — 총 RP 순
function clanList(limit = 30, token) {
  const idl = token ? tokenIndex[token] : null;
  const myCid = idl && db.users[idl] ? db.users[idl].clan : null;
  const rows = Object.values(db.clans).map(c => {
    const st = clanStats(c);
    return { id: c.id, name: c.name, tag: c.tag, memberCount: st.count, max: CLAN_MAX_MEMBERS,
             totalRp: st.rp, ownerNick: nickOfIdl(c.owner), mine: c.id === myCid,
             applied: !!(idl && (c.applicants || []).includes(idl)) };
  });
  rows.sort((a, b) => (b.totalRp - a.totalRp) || (b.memberCount - a.memberCount));
  return { ok: true, clans: rows.slice(0, limit) };
}

function applyClan(token, clanId) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  if (clanOf(u)) return { error: '이미 클랜에 소속되어 있어요.' };
  clanId = String(clanId || '');
  if (!Object.prototype.hasOwnProperty.call(db.clans, clanId)) return { error: '없는 클랜이에요.' };
  const c = db.clans[clanId];
  c.applicants ||= [];
  if (c.applicants.includes(idl)) return { error: '이미 가입을 신청했어요.' };
  if (clanStats(c).count >= CLAN_MAX_MEMBERS) return { error: '정원이 가득 찼어요.' };
  if (c.applicants.length >= 50) return { error: '신청자가 너무 많아요. 나중에 시도해주세요.' };
  c.applicants.push(idl);
  persistClan(clanId);
  return { ok: true, ownerIdl: c.owner, clanName: c.name };
}

function cancelApply(token, clanId) {
  const idl = tokenIndex[token]; if (!idl) return { error: '로그인이 필요해요.' };
  clanId = String(clanId || '');
  if (!Object.prototype.hasOwnProperty.call(db.clans, clanId)) return { error: '없는 클랜이에요.' };
  const c = db.clans[clanId];
  c.applicants = (c.applicants || []).filter(x => x !== idl);
  persistClan(clanId);
  return { ok: true };
}

// 클랜장 전용 — 가입 승인 / 거절
function decideApplicant(token, targetIdl, accept) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const c = clanOf(u);
  if (!c) return { error: '클랜이 없어요.' };
  if (c.owner !== idl) return { error: '클랜장만 할 수 있어요.' };
  targetIdl = String(targetIdl || '').toLowerCase();
  if (!(c.applicants || []).includes(targetIdl)) return { error: '신청자가 아니에요.' };
  c.applicants = c.applicants.filter(x => x !== targetIdl);

  if (!accept) { persistClan(c.id); return { ok: true, accepted: false }; }
  const t = Object.prototype.hasOwnProperty.call(db.users, targetIdl) ? db.users[targetIdl] : null;
  if (!t) { persistClan(c.id); return { error: '탈퇴한 유저예요.' }; }
  if (t.clan) { persistClan(c.id); return { error: '이미 다른 클랜에 가입했어요.' }; }
  if (clanStats(c).count >= CLAN_MAX_MEMBERS) { persistClan(c.id); return { error: '정원이 가득 찼어요.' }; }
  if (!c.members.includes(targetIdl)) c.members.push(targetIdl);
  t.clan = c.id;
  persistClan(c.id); persist(targetIdl);
  return { ok: true, accepted: true, nick: t.nick, targetIdl, clanName: c.name };
}

function kickMember(token, targetIdl) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const c = clanOf(u);
  if (!c) return { error: '클랜이 없어요.' };
  if (c.owner !== idl) return { error: '클랜장만 할 수 있어요.' };
  targetIdl = String(targetIdl || '').toLowerCase();
  if (targetIdl === idl) return { error: '자기 자신은 추방할 수 없어요.' };
  if (!c.members.includes(targetIdl)) return { error: '클랜원이 아니에요.' };
  c.members = c.members.filter(x => x !== targetIdl);
  const t = Object.prototype.hasOwnProperty.call(db.users, targetIdl) ? db.users[targetIdl] : null;
  if (t) { delete t.clan; persist(targetIdl); }
  persistClan(c.id);
  return { ok: true, targetIdl, clanName: c.name };
}

// 클랜장 위임
function transferOwner(token, targetIdl) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const c = clanOf(u);
  if (!c) return { error: '클랜이 없어요.' };
  if (c.owner !== idl) return { error: '클랜장만 할 수 있어요.' };
  targetIdl = String(targetIdl || '').toLowerCase();
  if (!c.members.includes(targetIdl)) return { error: '클랜원이 아니에요.' };
  if (!Object.prototype.hasOwnProperty.call(db.users, targetIdl)) return { error: '탈퇴한 유저예요.' };
  c.owner = targetIdl;
  persistClan(c.id);
  return { ok: true, nick: nickOfIdl(targetIdl) };
}

function setClanNotice(token, notice) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const c = clanOf(u);
  if (!c) return { error: '클랜이 없어요.' };
  if (c.owner !== idl) return { error: '클랜장만 할 수 있어요.' };
  const n = String(notice || '').trim().slice(0, 60);
  if (n && hasBadWord(n)) return { error: '사용할 수 없는 문구예요.' };
  c.notice = n;
  persistClan(c.id);
  return { ok: true, notice: n };
}

// 탈퇴 — 클랜장이 나가면 남은 사람 중 RP 최고에게 자동 위임, 아무도 없으면 해체
function leaveClan(token) {
  const idl = tokenIndex[token];
  if (!idl || !db.users[idl]) return { error: '로그인이 필요해요.' };
  if (!clanOf(db.users[idl])) return { error: '클랜이 없어요.' };
  return leaveClanByIdl(idl);
}
// 계정 삭제에서도 쓰이므로 토큰이 아니라 idl 기준으로 동작한다.
function leaveClanByIdl(idl) {
  const u = Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '없는 유저예요.' };
  const c = clanOf(u);
  if (!c) return { error: '클랜이 없어요.' };
  c.members = c.members.filter(x => x !== idl);
  c.applicants = (c.applicants || []).filter(x => x !== idl);
  delete u.clan;
  const alive = c.members.filter(m => Object.prototype.hasOwnProperty.call(db.users, m));
  if (!alive.length) {
    delete db.clans[c.id]; purgeClan(c.id); persist(idl);
    return { ok: true, disbanded: true };
  }
  if (c.owner === idl) {
    alive.sort((a, b) => (db.users[b].rp || 0) - (db.users[a].rp || 0));
    c.owner = alive[0];
  }
  persistClan(c.id); persist(idl);
  return { ok: true, newOwner: c.owner === idl ? null : nickOfIdl(c.owner) };
}

function disbandClan(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const c = clanOf(u);
  if (!c) return { error: '클랜이 없어요.' };
  if (c.owner !== idl) return { error: '클랜장만 해체할 수 있어요.' };
  const members = c.members.slice();
  for (const m of members) {
    if (Object.prototype.hasOwnProperty.call(db.users, m)) { delete db.users[m].clan; persist(m); }
  }
  delete db.clans[c.id]; purgeClan(c.id);
  return { ok: true, members };
}

// ══════════════════════════════════════════════════════════
//  클랜 채팅
// ══════════════════════════════════════════════════════════
// 닫힌 그룹(가입 승인된 클랜원)만 오가는 대화라 공개 채팅보다 위험이 낮지만,
// 욕설·도배·신고는 기본으로 막는다. 기록은 신고 처리에 필요한 만큼만 짧게 보관한다.
const CHAT_MAX_LEN = 100;        // 한 메시지 길이 상한
const CHAT_KEEP = 80;            // 클랜당 보관 메시지 수 (링버퍼)
const CHAT_COOLDOWN = 1200;      // 연속 전송 최소 간격(ms) — 도배 방지
const CHAT_BURST = 8;            // 30초 안에 보낼 수 있는 최대 개수
const CHAT_BURST_WINDOW = 30000;
const REPORT_KEEP = 300;         // 신고 보관 건수

db.reports ||= [];

function chatArr(c) { if (!Array.isArray(c.chat)) c.chat = []; return c.chat; }
function blockedOf(u) { if (!Array.isArray(u.blocked)) u.blocked = []; return u.blocked; }

// 화면에 내려보낼 메시지 형태 (차단한 사람 것은 빼고)
function chatView(c, viewer) {
  const blocked = blockedOf(viewer);
  return chatArr(c)
    .filter(m => !blocked.includes(m.idl))
    .map(m => {
      const w = Object.prototype.hasOwnProperty.call(db.users, m.idl) ? db.users[m.idl] : null;
      return { id: m.id, idl: m.idl, nick: nickOfIdl(m.idl) || m.nick, text: m.text, at: m.at,
               nickColor: (w && w.nickColor) || null,      // 물감은 이름을 쓰는 곳마다 따라간다
               mine: m.idl === String(viewer.id).toLowerCase() };
    });
}

function clanChatList(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const c = clanOf(u);
  if (!c) return { error: '클랜에 가입해야 채팅할 수 있어요.' };
  return { ok: true, messages: chatView(c, u), me: idl, isOwner: c.owner === idl };
}

function clanChatSend(token, text) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const c = clanOf(u);
  if (!c) return { error: '클랜에 가입해야 채팅할 수 있어요.' };

  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return { error: '내용을 입력해주세요.' };
  if (t.length > CHAT_MAX_LEN) t = t.slice(0, CHAT_MAX_LEN);
  if (hasBadWord(t)) return { error: '사용할 수 없는 표현이 있어요.' };

  // 도배 방지 — 연속 간격 + 짧은 시간 내 개수
  const now = Date.now();
  if (u.chatLast && now - u.chatLast < CHAT_COOLDOWN) return { error: '조금 천천히 보내주세요.' };
  u.chatHits = (u.chatHits || []).filter(ts => now - ts < CHAT_BURST_WINDOW);
  if (u.chatHits.length >= CHAT_BURST) return { error: '잠시 후 다시 보내주세요.' };
  u.chatHits.push(now); u.chatLast = now;

  const msg = { id: crypto.randomBytes(6).toString('hex'), idl, nick: u.nick, text: t, at: now };
  const arr = chatArr(c);
  arr.push(msg);
  if (arr.length > CHAT_KEEP) arr.splice(0, arr.length - CHAT_KEEP);   // 오래된 것부터 버림
  persistClan(c.id); persist(idl);
  // 받을 사람: 나를 차단하지 않은 클랜원
  const targets = c.members.filter(m => m !== idl && Object.prototype.hasOwnProperty.call(db.users, m)
                                     && !blockedOf(db.users[m]).includes(idl));
  return { ok: true, msg: { ...msg, nick: u.nick }, targets, clanId: c.id };
}

// ══════════════════════════════════════════════════════════
//  친구 1:1 채팅
// ══════════════════════════════════════════════════════════
// 클랜 채팅과 같은 규칙(길이·도배·욕설·차단)을 그대로 쓴다. 다른 건 저장 위치다.
//
// 대화를 따로 모아 두는 대신 각자 자기 기록을 갖는다.
//   · 저장은 두 배가 되지만 기록 하나가 사람 하나에 붙어, 계정을 지우면 같이 사라진다.
//   · 기존 persist(idl) 를 그대로 쓴다 — 새 표를 만들면 Postgres 쪽도 같이 손봐야 한다.
const DM_KEEP = 60;              // 대화 하나당 보관 메시지 수
const DM_THREADS = 30;           // 사람당 보관할 대화 수 (오래 안 쓴 것부터 버림)

function dmBook(u) { if (!u.dm || typeof u.dm !== 'object') u.dm = {}; return u.dm; }
function dmThread(u, other) {
  const book = dmBook(u);
  if (!Object.prototype.hasOwnProperty.call(book, other)) book[other] = { msgs: [], unread: 0, at: 0 };
  const t = book[other];
  if (!Array.isArray(t.msgs)) t.msgs = [];
  return t;
}
// 오래 안 쓴 대화부터 버린다 — 안 그러면 계정 하나가 무한히 커진다
function dmTrim(u) {
  const book = dmBook(u);
  const keys = Object.keys(book);
  if (keys.length <= DM_THREADS) return;
  keys.sort((a, b) => (book[b].at || 0) - (book[a].at || 0));
  for (const k of keys.slice(DM_THREADS)) delete book[k];
}

// 대화 하나 읽기. 여는 순간 안 읽음은 0 으로.
function dmList(token, otherIdl) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const other = String(otherIdl || '').toLowerCase();
  if (!other || other === idl) return { error: '상대를 찾을 수 없어요.' };
  if (!friendIdlsOf(idl).includes(other)) return { error: '친구끼리만 대화할 수 있어요.' };

  const t = dmThread(u, other);
  const blocked = blockedOf(u);
  const msgs = t.msgs
    .filter((m) => !blocked.includes(m.idl))
    .map((m) => ({ id: m.id, idl: m.idl, nick: nickOfIdl(m.idl) || m.nick, text: m.text, at: m.at,
                   mine: m.idl === idl }));
  if (t.unread) { t.unread = 0; persist(idl); }
  return { ok: true, messages: msgs, me: idl, other, otherNick: nickOfIdl(other) || other };
}

// 안 읽은 개수 (친구 목록·버튼 배지용)
function dmUnread(token) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const book = dmBook(u), by = {};
  let total = 0;
  for (const k of Object.keys(book)) {
    const n = Number(book[k].unread) || 0;
    if (n > 0) { by[k] = n; total += n; }
  }
  return { ok: true, total, by };
}

function dmSend(token, otherIdl, text) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const other = String(otherIdl || '').toLowerCase();
  if (!other || other === idl) return { error: '상대를 찾을 수 없어요.' };
  if (!friendIdlsOf(idl).includes(other)) return { error: '친구끼리만 대화할 수 있어요.' };
  const peer = Object.prototype.hasOwnProperty.call(db.users, other) ? db.users[other] : null;
  if (!peer) return { error: '상대를 찾을 수 없어요.' };

  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return { error: '내용을 입력해주세요.' };
  if (t.length > CHAT_MAX_LEN) t = t.slice(0, CHAT_MAX_LEN);
  if (hasBadWord(t)) return { error: '사용할 수 없는 표현이 있어요.' };

  // 도배 방지 — 클랜 채팅과 같은 계량기를 쓴다(창을 나눠 놓으면 양쪽으로 두 배 보낸다)
  const now = Date.now();
  if (u.chatLast && now - u.chatLast < CHAT_COOLDOWN) return { error: '조금 천천히 보내주세요.' };
  u.chatHits = (u.chatHits || []).filter((ts) => now - ts < CHAT_BURST_WINDOW);
  if (u.chatHits.length >= CHAT_BURST) return { error: '잠시 후 다시 보내주세요.' };
  u.chatHits.push(now); u.chatLast = now;

  const msg = { id: crypto.randomBytes(6).toString('hex'), idl, nick: u.nick, text: t, at: now };
  const push = (owner, key, unread) => {
    const th = dmThread(owner, key);
    th.msgs.push(msg);
    if (th.msgs.length > DM_KEEP) th.msgs.splice(0, th.msgs.length - DM_KEEP);
    th.at = now;
    if (unread) th.unread = (th.unread || 0) + 1;
    dmTrim(owner);
  };
  push(u, other, false);
  // 나를 차단한 사람에게는 남기지 않는다 — 차단은 이후 메시지도 막는다
  const blockedMe = blockedOf(peer).includes(idl);
  if (!blockedMe) push(peer, idl, true);
  persist(idl); if (!blockedMe) persist(other);

  return { ok: true, msg: { ...msg, nick: u.nick, mine: false }, target: blockedMe ? null : other };
}

// 차단 — 차단한 사람의 메시지는 내 화면에서 사라지고, 이후 메시지도 안 온다
function blockUser(token, targetIdl, on) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  targetIdl = String(targetIdl || '').toLowerCase();
  if (!targetIdl || targetIdl === idl) return { error: '자기 자신은 차단할 수 없어요.' };
  const list = blockedOf(u);
  const i = list.indexOf(targetIdl);
  if (on === false || (on === undefined && i >= 0)) { if (i >= 0) list.splice(i, 1); }
  else if (i < 0) list.push(targetIdl);
  persist(idl);
  return { ok: true, blocked: list.slice(), on: list.includes(targetIdl) };
}
function blockList(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  return { ok: true, blocked: blockedOf(u).map(b => ({ idl: b, nick: nickOfIdl(b) })).filter(x => x.nick) };
}

// 신고 — 운영자가 확인할 수 있게 보관하고, 클랜장에게도 알린다
function reportMessage(token, msgId, reason) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const c = clanOf(u);
  if (!c) return { error: '클랜이 없어요.' };
  const m = chatArr(c).find(x => x.id === msgId);
  if (!m) return { error: '없는 메시지예요.' };
  if (m.idl === idl) return { error: '내 메시지는 신고할 수 없어요.' };
  db.reports ||= [];
  if (db.reports.some(r => r.msgId === msgId && r.by === idl)) return { error: '이미 신고했어요.' };
  db.reports.push({ msgId, by: idl, byNick: u.nick, target: m.idl, targetNick: m.nick,
                    text: m.text, clanId: c.id, clanName: c.name,
                    reason: String(reason || '').slice(0, 40), at: Date.now() });
  if (db.reports.length > REPORT_KEEP) db.reports.splice(0, db.reports.length - REPORT_KEEP);
  persistReports();
  return { ok: true, ownerIdl: c.owner, targetNick: m.nick };
}
function reportList(limit = 50) {
  return { ok: true, reports: (db.reports || []).slice(-limit).reverse() };
}

module.exports = {
  createTempAccounts, rotateTempCode, revokeTempCode, tempAccountList, codeLogin,
  signup, login, kakaoLogin, googleLogin, setNick, byToken, meByToken, recordResult, applyRp4, claimDaily, myRank,
  viceOf, clanCoinBonus,
  createCoupons, couponList, redeemCoupon, TITLES, plateFxText,
  // 급수/단/ACE
  RANKS, ACE_CAPACITY, RP_CONFIG, PROMO, rankOf, displayRankOf, rankInfoOf,
  calcRpDelta, refreshRankState, startPromo, promoResult, refreshAce, seasonReset,
  seasonKey, seasonNo, seasonState, checkSeason, snapshot, saveSnapshot, snapshotList,
  profileOf, topPlayers, shopList, buyItem, equipItem, equipTitle,
  gachaInfo, rollGacha, exchangeShard, usePipette, GACHA_TIER, TIER_OF, SHARD_ONLY, bonusOf,
  missionList, claimMission, titleList, dmList, dmSend, dmUnread,
  tourEnter, tourRefund, tourPrize, miniStake, miniPay, betrayEvent, cycleProgress, CYCLE_KINDS, CYCLE_REWARD, claimTutorial, applyReferral, deleteAccount,
  // 친구
  friendList, sendFriendReq, acceptFriendReq, declineFriendReq, cancelFriendReq, removeFriend,
  friendIdlsOf, nickOfIdl,
  // 클랜
  createClan, myClan, clanList, applyClan, cancelApply, decideApplicant,
  kickMember, transferOwner, setClanNotice, leaveClan, disbandClan,
  // 클랜 채팅
  clanChatList, clanChatSend, blockUser, blockList, reportMessage, reportList,
  // 운영 점검
  storeInfo,
};
