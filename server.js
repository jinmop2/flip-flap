const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const crypto = require('crypto');
const accounts = require('./accounts');
const webpush = require('web-push');
const ai = require('./expert4');        // 전문가 AI — 지금은 v4 (v3 + 출품 몬테카를로 + 덤 인식)
const items = require('./items');       // 아이템전(이벤트 모드) 아이템 12종
const twelve = require('./twelve');     // TWELVE — 칩으로 사는 경매 (모드 하나)
const stats = require('./stats');       // 방문·활동 통계 (자체 수집)
const { attach4 } = require('./server4'); // 4인전 (AI 3명) — 2인 엔진과 완전 분리

app.set('trust proxy', 1);
app.use(require('compression')());   // gzip — html/js/json 전송량 ~75% 절감
app.use(express.json({ limit: '4kb' }));
// 보안 헤더 (프레임 정책은 프리뷰 호환 위해 생략)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  // 방문 통계 (메인 페이지 로드만 집계)
  if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
    stats.pageview(ip);
  }
  next();
});

// 통계 대시보드 — Render 환경변수 STATS_KEY 필요 (예: /stats?key=내키)
app.get('/stats', rateLimit(20), (req, res) => {   // 키 무차별 대입 방지
  // 주소에 키가 실린 화면이다. 리퍼러로 남의 사이트에 넘어가거나 캐시에
  // 남으면 그 키가 그대로 새 나간다.
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  const KEY = process.env.STATS_KEY;
  if (!KEY) return res.status(403).send('Render 환경변수에 STATS_KEY를 설정한 뒤 /stats?key=<키>로 접속하세요.');
  if (req.query.key !== KEY) return res.status(403).send('잘못된 키입니다.');
  const rows = stats.report(30);
  const td = v => `<td>${v ?? 0}</td>`;
  res.send(`<!DOCTYPE html><meta charset="utf-8"><title>FLIP FLAP 통계</title>
<style>body{font-family:sans-serif;background:#22090e;color:#e8dfc8;padding:24px}table{border-collapse:collapse;width:100%;max-width:760px}
th,td{border:1px solid #5a3a20;padding:6px 12px;text-align:right}th{background:#3a1018;color:#ffd94a}td:first-child,th:first-child{text-align:left}
tr:nth-child(even){background:rgba(255,255,255,.03)}h1{color:#ffd94a;font-size:1.3rem}</style>
<h1>📊 FLIP FLAP — 최근 30일</h1>
<table><tr><th>날짜</th><th>페이지뷰</th><th>방문자</th><th>가입</th><th>게임</th><th>멀티</th><th>봇매치</th><th>튜토리얼</th><th>동접피크</th></tr>
${rows.map(r => `<tr><td>${r.day}</td>${td(r.pv)}${td(r.uv)}${td(r.signups)}${td(r.games)}${td(r.multi)}${td(r.botmatch)}${td(r.tutorial)}${td(r.peak)}</tr>`).join('')}
</table>`);
});
// 처리방침·약관·확률 — 셋 다 바깥에 공개돼 있어야 한다.
// 처리방침은 스토어 심사가, 확률은 게임산업법이 요구한다.
for (const [route, file] of [['/privacy', 'privacy.html'], ['/terms', 'terms.html'], ['/rates', 'rates.html']]) {
  app.get(route, rateLimit(30), (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(path.join(__dirname, file));
  });
}
app.get('/health', (req, res) => res.json({
  ok: true, rooms: Object.keys(rooms).length, uptime: Math.round(process.uptime()),
  store: accounts.storeInfo(),   // 지금 어디에 저장 중인지 (DB 연결 확인용)
}));

// Android TWA(Play스토어) 검증 — 앱 서명 SHA256 지문을 Render 환경변수 TWA_FINGERPRINT에 넣으면 자동 제공
app.get('/.well-known/assetlinks.json', (req, res) => {
  const fp = process.env.TWA_FINGERPRINT || '';
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: process.env.TWA_PACKAGE || 'com.mongdung.flipflap',
      sha256_cert_fingerprints: fp ? fp.split(',').map(s => s.trim()) : [],
    },
  }]);
});
// iOS 유니버설 링크(선택)
app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.json({ applinks: { apps: [], details: [] } });
});
// 2인전 규칙 — 서버와 화면이 같은 파일을 읽어야 판정이 안 갈라진다.
// public 안에 복사본을 두면 언젠가 한쪽만 고치게 된다.
for (const f of ['rules2.js', 'ai2.js', 'twelve.js', 'game4.js', 'ai4.js', 'items.js', 'view4.js', 'items2.js']) {
  app.get('/' + f, (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, f));
  });
}
// 브라우저는 <link rel="icon"> 이 있어도 /favicon.ico 를 한 번 찔러 본다.
// 404 면 즐겨찾기·주소창 같은 몇몇 자리가 빈 네모로 남는다 — 아이콘으로 보낸다.
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.type('png').sendFile(path.join(__dirname, 'public', 'icon-192.png'));
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, fp) {
    if (fp.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');                       // SW 갱신 즉시 감지
    // 아이콘·음악·폰트 7일 캐시. 이름이 그대로면 그 이레 동안 옛 그림이 계속
    // 나간다 — 아이콘을 바꿀 때는 주소 뒤의 ?v= 를 같이 올려야 한다.
    else if (/\.(png|jpg|svg|ico|mp3|m4a|woff2?)$/.test(fp)) res.setHeader('Cache-Control', 'public, max-age=604800');
    else res.setHeader('Cache-Control', 'no-cache');                                            // html/js: etag 재검증(304) — 배포 즉시 반영
  },
}));

// 간단 rate limit (IP·엔드포인트당 분당 N회) — 무차별 대입 방지
// 주의: 카운터를 IP만으로 잡으면 모든 API가 한 카운터를 공유해, 실효 한도가 가장 낮은
//      엔드포인트 값으로 떨어진다(예: 목록 몇 번 조회하면 클랜 생성이 막힘). 경로까지 키에 포함한다.
const rlMap = new Map();
const ipOf = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
function rateLimit(max) {
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
    const key = ip + '|' + req.path;
    const now = Date.now();
    let e = rlMap.get(key);
    if (!e || now - e.ts > 60000) { e = { count: 0, ts: now }; rlMap.set(key, e); }
    if (++e.count > max) return res.status(429).json({ error: '요청이 너무 많아요. 잠시 후 다시 시도하세요.' });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, e] of rlMap) if (now - e.ts > 120000) rlMap.delete(k); }, 120000);

// ── 인증 API ───────────────────────────────────────────────
// 가입 — IP 를 넘긴다. 한 곳에서 계정을 찍어내는 걸 계정 쪽에서 센다.
app.post('/api/signup', rateLimit(20), (req, res) => { const { id, password, nick } = req.body || {}; const out = accounts.signup(id, password, nick, ipOf(req)); if (out.ok) stats.bump('signups'); res.json(out); });
app.post('/api/login',  rateLimit(30), (req, res) => { const { id, password } = req.body || {}; res.json(accounts.login(id, password)); });
// 세션 확인. 여기서 잘못 답하면 화면이 로그인을 지운다 — 계정을 아직 다 못 읽었으면
// "만료" 가 아니라 "아직 준비 중" 이라고 답해야 한다. 상태 코드로도 구분되게 503 을 준다.
app.post('/api/me',     rateLimit(90), (req, res) => {
  const { token } = req.body || {};
  if (!accounts.storeReady())
    return res.status(503).json({ error: '서버가 준비 중이에요. 잠시 후 다시 시도해주세요.', retry: true });
  res.json(accounts.meByToken(token));
});

// ── 쿠폰 ───────────────────────────────────────────────────────────────────
// 사용자 — 코드를 넣으면 코인을 받는다. IP 를 같이 넘겨 무차별 대입을 막는다.
app.post('/api/coupon', rateLimit(12), (req, res) => {
  const { token, code } = req.body || {};
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
  res.json(accounts.redeemCoupon(token, code, ip));
});

// 관리자 — 키는 URL 쿼리가 아니라 본문으로 받는다.
// 쿼리로 받으면 브라우저 히스토리·리퍼러·서버 로그에 코인 발행 권한이 그대로 남는다.
const ADMIN_KEY = () => process.env.ADMIN_KEY || process.env.STATS_KEY;

// 이 키 하나로 코인 발행·계정 조작이 다 된다. 짧거나 뻔하면 그게 곧 뒷문이므로,
// 뜰 때 한 번 소리내어 알린다 (막지는 않는다 — 운영 중인 서버를 못 뜨게 하면 그게 더 큰 사고다).
(function warnWeakAdminKey() {
  const k = ADMIN_KEY();
  if (!k) return console.warn('⚠ ADMIN_KEY 가 없습니다 — 관리자 기능이 잠깁니다.');
  const weak = k.length < 20 ? '20자 미만'
             : /^[a-z]+$|^[0-9]+$/i.test(k) ? '한 종류 문자만'
             : /^(admin|test|flipflap|password|1234)/i.test(k) ? '뻔한 시작' : null;
  if (weak) console.warn('⚠ ADMIN_KEY 가 약합니다 (' + weak + '). 코인 발행 권한이 걸린 키입니다 — 무작위 32자 이상으로 바꿔주세요.');
})();

// 관리자 키 비교는 자리수마다 시간이 달라지면 안 된다 — 앞자리부터 맞춰 나갈 수 있다.
function keyEq(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}
// ── 관리자 문 ─────────────────────────────────────────────────────────────
//
// 키 하나로 코인 발행·계정 제재가 다 된다. 그래서 문 앞에 세 겹을 둔다.
//
//  ① 틀린 키를 반복하면 그 IP 를 잠근다.
//     경로마다 따로 세는 요율 제한(rateLimit)만으로는 부족하다 — 통로가 스물세 개라
//     경로를 돌려 가며 두드리면 한 경로당 한도는 안 걸리고 총 시도만 늘어난다.
//     그래서 '관리자 문' 이라는 한 계량기로 따로 센다.
//  ② 통과하면 짧은 수명의 표를 준다. 그 뒤로는 키가 아니라 표가 오간다 —
//     키가 오가는 횟수를 한 번으로 줄인다.
//  ③ 무엇을 누가 했는지 남긴다. 키는 공유되므로 이름을 같이 적는다.

const ADM_FAIL_MAX = 8;                 // 이만큼 틀리면
const ADM_LOCK_MS = 10 * 60 * 1000;     // 10분 잠근다
const admFail = new Map();              // ip -> { n, at, until }

function admLocked(ip) {
  const e = admFail.get(ip);
  if (!e || !e.until) return 0;
  if (Date.now() > e.until) { admFail.delete(ip); return 0; }
  return Math.ceil((e.until - Date.now()) / 1000);
}
function admMiss(ip) {
  const now = Date.now();
  let e = admFail.get(ip);
  if (!e || now - e.at > ADM_LOCK_MS) e = { n: 0, at: now, until: 0 };
  e.n++; e.at = now;
  if (e.n >= ADM_FAIL_MAX) { e.until = now + ADM_LOCK_MS; e.n = 0; }
  admFail.set(ip, e);
  // 잠근 것도 기록에 남긴다 — 누가 두드리고 있는지는 알아야 한다
  if (e.until) { try { accounts.adminLog('lock', null, { ip: admIpTag(ip) }); } catch (_) {} }
}
function admHit(ip) { admFail.delete(ip); }
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of admFail) if (now - e.at > ADM_LOCK_MS * 2 && !e.until) admFail.delete(k);
}, 10 * 60 * 1000);

// IP 를 그대로 기록에 남기지 않는다 — 잠금 기록에도 지문만 남긴다.
// 소금은 이 프로세스 안에서만 산다. 재시작하면 예전 지문과 비교가 안 되지만,
// 잠금 기록은 "지금 누가 두드리고 있나" 를 보는 것이라 그걸로 충분하다.
let _admSalt = null;
function admIpTag(ip) {
  if (!_admSalt) _admSalt = crypto.randomBytes(16).toString('hex');
  return crypto.createHash('sha256').update(_admSalt + '|' + String(ip || '')).digest('hex').slice(0, 12);
}

// ── 운영 세션 ─────────────────────────────────────────────────────────────
// 키를 매 요청마다 실어 보내면 그만큼 새 나갈 자리가 늘어난다(프록시 로그, 확장,
// 실수로 켠 개발자 도구). 한 번만 키를 보내고, 그 뒤로는 짧은 수명의 표를 쓴다.
const ADM_SESS_MS = 2 * 3600 * 1000;    // 2시간
const admSess = new Map();              // token -> { who, ip, at }
function admNewSession(who, ip) {
  const t = crypto.randomBytes(24).toString('hex');
  admSess.set(t, { who: String(who || '').slice(0, 24), ip, at: Date.now() });
  return t;
}
function admSession(req) {
  const t = req.body && req.body.sess;
  if (!t) return null;
  const e = admSess.get(t);
  if (!e) return null;
  if (Date.now() - e.at > ADM_SESS_MS) { admSess.delete(t); return null; }
  return e;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of admSess) if (now - e.at > ADM_SESS_MS) admSess.delete(k);
}, 15 * 60 * 1000);

function adminOk(req, res) {
  const KEY = ADMIN_KEY();
  if (!KEY) { res.status(403).json({ error: 'Render 환경변수에 ADMIN_KEY 를 설정해주세요.' }); return false; }
  const ip = ipOf(req);
  const left = admLocked(ip);
  if (left) { res.status(429).json({ error: `너무 여러 번 틀렸어요. ${Math.ceil(left / 60)}분 뒤에 다시 시도해주세요.` }); return false; }
  // 표가 있으면 표로, 없으면 키로
  const sess = admSession(req);
  if (sess) { req.admWho = sess.who; accounts.setAdminWho(sess.who); return true; }
  if (!req.body || !keyEq(req.body.key, KEY)) {
    admMiss(ip);
    res.status(403).json({ error: '잘못된 키입니다.' }); return false;
  }
  admHit(ip);
  req.admWho = String((req.body && req.body.who) || '').slice(0, 24);
  accounts.setAdminWho(req.admWho);
  return true;
}
// 백업 — 코인·전적·클랜은 한 번 날아가면 되돌릴 수 없다.
// 하루 한 번 저절로 뜨고, 관리자는 아무 때나 떠서 바깥에 보관할 수 있다.
app.post('/api/admin/backup-now', rateLimit(6), async (req, res) => {
  if (!adminOk(req, res)) return;
  res.json(await accounts.saveSnapshot());
});
app.post('/api/admin/backup-list', rateLimit(20), async (req, res) => {
  if (!adminOk(req, res)) return;
  res.json(await accounts.snapshotList());
});
// 지금 상태를 통째로 내려받는다 (바깥 보관용)
app.post('/api/admin/backup-dump', rateLimit(6), (req, res) => {
  if (!adminOk(req, res)) return;
  res.setHeader('Content-Disposition', 'attachment; filename="flipflap-backup.json"');
  res.json(accounts.snapshot());
});
app.post('/api/admin/season', rateLimit(20), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json({ ok: true, ...accounts.seasonState(), applied: accounts.checkSeason() });
});

app.post('/api/admin/coupon-new', rateLimit(20), (req, res) => {
  if (!adminOk(req, res)) return;
  const { count, coins, maxUses, days, memo, minLevel, title } = req.body || {};
  res.json(accounts.createCoupons(count, coins, { maxUses, days, memo, minLevel, title }));
});
app.post('/api/admin/coupon-list', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json({ ok: true, coupons: accounts.couponList() });
});

// ── 임시 계정 (코드 로그인) ──
// 만들기·재발급·끄기는 전부 관리자 키가 필요하다. 코드는 만들 때 딱 한 번 나온다 —
// 저장소에는 해시만 남으므로 나중에 다시 물어봐도 서버가 모른다.
app.post('/api/admin/temp-new', rateLimit(10), (req, res) => {
  if (!adminOk(req, res)) return;
  const { count, coins } = req.body || {};
  res.json(accounts.createTempAccounts(count, { coins }));
});
app.post('/api/admin/temp-list', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json(accounts.tempAccountList());
});
app.post('/api/admin/temp-rotate', rateLimit(20), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json(accounts.rotateTempCode((req.body || {}).id));
});
app.post('/api/admin/temp-revoke', rateLimit(20), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json(accounts.revokeTempCode((req.body || {}).id));
});

// 요청이 끝나면 이름을 비운다 — 다음 요청이 남의 이름으로 기록되면 안 된다
app.use('/api/admin', (req, res, next) => { res.on('finish', () => accounts.setAdminWho('')); next(); });

// ── 운영 API ───────────────────────────────────────────────────────────────
// 전부 adminOk 를 지난다. 키는 본문으로만 받고, 무엇을 할지는 서버가 정한다.
// 화면은 "누구에게 무엇을" 만 보내고 금액·기간의 한계는 accounts.js 가 자른다.

// 한눈 요약 + 최근 30일 + 지금 접속 수
app.post('/api/admin/overview', rateLimit(60), (req, res) => {
  if (!adminOk(req, res)) return;
  // 4인전 방 수는 server4 가 쥐고 있다 (attach4 가 돌려준 손잡이)
  res.json({
    ...accounts.adminOverview(),
    days: stats.report(30),
    live: {
      online: io.engine.clientsCount || 0,
      rooms: Object.keys(rooms).length,
      playing: Object.values(rooms).filter((r) => r && (r.game || r.tv)).length,
      quad: (typeof g4 !== 'undefined' && g4 && g4.count) ? g4.count() : 0,
      quadWaiting: (typeof g4 !== 'undefined' && g4 && g4.waiting) ? g4.waiting() : 0,
      uptime: Math.round(process.uptime()),
      store: accounts.storeInfo(),
    },
  });
});

// 사람 찾기 · 자세히 보기
app.post('/api/admin/users', rateLimit(60), (req, res) => {
  if (!adminOk(req, res)) return;
  const { q, limit, filter } = req.body || {};
  res.json(accounts.adminSearch(q, limit, filter));
});
app.post('/api/admin/user', rateLimit(60), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json(accounts.adminUser((req.body || {}).idl));
});
// 같은 기기에서 만들어진 계정들. 같은 공유기·PC방도 걸리므로 정황일 뿐이다.
app.post('/api/admin/same-device', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json(accounts.adminSameDevice((req.body || {}).idl));
});

// 제재 — 정지(게임 전체) · 재갈(말만)
app.post('/api/admin/ban', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  const { idl, days, reason, permanent } = req.body || {};
  const out = accounts.adminBan(idl, days, reason, permanent);
  // 켜 둔 창에서 계속 놀지 못하게 지금 붙어 있는 소켓도 끊는다
  if (out.ok) kickAccount(idl, accounts.banInfo({ ban: out.ban }));
  res.json(out);
});
app.post('/api/admin/unban', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json(accounts.adminUnban((req.body || {}).idl));
});
app.post('/api/admin/mute', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  const { idl, days, reason, permanent } = req.body || {};
  res.json(accounts.adminMute(idl, days, reason, permanent));
});
app.post('/api/admin/unmute', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json(accounts.adminUnmute((req.body || {}).idl));
});

// 코인 조정 (사고 복구용)
app.post('/api/admin/coins', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  const { idl, delta, memo } = req.body || {};
  res.json(accounts.adminCoins(idl, delta, memo));
});

// 쪽지 — 한 사람에게 / 전체에게
app.post('/api/admin/notice', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  const { idl, text } = req.body || {};
  const out = accounts.adminNotice(idl, text);
  if (out.ok) pushNotice(idl, text);           // 지금 접속 중이면 바로 띄운다
  res.json(out);
});
app.post('/api/admin/notice-all', rateLimit(6), (req, res) => {
  if (!adminOk(req, res)) return;
  const { text, minLevel } = req.body || {};
  const out = accounts.adminNoticeAll(text, { minLevel });
  // 지금 접속한 사람에게 바로 띄운다. 예전엔 io.emit 으로 전부에게 뿌려서,
  // 최소 레벨을 걸어 둬도 조건에 안 맞는 사람(게스트 포함)까지 창이 떴다.
  if (out.ok) {
    const msg = { text: String(text).slice(0, 500) };
    for (const idl of out.idls || []) {
      const sid = accountSockets.get(idl);
      if (sid) io.to(sid).emit('admin_notice', msg);
    }
  }
  delete out.idls;                       // 화면에 계정 목록까지 보낼 이유는 없다
  res.json(out);
});

// 신고함 · 운영 기록
app.post('/api/admin/reports', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json({ ok: true, list: accounts.reportList(200) });
});
app.post('/api/admin/log', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json({ ok: true, list: accounts.adminLogList(150) });
});

// 지금 그 계정으로 붙어 있는 소켓을 끊는다 (정지 즉시 반영)
function kickAccount(idl, ban) {
  const key = String(idl || '').toLowerCase();
  const sid = accountSockets.get(key);
  if (!sid) return;
  const sk = io.sockets.sockets.get(sid);
  if (!sk) return;
  try { sk.emit('banned', ban || null); } catch (_) {}
  setTimeout(() => { try { sk.disconnect(true); } catch (_) {} }, 400);
}
// 접속 중이면 쪽지를 바로 띄운다
function pushNotice(idl, text) {
  const sid = accountSockets.get(String(idl || '').toLowerCase());
  if (!sid) return;
  io.to(sid).emit('admin_notice', { text: String(text).slice(0, 500) });
}

// 관리자 페이지 — 키는 이 화면에서 입력받아 요청 본문으로만 보낸다 (URL 에 안 남음)
// 관리자 페이지. 화면은 admin.html 한 파일에 있다 —
// 예전엔 server.js 안의 155줄짜리 템플릿 문자열이었는데, 화면이 커질수록
// 서버 코드가 화면 코드에 묻힌다. 비밀은 안 들어 있다(키는 사람이 직접 넣는다).
app.get('/admin', rateLimit(20), (req, res) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'admin.html'));
});
// 운영 로그인 — 키가 맞으면 짧은 수명의 표를 준다. 그 뒤로는 표만 오간다.
app.post('/api/admin/session', rateLimit(20), (req, res) => {
  if (!adminOk(req, res)) return;
  const who = String((req.body && req.body.who) || '').replace(/[^가-힣a-zA-Z0-9 _.-]/g, '').slice(0, 24);
  const sess = admNewSession(who, ipOf(req));
  accounts.adminLog('login', null, { who: who || '(이름 없음)' });
  res.json({ ok: true, sess, who, expiresIn: ADM_SESS_MS });
});
// 표 버리기 (로그아웃)
app.post('/api/admin/logout', rateLimit(20), (req, res) => {
  const t = req.body && req.body.sess;
  if (t) admSess.delete(t);
  res.json({ ok: true });
});

// 쿠폰에 얹을 칭호 목록 (관리자 화면 드롭다운)
app.post('/api/admin/titles', rateLimit(30), (req, res) => {
  if (!adminOk(req, res)) return;
  res.json({ ok: true, list: Object.entries(accounts.TITLES).map(([id, t]) => ({ id, name: t.name, icon: t.icon })) });
});


app.post('/api/nick',   rateLimit(20), (req, res) => { const { token, nick } = req.body || {}; res.json(accounts.setNick(token, nick)); });
app.post('/api/delete-account', rateLimit(10), (req, res) => {   // 구글플레이 필수 정책 — 계정 영구 삭제
  const { token, password } = req.body || {};
  res.json(accounts.deleteAccount(token, password));
});

// ── 친구 ──
// accounts.js는 소켓을 모르므로, 접속 여부는 서버에서 덧붙인다.
// 접속 여부 + 지금 판에 들어가 있는지.
// 초대해 봐야 소용없는 상대를 미리 알려 주려고 둘을 갈라 본다.
// 2인전은 socket.roomId, 다인전은 socket.g4room 에 방이 들어 있다.
function busyState(idl) {
  const sid = accountSockets.get(idl);
  if (!sid) return { online: false, ingame: false };
  const sk = io.sockets.sockets.get(sid);
  if (!sk) return { online: false, ingame: false };
  // 어느 방인지도 준다 — 친구 목록에서 바로 관전하려면 방 번호가 있어야 한다.
  // 비밀방은 빼놓는다. 코드를 모르는 사람이 목록만 보고 들어가면 안 된다.
  const r = sk.roomId && rooms[sk.roomId];
  // 서버의 spectate 조건과 같아야 한다 — 버튼만 보이고 눌러도 안 되면 더 답답하다
  const watchable = !!(r && r.game && r.game.phase !== 'game_over' && !r.secret && !r.vsBot && !r.tutorial);
  // 다인전도 볼 수 있다. 어느 쪽 판인지 알려 줘야 클라이언트가 맞는 문을 두드린다.
  const w4 = (!watchable && g4 && g4.watchableRoomOf) ? g4.watchableRoomOf(sid) : null;
  return { online: true, ingame: !!(sk.roomId || sk.g4room),
    watch: watchable ? sk.roomId : (w4 || null),
    watchQuad: watchable ? false : !!w4 };
}
function withOnline(list) {
  return (list || []).map(f => ({ ...f, ...busyState(f.idl) }));
}
function notifyIdl(idl, event, payload) {   // 해당 계정이 접속 중이면 실시간 알림
  const sid = accountSockets.get(idl);
  if (sid) io.to(sid).emit(event, payload);
}
app.post('/api/friends', rateLimit(60), (req, res) => {
  const r = accounts.friendList((req.body || {}).token);
  if (!r.ok) return res.json(r);
  res.json({ ok: true, friends: withOnline(r.friends), reqIn: r.reqIn, reqOut: r.reqOut });
});
app.post('/api/friend-add', rateLimit(20), (req, res) => {
  const { token, nick } = req.body || {};
  const r = accounts.sendFriendReq(token, nick);
  if (r.ok && r.toIdl) notifyIdl(r.toIdl, 'friend_req', { nick: accounts.meByToken(token)?.profile?.nick || '' });
  if (r.ok && r.friendIdl) notifyIdl(r.friendIdl, 'friend_added', { nick: accounts.meByToken(token)?.profile?.nick || '' });
  res.json(r);
});
app.post('/api/friend-accept', rateLimit(30), (req, res) => {
  const { token, idl } = req.body || {};
  const r = accounts.acceptFriendReq(token, idl);
  if (r.ok && r.friendIdl) notifyIdl(r.friendIdl, 'friend_added', { nick: accounts.meByToken(token)?.profile?.nick || '' });
  res.json(r);
});
app.post('/api/friend-decline', rateLimit(30), (req, res) => {
  const { token, idl } = req.body || {};
  res.json(accounts.declineFriendReq(token, idl));
});
app.post('/api/friend-cancel', rateLimit(30), (req, res) => {
  const { token, idl } = req.body || {};
  res.json(accounts.cancelFriendReq(token, idl));
});
app.post('/api/friend-remove', rateLimit(30), (req, res) => {
  const { token, idl } = req.body || {};
  res.json(accounts.removeFriend(token, idl));
});

