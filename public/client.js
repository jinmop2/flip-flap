const socket = io({ transports: ['websocket', 'polling'] });   // 웹소켓 우선 — 폴링 왕복 생략, 연결 빨라짐
let state = null, myIndex = null, selectedBidCard = null;
let isVsBot = false, prevPhase = null, difficulty = 'hard';
let myRoomId = null;

// 영구 플레이어 ID (재접속 식별용)
const PID = (() => {
  let v = localStorage.getItem('ff_pid');
  if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('ff_pid', v); }
  return v;
})();
const saveSession = (roomId) => { myRoomId = roomId; if (roomId) localStorage.setItem('ff_sess', roomId); };
const clearSession = () => { myRoomId = null; localStorage.removeItem('ff_sess'); };

// ── 서버 연결 상태 표시 ─────────────────────────────────────
function setConn(text, cls) {
  const el = document.getElementById('connStatus');
  if (!el) return;
  el.textContent = text; el.className = cls || '';
}
// 로딩 스플래시 — 최소 1.8초는 로고를 보여준 뒤 부드럽게 사라짐 (실패해도 8초 후 숨김)
// 단, 게임 나가기 등 내부 이동으로 돌아온 경우엔 즉시 스킵
const SPLASH_START = Date.now(), SPLASH_MIN = 1800;
let splashHidden = false;
if (sessionStorage.getItem('ff_skipsplash')) {
  sessionStorage.removeItem('ff_skipsplash');
  splashHidden = true;
  const s = document.getElementById('splash'); if (s) s.style.display = 'none';
}
function hideSplash() {
  if (splashHidden) return; splashHidden = true;
  const s = document.getElementById('splash'); if (!s) return;
  const wait = Math.max(0, SPLASH_MIN - (Date.now() - SPLASH_START));
  setTimeout(() => s.classList.add('hide'), wait);
}
setTimeout(hideSplash, 8000);
// 내부 이동용 새로고침 (스플래시 없이)
function fastReload() {
  sessionStorage.setItem('ff_skipsplash', '1');
  location.href = location.origin + location.pathname;
}

socket.on('connect', () => {
  hideSplash();
  setConn('서버 연결됨', 'ok');
  setTimeout(() => { const el = document.getElementById('connStatus'); if (el) el.classList.add('hide'); }, 1400);
  const tk = localStorage.getItem('ff_auth');
  if (tk) socket.emit('auth', { token: tk });   // 로그인 세션 연결
  // 재접속 or 초대 링크 or 로비 목록
  const sess = localStorage.getItem('ff_sess');
  const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  // 초대 링크가 옛 세션과 다른 방이면 초대가 우선 (안 그러면 초대 링크가 무시됨)
  if (urlRoom && urlRoom !== sess) {
    localStorage.removeItem('ff_sess');
    socket.emit('join_room', { roomId: urlRoom, pid: PID, nick: getNick() });
  }
  else if (sess) socket.emit('rejoin', { roomId: sess, pid: PID });
  else           socket.emit('enter_lobby');
});
socket.on('auth_ok', ({ profile }) => { myAccount = profile; renderAccount(); });
socket.on('disconnect', () => setConn('연결 끊김 — 재접속 중…', 'bad'));
socket.on('connect_error', (e) => { setConn('서버 연결 실패', 'bad'); console.error('socket connect_error:', e && e.message); });
socket.on('rejoin_failed', () => { clearSession(); });
function showGrace(left) {
  document.getElementById('graceCount').textContent = Math.max(0, left ?? 60);
  document.getElementById('graceOverlay').classList.add('show');
}
function hideGrace() { document.getElementById('graceOverlay').classList.remove('show'); }
socket.on('opp_disconnected', ({ left } = {}) => showGrace(left));
socket.on('grace_tick', ({ left } = {}) => showGrace(left));
socket.on('opp_reconnected', () => { hideGrace(); setConn('상대 재접속됨', 'ok'); setTimeout(() => { const el = document.getElementById('connStatus'); if (el) el.classList.add('hide'); }, 1400); });

// ── 닉네임 (게스트) — 랜덤 게스트+4자리, 설정 불필요 ────────
(function initNick() {
  let n = localStorage.getItem('ff_nick');
  if (!n || !/^게스트\d{4}$/.test(n)) { n = '게스트' + Math.floor(1000 + Math.random() * 9000); localStorage.setItem('ff_nick', n); }
  const el = document.getElementById('guestNickText'); if (el) el.textContent = n;
})();
function getNick() { return myAccount ? myAccount.nick : (localStorage.getItem('ff_nick') || '게스트'); }

