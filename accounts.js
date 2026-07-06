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
    plate: u.plate || null,                  // 장착 명패
    table: u.table || null,                  // 장착 테이블 스킨
    cardFace: u.cardFace || null,            // 장착 카드 앞면 스킨
    title: u.title || null,                  // 장착 칭호 id
    titleInfo: u.title && TITLES[u.title] ? { name: TITLES[u.title].name, icon: TITLES[u.title].icon, color: TITLES[u.title].color } : null,
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
  emote_animal:{ name: '동물 이모트 팩',      icon: '🐾', price: 400,  type: 'emotes',
                 desc: '이모트 8종 추가: 🐶🐱🐷🐸🦊🐻🐤🦄' },
  np_wood:  { name: '나무 명패',   icon: '🪵', price: 400,  type: 'plate', desc: '닉네임을 감싸는 소박한 나무 명패' },
  np_neon:  { name: '네온 명패',   icon: '💜', price: 800,  type: 'plate', desc: '보랏빛으로 빛나는 네온 명패' },
  np_gold:  { name: '황금 명패',   icon: '🏅', price: 1000, type: 'plate', desc: '번쩍번쩍 황금 명패' },
  np_daily: { name: '행운의 명패', icon: '🍀', price: 1500, type: 'plate', desc: '장착 중이면 매일 출석 보상 +20🪙' },
  tbl_blue:  { name: '블루 테이블',   icon: '🔵', price: 600,  type: 'table', desc: '차분한 심해 블루 테이블' },
  tbl_purple:{ name: '퍼플 테이블',   icon: '🟣', price: 700,  type: 'table', desc: '고급스러운 자주빛 테이블' },
  tbl_gold:  { name: '골드 테이블',   icon: '🟡', price: 1200, type: 'table', desc: '럭셔리 카지노 골드 테이블' },
  face_neon: { name: '네온 카드',     icon: '🃏', price: 700,  type: 'cardface', desc: '숫자가 네온으로 빛나는 카드 앞면' },
  face_classic:{ name: '클래식 카드', icon: '♠️', price: 900,  type: 'cardface', desc: '트럼프풍 세리프 숫자 카드 앞면' },
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
  if (titleId && !((u.titles || {})[titleId])) return { error: '아직 획득하지 못한 칭호예요.' };
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

// ── 칭호 (조건 달성 시 자동 획득) ──
const TITLES = {
  t_tutor:  { name: '새내기 졸업',   icon: '🎓', color: '#7dd87d', cond: '첫 승리',            goalKey: 'wins',       goal: 1 },
  t_streak: { name: '연승 제조기',   icon: '🔥', color: '#ffab5e', cond: '5연승 달성',          goalKey: 'bestStreak', goal: 5 },
  t_betray: { name: '배신의 달인',   icon: '⚔️', color: '#ff8a8a', cond: '졸개의 배신 5회',     goalKey: 'betray',     goal: 5 },
  t_expert: { name: '전문가 사냥꾼', icon: '🎯', color: '#ffd94a', cond: '전문가 AI 10승',      goalKey: 'expertWins', goal: 10 },
  t_multi:  { name: '경매왕',        icon: '👑', color: '#c39bff', cond: '멀티플레이 20승',     goalKey: 'multiWins',  goal: 20 },
};
function statOf(u, key) { return key === 'wins' ? (u.wins || 0) : ((u.stats || {})[key] || 0); }
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

// ── 일일 미션 (자동 수령) ──
const MISSIONS = {
  m_play3:  { name: '아무 대전 3판 플레이',  goal: 3, reward: 30, ev: 'play' },
  m_win1:   { name: '1승 거두기',            goal: 1, reward: 40, ev: 'win' },
  m_multi1: { name: '멀티플레이 1판',        goal: 1, reward: 50, ev: 'multi_play' },
  m_betray: { name: '졸개의 배신 성공하기',  goal: 1, reward: 80, ev: 'betray' },
};
function missionState(u) {   // 날짜 바뀌면 자동 리셋
  const day = todayStr();
  if (!u.missions || u.missions.day !== day) u.missions = { day, prog: {}, claimed: {} };
  return u.missions;
}
function missionEvent(u, ev) {   // 진행도 +1, 목표 달성 시 즉시 코인 지급 → 완료 목록 반환
  const m = missionState(u); const done = [];
  for (const [id, def] of Object.entries(MISSIONS)) {
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
// 미션 현황 (클라 표시용)
function missionList(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null;
  if (!u) return { error: '로그인이 필요해요.' };
  const m = missionState(u);
  return {
    ok: true,
    list: Object.entries(MISSIONS).map(([id, def]) => ({
      id, name: def.name, goal: def.goal, reward: def.reward,
      prog: Math.min(m.prog[id] || 0, def.goal), claimed: !!m.claimed[id],
    })),
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

// 1일 접속 보상 (하루 1회)
function claimDaily(token) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return null;
  if (u.lastLoginDay === todayStr()) return { claimed: false, profile: profileOf(u) };
  u.lastLoginDay = todayStr();
  let amount = DAILY_LOGIN;
  if (u.plate === 'np_daily') amount += 20;   // 🍀 행운의 명패 착용 보너스
  u.coins = (u.coins || 0) + amount;
  persist(idl);
  return { claimed: true, amount, plateBonus: u.plate === 'np_daily' ? 20 : 0, profile: profileOf(u) };
}

// 결과 반영 (result: 'win'|'loss'|'draw') → { profile, rewards }
function recordResult(token, result, opts = {}) {
  const idl = tokenIndex[token]; const u = idl ? db.users[idl] : null; if (!u) return null;
  const base = (REWARDS[rewardKey(opts.vsBot, opts.difficulty)] || REWARDS.multi)[result] || { coins: 0, xp: 0 };
  const beforeLevel = levelOf(u.xp), beforeRank = rankOf(u.rp).name;
  const sameIp = !!opts.sameIp && !opts.vsBot;   // 같은 IP 멀티 = 파밍 방지

  if (result === 'win') { u.wins++; u.winStreak = (u.winStreak || 0) + 1; }
  else if (result === 'loss') { u.losses++; u.winStreak = 0; }

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
  if (result === 'win') missions.push(...missionEvent(u, 'win'));

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
      coins, xp, rp, firstWin, streak, streakCount: u.winStreak, sameIp,
      levelUp: afterLevel > beforeLevel ? afterLevel : 0,
      rankUp: (afterRank !== beforeRank && rp > 0) ? afterRank : 0,
      missions, titles,
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
  missionList, titleList, betrayEvent,
};