// ── 클랜 ──
app.post('/api/clan',        rateLimit(60), (req, res) => res.json(accounts.myClan((req.body || {}).token)));
app.post('/api/clan-list',   rateLimit(60), (req, res) => res.json(accounts.clanList(30, (req.body || {}).token)));
app.post('/api/clan-create', rateLimit(10), (req, res) => {
  const { token, name, tag } = req.body || {};
  res.json(accounts.createClan(token, name, tag));
});
app.post('/api/clan-apply', rateLimit(20), (req, res) => {
  const { token, clanId } = req.body || {};
  const r = accounts.applyClan(token, clanId);
  if (r.ok && r.ownerIdl) notifyIdl(r.ownerIdl, 'clan_apply', { nick: accounts.meByToken(token)?.profile?.nick || '' });
  res.json(r);
});
app.post('/api/clan-cancel-apply', rateLimit(20), (req, res) => {
  const { token, clanId } = req.body || {};
  res.json(accounts.cancelApply(token, clanId));
});
app.post('/api/clan-decide', rateLimit(30), (req, res) => {
  const { token, idl, accept } = req.body || {};
  const r = accounts.decideApplicant(token, idl, !!accept);
  if (r.ok && r.accepted && r.targetIdl) notifyIdl(r.targetIdl, 'clan_joined', { clan: r.clanName });
  res.json(r);
});
app.post('/api/clan-kick', rateLimit(20), (req, res) => {
  const { token, idl } = req.body || {};
  const r = accounts.kickMember(token, idl);
  if (r.ok && r.targetIdl) notifyIdl(r.targetIdl, 'clan_kicked', { clan: r.clanName });
  res.json(r);
});
app.post('/api/clan-transfer', rateLimit(10), (req, res) => {
  const { token, idl } = req.body || {};
  res.json(accounts.transferOwner(token, idl));
});
app.post('/api/clan-notice', rateLimit(20), (req, res) => {
  const { token, notice } = req.body || {};
  res.json(accounts.setClanNotice(token, notice));
});
app.post('/api/clan-leave',   rateLimit(20), (req, res) => res.json(accounts.leaveClan((req.body || {}).token)));
app.post('/api/clan-disband', rateLimit(10), (req, res) => {
  const r = accounts.disbandClan((req.body || {}).token);
  if (r.ok) for (const m of r.members) notifyIdl(m, 'clan_disbanded', {});
  res.json(r);
});

// ── 클랜 채팅 ── (닫힌 그룹 대화 — 검증·필터는 전부 서버에서)
app.post('/api/clan-chat', rateLimit(90), (req, res) => res.json(accounts.clanChatList((req.body || {}).token)));
app.post('/api/clan-chat-send', rateLimit(40), (req, res) => {
  const { token, text } = req.body || {};
  const r = accounts.clanChatSend(token, text);
  if (!r.ok) return res.json(r);
  // 접속 중인 클랜원에게 실시간 전달 (나를 차단한 사람은 targets 에서 이미 빠져 있다)
  for (const m of r.targets) notifyIdl(m, 'clan_chat', { msg: r.msg });
  res.json({ ok: true, msg: r.msg });
});
// ── 친구 1:1 채팅 ──
app.post('/api/dm', rateLimit(90), (req, res) => {
  const { token, idl } = req.body || {};
  res.json(accounts.dmList(token, idl));
});
app.post('/api/dm-send', rateLimit(40), (req, res) => {
  const { token, idl, text } = req.body || {};
  const r = accounts.dmSend(token, idl, text);
  if (!r.ok) return res.json(r);
  // 상대가 접속 중이면 바로 띄운다. 나를 차단했으면 target 이 null 이라 안 간다.
  if (r.target) notifyIdl(r.target, 'dm', { from: r.msg.idl, msg: r.msg });
  res.json({ ok: true, msg: { ...r.msg, mine: true } });
});
app.post('/api/dm-unread', rateLimit(60), (req, res) => res.json(accounts.dmUnread((req.body || {}).token)));

app.post('/api/chat-block', rateLimit(30), (req, res) => {
  const { token, idl, on } = req.body || {};
  res.json(accounts.blockUser(token, idl, on));
});
app.post('/api/chat-blocklist', rateLimit(30), (req, res) => res.json(accounts.blockList((req.body || {}).token)));
app.post('/api/chat-report', rateLimit(20), (req, res) => {
  const { token, msgId, reason } = req.body || {};
  const r = accounts.reportMessage(token, msgId, reason);
  if (r.ok && r.ownerIdl) notifyIdl(r.ownerIdl, 'clan_report', { nick: r.targetNick });   // 클랜장에게 알림
  res.json(r.ok ? { ok: true } : r);
});
// 운영자 확인용 신고 목록 — 통계와 같은 키로 보호
app.get('/reports', rateLimit(20), (req, res) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.STATS_KEY || req.query.key !== process.env.STATS_KEY) return res.status(404).send('Not found');
  res.json(accounts.reportList(100));
});
app.post('/api/daily',  rateLimit(30), (req, res) => { const { token } = req.body || {}; res.json(accounts.claimDaily(token) || { error: '로그인이 필요해요.' }); });
app.post('/api/missions', rateLimit(60), (req, res) => { const { token } = req.body || {}; res.json(accounts.missionList(token)); });
// 보상 수령 — 금액은 서버가 정한다. 화면은 어느 미션인지만 보낸다.
app.post('/api/mission-claim', rateLimit(40), (req, res) => { const { token, id } = req.body || {}; res.json(accounts.claimMission(token, id)); });
app.post('/api/tutorial-done', rateLimit(20), (req, res) => { const { token } = req.body || {}; const out = accounts.claimTutorial(token); if (out.claimed) stats.bump('tutorial'); res.json(out); });
// 친구 초대 — IP 를 넘긴다. 같은 곳에서 온 초대는 초대자 보상을 한 번만 친다.
app.post('/api/refer', rateLimit(10), (req, res) => { const { token, ref } = req.body || {}; res.json(accounts.applyReferral(token, ref, ipOf(req))); });
// ── 보너스 (지금은 무료, 나중에 광고) ──
// 금액도 횟수도 서버가 정한다. 화면은 '표를 받아' '돌려줄' 뿐이다.
// ── 알림 ─────────────────────────────────────────────────────────────────
// 웹 푸시. 키가 없으면 통째로 꺼진 채로 돈다 — 없다고 서버가 죽으면 안 된다.
// 아이폰은 홈 화면에 추가한 웹앱에서만, 그리고 iOS 16.4 이상에서만 온다.
const VAPID_PUB = process.env.VAPID_PUBLIC || '';
const VAPID_KEY = process.env.VAPID_PRIVATE || '';
const PUSH_ON = !!(VAPID_PUB && VAPID_KEY);
if (PUSH_ON) {
  webpush.setVapidDetails('mailto:jinmo9@yonsei.ac.kr', VAPID_PUB, VAPID_KEY);
} else {
  console.log('ℹ 알림 꺼짐 — VAPID_PUBLIC / VAPID_PRIVATE 환경변수가 없습니다.');
}

// 한 사람에게 보낸다. 기기가 여럿이면 다 보낸다.
// 죽은 구독(410 Gone · 404)은 그 자리에서 지운다 — 안 지우면 매번 실패한다.
async function pushTo(idl, payload) {
  if (!PUSH_ON) return 0;
  const subs = accounts.pushSubsOf(idl);
  if (!subs.length) return 0;
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 600 });
      sent++;
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 410 || code === 404) accounts.pushForget(idl, s.endpoint);
    }
  }));
  return sent;
}

app.get('/api/push-key', rateLimit(60), (req, res) => res.json({ key: VAPID_PUB || null }));
app.post('/api/push-on',  rateLimit(20), (req, res) => {
  const { token, sub } = req.body || {};
  if (!PUSH_ON) return res.json({ error: '지금은 알림을 켤 수 없어요.' });
  res.json(accounts.pushSave(token, sub));
});
app.post('/api/push-off', rateLimit(20), (req, res) => {
  const { token, endpoint } = req.body || {};
  res.json(accounts.pushDrop(token, String(endpoint || '')));
});

app.post('/api/bonus',       rateLimit(30), (req, res) => { const { token } = req.body || {}; res.json(accounts.bonusState(token)); });
app.post('/api/bonus-start', rateLimit(20), (req, res) => { const { token } = req.body || {}; res.json(accounts.bonusStart(token)); });
app.post('/api/bonus-claim', rateLimit(20), (req, res) => { const { token, ticket } = req.body || {}; res.json(accounts.bonusClaim(token, ticket)); });

// 운영 쪽지 — 본인이 읽는 쪽. 안 읽은 것만 준다.
app.post('/api/notices',      rateLimit(30), (req, res) => { const { token } = req.body || {}; res.json(accounts.myNotices(token)); });
app.post('/api/notices-read', rateLimit(30), (req, res) => { const { token } = req.body || {}; res.json(accounts.markNoticesRead(token)); });
app.post('/api/titles',   rateLimit(60), (req, res) => { const { token } = req.body || {}; res.json(accounts.titleList(token)); });
app.post('/api/equip-title', rateLimit(30), (req, res) => { const { token, titleId } = req.body || {}; res.json(accounts.equipTitle(token, titleId || null)); });
app.post('/api/myrank', rateLimit(60), (req, res) => { const { token } = req.body || {}; res.json({ ok: true, me: accounts.myRank(token) }); });
// 시즌도 같이 내려준다 — 소프트 리셋이 도는데 화면에 아무 표시가 없으면
// 유저는 등급이 왜 내려갔는지 모른다.
app.get('/api/leaderboard', rateLimit(60), (req, res) =>
  res.json({ ok: true, players: accounts.topPlayers(100), season: accounts.seasonState() }));
// ── 상점 ──
app.get('/api/shop', rateLimit(60), (req, res) => res.json({ ok: true, items: accounts.shopList() }));
app.post('/api/buy',   rateLimit(30), (req, res) => { const { token, itemId } = req.body || {}; res.json(accounts.buyItem(token, itemId)); });
app.post('/api/equip', rateLimit(30), (req, res) => { const { token, itemId, kind } = req.body || {}; res.json(accounts.equipItem(token, itemId, kind)); });
// ── 뽑기 ──
// 확률표는 서버가 쥔 값을 그대로 내려준다 — 화면 표시와 실제가 어긋날 수 없게.
app.get('/api/gacha', rateLimit(60), (req, res) => res.json({ ok: true, info: accounts.gachaInfo() }));
app.post('/api/gacha/roll', rateLimit(30), (req, res) => {
  const { token, count } = req.body || {};
  res.json(accounts.rollGacha(token, count));
});
app.post('/api/gacha/exchange', rateLimit(30), (req, res) => {
  const { token, itemId } = req.body || {};
  res.json(accounts.exchangeShard(token, itemId));
});
// 스포이드 — 담아 둔 색으로 되돌린다 (한 개 소모)
app.post('/api/pipette', rateLimit(20), (req, res) => {
  const { token } = req.body || {};
  res.json(accounts.usePipette(token));
});

// ── 카카오 간편로그인 (REST 키는 환경변수 KAKAO_REST_KEY) ──
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY || '';
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || '';   // 콘솔 [카카오 로그인>고급]의 Client Secret
// ── 구글 로그인 (환경변수 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) ──
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
function baseURL(req) { return `${req.protocol}://${req.get('host')}`; }
// 어떤 소셜 로그인이 설정됐는지 클라에 알림 (미설정 버튼은 숨김)
app.get('/api/auth-config', (req, res) => res.json({ kakao: !!KAKAO_REST_KEY, google: !!GOOGLE_ID }));
app.get('/api/kakao-enabled', (req, res) => res.json({ enabled: !!KAKAO_REST_KEY }));   // 하위호환
app.get('/auth/google', rateLimit(30), (req, res) => {
  if (!GOOGLE_ID) return res.redirect('/#kerr=' + encodeURIComponent('구글 로그인이 아직 설정되지 않았어요'));
  const redirect = encodeURIComponent(baseURL(req) + '/auth/google/callback');
  const p = new URLSearchParams({ client_id: GOOGLE_ID, redirect_uri: baseURL(req) + '/auth/google/callback', response_type: 'code', scope: 'openid email profile', prompt: 'select_account' });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
});
app.get('/auth/google/callback', rateLimit(30), async (req, res) => {
  try {
    const code = String(req.query.code || '');
    if (!code || !GOOGLE_ID) return res.redirect('/#kerr=' + encodeURIComponent('구글 인증이 취소됐어요'));
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: GOOGLE_ID, client_secret: GOOGLE_SECRET, redirect_uri: baseURL(req) + '/auth/google/callback', code }),
    });
    const tok = await tr.json();
    if (!tok.access_token) { console.error('구글 토큰 실패:', JSON.stringify(tok)); return res.redirect('/#kerr=' + encodeURIComponent('구글 인증에 실패했어요')); }
    const ur = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } });
    const gu = await ur.json();
    if (!gu.id) { console.error('구글 유저 조회 실패:', JSON.stringify(gu)); return res.redirect('/#kerr=' + encodeURIComponent('구글 정보를 가져오지 못했어요')); }
    const nick = gu.name || (gu.email ? gu.email.split('@')[0] : '플레이어');
    const out = accounts.googleLogin(gu.id, nick);
    if (out.isNew) stats.bump('signups');
    res.redirect('/#ktoken=' + out.token + (out.isNew ? '&knew=1' : ''));
  } catch (e) { console.error('구글 콜백 오류:', e.message); res.redirect('/#kerr=' + encodeURIComponent('구글 로그인 중 오류가 났어요')); }
});
app.get('/auth/kakao', rateLimit(30), (req, res) => {
  if (!KAKAO_REST_KEY) return res.redirect('/#kerr=' + encodeURIComponent('카카오 로그인이 아직 설정되지 않았어요'));
  const redirect = encodeURIComponent(baseURL(req) + '/auth/kakao/callback');
  res.redirect(`https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_KEY}&redirect_uri=${redirect}&response_type=code`);
});
app.get('/auth/kakao/callback', rateLimit(30), async (req, res) => {
  try {
    const code = String(req.query.code || '');
    if (!code || !KAKAO_REST_KEY) return res.redirect('/#kerr=' + encodeURIComponent('카카오 인증이 취소됐어요'));
    // 인가 코드 → 액세스 토큰
    const tr = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: KAKAO_REST_KEY, redirect_uri: baseURL(req) + '/auth/kakao/callback', code, ...(KAKAO_CLIENT_SECRET ? { client_secret: KAKAO_CLIENT_SECRET } : {}) }),
    });
    const tok = await tr.json();
    if (!tok.access_token) { console.error('카카오 토큰 실패:', JSON.stringify(tok)); return res.redirect('/#kerr=' + encodeURIComponent('카카오 인증에 실패했어요')); }
    // 회원번호·닉네임 조회
    const ur = await fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: 'Bearer ' + tok.access_token } });
    const ku = await ur.json();
    if (!ku.id) { console.error('카카오 유저 조회 실패:', JSON.stringify(ku)); return res.redirect('/#kerr=' + encodeURIComponent('카카오 정보를 가져오지 못했어요')); }
    const nick = (ku.kakao_account && ku.kakao_account.profile && ku.kakao_account.profile.nickname) || (ku.properties && ku.properties.nickname) || '플레이어';
    const out = accounts.kakaoLogin(ku.id, nick);
    // 토큰은 URL 프래그먼트로 전달 (서버 로그·리퍼러에 안 남음) — 클라가 저장 후 지움
    if (out.isNew) stats.bump('signups');
    res.redirect('/#ktoken=' + out.token + (out.isNew ? '&knew=1' : ''));   // 첫 로그인이면 닉 설정 유도
  } catch (e) { console.error('카카오 콜백 오류:', e.message); res.redirect('/#kerr=' + encodeURIComponent('카카오 로그인 중 오류가 났어요')); }
});

// ── 카드 모델 ──────────────────────────────────────────────
// card = { kind: 2|3|4|6, grade: n, id: kind*100+grade }
// 세트 조건 = kind (2짜리 2장, 3짜리 3장, 4짜리 4장, 6짜리 6장)
// A색 24장 = [2×2, 3×5, 4×7, 6×10]  (kind × count = 12)

// 2인전 규칙은 rules2.js 로 옮겼다 — 브라우저에서도 같은 셈을 써야 해서다.
// 여기서는 이름만 풀어 두고 아래 코드는 그대로 둔다(부르는 자리가 백 군데다).
const rules2 = require('./rules2');
const { SPEC, initDeck, strength, is610, is21, aBeatsB,
        checkSet, progress, needLeft, strengthSum, resolveByProgress,
        activePlayer, stateFor,
        judgeAuction, applyAuction, canContinue } = rules2;

// ── 게임 상태 ──────────────────────────────────────────────

function startTurn(game) {
  // 카드는 아직 안 뽑음 — 진행자가 덱을 클릭(draw)해야 공개
  game.auction = {
    centerCard: null, _offeredCard: null, auctionType: null,
    p1Bid: null, p2Bid: null, p1Submitted: false, p2Submitted: false,
    special: false,
  };
  game.phase = 'draw';
  if (game.itemMode) {   // 이번 경매 한정 효과·사용권은 턴마다 초기화
    game.fx = items.freshFx();
    game.itemUsed = { 1: false, 2: false };
  }
}

// 보너스 카드로 얻은 아이템을 양쪽에 알린다 — 뭘 얻었는지는 둘 다 본다.
// 공개라야 "쟤가 돋보기를 들었다" 를 셈에 넣을 수 있다.
function announceBonus(room, bonus) {
  if (!room || !bonus || !bonus.length) return;
  for (const b of bonus) {
    // 양쪽에 같은 것을 보낸다. 보너스는 "덱에서 뽑아 그 사람 손으로 간다" 가
    // 눈에 보여야 하는데, 받는 쪽과 보는 쪽이 다른 신호를 받으면 같은 장면을
    // 못 그린다. 아이템 이름·설명은 어차피 설명서에 다 있는 공개 정보다.
    // (받았다는 팝업은 카드가 도착한 뒤에 클라이언트가 띄운다)
    room.players.forEach((s2) => {
      if (s2) io.to(s2).emit('bonus_card', { seat: b.seat, item: b.item });
    });
    if (room.cpuIndex === b.seat - 1) room.cpuItemPending = true;
  }
}

// 아이템전 덱에 아이템 카드를 섞는다.
// 세트에 쓰이는 카드에 표시를 붙이는 게 아니라, 아이템 카드가 따로 있다.
//   · 종류·등급이 없으므로 세트 셈에 끼어들지 않는다
//   · 뽑히면 그 자리에서 하나 더 뽑는다 — 그래서 경매품이 세 장이 된다
//     (🏷 덤 카드 + 중앙 카드 + 출품 카드)
// 넉 장(보너스 2 · 덤 2)을 넣는다. 통째로 섞으면 안 된다.
// 중앙 덱은 12장이지만 판은 평균 6.3턴에 끝나(sim.js 4000판) 절반만 뒤집힌다.
// 그래서 16장 전체에 고루 섞으면 아이템 카드 한 장이 뒤집히는 앞쪽에 들어올
// 확률이 장당 절반도 안 됐다 — 재 보니 한 판에 0~1장만 나오는 판이 37.1%,
// 아예 한 장도 안 나오는 판이 12.2% 였다. 아이템전인데 아이템을 못 본다.
//
// 보통 카드 두 장마다 창을 하나 잡고, 창마다 아이템 카드를 한 장씩 꽂는다.
// 판이 길든 짧든 두 턴에 한 번꼴로 반드시 나온다 — 0~1장인 판 37.1% → 5.8%,
// 판당 1.95장 → 2.87장. 창 안의 자리는 무작위라 언제 나올지는 여전히 모른다.
// TWELVE 를 다시 시작하는 함수(tvStart)는 접속 처리 안쪽에 들어 있다.
// 재대결은 바깥(restartGame)에서 부르므로 참조를 하나 꺼내 둔다.
let tvRestart = null;
// TWELVE 를 다시 시작하는 함수(tvStart)는 접속 처리 안쪽에 들어 있다.

// tutorial — 각본대로 도는 판. 무엇이 언제 나올지를 정해 둔다.
// 예전엔 아이템전 튜토리얼인데도 덱이 무작위라, 아이템 한 장 못 보고
// 끝나는 판이 있었다. 배울 것을 우연에 맡기면 배우지 못하는 사람이 생긴다.
function createGame(itemMode = false, tutorial = false) {
  const deck = initDeck();
  // 선공 뽑기용 카드 2장 (덱과 별개 컨셉 카드)
  const all = initDeck();
  const pickCards = [all[0], all.find(c => c.id !== all[0].id)];
  const game = {
    centerDeck: deck.slice(0, 12),
    p1Hand: deck.slice(12, 18),
    p2Hand: deck.slice(18, 24),
    p1Acquired: [], p2Acquired: [],
    turn: 1, phase: 'pick', auctioneer: 1, auction: null,
    time: { 1: 300, 2: 300 },   // 체스 시계: 각 5분(초)
    pick: { cards: pickCards, choices: [null, null], revealed: false },  // 선공 결정
  };
  if (tutorial) {
    // 선공은 늘 사람이다. 상대가 먼저 잡으면 "덱을 탭하세요" 가 첫 턴에 안 나와,
    // 안내가 한 턴을 건너뛴 것처럼 보인다.
    game.tutFirst = 1;
  }
  if (itemMode) {
    game.itemMode = true;
    mixItemCards(game.centerDeck);
    // 아이템은 열세 가지를 한 벌로 섞어 놓고 위에서 뽑는다 — 등급 가중 없음.
    // 클라이언트로는 절대 안 나간다(다음에 뭐가 나올지 보이면 안 된다).
    game.itemDeck = items.newItemDeck();
    game.items = { 1: [], 2: [] };       // 보유 아이템 (최대 3)
    game.itemUsed = { 1: false, 2: false };  // 턴당 1개 제한
    game.fx = items.freshFx();           // 이번 경매에만 걸리는 효과
    if (tutorial) {
      // 첫 턴에 보너스, 둘째 턴에 덤. 두 가지가 어떻게 다른지는 말로 설명하는
      // 것보다 연달아 겪는 게 빠르다.
      const plain = game.centerDeck.filter(c => !c.item);
      game.centerDeck = [
        { item: 'bonus', id: 'it_tut_b' }, plain[0],
        { item: 'tip', id: 'it_tut_t' },   plain[1],
        ...plain.slice(2),
      ];
      // 손에 들어올 아이템도 정해 둔다 — pop 이 뒤에서 꺼내므로 거꾸로 쌓는다.
      // 돋보기부터: 효과가 눈에 바로 보이고, 져도 손해가 없다.
      const rest = game.itemDeck.filter(k => k !== 'magnify' && k !== 'bomb');
      game.itemDeck = [...rest, 'bomb', 'magnify'];
    }
  }
  return game;
}

// 선공 뽑기 완료 → 강한 카드 뽑은 사람이 선공
function resolvePick(game) {
  const p = game.pick;
  const c1 = p.cards[p.choices[0]], c2 = p.cards[p.choices[1]];
  game.auctioneer = game.tutFirst || (aBeatsB(c1, c2) ? 1 : 2);
  p.revealed = true;
  game.phase = 'pick_reveal';
}

// 현재 시간이 흐르는(행동해야 하는) 플레이어. 없으면 0


// ── CPU AI ──────────────────────────────────────────────────
// difficulty: easy | normal | hard | expert

