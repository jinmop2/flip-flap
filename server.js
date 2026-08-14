const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const accounts = require('./accounts');
const expert3 = require('./expert3');   // 전문가 AI v3 (카운팅+몬테카를로+종반탐색)
const items = require('./items');       // 아이템전(이벤트 모드) 아이템 12종
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
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, fp) {
    if (fp.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');                       // SW 갱신 즉시 감지
    else if (/\.(png|jpg|svg|ico|mp3|m4a|woff2?)$/.test(fp)) res.setHeader('Cache-Control', 'public, max-age=604800');  // 아이콘·음악·폰트 7일 캐시
    else res.setHeader('Cache-Control', 'no-cache');                                            // html/js: etag 재검증(304) — 배포 즉시 반영
  },
}));

// 간단 rate limit (IP·엔드포인트당 분당 N회) — 무차별 대입 방지
// 주의: 카운터를 IP만으로 잡으면 모든 API가 한 카운터를 공유해, 실효 한도가 가장 낮은
//      엔드포인트 값으로 떨어진다(예: 목록 몇 번 조회하면 클랜 생성이 막힘). 경로까지 키에 포함한다.
const rlMap = new Map();
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
app.post('/api/signup', rateLimit(20), (req, res) => { const { id, password, nick } = req.body || {}; const out = accounts.signup(id, password, nick); if (out.ok) stats.bump('signups'); res.json(out); });
app.post('/api/login',  rateLimit(30), (req, res) => { const { id, password } = req.body || {}; res.json(accounts.login(id, password)); });
app.post('/api/me',     rateLimit(90), (req, res) => { const { token } = req.body || {}; res.json(accounts.meByToken(token)); });

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
function adminOk(req, res) {
  const KEY = ADMIN_KEY();
  if (!KEY) { res.status(403).json({ error: 'Render 환경변수에 ADMIN_KEY 를 설정해주세요.' }); return false; }
  if (!req.body || req.body.key !== KEY) { res.status(403).json({ error: '잘못된 키입니다.' }); return false; }
  return true;
}
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

// 코드로 로그인. 여기가 유일하게 열려 있는 문이라 좁게 연다.
//   · IP 당 분당 8회 (rateLimit)
//   · 틀릴수록 느려진다 — 자동으로 찍어 보는 쪽만 손해를 본다
//   · 맞든 틀리든 답이 같은 시간에 나가게 최소 대기를 둔다
const codeFail = new Map();     // ip → { n, ts }
app.post('/api/code-login', rateLimit(8), async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
  const now = Date.now();
  let f = codeFail.get(ip);
  if (!f || now - f.ts > 10 * 60000) f = { n: 0, ts: now };
  // 틀린 횟수만큼 기다리게 한다(최대 4초). 사람은 못 느끼고 기계는 못 견딘다.
  const wait = Math.min(4000, f.n * 400);
  const started = now;
  const out = accounts.codeLogin((req.body || {}).code);
  if (out.error) { f.n++; f.ts = now; codeFail.set(ip, f); }
  else codeFail.delete(ip);
  const spent = Date.now() - started;
  await new Promise((r) => setTimeout(r, Math.max(0, wait + 120 - spent)));
  res.json(out);
});
setInterval(() => { const now = Date.now(); for (const [k, v] of codeFail) if (now - v.ts > 15 * 60000) codeFail.delete(k); }, 5 * 60000);