// ── 회원 계정 ────────────────────────────────────────────────
let myAccount = null;   // 로그인 프로필 (null=게스트)
let authMode = 'login';
async function apiPost(url, body) {
  try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); }
  catch (_) { return { error: '서버 연결 실패' }; }
}
function openAuth(mode) {
  authMode = mode || 'login'; setAuthMode(authMode);
  document.getElementById('authErr').textContent = '';
  // 마지막 로그인 아이디 기억
  const last = localStorage.getItem('ff_lastid');
  if (last && !document.getElementById('authId').value) document.getElementById('authId').value = last;
  document.getElementById('authModal').classList.add('show');
}
function closeAuth() { document.getElementById('authModal').classList.remove('show'); }
function setAuthMode(m) {
  authMode = m;
  document.getElementById('authTabLogin').classList.toggle('active', m === 'login');
  document.getElementById('authTabSignup').classList.toggle('active', m === 'signup');
  document.getElementById('authNick').style.display = m === 'signup' ? '' : 'none';
  document.getElementById('authSubmit').textContent = m === 'signup' ? '회원가입' : '로그인';
}
async function submitAuth() {
  const id = document.getElementById('authId').value.trim();
  const password = document.getElementById('authPw').value;
  const nick = document.getElementById('authNick').value.trim();
  const err = document.getElementById('authErr');
  const res = authMode === 'signup'
    ? await apiPost('/api/signup', { id, password, nick })
    : await apiPost('/api/login', { id, password });
  if (res.error) { err.textContent = '⚠️ ' + res.error; return; }
  localStorage.setItem('ff_auth', res.token);
  localStorage.setItem('ff_lastid', id);   // 아이디 기억
  myAccount = res.profile;
  socket.emit('auth', { token: res.token });
  closeAuth(); renderAccount();
}
function logout() {
  localStorage.removeItem('ff_auth'); myAccount = null;
  socket.emit('auth', { token: null }); renderAccount();
}
// 범용 토스트 (화면 상단 중앙에 잠깐 떴다 사라짐)
let toastTimer = null;
function toast(html, ms = 2600) {
  let t = document.getElementById('ffToast');
  if (!t) { t = document.createElement('div'); t.id = 'ffToast'; document.body.appendChild(t); }
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

async function restoreSession() {
  const tk = localStorage.getItem('ff_auth'); if (!tk) return;
  const r = await apiPost('/api/me', { token: tk });
  if (r.ok) { myAccount = r.profile; renderAccount(); claimDaily(); }
  else localStorage.removeItem('ff_auth');
}
// 1일 접속 보상 수령
async function claimDaily() {
  const d = await apiPost('/api/daily', { token: localStorage.getItem('ff_auth') });
  if (d && d.claimed) { myAccount = d.profile; renderAccount(); toast(`🎁 출석 보상 <b style="color:#ffd94a">🪙 +${d.amount}</b> 받았어요!`); }
}
const ncClass = c => c ? ' nc-' + c : '';   // 닉네임 염색 클래스
// 하단 고정 프로필 바 (클릭 → 내 정보)
function renderAccount() {
  const body = document.getElementById('pbBody');
  const fill = document.getElementById('pbXpFill');
  if (!body) return;
  if (myAccount) {
    const p = myAccount;
    const total = p.wins + p.losses;
    body.innerHTML = `
      <span class="pb-lv">Lv.${p.level}</span>
      <div class="pb-ava" style="color:${p.rankColor}">${p.rankIcon}</div>
      <div class="pb-mid">
        <div class="pb-nick${ncClass(p.nickColor)}">${esc(p.nick)}</div>
        <div class="pb-stats">${p.wins}승 ${p.losses}패${total ? ` (${p.winRate}%)` : ''} · <span style="color:${p.rankColor}">${esc(p.rank)}</span></div>
      </div>
      <div class="pb-right">
        <span class="pb-badge pb-coin">🪙 ${p.coins || 0}</span>
        <span class="pb-badge pb-rp">🏆 ${p.rp} RP</span>
      </div>`;
    if (fill) fill.style.width = (p.xpInLevel || 0) + '%';
  } else {
    body.innerHTML = `
      <div class="pb-ava">👤</div>
      <div class="pb-mid">
        <div class="pb-nick">${esc(getNick())}</div>
        <div class="pb-stats">게스트 · 기록이 저장되지 않아요</div>
      </div>
      <button class="pb-login" onclick="event.stopPropagation();openAuth('login')">로그인</button>`;
    if (fill) fill.style.width = '0%';
  }
}

// ── 내 정보 (프로필 · 인벤토리 · 전적) ──
async function openMyInfo() {
  if (!myAccount) { openAuth('login'); return; }
  const p = myAccount;
  const canNick = !p.nickLocked || ((p.items || {}).nick_change || 0) > 0;
  document.getElementById('miHeader').innerHTML = `
    <div class="mi-head">
      <div class="mi-ava" style="color:${p.rankColor}">${p.rankIcon}</div>
      <div class="mi-info">
        <div class="mi-nick${ncClass(p.nickColor)}">${esc(p.nick)} ${canNick ? '<button class="pc-icon" onclick="closeMyInfo();openNickModal()" title="닉네임 바꾸기">✏️</button>' : ''}</div>
        <div class="mi-line">Lv.<b>${p.level}</b> (XP ${p.xpInLevel}/100) · <span style="color:${p.rankColor}">${esc(p.rank)}</span> <b>${p.rp} RP</b></div>
        <div class="mi-line"><b>${p.wins}승 ${p.losses}패</b> · 승률 ${p.winRate}%</div>
        <div class="mi-badges">
          <span class="pb-coin pb-badge">🪙 ${p.coins || 0}</span>
          ${p.streak >= 2 ? `<span style="background:rgba(255,120,60,.16);color:#ffab5e">🔥 ${p.streak}연승 중</span>` : ''}
        </div>
      </div>
    </div>`;
  renderMyInv();
  renderMiHist();
  document.getElementById('myInfoModal').classList.add('show');
}
function closeMyInfo() { document.getElementById('myInfoModal').classList.remove('show'); }
async function renderMyInv() {
  const inv = document.getElementById('miInv');
  if (!shopItems) { try { shopItems = (await fetch('/api/shop').then(r => r.json())).items; } catch (_) {} }
  const items = myAccount.items || {};
  const owned = (shopItems || []).filter(it => items[it.id]);
  // 염색약 결과(현재 닉 색)도 보여줌
  let html = '';
  if (myAccount.nickColor) html += `<div class="mi-item"><span class="ico">🎨</span><span class="nm ${'nc-' + myAccount.nickColor}">${(DYE_NAMES[myAccount.nickColor] || myAccount.nickColor)} 염색</span></div>`;
  owned.forEach(it => {
    const isCb = it.type === 'cardback';
    const on = isCb && myAccount.cardBack === it.id;
    const cnt = it.type === 'ticket' ? `<span class="cnt">x${items[it.id]}</span>` : '';
    html += `<div class="mi-item${on ? ' equipped' : ''}" ${isCb ? `onclick="invEquip('${it.id}', ${on})"` : ''} title="${it.name}">
      ${cnt}<span class="ico">${it.icon}</span><span class="nm">${it.name.replace(' 카드백','')}</span></div>`;
  });
  inv.innerHTML = html || '<div class="mi-empty">아직 아이템이 없어요 — 상점 구경 가기 🛒</div>';
}
async function invEquip(itemId, isOn) {
  const r = await apiPost('/api/equip', { token: localStorage.getItem('ff_auth'), itemId: isOn ? null : itemId });
  if (!r.error) { myAccount = r.profile; renderMyInv(); }
}
function renderMiHist() {
  const list = document.getElementById('miHist');
  const h = (myAccount && myAccount.history) || [];
  list.innerHTML = h.length ? '' : '<div class="mi-empty">아직 전적이 없어요</div>';
  h.forEach(m => {
    const res = m.result === 'win' ? { t: '승', c: 'hist-win' } : m.result === 'loss' ? { t: '패', c: 'hist-loss' } : { t: '무', c: 'hist-draw' };
    const row = document.createElement('div'); row.className = 'hist-row';
    row.innerHTML = `<span class="hist-res ${res.c}">${res.t}</span>
      <span class="hist-vs">vs ${esc(m.vs)}</span>
      <span class="hist-coin" style="color:${m.coins >= 0 ? '#ffd94a' : '#ff8a8a'}">🪙 ${m.coins > 0 ? '+' : ''}${m.coins}</span>`;
    list.appendChild(row);
  });
}
// 로그인 프로필이 게임 종료 등으로 갱신됨 + 보상 연출
let pendingRewards = null;
socket.on('profile', ({ profile, result, rewards }) => {
  myAccount = profile; renderAccount(); refreshEmotes();
  pendingRewards = rewards || null;   // 결과창이 뜬 뒤 showRewards()에서 연출
});
// 숫자 카운트업
function countUp(el, to, prefix = '', ms = 800) {
  const start = performance.now(), sign = to < 0 ? '-' : '+', abs = Math.abs(to);
  (function step(t) {
    const p = Math.min((t - start) / ms, 1);
    el.textContent = prefix + sign + Math.round(abs * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  })(performance.now());
}
function showRewards() {
  const el = document.getElementById('goRewards');
  const r = pendingRewards;
  if (!el || !r || !(r.coins || r.xp || r.rp)) { if (el) el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="rw-row">
      <span class="rw-coin">🪙 <b id="rwCoin">0</b></span>
      <span class="rw-xp">XP +${r.xp}</span>
      ${r.rp ? `<span class="rw-rp">RP ${r.rp > 0 ? '+' : ''}${r.rp}</span>` : ''}
    </div>
    <div id="rwBadges" class="rw-badges"></div>`;
  countUp(document.getElementById('rwCoin'), r.coins, '');
  const badges = document.getElementById('rwBadges');
  const add = (cls, txt, delay) => { const b = document.createElement('div'); b.className = 'rw-badge ' + cls; b.textContent = txt; b.style.animationDelay = delay + 'ms'; badges.appendChild(b); };
  let d = 400;
  if (r.firstWin) { add('bd-first', `🎯 하루 첫 승 보너스 +${r.firstWin}`, d); d += 250; }
  if (r.streak && r.streakCount >= 2) { add('bd-streak', `🔥 ${r.streakCount}연승! +${r.streak}`, d); d += 250; playSound('setwin'); }
  if (r.levelUp) { add('bd-level', `⬆️ 레벨 업! Lv.${r.levelUp}`, d); d += 250; playSound('setwin'); }
  if (r.rankUp) { add('bd-rank', `👑 승급! ${r.rankUp}`, d); d += 250; playSound('setwin'); }
  if (r.sameIp) { add('bd-warn', `⚠️ 같은 접속 대전 — 코인만 이동`, d); d += 250; }
  pendingRewards = null;
}
// ── 닉네임 설정 모달 ──
function openNickModal() {
  document.getElementById('nickErr').textContent = '';
  const i = document.getElementById('nickNew');
  i.value = myAccount ? myAccount.nick : '';
  document.getElementById('nickModal').classList.add('show');
  setTimeout(() => { i.focus(); i.select(); }, 60);
}
function closeNickModal() { document.getElementById('nickModal').classList.remove('show'); }
async function submitNick() {
  const nick = document.getElementById('nickNew').value.trim();
  const err = document.getElementById('nickErr');
  const tk = localStorage.getItem('ff_auth');
  const r = await apiPost('/api/nick', { token: tk, nick });
  if (r.error) { err.textContent = '⚠️ ' + r.error; return; }
  myAccount = r.profile; renderAccount(); closeNickModal();
  socket.emit('auth', { token: tk });   // 게임 서버에도 새 닉 반영
}

// ── 카카오 로그인 콜백 처리 (#ktoken=… / #kerr=…) ──
let kakaoFirstLogin = false;
(function handleKakaoReturn() {
  const h = location.hash || '';
  if (h.startsWith('#ktoken=')) {
    const p = new URLSearchParams(h.slice(1));
    localStorage.setItem('ff_auth', p.get('ktoken'));
    kakaoFirstLogin = !!p.get('knew');
    history.replaceState(null, '', location.pathname + location.search);   // 토큰 흔적 제거
  } else if (h.startsWith('#kerr=')) {
    const msg = decodeURIComponent(h.slice(6));
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => alert('⚠️ ' + msg), 300);
  }
})();
renderAccount();   // 게스트 상태로 하단 바 먼저 렌더
restoreSession().then(() => { if (kakaoFirstLogin && myAccount) openNickModal(); });   // 첫 카카오 로그인 → 닉 정하기
// 서버에 카카오 로그인이 설정 안 됐으면 버튼 숨김
fetch('/api/kakao-enabled').then(r => r.json()).then(d => {
  if (!d.enabled) { const b = document.getElementById('kakaoLoginBtn'); if (b) { b.style.display = 'none'; const o = document.querySelector('.auth-or'); if (o) o.style.display = 'none'; } }
}).catch(() => {});

// ── 빠른 대전 (자동 매칭) ───────────────────────────────────
function quickMatch() {
  closeModePanels();
  socket.emit('quick_match', { pid: PID, nick: getNick() });
  document.getElementById('matchModal').classList.add('show');
}
function cancelMatch() {
  socket.emit('cancel_match');
  document.getElementById('matchModal').classList.remove('show');
}
socket.on('queued', () => document.getElementById('matchModal').classList.add('show'));
socket.on('unqueued', () => document.getElementById('matchModal').classList.remove('show'));

// ── 랭킹 ────────────────────────────────────────────────────
async function openLeaderboard() {
  const modal = document.getElementById('lbModal'), list = document.getElementById('lbList');
  list.innerHTML = '<div class="lb-empty">불러오는 중…</div>';
  modal.classList.add('show');
  try {
    const r = await fetch('/api/leaderboard').then(x => x.json());
    if (!r.ok || !r.players.length) { list.innerHTML = '<div class="lb-empty">아직 랭킹이 없어요. 첫 플레이어가 되어보세요!</div>'; return; }
    const myNick = myAccount && myAccount.nick;
    list.innerHTML = '';
    r.players.forEach(p => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (myNick && p.nick === myNick ? ' me' : '');
      row.innerHTML = `<span class="lb-no${p.no <= 3 ? ' top' : ''}">${p.no <= 3 ? ['🥇','🥈','🥉'][p.no-1] : p.no}</span>
        <span class="lb-rank" style="color:${p.rankColor}">${p.rankIcon}</span>
        <span class="lb-nick${ncClass(p.nickColor)}">${esc(p.nick)}</span>
        <span class="lb-wl">${p.wins}승 ${p.losses}패</span>
        <span class="lb-rp">${p.rp} RP</span>`;
      list.appendChild(row);
    });
    // 내 순위가 톱20 밖이면 하단에 별도 표시
    if (myAccount) {
      const inTop = r.players.some(p => p.nick === myNick);
      const mr = await apiPost('/api/myrank', { token: localStorage.getItem('ff_auth') });
      if (!inTop && mr.me && mr.me.no) {
        const me = mr.me;
        const row = document.createElement('div'); row.className = 'lb-row me lb-mine';
        row.innerHTML = `<span class="lb-no">${me.no}</span>
          <span class="lb-rank" style="color:${me.rankColor}">${me.rankIcon}</span>
          <span class="lb-nick${ncClass(me.nickColor)}">${esc(me.nick)}</span>
          <span class="lb-wl">${me.wins}승 ${me.losses}패</span>
          <span class="lb-rp">${me.rp} RP</span>`;
        const div = document.createElement('div'); div.className = 'lb-mydiv'; div.textContent = `⋯ 내 순위 (${me.no}위 / ${me.total}명) ⋯`;
        list.appendChild(div); list.appendChild(row);
      }
    }
  } catch (_) { list.innerHTML = '<div class="lb-empty">불러오기 실패</div>'; }
}
function closeLb() { document.getElementById('lbModal').classList.remove('show'); }

// ── 최근 전적 ──
function openHist() {
  const list = document.getElementById('histList');
  const h = (myAccount && myAccount.history) || [];
  list.innerHTML = h.length ? '' : '<div class="lb-empty">아직 전적이 없어요. 한 판 해보세요!</div>';
  h.forEach(m => {
    const res = m.result === 'win' ? { t: '승', c: 'hist-win' } : m.result === 'loss' ? { t: '패', c: 'hist-loss' } : { t: '무', c: 'hist-draw' };
    const coin = m.coins > 0 ? `+${m.coins}` : `${m.coins}`;
    const row = document.createElement('div'); row.className = 'hist-row';
    row.innerHTML = `<span class="hist-res ${res.c}">${res.t}</span>
      <span class="hist-vs">vs ${esc(m.vs)}</span>
      <span class="hist-coin" style="color:${m.coins >= 0 ? '#ffd94a' : '#ff8a8a'}">🪙 ${coin}</span>`;
    list.appendChild(row);
  });
  document.getElementById('histModal').classList.add('show');
}
function closeHist() { document.getElementById('histModal').classList.remove('show'); }

// ── 상점 ────────────────────────────────────────────────────
const DYE_NAMES = { red:'빨강', blue:'파랑', green:'초록', orange:'주황', purple:'보라', cyan:'청록', pink:'핑크', lime:'라임', gold:'✨골드✨', rainbow:'🌈무지개🌈' };
let shopItems = null;
async function openShop() {
  if (!myAccount) { alert('상점은 로그인하면 이용할 수 있어요!\n게임에서 이기면 🪙 코인을 모을 수 있어요.'); openAuth('login'); return; }
  document.getElementById('shopMsg').textContent = '';
  document.getElementById('shopModal').classList.add('show');
  if (!shopItems) {
    try { shopItems = (await fetch('/api/shop').then(r => r.json())).items; } catch (_) { shopItems = null; }
  }
  renderShop();
}
function closeShop() { document.getElementById('shopModal').classList.remove('show'); }
const CBP = { back_night: 'cb-night', back_gold: 'cb-gold', back_obang: 'cb-obang' };
const shopIcon = it => CBP[it.id]
  ? `<div class="shop-cbprev card back ${CBP[it.id]}"><span class="bf flip">FLIP</span><span class="bf flap">FLAP</span></div>`
  : it.icon;
let shopSelId = null;
function renderShop() {
  document.getElementById('shopCoins').textContent = `🪙 ${myAccount ? myAccount.coins : 0}`;
  const list = document.getElementById('shopList');
  if (!shopItems || !shopItems.length) { list.innerHTML = '<div class="lb-empty">상점을 불러오지 못했어요. 잠시 후 다시 열어주세요.</div>'; return; }
  if (!shopSelId) shopSelId = shopItems[0].id;
  list.innerHTML = '';
  shopItems.forEach(it => {
    const owned = myAccount.items && myAccount.items[it.id];
    const tile = document.createElement('div');
    tile.className = 'shop-tile' + (shopSelId === it.id ? ' sel' : '');
    let pr;
    if (it.type === 'cardback' && owned) pr = `<span class="pr own">${myAccount.cardBack === it.id ? '장착 중' : '보유'}</span>`;
    else if (it.type === 'emotes' && owned) pr = `<span class="pr own">보유</span>`;
    else pr = `<span class="pr">🪙 ${it.price}</span>${it.type === 'ticket' && owned ? `<span class="pr own">x${owned}</span>` : ''}`;
    tile.innerHTML = `<span class="ico">${shopIcon(it)}</span><span class="nm">${it.name}</span>${pr}`;
    tile.onclick = () => shopSelect(it.id);
    list.appendChild(tile);
  });
  shopSelect(shopSelId, true);
}
// 타일 선택 → 상단 상세 패널 갱신
function shopSelect(id, keep) {
  shopSelId = id;
  if (!keep) renderShopTiles();
  const it = (shopItems || []).find(x => x.id === id); if (!it) return;
  const owned = myAccount.items && myAccount.items[it.id];
  document.getElementById('ssIco').innerHTML = shopIcon(it);
  document.getElementById('ssName').textContent = it.name;
  document.getElementById('ssDesc').textContent = it.desc;
  const btn = document.getElementById('ssBtn');
  btn.style.display = '';
  btn.disabled = false; btn.className = 'shop-buy';
  if (it.type === 'cardback' && owned) {
    const on = myAccount.cardBack === it.id;
    btn.textContent = on ? '장착 해제' : '장착하기';
    btn.onclick = () => equipBack(it.id, on);
  } else if (it.type === 'emotes' && owned) {
    btn.textContent = '보유 중 ✓'; btn.disabled = true; btn.className = 'shop-buy owned';
  } else {
    btn.textContent = `구매 🪙 ${it.price}`;
    btn.onclick = () => buyShopItem(it.id);
  }
}
function renderShopTiles() {   // 선택 표시만 갱신 (전체 재생성 없이)
  document.querySelectorAll('.shop-tile').forEach((t, i) => t.classList.toggle('sel', shopItems[i] && shopItems[i].id === shopSelId));
}
async function buyShopItem(itemId) {
  const msg = document.getElementById('shopMsg');
  const btn = document.getElementById('ssBtn'); if (btn) btn.disabled = true;   // 연타 방지
  const r = await apiPost('/api/buy', { token: localStorage.getItem('ff_auth'), itemId });
  if (btn) btn.disabled = false;
  if (r.error) { msg.textContent = '⚠️ ' + r.error; return; }
  msg.textContent = '';
  myAccount = r.profile; renderAccount(); refreshEmotes();
  if (r.dye) { renderShop(); dyeRoll(r.dye); }   // 염색약은 뽑기 연출
  else { renderShop(); msg.textContent = '✅ 구매 완료!'; playSound && playSound('setwin'); }
}
// 염색약 뽑기 연출 — 색이 촤르륵 지나가다 결과에 멈춤
const DYE_KEYS = ['red','orange','lime','green','cyan','blue','purple','pink','gold','rainbow'];
function dyeRoll(result) {
  let ov = document.getElementById('dyeRoll');
  if (!ov) { ov = document.createElement('div'); ov.id = 'dyeRoll'; document.body.appendChild(ov); }
  const rare = result === 'gold' || result === 'rainbow';
  ov.innerHTML = `<div class="dye-box">
      <div class="dye-title">🎨 염색약 개봉!</div>
      <div class="dye-spin"><b id="dyeName" class="nc-red">???</b></div>
      <div class="dye-sub" id="dyeSub">두구두구…</div>
    </div>`;
  ov.classList.add('show');
  const name = document.getElementById('dyeName'), sub = document.getElementById('dyeSub');
  let i = 0, ticks = 26 + Math.floor(Math.random() * 6);
  const spin = setInterval(() => {
    const k = DYE_KEYS[i % DYE_KEYS.length]; i++;
    name.className = 'nc-' + k; name.textContent = DYE_NAMES[k] || k;
    playSound && playSound('flip');
    if (i >= ticks) {
      clearInterval(spin);
      name.className = 'nc-' + result; name.textContent = DYE_NAMES[result] || result;
      sub.innerHTML = rare ? '🎉 <b style="color:#ffd94a">대박!</b> 희귀 색이에요!' : '닉네임에 바로 적용됐어요!';
      if (rare) { name.classList.add('dye-pop'); playSound && playSound('victory'); }
      else playSound && playSound('setwin');
      setTimeout(() => ov.classList.remove('show'), rare ? 2600 : 1700);
    }
  }, 70);
  ov.onclick = () => { clearInterval(spin); ov.classList.remove('show'); };
}
async function equipBack(itemId, isOn) {
  const r = await apiPost('/api/equip', { token: localStorage.getItem('ff_auth'), itemId: isOn ? null : itemId });
  if (r.error) { document.getElementById('shopMsg').textContent = '⚠️ ' + r.error; return; }
  myAccount = r.profile; renderShop();
}
// 파티 이모트 팩 — 보유 시 피커에 추가
function refreshEmotes() {
  const picker = document.getElementById('emotePicker'); if (!picker) return;
  picker.querySelectorAll('.emote-extra').forEach(b => b.remove());
  if (myAccount && myAccount.items && myAccount.items.emote_party) {
    ['🤡','😈','💀','🎉','👑','🍀','💢','🫠'].forEach(e => {
      const b = document.createElement('button'); b.className = 'emote-extra'; b.textContent = e;
      b.onclick = () => sendEmote(e); picker.appendChild(b);
    });
  }
}

// ── 로비 다이얼로그 ─────────────────────────────────────────
function openCreate() { closeModePanels(); document.getElementById('createModal').classList.add('show'); document.getElementById('roomNameInput').focus(); }
function closeCreate() { document.getElementById('createModal').classList.remove('show'); }
function openCode()   { closeModePanels(); document.getElementById('codeModal').classList.add('show'); document.getElementById('roomInput').focus(); }
function closeCode()  { document.getElementById('codeModal').classList.remove('show'); }

// ── 공개/비밀 방 토글 ───────────────────────────────────────
let roomSecret = false;
document.getElementById('visRow').addEventListener('click', e => {
  const b = e.target.closest('.vis-btn'); if (!b) return;
  document.querySelectorAll('.vis-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  roomSecret = b.dataset.vis === 'secret';
  document.getElementById('roomPwInput').style.display = roomSecret ? '' : 'none';
});

// ── 방 목록 ─────────────────────────────────────────────────
let gameNicks = null, gameProfiles = null;
let lastSig = {};   // 섹션별 변경 감지(불필요한 DOM 재생성 방지 → 렉↓)
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

// 인게임 프로필 카드 (컴팩트 — 클릭하면 전적 펼침)
function renderGameProfile(elId, p) {
  const wrap = document.getElementById(elId); if (!wrap) return;
  const body = wrap.querySelector('.pc-body'), stats = wrap.querySelector('.pc-stats');
  if (!body) return;
  if (!p) { body.innerHTML = ''; if (stats) stats.innerHTML = ''; return; }
  if (p.bot) {
    body.innerHTML = `<span class="gp-rank">🤖</span><span class="gp-nick">AI</span>`;
    if (stats) stats.innerHTML = `컴퓨터`;
  } else if (p.guest) {
    body.innerHTML = `<span class="gp-rank">👤</span><span class="gp-nick">${esc(p.nick)}</span>`;
    if (stats) stats.innerHTML = `게스트 (기록 없음)`;
  } else {
    body.innerHTML = `<span class="gp-rank" style="color:${p.rankColor}">${p.rankIcon}</span><span class="gp-nick${ncClass(p.nickColor)}">${esc(p.nick)}</span><span class="gp-lv">Lv.${p.level}</span>`;
    if (stats) stats.innerHTML = `<span style="color:${p.rankColor}">${esc(p.rank)}</span> · <b>${p.wins}승 ${p.losses}패</b> · 승률 ${p.winRate}%`;
  }
}
function toggleStats(el) { el.classList.toggle('show-stats'); }
// 바깥 클릭 시 프로필 전적 / 이모트 피커 자동 닫기
document.addEventListener('click', (e) => {
  if (!e.target.closest('.game-pcard')) document.querySelectorAll('.game-pcard.show-stats').forEach(c => c.classList.remove('show-stats'));
  if (!e.target.closest('#emoteWrap')) { const p = document.getElementById('emotePicker'); if (p) p.classList.remove('show'); }
});
function refreshRooms() { socket.emit('enter_lobby'); }
function joinRoomById(id, secret) {
  if (secret) {
    const pw = prompt('🔒 비밀방입니다. 비밀번호를 입력하세요');
    if (pw == null) return;
    socket.emit('join_room', { roomId: id, pid: PID, nick: getNick(), password: pw });
  } else {
    socket.emit('join_room', { roomId: id, pid: PID, nick: getNick() });
  }
}
// 코드 참가 등에서 비밀번호가 필요할 때
socket.on('need_password', ({ roomId, wrong }) => {
  const pw = prompt(wrong ? '❌ 비밀번호가 틀렸어요. 다시 입력하세요' : '🔒 비밀방입니다. 비밀번호를 입력하세요');
  if (pw == null) return;
  socket.emit('join_room', { roomId, pid: PID, nick: getNick(), password: pw });
});
socket.on('rooms', renderRoomList);
socket.on('online', n => { const el = document.getElementById('onlineCount'); if (el) el.textContent = n; });
function renderRoomList(list) {
  const el = document.getElementById('roomList'); if (!el) return;
  el.innerHTML = '';
  if (!list || !list.length) { el.innerHTML = '<div class="rl-empty">열린 방이 없어요. 방을 만들어보세요!</div>'; return; }
  list.forEach(r => {
    const item = document.createElement('div'); item.className = 'rl-item';
    const lock = r.secret ? '<span class="rl-lock">🔒</span>' : '';
    item.innerHTML = `<div class="rl-info"><div class="rl-name">${lock}${esc(r.name)}</div><div class="rl-host">👤 ${esc(r.host)}</div></div>`;
    const b = document.createElement('button'); b.className = 'btn btn-gold rl-join'; b.textContent = '참가';
    b.onclick = () => joinRoomById(r.id, r.secret);
    item.appendChild(b); el.appendChild(item);
  });
}

// ── 사운드 (Web Audio) ──────────────────────────────────────
const AC = new (window.AudioContext || window.webkitAudioContext)();
function tone(freq, type, vol, dur, delay = 0) {
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur);
}
let soundOff = localStorage.getItem('ff_sound') === 'off';   // 마스터 음소거 (저장됨)
function playSound(n) {
  if (soundOff) return;
  try { AC.resume(); } catch(_) {}
  switch (n) {
    case 'select': tone(900,'sine',.06,.08); break;
    case 'place':  tone(320,'triangle',.12,.12); tone(240,'triangle',.08,.1,.06); break;
    case 'flip':   tone(520,'sine',.1,.1); tone(680,'sine',.08,.09,.08); break;
    case 'reveal': tone(440,'sawtooth',.06,.05); tone(660,'sine',.14,.18,.06); tone(880,'sine',.1,.2,.15); break;
    case 'special':[880,1180,1480,988].forEach((f,i)=>tone(f,'square',.1,.15,i*.09)); break;
    case 'victory':[523,659,784,1047,1319].forEach((f,i)=>tone(f,'sine',.2,.3,i*.08)); break;
    case 'defeat': [440,370,311,262].forEach((f,i)=>tone(f,'triangle',.14,.35,i*.12)); break;
    case 'deal':   tone(280,'sine',.05,.07); break;
    case 'bell':   [0,0.45].forEach(off => [1568,2093].forEach((f,i)=>tone(f,'sine',.2,1.2, off+i*.02))); break;
    case 'tick':   tone(1400,'square',.06,.05); break;
    case 'setwin': [523,659,784,1047,1319,1568].forEach((f,i)=>tone(f,'triangle',.16,.4,i*.07)); break;
    case 'ping':   tone(1046,'sine',.16,.16); tone(1568,'sine',.12,.22,.09); break;
    case 'emote':  tone(760,'sine',.1,.12); break;
  }
}

// ── 배경음악 (게임풍 시퀀서: 베이스 + 아르페지오 + 반짝임) ──
let bgmMaster = null, bgmOn = false;
let bgmSched = null, bgmStep = 0, bgmNextT = 0;
const BGM_VOL = 0.13;
const STEP = 0.15;                 // 8분음표 길이(초) ≈ 100bpm
// 코드 진행: Am – F – C – G (각 8스텝)
const BGM_PROG = [
  { root: 110.00, tones: [220.00, 261.63, 329.63] }, // Am
  { root:  87.31, tones: [174.61, 220.00, 261.63] }, // F
  { root: 130.81, tones: [261.63, 329.63, 392.00] }, // C
  { root:  98.00, tones: [196.00, 246.94, 293.66] }, // G
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];   // 8스텝 아르페지오 패턴

function pluck(freq, t, dur, vol, type = 'triangle') {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bgmMaster);
  o.start(t); o.stop(t + dur + 0.03);
}
function bgmScheduleStep(step, t) {
  const ch = BGM_PROG[Math.floor(step / 8) % BGM_PROG.length];
  const local = step % 8;
  // 베이스
  if (local === 0) pluck(ch.root, t, 0.55, 0.30, 'sine');
  if (local === 4) pluck(ch.root * 1.5, t, 0.35, 0.16, 'sine');   // 5도 살짝
  // 아르페지오
  const oct = local >= 4 ? 2 : 1;
  pluck(ch.tones[ARP[local] % ch.tones.length] * oct, t, 0.24, 0.11, 'triangle');
  // 반짝이는 리드
  if (local === 2 || local === 6) pluck(ch.tones[2] * 2, t, 0.16, 0.05, 'square');
}
function startBGM() {
  if (bgmOn) return;
  try { AC.resume(); } catch (_) {}
  bgmOn = true;
  bgmMaster = AC.createGain();
  bgmMaster.gain.value = soundOff ? 0 : BGM_VOL;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  bgmMaster.connect(lp); lp.connect(AC.destination);
  bgmStep = 0; bgmNextT = AC.currentTime + 0.1;
  bgmSched = setInterval(() => {
    while (bgmNextT < AC.currentTime + 0.12) {
      bgmScheduleStep(bgmStep, bgmNextT);
      bgmNextT += STEP; bgmStep++;
    }
  }, 25);
}
function applySoundBtn() {
  const b = document.getElementById('bgmBtn'); if (!b) return;
  b.querySelector('.ci').textContent = soundOff ? '🔇' : '🔊';
  b.title = soundOff ? '소리 켜기' : '소리 끄기';
  b.style.opacity = soundOff ? '.55' : '1';
}
function toggleBGM() {   // 마스터 음소거 토글 (BGM + 효과음 전체) — 설정 저장
  soundOff = !soundOff;
  localStorage.setItem('ff_sound', soundOff ? 'off' : 'on');
  if (bgmMaster) bgmMaster.gain.linearRampToValueAtTime(soundOff ? 0 : BGM_VOL, AC.currentTime + 0.25);
  applySoundBtn();
}
window.addEventListener('DOMContentLoaded', applySoundBtn);   // 저장된 상태 반영

// ── 게임 설명서 ─────────────────────────────────────────────
function toggleRules(show) {
  document.getElementById('rulesModal').style.display = show ? 'flex' : 'none';
}

// ── 이모트 ──────────────────────────────────────────────────
function toggleEmotes(force) {
  const p = document.getElementById('emotePicker');
  const show = force === undefined ? !p.classList.contains('show') : force;
  p.classList.toggle('show', show);
}
function sendEmote(emoji) {
  socket.emit('emote', { emoji });
  showEmote(emoji, 'me');
  toggleEmotes(false);
}
socket.on('emote', ({ emoji }) => showEmote(emoji, 'opp'));
function showEmote(emoji, side) {
  playSound('emote');
  const anchor = document.getElementById(side === 'me' ? 'myHand' : 'oppHand');
  const b = document.createElement('div');
  b.className = 'emote-bubble'; b.textContent = emoji;
  let x = window.innerWidth / 2, y = side === 'me' ? window.innerHeight - 160 : 120;
  if (anchor) { const r = anchor.getBoundingClientRect(); if (r.width) { x = r.left + r.width / 2; y = side === 'me' ? r.top - 20 : r.bottom + 10; } }
  b.style.left = (x - 20) + 'px'; b.style.top = y + 'px';
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 3100);
}

// ── 나가기 / 재대결 ─────────────────────────────────────────
function goLobby() { clearSession(); fastReload(); }
function exitGame() {
  if (!confirm('게임에서 나갈까요?')) return;
  socket.emit('leave_room');
  goLobby();
}
function rematch(btn) {
  socket.emit('rematch');
  if (!isVsBot && btn) {
    btn.disabled = true; btn.style.opacity = '.5';
    document.getElementById('rematchNote').textContent = '상대에게 재대결 신청 — 대기 중…';
  }
}
socket.on('rematch_wanted', () => {
  document.getElementById('rematchNote').innerHTML = '💬 상대가 <b>재대결</b>을 원해요! 재대결 버튼을 누르세요';
});

// ── 내 차례 알림 (탭 제목 깜빡임 + 소리) ───────────────────
let titleBlink = null;
const BASE_TITLE = 'FLIP FLAP';
function startTitleBlink() {
  if (titleBlink) return;
  let on = false;
  titleBlink = setInterval(() => { document.title = (on = !on) ? '🔔 내 차례! — FLIP FLAP' : BASE_TITLE; }, 800);
}
function stopTitleBlink() { if (titleBlink) { clearInterval(titleBlink); titleBlink = null; } document.title = BASE_TITLE; }
document.addEventListener('visibilitychange', () => { if (!document.hidden) stopTitleBlink(); });
function isMyAction(s) {
  if (!s) return false;
  if (s.phase === 'pick') return s.pick && s.pick.myChoice == null;
  if (['draw', 'offer', 'choose_type'].includes(s.phase)) return s.auctioneer === s.myIndex;
  if (s.phase === 'bidding') return s.auction && !s.auction.myBid && (s.auctioneer === s.myIndex || s.auction.oppBidSubmitted);
  return false;
}
let prevMyAction = false;

// ── 로비 모드 선택 (솔로/멀티) — 카드 위 팝업으로 표시 ──────
function openMode(m) {
  document.getElementById(m === 'solo' ? 'soloModal' : 'multiModal').classList.add('show');
}
function closeModePanels() {
  document.getElementById('soloModal').classList.remove('show');
  document.getElementById('multiModal').classList.remove('show');
}
function soloPlay(d) { closeModePanels(); difficulty = d; createRoom(true); }

// ── 튜토리얼 — 쉬움 AI와 실전 + 단계별 코치 ─────────────────
// 원칙: 한 번에 한 가지만, 짧게, "지금 뭘 클릭할지"를 반짝임으로 표시
let tutorial = false, tutSeen = {}, tutTarget = null;
const TUT_STEPS = [
  { id: 'pick', when: s => s.phase === 'pick' && s.pick && s.pick.myChoice == null,
    pos: 'bot', target: '#auctionItems',
    text: '환영해요! 🎯 목표는 하나 — <b>같은 숫자 카드를 그 숫자만큼</b> 모으면 승리! (3은 3장, 6은 6장)',
    act:  '반짝이는 두 장 중 <b>한 장을 클릭</b>하세요. 강한 카드를 뽑으면 선공!' },
  { id: 'pickr', when: s => s.phase === 'pick_reveal',
    pos: 'bot',
    text: '카드 공개! <b>숫자가 작을수록 강해요</b> (2 &gt; 3 &gt; 4 &gt; 6). 이긴 쪽이 첫 <b>경매 진행자</b>가 돼요.' },
  { id: 'draw_me', when: s => s.phase === 'draw' && s.auctioneer === s.myIndex,
    pos: 'bot', target: '#deckStack',
    text: '내가 <b>진행자</b>예요. 진행자는 경매에 내놓을 상품을 공개해요.',
    act:  '왼쪽 <b>덱을 클릭</b>!' },
  { id: 'offer_me', when: s => s.phase === 'offer' && s.auctioneer === s.myIndex,
    pos: 'top', target: '#myHand',
    text: '경매 상품은 항상 <b>2장</b> — 방금 공개한 카드 + 내 손패 1장.',
    act:  '아래 손패에서 <b>필요 없는 카드</b>를 클릭해 내놓으세요' },
  { id: 'type_me', when: s => s.phase === 'choose_type' && s.auctioneer === s.myIndex,
    pos: 'top', target: '#actionArea',
    text: '경매 방식 선택!<br>👁 <b>오픈</b> = 상품 공개, 배팅은 비밀<br>🙈 <b>클로즈</b> = 상품 비밀, 배팅은 공개',
    act:  '마음에 드는 방식을 클릭' },
  { id: 'bid_me', when: s => s.phase === 'bidding' && s.auction && !s.auction.myBid && (s.auctioneer === s.myIndex || s.auction.oppBidSubmitted),
    pos: 'top', target: '#myHand',
    text: '<b>배팅!</b> 강한 카드가 상품 2장을 다 가져가요. ⚠️ 단, 배팅한 카드는 <b>상대 손으로</b> 넘어가요 — 세게 쓸수록 손해도 커요!',
    act:  '손패에서 카드 클릭 → <b>배팅 확정</b> 버튼' },
  { id: 'reveal', when: s => s.phase === 'reveal',
    pos: 'top',
    text: '결과! 이긴 쪽이 상품 2장을 <b>자기 앞에</b> 깔아요. 🎯 <b>앞에 깔린 카드만</b> 세트로 인정 — 손에 든 건 소용 없어요.' },
  { id: 'draw_opp', when: s => s.phase === 'draw' && s.auctioneer !== s.myIndex,
    pos: 'bot',
    text: '이번 턴 진행자는 <b>상대</b> — 진행자는 매 턴 번갈아요. 상대가 상품을 걸면 곧 배팅 차례가 와요. 잠깐 기다려요 ☕' },
  { id: 'betray',   // 실제로 6-10이나 2-1이 내 손에 들어온 순간에만 시연
    when: s => tutSeen.bid_me && (s.myHand || []).some(c => (c.kind === 6 && c.grade === 10) || (c.kind === 2 && c.grade === 1)),
    pos: 'top',
    text: (s => (s.myHand || []).some(c => c.kind === 6 && c.grade === 10)
      ? '👀 지금 손에 있는 <b>6-10</b> — 최약체지만 최강 <b>2-1</b>만은 이겨요. <b>졸개의 배신!</b> 상대가 에이스를 낼 타이밍에 노려보세요.'
      : '👀 지금 손에 있는 <b>2-1</b>은 최강 카드지만 단 하나, 최약체 <b>6-10</b>한테만 져요 — <b>졸개의 배신</b>을 조심!')
      , cards: '<div class="tut-cards"><span class="tcard k6"><i>10</i>6</span><span class="tvs">⚔</span><span class="tcard k2"><i>1</i>2</span><span class="tvs">→</span><span class="twin">6-10 승!</span></div>' },
];
function startTutorial() {
  tutorial = true; tutSeen = {};
  difficulty = 'easy';
  createRoom(true);
}
// 읽는 도중 다음 설명이 밀고 들어오지 않게 — 열려 있으면 큐에 쌓고, '알겠어요' 후 표시
let tutQueue = [], tutOpen = false;
function tutTick() {
  if (!tutorial || !state) return;
  for (const st of TUT_STEPS) {
    if (tutSeen[st.id]) continue;
    if (st.when(state)) {
      tutSeen[st.id] = true;
      if (tutOpen) { tutQueue.push(st); tutGlowFor(st); }   // 글씨는 기다리되, 반짝임은 바로 (막히지 않게)
      else tutShow(st);
      return;
    }
  }
}
function tutShow(st) {
  const box = document.getElementById('tutBox');
  const text = typeof st.text === 'function' ? st.text(state) : st.text;
  document.getElementById('tutText').innerHTML = text
    + (st.cards || '')
    + (st.act ? `<div class="tut-do">👉 ${st.act}</div>` : '');
  box.classList.remove('pos-top', 'pos-bot', 'pop');
  box.classList.add('pos-' + (st.pos || 'top'));
  box.style.display = 'block';
  void box.offsetWidth;           // 애니메이션 재시작
  box.classList.add('pop');
  tutOpen = true;
  tutGlowFor(st);
  // 체크포인트: 확인 누를 때까지 서버 진행 보류 + 게임 입력 차단
  socket.emit('tut_hold');
  tutBlock(true);
}
// 설명 읽는 동안 게임판 클릭 방지 (박스의 버튼은 눌림)
function tutBlock(on) {
  let b = document.getElementById('tutBlocker');
  if (!b) {
    b = document.createElement('div'); b.id = 'tutBlocker';
    b.style.cssText = 'position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.15)';
    document.body.appendChild(b);
  }
  b.style.display = on ? 'block' : 'none';
}
function tutGlowFor(st) {
  tutClearGlow();
  if (st.target) {
    tutTarget = document.querySelector(st.target);
    if (tutTarget) tutTarget.classList.add('tut-glow');
  }
}
function tutClearGlow() {
  if (tutTarget) { tutTarget.classList.remove('tut-glow'); tutTarget = null; }
}
function tutConfirm() {
  tutOpen = false;
  if (tutQueue.length) return tutShow(tutQueue.shift());   // 밀린 설명이 있으면 이어서 (보류 유지)
  document.getElementById('tutBox').style.display = 'none';
  tutBlock(false);
  socket.emit('tut_release');   // 체크포인트 통과 → 게임 진행 재개
}
function endTutorial() {
  tutorial = false; tutQueue = []; tutOpen = false;
  document.getElementById('tutBox').style.display = 'none';
  tutClearGlow(); tutBlock(false);
  socket.emit('tut_release');
}

// ── 방 ──────────────────────────────────────────────────────
function createRoom(vsBot) {
  isVsBot = vsBot;
  const name = (document.getElementById('roomNameInput')?.value || '').trim();
  let secret = false, password = '';
  if (!vsBot && roomSecret) {
    password = (document.getElementById('roomPwInput')?.value || '').trim();
    if (!password) { alert('비밀방은 비밀번호를 입력해야 해요.'); return; }
    secret = true;
  }
  socket.emit('create_room', { vsBot, difficulty, pid: PID, nick: getNick(), name, secret, password, tutorial });
}
function joinRoom() {
  const id = document.getElementById('roomInput').value.trim().toUpperCase();
  if (id) socket.emit('join_room', { roomId: id, pid: PID, nick: getNick() });
}
let sharedCode = '';
socket.on('room_created', ({ roomId, name }) => {
  sharedCode = roomId;
  closeCreate();
  document.getElementById('lobbyMain').style.display = 'none';
  document.getElementById('waitCard').style.display = 'flex';
  document.getElementById('waitCode').textContent = roomId;
  document.getElementById('waitRoomName').textContent = name || '내 방';
});
function copyText(text, btn) {
  const done = () => { const o = btn.textContent; btn.textContent = '✓ 복사됨'; setTimeout(() => btn.textContent = o, 1400); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => prompt('복사하세요:', text));
  else prompt('복사하세요:', text);
}
// 코드 옆 ⧉ 아이콘 — 누르면 코드 복사, 잠깐 ✓ 표시
function copyCodeIcon(btn) {
  const orig = btn.innerHTML;
  const done = () => { btn.innerHTML = '✓'; btn.classList.add('copied'); setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1200); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(sharedCode).then(done).catch(() => prompt('복사하세요:', sharedCode));
  else prompt('복사하세요:', sharedCode);
}
function inviteURL() { return `${location.origin}${location.pathname}?room=${sharedCode}`; }

// ── 카카오 SDK (JS 키는 공개용 — 도메인 등록으로 보호됨) ──
const KAKAO_JS_KEY = 'e57f8c530bfbde01a6f3a6ab8232c2df';
try { if (window.Kakao && !Kakao.isInitialized()) Kakao.init(KAKAO_JS_KEY); } catch (_) {}

// 카톡 친구/채팅방으로 초대 메시지 바로 보내기
function shareKakao(btn) {
  const url = inviteURL();
  if (!window.Kakao || !Kakao.isInitialized()) return shareInvite(btn);  // SDK 로드 실패 시 대체
  try {
    Kakao.Share.sendDefault({
      objectType: 'text',
      text: `🃏 FLIP FLAP 한 판 할래?\n경매·블러핑 심리전 보드게임!\n\n방 코드: ${sharedCode}`,
      link: { mobileWebUrl: url, webUrl: url },
      buttonTitle: '게임 참가하기',
    });
  } catch (e) { console.warn('카카오 공유 실패:', e); shareInvite(btn); }
}
// 로비 친구 초대 — 카톡(우선)/공유 시트로 사이트 링크 보내기
function inviteFriend() {
  const url = `${location.origin}${location.pathname}`;
  const text = '🃏 FLIP FLAP 같이 한 판 하자!\n경매·블러핑 심리전 카드 보드게임 🎴';
  if (window.Kakao && Kakao.isInitialized()) {
    try { Kakao.Share.sendDefault({ objectType: 'text', text, link: { mobileWebUrl: url, webUrl: url }, buttonTitle: '게임 하러 가기' }); return; }
    catch (e) { /* 폴백 */ }
  }
  if (navigator.share) navigator.share({ title: 'FLIP FLAP', text, url }).catch(() => {});
  else if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(url); alert('링크를 복사했어요! 친구에게 붙여넣어 보내세요.'); }
  else prompt('복사하세요:', url);
}

// 게임 종료 후 도전장 — 사이트 링크를 카톡/공유 시트로
function challengeFriend() {
  const url = `${location.origin}${location.pathname}`;
  const nick = (myAccount && myAccount.nick) || getNick();
  const text = `🃏 ${nick}님이 FLIP FLAP 도전장을 보냈어요!\n경매·블러핑 심리전 보드게임 한 판 어때요?`;
  if (window.Kakao && Kakao.isInitialized()) {
    try { Kakao.Share.sendDefault({ objectType: 'text', text, link: { mobileWebUrl: url, webUrl: url }, buttonTitle: '도전 받기' }); return; }
    catch (e) { /* 폴백 */ }
  }
  if (navigator.share) navigator.share({ title: 'FLIP FLAP 도전장', text, url }).catch(() => {});
  else { copyText(url, { textContent: '', }); alert('링크를 복사했어요! 친구에게 붙여넣어 도전장을 보내세요.'); }
}
function copyLink(btn) { copyText(inviteURL(), btn); }
// 폰에서 누르면 카톡·문자·라인 등 설치된 앱 공유 시트가 뜸 (Web Share API)
function shareInvite(btn) {
  const url = inviteURL();
  const data = { title: 'FLIP FLAP 초대', text: `FLIP FLAP 한 판 할래? 방 코드: ${sharedCode}`, url };
  if (navigator.share) {
    navigator.share(data).catch(() => {});   // 사용자가 취소하면 조용히 무시
  } else {
    // 공유 미지원(주로 데스크톱) → 링크 복사로 대체
    copyText(url, btn);
    setTimeout(() => alert('공유를 지원하지 않는 브라우저예요. 링크를 복사했으니 카톡에 붙여넣어 보내세요!'), 100);
  }
}
function cancelWait() { clearSession(); fastReload(); }

socket.on('error', msg => alert(msg));
socket.on('game_start', ({ vsBot, difficulty: diff, roomId, nicks, profiles }) => {
  isVsBot = vsBot;
  gameNicks = nicks || null;
  gameProfiles = profiles || null;
  if (roomId) saveSession(roomId);
  // 재대결/매칭/재접속 대비 초기화
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('matchModal').classList.remove('show');
  hideGrace();
  document.getElementById('rematchNote').textContent = '';
  const gr = document.getElementById('goRewards'); if (gr) { gr.textContent = ''; gr.style.display = 'none'; }
  const rb = document.getElementById('rematchBtn'); if (rb) { rb.disabled = false; rb.style.opacity = '1'; }
  prevPhase = null; selectedBidCard = null; prevMyAction = false; stopTitleBlink();
  seenAcq.myAcq = new Set(); seenAcq.oppAcq = new Set(); boardCelebrated = false; lastSig = {};
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'flex';
  document.body.classList.add('ingame');   // 게임 중 화면 스크롤 잠금
  // AI면 프로필 아래 난이도 배지, 사람이면 숨김
  const de = document.getElementById('cpuDiff');
  if (vsBot) { de.style.display = ''; de.textContent = { easy:'쉬움', normal:'보통', hard:'어려움', expert:'전문가' }[diff] || diff; }
  else de.style.display = 'none';
  playSound('deal');
  startBGM();
});
let drewNow = false;
socket.on('state_update', s => {
  const prev = prevPhase;
  const changed = s.phase !== prevPhase;
  drewNow = prev === 'draw' && s.phase === 'offer';
  prevPhase = s.phase; state = s; myIndex = s.myIndex;
  render(changed);
  tutTick();
  if (changed && s.phase === 'reveal') playSound('reveal');
  if (drewNow) playSound('deal');
  // 세트 완성이 보드에 나타나는 순간 강조 (결과창은 서버가 잠시 뒤 띄움)
  if (s.phase === 'game_over' && !boardCelebrated) {
    const mySet = localSet(s.myAcq), oppSet = localSet(s.oppAcq);
    if (mySet || oppSet) {
      boardCelebrated = true;
      playSound('setwin');
      celebrateSet(mySet ? 'myAcq' : 'oppAcq', mySet || oppSet);
    }
  }
  // 내 차례 알림 (탭이 숨겨져 있을 때)
  const mine = isMyAction(s);
  if (mine && !prevMyAction && document.hidden) { startTitleBlink(); playSound('ping'); }
  if (!mine) stopTitleBlink();
  prevMyAction = mine;
});
let boardCelebrated = false;
function localSet(acq) {
  if (!acq) return null;
  const c = {}; for (const x of acq) c[x.kind] = (c[x.kind] || 0) + 1;
  for (const k of [2, 3, 4, 6]) if ((c[k] || 0) >= k) return k;
  return null;
}

// ── 전적 (localStorage) ─────────────────────────────────────
function getStats() { try { return JSON.parse(localStorage.getItem('ff_stats')) || { win:0, loss:0, draw:0 }; } catch (_) { return { win:0, loss:0, draw:0 }; } }
function recordResult(winner, mi) {
  const s = getStats();
  if (winner === 0) s.draw++; else if (winner === mi) s.win++; else s.loss++;
  localStorage.setItem('ff_stats', JSON.stringify(s));
  renderLobbyStats();
}
function renderLobbyStats() {
  const el = document.getElementById('lobbyStats'); if (!el) return;
  // 전적은 로그인 계정에만 표시 (게스트는 기록 없음)
  if (!myAccount) { el.textContent = ''; return; }
  el.textContent = '';   // 계정 전적은 프로필 칩에 표시되므로 중복 제거
}
renderLobbyStats();
socket.on('special', () => {
  playSound('special');
  const t = document.getElementById('specialToast');
  t.style.display = 'block';
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  setTimeout(() => { t.style.display = 'none'; }, 2600);
});
socket.on('game_over', ({ winner, setKind, timeout, byProgress, forfeit, myIndex: mi }) => {
  clearSession(); stopTitleBlink(); hideGrace(); recordResult(winner, mi);
  if (tutorial) {   // 튜토리얼 마무리 인사
    tutorial = false; tutQueue = []; tutOpen = false; tutClearGlow();
    tutShow({ pos: 'top', text: '🎓 <b>튜토리얼 완료!</b> 이제 규칙을 다 배웠어요. 💡 마지막 팁: 덱이 다 떨어지면 <b>세트에 가장 가까운 사람</b>이 이겨요. 실전에서 친구와 붙어보세요!' });
    tutOpen = false;   // 완료 인사는 '알겠어요'로 닫히게
  }
  const title = document.getElementById('goTitle'), desc = document.getElementById('goDesc');
  let delay = 500;
  if (winner === 0) {
    title.textContent = '무승부'; title.style.color = '#888';
    desc.textContent = '세트 근접도가 완전히 같아요!';
  } else if (winner === mi) {
    title.textContent = '🏆 승리!'; title.style.color = '#c8a000';
    desc.textContent = forfeit ? '상대가 게임을 떠났어요 — 몰수승!'
      : timeout ? '상대 시간 초과!'
      : byProgress ? `세트 근접 승리! (${setKind}짜리에 가장 가까웠어요)`
      : `${setKind}짜리 세트 완성!`;
    playSound('victory');
    if (setKind && !byProgress && !forfeit) { celebrateSet('myAcq', setKind); playSound('setwin'); delay = 1400; }
    else animateWinCards();
  } else {
    title.textContent = '패배...'; title.style.color = '#6a5a70';
    desc.textContent = forfeit ? '접속이 끊겨 몰수패 처리됐어요.'
      : timeout ? '시간 초과...'
      : byProgress ? '상대가 세트에 더 가까웠어요.'
      : `상대가 ${setKind}짜리 세트를 완성했어요.`;
    playSound('defeat');
    if (setKind && !byProgress && !forfeit) { celebrateSet('oppAcq', setKind); delay = 1400; }
  }
  renderGameOverStats(winner, byProgress ? null : setKind, mi);
  // 게스트가 이겼으면 회원 전환 유도
  if (!myAccount && winner === mi) {
    const lost = isVsBot ? (difficulty === 'expert' ? 150 : difficulty === 'easy' ? 10 : 30) : 50;
    setTimeout(() => toast(`💡 로그인했다면 <b style="color:#ffd94a">🪙 ${lost}</b>을 받았을 거예요!<br>가입하고 보상을 모아보세요`, 3600), delay + 700);
  }
  // 몰수 게임은 방이 사라져서 재대결 불가
  const rb = document.getElementById('rematchBtn');
  if (rb) rb.style.display = (forfeit && !isVsBot) ? 'none' : '';
  setTimeout(() => { document.getElementById('gameOver').style.display = 'flex'; showRewards(); }, delay);
});

// 승리/패배 화면 통계 (완성 세트 + 획득 수)
function renderGameOverStats(winner, setKind, mi) {
  const box = document.getElementById('goStats');
  if (!box || !state) { if (box) box.innerHTML = ''; return; }
  box.innerHTML = '';
  if (winner !== 0 && setKind) {
    const winnerAcq = (winner === mi) ? state.myAcq : state.oppAcq;
    const setCards = (winnerAcq || []).filter(c => c.kind === setKind).sort((a, b) => a.grade - b.grade);
    const row = document.createElement('div'); row.className = 'go-set';
    setCards.forEach(c => {
      const rc = document.createElement('div'); rc.className = 'rc'; rc.dataset.kind = c.kind;
      rc.innerHTML = `<span class="rc-rank">${c.grade}</span><span class="rc-num">${c.kind}</span>`;
      row.appendChild(rc);
    });
    box.appendChild(row);
  }
  const myN = (state.myAcq || []).length, opN = (state.oppAcq || []).length;
  const line = document.createElement('div'); line.className = 'go-count';
  line.innerHTML = `획득 카드 — 나 <b>${myN}</b>장 · 상대 <b>${opN}</b>장`;
  box.appendChild(line);
}
socket.on('opponent_left', () => { clearSession(); alert('상대가 나갔어요.'); fastReload(); });

// 세트 완성 카드 특수효과
function celebrateSet(containerId, kind) {
  const cards = document.querySelectorAll(`#${containerId} .pile-group[data-kind="${kind}"] .card`);
  cards.forEach((c, i) => setTimeout(() => c.classList.add('set-win'), i * 70));
}

// ── 체스 시계 표시 ──────────────────────────────────────────
let lastMyT = 999;
function fmt(s) { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }
function setTimerEl(id, secs, active) {
  const el = document.getElementById(id); if (!el || secs == null) return;
  el.textContent = fmt(secs);
  el.classList.toggle('active', !!active);
  el.classList.toggle('warn', secs <= 60);
}
function updateClocks(t1, t2, active) {
  if (t1 == null) return;
  const oppIdx = myIndex === 1 ? 2 : 1;
  setTimerEl('myTimer',  myIndex === 1 ? t1 : t2, active === myIndex);
  setTimerEl('oppTimer', myIndex === 1 ? t2 : t1, active === oppIdx);
}
socket.on('clock', ({ t1, t2, active }) => {
  updateClocks(t1, t2, active);
  const myT = myIndex === 1 ? t1 : t2;
  if (myT <= 10 && myT > 0 && myT !== lastMyT) playSound('tick');
  lastMyT = myT;
});
socket.on('time_warning', ({ player }) => {
  if (player === myIndex) playSound('bell');
});

// ── 카드 ────────────────────────────────────────────────────
const is21  = c => c && c.kind === 2 && c.grade === 1;
const is610 = c => c && c.kind === 6 && c.grade === 10;

// 배팅 승패(클라 판정, 서버와 동일 로직) — 결과 안내용
function myBidWins(my, opp) {
  if (is610(my) && is21(opp)) return true;
  if (is610(opp) && is21(my)) return false;
  return (my.kind * 100 + my.grade) < (opp.kind * 100 + opp.grade);
}
function resultReason(my, opp) {
  if ((is610(my) && is21(opp)) || (is610(opp) && is21(my))) return '⚔ 졸개의 배신!';
  if (my.kind !== opp.kind) return `종류 ${my.kind} vs ${opp.kind} → 작은 쪽 승리`;
  return `등급 ${my.grade} vs ${opp.grade} → 낮은 쪽 승리`;
}

function makeCard(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  if (!card) {
    el.classList.add('back');
    el.innerHTML = '<span class="bf flip">FLIP</span><span class="bf flap">FLAP</span>';
    if (opts.animate) el.classList.add('anim-deal');
    return el;
  }

  el.dataset.kind = card.kind;
  if (is21(card) || is610(card)) el.classList.add('special');

  const top = document.createElement('div');
  top.className = 'c-top';
  const rank = document.createElement('span');
  rank.className = 'c-rank';
  rank.textContent = card.grade;          // 좌상단 = 등급번호만
  top.appendChild(rank);
  if (is21(card) || is610(card)) {
    const mk = document.createElement('span');
    mk.className = 'c-mark';
    mk.textContent = is21(card) ? '👑' : '⚔';
    top.appendChild(mk);
  }

  const num = document.createElement('div');
  num.className = 'c-num'; num.textContent = card.kind;   // 가운데 큰 숫자 = 종류

  el.appendChild(top); el.appendChild(num);

  if (opts.draw)          el.classList.add('anim-draw');
  else if (opts.acquire)  el.classList.add('anim-acquire');
  else if (opts.animate)  el.classList.add('anim-deal');
  if (opts.reveal)   el.classList.add('anim-reveal');
  if (opts.selected) el.classList.add('selected');
  if (opts.selectable) {
    el.classList.add('selectable');
    el.addEventListener('click', () => { playSound('select'); opts.onClick(card); });
  }
  return el;
}
function slotEl(label, card, opts = {}) {
  const w = document.createElement('div'); w.className = 'a-slot';
  const l = document.createElement('div'); l.className = 'a-label'; l.textContent = label;
  w.appendChild(l); w.appendChild(makeCard(card, opts)); return w;
}

// ── 렌더 ────────────────────────────────────────────────────
function render(changed = false) {
  if (!state) return;
  const s = state, mine = s.auctioneer === s.myIndex, a = s.auction;
  document.getElementById('turnInfo').textContent = `턴 ${s.turn}`;
  if (s.time) updateClocks(s.time[1], s.time[2], s.active);
  // 닉네임 + 프로필 표시
  if (gameNicks) {
    const oppN = gameNicks[s.myIndex === 1 ? 1 : 0], myN = gameNicks[s.myIndex === 1 ? 0 : 1];
    const oel = document.getElementById('oppNickLabel'); if (oel && oppN) oel.textContent = oppN;
    const mel = document.getElementById('myNickLabel'); if (mel && myN) mel.textContent = myN;
  }
  if (gameProfiles) {
    renderGameProfile('oppProfile', gameProfiles[s.myIndex === 1 ? 1 : 0]);
    renderGameProfile('myProfile',  gameProfiles[s.myIndex === 1 ? 0 : 1], true);
  }

  // 배팅 순서: 진행자 먼저 → 내가 배팅할 차례인지
  const myTurnToBid = s.phase === 'bidding' && a && !a.myBid && (mine || a.oppBidSubmitted);

  const think = t => `<span class="thinking-dots">${t}<span>.</span><span>.</span><span>.</span></span>`;
  const biddingMsg = () => {
    if (a?.myBid) return (isVsBot && !a.oppBidSubmitted) ? think('AI 배팅 중') : '배팅 완료 — 대기 중...';
    if (myTurnToBid) return '배팅 카드를 손패에서 선택하세요';
    return isVsBot ? think('진행자(AI) 먼저 배팅 중') : '진행자가 먼저 배팅합니다 — 대기 중';
  };
  const firstNick = () => (gameNicks && gameNicks[s.auctioneer - 1]) || (s.auctioneer === s.myIndex ? '나' : '상대');
  const msgs = {
    pick:        s.pick && s.pick.myChoice != null ? (isVsBot ? '' : '상대가 고르는 중...') : '🃏 카드를 골라 선공을 정하세요!',
    pick_reveal: `⚡ ${firstNick()} 선공!`,
    draw:        mine ? '🂠 중앙덱을 클릭해 카드를 뽑으세요' : (isVsBot ? think('AI가 뽑는 중') : '상대가 카드를 뽑는 중...'),
    offer:       mine ? '중앙 카드 공개 — 출품할 카드를 선택하세요' : (isVsBot ? think('AI 생각 중') : '상대가 출품 중...'),
    choose_type: mine ? '경매 방식 선택 — 출품카드는 다른 손패 클릭 시 교체돼요' : (isVsBot ? think('AI 생각 중') : '상대가 방식 선택 중...'),
    bidding:     biddingMsg(),
    reveal: '결과 공개!', game_over: '게임 종료',
  };
  const bar = document.getElementById('statusBar');
  const msg = msgs[s.phase] ?? s.phase;
  if (lastSig.status !== msg) {   // 같은 문구면 건드리지 않음 (깜빡임·리플로우 방지)
    lastSig.status = msg;
    if (changed) { bar.style.opacity = '0'; setTimeout(() => { bar.innerHTML = msg; bar.style.opacity = '1'; }, 150); }
    else bar.innerHTML = msg;
  }

  renderDeck();
  renderOppHand(s.oppHandLen);
  renderPile('oppAcq', s.oppAcq);
  renderPile('myAcq', s.myAcq);
  renderAuction(changed);
  renderHand();
}

// 중앙덱 스택
function drawCard() {
  const s = state;
  if (!s || s.phase !== 'draw' || s.auctioneer !== s.myIndex) return;
  playSound('place');
  socket.emit('draw_card');
}
function renderDeck() {
  const s = state, el = document.getElementById('deckStack');
  const n = s.centerDeckSize;
  const drawable = s.phase === 'draw' && s.auctioneer === s.myIndex;
  const sig = n + '|' + drawable;
  if (lastSig.deck === sig) return; lastSig.deck = sig;   // 변경 없으면 재생성 안 함
  el.innerHTML = '';
  if (n <= 0) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const layers = Math.min(n, 5);
  for (let i = 0; i < layers; i++) {
    const b = makeCard(null); b.classList.add('deck-layer');
    b.style.transform = `translate(${i * 2}px, ${-i * 2}px)`;
    b.style.zIndex = String(i);
    el.appendChild(b);
  }
  const cnt = document.createElement('div');
  cnt.className = 'deck-count'; cnt.textContent = `덱 ${n}장`;
  el.appendChild(cnt);
  el.classList.toggle('drawable', s.phase === 'draw' && s.auctioneer === s.myIndex);
}

// 상대의 카드백 스킨 (프로필에 장착 정보가 실려옴)
const CB_CLASS = { back_night: 'cb-night', back_gold: 'cb-gold', back_obang: 'cb-obang' };
function oppBackClass() {
  const p = gameProfiles && gameProfiles[myIndex === 1 ? 1 : 0];
  return (p && CB_CLASS[p.cardBack]) || null;
}
function makeOppBack() {
  const c = makeCard(null);
  const cls = oppBackClass(); if (cls) c.classList.add(cls);
  return c;
}

// 상대 손패 = 뒷면 카드 부채꼴 (내 패보다 작게)
function renderOppHand(n) {
  if (lastSig.oppHand === n) return; lastSig.oppHand = n;   // 장수 그대로면 스킵
  const el = document.getElementById('oppHand'); el.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const slot = document.createElement('div'); slot.className = 'fan-slot';
    slot.appendChild(makeOppBack());
    el.appendChild(slot);
  }
  fanRow(el, true);
}

// 획득 카드 = 종류별로 겹쳐 쌓은 더미 (세트 진행도 표시)
const SET_REQ = { 2:2, 3:3, 4:4, 6:6 };
const seenAcq = { myAcq: new Set(), oppAcq: new Set() };  // 획득 애니메이션용
function renderPile(id, cards) {
  const sig = (cards || []).map(c => c.id).join(',');
  if (lastSig[id] === sig) return; lastSig[id] = sig;   // 획득 카드 그대로면 스킵
  const el = document.getElementById(id); el.innerHTML = '';
  const seen = seenAcq[id] || (seenAcq[id] = new Set());
  if (!cards?.length) { el.innerHTML = '<span class="pile-empty">획득 없음</span>'; return; }
  const groups = {};
  for (const c of cards) (groups[c.kind] ||= []).push(c);
  for (const kind of [2,3,4,6]) {
    const g = groups[kind]; if (!g) continue;
    g.sort((a,b) => a.grade - b.grade);
    const req = SET_REQ[kind];
    const done = g.length >= req;
    const reach = g.length === req - 1;   // 세트 1장 전 = 리치
    const wrap = document.createElement('div');
    wrap.className = 'pile-group' + (done ? ' complete' : reach ? ' reach' : '');
    wrap.dataset.kind = kind;
    g.forEach(c => {
      const isNew = c.id != null && !seen.has(c.id);
      if (c.id != null) seen.add(c.id);
      wrap.appendChild(makeCard(c, { acquire: isNew }));   // 새 카드는 날아드는 연출
    });
    const cnt = document.createElement('span');
    cnt.className = 'pile-count' + (done ? ' complete' : reach ? ' reach' : '');
    cnt.textContent = done ? `완성! ✓` : reach ? `${g.length}/${req} 리치!` : `${g.length}/${req}`;
    wrap.appendChild(cnt);
    el.appendChild(wrap);
  }
}

// 부채꼴 배치: 각 카드 회전 + 중앙이 위로 솟는 아치
function fanRow(container, isTop) {
  const slots = [...container.children];
  const n = slots.length; if (!n) return;
  const stepMax = 6.5;
  const spread = Math.min((n - 1) * stepMax, 36);
  const step = n > 1 ? spread / (n - 1) : 0;
  const mid = (n - 1) / 2;
  slots.forEach((slot, i) => {
    const ang = (-spread / 2 + i * step) * (isTop ? -1 : 1);
    const dist = Math.abs(i - mid);
    const lift = (mid - dist) * 5;                 // 중앙 카드가 더 솟음
    const y = isTop ? lift : -lift;
    slot.style.transformOrigin = isTop ? 'center top' : 'center bottom';
    slot.style.transform = `rotate(${ang}deg) translateY(${y}px)`;
    slot.style.zIndex = String(20 - Math.round(dist));
    slot.style.margin = '0 -7px';
  });
}
function renderAuction(changed) {
  const s = state;
  // 내용이 안 바뀌었으면 중앙 DOM 재생성 스킵 (끊김·깜빡임 방지)
  const sig = JSON.stringify([s.phase, s.auctioneer, s.pick, s.auction, selectedBidCard && selectedBidCard.id]);
  if (lastSig.auction === sig) return;
  lastSig.auction = sig;
  const items = document.getElementById('auctionItems');
  const action = document.getElementById('actionArea'), badge = document.getElementById('auctionTypeBadge');
  items.innerHTML = ''; action.innerHTML = '';
  renderBids();

  // ── 선공 뽑기 단계 ──
  if ((s.phase === 'pick' || s.phase === 'pick_reveal') && s.pick) {
    badge.textContent = '선공 결정'; badge.className = 'type-badge open';
    const p = s.pick;
    [0, 1].forEach(slot => {
      const revealed = s.phase === 'pick_reveal' && p.cards[slot];
      const isMine = p.myChoice === slot, isOpp = p.oppChoice === slot;
      const label = revealed
        ? (isMine ? '나' : isOpp ? '상대' : '')
        : (isMine ? '내 선택 ✓' : isOpp ? '상대 선택' : '');
      const wrap = document.createElement('div'); wrap.className = 'a-slot';
      const lbl = document.createElement('div'); lbl.className = 'a-label'; lbl.textContent = label || '?';
      wrap.appendChild(lbl);
      const cardEl = makeCard(revealed ? p.cards[slot] : null, { reveal: !!revealed });
      if (s.phase === 'pick' && p.myChoice == null && !isOpp) {
        cardEl.classList.add('selectable', 'pickable');
        cardEl.addEventListener('click', () => { playSound('flip'); socket.emit('pick_card', { slot }); });
      }
      if (isMine) cardEl.style.outline = '2px solid var(--gold)';
      wrap.appendChild(cardEl);
      items.appendChild(wrap);
    });
    return;
  }

  if (!s.auction) { badge.textContent = ''; badge.className = ''; return; }

  const a = s.auction, mine = s.auctioneer === s.myIndex, atype = a.auctionType, isReveal = s.phase === 'reveal';
  if (atype === 'open')   { badge.textContent = '오픈';   badge.className = 'type-badge open'; }
  else if (atype === 'closed') { badge.textContent = '클로즈'; badge.className = 'type-badge closed'; }
  else { badge.textContent = ''; badge.className = ''; }

  // 'draw' 단계엔 중앙 카드 미공개 (덱 스택이 초점)
  if (s.phase === 'draw') return;

  items.appendChild(slotEl('중앙 카드', a.centerCard, { animate: drewNow, draw: drewNow }));
  if (s.phase !== 'offer') {
    const plus = document.createElement('span'); plus.className = 'vs-tag'; plus.textContent = '+';
    items.appendChild(plus);
    // a.offeredCard 공개 여부는 서버가 결정 (choose_type엔 진행자만, 클로즈는 reveal 때 공개)
    const revealClosed = isReveal && atype === 'closed';
    const lbl = (s.phase === 'choose_type' && mine) ? '출품 (교체 가능)'
              : (atype === 'closed' && !isReveal) ? '출품 (비공개)' : '출품 카드';
    items.appendChild(slotEl(lbl, a.offeredCard ?? null, {
      animate: changed && atype === 'open', reveal: revealClosed,
    }));
  }

  if (s.phase === 'choose_type' && mine) {
    const row = document.createElement('div'); row.className = 'btn-row';
    const bo = document.createElement('button'); bo.className = 'btn btn-gold btn-sm'; bo.textContent = '오픈 경매';
    bo.title = '경매품 공개 · 배팅 비공개'; bo.onclick = () => { playSound('flip'); socket.emit('choose_auction', { type: 'open' }); };
    const bc = document.createElement('button'); bc.className = 'btn btn-ink btn-sm'; bc.textContent = '클로즈 경매';
    bc.title = '경매품 비공개 · 배팅 공개'; bc.onclick = () => { playSound('flip'); socket.emit('choose_auction', { type: 'closed' }); };
    row.appendChild(bo); row.appendChild(bc); action.appendChild(row);
  }

  const myTurnToBid = s.phase === 'bidding' && !a.myBid && (mine || a.oppBidSubmitted);
  if (myTurnToBid) {
    if (selectedBidCard) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-gold btn-sm'; btn.style.marginTop = '10px';
      btn.textContent = `${selectedBidCard.kind}번 (${selectedBidCard.grade}등급) 배팅 확정`;
      btn.onclick = () => { playSound('place'); socket.emit('submit_bid', { cardId: selectedBidCard.id }); selectedBidCard = null; };
      action.appendChild(btn);
    } else {
      const h = document.createElement('p'); h.className = 'hint-text';
      h.textContent = atype === 'closed' ? '클로즈 · 공개 배팅 — 손패에서 카드를 선택하세요' : '오픈 · 비공개 배팅 — 손패에서 카드를 선택하세요';
      action.appendChild(h);
    }
  } else if (s.phase === 'bidding' && !a.myBid) {
    const h = document.createElement('p'); h.className = 'hint-text';
    h.textContent = '진행자가 먼저 배팅합니다 — 잠시 대기';
    action.appendChild(h);
  }

  // reveal: 경매 결과 안내 (낙찰/패배 + 이유)
  if (isReveal && a.myBid && a.oppBid) {
    const win = myBidWins(a.myBid, a.oppBid);
    const rb = document.createElement('div');
    rb.className = 'result-banner ' + (win ? 'win' : 'lose');
    rb.innerHTML = `<b>${win ? '낙찰! 🏆' : '패배'}</b> <span>${resultReason(a.myBid, a.oppBid)}</span>`;
    action.appendChild(rb);
  }
}
// 배팅 카드를 각자 앞에 배치
function bidSlot(label, card, { back = false, reveal = false } = {}) {
  const w = document.createElement('div'); w.className = 'bid-slot';
  const l = document.createElement('div'); l.className = 'bid-lbl'; l.textContent = label;
  w.appendChild(l);
  if (card)       w.appendChild(makeCard(card, { reveal }));
  else if (back)  w.appendChild(makeOppBack());   // 상대의 비공개 배팅 — 상대 카드백 스킨 적용
  else { const e = document.createElement('div'); e.className = 'bid-empty'; w.appendChild(e); }
  return w;
}
function renderBids() {
  const s = state, a = s.auction;
  const my = document.getElementById('myBid'), opp = document.getElementById('oppBid');
  my.innerHTML = ''; opp.innerHTML = '';
  if (!a || (s.phase !== 'bidding' && s.phase !== 'reveal')) return;
  const isReveal = s.phase === 'reveal';

  // 내 배팅 (내 앞) — 항상 나에게 보임
  my.appendChild(bidSlot('내 배팅', a.myBid ?? null, { reveal: isReveal && !!a.myBid }));

  // 상대 배팅 (상대 앞) — 서버가 공개 여부 결정 (클로즈=즉시 / 오픈=reveal)
  const ol = `상대 배팅${a.oppBidSubmitted ? ' ✓' : ''}`;
  if (a.oppBid)            opp.appendChild(bidSlot(ol, a.oppBid, { reveal: isReveal }));
  else if (a.oppBidSubmitted) opp.appendChild(bidSlot(ol, null, { back: true }));
  else                    opp.appendChild(bidSlot('상대 배팅', null));
}

function renderHand() {
  const s = state, a = s.auction, el = document.getElementById('myHand');
  const mine = s.auctioneer === s.myIndex;
  // 방식 선택 전(offer/choose_type)이면 손패 클릭으로 출품카드 교체 가능
  const offer = (s.phase === 'offer' || s.phase === 'choose_type') && mine;
  // 진행자 먼저 배팅
  const bidding = s.phase === 'bidding' && a && !a.myBid && (mine || a.oppBidSubmitted);
  // 등급순 정렬로 손에 든 느낌
  const hand = [...s.myHand].sort((a, b) => a.kind - b.kind || a.grade - b.grade);
  // 손패·상호작용·선택 상태 그대로면 재생성 스킵
  const sig = hand.map(c => c.id).join(',') + '|' + (offer ? 'o' : '') + (bidding ? 'b' : '') + '|' + (selectedBidCard ? selectedBidCard.id : '');
  if (lastSig.hand === sig) return; lastSig.hand = sig;
  el.innerHTML = '';
  hand.forEach(card => {
    let cardEl;
    if (offer)
      cardEl = makeCard(card, { selectable: true, onClick: c => { playSound('place'); socket.emit('offer_card', { cardId: c.id }); } });
    else if (bidding)
      cardEl = makeCard(card, { selectable: true, selected: selectedBidCard?.id === card.id, onClick: c => { selectedBidCard = selectedBidCard?.id === c.id ? null : c; render(); } });
    else
      cardEl = makeCard(card);
    const slot = document.createElement('div'); slot.className = 'fan-slot';
    slot.appendChild(cardEl); el.appendChild(slot);
  });
  fanRow(el, false);
}
function animateWinCards() {
  document.querySelectorAll('#myAcq .card').forEach((c, i) => {
    setTimeout(() => { c.classList.remove('anim-win'); void c.offsetWidth; c.classList.add('anim-win'); }, i * 80);
  });
}

// ── PWA 서비스워커 등록 (재방문 로딩 가속 + 홈 화면 설치) ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// ── 앱 설치 버튼 ──
// 안드로이드 크롬: beforeinstallprompt를 잡아뒀다가 버튼 클릭 시 네이티브 설치창 표시
// 아이폰: 프로그래밍 설치 불가(애플 정책) → 버튼 누르면 방법 안내
let deferredInstall = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  if (!isStandalone()) { const b = document.getElementById('installBtn'); if (b) b.style.display = ''; }
});
(function initInstallBtn() {   // iOS는 이벤트가 안 오므로 직접 노출
  if (isIOS() && !isStandalone()) { const b = document.getElementById('installBtn'); if (b) b.style.display = ''; }
})();
async function installApp() {
  const b = document.getElementById('installBtn');
  if (deferredInstall) {
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    deferredInstall = null;
    if (outcome === 'accepted' && b) b.style.display = 'none';
  } else if (isIOS()) {
    alert('아이폰 설치 방법 📲\n\n1. Safari 하단의 공유 버튼(⬆️)을 누르고\n2. "홈 화면에 추가"를 선택하세요!\n\n홈 화면에 FLIP FLAP 앱이 생겨요.');
  } else {
    alert('브라우저 메뉴(⋮)에서 "앱 설치"를 눌러 설치할 수 있어요!');
  }
}
window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  const b = document.getElementById('installBtn'); if (b) b.style.display = 'none';
});