// 혼자 두는 상대(AI)는 ai2.js 로 옮겼다 — 브라우저에서도 같은 셈을 써야 한다.
// 부르는 자리가 많아 이름만 풀어 둔다.
const ai2 = require('./ai2');
// 아이템전에서 화면과 같이 쓰는 셈 — 덱 섞기·중앙 뒤집기·AI 의 아이템 선택
const I2 = require('./items2');
const { mixItemCards, drawCenter, AI_USE_RATE } = I2;
const cpuPickItem = (g, me, room) => I2.pickItem(g, me, room && room.difficulty);
const { cpuTarget, prizeValue, bluffRate, cpuDecideBid, cpuChooseType, cpuChooseOffer,
        tutorialOffer, feasibleTarget, wantValue, denyValue, offerX, typeX,
        decideBidX, decideBidReverse } = ai2;


function cpuMaybeUseItem(roomId) {
  const room = rooms[roomId];
  if (!room?.game || room.cpuIndex === undefined) return false;
  const g = room.game;
  if (!g.itemMode || g.itemUsed[room.cpuIndex + 1]) return false;
  if (Math.random() > (AI_USE_RATE[room.difficulty] ?? 0.6)) return false;
  const me = room.cpuIndex + 1;
  const id = cpuPickItem(g, me, room);
  if (!id) return false;
  // 손바꿈은 대상 카드가 필요 — 세트에 안 쓰는 카드를 낸다
  let arg;
  if (id === 'swap') {
    arg = I2.swapArg(g, me);
    if (!arg) return false;
  }
  const out = items.use(g, me, id, arg);
  if (out.error) return false;
  const human = room.players[room.cpuIndex === 0 ? 1 : 0];
  if (human) io.to(human).emit('item_used', { byMe: false, itemId: id, name: out.name, icon: out.icon,
                                              msg: out.msg, blocked: !!out.blocked, reveal: null,
                                              fx: out.fx || null, seat: me });
  broadcast(roomId);
  return true;
}

// 재경매는 결과 공개(reveal) 시점에만 쓸 수 있어 일반 행동 흐름에 걸리지 않는다.
// 따로 처리하지 않으면 AI 인벤토리에 영원히 남아 슬롯만 차지한다.
function cpuMaybeRedo(roomId) {
  const room = rooms[roomId];
  if (!room?.game || room.cpuIndex === undefined) return;
  const g = room.game;
  if (!g.itemMode || g.phase !== 'reveal' || !g.auction) return;
  const me = room.cpuIndex + 1;
  if (g.itemUsed[me] || !(g.items[me] || []).includes('redo')) return;
  const p1W = g.fx.reverse ? strength(g.auction.p1Bid) > strength(g.auction.p2Bid)
                           : aBeatsB(g.auction.p1Bid, g.auction.p2Bid);
  if ((p1W ? 1 : 2) === me) return;                 // 이긴 경매는 다시 하지 않는다
  // 전문가는 값진 판을 놓쳤을 때 반드시 다시 한다. 아무 판에나 쓰면 정작
  // 승부처에서 손에 없다 — 값어치를 보고 고른다.
  if (room.difficulty === 'expert') {
    const myAcq = me === 1 ? g.p1Acquired : g.p2Acquired;
    const opAcq = me === 1 ? g.p2Acquired : g.p1Acquired;
    const prize = [g.auction.centerCard, g.auction._offeredCard].filter(Boolean);
    const want = prize.length
      ? Math.max(wantValue(prize, myAcq, feasibleTarget(myAcq, opAcq)), denyValue(prize, opAcq)) : 0;
    if (want < 0.35 && g.centerDeck.length > 4) return;
  } else if (Math.random() > 0.75) return;
  const out = items.use(g, me, 'redo');
  if (out.error) return;
  g.settleSeq = (g.settleSeq || 0) + 1;             // 이전 경매의 공개·정산 타이머 무효화
  const human = room.players[room.cpuIndex === 0 ? 1 : 0];
  if (human) io.to(human).emit('item_used', { byMe: false, itemId: 'redo', name: out.name, icon: out.icon,
                                              msg: out.msg, reveal: null, fx: out.fx || null, seat: me });
  broadcast(roomId);
  setTimeout(() => maybeCpuAct(roomId), 900);
}

// AI가 행동할 차례인지 확인하고 실행
function maybeCpuAct(roomId) {
  const room = rooms[roomId];
  if (!room?.game || room.cpuIndex === undefined) return;
  const g = room.game, ci = room.cpuIndex;

  // 아이템전: 자기 차례가 오면 먼저 아이템을 쓸지 판단 (연출을 볼 시간을 주고 이어서 행동)
  if (g.itemMode && !g.itemUsed[ci + 1] && ['draw', 'offer', 'choose_type', 'bidding'].includes(g.phase)) {
    const myTurn = ['draw', 'offer', 'choose_type'].includes(g.phase)
      ? g.auctioneer === ci + 1
      : !(ci === 0 ? g.auction?.p1Submitted : g.auction?.p2Submitted);
    if (myTurn && cpuMaybeUseItem(roomId)) {
      setTimeout(() => maybeCpuAct(roomId), 1500);   // 아이템 연출 뒤 원래 행동
      return;
    }
  }

  if (g.phase === 'draw' && g.auctioneer === ci + 1) {
    delay(roomId, () => {
      if (g.phase !== 'draw') return;
      announceBonus(room, drawCenter(g, room));
      broadcast(roomId); maybeCpuAct(roomId);
    }, 600, 500);
  }
  else if (g.phase === 'offer' && g.auctioneer === ci + 1) {
    delay(roomId, () => {
      if (g.phase !== 'offer') return;
      const hand = ci === 0 ? g.p1Hand : g.p2Hand;
      const acq  = ci === 0 ? g.p1Acquired : g.p2Acquired;
      const opp  = ci === 0 ? g.p2Acquired : g.p1Acquired;
      // 난이도별 AI: expert=v3(카운팅·MC) / 보통(hard·normal)=구 전문가 / easy=기존 유지
      // 튜토리얼: 사람이 모으는 종류를 출품해 세트 완성을 도움 (최대한 이기게)
      const card = room.tutorial
        ? tutorialOffer(hand, opp)
        : room.difficulty === 'expert'
        ? ai.offer({ hand, myAcq: acq, oppAcq: opp, center: g.auction.centerCard,
            deckLeft: g.centerDeck.length, oppHandLen: (ci === 0 ? g.p2Hand : g.p1Hand).length }, room.aiMem || (room.aiMem = ai.createMem()))
        : room.difficulty === 'easy' ? cpuChooseOffer(hand, acq)
        : offerX(hand, acq, opp);
      // AI 전략이 손패에 없는 카드를 고르면(과거엔 조용히 멈춰 게임이 교착됐다)
      // 손패 첫 장으로 대체해 어떻게든 진행시킨다. 손패가 아예 없으면 진행 자체가 불가.
      if (!hand.length) return endByProgress(roomId);
      let idx = card ? hand.findIndex(c => String(c.id) === String(card.id)) : -1;
      if (idx === -1) idx = 0;
      g.auction._offeredCard = hand.splice(idx, 1)[0];
      g.phase = 'choose_type';
      broadcast(roomId);
      maybeCpuAct(roomId);
    }, 700, 800);
  }
  else if (g.phase === 'choose_type' && g.auctioneer === ci + 1) {
    delay(roomId, () => {
      if (g.phase !== 'choose_type') return;
      const hand = ci === 0 ? g.p1Hand : g.p2Hand;
      const acq  = ci === 0 ? g.p1Acquired : g.p2Acquired;
      const opp  = ci === 0 ? g.p2Acquired : g.p1Acquired;
      const prize = [g.auction.centerCard, g.auction._offeredCard];
      const type = room.difficulty === 'expert'
        ? ai.type({ hand, myAcq: acq, oppAcq: opp, center: prize[0], offered: prize[1] }, room.aiMem || (room.aiMem = ai.createMem()))
        : room.difficulty === 'easy' ? cpuChooseType(hand, prize, acq, 'easy')
        : typeX(hand, prize, acq, opp);
      g.auction.auctionType = type === 'close' ? 'closed' : type;   // 'open'|'closed'
      // 배팅은 양쪽 모두 1장이 필요하다. 아이템(폭군 등)으로 손패가 어긋나면 여기서 막힌다.
      if (!g.p1Hand.length || !g.p2Hand.length) return endByProgress(roomId);
      g.phase = 'bidding';
      broadcast(roomId);
      maybeCpuAct(roomId);
    }, 500, 700);
  }
  else if (g.phase === 'bidding') {
    const submitted = ci === 0 ? g.auction.p1Submitted : g.auction.p2Submitted;
    if (submitted) return;
    // 진행자 먼저 배팅: CPU가 비진행자면 진행자(사람) 제출 후에만 배팅
    const isAuctioneer = g.auctioneer === ci + 1;
    if (!isAuctioneer) {
      const aucBid = g.auctioneer === 1 ? g.auction.p1Submitted : g.auction.p2Submitted;
      if (!aucBid) return;
    }
    delay(roomId, () => {
      if (g.phase !== 'bidding') return;
      const already = ci === 0 ? g.auction.p1Submitted : g.auction.p2Submitted;
      if (already) return;                 // 이미 배팅함(중복 방지)
      const hand = ci === 0 ? g.p1Hand : g.p2Hand;
      const acq  = ci === 0 ? g.p1Acquired : g.p2Acquired;
      const opp  = ci === 0 ? g.p2Acquired : g.p1Acquired;
      const prize = [g.auction.centerCard, g.auction._offeredCard];
      let bid;
      // 클로즈 후공이면 진행자 배팅 카드가 보임 → 최소 승리 배팅
      const visOpp = (!isAuctioneer && g.auction.auctionType === 'closed')
        ? (g.auctioneer === 1 ? g.auction.p1Bid : g.auction.p2Bid) : null;
      // 뒤집힌 판은 승부 규칙 자체가 달라 다른 셈이 필요하다 (난이도 공통)
      if (g.itemMode && g.fx && g.fx.reverse) {
        bid = decideBidReverse(hand, prize, acq, opp, visOpp, g.centerDeck.length);
      } else if (room.difficulty === 'expert') {
        // 치팅 방지: 클로즈 후공이면 출품 카드를 모름
        const offered = (isAuctioneer || g.auction.auctionType === 'open') ? g.auction._offeredCard : null;
        bid = ai.bid({
          hand, myAcq: acq, oppAcq: opp, center: g.auction.centerCard, offered, visOpp,
          auctionType: g.auction.auctionType, isAuctioneer, deckLeft: g.centerDeck.length,
          oppHandLen: (ci === 0 ? g.p2Hand : g.p1Hand).length,
          // 🏷 덤 — 경매품에 앞면으로 얹혀 둘 다 보고 있다. 진 쪽이 가져가므로
          // 이기는 값을 깎는다. 여태 안 넘겨 줘서 AI 는 이게 있는 줄도 몰랐다.
          tip: g.auction.tipCard || null,
        }, room.aiMem || (room.aiMem = ai.createMem()));
      } else if (room.difficulty === 'easy') {
        // 루키 모드: 항상 최약 카드만 배팅 → 첫 판은 사실상 승리 보장
        bid = room.rookie
          ? [...hand].sort((a, b) => strength(b) - strength(a))[0]
          : cpuDecideBid(hand, prize, acq, 'easy');
      } else {
        bid = decideBidX(hand, prize, acq, opp, visOpp, g.centerDeck.length);   // 보통 = 구 전문가
      }
      const idx = hand.findIndex(c => c.id === bid.id);
      if (idx === -1) return;
      const card = hand.splice(idx, 1)[0];
      if (ci === 0) { g.auction.p1Bid = card; g.auction.p1Submitted = true; }
      else           { g.auction.p2Bid = card; g.auction.p2Submitted = true; }
      resolveBidding(roomId);
    }, 600, 900);
  }
}

// 튜토리얼 방이면 클라이언트가 '알겠어요'를 누를 때까지 다음 진행을 보류
function tutGate(roomId, fn) {
  const room = rooms[roomId];
  if (!room) return;                       // 방이 사라졌으면 중단
  if (!room.tutHold) return fn();
  setTimeout(() => tutGate(roomId, fn), 250);
}
function delay(roomId, fn, base, rand) {
  setTimeout(() => tutGate(roomId, fn), base + Math.random() * rand);
}

// ── 방 관리 ────────────────────────────────────────────────

const rooms = {};
const accountSockets = new Map();   // idl → socketId (같은 계정 동시접속 차단)
const makeRoomId = () => Math.random().toString(36).slice(2, 7).toUpperCase();


// 관전자용 상태 — 공개 정보만 (양쪽 손패 내용은 숨김)
function stateForSpec(game) {
  const a = game.auction;
  let auction = null;
  if (a) {
    const reveal = game.phase === 'reveal';
    auction = {
      centerCard: a.centerCard,
      offeredCard: (a.auctionType === 'open' || reveal) ? a._offeredCard : null,
      auctionType: a.auctionType,
      // 관전자는 클로즈(공개 배팅)와 결과 공개 때만 배팅을 봄
      p1Bid: (reveal || (a.auctionType === 'closed' && a.p1Submitted)) ? a.p1Bid : null,
      p2Bid: (reveal || (a.auctionType === 'closed' && a.p2Submitted)) ? a.p2Bid : null,
      p1Submitted: a.p1Submitted, p2Submitted: a.p2Submitted,
    };
  }
  let pick = null;
  if (game.pick && (game.phase === 'pick' || game.phase === 'pick_reveal')) {
    pick = { choices: game.pick.choices, cards: game.pick.revealed ? game.pick.cards : [null, null] };
  }
  return {
    spec: true, phase: game.phase, turn: game.turn, auctioneer: game.auctioneer,
    centerDeckSize: game.centerDeck.length,
    p1HandLen: game.p1Hand.length, p2HandLen: game.p2Hand.length,
    p1Acq: game.p1Acquired, p2Acq: game.p2Acquired,
    auction, pick, time: game.time, active: activePlayer(game),
  };
}

function broadcast(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.progressAt = Date.now();   // 교착 감시용 — 판이 마지막으로 움직인 시각
  room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('state_update', stateFor(room.game, i)); });
  if (room.specs && room.specs.length) {
    const sp = stateForSpec(room.game);
    room.specs.forEach(sid => io.to(sid).emit('state_update', sp));
  }
}

// ── 체스 시계 (전역 틱 1개로 모든 방 처리 — 방마다 타이머 안 만듦) ──
function startClock(roomId) { const r = rooms[roomId]; if (r && !r.tutorial) r.clockOn = true; }   // 튜토리얼은 시간 무제한
function endClock(room) { if (room) room.clockOn = false; }
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (!room.clockOn) continue;
    const g = room.game;
    if (!g || g.phase === 'game_over') continue;
    const ap = activePlayer(g);
    if (ap) {
      g.time[ap] = Math.max(0, g.time[ap] - 1);
      if (g.time[ap] === 60)
        room.players.forEach(sid => { if (sid) io.to(sid).emit('time_warning', { player: ap }); });
      if (g.time[ap] <= 0) {
        g.phase = 'game_over';
        const winner = ap === 1 ? 2 : 1;
        finishStats(room, winner);
        room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_over', { winner, timeout: true, myIndex: i + 1 }); });
        endClock(room);
        continue;
      }
    }
    // 교착 안전장치 — AI전에서 사람 차례가 아닌데 판이 오래 멈춰 있으면 되살린다.
    // 정상 흐름의 최대 정지는 5초 남짓(쇼다운·공개·정산)이라 오탐 여지가 없다.
    // 유예 중(사람이 끊겨 돌아오기를 기다리는 중)에는 건드리지 않는다.
    // 안 그러면 AI 차례라고 판단해 판을 혼자 진행시키고, 32초에 진행도 판정으로
    // 끝내 버린다 — 60초를 주기로 한 약속이 무의미해진다.
    if (room.vsBot && !room.graceTimer && room.progressAt && g.phase !== 'game_over') {
      const idle = Date.now() - room.progressAt;
      const humanTurn = ap && room.cpuIndex !== undefined && ap !== room.cpuIndex + 1;
      if (!humanTurn && idle > 20000) {
        if (!room.nudged) {
          room.nudged = true;
          console.warn('[교착 감지] 방 %s phase=%s — 복구 시도', roomId, g.phase);
          // 단계마다 막힌 지점이 다르므로 그에 맞게 되살린다 (AI 재시동만으로는 정산 단계를 못 푼다)
          if (g.phase === 'settled') advanceTurn(roomId);
          else if (g.phase === 'reveal') settle(roomId);
          else if (g.phase === 'showdown') { g.phase = 'reveal'; broadcast(roomId); setTimeout(() => settle(roomId), 2500); }
          else maybeCpuAct(roomId);
        } else if (idle > 32000) { console.warn('[교착 지속] 방 %s — 진행도 판정으로 종료', roomId); endByProgress(roomId); }
      } else if (idle < 3000) room.nudged = false;
    }
    // 선공 뽑기(pick)는 시계가 흐르지 않음 → 45초 방치 시 자동 선택 (방 무기한 점유 방지)
    if (g.phase === 'pick' && g.pick) {
      room.pickIdle = (room.pickIdle || 0) + 1;
      if (room.pickIdle >= 10) {
        room.pickIdle = 0;
        const pk = g.pick;
        [0, 1].forEach(pi => { if (pk.choices[pi] === null) pk.choices[pi] = pk.choices[1 - pi] === 0 ? 1 : (pk.choices[1 - pi] === 1 ? 0 : pi); });
        resolvePick(g);
        broadcast(roomId);
        const rid = roomId;
        setTimeout(() => tutGate(rid, () => {
          const rm = rooms[rid]; if (!rm || !rm.game || rm.game.phase !== 'pick_reveal') return;
          startTurn(rm.game); broadcast(rid);
          setTimeout(() => maybeCpuAct(rid), 400);
        }), 2200);
      }
    } else room.pickIdle = 0;
    const clk = { t1: g.time[1], t2: g.time[2], active: ap };
    room.players.forEach(sid => { if (sid) io.to(sid).emit('clock', clk); });
    (room.specs || []).forEach(sid => io.to(sid).emit('clock', clk));
  }
}, 1000);

// ── 공개 방 목록 ────────────────────────────────────────────
function openRoomList() {
  const list = [];
  for (const [id, r] of Object.entries(rooms)) {
    if (!r.vsBot && !r.game && r.players[0] && !r.players[1])
      list.push({ id, name: r.name || '이름 없는 방', host: (r.nicks && r.nicks[0]) || '???',
                  hostColor: (r.profiles && r.profiles[0] && r.profiles[0].nickColor) || null,
                  secret: !!r.secret, mode: r.mode || 'classic' });   // 무슨 모드인지 알고 들어가야 한다
    // 진행 중인 멀티 게임 → 관전 가능 목록
    else if (!r.vsBot && r.game && r.game.phase !== 'game_over' && !r.secret)
      list.push({ id, live: true, name: `${r.nicks[0] || '?'} vs ${r.nicks[1] || '?'}`, turn: r.game.turn, specs: (r.specs || []).length });
  }
  return list.slice(-30).reverse();
}
// 로비 목록 브로드캐스트 — 빈번한 변경을 400ms로 묶어 폭증 방지
let roomsBcTimer = null;
// 시작 전 대기실에서 한 사람이 빠진다. 방은 남는다 — 아무도 없을 때만 지운다.
// 방장이 나가면 남은 사람이 방장을 물려받는다. 안 그러면 아무도 시작을 못 한다.
function leaveWaitingRoom(socket, roomId, slot) {
  const room = rooms[roomId];
  if (!room) { socket.roomId = null; socket.join('lobby'); return; }
  if (slot >= 0) {
    room.players[slot] = null; room.pids[slot] = null;
    room.nicks[slot] = null; room.profiles[slot] = null; room.tokens[slot] = null;
  }
  socket.leave(roomId);
  socket.roomId = null; socket.playerIndex = undefined;
  socket.join('lobby');

  // 자리를 앞으로 당긴다 — 0번이 방장이라 비워 두면 주인 없는 방이 된다.
  // 다인전이면 자리가 넷이라, 둘만 보고 당기면 3·4번이 남겨진다.
  {
    const cap = capOf(room);
    const keys = ['players', 'pids', 'nicks', 'profiles', 'tokens'];
    const kept = [];
    for (let i = 0; i < cap; i++) if (room.players[i]) kept.push(i);
    for (let i = 0; i < cap; i++) {
      const from = kept[i];
      for (const k of keys) room[k][i] = from === undefined ? null : room[k][from];
    }
    for (let i = 0; i < cap; i++) {
      const sk = room.players[i] && io.sockets.sockets.get(room.players[i]);
      if (sk) sk.playerIndex = i;
    }
  }
  if (!room.players.some(Boolean)) { delete rooms[roomId]; broadcastRooms(); return; }
  pushRoomLobby(roomId);
  broadcastRooms();
}

// 방 대기 화면 상태 — 방장인지, 둘 다 찼는지, 무슨 모드인지.
// 방장·손님이 서로 다른 것을 봐야 해서 사람마다 따로 보낸다.
// 이 방이 몇 자리짜리인가. 다인전을 고르면 넷으로 늘어난다 —
// 방을 닫고 옮기는 게 아니라 슬롯만 늘어난다.
// 미니게임도 자리가 넷이다. 인원을 미리 나누지 않고, 앉은 사람 수 그대로 판을 연다.
function capOf(room) { return room && (room.mode === 'quad' || room.mode === 'mini') ? 4 : 2; }

function pushRoomLobby(roomId) {
  const room = rooms[roomId];
  if (!room || room.game) return;
  const cap = capOf(room);
  const n = room.players.filter(Boolean).length;
  // 다인전은 셋부터 할 수 있다 (넷이 차면 더 못 들어온다).
  // 미니게임은 자리가 넷이어도 둘이면 선다 — 남은 자리는 AI 가 채운다.
  const ready = room.mode === 'mini' ? n >= 2 : (cap === 4 ? n >= 3 : n >= 2);
  const seats = [];
  for (let i = 0; i < cap; i++) {
    const sid = room.players[i];
    seats.push(sid ? { nick: room.nicks[i] || '???', profile: room.profiles[i] || null, host: i === 0 } : null);
  }
  room.players.forEach((sid, i) => {
    if (!sid) return;
    io.to(sid).emit('room_lobby', { host: i === 0, ready, mode: room.mode || 'classic',
      name: room.name || '', code: roomId, seats, me: i, cap });
  });
}

function broadcastRooms() {
  if (roomsBcTimer) return;
  roomsBcTimer = setTimeout(() => { roomsBcTimer = null; io.to('lobby').emit('rooms', openRoomList()); }, 400);
}
const cleanNick = n => (String(n || '').trim().slice(0, 8)) || '게스트';   // 닉 최대 8자 (accounts.NICK_MAX 와 맞춘다)
// 현재 접속 인원 브로드캐스트 (5초 주기 + 접속/해제 시)
function broadcastOnline() { stats.peak(io.engine.clientsCount); io.emit('online', io.engine.clientsCount); }
setInterval(broadcastOnline, 5000);
// 다인전은 별도 모듈이라 계정→소켓 표(accountSockets)를 모른다.
// 친구 초대 알림을 보내려면 그 통로가 필요해서 넘겨준다.
const g4 = attach4(io, { notifyIdl, sidOfIdl: (idl) => accountSockets.get(idl) || null });
const MAX_ROOMS = 800;               // 서버 전체 방 상한
const MAX_CONN_PER_IP = 8;           // IP당 소켓 연결 상한
const connByIp = new Map();
// 랭크게임에서 나올 수 있는 판. 무엇이 걸릴지 모르니 세 가지를 다 익혀야 한다 —
// 한 모드만 파고들어 점수를 쌓는 길을 막는 것이 이 무작위의 뜻이다.
const RANKED_MODES = ['classic', 'item', 'twelve'];
// 화면에서 모드 룰렛이 도는 시간. 이만큼은 판을 안 연다 — 클라이언트의
// rankRoulette(1.5초 회전 + 0.7초 멈춤)과 맞춰 둔다.
const RANK_SPIN_MS = 2300;
const pickRankedMode = () => RANKED_MODES[Math.floor(Math.random() * RANKED_MODES.length)];

let matchQueue = [];                  // 빠른 대전 대기열
const MATCH_BOT_WAIT = 10000;         // 이 시간 안에 상대 없으면 위장 전문가봇 투입 (빈손 이탈 방지)
const BOT_NICKS = ['달빛여우', '카드요정', '조용한상어', '느긋한거북', '불꽃토끼', '새벽부엉이', '미소천사', '포커페이스',
  '골목대장', '한장의승부', '바람의검객', '커피한잔', '야간비행', '슬로우스타터', '럭키세븐', '초코우유'];
