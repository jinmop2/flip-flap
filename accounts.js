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
  { rp: 100,  name: '실버',     icon: '🥈', color: '#b8c0cc' },
  { rp: 250,  name: '골드',     icon: '🥇', color: '#e0b84a' },
  { rp: 500,  name: '플래티넘', icon: '💠', color: '#4ec3c0' },
  { rp: 900,  name: '다이아',   icon: '💎', color: '#7ab8ff' },
  { rp: 1500, name: '마스터',   icon: '👑', color: '#c88bff' },
];
function rankOf(rp) { let r = RANKS[0]; for (const t of RANKS) if (rp >= t.rp) r = t; return r; }

function profileOf(u) {
  if (!u) return null;
  const rank = rankOf(u.rp);
  const total = u.wins + u.losses;
  return {
    id: u.id, nick: u.nick, guest: false,
    nickLocked: !(u.provider === 'kakao' && !u.nickSet),   // false면 아직 닉 설정 기회 남음
    level: levelOf(u.xp), xp: u.xp, xpInLevel: xpInLevel(u.xp),
    rp: u.rp, rank: rank.name, rankIcon: rank.icon, rankColor: rank.color,
    wins: u.wins, losses: u.losses,
    winRate: total ? Math.round(u.wins / total * 100) : 0,
    coins: u.coins || 0,
    nickColor: u.nickColor || null,          // 염색약 결과 (색 키)
    cardBack: u.cardBack || null,            // 장착 중인 카드백
    items: u.items || {},                    // 보유 아이템 { id: 개수 or true }
    streak: u.winStreak || 0,                // 현재 연승
    history: (u.history || []).slice(0, 10), // 최근 전적
  };
}

// ── API ──
function validId(id)   { return /^[A-Za-z0-9_]{3,16}$/.test(id || ''); }
function validNick(n)  { const s = String(n || '').trim(); return s.length >= 1 && s.length <= 12; }

