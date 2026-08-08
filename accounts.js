// 계정 시스템 — 파일 저장, 비번 해싱, 랭크/레벨/전적
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'data', 'accounts.json');
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
    nickLocked: !!u.nickSet,   // false면 아직 무료 닉 설정 기회 남음 (소셜 첫 로그인 — provider 무관)
    level: levelOf(u.xp), xp: u.xp, xpInLevel: xpInLevel(u.xp), xpNeeded: levelInfo(u.xp).need,
    rp: u.rp, rank: rank.name, rankIcon: rank.icon, rankColor: rank.color,
    wins: u.wins, losses: u.losses,
    winRate: total ? Math.round(u.wins / total * 100) : 0,
    coins: u.coins || 0,
    shards: u.shards || 0,
    sinceLegend: u.sinceLegend || 0,
    nickColor: u.nickColor || null,          // 염색약 결과 (색 키)
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
  const cleaned = nick.replace(/[\s._-]/g, '');
  if (nick.length < 1 || nick.length > 12) return { error: '닉네임은 1~12자예요.' };
  if (BADWORDS.test(cleaned) || RESERVED_KEY.test(nick)) return { error: '사용할 수 없는 닉네임이에요.' };
  if (!validNick(nick)) return { error: '사용할 수 없는 닉네임이에요.' };
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
};