function randomBotNick() {
  const base = BOT_NICKS[Math.floor(Math.random() * BOT_NICKS.length)];
  return Math.random() < 0.5 ? base : base + (2 + Math.floor(Math.random() * 97));
}
// 대기열 제거 (봇 투입 타이머까지 정리)
function dequeue(sid) {
  matchQueue = matchQueue.filter(q => {
    if (q.sid !== sid) return true;
    clearTimeout(q.botTimer);
    return false;
  });
}
// 15초 매칭 실패 → 전문가봇이 일반 유저처럼 입장 (멀티 보상 그대로)
// 10초 안에 사람이 안 잡히면 전문가 AI 가 들어온다. 빈손으로 나가느니
// 한 판 두는 편이 낫다 — 모드는 사람과 붙었을 때와 같은 규칙으로 무작위다.
// ranked=false 로 부르면 RP 가 안 걸리는 '빠른대전' 쪽에서도 같은 길을 쓴다.
function startBotMatch(entry, opts = {}) {
  dequeue(entry.sid);
  const s = io.sockets.sockets.get(entry.sid);
  if (!s || (s.roomId && rooms[s.roomId])) return;
  if (Object.keys(rooms).length >= MAX_ROOMS) return s.emit('error', '서버가 혼잡해요.');
  const u = entry.token && accounts.byToken(entry.token);
  const prof = u ? accounts.profileOf(u) : { nick: cleanNick(entry.nick), guest: true };
  const mode = opts.mode || pickRankedMode();
  const ranked = opts.ranked !== false;
  const roomId = makeRoomId();
  const LABEL = { classic: '클래식', item: '아이템전', twelve: 'TWELVE' };
  rooms[roomId] = {
    players: [entry.sid, null], pids: [entry.pid || null, null], nicks: [prof.nick, randomBotNick()],
    profiles: [prof, null], tokens: [entry.token || null, null],
    name: (ranked ? '랭크게임 · ' : '빠른대전 · ') + (LABEL[mode] || mode),
    game: null, vsBot: false, difficulty: 'expert',   // 보상은 멀티 기준
    secret: false, password: '', cpuIndex: 1, botMatch: true,
    itemMode: mode === 'item', mode,
    ranked,                                        // 랭크게임 대기 중 봇이 들어온 판
    aiMem: ai.createMem(),
  };
  rooms[roomId].profiles[1] = { nick: rooms[roomId].nicks[1], guest: true };   // 게스트 유저처럼 보이게
  s.leave('lobby'); s.join(roomId); s.roomId = roomId; s.playerIndex = 0; s.pid = entry.pid;
  rooms[roomId].startedAt = Date.now();
  s.emit('ranked_mode', { mode, bot: true });
  setTimeout(() => {
    const room = rooms[roomId];
    if (!room || room.game || room.tv) return;
    if (mode === 'twelve') { if (tvRestart) tvRestart(roomId); return; }
    room.game = createGame(room.itemMode);
    io.to(roomId).emit('game_start', { vsBot: false, roomId, nicks: room.nicks, profiles: room.profiles, itemMode: room.itemMode });
    broadcast(roomId);
    startClock(roomId);
    setTimeout(() => maybeCpuAct(roomId), 800);
  }, RANK_SPIN_MS);
}

// ── 소켓 ───────────────────────────────────────────────────

// 이벤트마다 최소 간격(ms). 사람이 손으로 누르는 속도로는 절대 안 걸리고,
// 스크립트로 몰아치는 것만 걸린다.
const SOCKET_GAP = {
  // 방·매칭 — 하나 만드는 데 방 목록 방송까지 딸려 온다
  create_room: 1500, quick_join: 1200, quick_match: 1200, quick_any: 1200, join_room: 800,
  tv_solo: 1200, mini_sit: 1000, mini_quick: 1200, tour_join: 1000,
  room_start: 800, room_mode: 300, room_kick: 500, rematch: 800, back_to_room: 600,
  challenge_friend: 1000, spec_challenge: 1000, challenge_accept: 800, spectate: 800,
  // 판 안의 수 — 사람이 누르는 간격보다 훨씬 짧게 잡아 둔다
  tv_act: 150, submit_bid: 200, use_item: 300, pick_card: 150,
  draw_card: 200, offer_card: 200, choose_auction: 200, mini_act: 150,
  auth: 500, enter_lobby: 400,
};