// 관리자 페이지 — 키는 이 화면에서 입력받아 요청 본문으로만 보낸다 (URL 에 안 남음)
app.get('/admin', rateLimit(20), (req, res) => {
  res.type('html').send(`<!DOCTYPE html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>FLIP FLAP 관리</title>
<style>
 body{font-family:system-ui,sans-serif;background:#1a0b10;color:#e8dfc8;margin:0;padding:18px;max-width:820px}
 h1{color:#ffd94a;font-size:1.15rem;margin:0 0 14px}
 .card{background:#2a1018;border:1px solid #5a3a20;border-radius:12px;padding:14px;margin-bottom:14px}
 label{display:block;font-size:.8rem;color:#c8a86a;margin:8px 0 3px}
 input{width:100%;box-sizing:border-box;padding:9px;border-radius:8px;border:1px solid #5a3a20;background:#160810;color:#e8dfc8;font-size:.95rem}
 button{background:#ffd94a;color:#2a1008;border:0;border-radius:8px;padding:10px 16px;font-weight:800;cursor:pointer;font-size:.95rem}
 button.ghost{background:transparent;color:#c8a86a;border:1px solid #5a3a20}
 .row{display:flex;gap:8px;flex-wrap:wrap}.row>div{flex:1;min-width:120px}
 table{border-collapse:collapse;width:100%;font-size:.8rem;margin-top:10px}
 th,td{border:1px solid #4a2a18;padding:5px 8px;text-align:left}
 th{background:#3a1018;color:#ffd94a}
 tr.dead{opacity:.45;text-decoration:line-through}
 code{background:#160810;padding:3px 7px;border-radius:5px;color:#8fe0a0;font-size:.95rem;letter-spacing:.06em}
 .msg{margin-top:10px;font-size:.85rem}.err{color:#ff9a9a}.ok{color:#8fe0a0}
 .codes{display:flex;flex-direction:column;gap:5px;margin-top:10px}
</style>
<h1>🎟 FLIP FLAP — 쿠폰 · 임시 계정</h1>

<div class="card">
  <label>관리자 키 (Render 환경변수 ADMIN_KEY)</label>
  <input id="key" type="password" placeholder="키를 입력하세요" autocomplete="off">
  <div class="msg" id="keyMsg"></div>
</div>

<div class="card">
  <b>쿠폰 발행</b>
  <div class="row">
    <div><label>지급 코인</label><input id="coins" type="number" value="500" min="1"></div>
    <div><label>발행 장수</label><input id="count" type="number" value="1" min="1" max="200"></div>
  </div>
  <div class="row">
    <div><label>장당 사용 인원 (0=무제한)</label><input id="maxUses" type="number" value="1" min="0"></div>
    <div><label>유효 기간(일, 0=무기한)</label><input id="days" type="number" value="0" min="0"></div>
  </div>
  <div class="row">
    <div><label>최소 레벨 (0=제한 없음)</label><input id="minLevel" type="number" value="0" min="0"></div>
    <div><label>메모</label><input id="memo" placeholder="예: 오픈채팅 이벤트"></div>
  </div>
  <div class="row">
    <div><label>칭호 지급 (선택)</label><select id="title"><option value="">— 없음 —</option>${
      Object.entries(accounts.TITLES).map(([id, t]) =>
        `<option value="${id}">${t.icon} ${t.name}</option>`).join('')
    }</select></div>
    <div><label>코드 직접 지정 (선택, 영문·숫자 8~20자)</label><input id="code" placeholder="비우면 자동 생성"></div>
  </div>
  <div class="msg">칭호만 줄 거면 지급 코인을 0 으로 두세요.</div>
  <div style="margin-top:12px"><button onclick="mk()">발행하기</button></div>
  <div class="msg" id="mkMsg"></div>
  <div class="codes" id="codes"></div>
</div>

<div class="card">
  <b>발행 목록</b> <button class="ghost" onclick="load()" style="float:right">새로고침</button>
  <div id="list"></div>
</div>

<div class="card">
  <b>임시 계정 (코드로 로그인)</b>
  <div class="msg">코드는 <b>만들 때 딱 한 번</b>만 보입니다. 서버에는 해시만 남아 나중에 다시 볼 수 없어요.</div>
  <div class="row">
    <div><label>개수</label><input id="tCount" type="number" value="5" min="1" max="20"></div>
    <div><label>지급 코인</label><input id="tCoins" type="number" value="3000" min="0"></div>
  </div>
  <div style="margin-top:12px"><button onclick="tmk()">계정 만들기</button>
    <button class="ghost" onclick="tload()">목록 새로고침</button></div>
  <div class="msg" id="tMsg"></div>
  <div class="codes" id="tCodes"></div>
  <div id="tList"></div>
</div>

<script>
const $=id=>document.getElementById(id);
const key=()=>$('key').value.trim();
async function post(path, body){
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...body,key:key()})});
  return r.json();
}
async function mk(){
  $('mkMsg').textContent=''; $('codes').innerHTML='';
  if(!key()) return $('mkMsg').className='msg err', $('mkMsg').textContent='키를 입력해주세요.';
  const out=await post('/api/admin/coupon-new',{
    coins:+$('coins').value, count:+$('count').value, maxUses:+$('maxUses').value,
    days:+$('days').value, minLevel:+$('minLevel').value, memo:$('memo').value,
    title:$('title').value, code:$('code').value.trim()});
  if(out.error){ $('mkMsg').className='msg err'; $('mkMsg').textContent='⚠ '+out.error; return; }
  $('mkMsg').className='msg ok';
  const what=[]; if(out.coins) what.push(out.coins+'코인'); if(out.title) what.push('칭호 '+out.title);
  $('mkMsg').textContent=out.codes.length+'장 발행 완료'+(what.length?' (장당 '+what.join(' + ')+')':'');
  $('codes').innerHTML=out.codes.map(c=>'<code>'+c+'</code>').join('');
  load();
}
async function load(){
  if(!key()) return;
  const out=await post('/api/admin/coupon-list',{});
  if(out.error){ $('keyMsg').className='msg err'; $('keyMsg').textContent='⚠ '+out.error; $('list').innerHTML=''; return; }
  $('keyMsg').className='msg ok'; $('keyMsg').textContent='확인됨';
  const rows=out.coupons.map(c=>'<tr class="'+(c.dead?'dead':'')+'"><td><code>'+c.code+'</code></td><td>'+
    (c.titleName?c.titleName:c.coins)+
    '</td><td>'+c.uses+(c.maxUses?'/'+c.maxUses:'/∞')+'</td><td>'+
    (c.expiresAt?new Date(c.expiresAt).toLocaleDateString('ko-KR'):'-')+'</td><td>'+
    (c.minLevel||'-')+'</td><td>'+(c.memo||'')+'</td></tr>').join('');
  $('list').innerHTML=out.coupons.length
    ? '<table><tr><th>코드</th><th>지급</th><th>사용</th><th>만료</th><th>최소Lv</th><th>메모</th></tr>'+rows+'</table>'
    : '<div class="msg">아직 발행한 쿠폰이 없어요.</div>';
}
// ── 임시 계정 ──
async function tmk(){
  $('tMsg').textContent=''; $('tCodes').innerHTML='';
  if(!key()) return $('tMsg').className='msg err', $('tMsg').textContent='키를 입력해주세요.';
  const out=await post('/api/admin/temp-new',{count:+$('tCount').value, coins:+$('tCoins').value});
  if(out.error){ $('tMsg').className='msg err'; $('tMsg').textContent='⚠ '+out.error; return; }
  $('tMsg').className='msg ok';
  $('tMsg').textContent=out.accounts.length+'개 만들었어요 — 아래 코드를 지금 복사해 두세요 (다시 못 봅니다)';
  $('tCodes').innerHTML=out.accounts.map(a=>
    '<div>'+a.nick+' · <code>'+a.code+'</code></div>').join('');
  tload();
}
async function trot(id){
  if(!confirm(id+' 코드를 다시 발급할까요? 지금 코드는 즉시 못 쓰게 됩니다.')) return;
  const out=await post('/api/admin/temp-rotate',{id});
  if(out.error){ $('tMsg').className='msg err'; $('tMsg').textContent='⚠ '+out.error; return; }
  $('tMsg').className='msg ok'; $('tMsg').textContent=out.nick+' 새 코드';
  $('tCodes').innerHTML='<div>'+out.nick+' · <code>'+out.code+'</code></div>';
  tload();
}
async function trev(id){
  if(!confirm(id+' 코드를 끌까요? 다시 켜려면 재발급해야 합니다.')) return;
  await post('/api/admin/temp-revoke',{id}); tload();
}
async function tload(){
  if(!key()) return;
  const out=await post('/api/admin/temp-list',{});
  if(out.error){ $('tList').innerHTML=''; return; }
  const rows=out.accounts.map(a=>'<tr class="'+(a.active?'':'dead')+'"><td>'+a.id+'</td><td>'+a.nick+
    '</td><td>'+a.coins+'</td><td>'+(a.expiresAt?new Date(a.expiresAt).toLocaleDateString('ko-KR'):'-')+
    '</td><td><button class="ghost" onclick="trot(\''+a.id+'\')">재발급</button> '+
    '<button class="ghost" onclick="trev(\''+a.id+'\')">끄기</button></td></tr>').join('');
  $('tList').innerHTML=out.accounts.length
    ? '<table><tr><th>아이디</th><th>닉네임</th><th>코인</th><th>만료</th><th></th></tr>'+rows+'</table>'
    : '<div class="msg">아직 만든 임시 계정이 없어요.</div>';
}
$('key').addEventListener('change',()=>{load();tload();});
</script>`);
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
  return { online: true, ingame: !!(sk.roomId || sk.g4room) };
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
  if (!process.env.STATS_KEY || req.query.key !== process.env.STATS_KEY) return res.status(404).send('Not found');
  res.json(accounts.reportList(100));
});
app.post('/api/daily',  rateLimit(30), (req, res) => { const { token } = req.body || {}; res.json(accounts.claimDaily(token) || { error: '로그인이 필요해요.' }); });
app.post('/api/missions', rateLimit(60), (req, res) => { const { token } = req.body || {}; res.json(accounts.missionList(token)); });
// 보상 수령 — 금액은 서버가 정한다. 화면은 어느 미션인지만 보낸다.
app.post('/api/mission-claim', rateLimit(40), (req, res) => { const { token, id } = req.body || {}; res.json(accounts.claimMission(token, id)); });
app.post('/api/tutorial-done', rateLimit(20), (req, res) => { const { token } = req.body || {}; const out = accounts.claimTutorial(token); if (out.claimed) stats.bump('tutorial'); res.json(out); });
app.post('/api/refer', rateLimit(10), (req, res) => { const { token, ref } = req.body || {}; res.json(accounts.applyReferral(token, ref)); });
app.post('/api/titles',   rateLimit(60), (req, res) => { const { token } = req.body || {}; res.json(accounts.titleList(token)); });
app.post('/api/equip-title', rateLimit(30), (req, res) => { const { token, titleId } = req.body || {}; res.json(accounts.equipTitle(token, titleId || null)); });
app.post('/api/myrank', rateLimit(60), (req, res) => { const { token } = req.body || {}; res.json({ ok: true, me: accounts.myRank(token) }); });
app.get('/api/leaderboard', rateLimit(60), (req, res) => res.json({ ok: true, players: accounts.topPlayers(20) }));
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

