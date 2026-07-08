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
// 현재 레벨에서 다음 레벨까지 필요한 XP (누진 곡선)
function xpForNext(level) {
  if (level < 10) return level * 50 + 50;
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
    level: levelOf(u.xp), xp: u.xp, xpInLevel: xpInLevel(u.xp), xpNeeded: levelInfo(u.xp).need,
    rp: u.rp, rank: rank.name, rankIcon: rank.icon, rankColor: rank.color,
    wins: u.wins, losses: u.losses,
    winRate: total ? Math.round(u.wins / total * 100) : 0,
    coins: u.coins || 0,
    nickColor: u.nickColor || null,          // 염색약 결과 (색 키)
    cardBack: u.cardBack || null,            // 장착 중인 카드백
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
// 욕설·비하 닉네임 차단 (강한 표현 위주 — 오탐 최소화)
const BADWORDS = /시발|씨발|씨빨|쉬발|시빨|ㅅㅂ|병신|븅신|빙신|지랄|새끼|색기|섹스|좆|존나|니미|애미|에미|느금|보지|자지|걸레|창녀|fuck|shit|bitch|nigg|sex|porn|운영자|관리자|admin|gm/i;
function validId(id)   { return /^[A-Za-z0-9_]{3,16}$/.test(id || '') && !RESERVED_KEY.test(id); }
function validNick(n)  { const s = String(n || '').trim(); return s.length >= 1 && s.length <= 12 && !RESERVED_KEY.test(s) && !BADWORDS.test(s.replace(/[\s._-]/g, '')); }

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
  if (!validNick(nick)) return { error: '닉네임은 1~12자예요.' };
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
  back_ruby:   { name: '루비 카드백',         icon: '❤️‍🔥', price: 700,  type: 'cardback',
                 desc: '와인빛으로 물든 카드 뒷면' },
  back_galaxy: { name: '은하수 카드백',       icon: '🌌', price: 1500, type: 'cardback',
                 desc: '별이 흐르는 프리미엄 카드 뒷면' },
  emote_party: { name: '파티 이모트 팩',      icon: '🎉', price: 400,  type: 'emotes',
                 desc: '이모트 8종 추가: 🤡😈💀🎉👑🍀💢🫠' },
  emote_animal:{ name: '동물 이모트 팩',      icon: '🐾', price: 400,  type: 'emotes',
                 desc: '이모트 8종 추가: 🐶🐱🐷🐸🦊🐻🐤🦄' },
  emote_battle:{ name: '승부사 이모트 팩',    icon: '⚔️', price: 400,  type: 'emotes',
                 desc: '이모트 8종 추가: ⚔️🛡️😤🤯🥶🎲🎯🏆' },
  np_wood:  { name: '나무 명패',   icon: '🪵', price: 400,  type: 'plate', desc: '닉네임을 감싸는 소박한 나무 명패' },
  np_neon:  { name: '네온 명패',   icon: '💜', price: 800,  type: 'plate', desc: '보랏빛으로 빛나는 네온 명패' },
  np_gold:  { name: '황금 명패',   icon: '🏅', price: 1000, type: 'plate', desc: '번쩍번쩍 황금 명패' },
  np_daily: { name: '행운의 명패', icon: '🍀', price: 1500, type: 'plate', desc: '장착 중이면 매일 출석 보상 +50🪙' },
  np_lv50:  { name: '레벨50 한정 명패', icon: '🎖️', price: 0, type: 'plate', milestone: true, desc: '레벨 50 달성자만 얻는 한정판 명패' },
  dye_rare: { name: '희귀 염색약 확정권', icon: '💎', price: 0, type: 'dye_rare', milestone: true, desc: '희귀 색상(청록·핑크·라임) 확정 — 레벨20 보상' },
  tbl_blue:  { name: '블루 테이블',   icon: '🔵', price: 600,  type: 'table', desc: '차분한 심해 블루 테이블' },
  tbl_purple:{ name: '퍼플 테이블',   icon: '🟣', price: 700,  type: 'table', desc: '고급스러운 자주빛 테이블' },
  tbl_gold:  { name: '골드 테이블',   icon: '🟡', price: 1200, type: 'table', desc: '럭셔리 카지노 골드 테이블' },
  tbl_forest:{ name: '그린 펠트 테이블', icon: '🟢', price: 600, type: 'table', desc: '클래식 카지노 그린 펠트' },
  face_neon: { name: '네온 카드',     icon: '🃏', price: 700,  type: 'cardface', desc: '숫자가 네온으로 빛나는 카드 앞면' },
  face_classic:{ name: '클래식 카드', icon: '♠️', price: 900,  type: 'cardface', desc: '트럼프풍 세리프 숫자 카드 앞면' },
  face_gold: { name: '황금 숫자 카드', icon: '👑', price: 1000, type: 'cardface', desc: '숫자가 황금빛으로 빛나는 카드 앞면' },
  np_ruby:   { name: '루비 명패',     icon: '❤️‍🔥', price: 1200, type: 'plate', desc: '와인빛으로 반짝이는 루비 명패' },
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
const RARE_DYES = ['cyan', 'pink', 'lime'];   // 희귀 등급 (레벨20 확정권)
function rollRareDye() { return RARE_DYES[Math.floor(Math.random() * RARE_DYES.length)]; }

// ── 레벨 마일스톤 보상 (최초 1회) ──
const MILESTONES = {
  10: { icon: '🪙', label: 'Lv.10 달성 — 코인 300', coins: 300 },
  20: { icon: '💎', label: 'Lv.20 달성 — 희귀 염색약 확정권', ticket: 'dye_rare_ticket' },
  50: { icon: '🎖️', label: 'Lv.50 달성 — 한정판 명패', plate: 'np_lv50' },
};
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
  return Object.entries(SHOP).map(([id, it]) => ({ id, ...it }));
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
const SLOT = { cardback: 'cardBack', plate: 'plate', table: 'table', cardface: 'cardFace' };
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
function topPlayers(limit = 20) {
  return Object.values(db.users)
    .sort((a, b) => (b.rp - a.rp) || (b.wins - a.wins))
    .slice(0, Math.min(limit, 50))
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
const MIN_TURNS = 5, MIN_PLAYTIME = 60;   // 진행 조건 필터
const MATCH_LIMIT = 3;         // 같은 상대와 하루 보상 인정 판수
const DECAY_RANK_RP = 900, DECAY_DAYS = 3, DECAY_PER_DAY = 10;   // 다이아 이상 미접속 감소
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
const TITLES = {
  t_founder:{ name: '창단 멤버',     icon: '🏛️', color: '#ffd94a', cond: '초기 가입자',        goalKey: '__never',    goal: Infinity },   // 가입 시 수동 지급
  t_tutor:  { name: '새내기 졸업',   icon: '🎓', color: '#7dd87d', cond: '첫 승리',            goalKey: 'wins',       goal: 1 },
  t_streak: { name: '연승 제조기',   icon: '🔥', color: '#ffab5e', cond: '5연승 달성',          goalKey: 'bestStreak', goal: 5 },
  t_betray: { name: '배신의 달인',   icon: '⚔️', color: '#ff8a8a', cond: '졸개의 배신 5회',     goalKey: 'betray',     goal: 5 },
  t_expert: { name: '전문가 사냥꾼', icon: '🎯', color: '#ffd94a', cond: '전문가 AI 10승',      goalKey: 'expertWins', goal: 10 },
  t_multi:  { name: '경매왕',        icon: '👑', color: '#c39bff', cond: '멀티플레이 20승',     goalKey: 'multiWins',  goal: 20 },
  t_debut:  { name: '온라인 데뷔',   icon: '🌐', color: '#7ab8ff', cond: '첫 멀티플레이 승리',  goalKey: 'multiWins',  goal: 1 },
  t_daily7: { name: '성실한 단골',   icon: '📅', color: '#8fe08a', cond: '7일 연속 출석',       goalKey: 'loginStreak', goal: 7 },
  t_lv10:   { name: '숙련된 승부사', icon: '🎖️', color: '#ffab5e', cond: '레벨 10 달성',        goalKey: 'level',      goal: 10 },
  t_rich:   { name: '큰손',          icon: '💰', color: '#ffd94a', cond: '코인 2,000 보유',     goalKey: 'coins',      goal: 2000 },
  t_vet:    { name: '백전노장',      icon: '🛡️', color: '#c8a86a', cond: '누적 50판 플레이',    goalKey: 'games',      goal: 50 },
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
function missionEvent(u, ev) {   // 진행도 +1, 목표 달성 시 즉시 코인 지급 → 완료 목록 반환
  const m = missionState(u); const done = [];
  for (const id of m.set) {
    const def = MISSIONS[id]; if (!def) continue;
    if (def.ev !== ev || m.claimed[id]) continue;
    m.prog[id] = (m.prog[id] || 0) + 1;
    if (m.prog[id] >= def.goal) {
      m.claimed[id] = true;
      u.coins = (u.coins || 0) + def.reward;
      done.push({ id, name: def.name, reward: def.reward });
    }
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
  return {
    ok: true,
    list: m.set.filter(id => MISSIONS[id]).map(id => { const def = MISSIONS[id]; return {
      id, name: def.name, goal: def.goal, reward: def.reward,
      prog: Math.min(m.prog[id] || 0, def.goal), claimed: !!m.claimed[id],
    }; }),
  };
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
  if ((u.rp || 0) < DECAY_RANK_RP || u.lastLoginIdx == null) return 0;
  const days = todayIdx - u.lastLoginIdx;
  if (days < DECAY_DAYS) return 0;
  const dec = days * DECAY_PER_DAY;
  u.rp = Math.max(0, u.rp - dec);
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

// 결과 반영 (result: 'win'|'loss'|'draw') → { profile, rewards }
// opts: { vsBot, difficulty, turns, playtimeSec, sameIp, friendly, oppUid }
function recordResult(token, result, opts = {}) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return null;
  const base = (REWARDS[rewardKey(opts.vsBot, opts.difficulty)] || REWARDS.multi)[result] || { coins: 0, xp: 0 };
  const beforeLevel = levelOf(u.xp), beforeRank = rankOf(u.rp).name;
  const today = kstDayIndex();

  // ── 어뷰징 필터 (순차 적용) → 걸리면 모든 보상 0, 전적만 기록 ──
  let blocked = false, reason = null;
  // 2. 진행 조건: 너무 짧은 판(턴/시간)은 보상 없음 (솔로·멀티 공통)
  //    단, 탈주 패배는 페널티(RP-13)를 그대로 부과해야 하므로 예외
  const tooShort = (opts.turns || 0) < MIN_TURNS || (opts.playtimeSec || 0) < MIN_PLAYTIME;
  const forfeitLoss = opts.forfeit && result === 'loss';
  if (tooShort && !forfeitLoss) { blocked = true; reason = 'short'; }
  // 3. 자만추/저격 방지 (PvP 한정): 같은 IP·친선전, 또는 같은 상대와 하루 3판 초과
  if (!opts.vsBot && !blocked) {
    if (opts.sameIp || opts.friendly) { blocked = true; reason = 'friendly'; }
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

  // 일일 미션 진행 (자동 수령 — 코인 즉시 지급)
  const missions = [];
  missions.push(...missionEvent(u, 'play'));
  if (!opts.vsBot) missions.push(...missionEvent(u, 'multi_play'));
  if (opts.vsBot && opts.difficulty === 'expert') missions.push(...missionEvent(u, 'expert_play'));
  if (result === 'win') missions.push(...missionEvent(u, 'win'));
  if (winnable && u.winStreak === 2) missions.push(...missionEvent(u, 'streak2'));

  let coins = base.coins || 0, xp = base.xp || 0, rp = opts.noRank ? 0 : (base.rp || 0);   // 봇매치 등은 RP 미반영
  let firstWin = 0, streak = 0;

  if (blocked) {
    coins = 0; xp = 0; rp = 0;                                  // 어뷰징 → 재화 전량 0
  } else {
    if (opts.vsBot && result === 'loss' && (u.aiLossStreak || 0) >= 3) coins = 0;   // 고의 패작 방지
    if (winnable && u.lastWinIdx !== today) { firstWin = FIRST_WIN_BONUS; u.lastWinIdx = today; }   // 하루 첫 승
    if (winnable && u.winStreak >= 2) streak = Math.min((u.winStreak - 1) * 10, 50);                // 연승 보너스
    // 플래티넘(500+) 양학 방지: 멀티 3연승 이상 시 RP 가중치 +10 → 강자를 빠르게 상위 티어로
    if (!opts.vsBot && result === 'win' && u.winStreak >= 3 && (u.rp || 0) >= 500) rp += PLATE_RP_WEIGHT;
  }
  coins += firstWin + streak;

  u.xp += xp;
  u.coins = Math.max(0, (u.coins || 0) + coins);
  if (rp) u.rp = Math.max(0, u.rp + rp);

  // 레벨 마일스톤 (Lv10/20/50 최초 1회) — XP 반영 후 검사
  const milestones = grantMilestones(u);

  // 최근 전적 (최대 10)
  u.history = u.history || [];
  u.history.unshift({ vs: opts.oppLabel || (opts.vsBot ? 'AI' : '상대'), result, coins, at: Date.now() });
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

  const afterLevel = levelOf(u.xp), afterRank = rankOf(u.rp).name;
  return {
    profile: profileOf(u),
    rewards: {
      coins, xp, rp, firstWin, streak, streakCount: u.winStreak, blocked, reason,
      levelUp: afterLevel > beforeLevel ? afterLevel : 0,
      rankUp: (afterRank !== beforeRank && rp > 0) ? afterRank : 0,
      missions, titles, milestones,
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

module.exports = {
  signup, login, kakaoLogin, googleLogin, setNick, byToken, meByToken, recordResult, claimDaily, myRank,
  profileOf, topPlayers, shopList, buyItem, equipItem, equipTitle,
  missionList, titleList, betrayEvent, claimTutorial, applyReferral,
};