io.on('connection', (socket) => {
  // IP당 연결 수 제한 (DoS 방지)
  const ip = (socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || 'x').split(',')[0].trim();
  socket.clientIp = ip;   // 같은 IP 대전(코인 파밍) 감지용
  const n = (connByIp.get(ip) || 0) + 1; connByIp.set(ip, n);
  if (n > MAX_CONN_PER_IP) {
    // 거부한 연결은 카운트에서 즉시 빼야 한다. 여기서 return 하면 아래쪽 disconnect
    // 핸들러가 등록되지 않아 감소가 영영 일어나지 않고, 한 번 상한을 넘긴 IP가
    // 서버 재시작 전까지 영구 차단됐다 (통신사 NAT 뒤 유저들이 통째로 막힘).
    const back = n - 1;
    if (back <= 0) connByIp.delete(ip); else connByIp.set(ip, back);
    socket.emit('error', '연결이 너무 많아요.');
    socket.disconnect(true);
    return;
  }
  socket.emit('online', io.engine.clientsCount); broadcastOnline();

  // 소켓 이벤트 rate limit.
  //   ① 전체 초당 30건 — 브루트포스·스팸을 막는 큰 그물
  //   ② 무거운 일에는 따로 간격 — 방을 만들고 매칭을 걸고 판을 여는 것들은
  //      한 번에 하나면 충분하다. 큰 그물만으로는 초당 30번 방을 만들 수 있다.
  // 넘친 것은 조용히 버린다. 오류를 돌려주면 그것대로 응답을 만들어 주는 셈이다.
  socket.use((packet, next) => {
    const now = Date.now();
    if (!socket._rl || now - socket._rl.ts > 1000) socket._rl = { ts: now, c: 0 };
    if (++socket._rl.c > 30) return;   // 초과분은 조용히 드롭
    const ev = packet && packet[0];
    const gap = SOCKET_GAP[ev];
    if (gap) {
      socket._gaps = socket._gaps || {};
      if (now - (socket._gaps[ev] || 0) < gap) return;
      socket._gaps[ev] = now;
    }
    next();
  });

  socket.join('lobby');

  function leaveOldRoom() {
    const roomId = socket.roomId, old = roomId && rooms[roomId];
    if (!old) return;
    // 관전자였다면 관전 목록에서만 빠짐 — 남의 진행 중인 방을 삭제하면 안 됨
    if (socket.isSpec) {
      old.specs = (old.specs || []).filter(sid => sid !== socket.id);
      socket.leave(roomId); socket.roomId = null; socket.isSpec = false;
      broadcastRooms(); return;
    }
    if (old.graceTimer) { clearInterval(old.graceTimer); old.graceTimer = null; }
    endClock(old);
    const slot = old.players.indexOf(socket.id);
    const g = old.game;
    if (g && g.phase !== 'game_over' && !old.vsBot && slot !== -1) {
      // 진행 중 멀티를 두고 나감 → leave_room과 동일하게 몰수패 처리 + 상대 통보
      const winner = slot === 0 ? 2 : 1;
      g.phase = 'game_over';
      finishStats(old, winner, true);
      old.players.forEach((sid, i) => { if (sid && i !== slot) io.to(sid).emit('game_over', { winner, forfeit: true, myIndex: i + 1 }); });
    } else {
      old.players.forEach(sid => { if (sid && sid !== socket.id) io.to(sid).emit('opponent_left'); });
    }
    (old.specs || []).forEach(sid => io.to(sid).emit('opponent_left'));
    socket.leave(roomId);
    delete rooms[roomId]; socket.roomId = null; broadcastRooms();
  }

  // 로그인 토큰 연결 (계정 프로필)
  socket.on('auth', ({ token } = {}) => {
    // 계정을 아직 다 못 읽었으면 게스트로 확정 짓지 않는다 — 잠시 뒤 다시 물어보게 한다
    if (!accounts.storeReady()) { socket.emit('auth_retry'); return; }
    const u = token && accounts.byToken(token);
    // 정지 중이면 붙이지 않는다. 정지할 때 토큰을 끊으므로 여기까지 오는 일은
    // 드물지만, 끊기 직전에 인사가 스쳐 지나갈 수 있다 — 한 겹 더 둔다.
    { const b = u && accounts.banInfo(u); if (b) { socket.token = null; socket.emit('banned', b); return; } }
    if (u) {
      socket.token = token; socket.emit('auth_ok', { profile: accounts.profileOf(u) });
      // 같은 계정으로 다른 곳에서 이미 접속 중이면 기존 세션을 밀어냄 (최신 로그인 우선)
      const idl = String(u.id).toLowerCase();
      const prev = accountSockets.get(idl);
      if (prev && prev !== socket.id) {
        const ps = io.sockets.sockets.get(prev);
        if (ps) { ps.emit('dup_login'); setTimeout(() => { try { ps.disconnect(true); } catch (_) {} }, 400); }
      }
      accountSockets.set(idl, socket.id); socket.accountId = idl;
      accounts.touchSeen(token);        // 마지막 접속 시각 (운영 화면에서 본다)
    } else { socket.token = null; }
  });
  // 이 소켓 플레이어의 프로필 (로그인=계정, 아니면 게스트)
  function myProfile(nick) {
    if (socket.token) { const u = accounts.byToken(socket.token); if (u) return accounts.profileOf(u); }
    return { nick: cleanNick(nick), guest: true };
  }

  // ── 토너먼트 ──
  socket.on('tour_join', () => {
    if (tour && !tour.done) return socket.emit('tour_error', '이미 진행 중인 대회가 있어요. 잠시 후 다시 시도해주세요.');
    if (!socket.token) return socket.emit('tour_error', '로그인해야 참가할 수 있어요.');
    if (socket.tourWaiting) return socket.emit('tour_lobby', tourLobbyView());
    if (socket.roomId && rooms[socket.roomId]) return socket.emit('tour_error', '게임 중에는 참가할 수 없어요.');
    if (tourLobby && tourLobby.entrants.length >= TOUR.SIZE) return socket.emit('tour_error', '자리가 다 찼어요.');
    // 곧 시작하면 받지 않는다 — 참가비만 내고 못 들어가는 일이 없게
    if (tourLobby && tourLobby.startAt && tourLobby.startAt - Date.now() < 2000)
      return socket.emit('tour_error', '곧 시작해요. 잠시 후 다시 시도해주세요.');
    // 같은 계정이 두 자리를 먹지 못하게
    const u = accounts.byToken(socket.token);
    if (!u) return socket.emit('tour_error', '로그인이 필요해요.');
    const idl = String(u.id).toLowerCase();
    if (tourLobby && tourLobby.entrants.some((e) => e.idl === idl)) return socket.emit('tour_error', '이미 참가 중이에요.');

    // 참가비 — 서버에서만 뺀다
    const paid = accounts.tourEnter(socket.token, TOUR.ENTRY_FEE);
    if (paid.error) return socket.emit('tour_error', paid.error);
    socket.emit('profile', { profile: paid.profile });

    tourEnsureLobby();
    tourLobby.entrants.push({ key: socket.id, idl, nick: accounts.profileOf(u).nick,
                              isBot: false, token: socket.token });
    socket.tourWaiting = true;
    socket.leave('lobby');
    tourReschedule();
    pushTourLobby();
  });
  socket.on('tour_leave', () => { tourLeaveLobby(socket, true); socket.emit('tour_left'); });
  socket.on('tour_peek', () => {
    const joined = !!(tourLobby && tourLobby.entrants.some((e) => e.key === socket.id));
    socket.emit('tour_lobby', tourLobbyView(joined));
  });

  // ── 미니게임 (섯다식 두 장 승부, 2~4인) ──
  // 소켓 하나에 매인 부분만 여기에 둔다. 판·자리·돈은 아래쪽 miniTables 가 맡는다.
  socket.on('mini_sit',   ({ seats } = {}) => miniSit(socket, seats, 'solo'));
  socket.on('mini_quick', ({ seats } = {}) => miniSit(socket, seats, 'multi'));
  socket.on('mini_cancel', () => miniDequeue(socket, true));
  socket.on('mini_act',  ({ action } = {}) => miniHumanAct(socket, action));
  socket.on('mini_next', () => miniWantNext(socket));
  socket.on('mini_leave', () => miniStand(socket));

  socket.on('enter_lobby', () => { socket.join('lobby'); socket.emit('rooms', openRoomList()); });

  // 친구에게 도전장 — 내가 만든 비밀방 코드를 접속 중인 친구에게 실시간 전달
  socket.on('challenge_friend', ({ idl, roomId } = {}) => {
    if (!socket.token) return;
    const me = accounts.byToken(socket.token);
    if (!me) return;
    const myIdl = String(me.id).toLowerCase();
    idl = String(idl || '').toLowerCase();
    // 실제 친구인지 서버가 검증 (클라이언트 목록을 신뢰하지 않음)
    // 이벤트명 주의: 'challenged'/'challenge_*'는 관전자→승자 도전 기능이 이미 쓰고 있다. 반드시 분리한다.
    // 실패도 generic 'error'(클라이언트가 native alert로 띄움) 대신 전용 이벤트 → 토스트로 표시.
    if (!accounts.friendIdlsOf(myIdl).includes(idl)) return socket.emit('friend_challenge_fail', '친구가 아니에요.');
    const room = rooms[roomId];
    // 방장뿐 아니라 그 방에 앉아 있는 사람이면 빈자리로 친구를 부를 수 있다
    if (!room || !room.players.includes(socket.id)) return socket.emit('friend_challenge_fail', '방 정보가 올바르지 않아요.');
    const sid = accountSockets.get(idl);
    if (!sid) return socket.emit('friend_challenge_fail', '상대가 지금 접속 중이 아니에요.');
    io.to(sid).emit('friend_challenge', { from: me.nick, roomId, password: room.password || '' });
    // 앱을 안 보고 있어도 도전장은 알아야 한다 — 화면을 안 켜 놨으면 알림으로.
    // 닉네임은 사람이 쓴 글이라 그대로 넣지 않는다(알림 본문에서 잘라 쓴다).
    pushTo(idl, { kind: 'challenge', from: String(me.nick || '').slice(0, 20), roomId }).catch(() => {});
    socket.emit('friend_challenge_sent', { nick: accounts.nickOfIdl(idl) });
  });

  // 튜토리얼 체크포인트 — 설명 창이 떠 있는 동안 게임 진행 보류
  socket.on('tut_hold',    () => { const r = rooms[socket.roomId]; if (r && r.tutorial) r.tutHold = true; });
  socket.on('tut_release', () => { const r = rooms[socket.roomId]; if (r) r.tutHold = false; });

  socket.on('create_room', ({ vsBot = false, difficulty = 'hard', pid, name, nick, secret, password, tutorial, itemMode, stour } = {}) => {
    if (Object.keys(rooms).length >= MAX_ROOMS) return socket.emit('error', '서버가 혼잡해요. 잠시 후 시도하세요.');
    leaveOldRoom();
    socket.leave('lobby');
    const roomId = makeRoomId();
    const prof = myProfile(nick);
    rooms[roomId] = {
      players: [socket.id, null], pids: [pid || null, null], nicks: [prof.nick, null],
      profiles: [prof, null], tokens: [socket.token || null, null],
      name: String(name || '').trim().slice(0, 20), game: null, vsBot, difficulty,
      secret: !vsBot && !!secret, password: String(password || '').slice(0, 12),
      tutorial: vsBot && !!tutorial,   // 튜토리얼 모드: 확인 누를 때까지 진행 보류 + 시계 없음
      // 아이템전 튜토리얼이 필요하다. 예전엔 tutorial 이면 itemMode 를 껐는데,
      // 그러면 아이템전을 배우겠다고 눌러도 클래식 판이 열렸다.
      itemMode: !!itemMode,
      // 손으로 만든 사람 방은 방장이 모드를 고르고 눌러서 시작한다.
      // 빠른 매칭·AI 방은 예전처럼 바로 시작한다 — 거기서 기다리게 하면 뜻이 없다.
      hostStart: !vsBot,
      mode: itemMode ? 'item' : 'classic',
    };
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = 0; socket.pid = pid;
    if (vsBot) {
      // 첫 승 보장: 튜토리얼이거나, 쉬움 난이도의 무전적 유저(신규·게스트)면 AI가 봐줌
      const u0 = socket.token && accounts.byToken(socket.token);
      rooms[roomId].rookie = !!tutorial || (difficulty === 'easy' && (!u0 || (u0.wins || 0) === 0));
      rooms[roomId].cpuIndex = 1;
      rooms[roomId].nicks[1] = 'AI';
      rooms[roomId].profiles[1] = { nick: 'AI', guest: true, bot: true };
      rooms[roomId].game = createGame(rooms[roomId].itemMode, rooms[roomId].tutorial);
      rooms[roomId].startedAt = Date.now();
      rooms[roomId].aiMem = ai.createMem();   // 전문가 AI 카운팅 메모리
      // 대회 경기인지는 클라이언트 말이 아니라 서버가 쥔 대진으로 판정한다.
      // 모드·난이도가 서버가 뽑아 둔 것과 맞아야 한다 — 아니면 그냥 솔로 판이다.
      stourMark(socket, rooms[roomId], rooms[roomId].itemMode ? 'item' : 'classic', difficulty, stour);
      socket.emit('game_start', { vsBot: true, difficulty, roomId, nicks: rooms[roomId].nicks, profiles: rooms[roomId].profiles, itemMode: rooms[roomId].itemMode });
      broadcast(roomId);
      startClock(roomId);
      setTimeout(() => maybeCpuAct(roomId), 600);
    } else {
      socket.emit('room_created', { roomId, name: rooms[roomId].name });
      pushRoomLobby(roomId);          // 버튼 상태(아직 혼자다)를 바로 알려준다
      broadcastRooms();
    }
  });

  socket.on('join_room', ({ roomId, pid, nick, password }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', '방을 찾을 수 없어요.');
    const cap = capOf(room);
    if (room.game || room.players.filter(Boolean).length >= cap) return socket.emit('error', '이미 시작했거나 꽉 찬 방이에요.');
    if (room.secret) {
      if ((room.pwFails || 0) >= 10) return socket.emit('error', '비밀번호 시도 초과. 방이 잠겼어요.');
      if (String(password || '') !== room.password) { room.pwFails = (room.pwFails || 0) + 1; return socket.emit('need_password', { roomId, wrong: password != null }); }
    }
    const prof = myProfile(nick);
    let seat = -1;
    for (let i = 0; i < cap; i++) if (!room.players[i]) { seat = i; break; }
    if (seat < 0) return socket.emit('error', '이미 시작했거나 꽉 찬 방이에요.');
    room.players[seat] = socket.id; room.pids[seat] = pid || null; room.nicks[seat] = prof.nick;
    room.profiles[seat] = prof; room.tokens[seat] = socket.token || null;
    socket.leave('lobby');
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = seat; socket.pid = pid;
    // 손으로 만든 방은 방장이 모드를 고르고 시작한다. 예전엔 들어오는 순간 시작해서
    // "무슨 판인지" 고를 새가 없었다. 빠른 매칭으로 만든 방은 예전처럼 바로 시작한다.
    if (room.hostStart) { pushRoomLobby(roomId); broadcastRooms(); return; }
    room.game = createGame();
    room.startedAt = Date.now();
    io.to(roomId).emit('game_start', { vsBot: false, roomId, nicks: room.nicks, profiles: room.profiles });
    broadcast(roomId);
    startClock(roomId);
    broadcastRooms();
  });

  // 방장이 고른 모드 — 손님 화면에도 같이 비친다
  socket.on('room_mode', ({ mode } = {}) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.game || socket.playerIndex !== 0) return;

    // 다인전을 골라도 방은 그대로다. 자리만 둘에서 넷으로 늘어난다 —
    // 예전엔 여기서 곧장 다인전 엔진으로 옮겨서, 고르는 순간 화면이 판으로
    // 넘어가 버렸다. 실제로 옮겨 가는 것은 방장이 시작을 누를 때다.
    if (mode === 'quad') {
      room.mode = 'quad'; room.itemMode = false;
      pushRoomLobby(roomId); broadcastRooms();
      return;
    }
    // 랜덤 — 무엇을 할지는 시작을 누를 때 정해진다. 여기서 미리 뽑아 두면
    // 방장이 결과를 보고 다시 고를 수 있어 랜덤이 아니게 된다.
    // 다인전은 뺀다(엔진이 다르고 인원도 셋부터라 같은 줄에 못 세운다).
    if (mode === 'random') {
      room.mode = 'random'; room.itemMode = false;
      pushRoomLobby(roomId); broadcastRooms();
      return;
    }

    room.itemMode = mode === 'item';
    room.mode = mode === 'twelve' ? 'twelve' : (room.itemMode ? 'item' : 'classic');
    pushRoomLobby(roomId);
  });

  // 방장이 내보내기 — 시작 전 대기실에서만. 나간 사람은 로비로 돌아간다.
  socket.on('room_kick', ({ seat } = {}) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.game || socket.playerIndex !== 0) return;
    const i = Number(seat);
    if (!Number.isInteger(i) || i <= 0 || i >= capOf(room)) return;   // 방장 자신은 못 내보낸다
    const sid = room.players[i];
    if (!sid) return;
    const sk = io.sockets.sockets.get(sid);
    io.to(sid).emit('room_kicked');
    if (sk) leaveWaitingRoom(sk, roomId, i);
    else {
      room.players[i] = null; room.pids[i] = null;
      room.nicks[i] = null; room.profiles[i] = null; room.tokens[i] = null;
      pushRoomLobby(roomId); broadcastRooms();
    }
  });

  // 방장이 시작
  socket.on('room_start', ({ mode } = {}) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.game || socket.playerIndex !== 0) return;
    if (['item', 'classic', 'quad', 'twelve', 'mini', 'random'].includes(mode)) {
      room.mode = mode; room.itemMode = mode === 'item';
    }
    // 랜덤이면 지금 뽑는다 — 자리에 앉은 사람들이 무엇을 할지는 이 순간 정해진다.
    // 미리 뽑아 두면 방장이 결과를 보고 다시 고를 수 있어 랜덤이 아니게 된다.
    let roomSpin = false;
    if (room.mode === 'random') {
      const picked = pickRankedMode();
      room.mode = picked; room.itemMode = picked === 'item';
      io.to(roomId).emit('ranked_mode', { mode: picked, room: true });
      roomSpin = true;                     // 화면에서 룰렛이 도는 동안 기다린다
    }
    const here = room.players.filter(Boolean);
    // 다인전은 셋부터. 실제로 엔진을 갈아타는 것은 지금 이 순간이다 —
    // 모드를 고를 때가 아니라, 방장이 시작을 누를 때.
    if (room.mode === 'quad') {
      if (here.length < 3) return socket.emit('error', '다인전은 세 명부터 시작할 수 있어요.');
      const list = room.players
        .map((sid, i) => (sid ? { sid, nick: room.nicks[i] || '플레이어' } : null))
        .filter(Boolean);
      for (const { sid } of list) {
        const sk = io.sockets.sockets.get(sid);
        if (sk) { sk.leave(roomId); sk.roomId = null; sk.playerIndex = undefined; }
      }
      delete rooms[roomId];
      broadcastRooms();
      if (!g4.startGroup(list)) socket.emit('error', '다인전을 시작하지 못했어요.');
      return;
    }
    if (here.length < 2) return socket.emit('error', '상대가 아직 없어요.');
    // 랜덤이었으면 화면에서 룰렛이 도는 동안 기다렸다 연다
    if (roomSpin) { setTimeout(() => roomOpen(roomId, socket), RANK_SPIN_MS); return; }
    roomOpen(roomId, socket);
  });

  // 방에서 실제로 판을 여는 부분. 랜덤이면 룰렛이 멈춘 뒤에 불린다.
  function roomOpen(roomId, socket) {
    const room = rooms[roomId]; if (!room || room.game || room.tv) return;
    const here = room.players.filter(Boolean);
    if (here.length < 2) return;
    // 미니게임 — 인원을 미리 나누지 않는다. 방에 앉은 사람 수가 곧 자리 수다.
    // 자리 넷을 다 안 채워도 둘만 있으면 둘이서 시작한다.
    if (room.mode === 'mini') {
      const socks = here.map((sid) => io.sockets.sockets.get(sid)).filter(Boolean);
      if (socks.length < 2) return socket.emit('error', '상대가 아직 없어요.');
      // 앉을 수 있는지 먼저 본다. 방을 먼저 지우고 테이블을 열면, 못 앉는 사람이
      // 있을 때 방도 없고 판도 없는 자리에 남는다 — 실제로 게스트가 그렇게 갇혔다.
      // (미니게임은 코인을 달로 바꿔 앉으므로 로그인·코인이 있어야 한다)
      const bad = socks.filter((sk) => {
        if (!sk.token) return true;
        const u = accounts.byToken(sk.token);
        return !u || (u.coins || 0) < MINI_MIN_COIN;
      });
      if (bad.length) {
        for (const sk of bad) sk.emit('mini_error', `미니게임은 로그인하고 코인이 ${MINI_MIN_COIN} 이상 있어야 앉을 수 있어요.`);
        return socket.emit('error', bad.length === socks.length
          ? `미니게임은 로그인하고 코인이 ${MINI_MIN_COIN} 이상 있어야 해요.`
          : '아직 앉을 수 없는 사람이 있어요.');
      }
      for (const sk of socks) { sk.leave(roomId); sk.roomId = null; sk.playerIndex = undefined; }
      delete rooms[roomId];
      broadcastRooms();
      miniOpenTable(socks.length, socks, 'multi');
      return;
    }
    if (room.mode === 'twelve') { tvStart(roomId); return; }
    // createGame 에 모드를 넘겨야 한다. 손으로 items/itemUsed 만 채웠더니
    // fx(이번 경매 한정 효과)가 없어서 아이템을 쓰는 순간 전부 튕겼다 —
    // "멀티 아이템전이 작동 안 한다" 의 정체.
    room.game = createGame(!!room.itemMode);
    room.startedAt = Date.now();
    io.to(roomId).emit('game_start', { vsBot: false, roomId, nicks: room.nicks,
      profiles: room.profiles, itemMode: !!room.itemMode });
    broadcast(roomId);
    startClock(roomId);
    broadcastRooms();
  }

  // 새로고침/끊김 후 재접속
  socket.on('rejoin', ({ roomId, pid } = {}) => {
    const room = rooms[roomId];
    // 왜 못 돌아가는지 알려 준다 — "이전 게임이 끝났어요" 와 "그 방이 아니에요"
    // 는 사람이 할 일이 다르다.
    if (!room) return socket.emit('rejoin_failed', { why: 'gone' });
    if (!room.game || room.game.phase === 'game_over') return socket.emit('rejoin_failed', { why: 'over' });
    const slot = room.pids.indexOf(pid);
    if (slot === -1) return socket.emit('rejoin_failed', { why: 'notmine' });
    room.players[slot] = socket.id;
    socket.leave('lobby');
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = slot; socket.pid = pid;
    if (room.graceTimer) { clearInterval(room.graceTimer); room.graceTimer = null; }  // 유예 정지(남은 시간 유지)
    if (!room.clockOn) startClock(roomId);               // 멈췄던 시계 재개
    socket.emit('game_start', { vsBot: room.vsBot, difficulty: room.difficulty, roomId,
      nicks: room.nicks, profiles: room.profiles, itemMode: room.itemMode,
      // 돌아온 사람에게 자기 남은 유예를 알려 준다
      graceLeft: (room.graceLeft || [60, 60])[slot], strikes: (room.dcCount || [0, 0])[slot] });
    broadcast(roomId);
    const other = room.players[1 - slot];               // 재접속 알림은 상대에게만
    if (other) io.to(other).emit('opp_reconnected');
    setTimeout(() => maybeCpuAct(roomId), 300);
  });

  // 빠른 대전 (자동 매칭)
  socket.on('quick_match', ({ pid, nick } = {}) => {
    if (socket.roomId && rooms[socket.roomId]) return;
    dequeue(socket.id);
    // 예전엔 클래식·아이템전이 각자 줄을 서서, 사람이 적을 때 양쪽 다 안 잡혔다.
    // 이제 무엇을 할지는 붙고 나서 서버가 정하므로 줄은 하나면 된다 — 매칭도 그만큼 빨라진다.
    // 한 줄에 서지만 랭크와 빠른대전은 섞지 않는다 — 등급을 안 걸겠다고 누른
    // 사람을 랭크 판에 넣으면 약속을 어기는 것이다.
    let opp = null;
    for (let i = 0; i < matchQueue.length; i++) {
      const c = matchQueue[i];
      if (c.sid === socket.id || !io.sockets.sockets.get(c.sid)) {   // 끊긴 대기자는 정리
        clearTimeout(c.botTimer); matchQueue.splice(i, 1); i--; continue;
      }
      if (c.casual) continue;
      opp = c; matchQueue.splice(i, 1); break;
    }
    const me = { sid: socket.id, pid, nick, token: socket.token };
    if (opp) { clearTimeout(opp.botTimer); startMatch(opp, me); }
    else {
      me.botTimer = setTimeout(() => startBotMatch(me), MATCH_BOT_WAIT);   // 10초 뒤 전문가 AI
      matchQueue.push(me); socket.emit('queued');
    }
  });
  socket.on('cancel_match', () => { dequeue(socket.id); socket.emit('unqueued'); });
  // ── TWELVE ──────────────────────────────────────────────────────────────
  // 규칙은 twelve.js 가 전부 쥔다. 서버는 "누가 무엇을 했는지" 만 넘기고
  // 결과를 양쪽에 보낸다. AI 판이면 상대 자리를 여기서 대신 둔다.
  function tvPush(roomId) {
    const room = rooms[roomId]; const g = room && room.tv;
    if (!g) return;
    room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('tv_state', twelve.viewFor(g, i + 1)); });
    if (g.over) { tvFinish(roomId); return; }
    // 정산은 저절로 넘어간다. 보여줄 것(칩이 은행으로, 카드가 필드로)은 이미
    // 다 보여준 뒤라, 여기서 버튼을 한 번 더 누르게 하면 흐름만 끊긴다.
    if (g.phase === 'settled') {
      clearTimeout(room.tvNext);
      room.tvNext = setTimeout(() => {
        const r = rooms[roomId], gg = r && r.tv;
        if (!gg || gg.over || gg.phase !== 'settled') return;
        twelve.nextTurn(gg);
        tvPush(roomId);
        if (r.cpuIndex !== undefined) tvBot(roomId);
        // 칩이 은행으로 가고 카드가 날아 앉는 데까지 1.5초쯤. 그 뒤로 한 박자면
        // 결과를 읽을 수 있다 — 4.2초는 판이 멈춘 것처럼 길었다.
      }, 2600);
    }
  }
  // AI 자리를 둘 수 있는 만큼 둔다. 사람이 둘 차례가 오면 멈춘다.
  function tvBot(roomId) {
    const room = rooms[roomId]; const g = room && room.tv;
    if (!g || g.over || room.cpuIndex === undefined) return;
    const me = room.cpuIndex + 1;
    const acted = twelve.applyAi(g, me, Math.random, room.difficulty || 'hard');
    // 둔 게 없으면 아무것도 보내지 않는다.
    // 예전엔 무조건 보냈는데, 정산 중에 이게 한 번 더 날아가면 두 가지가 같이 망가졌다:
    //   · 화면이 정산 상태로 다시 그려져, 이미 날아간 낙찰 카드가 중앙에 도로 놓였다
    //   · tvPush 가 다음 판 타이머를 새로 걸어, 멈춰 있는 시간이 그만큼 늘어났다
    if (!acted) return;
    tvPush(roomId);
    // 사람이 따라올 만한 뜸. 값을 부르는 대목은 더 길게 — 그게 이 모드의 승부처다.
    const wait = (g.phase === 'bid' || g.phase === 'close') ? 2200 : 1500;
    if (acted && !g.over) setTimeout(() => tvBot(roomId), wait);
  }
  function tvFinish(roomId) {
    const room = rooms[roomId]; const g = room && room.tv;
    if (!g || room.tvDone) return;
    room.tvDone = true;
    clearTimeout(room.tvNext);
    clearTimeout(room.tvThink);
    room.players.forEach((sid, i) => {
      if (!sid) return;
      const me = i + 1;
      io.to(sid).emit('tv_over', { win: g.winner === me, endBy: g.endBy, view: twelve.viewFor(g, me) });
    });
    // 보상은 클래식 멀티와 같은 표를 쓴다. RP 는 랭크게임으로 걸린 판에서만
    // 움직인다 — 랭크는 세 모드가 무작위로 나오므로 트웰브라고 빼면 그 판만
    // 점수가 안 걸리는 셈이 되어, 트웰브가 뜨길 기다리는 사람이 생긴다.
    if (room.stour) {
      const i = room.players.indexOf(room.stour.sid);
      setTimeout(() => stourResult(room, i >= 0 && g.winner === i + 1), 900);
    }
    const turns = g.turn, playtimeSec = Math.round((Date.now() - (room.startedAt || Date.now())) / 1000);
    room.players.forEach((sid, i) => {
      const tok = room.tokens && room.tokens[i]; if (!tok) return;
      const me = i + 1;
      const out = accounts.recordResult(tok, g.winner === me ? 'win' : 'loss', {
        vsBot: !!room.vsBot, difficulty: room.difficulty || 'hard',
        oppLabel: room.vsBot ? 'AI' : (room.nicks ? room.nicks[1 - i] : '상대'),
        turns, playtimeSec, noRank: !room.ranked,  // 랭크로 걸린 판만 RP 반영
      });
      if (out) io.to(sid).emit('profile', { profile: out.profile, result: g.winner === me ? 'win' : 'loss', rewards: out.rewards });
    });
    setTimeout(() => { const r = rooms[roomId]; if (r && r.tv && r.tv.over) { delete rooms[roomId]; broadcastRooms(); } }, 60000);
  }
  // 시계 — 클래식과 같은 결로 1초마다. 자기 차례인 사람 것만 줄어든다.
  function tvClock(roomId) {
    const room = rooms[roomId]; const g = room && room.tv;
    if (!g || g.over || room.tvDone) return;
    const ap = twelve.activePlayer(g);
    if (ap) {
      g.time[ap] = Math.max(0, g.time[ap] - 1);
      if (g.time[ap] === 60) room.players.forEach((sid) => { if (sid) io.to(sid).emit('tv_warn', { player: ap }); });
      if (g.time[ap] <= 0) { twelve.timeout(g, ap); tvPush(roomId); return; }
    }
    // 숫자만 따로 보내 판 전체를 다시 그리지 않게 한다
    room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('tv_clock', { time: g.time, active: ap, me: i + 1 }); });
  }
  if (!io._tvClock) {
    io._tvClock = setInterval(() => {
      for (const id in rooms) if (rooms[id] && rooms[id].tv) tvClock(id);
    }, 1000);
  }

  function tvStart(roomId) {
    const room = rooms[roomId]; if (!room) return;
    room.tv = twelve.createGame({ first: 1 });
    room.startedAt = Date.now(); room.tvDone = false;
    room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('tv_begin', {
      roomId, me: i + 1, vsBot: !!room.vsBot,
      nicks: room.nicks, profiles: room.profiles }); });
    tvPush(roomId);
    tvBot(roomId);
    broadcastRooms();
  }
  tvRestart = tvStart;   // 재대결(restartGame)에서 부를 수 있게

  // 혼자 하기 (AI 와)
  // ── 솔로 토너먼트 ──────────────────────────────────────────
  socket.on('stour_start', ({ diff, nick, pid } = {}) => {
    const level = ['easy', 'hard', 'expert'].includes(diff) ? diff : 'hard';
    // pid 는 방에 들어갈 때만 적힌다. 대회는 방보다 먼저 열리므로 여기서 받아 둔다 —
    // 손님(비로그인)은 이게 없으면 소켓 id 로 잡혀 새로고침에 대회를 잃는다.
    if (pid && !socket.pid) socket.pid = String(pid).slice(0, 64);
    const own = stourOwner(socket);
    const cur = sTours.get(own);
    if (cur && !cur.done) { cur.sid = socket.id; cur.at = Date.now(); return stourPush(socket, cur); }
    const prof = myProfile(nick);
    const pool = TOUR._shuffle(STOUR_NAMES).slice(0, TOUR.SIZE - 1);
    // 자리 열쇠도 소켓이 아니라 사람으로 — 소켓이 바뀌어도 내 자리를 잃지 않는다
    const entrants = [{ key: own, nick: prof.nick, isBot: false, token: socket.token || null }];
    for (const n of pool) entrants.push({ key: 'ai_' + n, nick: n, isBot: true, token: null });
    const b = TOUR.createBracket(entrants, null, STOUR_BEST_OF);
    const t = {
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      b, diff: level, seat: b.seats.findIndex(x => x.key === own),
      wins: 0, mode: null, done: false, token: socket.token || null,
      own, sid: socket.id, at: Date.now(),
    };
    sTours.set(own, t);
    stourPush(socket, t);
  });

  // 새로고침하고 돌아왔다 — 하던 대회가 있으면 그대로 돌려준다.
  socket.on('stour_resume', ({ pid } = {}) => {
    if (pid && !socket.pid) socket.pid = String(pid).slice(0, 64);
    const t = sTours.get(stourOwner(socket));
    if (!t || t.done) return socket.emit('stour_none');
    t.sid = socket.id; t.at = Date.now();
    t.pending = 0;                       // 끊겼다 왔으면 띄워 둔 판은 없던 것으로
    stourPush(socket, t);
  });

  // 다음 경기 모드를 뽑는다. 뽑는 것은 서버다 — 클라이언트가 고르면
  // 자신 있는 모드만 골라 올라갈 수 있다.
  socket.on('stour_next', () => {
    const t = sTours.get(stourOwner(socket));
    if (t) { t.sid = socket.id; t.at = Date.now(); }
    if (!t || t.b.over || t.done) return;
    if (stourMyMatch(t) < 0) return;
    // 이미 한 판을 띄웠으면 또 뽑지 않는다. 두 번 누르면 방이 두 개 열리고,
    // 두 번째 방을 만들며 첫 방을 나가는 셈이 되어 몰수패로 적힌다.
    if (t.pending && Date.now() - t.pending < 20000) return;
    t.pending = Date.now();
    t.mode = stourMode();
    socket.emit('stour_go', { mode: t.mode, diff: t.diff, round: t.b.round,
                              roundName: TOUR.roundName(t.b.round, t.b) });
  });

  socket.on('stour_quit', () => { sTours.delete(stourOwner(socket)); });

  socket.on('tv_solo', ({ pid, nick, diff, stour } = {}) => {
    const level = ['easy', 'hard', 'expert'].includes(diff) ? diff : 'hard';
    const label = level === 'easy' ? '쉬움' : level === 'expert' ? '전문가' : '보통';
    if (socket.roomId && rooms[socket.roomId]) return;
    if (Object.keys(rooms).length >= MAX_ROOMS) return socket.emit('error', '서버가 혼잡해요.');
    leaveOldRoom();
    const prof = myProfile(nick);
    const roomId = makeRoomId();
    rooms[roomId] = {
      players: [socket.id, null], pids: [pid || null, null], nicks: [prof.nick, 'TWELVE AI'],
      profiles: [prof, { nick: 'TWELVE AI', guest: true, cpuDiff: label }], tokens: [socket.token || null, null],
      name: 'TWELVE', game: null, vsBot: true, difficulty: level,
      secret: false, password: '', mode: 'twelve', cpuIndex: 1,
    };
    socket.leave('lobby');
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = 0; socket.pid = pid;
    stourMark(socket, rooms[roomId], 'twelve', level, stour);
    tvStart(roomId);
  });

  // 한 수 두기 — 규칙 검사는 전부 twelve.js 가 한다
  socket.on('tv_act', (data = {}) => {
    const roomId = socket.roomId; const room = rooms[roomId];
    const g = room && room.tv;
    if (!g || g.over) return;
    const me = (socket.playerIndex === undefined ? -1 : socket.playerIndex) + 1;
    if (me !== 1 && me !== 2) return;
    let ok = false;
    switch (data.act) {
      case 'draw':     ok = twelve.draw(g, me); break;
      // 아직 방식을 안 골랐으면 출품 카드를 다시 고를 수 있다
      case 'offer':    ok = g.phase === 'choose' ? twelve.reoffer(g, me, data.cardId)
                                                 : twelve.offer(g, me, data.cardId); break;
      case 'choose':   ok = twelve.chooseType(g, me, data.type); break;
      case 'raise':    ok = twelve.raise(g, me, data.amount); break;
      case 'fold':     ok = twelve.fold(g, me); break;
      case 'closeBet': ok = twelve.closeBet(g, me, data.amount); break;
      case 'take':     ok = twelve.closeTake(g, me); break;
      case 'decline':  ok = twelve.closeDecline(g, me); break;
      case 'next':     ok = twelve.nextTurn(g); break;
      default: return;
    }
    if (!ok) return tvPush(roomId);      // 안 먹힌 행동 — 화면만 다시 맞춘다
    tvPush(roomId);
    // 내가 두자마자 AI 가 받아치면 정신이 없다. 사람이 방금 둔 수를 한 번
    // 보고 넘어갈 만큼은 기다린다 — 값을 부르는 대목은 더 길게.
    const room2 = rooms[roomId];
    if (room2 && room2.cpuIndex !== undefined) {
      clearTimeout(room2.tvThink);
      const pause = (g.phase === 'bid' || g.phase === 'close') ? 1400 : 900;
      room2.tvThink = setTimeout(() => tvBot(roomId), pause);
    }
  });


  // 빠른 입장 — 랭크가 안 걸린 판. 그 모드로 열려 있는 방이 있으면 거기로
  // 들어가고, 없으면 하나 열어 두고 기다린다(다음 사람이 들어오면 바로 시작).
  // 매칭 대기열이 아니라 "방" 이라 무엇을 기다리는지가 방 목록에 보인다.
  // ⚡ 빠른대전 — 모드를 안 가리고 "지금 가장 빨리 시작될 방" 으로 들여보낸다.
  // 빠른 입장(quick_join)은 모드를 골라 그 모드의 방만 찾는데, 사람이 적을 땐
  // 고른 모드에 아무도 없어 하염없이 기다리게 된다. 여기서는 열린 방 전부를
  // 보고 가장 많이 찬 방부터 넣는다 — 한 자리만 채우면 바로 시작하는 방이다.
  socket.on('quick_any', ({ pid, nick } = {}) => {
    if (socket.roomId && rooms[socket.roomId]) return;
    dequeue(socket.id);
    const joinable = Object.keys(rooms).filter((id) => {
      const r = rooms[id];
      if (!r || r.game || r.tv || r.secret || r.vsBot || r.tutorial || r.ranked) return false;
      const n = r.players.filter(Boolean).length;
      return n > 0 && n < capOf(r);
    });
    // 빈자리가 적게 남은 방이 먼저 — 그 방이 가장 빨리 찬다
    joinable.sort((x, y) => {
      const left = (id) => capOf(rooms[id]) - rooms[id].players.filter(Boolean).length;
      return left(x) - left(y);
    });
    const openId = joinable[0];
    if (openId) {
      const room = rooms[openId];
      const cap = capOf(room);
      let seat = -1;
      for (let i = 0; i < cap; i++) if (!room.players[i]) { seat = i; break; }
      if (seat >= 0) {
        const prof = myProfile(nick);
        room.players[seat] = socket.id; room.pids[seat] = pid || null; room.nicks[seat] = prof.nick;
        room.profiles[seat] = prof; room.tokens[seat] = socket.token || null;
        socket.leave('lobby');
        socket.join(openId); socket.roomId = openId; socket.playerIndex = seat; socket.pid = pid;
        socket.emit('quick_any_found', { mode: room.mode || 'classic', name: room.name || '' });
        pushRoomLobby(openId);
        broadcastRooms();
        return;
      }
    }
    // 들어갈 방이 하나도 없다 — 그래도 가장 빠른 길은 판을 여는 것이다.
    // 같은 버튼을 누른 사람끼리 먼저 붙이고, 10초 안에 없으면 전문가 AI 가 온다.
    // 어느 쪽이든 RP 는 안 걸린다 — 모드를 안 고른 대신 등급도 안 거는 것이
    // 이 버튼의 약속이다.
    let mate = null;
    for (let i = 0; i < matchQueue.length; i++) {
      const c = matchQueue[i];
      if (c.sid === socket.id || !io.sockets.sockets.get(c.sid)) {
        clearTimeout(c.botTimer); matchQueue.splice(i, 1); i--; continue;
      }
      if (!c.casual) continue;
      mate = c; matchQueue.splice(i, 1); break;
    }
    const me = { sid: socket.id, pid, nick, token: socket.token, casual: true };
    if (mate) { clearTimeout(mate.botTimer); return startMatch(mate, me, { ranked: false }); }
    me.botTimer = setTimeout(() => startBotMatch(me, { ranked: false }), MATCH_BOT_WAIT);
    matchQueue.push(me);
    socket.emit('queued', { casual: true });
  });

  socket.on('quick_join', ({ mode, pid, nick } = {}) => {
    if (socket.roomId && rooms[socket.roomId]) return;
    dequeue(socket.id);
    if (!['classic', 'item', 'quad', 'twelve', 'mini'].includes(mode)) return socket.emit('error', '알 수 없는 모드예요.');
    const item = mode === 'item';

    // 들어갈 만한 방: 같은 모드 · 비밀방 아님 · AI전 아님 · 아직 안 시작 · 자리 남음
    const openId = Object.keys(rooms).find((id) => {
      const r = rooms[id];
      if (!r || r.game || r.secret || r.vsBot || r.tutorial || r.ranked) return false;
      if ((r.mode || 'classic') !== mode) return false;
      const n = r.players.filter(Boolean).length;
      return n > 0 && n < capOf(r);
    });
    if (openId) {
      const room = rooms[openId];
      const cap = capOf(room);
      let seat = -1;
      for (let i = 0; i < cap; i++) if (!room.players[i]) { seat = i; break; }
      if (seat < 0) return socket.emit('error', '방이 막 찼어요. 다시 눌러주세요.');
      const prof = myProfile(nick);
      room.players[seat] = socket.id; room.pids[seat] = pid || null; room.nicks[seat] = prof.nick;
      room.profiles[seat] = prof; room.tokens[seat] = socket.token || null;
      socket.leave('lobby');
      socket.join(openId); socket.roomId = openId; socket.playerIndex = seat; socket.pid = pid;
      pushRoomLobby(openId);
      broadcastRooms();
      return;
    }

    if (Object.keys(rooms).length >= MAX_ROOMS) return socket.emit('error', '서버가 혼잡해요. 잠시 후 시도하세요.');
    const prof = myProfile(nick);
    const roomId = makeRoomId();
    const NAME = { classic: '클래식 빠른 입장', item: '아이템전 빠른 입장',
                   quad: '다인전 빠른 입장', twelve: 'TWELVE 빠른 입장',
                   mini: '미니게임 빠른 입장' };
    rooms[roomId] = {
      players: [socket.id, null], pids: [pid || null, null], nicks: [prof.nick, null],
      profiles: [prof, null], tokens: [socket.token || null, null],
      name: NAME[mode],
      game: null, vsBot: false, difficulty: 'hard',
      secret: false, password: '', itemMode: item,
      mode,
      hostStart: true,         // 방 만들기와 똑같다 — 자리도 보이고 시작도 방장이 누른다
      quickOpen: true,
    };
    socket.leave('lobby');
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = 0; socket.pid = pid;
    socket.emit('room_created', { roomId, name: rooms[roomId].name });
    pushRoomLobby(roomId);
    broadcastRooms();
  });

  // 선공 뽑기: 중앙 카드 2장 중 하나 선택
  socket.on('pick_card', ({ slot } = {}) => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game;
    if (g.phase !== 'pick' || !g.pick) return;
    if (slot !== 0 && slot !== 1) return;
    const pi = socket.playerIndex;
    if (g.pick.choices[pi] !== null) return;                       // 이미 골랐음
    if (g.pick.choices[1 - pi] === slot) return;                   // 상대가 고른 카드
    g.pick.choices[pi] = slot;
    // AI 상대면 남은 카드 자동 선택
    if (room.cpuIndex !== undefined && g.pick.choices[room.cpuIndex] === null) {
      g.pick.choices[room.cpuIndex] = 1 - slot;
    }
    if (g.pick.choices[0] !== null && g.pick.choices[1] !== null) {
      resolvePick(g);
      broadcast(socket.roomId);
      // 2.2초 공개 후 게임 시작 (튜토리얼이면 확인 누를 때까지 대기)
      const rid = socket.roomId;
      setTimeout(() => tutGate(rid, () => {
        if (!rooms[rid] || g.phase !== 'pick_reveal') return;
        startTurn(g);
        broadcast(rid);
        setTimeout(() => maybeCpuAct(rid), 400);
      }), 2200);
    } else {
      broadcast(socket.roomId);
    }
  });

  socket.on('draw_card', () => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game;
    if (g.phase !== 'draw' || g.auctioneer !== socket.playerIndex + 1) return;
    announceBonus(room, drawCenter(g, room));
    broadcast(socket.roomId);
    setTimeout(() => maybeCpuAct(socket.roomId), 300);
  });

  socket.on('offer_card', ({ cardId }) => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game;
    // 방식 선택 전(offer/choose_type)이면 언제든 출품카드 교체 가능
    if (g.phase !== 'offer' && g.phase !== 'choose_type') return;
    if (g.auctioneer !== socket.playerIndex + 1) return;
    const hand = socket.playerIndex === 0 ? g.p1Hand : g.p2Hand;
    const idx = hand.findIndex(c => c.id === cardId); if (idx === -1) return;
    const newCard = hand.splice(idx, 1)[0];
    if (g.auction._offeredCard) hand.push(g.auction._offeredCard);  // 기존 출품카드 손패로 복귀
    g.auction._offeredCard = newCard;
    g.phase = 'choose_type';
    broadcast(socket.roomId);
    setTimeout(() => maybeCpuAct(socket.roomId), 300);
  });

  socket.on('choose_auction', ({ type }) => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game;
    if (g.phase !== 'choose_type' || g.auctioneer !== socket.playerIndex + 1) return;
    if (type !== 'open' && type !== 'closed') return;
    g.auction.auctionType = type;
    if (!g.p1Hand.length || !g.p2Hand.length) return endByProgress(socket.roomId);   // 배팅 불가 → 진행도 판정
    g.phase = 'bidding';
    broadcast(socket.roomId);
    setTimeout(() => maybeCpuAct(socket.roomId), 300);
  });

  // 폭탄에 맞은 사람이 버릴 카드를 고른다
  socket.on('bomb_discard', ({ cardId }) => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game;
    const me = socket.playerIndex + 1;
    if (!g.itemMode || g.bombPick !== me) return;
    const hand = me === 1 ? g.p1Hand : g.p2Hand;
    const i = hand.findIndex(c => String(c.id) === String(cardId));
    if (i < 0) return;
    const gone = hand.splice(i, 1)[0];
    g.bombPick = null;
    room.players.forEach(sid => { if (sid) io.to(sid).emit('bomb_blew', { seat: me, card: gone }); });
    broadcast(socket.roomId);
  });

  socket.on('submit_bid', ({ cardId }) => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game; if (g.phase !== 'bidding') return;
    const isP1 = socket.playerIndex === 0;
    const me = socket.playerIndex + 1;
    // 경매 진행자가 먼저 배팅 — 비진행자는 진행자 제출 후에만 가능
    if (me !== g.auctioneer) {
      const aucBid = g.auctioneer === 1 ? g.auction.p1Submitted : g.auction.p2Submitted;
      if (!aucBid) return;
    }
    const hand = isP1 ? g.p1Hand : g.p2Hand;
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    // 재경매로 묶인 카드는 다시 못 낸다 — 그게 이 아이템의 전부다
    if (g.itemMode && g.fx && g.fx.banned && g.fx.banned[me] === cardId) {
      return socket.emit('item_error', '방금 낸 카드는 다시 낼 수 없어요.');
    }
    if (isP1 && g.auction.p1Submitted) return;
    if (!isP1 && g.auction.p2Submitted) return;
    const card = hand.splice(idx, 1)[0];
    if (isP1) { g.auction.p1Bid = card; g.auction.p1Submitted = true; }
    else       { g.auction.p2Bid = card; g.auction.p2Submitted = true; }
    resolveBidding(socket.roomId);
  });

  // 이모트 전달 (입력 제한)
  // 아이템 사용 — 검증·효과 계산은 전부 서버에서. 클라이언트는 무엇을 썼는지만 보낸다.
  socket.on('use_item', ({ itemId, cardId } = {}) => {
    const room = rooms[socket.roomId]; if (!room?.game) return;
    const g = room.game;
    if (!g.itemMode) return;
    const me = socket.playerIndex + 1;
    if (socket.isSpec || !me) return;
    // 재경매는 '진 쪽'만 쓸 수 있다 (이긴 사람이 물려서 판을 끄는 것 방지)
    if (itemId === 'redo' && g.phase === 'reveal' && g.auction) {
      const rev = !!g.fx.reverse;
      const p1W = rev ? strength(g.auction.p1Bid) > strength(g.auction.p2Bid) : aBeatsB(g.auction.p1Bid, g.auction.p2Bid);
      if ((p1W ? 1 : 2) === me) return socket.emit('item_fail', '이긴 경매는 다시 할 수 없어요.');
    }
    const out = items.use(g, me, itemId, cardId);
    if (out.error) return socket.emit('item_fail', out.error);
    // 양쪽에 알림 — 뭘 당했는지 모르면 억울하기만 하다
    room.players.forEach((sid, i) => {
      if (!sid) return;
      io.to(sid).emit('item_used', {
        byMe: i + 1 === me, itemId, name: out.name, icon: out.icon,
        msg: out.msg, blocked: !!out.blocked,
        // reveal 은 쓴 사람 몫(엿본 카드 등 감춰진 정보), fx 는 양쪽 몫이다.
        // 무엇이 어떻게 바뀌었는지가 안 보이면 "당했다" 만 남고 무엇을 당했는지는 모른다.
        reveal: (i + 1 === me) ? out.reveal || null : null,
        fx: out.fx || null, seat: me,
      });
    });
    // 재경매로 배팅 단계로 돌아갔다면 이전 경매의 공개·정산 타이머를 즉시 무효화한다
    if (out.rebid) g.settleSeq = (g.settleSeq || 0) + 1;
    broadcast(socket.roomId);
    if (out.rebid) setTimeout(() => maybeCpuAct(socket.roomId), 700);   // 재경매 → AI 다시 배팅
  });

  socket.on('emote', ({ emoji } = {}) => {
    const room = rooms[socket.roomId]; if (!room) return;
    const e = String(emoji || '').slice(0, 8); if (!e) return;
    const now = Date.now();
    if (now - (socket.lastEmote || 0) < 3000) return socket.emit('emote_cooldown');   // 3초 쿨타임 (도배 방지)
    socket.lastEmote = now;
    room.players.forEach((s, i) => { if (s && i !== socket.playerIndex) io.to(s).emit('emote', { emoji: e }); });
  });

  // 재대결 (같은 방에서 새 게임)
  // 판이 끝난 뒤 대기실로 되돌린다.
  //
  // 예전엔 끝나고 갈 데가 둘뿐이었다 — '한 판 더'(같은 모드로 즉시) 아니면
  // '로비로'(새로고침). 로비로는 방을 통째로 버리므로, 같은 사람들과 다른 모드로
  // 한 판 더 하려면 방을 다시 만들고 코드를 다시 나눠야 했다.
  // 이제 방이 살아 있는 채 대기실로 돌아간다 — 거기서 모드를 고르고 시작한다.
  //
  // 방이 없는 판(랭크·빠른대전으로 맺어진 자리)에는 돌아갈 대기실이 없다.
  // 그쪽은 '한 판 더' 가 그대로 맞는 길이다.
  socket.on('back_to_room', () => {
    const roomId = socket.roomId, room = rooms[roomId];
    if (!room) return socket.emit('opponent_left');     // 방이 이미 사라졌다
    if (!room.hostStart) return;                        // 대기실이 없는 방
    // 판이 아직 안 끝났으면 되돌리지 않는다 — 여기는 도중에 나가는 길이 아니다
    const done = (!room.game && !room.tv)
              || (room.game && room.game.phase === 'game_over')
              || (room.tv && room.tv.over);
    if (!done) return;
    endClock(room);
    clearTimeout(room.tvNext); clearTimeout(room.tvThink);
    room.game = null; room.tv = null; room.tvDone = false;
    room.rematch = [false, false];
    room.stour = null;
    // 한 사람이 눌러도 방에 있는 모두가 같이 돌아간다. 판은 이미 끝났고,
    // 둘 다 눌러야 움직이면 서로 상대가 누르기를 기다리다 멈춘다.
    pushRoomLobby(roomId);
    broadcastRooms();
  });

  socket.on('rematch', () => {
    const room = rooms[socket.roomId];
    if (!room) return socket.emit('opponent_left');
    if (room.vsBot || room.cpuIndex !== undefined) return restartGame(socket.roomId);   // 봇(위장 포함)은 즉시 재대국
    room.rematch = room.rematch || [false, false];
    room.rematch[socket.playerIndex] = true;
    room.players.forEach((s, i) => { if (s && i !== socket.playerIndex) io.to(s).emit('rematch_wanted'); });
    if (room.rematch[0] && room.rematch[1]) restartGame(socket.roomId);
  });

  // 관전자 → 승자에게 도전 (관전→대전 전환)
  socket.on('spec_challenge', ({ nick } = {}) => {
    const room = rooms[socket.roomId];
    if (!room || !socket.isSpec || room.challenger) return socket.emit('spec_challenge_fail');
    const targetSid = room.players[(room.lastWinner || 1) - 1] || room.players.find(Boolean);
    const ts = targetSid && io.sockets.sockets.get(targetSid);
    if (!ts) return socket.emit('spec_challenge_fail');
    room.challenger = { sid: socket.id, pid: socket.pid || null, nick: cleanNick(nick), token: socket.token || null };
    ts.emit('challenged', { nick: room.challenger.nick });
  });
  socket.on('challenge_accept', () => {
    const roomId = socket.roomId, room = rooms[roomId];
    if (!room || !room.challenger) return;
    const ch = room.challenger; delete room.challenger;
    const cs = io.sockets.sockets.get(ch.sid);
    if (!cs) return socket.emit('error', '도전자가 이미 떠났어요.');
    const myNick = room.nicks ? room.nicks[socket.playerIndex] : null;
    // 기존 방 정리 (남은 플레이어·다른 관전자에게 알림)
    room.players.forEach(sid => { if (sid && sid !== socket.id) io.to(sid).emit('opponent_left'); });
    (room.specs || []).forEach(sid => { if (sid !== ch.sid) io.to(sid).emit('opponent_left'); });
    endClock(room); delete rooms[roomId];
    socket.leave(roomId); cs.leave(roomId);
    socket.roomId = null; cs.roomId = null; cs.isSpec = false;
    broadcastRooms();
    startMatch({ sid: cs.id, pid: ch.pid, nick: ch.nick, token: ch.token },
               { sid: socket.id, pid: socket.pid || null, nick: myNick, token: socket.token || null });
  });
  socket.on('challenge_decline', () => {
    const room = rooms[socket.roomId];
    if (!room || !room.challenger) return;
    const cs = io.sockets.sockets.get(room.challenger.sid);
    delete room.challenger;
    if (cs) cs.emit('spec_challenge_fail');
  });

  // ── 관전 입장 ──
  socket.on('spectate', ({ roomId } = {}) => {
    const room = rooms[roomId];
    if (!room || !room.game || room.game.phase === 'game_over' || room.vsBot || room.secret)
      return socket.emit('error', '관전할 수 없는 게임이에요.');
    room.specs = room.specs || [];
    if (room.specs.length >= 10) return socket.emit('error', '관전 인원이 가득 찼어요.');
    leaveOldRoom();
    socket.leave('lobby');
    room.specs.push(socket.id);
    socket.roomId = roomId; socket.isSpec = true;
    socket.emit('game_start', { spectate: true, roomId, nicks: room.nicks, profiles: room.profiles });
    socket.emit('state_update', stateForSpec(room.game));
    broadcastRooms();   // 관전자 수 갱신
  });

  // 게임 나가기 — 진행 중이면 나간 사람 몰수패 (상대에게만 몰수승 전송)
  // 판을 버리고 나갔다. 여태 사람끼리 붙은 판만 몰수패로 남기고 AI전은
  // 아무 기록도 안 남겼다 — 지고 있으면 나가 버리면 그만이었다는 뜻이다.
  // 트웰브도 따로 처리하지 않아 그냥 사라졌다.
  function abandonIfLive(roomId, slot) {
    const room = rooms[roomId];
    if (!room || slot < 0) return false;
    if (room.tutorial) return false;              // 튜토리얼은 전적에 안 남긴다
    const winner = slot === 0 ? 2 : 1;
    if (room.tv && !room.tv.over && !room.tvDone) {
      room.tv.over = true; room.tv.winner = winner; room.tv.endBy = 'leave';
      tvFinish(roomId);                            // 보상·전적을 남긴다
      return true;
    }
    if (room.game && room.game.phase !== 'game_over') {
      room.game.phase = 'game_over';
      endClock(room);
      finishStats(room, winner, true);
      room.players.forEach((s2, i) => { if (s2 && i !== slot) io.to(s2).emit('game_over', { winner, forfeit: true, myIndex: i + 1 }); });
      return true;
    }
    return false;
  }

  socket.on('leave_room', () => {
    const roomId = socket.roomId;
    const room = roomId && rooms[roomId];
    if (!room) return;
    // 관전자가 나감 → 목록에서만 제거, 게임엔 영향 없음
    if (socket.isSpec) {
      room.specs = (room.specs || []).filter(sid => sid !== socket.id);
      socket.roomId = null; socket.isSpec = false;
      socket.join('lobby'); broadcastRooms();
      return;
    }
    if (room.graceTimer) { clearInterval(room.graceTimer); room.graceTimer = null; }
    endClock(room);
    const slot = room.players.indexOf(socket.id);
    const g = room.game;
    // AI 전이든 사람끼리든, 돌아가던 판을 버리고 나가면 진 것으로 남는다
    if (slot !== -1 && abandonIfLive(roomId, slot)) {
      // 처리 끝 — 아래 대기실 정리로는 안 내려간다
    } else if (!g && room.hostStart) {
      // 아직 시작 안 한 대기실 — 방을 지우지 않고 자리만 비운다.
      // 예전엔 한 명만 나가도 방이 통째로 사라져서 들락날락을 못 했다.
      leaveWaitingRoom(socket, roomId, slot);
      return;
    } else {
      room.players.forEach((s, i) => { if (s && i !== slot) io.to(s).emit('opponent_left'); });
    }
    delete rooms[roomId];
    socket.roomId = null;
    socket.join('lobby'); broadcastRooms();
  });

  socket.on('disconnect', () => {
    // 대회는 지우지 않는다. 새로고침도 여기로 들어오는데, 그때 지워 버리면
    // 판 하나 끝내고 로비로 돌아온 사람의 대회가 사라진다. 시각만 적어 두고
    // 오래 안 돌아오면 아래 청소가 걷어 간다.
    { const t = sTours.get(stourOwner(socket)); if (t) t.at = Date.now(); }
    // 시작 전 대기실에서 끊긴 것이면 방을 남기고 자리만 비운다
    {
      const r = socket.roomId && rooms[socket.roomId];
      if (r && !r.game && r.hostStart && !socket.isSpec) {
        leaveWaitingRoom(socket, socket.roomId, r.players.indexOf(socket.id));
      }
    }
    miniDequeue(socket, false);
    if (socket.mini) miniStand(socket, '연결이 끊겼어요.');
    const c = (connByIp.get(ip) || 1) - 1;   // IP 연결 카운트 감소
    if (c <= 0) connByIp.delete(ip); else connByIp.set(ip, c);
    if (socket.accountId && accountSockets.get(socket.accountId) === socket.id) accountSockets.delete(socket.accountId);
    dequeue(socket.id);  // 매칭 대기열에서 제거 (봇 타이머 포함)
    // 토너먼트 — 대기 중이면 참가비를 돌려주고, 대회 중이면 그 자리는 남은 경기를 진다.
    // 붙들고 있으면 나머지 사람들이 다음 라운드로 못 넘어간다.
    if (socket.tourWaiting) tourLeaveLobby(socket, true);
    if (socket.tourSeat !== undefined && socket.tourSeat !== null && tour && !tour.done) {
      const seat = socket.tourSeat;
      socket.tourSeat = undefined;
      setTimeout(() => {
        // 잠깐 사이에 다시 붙었으면(재접속) 그대로 둔다
        const back = tour && !tour.done && tour.bracket.seats[seat]
          && io.sockets.sockets.get(tour.bracket.seats[seat].key);
        if (!back) tourForfeitSeat(seat);
      }, 20000);
    }
    const roomId = socket.roomId;
    const room = roomId && rooms[roomId];
    if (!room) return;
    if (socket.isSpec) { room.specs = (room.specs || []).filter(sid => sid !== socket.id); broadcastRooms(); return; }   // 관전자 끊김
    const slot = room.players.indexOf(socket.id);
    if (slot === -1) return;   // 이미 교체된 옛 소켓 → 무시 (양쪽 오알림 방지)
    room.players[slot] = null;
    // 게임 종료 상태거나 둘 다 끊김 → 즉시 정리.
    // 다만 돌아가던 판이었으면 지우기 전에 결과를 남긴다 — AI 전은 상대가
    // 없으니 여기로 곧장 떨어져 여태 아무 기록도 안 남았다.
    // AI 전은 사람이 하나라 상대 자리가 늘 null 이다. 그래서 "둘 다 끊김" 에
    // 걸려 그 자리에서 방이 지워지고 패배가 기록됐다 — 지하철에서 한 번
    // 끊기면 이기던 판을 진다. 멀티는 60초를 주는데 솔로는 0초였다.
    // 판이 돌아가던 중이면 사람이 하나든 둘이든 같은 유예를 준다.
    if (!room.game || room.game.phase === 'game_over') {
      abandonIfLive(roomId, slot);
      if (room.graceTimer) { clearInterval(room.graceTimer); room.graceTimer = null; }
      endClock(room); delete rooms[roomId]; broadcastRooms(); return;
    }
    // 예전엔 튕김 3회면 그 자리에서 몰수패였다. 지하철에서 두 번 끊기면 세
    // 번째에 지는 셈이라 너무 가혹했다 — 판단은 누적 유예 시간에만 맡긴다.
    // 횟수는 몇 번 끊겼는지 알려 주는 데만 쓴다.
    room.dcCount = room.dcCount || [0, 0];
    room.dcCount[slot]++;
    // 유예 카운트다운 (누적 60초 — 재접속하면 정지, 또 끊기면 남은 시간부터)
    endClock(room);
    room.graceLeft = room.graceLeft || [60, 60];
    const opp = () => room.players[1 - slot];
    if (opp()) io.to(opp()).emit('opp_disconnected', { left: room.graceLeft[slot], strikes: room.dcCount[slot] });
    if (room.graceTimer) clearInterval(room.graceTimer);
    room.graceTimer = setInterval(() => {
      if (!rooms[roomId]) { clearInterval(room.graceTimer); return; }
      room.graceLeft[slot]--;
      if (opp()) io.to(opp()).emit('grace_tick', { left: room.graceLeft[slot] });
      if (room.graceLeft[slot] <= 0) forfeitPlayer(roomId, slot);
    }, 1000);
  });
});