// ── 세트 보너스 ────────────────────────────────────────────────────────────
// 카드백·명패·테이블·카드앞면을 같은 테마로 맞춰 끼면 덤이 붙는다.
// 모으는 값어치를 만들되, 한 벌 값이 비싸므로 덤은 작게 잡았다.
const SETS = {
  crystal:  { back: 'back_crystal',  plate: 'np_crystal',  table: 'tbl_crystal',  face: 'face_crystal',  name: '크리스탈' },
  obsidian: { back: 'back_obsidian', plate: 'np_obsidian', table: 'tbl_obsidian', face: 'face_obsidian', name: '흑요석' },
  hanji:    { back: 'back_hanji',    plate: 'np_hanji',    table: 'tbl_hanji',    face: 'face_hanji',    name: '한지' },
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

// 어떤 상품이 어느 등급인지. 여기 없는 상품은 뽑기에 안 나온다
// (닉네임 변경권·확정권처럼 기능성인 것, 마일스톤 한정품).
const GACHA_TIER = {
  common: ['np_wood', 'tbl_forest', 'tbl_blue', 'stamp_win', 'place_dust', 'ava_rookie'],
  rare:   ['back_night', 'back_ruby', 'back_hanji', 'face_neon', 'face_classic',
           'tbl_purple', 'tbl_hanji', 'np_neon', 'np_hanji',
           'stamp_seal', 'place_spark', 'ava_gambler', 'ava_fox', 'vfx_confetti'],
  epic:   ['back_obang', 'back_galaxy', 'back_crystal', 'face_gold', 'face_crystal',
           'tbl_gold', 'tbl_crystal', 'np_gold', 'np_ruby', 'np_crystal',
           'emote_party', 'emote_animal', 'emote_battle', 'emote_taunt',
           'stamp_star', 'place_ember', 'ava_dealer', 'ava_cat', 'vfx_coinrain', 'vfx_thunder'],
  legend: ['back_obsidian', 'face_obsidian', 'tbl_obsidian', 'np_obsidian',
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
    pool: TIERS.flatMap((t) => GACHA_TIER[t]
      .filter((id) => Object.prototype.hasOwnProperty.call(SHOP, id))
      .map((id) => ({ id, tier: t, cost: SHARD_COST[t], name: SHOP[id].name, icon: SHOP[id].icon }))),
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
    const sh = SHARD_ON_DUP[tier] || 5;
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
  if (!Object.prototype.hasOwnProperty.call(TIER_OF, itemId)) return { error: '파편으로 바꿀 수 없는 아이템이에요.' };
  if (gachaLocks.has(idl)) return { error: '잠시 후 다시 시도해 주세요.' };
  gachaLocks.add(idl);
  try {
    u.items = u.items || {};
    if (u.items[itemId]) return { error: '이미 보유한 아이템이에요.' };
    // 값은 서버가 등급에서 뽑는다. 클라이언트가 보낸 값은 쓰지 않는다.
    const cost = SHARD_COST[TIER_OF[itemId]];
    if ((u.shards || 0) < cost) return { error: `파편이 부족해요. (보유 ${u.shards || 0} / 필요 ${cost})` };
    u.shards -= cost;
    u.items[itemId] = true;
    persist(idl);
    return { ok: true, itemId, cost, name: SHOP[itemId].name, profile: profileOf(u) };
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

  const amount = intOr(coins, NaN);
  if (!Number.isFinite(amount) || amount < 1) return { error: '지급할 코인을 1 이상으로 입력해주세요.' };
  if (amount > 100000) return { error: '한 장에 줄 수 있는 코인은 100,000까지예요.' };

  const n = Math.max(1, Math.min(200, intOr(count, 1)));
  const maxUses = Math.max(0, Math.min(100000, intOr(opts.maxUses, 1)));   // 0 = 무제한
  const days = Math.max(0, intOr(opts.days, 0));
  const expiresAt = days > 0 ? Date.now() + days * 86400000 : null;
  const memo = String(opts.memo || '').slice(0, 60);
  const minLevel = Math.max(0, Math.min(99, intOr(opts.minLevel, 0)));
  const out = [];
  for (let i = 0; i < n; i++) {
    let code;
    do { code = normCoupon(genCouponCode()); }
    while (Object.prototype.hasOwnProperty.call(db.coupons, code));
    db.coupons[code] = { code, coins: amount, maxUses, uses: 0, usedBy: {}, expiresAt, minLevel, memo, createdAt: Date.now() };
    persistCoupon(code);
    out.push(prettyCoupon(code));
  }
  return { ok: true, codes: out, coins: amount, maxUses, expiresAt, memo };
}

function couponList() {
  return Object.values(db.coupons)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 300)
    .map((c) => ({
      code: prettyCoupon(c.code), coins: c.coins, uses: c.uses, maxUses: c.maxUses,
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

    c.usedBy[idl] = Date.now();
    c.uses++;
    u.coins = (u.coins || 0) + c.coins;
    persistCoupon(key);
    persist(idl);
    return { ok: true, amount: c.coins, profile: profileOf(u) };
  } finally { cpnLocks.delete(lockKey); }
}

// 4인전 온라인 멀티 전용 RP 반영.
// 승/패 전적·코인·XP 는 건드리지 않는다 — 4인전 기록이 2인전 전적에 섞이면 안 되기 때문.
// 어뷰징 판단(사람 수·같은 IP·짧은 판)은 호출부에서 끝내고 여기서는 반영만 한다.
function applyRp4(token, delta) {
  const idl = tokenIndex[token];
  const u = idl && Object.prototype.hasOwnProperty.call(db.users, idl) ? db.users[idl] : null;
  if (!u) return null;
  const before = u.rp || 0;
  u.rp = Math.max(0, before + (Number(delta) || 0));
  persist(idl);
  return { profile: profileOf(u), before, after: u.rp, delta: u.rp - before };
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
  const quickBotWin = opts.vsBot && result === 'win';   // AI전 승리는 빨리 이겨도 인정 (실력)
  if (tooShort && !forfeitLoss && !quickBotWin) { blocked = true; reason = 'short'; }
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
  if (rp) u.rp = Math.max(0, u.rp + rp);

  // 레벨업 보상 + 마일스톤 (Lv10/20/50 최초 1회) — XP 반영 후 검사
  const lvNow = levelOf(u.xp);
  const levelCoins = grantLevelCoins(u, beforeLevel, lvNow);
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
      coins, xp, rp, firstWin, streak, clanBonus, plateCoin, plateXp, setName: fx.setName, levelCoins,
      streakCount: u.winStreak, blocked, reason,
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
  const r = rankOf(u.rp);
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
  if (BADWORDS.test(name.replace(/[\s._-]/g, '')) || BADWORDS.test(tag)) return { error: '사용할 수 없는 이름이에요.' };
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
  if (n && BADWORDS.test(n.replace(/[\s._-]/g, ''))) return { error: '사용할 수 없는 문구예요.' };
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
    .map(m => ({ id: m.id, idl: m.idl, nick: nickOfIdl(m.idl) || m.nick, text: m.text, at: m.at,
                 mine: m.idl === String(viewer.id).toLowerCase() }));
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
  if (BADWORDS.test(t.replace(/[\s._\-*]/g, ''))) return { error: '사용할 수 없는 표현이 있어요.' };

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
  signup, login, kakaoLogin, googleLogin, setNick, byToken, meByToken, recordResult, applyRp4, claimDaily, myRank,
  viceOf, clanCoinBonus,
  createCoupons, couponList, redeemCoupon,
  profileOf, topPlayers, shopList, buyItem, equipItem, equipTitle,
  gachaInfo, rollGacha, exchangeShard, GACHA_TIER, TIER_OF,
  missionList, titleList, betrayEvent, claimTutorial, applyReferral, deleteAccount,
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