const TOKEN_TTL = 30 * 24 * 3600 * 1000;   // 토큰 30일 만료
function signup(id, pw, nick) {
  id = String(id || '').trim(); nick = String(nick || '').trim();
  if (!validId(id)) return { error: '아이디는 영문/숫자 3~16자예요.' };
  if (/^kakao_/i.test(id)) return { error: '사용할 수 없는 아이디예요.' };   // 카카오 계정 키와 충돌 방지
  if (String(pw || '').length < 6) return { error: '비밀번호는 6자 이상이어야 해요.' };
  if (!validNick(nick)) return { error: '닉네임은 1~12자예요.' };
  const idl = id.toLowerCase(), nickl = nick.toLowerCase();
  if (db.users[idl]) return { error: '이미 있는 아이디예요.' };
  if (db.nickTaken[nickl]) return { error: '이미 사용 중인 닉네임이에요.' };
  const salt = crypto.randomBytes(12).toString('hex');
  const token = makeToken();
  const u = { id, nick, nickSet: true, salt, hash: hashPw(pw, salt), token, tokenExp: Date.now() + TOKEN_TTL, wins: 0, losses: 0, xp: 0, rp: 0, createdAt: Date.now() };   // 일반 가입은 폼에서 닉 확정
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
function byToken(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return null;
  if (u.tokenExp && Date.now() > u.tokenExp) { delete tokenIndex[token]; return null; }  // 만료
  return u;
}
function meByToken(token) { const u = byToken(token); return u ? { ok: true, profile: profileOf(u) } : { error: '세션 만료' }; }

// 닉네임 설정 — 카카오 첫 설정은 무료 1회, 이후엔 닉네임 변경권 소모
function setNick(token, nick) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '세션이 만료됐어요. 다시 로그인해주세요.' };
  const freeSet = u.provider === 'kakao' && !u.nickSet;
  const hasTicket = ((u.items || {}).nick_change || 0) > 0;
  if (!freeSet && !hasTicket) return { error: '닉네임 변경권이 필요해요. (상점에서 구매)' };
  nick = String(nick || '').trim();
  if (!validNick(nick)) return { error: '닉네임은 1~12자예요.' };
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
  back_gold:   { name: '황금 카드백',         icon: '🏆', price: 800,  type: 'cardback',
                 desc: '번쩍이는 황금 카드 뒷면' },
  back_obang:  { name: '오방색 카드백',       icon: '🎏', price: 1200, type: 'cardback',
                 desc: '전통 오방색 카드 뒷면' },
  emote_party: { name: '파티 이모트 팩',      icon: '🎉', price: 400,  type: 'emotes',
                 desc: '이모트 8종 추가: 🤡😈💀🎉👑🍀💢🫠' },
};
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
function shopList() {
  return Object.entries(SHOP).map(([id, it]) => ({ id, ...it }));
}
function buyItem(token, itemId) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const it = SHOP[itemId]; if (!it) return { error: '없는 상품이에요.' };
  u.items = u.items || {}; u.coins = u.coins || 0;
  if ((it.type === 'cardback' || it.type === 'emotes') && u.items[itemId]) return { error: '이미 보유한 아이템이에요.' };
  if (u.coins < it.price) return { error: `코인이 부족해요. (보유 ${u.coins} / 필요 ${it.price})` };
  u.coins -= it.price;
  let dye = null;
  if (it.type === 'dye') { dye = rollDye(); u.nickColor = dye; }                 // 즉시 발라짐
  else if (it.type === 'ticket') u.items[itemId] = (u.items[itemId] || 0) + 1;   // 소모권 적립
  else { u.items[itemId] = true; if (it.type === 'cardback') u.cardBack = itemId; }  // 사면 바로 장착
  persist(idl);
  return { ok: true, profile: profileOf(u), dye };
}
function equipItem(token, itemId) {   // 카드백 장착/해제 (itemId=null이면 기본으로)
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  if (itemId && (!SHOP[itemId] || SHOP[itemId].type !== 'cardback' || !(u.items || {})[itemId])) return { error: '보유하지 않은 카드백이에요.' };
  u.cardBack = itemId || null;
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
function kakaoLogin(kakaoId, kNick) {
  const idl = 'kakao_' + String(kakaoId);
  let u = db.users[idl];
  if (!u) {
    const nick = uniqueNick(kNick);
    u = { id: idl, nick, nickSet: false, provider: 'kakao', token: makeToken(), tokenExp: Date.now() + TOKEN_TTL, wins: 0, losses: 0, xp: 0, rp: 0, createdAt: Date.now() };   // 닉은 첫 로그인 모달에서 확정
    db.users[idl] = u; db.nickTaken[nick.toLowerCase()] = idl; tokenIndex[u.token] = idl; persist(idl);
    return { ok: true, token: u.token, profile: profileOf(u), isNew: true };
  }
  if (u.token) delete tokenIndex[u.token];
  u.token = makeToken(); u.tokenExp = Date.now() + TOKEN_TTL;
  tokenIndex[u.token] = idl; persist(idl);
  return { ok: true, token: u.token, profile: profileOf(u) };
}

// 랭킹 (RP 상위)
function topPlayers(limit = 20) {
  return Object.values(db.users)
    .sort((a, b) => (b.rp - a.rp) || (b.wins - a.wins))
    .slice(0, Math.min(limit, 50))
    .map((u, i) => { const p = profileOf(u); return { no: i + 1, nick: p.nick, nickColor: p.nickColor, level: p.level, rank: p.rank, rankIcon: p.rankIcon, rankColor: p.rankColor, rp: p.rp, wins: p.wins, losses: p.losses }; });
}

// ── 보상 테이블 ──
// 코인: 전문가 AI가 압도적 / RP: 멀티 전용 (AI 농사 방지) / XP: 난이도 차등
const REWARDS = {
  ai_easy:   { win: { coins: 10,  xp: 10 }, loss: { coins: 0,  xp: 5 },  draw: { coins: 5,  xp: 8 } },
  ai_hard:   { win: { coins: 30,  xp: 20 }, loss: { coins: 5,  xp: 5 },  draw: { coins: 15, xp: 10 } },
  ai_expert: { win: { coins: 150, xp: 40 }, loss: { coins: 25, xp: 8 },  draw: { coins: 75, xp: 20 } },
  multi:     { win: { coins: 50,  xp: 30, rp: 25 }, loss: { coins: 10, xp: 10, rp: -13 }, draw: { coins: 25, xp: 15, rp: 0 } },
};
function rewardKey(vsBot, difficulty) {
  if (!vsBot) return 'multi';
  if (difficulty === 'expert') return 'ai_expert';
  if (difficulty === 'easy') return 'ai_easy';
  return 'ai_hard';   // normal/hard 둘 다 중간 취급
}

const DAILY_LOGIN = 30;        // 1일 접속 보상
const FIRST_WIN_BONUS = 50;    // 하루 첫 승 보너스
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

// 1일 접속 보상 (하루 1회)
function claimDaily(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return null;
  if (u.lastLoginDay === todayStr()) return { claimed: false, profile: profileOf(u) };
  u.lastLoginDay = todayStr();
  u.coins = (u.coins || 0) + DAILY_LOGIN;
  persist(idl);
  return { claimed: true, amount: DAILY_LOGIN, profile: profileOf(u) };
}

// 결과 반영 (result: 'win'|'loss'|'draw') → { profile, rewards }
function recordResult(token, result, opts = {}) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return null;
  const base = (REWARDS[rewardKey(opts.vsBot, opts.difficulty)] || REWARDS.multi)[result] || { coins: 0, xp: 0 };
  const beforeLevel = levelOf(u.xp), beforeRank = rankOf(u.rp).name;
  const sameIp = !!opts.sameIp && !opts.vsBot;   // 같은 IP 멀티 = 파밍 방지

  if (result === 'win') { u.wins++; u.winStreak = (u.winStreak || 0) + 1; }
  else if (result === 'loss') { u.losses++; u.winStreak = 0; }

  let coins = base.coins || 0, xp = base.xp || 0, rp = base.rp || 0;
  let firstWin = 0, streak = 0;

  if (sameIp) {
    // 같은 IP끼리 대전 → 코인이 새로 생기지 않게: 승자만 얻고 패자는 잃음, 보너스·RP 없음
    coins = result === 'win' ? 50 : result === 'loss' ? -50 : 0;
    rp = 0; xp = Math.min(xp, 10);
  } else {
    if (result === 'win' && u.lastWinDay !== todayStr()) { firstWin = FIRST_WIN_BONUS; u.lastWinDay = todayStr(); }
    if (result === 'win' && u.winStreak >= 2) streak = Math.min((u.winStreak - 1) * 10, 50);
  }
  coins += firstWin + streak;

  u.xp += xp;
  u.coins = Math.max(0, (u.coins || 0) + coins);
  if (rp) u.rp = Math.max(0, u.rp + rp);

  // 최근 전적 (최대 10)
  u.history = u.history || [];
  u.history.unshift({ vs: opts.oppLabel || (opts.vsBot ? 'AI' : '상대'), result, coins, at: Date.now() });
  if (u.history.length > 10) u.history.length = 10;
  persist(idl);

  const afterLevel = levelOf(u.xp), afterRank = rankOf(u.rp).name;
  return {
    profile: profileOf(u),
    rewards: {
      coins, xp, rp, firstWin, streak, streakCount: u.winStreak, sameIp,
      levelUp: afterLevel > beforeLevel ? afterLevel : 0,
      rankUp: (afterRank !== beforeRank && rp > 0) ? afterRank : 0,
    },
  };
}

// 내 랭킹 순위 (RP 기준 1-based)
function myRank(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return null;
  const sorted = Object.values(db.users).sort((a, b) => (b.rp - a.rp) || (b.wins - a.wins));
  const pos = sorted.findIndex(x => x.id.toLowerCase() === u.id.toLowerCase());
  const p = profileOf(u);
  return { no: pos + 1, total: sorted.length, nick: p.nick, nickColor: p.nickColor, rank: p.rank, rankIcon: p.rankIcon, rankColor: p.rankColor, rp: p.rp, wins: p.wins, losses: p.losses };
}

module.exports = { signup, login, kakaoLogin, setNick, byToken, meByToken, recordResult, claimDaily, myRank, profileOf, topPlayers, shopList, buyItem, equipItem };