// slot 플레이어 몰수패 처리 (상대 승리 + 전적 반영 + 방 정리)
function forfeitPlayer(roomId, slot) {
  const room = rooms[roomId]; if (!room) return;
  if (room.graceTimer) { clearInterval(room.graceTimer); room.graceTimer = null; }
  endClock(room);
  const winner = slot === 0 ? 2 : 1;
  // 아무도 안 남았으면(AI 전에서 사람이 안 돌아온 경우) 알릴 데가 없다.
  // 전적은 남기고 방만 치운다.
  if (room.game) room.game.phase = 'game_over';
  finishStats(room, winner, true);
  room.players.forEach((s, i) => { if (s && i !== slot) io.to(s).emit('game_over', { winner, forfeit: true, myIndex: i + 1 }); });
  delete rooms[roomId]; broadcastRooms();
}

// 같은 방 새 게임 시작
function restartGame(roomId) {
  const room = rooms[roomId]; if (!room) return;
  // 방 모드를 안 보고 무조건 2인전으로 새 판을 만들고 있었다. TWELVE 방에서
  // 재대결이 걸리면 칩 경매가 조용히 카드 경매로 바뀐다 — 같은 자리, 다른 게임.
  if (room.mode === 'twelve') {
    room.rematch = [false, false];
    if (tvRestart) tvRestart(roomId);
    return;
  }
  room.game = createGame(room.itemMode);
  room.startedAt = Date.now();
  room.aiMem = ai.createMem();   // 새 판 → AI 메모리 초기화
  room.rematch = [false, false];
  room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_start', { vsBot: room.vsBot, difficulty: room.difficulty, roomId, nicks: room.nicks, profiles: room.profiles, itemMode: room.itemMode }); });
  broadcast(roomId);
  startClock(roomId);
  if (room.cpuIndex !== undefined) setTimeout(() => maybeCpuAct(roomId), 600);
}

// 빠른 대전 매칭된 두 소켓으로 방 생성·시작
function startMatch(a, b, opts = {}) {
  const sa = io.sockets.sockets.get(a.sid), sb = io.sockets.sockets.get(b.sid);
  if (!sa || !sb) { if (sa) matchQueue.push(a); if (sb) matchQueue.push(b); return; }
  if (Object.keys(rooms).length >= MAX_ROOMS) { sa.emit('error', '서버가 혼잡해요.'); sb.emit('error', '서버가 혼잡해요.'); return; }
  const profOf = e => { const u = e.token && accounts.byToken(e.token); return u ? accounts.profileOf(u) : { nick: cleanNick(e.nick), guest: true }; };
  const pA = profOf(a), pB = profOf(b);
  // 무엇을 할지는 붙고 나서 서버가 정한다. 클라이언트가 고르게 두면 그게 곧
  // 모드 고르기가 되어 무작위의 뜻이 없어진다.
  const mode = pickRankedMode();
  const itemMode = mode === 'item';
  const ranked = opts.ranked !== false;
  const roomId = makeRoomId();
  const LABEL = { classic: '클래식', item: '아이템전', twelve: 'TWELVE' };
  rooms[roomId] = {
    players: [a.sid, b.sid], pids: [a.pid || null, b.pid || null], nicks: [pA.nick, pB.nick],
    profiles: [pA, pB], tokens: [a.token || null, b.token || null],
    name: (ranked ? '랭크게임 · ' : '빠른대전 · ') + (LABEL[mode] || mode),
    game: null, vsBot: false, difficulty: 'hard',
    secret: false, password: '', itemMode, mode,
    ranked,                // RP 가 오가는 판은 랭크로 잡힌 것만
  };
  sa.leave('lobby'); sa.join(roomId); sa.roomId = roomId; sa.playerIndex = 0; sa.pid = a.pid;
  sb.leave('lobby'); sb.join(roomId); sb.roomId = roomId; sb.playerIndex = 1; sb.pid = b.pid;
  // 무엇이 걸렸는지 먼저 알린다 — 판이 열리기 전에 한 박자 보여 줘야
  // "왜 갑자기 칩 경매지" 가 안 된다.
  io.to(roomId).emit('ranked_mode', { mode });
  // 화면에서 룰렛이 돌아가는 동안(약 2.2초)은 판을 열지 않는다. 바로 열면
  // 무엇이 걸렸는지 보기도 전에 판으로 넘어가 룰렛이 뜻을 잃는다.
  setTimeout(() => {
    const room = rooms[roomId];
    if (!room || room.game || room.tv) return;              // 그 사이에 사라졌거나 이미 열렸다
    if (mode === 'twelve') { if (tvRestart) tvRestart(roomId); return; }
    room.game = createGame(itemMode);
    room.startedAt = Date.now();
    io.to(roomId).emit('game_start', { vsBot: false, roomId, nicks: room.nicks, profiles: room.profiles, itemMode });
    broadcast(roomId);
    startClock(roomId);
  }, RANK_SPIN_MS);
}

function resolveBidding(roomId) {
  const room = rooms[roomId]; if (!room?.game) return;
  const g = room.game;
  if (g.phase !== 'bidding' || !g.auction) return;   // 이미 처리됨(이중 정산 방지)
  if (g.auction.p1Submitted && g.auction.p2Submitted) {
    // 긴장 브레이크 — 배팅 완료 후 한 템포(뒤집힌 채 대치) 쉬고 나서 공개.
    // 재경매 아이템으로 배팅 단계로 되돌아가면 이 타이머들이 고아가 되어 다음 경매를 건드린다.
    // 경매마다 일련번호를 붙여, 번호가 바뀌었으면 옛 타이머는 스스로 물러나게 한다.
    g.phase = 'showdown';
    const seq = (g.settleSeq = (g.settleSeq || 0) + 1);
    const alive = () => { const rm = rooms[roomId]; const gg = rm && rm.game; return gg && gg.settleSeq === seq ? gg : null; };
    broadcast(roomId);
    setTimeout(() => tutGate(roomId, () => {
      const gg = alive(); if (!gg || gg.phase !== 'showdown') return;
      gg.phase = 'reveal';
      broadcast(roomId);
      if (gg.itemMode) setTimeout(() => cpuMaybeRedo(roomId), 800);   // 공개 직후 AI가 재경매를 쓸 수 있는 창
      setTimeout(() => tutGate(roomId, () => {
        const g2 = alive(); if (!g2 || g2.phase !== 'reveal') return;
        settle(roomId);
      }), 2500);
    }), 1100);
  } else {
    broadcast(roomId);
    setTimeout(() => maybeCpuAct(roomId), 200);
  }
}

// 더 진행할 수 없을 때 세트 근접도로 승부를 가른다 (덱 소진·손패 부족 등)
function endByProgress(roomId) {
  const room = rooms[roomId]; if (!room?.game) return;
  const g = room.game;
  if (g.phase === 'game_over') return;
  g.phase = 'game_over';
  endClock(room);
  const winner = resolveByProgress(g.p1Acquired, g.p2Acquired);
  const setKind = winner ? progress(winner === 1 ? g.p1Acquired : g.p2Acquired).kind : null;
  finishStats(room, winner);
  room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_over', { winner, setKind, byProgress: true, myIndex: i + 1 }); });
}