const SPEC = [[2,2],[3,5],[4,7],[6,10]];

function initDeck() {
  const cards = [];
  for (const [kind, count] of SPEC)
    for (let g = 1; g <= count; g++)
      cards.push({ kind, grade: g, id: kind*100 + g });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards; // 24장
}

// 배팅 강도: 값이 작을수록 강함 (종류 우선, 그 다음 등급)
function strength(c) { return c.kind * 100 + c.grade; }

const is610 = c => c.kind === 6 && c.grade === 10;
const is21  = c => c.kind === 2 && c.grade === 1;

// a가 b를 이기면 true. 졸개의 배신: 6-10이 2-1을 이긴다.
function aBeatsB(a, b) {
  if (is610(a) && is21(b)) return true;
  if (is610(b) && is21(a)) return false;
  return strength(a) < strength(b);
}

function checkSet(acquired) {
  const counts = {};
  for (const c of acquired) counts[c.kind] = (counts[c.kind] || 0) + 1;
  for (const [kind] of SPEC)
    if ((counts[kind] || 0) >= kind) return kind;
  return null;
}
// 세트 진행도 [최고 근접비율, 총 획득수] — 덱 소진 시 판정용
function progress(acquired) {
  const counts = {};
  for (const c of acquired) counts[c.kind] = (counts[c.kind] || 0) + 1;
  let best = 0, bestKind = null;
  for (const [kind] of SPEC) {
    const r = (counts[kind] || 0) / kind;
    if (r > best) { best = r; bestKind = kind; }
  }
  return { ratio: best, total: acquired.length, kind: bestKind };
}
// 세트 완성까지 남은 최소 장수 — 작을수록 "리치"에 가깝다
function needLeft(acquired) {
  const counts = {};
  for (const c of acquired) counts[c.kind] = (counts[c.kind] || 0) + 1;
  let best = Infinity;
  for (const [kind] of SPEC) best = Math.min(best, kind - (counts[kind] || 0));
  return best;
}
// 획득 카드의 강함 합계 (strength 는 작을수록 강함)
function strengthSum(acquired) { return acquired.reduce((s, c) => s + strength(c), 0); }

// 반환: 1(P1승) | 2(P2승) | 0(무승부)
// 덱이 떨어져 승부가 안 났을 때 — 세트에 가장 가까운 사람이 이긴다.
// 한 단계에서 갈리지 않으면 다음 기준으로 넘어가, 사실상 무승부가 나지 않게 한다.
function resolveByProgress(acq1, acq2) {
  const n1 = needLeft(acq1), n2 = needLeft(acq2);
  if (n1 !== n2) return n1 < n2 ? 1 : 2;                     // ① 완성까지 남은 장수가 적은 쪽
  const a = progress(acq1), b = progress(acq2);
  if (a.ratio !== b.ratio) return a.ratio > b.ratio ? 1 : 2;  // ② 세트 진행률
  if (a.total !== b.total) return a.total > b.total ? 1 : 2;  // ③ 총 획득 장수
  const s1 = strengthSum(acq1), s2 = strengthSum(acq2);
  if (s1 !== s2) return s1 < s2 ? 1 : 2;                      // ④ 모은 카드가 더 강한 쪽
  return 0;   // 양쪽 모두 한 장도 못 가져간 극단적 경우에만 무승부
}

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

function createGame(itemMode = false) {
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
  if (itemMode) {
    game.itemMode = true;
    game.items = { 1: [], 2: [] };       // 보유 아이템 (최대 3)
    game.itemUsed = { 1: false, 2: false };  // 턴당 1개 제한
    game.fx = items.freshFx();           // 이번 경매에만 걸리는 효과
  }
  return game;
}

// 선공 뽑기 완료 → 강한 카드 뽑은 사람이 선공
function resolvePick(game) {
  const p = game.pick;
  const c1 = p.cards[p.choices[0]], c2 = p.cards[p.choices[1]];
  game.auctioneer = aBeatsB(c1, c2) ? 1 : 2;
  p.revealed = true;
  game.phase = 'pick_reveal';
}

// 현재 시간이 흐르는(행동해야 하는) 플레이어. 없으면 0
function activePlayer(g) {
  switch (g.phase) {
    case 'draw': case 'offer': case 'choose_type':
      return g.auctioneer;
    case 'bidding': {
      const aucBid = g.auctioneer === 1 ? g.auction.p1Submitted : g.auction.p2Submitted;
      return aucBid ? (g.auctioneer === 1 ? 2 : 1) : g.auctioneer;  // 진행자 먼저
    }
    default: return 0;  // pick, reveal, game_over
  }
}

// 덱에서 중앙 카드 뽑기 (draw → offer)
function drawCenter(game) {
  game.auction.centerCard = game.centerDeck.shift();
  game.phase = 'offer';
}

// ── CPU AI ──────────────────────────────────────────────────
// difficulty: easy | normal | hard | expert

function cpuTarget(acquired, hand) {
  const all = [...acquired, ...hand];
  const counts = {};
  for (const c of all) counts[c.kind] = (counts[c.kind] || 0) + 1;
  let best = 6, bestRatio = -1;
  for (const [kind] of SPEC) {
    const ratio = (counts[kind] || 0) / kind;
    if (ratio > bestRatio) { bestRatio = ratio; best = kind; }
  }
  return best;
}

// 경매품 가치 0~1 (내 목표 세트에 얼마나 가까워지는가)
function prizeValue(cards, acquired, hand) {
  const counts = {};
  for (const c of acquired) counts[c.kind] = (counts[c.kind] || 0) + 1;
  let maxVal = 0;
  for (const c of cards) {
    if (!c) continue;
    const owned = counts[c.kind] || 0;
    const needed = c.kind - owned;
    const val = needed <= 0 ? 1 : 1 / needed; // 1장 남으면 1, 멀면 낮음
    maxVal = Math.max(maxVal, val);
  }
  return Math.min(maxVal, 1);
}

function bluffRate(diff) {
  return { easy:0, normal:0, hard:0.15, expert:0.25 }[diff] ?? 0.1;
}

function cpuDecideBid(hand, prize, acquired, diff) {
  // 강한→약한 순 (strength 오름차순 = 강한 순)
  const byStrong = [...hand].sort((a, b) => strength(a) - strength(b));
  let val = prizeValue(prize, acquired, hand);

  // easy: 대충 무작위 편향
  if (diff === 'easy') {
    return byStrong[Math.floor(Math.random() * byStrong.length)];
  }

  // 목표 세트 커밋: 경매품에 내 목표 종류가 있으면 적극적으로 노림 (어려운 세트도 끝까지)
  const target = cpuTarget(acquired, hand);
  if (prize.some(c => c && c.kind === target)) val = Math.max(val, 0.72);

  // expert 졸개의 배신: 가치 낮은 경매품엔 6-10을 덤핑해 2-1 저격 세팅
  const has610 = hand.find(is610);
  if (diff === 'expert' && has610 && val < 0.4) return has610;

  // 블러핑: 필요없는 경매품에 강수 → 상대 강카드 소모 유도
  if ((diff === 'hard' || diff === 'expert') && Math.random() < bluffRate(diff) && val < 0.5) {
    return byStrong[0]; // 페이크 강배팅
  }

  if (val >= 0.66) return byStrong[0];                       // 꼭 필요 → 최강
  if (val >= 0.4)  return byStrong[Math.min(1, byStrong.length-1)]; // 준강
  if (val >= 0.2)  return byStrong[Math.floor(byStrong.length/2)];  // 중간
  return byStrong[byStrong.length - 1];                      // 불필요 → 최약 덤핑
}