function settle(roomId) {
  const room = rooms[roomId]; if (!room?.game) return;
  const g = room.game;
  if (g.phase !== 'reveal' || !g.auction) return;   // 재경매 아이템으로 되돌아간 경우 등
  // 누가 이겼나는 규칙이 정한다 — 여기(서버)는 그 결과로 무엇을 할지만 맡는다
  const d = judgeAuction(g);
  const { p1Bid, p2Bid, prize, tipCard, reversed, p1Wins, special } = d;

  // 전문가 AI 카운팅 메모리 갱신 (리빌에서 전부 공개되는 정보만 — 치팅 아님)
  if (room.cpuIndex !== undefined && room.difficulty === 'expert' && room.aiMem) {
    const ci = room.cpuIndex;
    const aiBidCard = ci === 0 ? p1Bid : p2Bid, humanBid = ci === 0 ? p2Bid : p1Bid;
    const humanAcq = ci === 0 ? g.p2Acquired : g.p1Acquired;
    const aiAcq = ci === 0 ? g.p1Acquired : g.p2Acquired;
    const oppValEst = Math.max(
      ai.wantValue(prize, humanAcq, ai.feasibleTarget(humanAcq, aiAcq)),
      ai.denyValue(prize, aiAcq));
    ai.noteSettle(room.aiMem, {
      myBid: aiBidCard, oppBid: humanBid, offered: g.auction._offeredCard,
      offeredByMe: g.auctioneer === ci + 1, oppValEst,
    });
  }

  if (special) {
    room.players.forEach(sid => { if (sid) io.to(sid).emit('special', {}); });
    // 배신 성공자(6-10을 낸 승자) 미션·칭호 반영
    const actor = p1Wins ? 0 : 1;   // 6-10이 이기므로 승자가 배신자
    if (room.tokens && room.tokens[actor]) accounts.betrayEvent(room.tokens[actor]);
  }

  // 카드가 어디로 가는지도 규칙이다
  applyAuction(g, d);

  // 폭탄 — 낙찰받은 쪽이 손패 1장을 버린다. 폭탄을 건 사람도 예외가 아니다.
  // 사람이면 무엇을 버릴지 고르게 하고, AI 는 안 쓸 카드를 알아서 버린다.
  if (g.itemMode && g.fx.bomb) {
    const winner = p1Wins ? 1 : 2;
    const wHand = winner === 1 ? g.p1Hand : g.p2Hand;
    const isCpu = room.cpuIndex === winner - 1;
    if (wHand.length && isCpu) {
      const acq = winner === 1 ? g.p1Acquired : g.p2Acquired;
      const junk = I2.bombJunk(wHand, acq);   // 무엇을 버릴지는 화면과 같은 셈을 쓴다
      wHand.splice(wHand.indexOf(junk), 1);
      room.players.forEach(sid => { if (sid) io.to(sid).emit('bomb_blew', { seat: winner, card: junk }); });
    } else if (wHand.length) {
      g.bombPick = winner;            // 이 사람이 고를 때까지 판이 기다린다
      const sid = room.players[winner - 1];
      if (sid) io.to(sid).emit('bomb_pick', { hand: wHand });
    }
  }

  // 덤 카드가 얹힌 경매에서만 아이템이 나온다 — 그리고 진 쪽이 가져간다.
  // 이긴 쪽에 주면 앞선 사람이 더 세져 눈덩이가 된다(재 보니 아이템의 86%가
  // 앞선 쪽으로 갔다). 진 쪽에 주면 79% 가 뒤진 쪽으로 간다.
  if (g.itemMode && tipCard) {
    const loser = p1Wins ? 2 : 1;
    // 카드에 앞면으로 보여 준 바로 그 아이템을 준다 — 다시 뽑으면 거짓말이 된다
    const got = items.give(g, loser, tipCard.itemId);
    if (got) {
      // 덤이 어디로 갔는지 둘 다 봐야 한다. 예전엔 받는 쪽에만 알려서
      // 상대 아이템이 소리 없이 늘어나 있었다 — 무엇을 가져갔는지도 모른 채.
      // 받았다는 팝업은 카드가 도착한 뒤에 화면이 띄운다(보너스와 같은 방식).
      room.players.forEach((s2) => {
        if (s2) io.to(s2).emit('tip_card', { seat: loser, item: got });
      });
      if (room.cpuIndex === loser - 1) room.cpuItemPending = true;   // AI가 받음
    }
  }


  // AI가 경매를 이기면 가끔 이모트로 도발
  if (room.cpuIndex !== undefined) {
    const cpuWon = (room.cpuIndex === 0) ? p1Wins : !p1Wins;
    const human = room.players[room.cpuIndex === 0 ? 1 : 0];
    if (human && ((special) || (cpuWon && Math.random() < 0.28))) {
      const set = special ? ['😎', '🔥', '⚔'] : ['😆', '👍', '😏', '🔥'];
      io.to(human).emit('emote', { emoji: set[Math.floor(Math.random() * set.length)] });
    }
  }

  const p1Set = checkSet(g.p1Acquired), p2Set = checkSet(g.p2Acquired);
  if (p1Set || p2Set) {
    g.phase = 'game_over';
    const winner = p1Set ? 1 : 2;
    endClock(room);
    // 완성된 세트가 보드에 먼저 보이도록 상태 갱신 → 잠깐 뒤 결과창
    broadcast(roomId);
    setTimeout(() => {
      if (!rooms[roomId]) return;
      finishStats(room, winner, false, p1Set || p2Set);
      room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_over', { winner, setKind: p1Set || p2Set, myIndex: i + 1 }); });
    }, 1700);
    return;
  }
  // 다음 턴을 실제로 둘 수 있는지 확인 — 진행자는 출품+배팅으로 2장, 상대는 배팅으로 1장이 필요하다.
  // 모자란 채로 넘어가면 낼 카드가 없어 조용히 교착된다. 그럴 땐 세트 근접도로 판정.
  if (!canContinue(g)) return endByProgress(roomId);
  // 정산 결과를 눈으로 확인할 시간 — 카드가 승자 더미로 날아가 안착하고, 늘어난 세트를 본 뒤 다음 턴
  g.phase = 'settled';
  broadcast(roomId);
  setTimeout(() => tutGate(roomId, () => advanceTurn(roomId)), SETTLE_PAUSE);
}
// 정산 화면에서 다음 턴으로 넘긴다. 타이머가 유실돼도 감시견이 이 함수를 다시 부를 수 있도록 분리했다.
function advanceTurn(roomId) {
  const rm = rooms[roomId]; if (!rm || !rm.game) return;
  const gg = rm.game;
  if (gg.phase !== 'settled') return;   // 이미 넘어갔으면 중복 진행 금지
  gg.turn++;
  gg.auctioneer = gg.auctioneer === 1 ? 2 : 1;
  startTurn(gg);
  broadcast(roomId);
  setTimeout(() => maybeCpuAct(roomId), 500);
}
// ══════════════════════════════════════════════════════════
//  토너먼트 (8강 · 2인전)
// ══════════════════════════════════════════════════════════
// 대진표는 tournament.js 가 계산한다. 여기서는 사람·방·코인만 다룬다.
//
// 한 번에 하나만 연다. 여러 대회를 동시에 굴리면 정원이 쪼개져 아무 데도 안 찬다.
// 첫 사람이 들어온 뒤 30초에 시작하고, 그때까지 안 찬 자리는 AI 가 메운다.
const TOUR = require('./tournament');

// ── 솔로 토너먼트 ────────────────────────────────────────────────
// 혼자 여는 8강. 붙는 상대는 전부 AI 고, 매 경기 모드가 무작위로 바뀐다
// (클래식·아이템전·트웰브). 세 판을 이기면 우승이다.
//
// 다른 자리의 AI 끼리 붙는 경기는 실제로 두지 않는다 — 서버가 여덟 판을
// 돌릴 이유가 없고, 유저는 그 판을 보지도 않는다. 대진표만 그럴듯하게
// 채운다. 대신 유저가 붙는 판은 전부 진짜 게임이다.
//
// 상태는 서버가 쥔다. 상금 계산이 클라이언트에 있으면 대진표를 조작해
// 우승을 만들어 낼 수 있다.
const STOUR_MODES = ['classic', 'item', 'twelve'];
const STOUR_BEST_OF = [1, 1, 1];                     // 결승도 단판 — "세 판이면 우승"
// 상금. 솔로 판 하나가 주는 코인(쉬움 5·보통 15·전문가 40)의 서너 배쯤이다.
// 세 판을 내리 이겨야 하므로 판당으로 치면 크지 않은데, 한 번에 들어와서 크게 느껴진다.
const STOUR_PRIZE = { easy: 60, hard: 200, expert: 500 };
const STOUR_NAMES = ['까치', '흑조', '백랑', '여우', '두루미', '산군', '청설모',
                     '노루', '수달', '부엉이', '살쾡이', '담비', '족제비', '해오라기'];
// 진행 중인 솔로 대회. 열쇠는 socket.id 가 아니라 '사람' 이다.
//
// 예전엔 socket.id 로 잡고 끊길 때 지웠다. 그런데 판이 끝나고 '로비로' 를
// 누르면 화면이 새로고침되고(fastReload), 새로고침하면 소켓이 새로 붙는다 —
// 그 순간 대회가 통째로 사라졌다. 트웰브 판은 나가는 길이 새로고침뿐이라
// 대회에서 트웰브가 걸리면 무조건 거기서 끊겼다. "한 판 하면 끊긴다" 가 이것이다.
//
// 이제 로그인했으면 토큰, 아니면 기기 id(pid) 로 잡는다. 둘 다 새로고침을 넘어
// 살아남으므로, 돌아오면 대회가 그대로 있다.
const sTours = new Map();                            // owner(token|pid) → 진행 중인 대회
const stourOwner = (socket) => socket.token || socket.pid || socket.id;
// 끊긴 대회를 언제까지 들고 있을까. 새로고침은 몇 초면 돌아오지만, 폰에서
// 앱을 잠깐 내렸다 올리는 것도 흔하다. 넉넉히 두되 영원히 쌓아 두지는 않는다.
const STOUR_KEEP_MS = 30 * 60 * 1000;

const stourMode = () => STOUR_MODES[Math.floor(Math.random() * STOUR_MODES.length)];

// 이 방이 대회 경기인지 표시한다. 서버가 뽑아 둔 모드·난이도와 맞을 때만 인정한다.
function stourMark(socket, room, mode, diff, want) {
  if (!want || !room) return;
  const own = stourOwner(socket);
  const t = sTours.get(own);
  if (!t || t.b.over || t.done) return;
  if (t.mode !== mode || t.diff !== diff) return;
  if (stourMyMatch(t) < 0) return;
  t.sid = socket.id; t.at = Date.now();
  room.stour = { own, sid: socket.id, id: t.id, round: t.b.round };
  t.pending = 0;                         // 판이 열렸다
  room.noRank = true;                    // 대회 판은 등급에 안 걸린다 — 상대가 전부 AI 다
}

// 대회 경기가 끝났다. 유저 결과를 적고, 나머지 자리를 채우고, 상금까지 정산한다.
// 모든 계산이 여기 한 곳에 있어야 클라이언트가 끼어들 자리가 없다.
function stourResult(room, iWon) {
  const mark = room && room.stour; if (!mark) return;
  room.stour = null;                     // 한 판이 두 번 정산되지 않게
  const t = sTours.get(mark.own || mark.sid);
  if (!t || t.id !== mark.id || t.b.over || t.done) return;
  t.at = Date.now();
  t.pending = 0;
  const out0 = {};                       // 라운드 보상 등, 아래에서 담아 둘 것들
  const idx = stourMyMatch(t); if (idx < 0) return;
  const m = TOUR.curRound(t.b)[idx];
  const foe = m.a === t.seat ? m.b : m.a;
  TOUR.reportWin(t.b, idx, iWon ? t.seat : foe);
  if (iWon) t.wins++;
  // 한 판 이길 때마다 그 자리에서 챙긴다.
  //
  // 예전엔 우승·준우승만 돈이 됐다. 그래서 8강에서 이기고 4강에서 지면
  // 세 판을 이겨 놓고도 빈손이라, 올라가는 재미가 값으로 이어지지 않았다.
  // (게다가 중간에 끊기면 그마저도 못 받았다.)
  // 이기고 올라간 라운드마다 준다 — 지면 안 나오므로 일찍 지는 게 이득이 될 일도 없다.
  if (iWon && !t.b.over) {
    const step = Math.round((STOUR_PRIZE[t.diff] || 0) * 0.15);
    if (step > 0) {
      out0.roundPrize = step;
      if (!t.token) out0.guest = true;
      else {
        // 같은 라운드를 두 번 정산하지 못하게 대회 번호에 라운드를 붙여 적는다
        const r = accounts.tourPrize(t.token, t.id + ':r' + mark.round, 0, step, true);
        if (r && r.ok) { out0.coins = r.coins; out0.titles = r.titles; out0.profile = r.profile; }
        else out0.roundPrize = 0;
      }
    }
  }
  const fills = stourFillOthers(t);
  // 유저가 떨어졌으면 남은 라운드는 AI 끼리 끝까지 간다 — 대진표가 완성돼야
  // "내가 몇 등이었나" 가 보인다.
  while (!t.b.over) { const more = stourFillOthers(t); if (!more.length) break; fills.push(...more); }

  const sock = io.sockets.sockets.get(t.sid || mark.sid);
  const out = Object.assign({ won: iWon, fills, view: stourView(t) }, out0);
  if (t.b.over) {
    t.done = true;
    const rank = t.b.rank[t.seat] || null;
    const full = STOUR_PRIZE[t.diff] || 0;
    // 우승만 전액, 준우승은 1/4. 8강·4강 탈락은 빈손이다 — 어디까지 갔든
    // 같은 값을 주면 첫 판을 지고 나가는 게 가장 이득이 된다.
    const amt = rank === 1 ? full : rank === 2 ? Math.round(full / 4) : 0;
    out.rank = rank; out.prize = amt; out.view = stourView(t);
    // 게스트는 받을 지갑이 없다. 액수를 그대로 띄우면 받은 줄 안다.
    if (!t.token) { out.prize = 0; out.guest = amt > 0; }
    else if (amt > 0) {
      const r = accounts.tourPrize(t.token, t.id, rank, amt);
      if (r && r.ok) { out.coins = r.coins; out.titles = r.titles; out.profile = r.profile; }
      else out.prize = 0;
    }
  }
  if (sock) sock.emit('stour_result', out);
}

// 오래 안 돌아온 대회는 걷어 간다. 안 그러면 메모리에 계속 쌓인다.
// 이미 도는 시계(seasonTick 등)와 달리 값싼 일이라 10분에 한 번이면 충분하다.
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of sTours) if (now - (t.at || 0) > STOUR_KEEP_MS) sTours.delete(k);
}, 10 * 60 * 1000);

// 내 자리의 이번 라운드 경기 번호
function stourMyMatch(t) {
  return TOUR.curRound(t.b).findIndex(m => m.winner === null && (m.a === t.seat || m.b === t.seat));
}

function stourView(t) {
  const v = TOUR.view(t.b, t.seat);
  v.diff = t.diff;
  v.mode = t.mode || null;
  v.wins = t.wins;
  v.prize = STOUR_PRIZE[t.diff] || 0;
  v.done = !!t.done;
  return v;
}
const stourPush = (socket, t) => socket.emit('stour_state', stourView(t));

// 유저가 붙지 않는 경기들을 채운다. 결과는 무작위 — 어차피 보여 주기용이다.
function stourFillOthers(t) {
  const list = TOUR.curRound(t.b);
  const fills = [];
  list.forEach((m, i) => {
    if (m.winner !== null || m.a === t.seat || m.b === t.seat) return;
    const w = Math.random() < 0.5 ? m.a : m.b;
    TOUR.reportWin(t.b, i, w);
    fills.push({ round: t.b.round, index: i, winner: w });
  });
  return fills;
}

const SUTDA = require('./sutda');   // 미니게임 족보·배팅 규칙
let tour = null;                       // { id, bracket, rooms, done }
let tourLobby = null;                  // { entrants:[], timer, startAt }

// 30분마다 열린다. 대기실은 늘 열어 두고, 다음 개최 시각이 되면 출발한다.
// 예전엔 첫 사람이 들어온 뒤 30초였는데, 그러면 언제 열릴지 알 수 없어
// 사람이 모이지 않는다. 시각이 정해져 있어야 맞춰 온다.
// 대회는 이제 다른 모드와 같은 줄에 선다 — 눌러서 들어가 사람이 모이면 열린다.
// 예전엔 정각·30분에만 열려서, 로비에서 눌러 본 사람 대부분이
// "지금은 안 된다" 를 보고 돌아섰다.
const TOUR_COUNTDOWN_MS = 20000;   // 최소 인원이 차고 나서 더 기다려 주는 시간
const TOUR_FILL_MS = 75000;        // 이만큼 기다려도 안 차면 AI 로 채워 연다
function tourEnsureLobby() {
  if (tourLobby) return tourLobby;
  tourLobby = { entrants: [], startAt: 0, timer: null, fill: null };
  return tourLobby;
}
// 인원이 바뀔 때마다 다시 잰다.
//   · 정원(8)이 차면 곧바로
//   · 최소 인원(4)이 차면 20초 세고 — 그 사이 더 오면 8강으로 커진다
//   · 넷이 안 차도 첫 사람이 들어온 뒤 75초가 지나면 AI 로 채워 연다
function tourReschedule() {
  const L = tourLobby; if (!L) return;
  const n = L.entrants.length;
  clearTimeout(L.timer); L.timer = null;
  if (!n) { clearTimeout(L.fill); L.fill = null; L.startAt = 0; return; }
  if (!L.fill) L.fill = setTimeout(() => tourStart(), TOUR_FILL_MS);
  if (n >= TOUR.SIZE) { L.startAt = Date.now() + 600; L.timer = setTimeout(() => tourStart(), 600); return; }
  if (n >= TOUR.MIN_SIZE) {
    // 이미 세고 있으면 그대로 둔다 — 사람이 올 때마다 늘어나면 영영 안 열린다
    if (!L.startAt || L.startAt < Date.now()) L.startAt = Date.now() + TOUR_COUNTDOWN_MS;
    L.timer = setTimeout(() => tourStart(), Math.max(300, L.startAt - Date.now()));
    return;
  }
  L.startAt = 0;   // 아직 최소 인원 미달 — 셈을 멈추고 기다린다
}

const tourSeatKey = (socket) => socket.id;

function tourLobbyView(joined) {
  const n = tourLobby ? tourLobby.entrants.length : 0;
  const startAt = tourLobby ? tourLobby.startAt : 0;
  return {
    open: true,
    joined: !!joined,
    count: n,
    size: TOUR.sizeFor(n),      // 지금 인원이면 몇 강인가
    min: TOUR.MIN_SIZE,
    max: TOUR.SIZE,
    fee: TOUR.ENTRY_FEE,
    startAt,
    leftMs: startAt ? Math.max(0, startAt - Date.now()) : 0,
    running: !!(tour && !tour.done),
    nicks: tourLobby ? tourLobby.entrants.map((e) => e.nick) : [],
  };
}
function pushTourLobby() {
  if (!tourLobby) return;
  for (const e of tourLobby.entrants) io.to(e.key).emit('tour_lobby', tourLobbyView(true));
}

// 대기 중 나가기 — 참가비를 돌려준다 (아직 시작 전이므로)
function tourLeaveLobby(socket, refund = true) {
  if (!tourLobby) return;
  const i = tourLobby.entrants.findIndex((e) => e.key === socket.id);
  if (i < 0) return;
  const [gone] = tourLobby.entrants.splice(i, 1);
  socket.tourWaiting = false;
  tourReschedule();          // 최소 인원 아래로 떨어지면 셈을 멈춘다
  if (refund && gone.token) {
    const r = accounts.tourRefund(gone.token, TOUR.ENTRY_FEE);
    if (r.ok) io.to(gone.key).emit('profile', { profile: r.profile });
  }
  // 아무도 안 남아도 대기실은 그대로 둔다 — 개최 시각은 정해져 있다.
  pushTourLobby();
}

function tourStart() {
  if (!tourLobby) return;
  const entrants = tourLobby.entrants.slice();
  clearTimeout(tourLobby.timer);
  clearTimeout(tourLobby.fill);
  tourLobby = null;
  // 참가자가 없으면 그냥 다음 회차를 연다 (빈 대회를 굴릴 이유가 없다)
  if (!entrants.length) { tourEnsureLobby(); return; }
  // 이미 한 대회가 돌고 있으면 참가비를 돌려주고 접는다 (여기까지 오면 안 되지만 방어)
  if (tour && !tour.done) {
    for (const e of entrants) {
      if (e.token) { const r = accounts.tourRefund(e.token, TOUR.ENTRY_FEE); if (r.ok) io.to(e.key).emit('profile', { profile: r.profile }); }
      io.to(e.key).emit('tour_error', '이미 진행 중인 대회가 있어요. 참가비를 돌려드렸어요.');
    }
    return;
  }

  // 넷 이하면 4강, 다섯부터는 8강. 빈 자리는 AI 가 채운다.
  const bracket = TOUR.createBracket(entrants, null, null, TOUR.sizeFor(entrants.length));
  tour = { id: 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
           bracket, rooms: {}, done: false };
  // 자리 번호로 빠르게 찾기
  for (let i = 0; i < bracket.seats.length; i++) {
    const st = bracket.seats[i];
    if (!st.isBot && st.key) { const sk = io.sockets.sockets.get(st.key); if (sk) { sk.tourSeat = i; sk.tourWaiting = false; } }
  }
  pushTour();
  setTimeout(() => tourRunRound(), 1200);
}

// 지금 라운드의 경기들을 실제 방으로 만든다
function tourRunRound() {
  if (!tour || tour.done) return;
  const b = tour.bracket;
  for (const pm of TOUR.pendingMatches(b)) {
    if (tour.rooms[roundKey(b.round, pm.index)]) continue;   // 이미 만들었다
    tourMakeMatch(pm.index, pm.a, pm.b);
  }
}
const roundKey = (round, index) => round + '-' + index;

// 경기 하나 = 2인전 방 하나. 사람 vs 사람, 사람 vs AI, AI vs AI 모두 여기서 처리.
function tourMakeMatch(index, seatA, seatB) {
  if (!tour) return;
  const b = tour.bracket;
  const A = b.seats[seatA], B = b.seats[seatB];
  const key = roundKey(b.round, index);

  // AI 끼리는 판을 만들 필요가 없다 — 동전 던지기로 올린다
  if (A.isBot && B.isBot) {
    const win = Math.random() < 0.5 ? seatA : seatB;
    setTimeout(() => tourReport(b.round, index, win), 600);
    return;
  }
  if (Object.keys(rooms).length >= MAX_ROOMS) { setTimeout(() => tourRunRound(), 3000); return; }

  const roomId = makeRoomId();
  const humanFirst = !A.isBot;
  const p0 = humanFirst ? A : B, p1 = humanFirst ? B : A;
  const s0 = io.sockets.sockets.get(p0.key);
  // 사람이 나갔으면 부전패
  if (!s0) { tourForfeitSeat(humanFirst ? seatA : seatB); return; }

  const prof0 = p0.token ? (accounts.byToken(p0.token) ? accounts.profileOf(accounts.byToken(p0.token)) : { nick: p0.nick, guest: true })
                         : { nick: p0.nick, guest: true };
  const botName = 'AI';
  const s1 = p1.isBot ? null : io.sockets.sockets.get(p1.key);
  if (!p1.isBot && !s1) { tourForfeitSeat(humanFirst ? seatB : seatA); return; }
  const prof1 = p1.isBot ? { nick: botName, guest: true, bot: true }
    : (p1.token && accounts.byToken(p1.token) ? accounts.profileOf(accounts.byToken(p1.token)) : { nick: p1.nick, guest: true });

  rooms[roomId] = {
    players: [p0.key, p1.isBot ? null : p1.key],
    // pid 를 안 넣어 두면 rejoin 이 자리를 못 찾는다 — 60초 유예를 줘도
    // 돌아올 방법이 없었다. 대회에서 한 번 끊기면 그대로 몰수패였다.
    pids: [s0 && s0.pid ? s0.pid : null, (!p1.isBot && s1 && s1.pid) ? s1.pid : null],
    nicks: [prof0.nick, prof1.nick],
    profiles: [prof0, prof1],
    tokens: [p0.token || null, p1.isBot ? null : (p1.token || null)],
    name: '토너먼트 ' + TOUR.roundName(b.round, b), game: null,
    vsBot: false, difficulty: 'expert',
    secret: false, password: '', itemMode: false,
    // 토너먼트 표식 — 끝났을 때 어디로 보고할지
    tour: { id: tour.id, round: b.round, index, seats: [humanFirst ? seatA : seatB, humanFirst ? seatB : seatA] },
    noRank: true,                                  // 대회는 RP 를 건드리지 않는다
  };
  if (p1.isBot) { rooms[roomId].cpuIndex = 1; rooms[roomId].aiMem = ai.createMem(); }

  const join = (sk, idx) => { if (!sk) return; sk.leave('lobby'); sk.join(roomId); sk.roomId = roomId; sk.playerIndex = idx;
    // 자리에 적어 둔 pid 와 소켓의 pid 가 같아야 돌아올 때 짝이 맞는다
    if (sk.pid) rooms[roomId].pids[idx] = sk.pid; };
  join(s0, 0); if (s1) join(s1, 1);
  rooms[roomId].game = createGame(false);
  rooms[roomId].startedAt = Date.now();
  tour.rooms[roundKey(b.round, index)] = roomId;

  io.to(roomId).emit('game_start', { vsBot: false, roomId, nicks: rooms[roomId].nicks,
                                     profiles: rooms[roomId].profiles, tour: true });
  broadcast(roomId);
  startClock(roomId);
  if (p1.isBot) setTimeout(() => maybeCpuAct(roomId), 800);
}