function cpuChooseType(hand, prize, acquired, diff) {
  if (diff === 'easy') return Math.random() < 0.5 ? 'open' : 'close';
  const val = prizeValue(prize, acquired, hand);
  // 가치 높으면 오픈(상대 배팅 유도), 낮으면 클로즈(정보 차단·블러핑)
  if (val >= 0.6) return Math.random() < 0.75 ? 'open' : 'close';
  return Math.random() < 0.65 ? 'close' : 'open';
}

function cpuChooseOffer(hand, acquired) {
  const target = cpuTarget(acquired, hand);
  // 목표 외 카드 중 가장 약한(strength 큰) 카드 출품
  const nonTarget = hand.filter(c => c.kind !== target);
  const pool = nonTarget.length ? nonTarget : hand;
  return [...pool].sort((a, b) => strength(b) - strength(a))[0];
}
// 튜토리얼 전용 — 사람(oppAcq)이 가장 많이 모은 종류의 카드를 우선 출품해 세트 완성을 도움
function tutorialOffer(hand, humanAcq) {
  const cnt = {};
  for (const c of humanAcq) cnt[c.kind] = (cnt[c.kind] || 0) + 1;
  // 사람이 이미 모으는 종류를 손에 갖고 있으면 그걸 내줌 (진행도 높은 순)
  const helpful = hand.filter(c => cnt[c.kind])
    .sort((a, b) => (cnt[b.kind] - cnt[a.kind]) || (strength(a) - strength(b)));
  if (helpful.length) return helpful[0];
  return cpuChooseOffer(hand, []);   // 도울 게 없으면 그냥 약한 카드
}

// ══ 개선 전문가 AI (상대 견제 + 실현가능 목표 + 최소 승리 배팅) ══
const TOTAL = { 2: 2, 3: 5, 4: 7, 6: 10 };
const cnt = (acq, kind) => acq.reduce((n, c) => n + (c.kind === kind ? 1 : 0), 0);
function feasibleTarget(myAcq, oppAcq) {
  let best = null, bestScore = -1;
  for (const [kind] of SPEC) {
    const myC = cnt(myAcq, kind), oppC = cnt(oppAcq, kind);
    if (TOTAL[kind] - oppC < kind) continue;   // 남은 카드로 완성 불가 → 포기
    if (myC >= kind) continue;
    const score = myC / kind + (kind <= 3 ? 0.04 : 0);
    if (score > bestScore) { bestScore = score; best = kind; }
  }
  return best ?? 6;
}
function wantValue(prize, myAcq, target) {
  let v = 0;
  for (const c of prize) { if (!c) continue;
    const need = c.kind - cnt(myAcq, c.kind);
    let cv = need <= 0 ? 1 : 1 / need;
    if (c.kind === target) cv = Math.max(cv, 0.75);
    if (need === 1) cv = Math.max(cv, 0.97);   // 이걸로 내 세트 완성
    v = Math.max(v, cv);
  }
  return v;
}
function denyValue(prize, oppAcq) {
  let v = 0;
  for (const c of prize) { if (!c) continue;
    const need = c.kind - cnt(oppAcq, c.kind);
    if (need === 1) v = Math.max(v, 0.88);     // 상대 완성 임박 → 뺏기
    else if (need === 2) v = Math.max(v, 0.45);
  }
  return v;
}
function offerX(hand, myAcq, oppAcq) {
  const target = feasibleTarget(myAcq, oppAcq);
  let pool = hand.filter(c => c.kind !== target);
  if (!pool.length) pool = hand.slice();
  const safe = pool.filter(c => c.kind - cnt(oppAcq, c.kind) !== 1);  // 상대 완성시켜줄 카드 회피
  const use = safe.length ? safe : pool;
  return [...use].sort((a, b) => strength(b) - strength(a))[0];
}
function typeX(hand, prize, myAcq, oppAcq) {
  const val = Math.max(wantValue(prize, myAcq, feasibleTarget(myAcq, oppAcq)), denyValue(prize, oppAcq));
  return val >= 0.5 ? 'open' : 'closed';
}
// visOpp: 클로즈 후공일 때 보이는 진행자 배팅카드 · deckLeft: 남은 덱
function decideBidX(hand, prize, myAcq, oppAcq, visOpp, deckLeft) {
  const byStrong = [...hand].sort((a, b) => strength(a) - strength(b));
  const target = feasibleTarget(myAcq, oppAcq);
  let val = Math.max(wantValue(prize, myAcq, target), denyValue(prize, oppAcq));
  // 경매 승리 자체가 진행도(획득 2장)에 유리 → 카드 열세거나 종반이면 싸게라도 경합
  const behind = myAcq.length <= oppAcq.length;
  const late = (deckLeft ?? 12) <= 5;
  if (behind || late) val = Math.max(val, late ? 0.5 : 0.42);
  if (visOpp) {   // 상대 배팅이 보이면 최소 승리 배팅으로 강카드 절약
    if (val < 0.3) return byStrong[byStrong.length - 1];
    const winners = hand.filter(c => aBeatsB(c, visOpp)).sort((a, b) => strength(b) - strength(a));
    if (winners.length) return winners[0];
    return byStrong[byStrong.length - 1];
  }
  if (val >= 0.8)  return byStrong[0];
  if (val >= 0.55) return byStrong[Math.min(1, byStrong.length - 1)];
  if (val >= 0.3)  return byStrong[Math.floor(byStrong.length / 2)];
  return byStrong[byStrong.length - 1];
}

// ── AI 아이템 사용 ─────────────────────────────────────────
// 상황에 맞는 아이템만 고르고, 난이도가 낮을수록 덜 쓴다(캐주얼 모드라 과하면 짜증).
const AI_USE_RATE = { easy: 0.35, normal: 0.55, hard: 0.7, expert: 0.85 };