// 경기 결과를 대진표에 적는다
function tourReport(round, index, winnerSeat) {
  if (!tour || tour.done) return;
  const b = tour.bracket;
  if (b.round !== round) return;                    // 이미 지난 라운드의 뒤늦은 보고
  const before = b.round;
  const r = TOUR.reportWin(b, index, winnerSeat);
  if (!r.ok) return;
  pushTour();
  // 3판 2선승 — 아직 승부가 안 났으면 그 경기의 다음 판을 연다
  if (r.seriesGame) {
    delete tour.rooms[roundKey(b.round, index)];      // 방 기록을 비워야 다시 만든다
    const m = TOUR.curRound(b)[index];
    setTimeout(() => { if (tour && !tour.done) tourMakeMatch(index, m.a, m.b); }, 2000);
    return;
  }
  if (r.finished) return tourFinish();
  if (r.advanced || b.round !== before) setTimeout(() => tourRunRound(), 1500);
}

// 그 자리가 남은 경기를 전부 진다 (나갔거나 접속이 끊겼을 때)
function tourForfeitSeat(seat) {
  if (!tour || tour.done) return;
  const b = tour.bracket;
  TOUR.forfeit(b, seat);
  pushTour();
  if (b.over) return tourFinish();
  setTimeout(() => tourRunRound(), 1200);
}

function tourFinish() {
  if (!tour || tour.done) return;
  tour.done = true;
  const b = tour.bracket;
  for (let i = 0; i < b.seats.length; i++) {
    const st = b.seats[i];
    const rank = b.rank[i] || null;
    if (st.isBot || !rank) continue;
    const amount = TOUR.prizeFor(rank);
    let payload = { rank, amount, view: TOUR.view(b, i) };
    if (st.token) {
      const r = accounts.tourPrize(st.token, tour.id, rank, amount);
      if (r.ok) { payload.profile = r.profile; payload.titles = r.titles; io.to(st.key).emit('profile', { profile: r.profile }); }
    }
    io.to(st.key).emit('tour_over', payload);
    const sk = io.sockets.sockets.get(st.key);
    if (sk) { sk.tourSeat = undefined; }
  }
  const finished = tour;
  setTimeout(() => { if (tour === finished) tour = null; }, 30000);   // 결과를 잠시 보관
  tourEnsureLobby();                                                  // 다음 회차 접수 시작
}

function pushTour() {
  if (!tour) return;
  const b = tour.bracket;
  for (let i = 0; i < b.seats.length; i++) {
    const st = b.seats[i];
    if (st.isBot || !st.key) continue;
    io.to(st.key).emit('tour_state', TOUR.view(b, i));
  }
}

const SETTLE_PAUSE = 1600;   // reveal(결과공개) 뒤 정산 카드 이동·더미 확인 시간

// 로그인 유저의 전적/랭크/레벨/코인 반영 + 갱신된 프로필·보상 전송
// setKind — 세트를 완성해서 이긴 경우 그 종류(2·3·4·6). 싸이클링 판정에 쓴다.
// 시간패·탈주·진행도 판정으로 끝난 판은 세트 우승이 아니므로 넘기지 않는다.
function finishStats(room, winner, forfeit = false, setKind = null) {
  room.lastWinner = winner;   // 관전자 도전 대상
  if (!room.tokens) return;
  stats.bump('games');
  if (room.botMatch) stats.bump('botmatch');
  else if (!room.vsBot) stats.bump('multi');
  // 같은 IP 멀티 대전 감지 (자기 계정끼리 코인 파밍 방지)
  let sameIp = false;
  if (!room.vsBot && room.players[0] && room.players[1]) {
    const s0 = io.sockets.sockets.get(room.players[0]), s1 = io.sockets.sockets.get(room.players[1]);
    if (s0 && s1 && s0.clientIp && s0.clientIp === s1.clientIp) sameIp = true;
  }
  const turns = (room.game && room.game.turn) || 0;
  const playtimeSec = room.startedAt ? Math.floor((Date.now() - room.startedAt) / 1000) : 0;
  const friendly = !!room.secret;   // 비밀번호(친선) 방 = 자만추 방지 대상
  // 상대 계정 uid (같은 상대와 하루 3판 초과 감지용)
  const uidOf = t => { const u = t && accounts.byToken(t); return u ? u.id : null; };
  room.tokens.forEach((tok, i) => {
    if (!tok) return;
    const result = winner === 0 ? 'draw' : (winner === i + 1 ? 'win' : 'loss');
    const oppLabel = room.vsBot ? 'AI' : (room.nicks ? room.nicks[1 - i] : '상대');
    const oppUid = room.vsBot ? null : uidOf(room.tokens[1 - i]);
    const out = accounts.recordResult(tok, result, {
      vsBot: room.vsBot, difficulty: room.difficulty, oppLabel,
      sameIp, friendly, turns, playtimeSec, oppUid, forfeit, setKind,
      // 위장 봇 매치(10초 매칭 실패 → 전문가봇 입장)도 RP 를 준다.
      // 유저 입장에서는 사람과 붙은 것과 구별되지 않는데 보상만 다르면 억울하다.
      // 대가로 RP 는 더 이상 유저끼리 제로섬이 아니게 된다 — 봇은 잃지 않으니
      // 이긴 만큼이 새로 생긴다.
      // RP 는 랭크게임(무작위 매칭)에서만 오간다. 빠른대전·빠른 입장·방 만들기·
      // 친구방은 코인과 경험치만 준다 — 등급이 안 움직이니 편하게 붙는다.
      // 랭크 안에서는 세 모드를 가리지 않는다. 예전엔 아이템전만 빼 뒀는데,
      // 이제 랭크가 세 모드를 무작위로 돌리므로 하나만 빼면 "아이템전이 뜨면
      // 점수가 안 걸리는 판" 이 되어, 그게 뜨길 기다리는 사람이 생긴다.
      noRank: !room.ranked || !!room.noRank,
    });
    if (out && room.players[i]) io.to(room.players[i]).emit('profile', { profile: out.profile, result, rewards: out.rewards });
  });
  // 관전자에게 종료 알림
  (room.specs || []).forEach(sid => io.to(sid).emit('game_over', { winner, spec: true, nicks: room.nicks }));

  // 솔로 토너먼트 경기였으면 대진표를 진행시킨다.
  if (room.stour) {
    const i = room.players.indexOf(room.stour.sid);
    const iWon = i >= 0 && winner === i + 1;
    setTimeout(() => stourResult(room, iWon), 900);
  }

  // 토너먼트 경기였으면 대진표에 결과를 적는다.
  // 모든 종료 경로(세트승·시간패·탈주·진행도)가 이 함수를 지나므로 여기 한 곳이면 된다.
  if (room.tour && tour && room.tour.id === tour.id) {
    // winner 는 1·2 (0=무승부). 무승부면 앞자리를 올린다 — 대진은 한 명만 올라간다.
    const idx = winner === 2 ? 1 : 0;
    const seat = room.tour.seats[idx];
    setTimeout(() => tourReport(room.tour.round, room.tour.index, seat), 900);
  }
}

// 전역 예외 방어 — 처리 안 된 오류로 프로세스가 죽어 모든 실시간 게임이 끊기지 않게
process.on('uncaughtException', e => console.error('[uncaughtException]', e && e.stack || e));
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e && e.stack || e));

tourEnsureLobby();   // 서버가 뜨면 다음 회차 접수를 연다

const PORT = process.env.PORT || 3000;
const server = http.listen(PORT, () => console.log(`http://localhost:${PORT}`));

// ── 시즌과 백업 ────────────────────────────────────────────────────────────
// 둘 다 "언제 재시작해도 한 번은 돈다" 를 노린다. 자정에 딱 맞추려 들면
// 그 순간에 서버가 안 떠 있을 때 영영 안 돈다.
const HOUR = 3600 * 1000;
function seasonTick() {
  try { accounts.checkSeason(); } catch (e) { console.error('시즌 확인 실패:', e.message); }
}
async function backupTick() {
  try {
    const out = await accounts.saveSnapshot();
    if (out && out.error) console.error('백업 실패:', out.error);
  } catch (e) { console.error('백업 실패:', e.message); }
}
setTimeout(() => { seasonTick(); backupTick(); }, 20000);   // DB 로드가 끝난 뒤
setInterval(seasonTick, HOUR);
setInterval(backupTick, 24 * HOUR);

// 배포/재시작(SIGTERM) 시 새 연결 차단 후 정리 — 진행 중 저장은 이미 즉시 persist됨
process.on('SIGTERM', () => { console.log('SIGTERM 수신 — 종료 중'); accounts.flushNow(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000); });

// ══════════════════════════════════════════════════════════
// 미니게임 테이블 — 솔로(AI)와 멀티(사람)를 한 코드로 굴린다.
//
// 두 벌로 나누면 규칙이 갈라진다. 자리에 사람이 앉았는지 AI 가 앉았는지만
// 다르고 나머지는 같으므로, 자리 배열 하나로 둘 다 다룬다.
//
// 돈은 자리에 앉을 때 밑천으로 바꾸고 일어설 때 되돌린다. 판마다 계좌를
// 건드리지 않는다 — 경쟁 조건이 생기고, 올인이 뜻을 가지려면 밑천이 있어야 한다.
const miniTables = new Map();               // id → table
const miniQueue = { 2: [], 3: [], 4: [] };  // 정원별 대기열 (멀티)
// 사람이 안 두면 대신 넘겨준다. 짧으면 패를 까 보고 셈할 틈도 없이 넘어간다 —
// 남을 오래 기다리게 하는 값이라 무한정 늘릴 수는 없어 45초로 잡았다.
const MINI_TURN_MS = 45000;
// 판이 끝나고 다음 판까지. 짧으면 남의 패를 볼 새도 없이 화면이 갈아엎힌다 —
// 이 게임은 "왜 졌는지" 를 패를 보고 배우는 게 전부라 넉넉히 준다.
const MINI_NEXT_MS = 9000;
const MINI_FILL_MS = 20000;                 // 이만큼 안 차면 AI 로 채워 시작
const MINI_AI_NAMES = ['타짜 김씨', '홍박사', '미스박', '광팔이'];
// 자리값은 코인으로 받고 판에서는 달로 논다(1코인 = 10달).
// 200코인이면 2000달 — 판은 큼직하게 굴러가고 실제로 드는 코인은 적다.
const MINI_BUY_COIN = SUTDA.BUY_IN / SUTDA.MOON_PER_COIN;   // 200
const MINI_MIN_COIN = 20;                                   // 이만큼(=200달)은 있어야 판이 된다
let miniSeq = 1;

const miniLive = (t) => t.seats.filter((s) => s && s.stack >= SUTDA.ANTE).length;
const miniHumans = (t) => t.seats.filter((s) => s && !s.ai).length;

function miniSockOf(seat) {
  return seat && !seat.ai ? io.sockets.sockets.get(seat.key) : null;
}

// 대기열에서 뺀다. tell 이면 취소했다고 알려 준다.
function miniDequeue(socket, tell) {
  let found = false;
  for (const n of [2, 3, 4]) {
    const q = miniQueue[n];
    const at = q.findIndex((e) => e.socket.id === socket.id);
    if (at < 0) continue;
    const [e] = q.splice(at, 1);
    clearTimeout(e.timer);
    found = true;
    // 참가비는 대기열에 설 때 받지 않았으므로 돌려줄 것이 없다
    if (q.length) miniQueuePush(n);
  }
  if (found && tell) socket.emit('mini_queue', { seats: 0, need: 0, cancelled: true });
}

function miniQueuePush(n) {
  const q = miniQueue[n];
  for (const e of q) e.socket.emit('mini_queue', { seats: q.length, need: n, waiting: true });
}

// 자리에 앉는다. mode 가 'solo' 면 나머지는 AI, 'multi' 면 사람을 기다린다.
function miniSit(socket, seats, mode) {
  if (!socket.token) return socket.emit('mini_error', '로그인이 필요해요.');
  if (socket.mini) return socket.emit('mini_error', '이미 자리에 앉아 있어요.');
  const n = Math.min(SUTDA.MAX_SEATS, Math.max(SUTDA.MIN_SEATS, Number(seats) || 2));
  const u = accounts.byToken(socket.token);
  if (!u) return socket.emit('mini_error', '로그인이 필요해요.');
  // 가진 만큼 들고 앉는다(최대 BUY_IN). 정액으로 받으면 시작한 지 얼마 안 된
  // 사람은 아예 못 앉는다 — 실제로 가입 코인(200)보다 자리값이 커져서 막혔다.
  // 적게 들고 온 사람이 손해도 아니다. 사이드팟이 없어 레이즈는 제일 적게
  // 가진 사람이 받을 수 있는 만큼에서 끊기기 때문이다.
  if ((u.coins || 0) < MINI_MIN_COIN) return socket.emit('mini_error', `코인이 ${MINI_MIN_COIN} 이상 있어야 앉을 수 있어요.`);

  if (mode === 'solo') return miniOpenTable(n, [socket], 'solo');

  // 멀티 — 정원이 찰 때까지 기다린다. 안 차면 AI 로 메운다.
  miniDequeue(socket, false);
  const q = miniQueue[n];
  const entry = { socket, timer: null };
  q.push(entry);
  entry.timer = setTimeout(() => {
    const at = q.indexOf(entry);
    if (at < 0) return;
    const mine = q.splice(0, q.length);              // 기다리던 사람 전부 한 테이블로
    for (const e of mine) clearTimeout(e.timer);
    miniOpenTable(n, mine.map((e) => e.socket), 'multi');
  }, MINI_FILL_MS);
  miniQueuePush(n);
  if (q.length >= n) {
    const mine = q.splice(0, n);
    for (const e of mine) clearTimeout(e.timer);
    miniOpenTable(n, mine.map((e) => e.socket), 'multi');
  }
}

// 테이블을 연다. humans 는 앉을 사람들(정원보다 적으면 나머지는 AI).
function miniOpenTable(n, humans, mode) {
  const t = {
    id: 'M' + (miniSeq++), n, mode,
    seats: new Array(n).fill(null),
    st: null, first: null,
    turnTimer: null, nextTimer: null, aiTimer: null,
    settled: true,
  };
  let seat = 0;
  for (const sk of humans) {
    if (seat >= n) break;
    if (!sk || !sk.connected || !sk.token) continue;
    // 코인을 내고 달로 바꾼다 — 여기서 실패하면 그 사람은 못 앉는다
    const have = accounts.byToken(sk.token);
    const coin = Math.min(MINI_BUY_COIN, Math.max(0, (have && have.coins) || 0));
    if (coin < MINI_MIN_COIN) { sk.emit('mini_error', `코인이 ${MINI_MIN_COIN} 이상 있어야 앉을 수 있어요.`); continue; }
    const paid = accounts.miniStake(sk.token, coin);
    if (paid.error) { sk.emit('mini_error', paid.error); continue; }
    const u = accounts.byToken(sk.token);
    t.seats[seat] = { ai: false, key: sk.id, token: sk.token,
      nick: (u && u.nick) || '나', buyCoin: coin, stack: coin * SUTDA.MOON_PER_COIN };
    sk.mini = { tableId: t.id, seat };
    seat++;
  }
  if (!seat) return;                                  // 아무도 못 앉았다
  let ai = 0;
  for (let i = 0; i < n; i++) if (!t.seats[i])
    t.seats[i] = { ai: true, key: null, nick: MINI_AI_NAMES[ai++ % MINI_AI_NAMES.length], stack: SUTDA.BUY_IN };
  miniTables.set(t.id, t);
  miniStartHand(t, null);
}

function miniStartHand(t, first) {
  clearTimeout(t.nextTimer); clearTimeout(t.turnTimer); clearTimeout(t.aiTimer);
  if (miniHumans(t) === 0) return miniCloseTable(t);
  // 밑천이 바닥난 AI 는 다시 채운다 — 자리가 비면 판이 안 선다
  for (const s of t.seats) if (s && s.ai && s.stack < SUTDA.ANTE) s.stack = SUTDA.BUY_IN;
  // 돈이 없는 사람은 자동으로 일어난다
  for (let i = 0; i < t.n; i++) {
    const s = t.seats[i];
    if (s && !s.ai && s.stack < SUTDA.ANTE) miniSeatOut(t, i, '소지금이 떨어졌어요.');
  }
  if (miniHumans(t) === 0) return miniCloseTable(t);
  if (miniLive(t) < 2) miniFillSeats(t);
  if (miniLive(t) < 2) return miniCloseTable(t);

  t.st = SUTDA.start({ seats: t.n, stacks: t.seats.map((s) => (s ? s.stack : 0)), first });
  t.settled = false;
  miniPushAll(t);
  miniAdvance(t);
}

// 남에게 보여줄 자리 정보 — 패는 sutda 가 이미 걸러 준다.
function miniViewFor(t, seat) {
  const v = SUTDA.viewFor(t.st, seat);
  v.names = t.seats.map((s) => (s ? s.nick : '빈자리'));
  v.ais = t.seats.map((s) => !!(s && s.ai));
  v.gone = t.seats.map((s) => !s);
  v.mode = t.mode;
  v.rate = SUTDA.MOON_PER_COIN;
  v.deadline = t.deadline || 0;
  return v;
}

function miniPushAll(t) {
  if (!t.st) return;
  for (let i = 0; i < t.n; i++) {
    const sk = miniSockOf(t.seats[i]);
    if (sk) sk.emit('mini_state', miniViewFor(t, i));
  }
}

// 차례를 굴린다 — AI 면 잠시 뒤 두고, 사람이면 시계를 건다.
function miniAdvance(t) {
  clearTimeout(t.turnTimer); clearTimeout(t.aiTimer);
  if (!t.st) return;
  if (t.st.over) return miniHandOver(t);
  const seat = t.st.turn;
  const s = t.seats[seat];
  if (!s) {                                   // 나간 자리는 바로 죽인다
    SUTDA.act(t.st, seat, 'die'); miniPushAll(t); return miniAdvance(t);
  }
  if (s.ai) {
    t.deadline = 0;
    t.aiTimer = setTimeout(() => {
      if (!t.st || t.st.over || t.st.turn !== seat) return;
      const a = SUTDA.aiAction(SUTDA.viewFor(t.st, seat)) || 'die';
      SUTDA.act(t.st, seat, a);
      miniPushAll(t);
      miniAdvance(t);
    }, 650 + Math.floor(Math.random() * 500));
    return;
  }
  // 사람 — 안 두고 버티면 판이 멈춘다. 시간이 지나면 대신 넘겨준다.
  t.deadline = Date.now() + MINI_TURN_MS;
  miniPushAll(t);
  t.turnTimer = setTimeout(() => {
    if (!t.st || t.st.over || t.st.turn !== seat) return;
    const acts = SUTDA.actionsFor(t.st, seat);
    SUTDA.act(t.st, seat, acts.includes('check') ? 'check' : 'die');
    miniPushAll(t);
    miniAdvance(t);
  }, MINI_TURN_MS + 500);
}

function miniHumanAct(socket, action) {
  const m = socket.mini;
  const t = m && miniTables.get(m.tableId);
  if (!t || !t.st || t.st.over) return socket.emit('mini_error', '진행 중인 판이 없어요.');
  if (t.st.turn !== m.seat) return socket.emit('mini_error', '아직 차례가 아니에요.');
  const r = SUTDA.act(t.st, m.seat, String(action || ''));
  if (!r.ok) return socket.emit('mini_error', r.error);
  miniPushAll(t);
  miniAdvance(t);
}

// 한 판이 끝났다. 밑천만 옮겨 두고, 코인은 일어설 때 정산한다.
function miniHandOver(t) {
  if (!t.st || t.settled) return;
  t.settled = true;
  clearTimeout(t.turnTimer); clearTimeout(t.aiTimer);
  t.deadline = 0;
  t.ready = new Set();                      // "다음 판" 을 누른 사람
  for (let i = 0; i < t.n; i++) if (t.seats[i]) t.seats[i].stack = t.st.stack[i];
  for (let i = 0; i < t.n; i++) {
    const sk = miniSockOf(t.seats[i]);
    if (!sk) continue;
    const won = t.st.winner === i;
    accounts.miniPay(sk.token, 0, won);            // 판수·승수만 (코인은 0)
    sk.emit('mini_over', {
      view: miniViewFor(t, i), won,
      verdict: SUTDA.verdictOf(t.st),           // 왜 그 패가 이겼는지 — 규칙은 한 곳에서만 판정한다
      gain: won ? t.st.pot : 0,
      net: (won ? t.st.pot : 0) - t.st.put[i],
      canGo: t.seats[i].stack >= SUTDA.ANTE,
      nextIn: MINI_NEXT_MS,
    });
  }
  // 다음 판은 알아서 시작한다 — 멀티에서 한 사람이 안 누르면 다 같이 멈춘다.
  const first = t.st.first;
  t.nextTimer = setTimeout(() => miniStartHand(t, first), MINI_NEXT_MS);
}

// "다음 판" — 기다리지 않고 바로 다음 판으로 간다.
//
// 혼자면 누르는 즉시. 여럿이면 앉아 있는 사람이 다 누를 때까지 기다린다 —
// 한 사람이 먼저 눌렀다고 남이 패를 보던 중에 판이 갈아엎히면 안 된다.
// 아무도 안 눌러도 시계(MINI_NEXT_MS)가 돌면 어차피 시작하므로 판은 안 멈춘다.
function miniWantNext(socket) {
  const m = socket.mini;
  const t = m && miniTables.get(m.tableId);
  if (!t) return socket.emit('mini_error', '자리에 앉아 있지 않아요.');
  if (t.st && !t.st.over) return socket.emit('mini_error', '아직 판이 안 끝났어요.');
  t.ready = t.ready || new Set();
  t.ready.add(m.seat);

  const humans = [];
  for (let i = 0; i < t.n; i++) if (t.seats[i] && !t.seats[i].ai) humans.push(i);
  const waiting = humans.filter((i) => !t.ready.has(i));
  if (waiting.length) {
    // 아직 안 누른 사람이 있다 — 몇 명 남았는지 모두에게 알려 준다
    for (const i of humans) {
      const sk = miniSockOf(t.seats[i]);
      if (sk) sk.emit('mini_ready', { ready: t.ready.size, need: humans.length, me: t.ready.has(i) });
    }
    return;
  }
  clearTimeout(t.nextTimer);
  miniStartHand(t, t.st ? t.st.first : null);
}

// 한 자리를 비운다(코인 정산 포함). 판이 도는 중이면 죽은 것으로 친다.
function miniSeatOut(t, seat, why) {
  const s = t.seats[seat];
  if (!s) return;
  t.seats[seat] = null;
  if (s.ai) return;
  // 판이 도는 중이면 죽고 나간다 — 이미 건 돈은 판돈에 남는다
  if (t.st && !t.st.over && t.st.alive[seat]) {
    SUTDA.act(t.st, seat, 'die');
    s.stack = t.st.stack[seat];
  }
  // 달을 코인으로 되돌린다. 내림이라 잔돈은 버려진다 — 한 코인이 안 되는 달이다.
  const moons = Math.max(0, s.stack | 0);
  const back = Math.floor(moons / SUTDA.MOON_PER_COIN);
  const res = accounts.miniPay(s.token, back, null);       // 정산 — 전적은 안 센다
  const sk = io.sockets.sockets.get(s.key);
  if (sk) {
    sk.mini = null;
    sk.emit('mini_stood', {
      back, moons, rate: SUTDA.MOON_PER_COIN,
      buyIn: s.buyCoin || MINI_BUY_COIN, net: back - (s.buyCoin || MINI_BUY_COIN),
      coins: res && res.coins, profile: res && res.profile, why: why || null,
    });
  }
}

// 빈자리를 AI 로 메운다. 사람이 나갔다고 남은 사람까지 쫓아내면
// "둘이 붙다 하나 나가면 판이 끝난다" 가 되어, 지는 쪽이 나가는 게 이득이 된다.
function miniFillSeats(t) {
  let ai = 0;
  for (let i = 0; i < t.n; i++) {
    if (t.seats[i]) continue;
    t.seats[i] = { ai: true, key: null, stack: SUTDA.BUY_IN,
      nick: MINI_AI_NAMES[(ai++ + i) % MINI_AI_NAMES.length] };
  }
}

function miniStand(socket, why) {
  const m = socket.mini;
  const t = m && miniTables.get(m.tableId);
  if (!t) { socket.mini = null; return; }
  const wasTurn = t.st && !t.st.over && t.st.turn === m.seat;
  miniSeatOut(t, m.seat, why || null);
  if (miniHumans(t) === 0) return miniCloseTable(t);
  // 남은 사람이 혼자 앉아 있게 두지 않는다 — 빈자리는 다음 판부터 AI 가 맡는다
  if (miniLive(t) < 2) miniFillSeats(t);
  miniPushAll(t);
  if (t.st && t.st.over) miniHandOver(t);
  else if (wasTurn || (t.st && !t.st.over)) miniAdvance(t);
}

function miniCloseTable(t) {
  clearTimeout(t.turnTimer); clearTimeout(t.aiTimer); clearTimeout(t.nextTimer);
  for (let i = 0; i < t.n; i++) if (t.seats[i] && !t.seats[i].ai) miniSeatOut(t, i, '테이블이 닫혔어요.');
  miniTables.delete(t.id);
}