function cpuPickItem(g, me, room) {
  const held = (g.items[me] || []).filter(id => !items.canUse(g, me, id));
  if (!held.length) return null;
  const opp = me === 1 ? 2 : 1;
  const myAcq = me === 1 ? g.p1Acquired : g.p2Acquired;
  const opAcq = opp === 1 ? g.p1Acquired : g.p2Acquired;
  const behind = items.isBehind(g, me);

  // 상황 점수 — 높은 것 하나를 고른다
  const score = id => {
    switch (id) {
      case 'tyrant':     return g.auctioneer !== me ? 9 : -1;          // 진행권은 언제나 이득
      case 'steal':      return opAcq.length >= 2 ? (behind ? 10 : 5) : -1;
      case 'copy':       return myAcq.length >= 2 ? 8 : -1;
      case 'dice':       return g.centerDeck.length >= 2 ? (behind ? 6 : 2) : -1;
      case 'flip':       return 5;                                     // 약한 손패일수록 좋지만 단순화
      case 'discount':   return 5;
      case 'smoke':      return g.phase !== 'draw' ? 4 : -1;
      case 'pickpocket': return 4;
      case 'magnify':    return 3;
      case 'swap':       return g.centerDeck.length ? 2 : -1;
      case 'hourglass':  return 1;
      default:           return 0;
    }
  };
  const best = held.map(id => ({ id, s: score(id) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)[0];
  return best ? best.id : null;
}

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
    const hand = me === 1 ? g.p1Hand : g.p2Hand;
    const acq = me === 1 ? g.p1Acquired : g.p2Acquired;
    const kinds = new Set(acq.map(c => c.kind));
    arg = (hand.find(c => !kinds.has(c.kind)) || hand[0] || {}).id;
    if (!arg) return false;
  }
  const out = items.use(g, me, id, arg);
  if (out.error) return false;
  const human = room.players[room.cpuIndex === 0 ? 1 : 0];
  if (human) io.to(human).emit('item_used', { byMe: false, itemId: id, name: out.name, icon: out.icon, msg: out.msg, reveal: null });
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
  if (Math.random() > 0.75) return;
  const out = items.use(g, me, 'redo');
  if (out.error) return;
  g.settleSeq = (g.settleSeq || 0) + 1;             // 이전 경매의 공개·정산 타이머 무효화
  const human = room.players[room.cpuIndex === 0 ? 1 : 0];
  if (human) io.to(human).emit('item_used', { byMe: false, itemId: 'redo', name: out.name, icon: out.icon, msg: out.msg, reveal: null });
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
    delay(roomId, () => { if (g.phase !== 'draw') return; drawCenter(g); broadcast(roomId); maybeCpuAct(roomId); }, 600, 500);
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
        ? expert3.offerV3({ hand, myAcq: acq, oppAcq: opp, center: g.auction.centerCard,
            deckLeft: g.centerDeck.length, oppHandLen: (ci === 0 ? g.p2Hand : g.p1Hand).length }, room.aiMem || (room.aiMem = expert3.createMem()))
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
        ? expert3.typeV3({ hand, myAcq: acq, oppAcq: opp, center: prize[0], offered: prize[1] }, room.aiMem || (room.aiMem = expert3.createMem()))
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
      if (room.difficulty === 'expert') {
        // 치팅 방지: 클로즈 후공이면 출품 카드를 모름
        const offered = (isAuctioneer || g.auction.auctionType === 'open') ? g.auction._offeredCard : null;
        bid = expert3.bidV3({
          hand, myAcq: acq, oppAcq: opp, center: g.auction.centerCard, offered, visOpp,
          auctionType: g.auction.auctionType, isAuctioneer, deckLeft: g.centerDeck.length,
          oppHandLen: (ci === 0 ? g.p2Hand : g.p1Hand).length,
        }, room.aiMem || (room.aiMem = expert3.createMem()));
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

function stateFor(game, pi) {
  const isP1 = pi === 0;
  const isAuctioneer = (pi + 1) === game.auctioneer;
  const a = game.auction;
  let auction = null;
  if (a) {
    const oppBidCard  = isP1 ? a.p2Bid : a.p1Bid;
    const oppSubmitted = isP1 ? a.p2Submitted : a.p1Submitted;
    // 오픈=비공개배팅(공개 안됨, reveal에서만) / 클로즈=공개배팅(제출 즉시 공개)
    const showOpp = game.phase === 'reveal' || (a.auctionType === 'closed' && oppSubmitted);
    // 출품카드 공개: 오픈이거나, reveal이거나, 방식 선택 중(choose_type)엔 진행자 본인만
    let showOffered = a.auctionType === 'open' || game.phase === 'reveal'
                      || (game.phase === 'choose_type' && isAuctioneer);
    // 연막탄 — 걸린 쪽은 경매품 자체를 못 본다 (공개되는 reveal 단계는 예외)
    const smoked = game.itemMode && game.fx && game.fx.smokeAgainst === pi + 1 && game.phase !== 'reveal';
    if (smoked) showOffered = false;
    auction = {
      centerCard: smoked ? null : a.centerCard,
      offeredCard: showOffered ? a._offeredCard : null,
      smoked,
      auctionType: a.auctionType,
      myBid:           isP1 ? a.p1Bid : a.p2Bid,
      oppBidSubmitted: oppSubmitted,
      oppBid: showOpp ? oppBidCard : null,
    };
  }
  // 선공 뽑기 정보 (공개 전엔 카드 내용 숨김)
  let pick = null;
  if (game.pick && (game.phase === 'pick' || game.phase === 'pick_reveal')) {
    pick = {
      myChoice:  game.pick.choices[pi],
      oppChoice: game.pick.choices[1 - pi],
      cards: game.pick.revealed ? game.pick.cards : [null, null],
    };
  }
  const base = {
    phase: game.phase, turn: game.turn, auctioneer: game.auctioneer,
    centerDeckSize: game.centerDeck.length,
    myHand: isP1 ? game.p1Hand : game.p2Hand,
    oppHandLen: isP1 ? game.p2Hand.length : game.p1Hand.length,
    myAcq:  isP1 ? game.p1Acquired : game.p2Acquired,
    oppAcq: isP1 ? game.p2Acquired : game.p1Acquired,
    auction, pick, myIndex: pi + 1,
    time: game.time, active: activePlayer(game),
  };
  if (game.itemMode) {
    const me = pi + 1;
    base.itemMode = true;
    base.myItems = (game.items[me] || []).slice();
    base.oppItemCount = (game.items[me === 1 ? 2 : 1] || []).length;
    base.itemUsed = !!game.itemUsed[me];
    base.fx = {
      reverse: game.fx.reverse,
      smokedMe: game.fx.smokeAgainst === me,
      smokedOpp: game.fx.smokeAgainst === (me === 1 ? 2 : 1),
      noSwapMe: !!game.fx.noSwap[me],
      peek: game.fx.peek[me] || null,   // 돋보기로 훔쳐본 상대 카드 (나에게만)
    };
  }
  return base;
}

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
    if (room.vsBot && room.progressAt && g.phase !== 'game_over') {
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
      list.push({ id, name: r.name || '이름 없는 방', host: (r.nicks && r.nicks[0]) || '???', secret: !!r.secret });
    // 진행 중인 멀티 게임 → 관전 가능 목록
    else if (!r.vsBot && r.game && r.game.phase !== 'game_over' && !r.secret)
      list.push({ id, live: true, name: `${r.nicks[0] || '?'} vs ${r.nicks[1] || '?'}`, turn: r.game.turn, specs: (r.specs || []).length });
  }
  return list.slice(-30).reverse();
}
// 로비 목록 브로드캐스트 — 빈번한 변경을 400ms로 묶어 폭증 방지
let roomsBcTimer = null;
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
function startBotMatch(entry) {
  dequeue(entry.sid);
  const s = io.sockets.sockets.get(entry.sid);
  if (!s || (s.roomId && rooms[s.roomId])) return;
  if (Object.keys(rooms).length >= MAX_ROOMS) return s.emit('error', '서버가 혼잡해요.');
  const u = entry.token && accounts.byToken(entry.token);
  const prof = u ? accounts.profileOf(u) : { nick: cleanNick(entry.nick), guest: true };
  const roomId = makeRoomId();
  rooms[roomId] = {
    players: [entry.sid, null], pids: [entry.pid || null, null], nicks: [prof.nick, randomBotNick()],
    profiles: [prof, null], tokens: [entry.token || null, null],
    name: entry.itemMode ? '아이템전' : '빠른 대전', game: null, vsBot: false, difficulty: 'expert',   // 보상은 멀티 기준
    secret: false, password: '', cpuIndex: 1, botMatch: true, itemMode: !!entry.itemMode,
    aiMem: expert3.createMem(),
  };
  rooms[roomId].profiles[1] = { nick: rooms[roomId].nicks[1], guest: true };   // 게스트 유저처럼 보이게
  s.leave('lobby'); s.join(roomId); s.roomId = roomId; s.playerIndex = 0; s.pid = entry.pid;
  rooms[roomId].game = createGame(rooms[roomId].itemMode);
  rooms[roomId].startedAt = Date.now();
  io.to(roomId).emit('game_start', { vsBot: false, roomId, nicks: rooms[roomId].nicks, profiles: rooms[roomId].profiles, itemMode: rooms[roomId].itemMode });
  broadcast(roomId);
  startClock(roomId);
  setTimeout(() => maybeCpuAct(roomId), 800);
}

// ── 소켓 ───────────────────────────────────────────────────

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

  // 소켓 이벤트 rate limit (초당 30건 초과 시 드롭 — 스팸/브루트포스 방지)
  socket.use((packet, next) => {
    const now = Date.now();
    if (!socket._rl || now - socket._rl.ts > 1000) socket._rl = { ts: now, c: 0 };
    if (++socket._rl.c > 30) return;   // 초과분은 조용히 드롭
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
    const u = token && accounts.byToken(token);
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
    // 개최 시각이 코앞이면 받지 않는다 — 참가비만 내고 못 들어가는 일이 없게
    if (tourLobby && tourLobby.startAt - Date.now() < 3000) return socket.emit('tour_error', '곧 시작해요. 다음 회차에 참가해주세요.');
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
    pushTourLobby();
    // 정원이 다 차면 시각을 기다리지 않고 바로 연다
    if (tourLobby.entrants.length >= TOUR.SIZE) { clearTimeout(tourLobby.timer); setTimeout(() => tourStart(), 400); }
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
    if (!room || room.players[0] !== socket.id) return socket.emit('friend_challenge_fail', '방 정보가 올바르지 않아요.');
    const sid = accountSockets.get(idl);
    if (!sid) return socket.emit('friend_challenge_fail', '상대가 지금 접속 중이 아니에요.');
    io.to(sid).emit('friend_challenge', { from: me.nick, roomId, password: room.password || '' });
    socket.emit('friend_challenge_sent', { nick: accounts.nickOfIdl(idl) });
  });

  // 튜토리얼 체크포인트 — 설명 창이 떠 있는 동안 게임 진행 보류
  socket.on('tut_hold',    () => { const r = rooms[socket.roomId]; if (r && r.tutorial) r.tutHold = true; });
  socket.on('tut_release', () => { const r = rooms[socket.roomId]; if (r) r.tutHold = false; });

  socket.on('create_room', ({ vsBot = false, difficulty = 'hard', pid, name, nick, secret, password, tutorial, itemMode } = {}) => {
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
      itemMode: !!itemMode && !tutorial,   // 아이템전(이벤트 모드) — 솔로·매칭·친구방 공통
    };
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = 0; socket.pid = pid;
    if (vsBot) {
      // 첫 승 보장: 튜토리얼이거나, 쉬움 난이도의 무전적 유저(신규·게스트)면 AI가 봐줌
      const u0 = socket.token && accounts.byToken(socket.token);
      rooms[roomId].rookie = !!tutorial || (difficulty === 'easy' && (!u0 || (u0.wins || 0) === 0));
      rooms[roomId].cpuIndex = 1;
      rooms[roomId].nicks[1] = 'AI';
      rooms[roomId].profiles[1] = { nick: 'AI', guest: true, bot: true };
      rooms[roomId].game = createGame(rooms[roomId].itemMode);
      rooms[roomId].startedAt = Date.now();
      rooms[roomId].aiMem = expert3.createMem();   // 전문가 AI 카운팅 메모리
      socket.emit('game_start', { vsBot: true, difficulty, roomId, nicks: rooms[roomId].nicks, profiles: rooms[roomId].profiles, itemMode: rooms[roomId].itemMode });
      broadcast(roomId);
      startClock(roomId);
      setTimeout(() => maybeCpuAct(roomId), 600);
    } else {
      socket.emit('room_created', { roomId, name: rooms[roomId].name });
      broadcastRooms();
    }
  });

  socket.on('join_room', ({ roomId, pid, nick, password }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', '방을 찾을 수 없어요.');
    if (room.game || room.players.filter(Boolean).length >= 2) return socket.emit('error', '이미 시작했거나 꽉 찬 방이에요.');
    if (room.secret) {
      if ((room.pwFails || 0) >= 10) return socket.emit('error', '비밀번호 시도 초과. 방이 잠겼어요.');
      if (String(password || '') !== room.password) { room.pwFails = (room.pwFails || 0) + 1; return socket.emit('need_password', { roomId, wrong: password != null }); }
    }
    const prof = myProfile(nick);
    room.players[1] = socket.id; room.pids[1] = pid || null; room.nicks[1] = prof.nick;
    room.profiles[1] = prof; room.tokens[1] = socket.token || null;
    socket.leave('lobby');
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = 1; socket.pid = pid;
    room.game = createGame();
    room.startedAt = Date.now();
    io.to(roomId).emit('game_start', { vsBot: false, roomId, nicks: room.nicks, profiles: room.profiles });
    broadcast(roomId);
    startClock(roomId);
    broadcastRooms();
  });

  // 새로고침/끊김 후 재접속
  socket.on('rejoin', ({ roomId, pid } = {}) => {
    const room = rooms[roomId];
    if (!room || !room.game || room.game.phase === 'game_over') return socket.emit('rejoin_failed');
    const slot = room.pids.indexOf(pid);
    if (slot === -1) return socket.emit('rejoin_failed');
    room.players[slot] = socket.id;
    socket.leave('lobby');
    socket.join(roomId); socket.roomId = roomId; socket.playerIndex = slot; socket.pid = pid;
    if (room.graceTimer) { clearInterval(room.graceTimer); room.graceTimer = null; }  // 유예 정지(남은 시간 유지)
    if (!room.clockOn) startClock(roomId);               // 멈췄던 시계 재개
    socket.emit('game_start', { vsBot: room.vsBot, difficulty: room.difficulty, roomId, nicks: room.nicks, profiles: room.profiles });
    broadcast(roomId);
    const other = room.players[1 - slot];               // 재접속 알림은 상대에게만
    if (other) io.to(other).emit('opp_reconnected');
    setTimeout(() => maybeCpuAct(roomId), 300);
  });

  // 빠른 대전 (자동 매칭)
  socket.on('quick_match', ({ pid, nick, itemMode } = {}) => {
    if (socket.roomId && rooms[socket.roomId]) return;
    dequeue(socket.id);
    const want = !!itemMode;
    // 클래식과 아이템전은 규칙이 다르므로 같은 모드끼리만 붙인다.
    let opp = null;
    for (let i = 0; i < matchQueue.length; i++) {
      const c = matchQueue[i];
      if (c.sid === socket.id || !io.sockets.sockets.get(c.sid)) {   // 끊긴 대기자는 정리
        clearTimeout(c.botTimer); matchQueue.splice(i, 1); i--; continue;
      }
      if (!!c.itemMode !== want) continue;
      opp = c; matchQueue.splice(i, 1); break;
    }
    const me = { sid: socket.id, pid, nick, token: socket.token, itemMode: want };
    if (opp) { clearTimeout(opp.botTimer); startMatch(opp, me); }
    else {
      me.botTimer = setTimeout(() => startBotMatch(me), MATCH_BOT_WAIT);   // 15초 후 위장봇 투입
      matchQueue.push(me); socket.emit('queued');
    }
  });
  socket.on('cancel_match', () => { dequeue(socket.id); socket.emit('unqueued'); });

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
    drawCenter(g);
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
        msg: out.msg, reveal: (i + 1 === me) ? out.reveal || null : null,
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
    if (g && g.phase !== 'game_over' && !room.vsBot && slot !== -1) {
      const winner = slot === 0 ? 2 : 1;
      g.phase = 'game_over';
      finishStats(room, winner, true);
      room.players.forEach((s, i) => { if (s && i !== slot) io.to(s).emit('game_over', { winner, forfeit: true, myIndex: i + 1 }); });
    } else {
      room.players.forEach((s, i) => { if (s && i !== slot) io.to(s).emit('opponent_left'); });
    }
    delete rooms[roomId];
    socket.roomId = null;
    socket.join('lobby'); broadcastRooms();
  });

  socket.on('disconnect', () => {
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
    // 게임 종료 상태거나 둘 다 끊김 → 즉시 정리
    if (!room.game || room.game.phase === 'game_over' || (!room.players[0] && !room.players[1])) {
      if (room.graceTimer) { clearInterval(room.graceTimer); room.graceTimer = null; }
      endClock(room); delete rooms[roomId]; broadcastRooms(); return;
    }
    // 튕김 횟수 누적 — 3회 이상이면 즉시 몰수패
    room.dcCount = room.dcCount || [0, 0];
    room.dcCount[slot]++;
    if (room.dcCount[slot] >= 3) return forfeitPlayer(roomId, slot);
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
  if (room.game) room.game.phase = 'game_over';
  finishStats(room, winner, true);
  room.players.forEach((s, i) => { if (s && i !== slot) io.to(s).emit('game_over', { winner, forfeit: true, myIndex: i + 1 }); });
  delete rooms[roomId]; broadcastRooms();
}

// 같은 방 새 게임 시작
function restartGame(roomId) {
  const room = rooms[roomId]; if (!room) return;
  room.game = createGame(room.itemMode);
  room.startedAt = Date.now();
  room.aiMem = expert3.createMem();   // 새 판 → AI 메모리 초기화
  room.rematch = [false, false];
  room.players.forEach((sid, i) => { if (sid) io.to(sid).emit('game_start', { vsBot: room.vsBot, difficulty: room.difficulty, roomId, nicks: room.nicks, profiles: room.profiles, itemMode: room.itemMode }); });
  broadcast(roomId);
  startClock(roomId);
  if (room.cpuIndex !== undefined) setTimeout(() => maybeCpuAct(roomId), 600);
}

// 빠른 대전 매칭된 두 소켓으로 방 생성·시작
function startMatch(a, b) {
  const sa = io.sockets.sockets.get(a.sid), sb = io.sockets.sockets.get(b.sid);
  if (!sa || !sb) { if (sa) matchQueue.push(a); if (sb) matchQueue.push(b); return; }
  if (Object.keys(rooms).length >= MAX_ROOMS) { sa.emit('error', '서버가 혼잡해요.'); sb.emit('error', '서버가 혼잡해요.'); return; }
  const profOf = e => { const u = e.token && accounts.byToken(e.token); return u ? accounts.profileOf(u) : { nick: cleanNick(e.nick), guest: true }; };
  const pA = profOf(a), pB = profOf(b);
  const itemMode = !!(a.itemMode && b.itemMode);   // 같은 모드끼리만 매칭되므로 둘 다 참
  const roomId = makeRoomId();
  rooms[roomId] = {
    players: [a.sid, b.sid], pids: [a.pid || null, b.pid || null], nicks: [pA.nick, pB.nick],
    profiles: [pA, pB], tokens: [a.token || null, b.token || null],
    name: itemMode ? '아이템전' : '빠른 대전', game: null, vsBot: false, difficulty: 'hard',
    secret: false, password: '', itemMode,
  };
  sa.leave('lobby'); sa.join(roomId); sa.roomId = roomId; sa.playerIndex = 0; sa.pid = a.pid;
  sb.leave('lobby'); sb.join(roomId); sb.roomId = roomId; sb.playerIndex = 1; sb.pid = b.pid;
  rooms[roomId].game = createGame(itemMode);
  io.to(roomId).emit('game_start', { vsBot: false, roomId, nicks: rooms[roomId].nicks, profiles: rooms[roomId].profiles, itemMode });
  broadcast(roomId);
  startClock(roomId);
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
  const p1Bid = g.auction.p1Bid, p2Bid = g.auction.p2Bid;
  const prize = [g.auction.centerCard, g.auction._offeredCard];

  // 뒤집개(반전) — 이번 경매만 약한 카드가 이긴다. 배신 규칙은 무시하고 순수 강함으로 비교.
  const reversed = !!(g.itemMode && g.fx.reverse);
  const p1Wins = reversed ? strength(p1Bid) > strength(p2Bid) : aBeatsB(p1Bid, p2Bid);

  // 전문가 AI 카운팅 메모리 갱신 (리빌에서 전부 공개되는 정보만 — 치팅 아님)
  if (room.cpuIndex !== undefined && room.difficulty === 'expert' && room.aiMem) {
    const ci = room.cpuIndex;
    const aiBidCard = ci === 0 ? p1Bid : p2Bid, humanBid = ci === 0 ? p2Bid : p1Bid;
    const humanAcq = ci === 0 ? g.p2Acquired : g.p1Acquired;
    const aiAcq = ci === 0 ? g.p1Acquired : g.p2Acquired;
    const oppValEst = Math.max(
      expert3.wantValue(prize, humanAcq, expert3.feasibleTarget(humanAcq, aiAcq)),
      expert3.denyValue(prize, aiAcq));
    expert3.noteSettle(room.aiMem, {
      myBid: aiBidCard, oppBid: humanBid, offered: g.auction._offeredCard,
      offeredByMe: g.auctioneer === ci + 1, oppValEst,
    });
  }

  // 졸개의 배신 발동 감지 (반전 중에는 강약이 뒤집히므로 배신 연출 없음)
  const special = !reversed && ((is610(p1Bid) && is21(p2Bid)) || (is610(p2Bid) && is21(p1Bid)));
  if (special) {
    room.players.forEach(sid => { if (sid) io.to(sid).emit('special', {}); });
    // 배신 성공자(6-10을 낸 승자) 미션·칭호 반영
    const actor = p1Wins ? 0 : 1;   // 6-10이 이기므로 승자가 배신자
    if (room.tokens && room.tokens[actor]) accounts.betrayEvent(room.tokens[actor]);
  }

  if (p1Wins) g.p1Acquired.push(...prize); else g.p2Acquired.push(...prize);
  // 배팅 카드 교환 — 에누리가 걸리면 교환 자체가 무효가 되어 각자 자기 카드를 회수한다.
  // 한쪽만 회수시키면 그쪽은 +2, 상대는 0이 되어 상대 손패가 계속 말라붙는다(진행 불가로 이어짐).
  const noSwap = !!(g.itemMode && (g.fx.noSwap[1] || g.fx.noSwap[2]));
  if (noSwap) { g.p1Hand.push(p1Bid); g.p2Hand.push(p2Bid); }
  else { g.p2Hand.push(p1Bid); g.p1Hand.push(p2Bid); }
  g.auction = null;

  // 경매 패자 위로금 — 진 사람에게 아이템 1개 (뒤진 쪽에만 전설)
  if (g.itemMode) {
    const loser = p1Wins ? 2 : 1;
    const got = items.grant(g, loser);
    if (got) {
      const sid = room.players[loser - 1];
      if (sid) io.to(sid).emit('item_get', got);
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
  const nextAuc = g.auctioneer === 1 ? 2 : 1;
  const aucHand = (nextAuc === 1 ? g.p1Hand : g.p2Hand).length;
  const othHand = (nextAuc === 1 ? g.p2Hand : g.p1Hand).length;
  if (g.centerDeck.length === 0 || aucHand < 2 || othHand < 1) return endByProgress(roomId);
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
const SUTDA = require('./sutda');   // 미니게임 족보·배팅 규칙
let tour = null;                       // { id, bracket, rooms, done }
let tourLobby = null;                  // { entrants:[], timer, startAt }

// 30분마다 열린다. 대기실은 늘 열어 두고, 다음 개최 시각이 되면 출발한다.
// 예전엔 첫 사람이 들어온 뒤 30초였는데, 그러면 언제 열릴지 알 수 없어
// 사람이 모이지 않는다. 시각이 정해져 있어야 맞춰 온다.
function tourEnsureLobby() {
  if (tourLobby) return tourLobby;
  tourLobby = { entrants: [], startAt: TOUR.nextStartAt(), timer: null };
  const wait = Math.max(1000, tourLobby.startAt - Date.now());
  tourLobby.timer = setTimeout(() => tourStart(), wait);
  return tourLobby;
}

const tourSeatKey = (socket) => socket.id;

function tourLobbyView(joined) {
  const startAt = tourLobby ? tourLobby.startAt : TOUR.nextStartAt();
  return {
    open: true,
    joined: !!joined,
    count: tourLobby ? tourLobby.entrants.length : 0,
    size: TOUR.SIZE,
    fee: TOUR.ENTRY_FEE,
    startAt,
    leftMs: Math.max(0, startAt - Date.now()),
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

  const bracket = TOUR.createBracket(entrants);
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
    pids: [null, null],
    nicks: [prof0.nick, prof1.nick],
    profiles: [prof0, prof1],
    tokens: [p0.token || null, p1.isBot ? null : (p1.token || null)],
    name: '토너먼트 ' + TOUR.roundName(b.round), game: null,
    vsBot: false, difficulty: 'expert',
    secret: false, password: '', itemMode: false,
    // 토너먼트 표식 — 끝났을 때 어디로 보고할지
    tour: { id: tour.id, round: b.round, index, seats: [humanFirst ? seatA : seatB, humanFirst ? seatB : seatA] },
    noRank: true,                                  // 대회는 RP 를 건드리지 않는다
  };
  if (p1.isBot) { rooms[roomId].cpuIndex = 1; rooms[roomId].aiMem = expert3.createMem(); }

  const join = (sk, idx) => { if (!sk) return; sk.leave('lobby'); sk.join(roomId); sk.roomId = roomId; sk.playerIndex = idx; };
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
      // 위장 봇 매치(15초 매칭 실패 → 전문가봇 입장)도 RP 를 준다.
      // 유저 입장에서는 사람과 붙은 것과 구별되지 않는데 보상만 다르면 억울하다.
      // 대가로 RP 는 더 이상 유저끼리 제로섬이 아니게 된다 — 봇은 잃지 않으니
      // 이긴 만큼이 새로 생긴다. 아이템전은 그대로 제외(코인·XP만).
      noRank: !!room.itemMode || !!room.noRank,   // 아이템전·토너먼트는 RP 미반영
    });
    if (out && room.players[i]) io.to(room.players[i]).emit('profile', { profile: out.profile, result, rewards: out.rewards });
  });
  // 관전자에게 종료 알림
  (room.specs || []).forEach(sid => io.to(sid).emit('game_over', { winner, spec: true, nicks: room.nicks }));

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

// 배포/재시작(SIGTERM) 시 새 연결 차단 후 정리 — 진행 중 저장은 이미 즉시 persist됨
process.on('SIGTERM', () => { console.log('SIGTERM 수신 — 종료 중'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000); });

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
// 자리값은 코인으로 받고 판에서는 칩으로 논다(1코인 = 10칩).
// 200코인이면 2000칩 — 배팅은 큼직하게 굴러가고 실제로 드는 코인은 적다.
const MINI_BUY_COIN = SUTDA.BUY_IN / SUTDA.CHIP_PER_COIN;   // 200
const MINI_MIN_COIN = 20;                                   // 이만큼(=200칩)은 있어야 판이 된다
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
    // 코인을 내고 칩으로 바꾼다 — 여기서 실패하면 그 사람은 못 앉는다
    const have = accounts.byToken(sk.token);
    const coin = Math.min(MINI_BUY_COIN, Math.max(0, (have && have.coins) || 0));
    if (coin < MINI_MIN_COIN) { sk.emit('mini_error', `코인이 ${MINI_MIN_COIN} 이상 있어야 앉을 수 있어요.`); continue; }
    const paid = accounts.miniStake(sk.token, coin);
    if (paid.error) { sk.emit('mini_error', paid.error); continue; }
    const u = accounts.byToken(sk.token);
    t.seats[seat] = { ai: false, key: sk.id, token: sk.token,
      nick: (u && u.nick) || '나', buyCoin: coin, stack: coin * SUTDA.CHIP_PER_COIN };
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
  v.rate = SUTDA.CHIP_PER_COIN;
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

// "다음 판" 을 눌렀을 때 — 기다리는 시간을 줄여 줄 뿐, 규칙은 같다.
function miniWantNext(socket) {
  const m = socket.mini;
  const t = m && miniTables.get(m.tableId);
  if (!t) return socket.emit('mini_error', '자리에 앉아 있지 않아요.');
  if (t.st && !t.st.over) return socket.emit('mini_error', '아직 판이 안 끝났어요.');
  if (t.mode !== 'solo') return;                  // 멀티는 시계대로
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
  // 칩을 코인으로 되돌린다. 내림이라 잔칩은 버려진다 — 한 코인이 안 되는 칩이다.
  const chips = Math.max(0, s.stack | 0);
  const back = Math.floor(chips / SUTDA.CHIP_PER_COIN);
  const res = accounts.miniPay(s.token, back, null);       // 정산 — 전적은 안 센다
  const sk = io.sockets.sockets.get(s.key);
  if (sk) {
    sk.mini = null;
    sk.emit('mini_stood', {
      back, chips, rate: SUTDA.CHIP_PER_COIN,
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
