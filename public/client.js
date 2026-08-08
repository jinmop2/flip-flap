const socket = io({ transports: ['websocket', 'polling'] });   // 웹소켓 우선 — 폴링 왕복 생략, 연결 빨라짐

// ── 화면 높이 동기화 ──────────────────────────────────────
// 모바일 브라우저는 주소창이 떠 있어도 100vh 를 "주소창 숨김 기준"으로 계산한다.
// 그러면 게임판이 화면보다 커져 하단(내 손패·프로필)이 잘린다.
// dvh 를 못 쓰는 구형 iOS·카톡 인앱 브라우저까지 덮으려면 실제 보이는 높이를 직접 넣는 수밖에 없다.
// visualViewport 가 있으면 그쪽이 가장 정확하다(키보드·주소창 반영).
let _appHRaf = 0;
function syncAppHeight() {
  if (_appHRaf) return;                                   // 리사이즈 폭주 방지 — 프레임당 한 번만
  _appHRaf = requestAnimationFrame(() => {
    _appHRaf = 0;
    const h = Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight);
    if (h > 0) document.documentElement.style.setProperty('--app-h', h + 'px');
  });
}
syncAppHeight();
addEventListener('resize', syncAppHeight);
addEventListener('orientationchange', () => setTimeout(syncAppHeight, 250));   // 회전은 값이 늦게 확정된다
if (window.visualViewport) window.visualViewport.addEventListener('resize', syncAppHeight);

document.addEventListener('dragstart', e => e.preventDefault());   // 카드·이미지 드래그 차단
document.addEventListener('contextmenu', e => { if (e.target.closest('#game')) e.preventDefault(); });   // 게임 중 길게눌러 메뉴 방지
let state = null, myIndex = null, selectedBidCard = null;
let isVsBot = false, isSpec = false, prevPhase = null, difficulty = 'hard';
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
// 내부 이동(나가기 등)·게스트·로그인 세션이면 타이틀 화면을 처음부터 숨김 (깜빡임 방지)
if (sessionStorage.getItem('ff_guest') || localStorage.getItem('ff_auth')) {
  const t = document.getElementById('title'); if (t) { t.classList.add('hide'); t.style.display = 'none'; }
}
function hideSplash() {
  if (splashHidden) return; splashHidden = true;
  const s = document.getElementById('splash'); if (!s) return;
  const wait = Math.max(0, SPLASH_MIN - (Date.now() - SPLASH_START));
  setTimeout(() => { s.classList.add('hide'); setTimeout(() => { s.style.display = 'none'; }, 700); }, wait);   // 페이드 후 완전 제거 — 숨은 무한 스피너 정지
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
socket.on('auth_ok', ({ profile }) => {
  myAccount = profile; renderAccount();
  if (typeof updateSocialBadges === 'function') updateSocialBadges();   // 친구요청·가입신청 알림 표시
});
socket.on('dup_login', () => {   // 다른 기기에서 같은 계정 로그인 → 이 세션 종료
  clearSession();
  alert('다른 기기(또는 창)에서 같은 계정으로 접속했어요.\n이 창의 연결을 종료합니다.');
  location.href = location.origin + location.pathname;
});
socket.on('disconnect', () => setConn('연결 끊김 — 재접속 중…', 'bad'));
socket.on('connect_error', (e) => { setConn('서버 연결 실패', 'bad'); console.error('socket connect_error:', e && e.message); });
socket.on('rejoin_failed', () => { clearSession(); toast('⚠️ 이전 게임이 끝나 로비로 돌아가요', 2400); setTimeout(fastReload, 1500); });
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
async function apiPost(url, body) {
  try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); }
  catch (_) { return { error: '서버 연결 실패', netFail: true }; }
}
// 로그인 요청 → 타이틀 화면(구글/카카오/게스트)로 통일.
// 아이디/비번 로그인은 353fe8d 에서 제거됐고, 그때 남은 폼·핸들러는 정리했다.
function openAuth() { if (typeof showTitle === 'function') showTitle(); }
// 최초 이용자 튜토리얼 유도 (가입·소셜 첫 로그인 공통) — 1회만
function offerTutorial() {
  if (localStorage.getItem('ff_tut_offered')) return;
  localStorage.setItem('ff_tut_offered', '1');
  setTimeout(() => askConfirm(
    { icon: '🎓', title: 'FLIP FLAP에 오신 걸 환영해요!', desc: '30초면 규칙을 다 배워요. 튜토리얼을 해볼까요? (완료하면 🪙100 보상!)',
      yes: '🎓 튜토리얼 하기', no: '건너뛰기 (Skip)' },
    () => startTutorial()),
  350);
}
function logout() {
  localStorage.removeItem('ff_auth'); myAccount = null;
  socket.emit('auth', { token: null }); renderAccount();
  if (typeof showTitle === 'function') showTitle();   // 로그아웃 → 타이틀 화면으로
}
// 계정 영구 삭제 — 구글플레이 정책상 앱 내 삭제 수단 필수.
// 실수 방지를 위해 2단계 확인, 비번 계정은 비밀번호 재확인까지 거침.
function askDeleteAccount() {
  const token = localStorage.getItem('ff_auth');
  if (!token || !myAccount) { toast('로그인 상태에서만 삭제할 수 있어요.'); return; }
  askConfirm(
    { icon: '⚠️', title: '정말 계정을 삭제할까요?',
      desc: '전적·레벨·코인·아이템·칭호가 모두 영구 삭제되며 복구할 수 없어요.',
      yes: '삭제하기', no: '취소' },
    () => setTimeout(() => askConfirm(
      { icon: '🗑️', title: '마지막 확인이에요', desc: '이 작업은 되돌릴 수 없습니다. 정말 진행할까요?',
        yes: '영구 삭제', no: '돌아가기' },
      () => doDeleteAccount(token)), 250));
}
async function doDeleteAccount(token, password) {
  const r = await apiPost('/api/delete-account', { token, password });
  if (r && r.needPw) {   // 아이디/비번 계정 — 본인 확인
    const pw = prompt('본인 확인을 위해 비밀번호를 입력해주세요.');
    if (pw) doDeleteAccount(token, pw);
    return;
  }
  if (!r || !r.ok) { toast('⚠️ ' + ((r && r.error) || '삭제에 실패했어요.')); return; }
  closeMyInfo();
  localStorage.removeItem('ff_auth'); myAccount = null;
  socket.emit('auth', { token: null }); renderAccount();
  toast('계정이 삭제됐어요. 이용해주셔서 감사합니다.');
  if (typeof showTitle === 'function') showTitle();
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
  else if (r.netFail) { toast('⚠️ 서버 연결이 늦어지고 있어요 — 잠시 후 새로고침해 주세요', 3200); }   // 콜드스타트/오프라인: 유효 토큰 지키기
  else localStorage.removeItem('ff_auth');   // 서버가 명시적으로 거부한 경우만 로그아웃
}
// 1일 접속 보상 수령 (연속 출석 스택 표시)
async function claimDaily() {
  const d = await apiPost('/api/daily', { token: localStorage.getItem('ff_auth') });
  if (d && d.claimed) {
    myAccount = d.profile; renderAccount();
    const streakTxt = d.streak >= 2 ? ` <span style="color:#ff9a3c">🔥 ${d.streak}일 연속!</span>` : '';
    toast(`🎁 출석 보상 <b style="color:#ffd94a">🪙 +${d.amount}</b>${streakTxt}${d.plateBonus ? ' <span style="color:#4ade80">(🍀 명패 포함)</span>' : ''}`, 3200);
    (d.titles || []).forEach((t, i) => setTimeout(() => toast(`${t.icon} 칭호 획득! <b>${t.name}</b>`, 3000), 3400 + i * 3100));
  }
  claimReferral();   // 저장된 초대 코드가 있으면 자동 등록
}
// 친구 초대 보상 — ?ref= 링크로 들어와 가입하면 양쪽 +100
async function claimReferral() {
  const ref = localStorage.getItem('ff_ref');
  if (!ref || !myAccount || myAccount.guest) return;
  const r = await apiPost('/api/refer', { token: localStorage.getItem('ff_auth'), ref });
  localStorage.removeItem('ff_ref');   // 성공/실패 무관 1회 시도
  if (r && r.ok) {
    myAccount = r.profile; renderAccount();
    toast(`🤝 친구 초대 보상 <b style="color:#ffd94a">🪙 +${r.amount}</b>! 초대한 친구도 받았어요`, 3500);
  }
}
// 초대 링크(?ref=아이디)로 접속 시 코드 보관
try { const rp = new URLSearchParams(location.search).get('ref'); if (rp) localStorage.setItem('ff_ref', rp); } catch (_) {}
const ncClass = c => c ? ' nc-' + c : '';   // 닉네임 염색 클래스
const NP_CLASS = { np_wood: 'np-wood', np_neon: 'np-neon', np_gold: 'np-gold', np_daily: 'np-daily', np_lv50: 'np-lv50', np_ruby: 'np-ruby', np_crystal: 'np-crystal', np_obsidian: 'np-obsidian', np_hanji: 'np-hanji' };
const xpPct = p => Math.max(0, Math.min(100, Math.round((p.xpInLevel || 0) / (p.xpNeeded || 100) * 100)));
const npClass = p => p && NP_CLASS[p] ? ' ' + NP_CLASS[p] : '';   // 명패 클래스
// 이모지 → 직접 그린 SVG (art.js). 매핑에 없으면 원래 이모지 그대로.
const ico = (e, cls = 'g-ico') => {
  const a = (typeof iconArt === 'function') && iconArt(e);
  return a ? `<span class="${cls}">${a}</span>` : (e || '');
};
// 랭크 아이콘 — 직접 그린 SVG 우선, 매핑에 없으면 원래 이모지
const rankIco = e => {
  const a = (typeof rankArt === 'function') && rankArt(e);
  return a ? `<span class="rank-art">${a}</span>` : (e || '');
};
const titleTag = t => t ? `<span class="title-tag" style="color:${t.color}">${ico(t.icon, 'ti-ico')} ${esc(t.name)}</span>` : '';
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
      <div class="pb-ava" style="color:${p.rankColor}">${rankIco(p.rankIcon)}</div>
      <div class="pb-mid">
        <div class="pb-nickrow"><span class="pb-nick${ncClass(p.nickColor)}${npClass(p.plate)}">${esc(p.nick)}</span>${titleTag(p.titleInfo)}</div>
        <div class="pb-stats">${p.wins}승 ${p.losses}패${total ? ` (${p.winRate}%)` : ''} · <span style="color:${p.rankColor}">${esc(p.rank)}</span></div>
      </div>
      <div class="pb-right">
        <span class="pb-badge pb-coin">🪙 ${p.coins || 0}</span>
        <span class="pb-badge pb-rp">${ico('🏆')} ${p.rp} RP</span>
      </div>`;
    if (fill) fill.style.width = xpPct(p) + '%';
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
      <div class="mi-ava" style="color:${p.rankColor}">${rankIco(p.rankIcon)}</div>
      <div class="mi-info">
        <div class="mi-nick${ncClass(p.nickColor)}">${esc(p.nick)} ${canNick ? '<button class="pc-icon" onclick="closeMyInfo();openNickModal()" title="닉네임 바꾸기">✏️</button>' : ''}</div>
        <div class="mi-line">Lv.<b>${p.level}</b> (XP ${p.xpInLevel}/${p.xpNeeded}) · <span style="color:${p.rankColor}">${esc(p.rank)}</span> <b>${p.rp} RP</b></div>
        <div class="mi-line"><b>${p.wins}승 ${p.losses}패</b> · 승률 ${p.winRate}%</div>
        <div class="mi-badges">
          <span class="pb-coin pb-badge">🪙 ${p.coins || 0}</span>
          ${p.streak >= 2 ? `<span style="background:rgba(255,120,60,.16);color:#ffab5e">🔥 ${p.streak}연승 중</span>` : ''}
        </div>
      </div>
    </div>`;
  renderMyInv();
  renderMyTitles();
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
    const slot = EQUIP_SLOT[it.type];          // 장착 가능 아이템(카드백/명패/테이블/카드앞면)
    const on = slot && myAccount[slot] === it.id;
    const cnt = it.type === 'ticket' ? `<span class="cnt">x${items[it.id]}</span>` : '';
    html += `<div class="mi-item${on ? ' equipped' : ''}" ${slot ? `onclick="invEquip('${it.id}', ${on}, '${it.type}')"` : ''} title="${it.name}">
      ${cnt}<span class="ico">${ico(it.icon, 'inv-ico')}</span><span class="nm">${it.name.replace(' 카드백','')}</span></div>`;
  });
  inv.innerHTML = html || `<div class="mi-empty">아직 아이템이 없어요 — 상점 구경 가기 ${ico('🛒')}</div>`;
}
async function invEquip(itemId, isOn, kind) {
  const r = await apiPost('/api/equip', { token: localStorage.getItem('ff_auth'), itemId: isOn ? null : itemId, kind });
  if (!r.error) { myAccount = r.profile; renderMyInv(); renderAccount(); applyMySkins(); }
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
  // 보상이 0이어도 차단 사유·진행도 바는 보여줌 (로그인 유저)
  const worth = r && ((r.coins || r.xp || r.rp) || r.blocked || (myAccount && !myAccount.guest));
  if (!el || !worth) { if (el) el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="rw-tiles">
      <div class="rw-tile t-coin"><span class="rw-ic">🪙</span><b id="rwCoin">0</b><small>코인</small></div>
      <div class="rw-tile t-xp"><span class="rw-ic">✨</span><b>+${r.xp}</b><small>경험치</small></div>
      ${r.rp ? `<div class="rw-tile t-rp"><span class="rw-ic">${r.rp > 0 ? ico('🏆') : ico('⚠')}</span><b>${r.rp > 0 ? '+' : ''}${r.rp}</b><small>랭크점수</small></div>` : ''}
    </div>
    <div id="rwBadges" class="rw-badges"></div>`;
  countUp(document.getElementById('rwCoin'), r.coins, '');
  const badges = document.getElementById('rwBadges');
  // html=true 면 직접 그린 아이콘(SVG)을 넣을 수 있게 innerHTML 로 채운다.
  // 텍스트는 항상 esc 로 넣으므로 사용자 입력이 섞일 여지는 없다.
  const add = (cls, txt, delay, html) => {
    const b = document.createElement('div');
    b.className = 'rw-badge ' + cls;
    if (html) b.innerHTML = txt; else b.textContent = txt;
    b.style.animationDelay = delay + 'ms';
    badges.appendChild(b);
  };
  let d = 400;
  if (r.firstWin) { add('bd-first', `${ico('🎯')} 하루 첫 승 보너스 +${r.firstWin}`, d, true); d += 250; }
  if (r.streak && r.streakCount >= 2) { add('bd-streak', `${ico('🔥')} ${r.streakCount}연승! +${r.streak}`, d, true); d += 250; playSound('setwin'); }
  if (r.plateCoin) { add('bd-clan', `${ico('🏅')} 명패 효과 +${r.plateCoin}`, d, true); d += 250; }
  if (r.plateXp) { add('bd-first', `${ico('⬆️')} 명패 효과 경험치 +${r.plateXp}`, d, true); d += 250; }
  if (r.setName) { add('bd-rank', `${ico('💠')} ${esc(r.setName)} 세트 완성 보너스`, d, true); d += 250; }
  if (r.clanBonus) { add('bd-clan', `${ico('🛡️')} 클랜 보너스 +${r.clanBonus}`, d, true); d += 250; }
  if (r.levelUp) { add('bd-level', `${ico('⬆️')} 레벨 업! Lv.${r.levelUp}${r.levelCoins ? ` (+${r.levelCoins})` : ''}`, d, true); d += 250; playSound('setwin'); }
  if (r.rankUp) { add('bd-rank', `${rankIco('👑')} 승급! ${r.rankUp}`, d, true); d += 250; playSound('setwin'); }
  (r.missions || []).forEach(m => { add('bd-first', `${ico('🎯')} 미션 완료: ${esc(m.name)} +${m.reward}`, d, true); d += 250; });
  (r.milestones || []).forEach(m => { add('bd-rank', `${m.icon} ${m.label}`, d); d += 250; playSound('setwin'); });
  (r.titles || []).forEach(t => { add('bd-rank', `${t.icon} 칭호 획득! ${t.name}`, d); d += 250; playSound('setwin'); });
  if (r.blocked) {
    const msg = r.reason === 'short' ? '너무 짧은 판 — 보상 없음'
              : r.reason === 'friendly' ? '같은 접속·친선 대전 — 보상 없음'
              : r.reason === 'repeat' ? '같은 상대 반복 대전 — 보상 없음'
              : '보상 지급 제외';
    add('bd-warn', `${ico('⚠')} ${esc(msg)}`, d, true); d += 250;
  }
  // 진행도 노출 — 이전→이후 게이지 상승 모션 (scaleX = GPU 합성 전용, 리플로우 없음)
  if (myAccount && !myAccount.guest) {
    const RANK_STEPS = [[0, '브론즈'], [100, '실버'], [250, '골드'], [500, '플래티넘'], [900, '다이아'], [1500, '마스터']];
    const need = myAccount.xpNeeded || 100;
    const xpAfter = Math.min(1, (myAccount.xpInLevel || 0) / need);
    const xpBefore = r.levelUp ? 0 : Math.max(0, ((myAccount.xpInLevel || 0) - (r.xp || 0)) / need);
    let html = `<div class="rw-prog">
      <div class="rwp-row"><span class="rwp-lbl">Lv.${myAccount.level}</span>
        <div class="rwp-bar"><div class="rwp-fill" id="rwpXp"></div></div>
        <span class="rwp-val">XP ${myAccount.xpInLevel}/${myAccount.xpNeeded}${r.xp ? ` <b style="color:#7dd87d">+${r.xp}</b>` : ''}</span></div>`;
    const rp = myAccount.rp || 0, rpBeforeTotal = rp - (r.rp || 0);
    const next = RANK_STEPS.find(([t]) => t > rp);
    let rpAfter = 1, rpBefore = 1;
    if (next) {
      const prev = [...RANK_STEPS].reverse().find(([t]) => t <= rp)[0];
      rpAfter = Math.max(0, Math.min(1, (rp - prev) / (next[0] - prev)));
      rpBefore = r.rankUp ? 0 : Math.max(0, Math.min(1, (rpBeforeTotal - prev) / (next[0] - prev)));
      html += `<div class="rwp-row"><span class="rwp-lbl" style="color:${myAccount.rankColor}">${rankIco(myAccount.rankIcon)} ${esc(myAccount.rank)}</span>
        <div class="rwp-bar"><div class="rwp-fill rk" id="rwpRp"></div></div>
        <span class="rwp-val">${next[0] - rp} RP → ${next[1]}${r.rp ? ` <b style="color:${r.rp > 0 ? '#7dd87d' : '#ff8a8a'}">${r.rp > 0 ? '+' : ''}${r.rp}</b>` : ''}</span></div>`;
    }
    // 재접속 유도 — 내일 출석 보상 예고 (연속 유지 시 금액)
    const nextDaily = 30 + Math.min((myAccount.loginStreak || 0) * 10, 70) + (myAccount.plate === 'np_daily' ? 50 : 0);
    html += `<div style="margin-top:8px;font-size:.72rem;color:#c8a86a">📅 내일 접속하면 출석 보상 <b style="color:#ffd94a">🪙 ${nextDaily}</b>${(myAccount.loginStreak || 0) >= 1 ? ` (🔥 ${(myAccount.loginStreak || 0) + 1}일 연속)` : ''}</div>`;
    html += '</div>';
    el.insertAdjacentHTML('beforeend', html);
    // 게이지 모션: 이전 값에서 시작 → 획득분만큼 차오름. 레벨업/승급은 꽉 채우고 반짝 → 새 게이지
    const gauge = (id, from, to, promoted) => {
      const f = document.getElementById(id); if (!f) return;
      f.style.transform = `scaleX(${from})`;
      setTimeout(() => {
        if (promoted) {
          f.style.transform = 'scaleX(1)'; f.classList.add('burst');
          setTimeout(() => {
            f.style.transition = 'none'; f.style.transform = 'scaleX(0)'; void f.offsetWidth;
            f.style.transition = ''; f.style.transform = `scaleX(${to})`;
            setTimeout(() => f.classList.remove('burst'), 700);
          }, 620);
        } else f.style.transform = `scaleX(${to})`;
      }, 420);
    };
    gauge('rwpXp', xpBefore, xpAfter, !!r.levelUp);
    gauge('rwpRp', rpBefore, rpAfter, !!r.rankUp);
  }
  pendingRewards = null;
}
// ── 닉네임 설정 모달 ──
function openNickModal() {
  document.getElementById('nickErr').textContent = '';
  const i = document.getElementById('nickNew');
  i.value = myAccount ? myAccount.nick : '';
  document.getElementById('nickModal').classList.add('show');
  // 모바일 키보드가 갑자기 튀지 않게 자동 포커스는 생략 (사용자가 직접 탭)
}
function closeNickModal() { document.getElementById('nickModal').classList.remove('show'); }
// '나중에' 눌러도 한 번 더 확인 (실수 방지)
function confirmSkipNick() {
  askConfirm({ icon: '✏️', title: '닉네임을 지금 안 정할까요?', desc: '나중에 바꾸려면 상점의 닉네임 변경권이 필요할 수 있어요.', yes: '나중에 할게요', no: '지금 정하기' },
    () => closeNickModal());
}
async function submitNick() {
  const nick = document.getElementById('nickNew').value.trim();
  const err = document.getElementById('nickErr');
  const tk = localStorage.getItem('ff_auth');
  const r = await apiPost('/api/nick', { token: tk, nick });
  if (r.error) { err.textContent = '⚠️ ' + r.error; return; }
  myAccount = r.profile; renderAccount(); closeNickModal();
  socket.emit('auth', { token: tk });   // 게임 서버에도 새 닉 반영
  if (kakaoFirstLogin) { kakaoFirstLogin = false; offerTutorial(); }   // 소셜 첫 로그인 → 닉 설정 후 튜토리얼 유도
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
// ── 타이틀 화면 (구글/카카오/게스트 선택) ──
function hideTitle() { const t = document.getElementById('title'); if (t) t.classList.add('hide'); }
function showTitle() { sessionStorage.removeItem('ff_guest'); const t = document.getElementById('title'); if (t) { t.style.display = ''; t.classList.remove('hide'); } }
function startAsGuest() { sessionStorage.setItem('ff_guest', '1'); hideTitle(); }   // 게스트 선택 기억
const cameFromOAuth = kakaoFirstLogin || location.href.includes('ktoken');   // 방금 로그인하고 돌아온 경우

renderAccount();   // 게스트 상태로 하단 바 먼저 렌더
restoreSession().then(() => {
  if (kakaoFirstLogin && myAccount) openNickModal();
  // 로그인돼 있거나, 게스트로 시작해 게임을 돌던 중(나가기·새로고침)이면 타이틀 건너뜀
  if (myAccount || sessionStorage.getItem('ff_guest')) hideTitle();
});
// 설정된 소셜 로그인 버튼만 타이틀에 노출
fetch('/api/auth-config').then(r => r.json()).then(d => {
  if (d.google) { const b = document.getElementById('titleGoogle'); if (b) b.style.display = 'flex'; }
  if (d.kakao)  { const b = document.getElementById('titleKakao');  if (b) b.style.display = 'flex'; }
}).catch(() => {});

// ── 빠른 대전 (자동 매칭) ───────────────────────────────────
function quickMatch(itemMode) {
  closeModePanels();
  isItemMode = !!itemMode;
  socket.emit('quick_match', { pid: PID, nick: getNick(), itemMode: !!itemMode });
  const m = document.getElementById('matchModal');
  m.classList.add('show');
  const t = document.getElementById('matchTitle');
  if (t) t.textContent = itemMode ? '🎪 아이템전 빠른플레이' : '⚡ 빠른 대전';
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
      row.innerHTML = `<span class="lb-no${p.no <= 3 ? ' top' : ''}">${p.no <= 3 ? rankIco(['🥇','🥈','🥉'][p.no-1]) : p.no}</span>
        <span class="lb-rank" style="color:${p.rankColor}">${rankIco(p.rankIcon)}</span>
        <span class="lb-nick${ncClass(p.nickColor)}${npClass(p.plate)}">${esc(p.nick)}</span>
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
          <span class="lb-rank" style="color:${me.rankColor}">${rankIco(me.rankIcon)}</span>
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

// ── 일일 미션 ──
async function openMissions() {
  if (!myAccount) { alert('미션은 로그인하면 이용할 수 있어요!'); openAuth('login'); return; }
  const list = document.getElementById('missionList');
  list.innerHTML = '<div class="lb-empty">불러오는 중…</div>';
  document.getElementById('missionModal').classList.add('show');
  const r = await apiPost('/api/missions', { token: localStorage.getItem('ff_auth') });
  if (r.error || !r.list) { list.innerHTML = '<div class="lb-empty">불러오기 실패</div>'; return; }
  list.innerHTML = '';
  r.list.forEach(m => {
    const row = document.createElement('div');
    row.className = 'mis-row' + (m.claimed ? ' done' : '');
    row.innerHTML = `
      <div class="mis-info">
        <div class="mis-name">${m.claimed ? ico('✅') : ico('🎯')} ${esc(m.name)}</div>
        <div class="mis-bar"><div class="mis-fill" style="width:${Math.round(m.prog / m.goal * 100)}%"></div></div>
        <div class="mis-prog">${m.prog}/${m.goal}</div>
      </div>
      <div class="mis-reward">${m.claimed ? '완료!' : `🪙 ${m.reward}`}</div>`;
    list.appendChild(row);
  });
}
function closeMissions() { document.getElementById('missionModal').classList.remove('show'); }

// ══════════════════════════════════════════════════════════
//  아이템전 (이벤트 모드) — AI 대전 전용
// ══════════════════════════════════════════════════════════
// 카탈로그는 서버 items.js와 같은 내용을 표시용으로만 들고 있는다.
// 실제 효과·검증은 전부 서버가 하므로 여기 값을 고쳐도 게임에 영향은 없다.
const ITEM_INFO = {
  magnify:    { name: '돋보기',       icon: '🔍', tier: 'common', desc: '상대 손패 2장을 훔쳐본다' },
  hourglass:  { name: '모래시계',     icon: '⏳', tier: 'common', desc: '상대의 남은 시간을 30초 깎는다' },
  swap:       { name: '손바꿈',       icon: '🔀', tier: 'common', desc: '내 손패 1장을 덱의 카드와 바꾼다', needsCard: true },
  smoke:      { name: '연막탄',       icon: '💨', tier: 'rare',   desc: '이번 경매품을 상대에게만 가린다' },
  flip:       { name: '뒤집개',       icon: '🔄', tier: 'rare',   desc: '이번 경매만 약한 카드가 이긴다' },
  pickpocket: { name: '소매치기',     icon: '🪝', tier: 'rare',   desc: '상대 손패 1장을 뺏고 내 카드 1장을 넘긴다' },
  discount:   { name: '에누리',       icon: '💰', tier: 'rare',   desc: '이겨도 배팅 카드를 뺏기지 않는다' },
  redo:       { name: '재경매',       icon: '📢', tier: 'rare',   desc: '진 경매를 무효로 하고 다시 배팅한다' },
  steal:      { name: '도둑고양이',   icon: '🐈', tier: 'legend', desc: '상대가 낙찰받은 카드 1장을 훔친다' },
  copy:       { name: '복사기',       icon: '🖨️', tier: 'legend', desc: '내가 낙찰받은 카드 1장을 복제한다' },
  tyrant:     { name: '폭군',         icon: '👑', tier: 'legend', desc: '이번 턴 진행자 권한을 뺏는다' },
  dice:       { name: '운명의 주사위', icon: '🎲', tier: 'legend', desc: '경매품 2장을 새로 뽑아 바꾼다' },
};
const TIER_LABEL = { common: '일반', rare: '희귀', legend: '전설' };
// 직접 그린 SVG 아이콘 (item-icons.js). 못 불러오면 이모지로 대체.
const itemArt = id => (typeof ITEM_ICONS !== 'undefined' && ITEM_ICONS[id]) || (ITEM_INFO[id] ? ITEM_INFO[id].icon : '❓');
let isItemMode = false;
let _iuItem = null, _iuCard = null;

// 로비 → 아이템전: 솔로(AI) / 빠른플레이(유저 매칭) 선택
function openItemMode() {
  askConfirm(
    { icon: '🎪', title: '아이템전 (이벤트)',
      desc: '경매에서 지면 아이템을 받아요! 12종 아이템으로 뒤집는 캐주얼 모드예요.\n랭킹에는 반영되지 않고 코인·경험치만 받아요.',
      yes: '👤 솔로 (AI와)', no: '⚡ 빠른플레이' },
    () => startItemGame(),                       // 솔로
    () => quickMatch(true));                     // 빠른플레이 — 아이템전 유저끼리 매칭
}
function startItemGame() {
  isVsBot = true; isItemMode = true;
  socket.emit('create_room', { vsBot: true, difficulty: 'normal', pid: PID, nick: getNick(), itemMode: true });
}

// 슬롯 3칸 렌더 — 지금 쓸 수 있는 것만 밝게
function renderItems(s) {
  const bar = document.getElementById('itemBar');
  const badge = document.getElementById('oppItemBadge');
  if (!bar) return;
  if (!s || !s.itemMode) { bar.style.display = 'none'; badge.style.display = 'none'; hideFxBanner(); return; }
  bar.style.display = '';
  badge.style.display = '';
  document.getElementById('oppItemCount').textContent = s.oppItemCount || 0;

  const slots = document.getElementById('itemSlots');
  const held = s.myItems || [];
  let html = '';
  for (let i = 0; i < 3; i++) {
    const id = held[i];
    if (!id) { html += '<div class="ib-slot empty"></div>'; continue; }
    const it = ITEM_INFO[id] || { name: id, icon: '❓', tier: 'common' };
    const usable = itemUsableNow(id, s);
    // 못 쓰는 슬롯도 눌리게 둔다 — 아무 반응이 없으면 뭘 가진 건지조차 알 수 없다
    html += `<div class="ib-slot ${it.tier} ${usable ? 'ready' : 'locked'}" title="${esc(it.name)}"
                  onclick="${usable ? `openItemUse('${id}')` : `explainItem('${id}')`}">${itemArt(id)}</div>`;
  }
  slots.innerHTML = html;
  renderFxBanner(s);
}

// 클라이언트 쪽 사용 가능 판단 (서버가 최종 판정 — 여기선 버튼을 흐리게 할 뿐)
function itemUsableNow(id, s) {
  if (!s || s.itemUsed) return false;
  const PRE = ['draw', 'offer', 'choose_type', 'bidding'];
  const phases = id === 'redo' ? ['reveal']
               : id === 'tyrant' ? ['draw']
               : id === 'dice' ? ['choose_type', 'bidding']
               : id === 'smoke' ? ['offer', 'choose_type', 'bidding']
               : PRE;
  if (!phases.includes(s.phase)) return false;
  if (s.phase === 'bidding' && s.auction && s.auction.myBid) return false;   // 배팅 낸 뒤엔 불가
  if (id === 'tyrant' && s.auctioneer === s.myIndex) return false;
  return true;
}

function renderFxBanner(s) {
  const el = document.getElementById('fxBanner');
  if (!el) return;
  const f = s.fx || {};
  const msgs = [];
  if (f.reverse) msgs.push('🔄 반전 — 약한 카드가 이긴다');
  if (f.smokedMe) msgs.push('💨 연막 — 경매품이 안 보인다');
  if (f.smokedOpp) msgs.push('💨 상대 시야를 가림');
  if (f.noSwapMe) msgs.push('💰 에누리 — 배팅 카드를 지킨다');
  let peekHtml = '';
  if (f.peek && f.peek.length) {
    peekHtml = ' 🔍 ' + f.peek.map(c =>
      `<span style="display:inline-block;padding:0 5px;margin:0 1px;border-radius:5px;background:rgba(255,255,255,.22)">${c.kind}<small style="opacity:.75">-${c.grade}</small></span>`).join('');
  }
  if (!msgs.length && !peekHtml) { el.style.display = 'none'; return; }
  el.innerHTML = esc(msgs.join('  ·  ')) + peekHtml;
  el.style.display = '';
}
function hideFxBanner() { const el = document.getElementById('fxBanner'); if (el) el.style.display = 'none'; }

// 지금 못 쓰는 아이템을 눌렀을 때 — 무엇이고 언제 쓸 수 있는지 알려준다
const WHEN_TEXT = {
  redo:   '경매 결과가 공개된 뒤, 진 쪽만',
  tyrant: '진행자가 카드를 뽑기 전에 (손패 2장 이상)',
  dice:   '경매 방식이 정해진 뒤부터 배팅 전까지',
  smoke:  '경매품이 나온 뒤부터 배팅 전까지',
};
function explainItem(id) {
  const it = ITEM_INFO[id]; if (!it) return;
  const when = WHEN_TEXT[id] || '내 차례에, 배팅을 내기 전까지';
  const why = (state && state.itemUsed) ? '이번 턴엔 이미 아이템을 썼어요.' : `사용 시점: ${when}`;
  toast(`<b>${esc(it.name)}</b> — ${esc(it.desc)}<br><span style="opacity:.75;font-size:.9em">${esc(why)}</span>`, 3200);
  playSound('select');
}

// 사용 확인 모달 (손바꿈만 카드 선택 필요)
function openItemUse(id) {
  const it = ITEM_INFO[id]; if (!it) return;
  _iuItem = id; _iuCard = null;
  document.getElementById('iuTitle').textContent = it.name;
  document.getElementById('iuIcon').innerHTML = itemArt(id);
  document.getElementById('iuDesc').textContent = it.desc;
  const handBox = document.getElementById('iuHand');
  if (it.needsCard) {
    const hand = (state && state.myHand) || [];
    handBox.innerHTML = '<div style="width:100%;font-size:.7rem;color:#a08a70;text-align:center;margin-bottom:2px">바꿀 카드를 고르세요</div>';
    // 카드 id는 숫자다(kind*100+grade). onclick 속성에 넣으면 문자열이 되어
    // 서버의 엄격 비교(c.id === arg)에서 201 === '201' 로 어긋난다. 값을 그대로 넘긴다.
    hand.forEach(c => {
      const el = document.createElement('div');
      el.className = 'iu-c';
      el.innerHTML = `${c.kind}<small>${c.grade}등급</small>`;
      el.addEventListener('click', () => pickIuCard(el, c.id));
      handBox.appendChild(el);
    });
    document.getElementById('iuGo').disabled = true;
  } else {
    handBox.innerHTML = '';
    document.getElementById('iuGo').disabled = false;
  }
  document.getElementById('itemUseModal').classList.add('show');
}
function pickIuCard(el, cardId) {
  _iuCard = cardId;
  document.querySelectorAll('#iuHand .iu-c').forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('iuGo').disabled = false;
}
function closeItemUse() { document.getElementById('itemUseModal').classList.remove('show'); _iuItem = null; _iuCard = null; }
function confirmUseItem() {
  if (!_iuItem) return;
  socket.emit('use_item', { itemId: _iuItem, cardId: _iuCard ?? undefined });
  closeItemUse();
}

// 아이템 획득 연출
function showItemGet(it) {
  const box = document.getElementById('itemGetFx');
  document.getElementById('igTier').textContent = TIER_LABEL[it.tier] || '';
  document.getElementById('igIcon').innerHTML = itemArt(it.id);
  document.getElementById('igName').textContent = it.name;
  document.getElementById('igDesc').textContent = it.desc || '';
  box.style.display = 'flex';
  // 티어별로 획득감 차등 — 전설은 링·파편까지 터뜨린다
  const card = box.querySelector('.ig-card');
  if (card) { card.className = 'ig-card ' + it.tier; }
  playSound(it.tier === 'legend' ? 'setwin' : 'bell');
  if (it.tier !== 'common') {
    fxAdd(`<div class="ifx-ring ${it.tier === 'legend' ? '' : 'r2'}"></div>`, 1000);
    setTimeout(() => playSound('special'), 120);
  }
  if (it.tier === 'legend') {
    shakeGame('m');
    const colors = ['#ffd479', '#e06a5a', '#fff6e0'];
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      const d = 110 + Math.random() * 80;
      fxAdd(`<div class="ifx-spark" style="--dx:${(Math.cos(a)*d).toFixed(1)}px;--dy:${(Math.sin(a)*d).toFixed(1)}px;background:${colors[i%3]}"></div>`, 1100);
    }
  }
  setTimeout(() => { box.style.display = 'none'; }, it.tier === 'legend' ? 2100 : 1400);
}

// ── 아이템 사용 연출 ──────────────────────────────────────
// 티어가 높을수록 세게, 아이템 성격에 맞는 전용 연출을 얹는다.
// 모든 요소는 애니메이션이 끝나면 제거해 잔여물이 남지 않게 한다.
let _itemFxEl = null;
function itemFxLayer() {
  if (!_itemFxEl || !_itemFxEl.isConnected) {
    _itemFxEl = document.createElement('div');
    _itemFxEl.id = 'itemFx';
    document.body.appendChild(_itemFxEl);
  }
  return _itemFxEl;
}
function fxAdd(html, ms) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const node = wrap.firstElementChild;
  itemFxLayer().appendChild(node);
  setTimeout(() => node.remove(), ms);
  return node;
}
function shakeGame(level) {
  const g = document.getElementById('game');
  if (!g) return;
  const cls = 'ifx-shake-' + level;
  g.classList.remove('ifx-shake-s', 'ifx-shake-m', 'ifx-shake-l');
  void g.offsetWidth;                                   // 리플로우로 애니메이션 재시작
  g.classList.add(cls);
  setTimeout(() => g.classList.remove(cls), 900);
}

const TIER_SHAKE = { common: 's', rare: 'm', legend: 'l' };
const TIER_MS    = { common: 1100, rare: 1300, legend: 1700 };

function playItemFx(u) {
  const tier = (ITEM_INFO[u.itemId] || {}).tier || 'common';
  const mine = !!u.byMe;

  // 1) 화면 플래시 + 충격파 링 (티어가 높을수록 여러 겹)
  fxAdd(`<div class="ifx-flash ${tier}"></div>`, 900);
  const rings = tier === 'legend' ? 3 : tier === 'rare' ? 2 : 1;
  for (let i = 0; i < rings; i++) {
    fxAdd(`<div class="ifx-ring ${i ? 'r' + (i + 1) : ''} ${mine ? '' : 'opp'}"></div>`, 1000);
  }

  // 2) 아이콘이 화면에 꽂히는 임팩트 (상대 것은 붉은 테두리로 구분)
  fxAdd(`<div class="ifx-slam ${tier} ${mine ? 'me' : 'opp'}">
      ${itemArt(u.itemId)}
      <div class="ifx-name">${mine ? '' : '상대 '}${esc(u.name)}</div>
      <div class="ifx-msg">${esc(u.msg || '')}</div>
    </div>`, TIER_MS[tier]);

  // 3) 전설은 파편까지 흩뿌린다
  if (tier === 'legend') {
    const colors = ['#ffd479', '#e06a5a', '#fff6e0', '#b98fe0'];
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
      const d = 130 + Math.random() * 110;
      fxAdd(`<div class="ifx-spark" style="--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;background:${colors[i % colors.length]};animation-delay:${(i % 5) * 0.03}s"></div>`, 1100);
    }
  }

  shakeGame(TIER_SHAKE[tier]);

  // 4) 아이템별 성격 연출
  switch (u.itemId) {
    case 'smoke':
      fxAdd('<div class="ifx-smoke"></div>', 2700);
      break;
    case 'flip': {
      const g = document.getElementById('game');
      if (g) { g.classList.add('ifx-flipboard'); setTimeout(() => g.classList.remove('ifx-flipboard'), 900); }
      break;
    }
    case 'tyrant':
      fxAdd('<div class="ifx-press"></div>', 1100);
      break;
    case 'steal':
      fxAdd('<div class="ifx-snatch"></div>', 1100);
      break;
    case 'hourglass': {
      const t = document.getElementById(mine ? 'oppTimer' : 'myTimer');   // 시간이 깎이는 쪽
      if (t) { t.classList.add('ifx-drain'); setTimeout(() => t.classList.remove('ifx-drain'), 1900); }
      break;
    }
  }

  // 5) 소리 — 티어별로 두껍게 겹친다
  playSound(mine ? 'place' : 'flip');
  if (tier !== 'common') setTimeout(() => playSound('special'), 90);
  if (tier === 'legend') { setTimeout(() => playSound('setwin'), 200); setTimeout(() => playSound('bell'), 340); }
}

socket.on('item_get', it => showItemGet(it));
socket.on('item_fail', msg => toast('⚠️ ' + esc(msg || '지금은 쓸 수 없어요.')));
socket.on('item_used', u => {
  playItemFx(u);
  const tier = (ITEM_INFO[u.itemId] || {}).tier || 'common';
  // 연출이 지나간 뒤 무슨 일이 있었는지 글로 한 번 더 (뭘 당했는지 모르면 억울하다)
  setTimeout(() => toast(`${u.byMe ? '' : '상대가 '}<b>${esc(u.name)}</b> — ${esc(u.msg || '')}`, 2400), TIER_MS[tier] - 300);
  if (u.reveal) showItemReveal(u);
});

// 내가 쓴 아이템의 결과(엿본 카드·뺏은 카드 등)를 잠깐 보여준다
function showItemReveal(u) {
  const r = u.reveal;
  const cardTag = c => `<span style="display:inline-block;padding:2px 7px;margin:0 2px;border-radius:6px;background:rgba(255,212,121,.2);border:1px solid #ffd479;font-weight:800">${c.kind}<small style="opacity:.7"> ${c.grade}</small></span>`;
  let html = '';
  if (r.got && r.gave) html = `얻음 ${cardTag(r.got)} / 넘김 ${cardTag(r.gave)}`;
  else if (r.got) html = `얻음 ${cardTag(r.got)}`;
  else if (r.prize) html = `새 경매품 ${r.prize.map(cardTag).join('')}`;
  if (html) setTimeout(() => toast(html, 2800), 700);
}

// ══════════════════════════════════════════════════════════
//  친구
// ══════════════════════════════════════════════════════════
let _friendData = { friends: [], reqIn: [], reqOut: [] };

function needLogin(what) {
  if (myAccount) return false;
  alert(what + '은(는) 로그인하면 이용할 수 있어요!');
  openAuth('login');
  return true;
}
const authToken = () => localStorage.getItem('ff_auth');

function openFriends() {
  if (needLogin('친구')) return;
  document.getElementById('friendsModal').classList.add('show');
  friendTab('list');
  loadFriends();
}
function closeFriends() { document.getElementById('friendsModal').classList.remove('show'); }

function friendTab(which) {
  for (const t of ['list', 'req', 'find']) {
    document.getElementById('ftab-' + t).classList.toggle('active', t === which);
    document.getElementById('fpane-' + t).style.display = t === which ? '' : 'none';
  }
  if (which === 'find') setTimeout(() => document.getElementById('friendNickInput').focus(), 60);
}

async function loadFriends() {
  const box = document.getElementById('friendListBox');
  box.innerHTML = '<div class="soc-empty">불러오는 중…</div>';
  const r = await apiPost('/api/friends', { token: authToken() });
  if (!r.ok) { box.innerHTML = `<div class="soc-empty">${esc(r.error || '불러오기 실패')}</div>`; return; }
  _friendData = r;
  renderFriends();
  updateSocialBadges();
}

// 친구 한 줄 — 온라인이면 초록 점 + 도전장 버튼
function friendRow(f, kind) {
  const clan = f.clan ? `<span class="soc-clan">[${esc(f.clan.tag)}]</span>` : '';
  const acts = {
    friend: `${f.online ? `<button class="soc-btn good" onclick="challengeFriendInApp('${esc(f.idl)}')">도전장</button>` : ''}
             <button class="soc-btn bad" onclick="confirmRemoveFriend('${esc(f.idl)}','${esc(f.nick)}')">삭제</button>`,
    in:     `<button class="soc-btn good" onclick="respondFriend('${esc(f.idl)}',true)">수락</button>
             <button class="soc-btn bad" onclick="respondFriend('${esc(f.idl)}',false)">거절</button>`,
    out:    `<button class="soc-btn bad" onclick="cancelFriend('${esc(f.idl)}')">취소</button>`,
  }[kind];
  return `<div class="soc-item">
    ${kind === 'friend' ? `<span class="soc-dot ${f.online ? 'on' : ''}"></span>` : ''}
    <div class="soc-info">
      <div class="soc-nick">${clan}${esc(f.nick)}</div>
      <div class="soc-meta">Lv.${f.level} · ${rankIco(f.rankIcon)} ${esc(f.rank)} · ${f.rp} RP${kind === 'friend' ? (f.online ? ' · 접속 중' : '') : ''}</div>
    </div>
    <div class="soc-acts">${acts}</div>
  </div>`;
}

function renderFriends() {
  const { friends, reqIn, reqOut } = _friendData;
  const box = document.getElementById('friendListBox');
  box.innerHTML = friends.length
    ? friends.slice().sort((a, b) => (b.online - a.online) || (b.rp - a.rp)).map(f => friendRow(f, 'friend')).join('')
    : '<div class="soc-empty">아직 친구가 없어요.<br>「친구찾기」에서 닉네임으로 추가해보세요!</div>';
  document.getElementById('friendReqIn').innerHTML = reqIn.length
    ? reqIn.map(f => friendRow(f, 'in')).join('') : '<div class="soc-empty">받은 요청이 없어요.</div>';
  document.getElementById('friendReqOut').innerHTML = reqOut.length
    ? reqOut.map(f => friendRow(f, 'out')).join('') : '<div class="soc-empty">보낸 요청이 없어요.</div>';
}

async function submitFriendAdd() {
  const input = document.getElementById('friendNickInput');
  const msg = document.getElementById('friendAddMsg');
  const nick = input.value.trim();
  if (!nick) { msg.textContent = '닉네임을 입력해주세요.'; return; }
  msg.textContent = '요청 중…';
  const r = await apiPost('/api/friend-add', { token: authToken(), nick });
  if (!r.ok) { msg.innerHTML = `⚠️ ${esc(r.error || '실패했어요.')}`; return; }
  input.value = '';
  msg.innerHTML = r.friendIdl
    ? `🎉 <b>${esc(nick)}</b>님과 친구가 되었어요!`   // 상대도 나를 요청한 상태였음
    : `✅ <b>${esc(nick)}</b>님에게 요청을 보냈어요.`;
  loadFriends();
}

async function respondFriend(idl, accept) {
  const r = await apiPost(accept ? '/api/friend-accept' : '/api/friend-decline', { token: authToken(), idl });
  if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
  if (accept) toast(`🎉 ${esc(r.nick || '')}님과 친구가 되었어요!`);
  loadFriends();
}
async function cancelFriend(idl) {
  await apiPost('/api/friend-cancel', { token: authToken(), idl });
  loadFriends();
}
function confirmRemoveFriend(idl, nick) {
  askConfirm({ icon: '👋', title: `${nick}님을 삭제할까요?`, desc: '친구 목록에서 서로 사라져요.', yes: '삭제', no: '취소' },
    async () => { await apiPost('/api/friend-remove', { token: authToken(), idl }); loadFriends(); });
}

// 도전장 — 목록에 안 뜨는 방(secret, 비번 없음)을 만들고 방 코드를 친구에게 실시간 전송.
// 방이 실제로 만들어진 뒤(room_created)에 보내야 하므로 대상만 기억해둔다.
// ※ 이름 주의: 카카오 공유용 challengeFriend()가 이 파일 아래쪽에 이미 있다. 겹치면 덮어써진다.
let _pendingChallenge = null;
function challengeFriendInApp(idl) {
  closeFriends();
  _pendingChallenge = idl;
  isVsBot = false;
  toast('방을 만드는 중…', 1200);
  socket.emit('create_room', { vsBot: false, pid: PID, nick: getNick(), name: '친구 대전', secret: true, password: '' });
}

// ══════════════════════════════════════════════════════════
//  클랜
// ══════════════════════════════════════════════════════════
let _clanTab = 'my';

function openClan() {
  if (needLogin('클랜')) return;
  document.getElementById('clanModal').classList.add('show');
  loadClan();
}
function closeClan() { document.getElementById('clanModal').classList.remove('show'); closeChatMenu(); }

async function loadClan() {
  const body = document.getElementById('clanBody');
  body.innerHTML = '<div class="soc-empty">불러오는 중…</div>';
  const r = await apiPost('/api/clan', { token: authToken() });
  if (!r.ok) { body.innerHTML = `<div class="soc-empty">${esc(r.error || '불러오기 실패')}</div>`; return; }
  if (r.clan) renderMyClan(r.clan);
  else renderClanBrowse(r);
  updateSocialBadges();
}

function renderMyClan(c) {
  const memberRow = m => `<div class="soc-item">
    <div class="soc-info">
      <div class="soc-nick">${m.isOwner ? '👑' : m.isVice ? '🛡' : ''}${esc(m.nick)}${
        m.isOwner ? '<span class="soc-role owner">클랜장</span>'
        : m.isVice ? '<span class="soc-role vice">부클랜장</span>' : ''}</div>
      <div class="soc-meta">Lv.${m.level} · ${rankIco(m.rankIcon)} ${esc(m.rank)} · ${m.rp} RP${
        m.isOwner || m.isVice ? ' · 코인 +10%' : ' · 코인 +5%'}</div>
    </div>
    ${c.isOwner && !m.isOwner ? `<div class="soc-acts">
      <button class="soc-btn" onclick="clanTransfer('${esc(m.idl)}','${esc(m.nick)}')">위임</button>
      <button class="soc-btn bad" onclick="clanKick('${esc(m.idl)}','${esc(m.nick)}')">추방</button>
    </div>` : ''}
  </div>`;
  const applicantRow = m => `<div class="soc-item">
    <div class="soc-info">
      <div class="soc-nick">${esc(m.nick)}</div>
      <div class="soc-meta">Lv.${m.level} · ${rankIco(m.rankIcon)} ${esc(m.rank)} · ${m.rp} RP</div>
    </div>
    <div class="soc-acts">
      <button class="soc-btn good" onclick="clanDecide('${esc(m.idl)}',true)">수락</button>
      <button class="soc-btn bad" onclick="clanDecide('${esc(m.idl)}',false)">거절</button>
    </div>
  </div>`;

  document.getElementById('clanBody').innerHTML = `
    <div class="clan-head">
      <div class="clan-name"><span class="clan-tag">${esc(c.tag)}</span>${esc(c.name)}</div>
      <div class="clan-stats">
        <div class="clan-stat"><b>${c.memberCount}/${c.max}</b><span>클랜원</span></div>
        <div class="clan-stat"><b>${c.totalRp}</b><span>총 RP</span></div>
        <div class="clan-stat"><b>${c.totalWins}</b><span>총 승리</span></div>
      </div>
      ${c.notice ? `<div class="clan-notice">📢 ${esc(c.notice)}</div>` : ''}
    </div>
    <div class="soc-tabs">
      <button class="soc-tab ${_clanView === 'chat' ? 'active' : ''}" onclick="clanViewTab('chat')">
        💬 채팅<span class="tl-badge sm" id="clanChatBadge" style="display:none">0</span>
      </button>
      <button class="soc-tab ${_clanView === 'info' ? 'active' : ''}" onclick="clanViewTab('info')">
        클랜원${c.isOwner && c.applicantCount ? `<span class="tl-badge sm">${c.applicantCount}</span>` : ''}
      </button>
    </div>
    <div id="clanPaneChat" style="display:${_clanView === 'chat' ? '' : 'none'}">
      <div class="chat-list" id="chatList"><div class="chat-empty">불러오는 중…</div></div>
      <div class="chat-form" style="margin-top:8px">
        <input id="chatInput" class="chat-input" maxlength="100" placeholder="클랜원에게 메시지…"
               autocomplete="off" onkeydown="if(event.key==='Enter')sendClanChat()">
        <button class="chat-send" onclick="sendClanChat()">보내기</button>
      </div>
      <div class="chat-note">클랜원만 볼 수 있어요 · 메시지를 누르면 신고·차단</div>
    </div>
    <div id="clanPaneInfo" style="display:${_clanView === 'info' ? '' : 'none'}">
      ${c.isOwner && c.applicants.length ? `<div class="soc-sec">가입 신청 ${c.applicants.length}건</div>
        <div class="soc-list">${c.applicants.map(applicantRow).join('')}</div>` : ''}
      <div class="soc-sec">클랜원</div>
      <div class="soc-list">${c.members.map(memberRow).join('')}</div>
      <div class="soc-row" style="margin-top:12px">
        ${c.isOwner ? `<button class="soc-btn" style="flex:1" onclick="clanEditNotice()">공지 수정</button>` : ''}
        <button class="soc-btn bad" style="flex:1" onclick="clanLeave(${c.isOwner})">${c.isOwner && c.memberCount > 1 ? '탈퇴(위임)' : '탈퇴'}</button>
      </div>
    </div>`;
  if (_clanView === 'chat') loadClanChat();
}

// ── 클랜 채팅 ──────────────────────────────────────────────
let _clanView = 'chat';        // 클랜 모달에서 채팅/클랜원 중 무엇을 보고 있나
let _chatUnread = 0;           // 모달이 닫혀 있을 때 쌓인 새 메시지
let _chatMsgs = [];

function clanViewTab(which) {
  _clanView = which;
  document.getElementById('clanPaneChat').style.display = which === 'chat' ? '' : 'none';
  document.getElementById('clanPaneInfo').style.display = which === 'info' ? '' : 'none';
  document.querySelectorAll('#clanBody .soc-tabs .soc-tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0) === (which === 'chat')));
  if (which === 'chat') { loadClanChat(); setTimeout(() => document.getElementById('chatInput')?.focus(), 60); }
}

const chatOpen = () => document.getElementById('clanModal')?.classList.contains('show') && _clanView === 'chat';

async function loadClanChat() {
  const box = document.getElementById('chatList'); if (!box) return;
  const r = await apiPost('/api/clan-chat', { token: authToken() });
  if (!r.ok) { box.innerHTML = `<div class="chat-empty">${esc(r.error || '불러오기 실패')}</div>`; return; }
  _chatMsgs = r.messages;
  _chatUnread = 0; updateChatBadge();
  renderChat(true);
}

function chatTime(ts) {
  const d = new Date(ts), n = new Date();
  const sameDay = d.toDateString() === n.toDateString();
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  return sameDay ? `${hh}:${mm}` : `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function renderChat(toBottom) {
  const box = document.getElementById('chatList'); if (!box) return;
  if (!_chatMsgs.length) {
    box.innerHTML = '<div class="chat-empty">아직 대화가 없어요.<br>첫 메시지를 남겨보세요!</div>';
    return;
  }
  box.innerHTML = _chatMsgs.map(m => `
    <div class="chat-row ${m.mine ? 'mine' : ''}">
      ${m.mine ? '' : `<div class="chat-who">${esc(m.nick || '')}</div>`}
      <div class="chat-bubble" ${m.mine ? '' : `onclick="chatMenu(event,'${esc(m.id)}','${esc(m.idl)}','${esc(m.nick || '')}')"`}>${esc(m.text)}</div>
      <div class="chat-time">${chatTime(m.at)}</div>
    </div>`).join('');
  if (toBottom !== false) box.scrollTop = box.scrollHeight;
}

async function sendClanChat() {
  const input = document.getElementById('chatInput'); if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const btn = document.querySelector('.chat-send');
  if (btn) btn.disabled = true;                       // 연타 방지
  const r = await apiPost('/api/clan-chat-send', { token: authToken(), text });
  if (btn) btn.disabled = false;
  if (!r.ok) { toast('⚠️ ' + esc(r.error || '보내지 못했어요.')); return; }
  input.value = '';
  _chatMsgs.push({ ...r.msg, mine: true });
  renderChat();
  input.focus();
}

// 남의 메시지를 누르면 신고·차단 메뉴
let _chatMenuEl = null;
function closeChatMenu() { if (_chatMenuEl) { _chatMenuEl.remove(); _chatMenuEl = null; } }
function chatMenu(ev, msgId, idl, nick) {
  ev.stopPropagation();
  closeChatMenu();
  const el = document.createElement('div');
  el.className = 'chat-menu';
  el.innerHTML = `
    <button onclick="reportChat('${esc(msgId)}','${esc(nick)}')">🚩 신고하기</button>
    <button class="bad" onclick="blockChatUser('${esc(idl)}','${esc(nick)}')">🚫 ${esc(nick)} 차단</button>`;
  document.body.appendChild(el);
  const r = ev.currentTarget.getBoundingClientRect();
  el.style.left = Math.min(r.left, innerWidth - el.offsetWidth - 12) + 'px';
  el.style.top = Math.min(r.bottom + 4, innerHeight - el.offsetHeight - 12) + 'px';
  _chatMenuEl = el;
  setTimeout(() => document.addEventListener('click', closeChatMenu, { once: true }), 0);
}
function reportChat(msgId, nick) {
  closeChatMenu();
  askConfirm({ icon: '🚩', title: '이 메시지를 신고할까요?', desc: `${nick}님의 메시지가 운영자에게 전달돼요.`, yes: '신고', no: '취소' },
    async () => {
      const r = await apiPost('/api/chat-report', { token: authToken(), msgId, reason: '부적절한 내용' });
      toast(r.ok ? '🚩 신고했어요. 확인 후 조치할게요.' : '⚠️ ' + esc(r.error || '실패했어요.'));
    });
}
function blockChatUser(idl, nick) {
  closeChatMenu();
  askConfirm({ icon: '🚫', title: `${nick}님을 차단할까요?`, desc: '이 사람의 메시지가 보이지 않게 돼요. 언제든 해제할 수 있어요.', yes: '차단', no: '취소' },
    async () => {
      const r = await apiPost('/api/chat-block', { token: authToken(), idl, on: true });
      if (!r.ok) return toast('⚠️ ' + esc(r.error || '실패했어요.'));
      toast(`🚫 ${esc(nick)}님을 차단했어요.`);
      loadClanChat();
    });
}

function updateChatBadge() {
  const b = document.getElementById('clanChatBadge');
  if (b) { b.textContent = _chatUnread > 99 ? '99+' : _chatUnread; b.style.display = _chatUnread > 0 ? '' : 'none'; }
  const cb = document.getElementById('clanBadge');
  if (cb && _chatUnread > 0 && cb.style.display === 'none') {   // 로비 버튼에도 표시
    cb.textContent = _chatUnread > 99 ? '99+' : _chatUnread;
    cb.style.display = '';
  }
}

// 실시간 수신
socket.on('clan_chat', ({ msg }) => {
  if (!msg) return;
  _chatMsgs.push({ ...msg, mine: false });
  if (_chatMsgs.length > 80) _chatMsgs.shift();
  if (chatOpen()) { renderChat(); }
  else { _chatUnread++; updateChatBadge(); playSound('ping'); toast(`💬 <b>${esc(msg.nick || '')}</b> — ${esc(msg.text)}`, 2600); }
});
socket.on('clan_report', ({ nick }) => toast(`🚩 클랜 채팅 신고가 접수됐어요 (${esc(nick || '')})`, 3200));

async function renderClanBrowse(meta) {
  const { cost = 1000, coins = 0, minLevel = 5, myLevel = 1 } = meta || {};
  const body = document.getElementById('clanBody');
  body.innerHTML = `
    <div class="soc-tabs">
      <button class="soc-tab ${_clanTab === 'my' ? 'active' : ''}" onclick="clanSwitch('my')">클랜 찾기</button>
      <button class="soc-tab ${_clanTab === 'new' ? 'active' : ''}" onclick="clanSwitch('new')">클랜 만들기</button>
    </div>
    <div id="clanPane" style="margin-top:10px"><div class="soc-empty">불러오는 중…</div></div>`;
  const pane = document.getElementById('clanPane');

  if (_clanTab === 'new') {
    pane.innerHTML = `
      <p class="auth-hint" style="margin:0 0 9px">클랜을 만들면 클랜장이 됩니다. 클랜원은 최대 30명이에요.</p>
      <div class="soc-row" style="margin-bottom:7px">
        <input id="clanNameInput" class="soc-input" maxlength="12" placeholder="클랜 이름 (2~12자)" autocomplete="off">
      </div>
      <div class="soc-row">
        <input id="clanTagInput" class="soc-input" maxlength="4" placeholder="태그 (영문·숫자 2~4자)" autocomplete="off" style="text-transform:uppercase">
        <button class="btn btn-gold btn-sm" onclick="submitClanCreate()"
                ${(myLevel < minLevel || coins < cost) ? 'disabled style="opacity:.5"' : ''}>만들기</button>
      </div>
      <div class="clan-cost">
        레벨 ${minLevel} 이상 · 창설 비용 🪙${cost}<br>
        <span style="opacity:.8">현재 Lv.${myLevel} · 보유 🪙${coins}</span>
        ${myLevel < minLevel ? `<div style="color:#e08a8a;margin-top:5px">레벨 ${minLevel}이 되면 만들 수 있어요</div>`
          : coins < cost ? `<div style="color:#e08a8a;margin-top:5px">코인이 ${cost - coins} 모자라요</div>` : ''}
      </div>
      <p class="auth-hint" id="clanCreateMsg" style="margin:8px 0 0"></p>`;
    return;
  }

  const r = await apiPost('/api/clan-list', { token: authToken() });
  if (!r.ok || !r.clans.length) {
    pane.innerHTML = '<div class="soc-empty">아직 만들어진 클랜이 없어요.<br>첫 번째 클랜을 만들어보세요!</div>';
    return;
  }
  pane.innerHTML = `<div class="soc-list">${r.clans.map((c, i) => `
    <div class="soc-item">
      <div class="soc-info">
        <div class="soc-nick"><span class="soc-clan">#${i + 1}</span><span class="clan-tag">${esc(c.tag)}</span>${esc(c.name)}</div>
        <div class="soc-meta">${c.memberCount}/${c.max}명 · ${c.totalRp} RP · 클랜장 ${esc(c.ownerNick || '-')}</div>
      </div>
      <div class="soc-acts">${c.applied
        ? `<button class="soc-btn bad" onclick="clanCancelApply('${esc(c.id)}')">신청취소</button>`
        : `<button class="soc-btn good" onclick="clanApply('${esc(c.id)}')">가입신청</button>`}</div>
    </div>`).join('')}</div>`;
}

function clanSwitch(tab) { _clanTab = tab; loadClan(); }

async function submitClanCreate() {
  const name = document.getElementById('clanNameInput').value.trim();
  const tag = document.getElementById('clanTagInput').value.trim().toUpperCase();
  const msg = document.getElementById('clanCreateMsg');
  msg.textContent = '만드는 중…';
  const r = await apiPost('/api/clan-create', { token: authToken(), name, tag });
  if (!r.ok) { msg.innerHTML = `⚠️ ${esc(r.error || '실패했어요.')}`; return; }
  toast(`🛡️ [${esc(tag)}] ${esc(name)} 클랜을 만들었어요!`);
  if (myAccount) myAccount.coins = r.coins;
  renderAccount();
  loadClan();
}

async function clanApply(clanId) {
  const r = await apiPost('/api/clan-apply', { token: authToken(), clanId });
  if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
  toast(`✅ ${esc(r.clanName || '')} 클랜에 가입을 신청했어요.`);
  loadClan();
}
async function clanCancelApply(clanId) {
  await apiPost('/api/clan-cancel-apply', { token: authToken(), clanId });
  loadClan();
}
async function clanDecide(idl, accept) {
  const r = await apiPost('/api/clan-decide', { token: authToken(), idl, accept });
  if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
  if (r.accepted) toast(`🎉 ${esc(r.nick || '')}님이 클랜에 합류했어요!`);
  loadClan();
}
function clanKick(idl, nick) {
  askConfirm({ icon: '⚠️', title: `${nick}님을 추방할까요?`, desc: '클랜에서 즉시 제외됩니다.', yes: '추방', no: '취소' },
    async () => { const r = await apiPost('/api/clan-kick', { token: authToken(), idl });
      if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.')); loadClan(); });
}
function clanTransfer(idl, nick) {
  askConfirm({ icon: '👑', title: `${nick}님에게 클랜장을 넘길까요?`, desc: '이후에는 클랜을 관리할 수 없게 됩니다.', yes: '위임', no: '취소' },
    async () => { const r = await apiPost('/api/clan-transfer', { token: authToken(), idl });
      if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
      toast(`👑 ${esc(nick)}님이 새 클랜장이 되었어요.`); loadClan(); });
}
function clanEditNotice() {
  const cur = (document.querySelector('.clan-notice')?.textContent || '').replace(/^📢\s*/, '');
  const n = prompt('클랜 공지 (최대 60자)', cur);
  if (n === null) return;
  apiPost('/api/clan-notice', { token: authToken(), notice: n }).then(r => {
    if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
    loadClan();
  });
}
function clanLeave(isOwner) {
  askConfirm({ icon: '🚪', title: '클랜에서 탈퇴할까요?',
    desc: isOwner ? '클랜장 자리는 남은 클랜원 중 RP가 가장 높은 사람에게 넘어가요. 혼자라면 클랜이 해체됩니다.' : '언제든 다시 가입 신청할 수 있어요.',
    yes: '탈퇴', no: '취소' },
    async () => {
      const r = await apiPost('/api/clan-leave', { token: authToken() });
      if (!r.ok) return toast('⚠️ ' + (r.error || '실패했어요.'));
      toast(r.disbanded ? '클랜이 해체되었어요.' : '클랜에서 탈퇴했어요.');
      _clanTab = 'my'; loadClan();
    });
}

// 로비 버튼의 알림 배지 (받은 친구요청 / 클랜 가입신청)
async function updateSocialBadges() {
  if (!myAccount) {
    for (const id of ['friendBadge', 'clanBadge']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    return;
  }
  const setBadge = (id, n) => {
    const e = document.getElementById(id); if (!e) return;
    e.textContent = n > 99 ? '99+' : n;
    e.style.display = n > 0 ? '' : 'none';
  };
  const [f, c] = await Promise.all([
    apiPost('/api/friends', { token: authToken() }),
    apiPost('/api/clan', { token: authToken() }),
  ]);
  const nIn = f.ok ? f.reqIn.length : 0;
  setBadge('friendBadge', nIn);
  const tb = document.getElementById('ftabBadge');
  if (tb) { tb.textContent = nIn; tb.style.display = nIn > 0 ? '' : 'none'; }
  const applicants = (c.ok && c.clan && c.clan.isOwner) ? c.clan.applicantCount : 0;
  setBadge('clanBadge', applicants + _chatUnread);   // 가입 신청 + 안 읽은 채팅
}

// ── 칭호 (내 정보에서 관리) ──
async function renderMyTitles() {
  const box = document.getElementById('miTitles'); if (!box) return;
  const r = await apiPost('/api/titles', { token: localStorage.getItem('ff_auth') });
  if (r.error || !r.list) { box.innerHTML = ''; return; }
  box.innerHTML = '';
  r.list.forEach(t => {
    const on = r.equipped === t.id;
    const el = document.createElement('div');
    el.className = 'title-row' + (t.owned ? '' : ' locked') + (on ? ' on' : '');
    el.innerHTML = `<span class="tr-ico">${ico(t.icon, 'tr-art')}</span>
      <div class="tr-info"><div class="tr-name" style="color:${t.owned ? t.color : '#6a5a70'}">${esc(t.name)}</div>
      <div class="tr-cond">${esc(t.cond)}${t.owned ? '' : ` (${t.prog}/${t.goal})`}</div></div>
      <span class="tr-state">${on ? '장착 중 ' + ico('✅') : t.owned ? '장착' : ico('🔒')}</span>`;
    if (t.owned) el.onclick = async () => {
      const res = await apiPost('/api/equip-title', { token: localStorage.getItem('ff_auth'), titleId: on ? null : t.id });
      if (!res.error) { myAccount = res.profile; renderAccount(); renderMyTitles(); }
    };
    box.appendChild(el);
  });
}

// ── 최근 전적 ──

// ── 쿠폰 등록 ───────────────────────────────────────────────
async function submitCoupon() {
  const inp = document.getElementById('cpnInput');
  const msg = document.getElementById('cpnMsg');
  const code = (inp.value || '').trim();
  if (!code) { msg.className = 'cpn-msg err'; msg.textContent = '쿠폰 번호를 입력해주세요.'; return; }
  if (!myAccount) { msg.className = 'cpn-msg err'; msg.textContent = '로그인하면 쿠폰을 쓸 수 있어요.'; return; }
  msg.className = 'cpn-msg'; msg.textContent = '확인 중…';
  const res = await apiPost('/api/coupon', { token: localStorage.getItem('ff_auth'), code });
  if (res.error) { msg.className = 'cpn-msg err'; msg.textContent = '⚠️ ' + res.error; return; }
  msg.className = 'cpn-msg ok'; msg.textContent = `🪙 ${res.amount} 코인을 받았어요!`;
  inp.value = '';
  myAccount = res.profile;          // 서버가 계산한 잔액으로 갱신 (클라이언트 값은 신뢰하지 않는다)
  renderAccount();
  const sc = document.getElementById('shopCoins');
  if (sc) sc.textContent = '🪙 ' + (res.profile.coins ?? 0);
  playSound('setwin');
}

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
const CBP = { back_night: 'cb-night', back_gold: 'cb-gold', back_obang: 'cb-obang', back_ruby: 'cb-ruby', back_galaxy: 'cb-galaxy',
              back_crystal: 'cb-crystal', back_obsidian: 'cb-obsidian', back_hanji: 'cb-hanji' };
const TBLP = { tbl_blue: 'tp-blue', tbl_purple: 'tp-purple', tbl_gold: 'tp-gold', tbl_forest: 'tp-forest', tbl_crystal: 'tp-crystal', tbl_obsidian: 'tp-obsidian', tbl_hanji: 'tp-hanji' };
const CFP  = { face_neon: 'cfp-neon', face_classic: 'cfp-classic', face_gold: 'cfp-gold', face_crystal: 'cfp-crystal', face_obsidian: 'cfp-obsidian', face_hanji: 'cfp-hanji' };
// 상점 아이콘 = 게임 안 실물 미리보기 (카드백/테이블/카드앞면/명패/이모트/염색)
const shopIcon = it => {
  if (CBP[it.id])  return `<div class="shop-cbprev card back ${CBP[it.id]}"><span class="bf flip">FLIP</span><span class="bf flap">FLAP</span></div>`;
  if (TBLP[it.id]) return `<div class="shop-tblprev ${TBLP[it.id]}"></div>`;
  if (CFP[it.id])  return `<div class="shop-cfprev ${CFP[it.id]}"><i>1</i>6</div>`;
  if (it.type === 'plate' && NP_CLASS[it.id]) return `<span class="shop-npprev ${NP_CLASS[it.id]}">${it.id === 'np_daily' ? ico('🍀', 'np-clover') : ''}닉네임</span>`;
  if (it.type === 'emotes' && EMOTE_PACKS[it.id]) {
    // 미리보기 3종. emoteArt 가 있으면 그린 그림, 없으면 이모지 그대로.
    const prev = EMOTE_PACKS[it.id].slice(0, 3).map((e) => {
      const a = (typeof emoteArt === 'function') && emoteArt(e);
      const cls = 'em-one' + (e === '🫖' ? ' em-teabag' : '');
      return a ? `<span class="${cls}">${a}</span>` : `<span class="${cls}">${e}</span>`;
    }).join('');
    return `<span class="shop-emprev">${prev}</span>`;
  }
  if (it.type === 'dye')      return `<div class="shop-dyeprev"></div>`;
  if (it.type === 'dye_rare') return `<div class="shop-dyeprev rare"></div>`;
  return ico(it.icon, 'shop-ico');
};
// 장착 슬롯: 상점 타입 → 프로필 필드
// 상점 진열 순서 — 위에서부터 이 차례로 묶어 보여준다
const SHOP_GROUPS = [
  { name: '꾸미기·기타', types: ['dye', 'dye_rare', 'ticket'] },
  { name: '카드 뒷면', types: ['cardback'] },
  { name: '카드 앞면', types: ['cardface'] },
  { name: '테이블',   types: ['table'] },
  { name: '명패',     types: ['plate'] },
  { name: '이모트',   types: ['emotes'] },
];
// 서버(accounts.js SLOT)와 짝이 맞아야 한다. 한쪽만 고치면 장착이 안 된다.
const EQUIP_SLOT = {
  cardback: 'cardBack', plate: 'plate', table: 'table', cardface: 'cardFace',
  victory: 'victoryFx', avatar: 'avatar', stamp: 'winStamp', place: 'placeFx',
};
let shopSelId = null;
// 마일스톤 아이템은 보유/티켓 있을 때만 상점에 노출
function shopVisible() {
  const items = (myAccount && myAccount.items) || {};
  return (shopItems || []).filter(it => {
    if (it.id === 'np_lv50') return !!items.np_lv50;
    if (it.id === 'dye_rare') return (items.dye_rare_ticket || 0) > 0;
    return true;
  });
}
function renderShop() {
  document.getElementById('shopCoins').textContent = `🪙 ${myAccount ? myAccount.coins : 0}`;
  const list = document.getElementById('shopList');
  const vis = shopVisible();
  if (!vis.length) { list.innerHTML = '<div class="lb-empty">상점을 불러오지 못했어요. 잠시 후 다시 열어주세요.</div>'; return; }
  if (!shopSelId || !vis.some(x => x.id === shopSelId)) shopSelId = vis[0].id;
  list.innerHTML = '';
  // 종류별로 묶어 순서대로 놓는다. 예전엔 카탈로그에 적은 순서 그대로라
  // 카드백과 명패가 뒤섞여 뭘 고르는 화면인지 알기 어려웠다.
  const ordered = [];
  for (const g of SHOP_GROUPS) {
    const items = vis.filter((x) => g.types.includes(x.type));
    if (!items.length) continue;
    ordered.push({ head: g.name, count: items.length });
    for (const it of items) ordered.push(it);
  }
  // 어느 묶음에도 안 걸린 게 있으면 맨 뒤에 (새 종류를 넣고 분류를 깜빡했을 때)
  const known = new Set(SHOP_GROUPS.flatMap((g) => g.types));
  const rest = vis.filter((x) => !known.has(x.type));
  if (rest.length) { ordered.push({ head: '그 밖에', count: rest.length }); ordered.push(...rest); }

  ordered.forEach(it => {
    if (it.head) {
      const h = document.createElement('div');
      h.className = 'shop-head';
      h.textContent = it.head;
      list.appendChild(h);
      return;
    }
    const owned = myAccount.items && myAccount.items[it.id];
    const tile = document.createElement('div');
    tile.className = 'shop-tile' + (shopSelId === it.id ? ' sel' : '');
    let pr;
    if (it.type === 'dye_rare') pr = `<span class="pr own">확정권 x${(myAccount.items || {}).dye_rare_ticket || 0}</span>`;
    else if (EQUIP_SLOT[it.type] && owned) pr = `<span class="pr own">${myAccount[EQUIP_SLOT[it.type]] === it.id ? '장착 중' : '보유'}</span>`;
    else if (it.type === 'emotes' && owned) pr = `<span class="pr own">보유</span>`;
    else pr = `<span class="pr">🪙 ${it.price}</span>${it.type === 'ticket' && owned ? `<span class="pr own">x${owned}</span>` : ''}`;
    tile.dataset.id = it.id;
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
  if (it.type === 'dye_rare') {
    const n = (myAccount.items || {}).dye_rare_ticket || 0;
    btn.textContent = `사용하기 (확정권 x${n})`;
    btn.onclick = () => buyShopItem(it.id);
  } else if (EQUIP_SLOT[it.type] && owned) {
    const on = myAccount[EQUIP_SLOT[it.type]] === it.id;
    btn.textContent = on ? '장착 해제' : '장착하기';
    btn.onclick = () => equipBack(it.id, on, it.type);
  } else if (it.type === 'emotes' && owned) {
    btn.textContent = '보유 중 ✓'; btn.disabled = true; btn.className = 'shop-buy owned';
  } else {
    btn.textContent = `구매 🪙 ${it.price}`;
    btn.onclick = () => buyShopItem(it.id);
  }
}
function renderShopTiles() {   // 선택 표시만 갱신 (전체 재생성 없이)
  document.querySelectorAll('.shop-tile').forEach(t => t.classList.toggle('sel', t.dataset.id === shopSelId));
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
async function equipBack(itemId, isOn, kind) {
  const r = await apiPost('/api/equip', { token: localStorage.getItem('ff_auth'), itemId: isOn ? null : itemId, kind: kind || 'cardback' });
  if (r.error) { document.getElementById('shopMsg').textContent = '⚠️ ' + r.error; return; }
  myAccount = r.profile; renderShop(); renderAccount(); applyMySkins();   // 테이블/카드앞면 즉시 반영
}
// 파티 이모트 팩 — 보유 시 피커에 추가
const EMOTE_PACKS = {
  emote_party:  ['🤡','😈','💀','🎉','👑','🍀','💢','🫠'],
  emote_battle: ['⚔️','🛡️','😤','🤯','🥶','🎲','🎯','🏆'],
  emote_animal: ['🐶','🐱','🐷','🐸','🦊','🐻','🐤','🦄'],
  // 도발 팩 — 약을 올리되 선은 넘지 않게. 티백은 위아래로 흔들린다.
  emote_taunt:  ['🫖','👏','🥱','👎','🙄','👋','⌚','🤏'],
};
// data-ico="🎒" 같은 표식을 직접 그린 아이콘으로 채운다
// ── 카드 딜 연출 ────────────────────────────────────────────────────────────
// 덱에서 한 장씩 날아와 자리에 앉는다. 시작 위치를 덱의 실제 화면 좌표로 잡아야
// "덱에서 나왔다"는 느낌이 나고, 고정 오프셋일 때처럼 뚝뚝 끊겨 보이지 않는다.
// 카드가 이미 최종 위치에 놓인 뒤에 불러야 한다(부채꼴 transform 반영 후).
function dealFromDeck(deckEl, cardEls, opts) {
  const o = opts || {};
  const stagger = o.stagger === undefined ? 85 : o.stagger;
  const dur = o.duration === undefined ? 460 : o.duration;
  const cards = [...cardEls].filter(Boolean);
  if (!cards.length) return 0;
  let sx = null, sy = null;
  if (deckEl) {
    const d = deckEl.getBoundingClientRect();
    if (d.width) { sx = d.left + d.width / 2; sy = d.top + d.height / 2; }
  }
  cards.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.width && sx !== null) {
      el.style.setProperty('--dx', Math.round(sx - (r.left + r.width / 2)) + 'px');
      el.style.setProperty('--dy', Math.round(sy - (r.top + r.height / 2)) + 'px');
    }
    el.style.animationDelay = (i * stagger) + 'ms';
    el.style.animationDuration = dur + 'ms';
    el.classList.add('dealing');
    el.addEventListener('animationend', () => {
      // 끝나면 정리 — 합성 레이어를 계속 붙들고 있으면 이후 렌더가 무거워진다
      el.classList.remove('dealing');
      el.style.animationDelay = ''; el.style.animationDuration = '';
      el.style.removeProperty('--dx'); el.style.removeProperty('--dy');
    }, { once: true });
  });
  return (cards.length - 1) * stagger + dur;
}

// ── 하단 탭바 ──────────────────────────────────────────────────────────────
// 미션·상점·친구·클랜을 로비 본문에서 빼내 여기로 모았다. 각 탭은 기존 모달을
// 그대로 연다 — 화면을 새로 만들지 않아 동작이 바뀌지 않는다.
const NAV_ACTIONS = {
  home:    () => { closeAllNavModals(); },
  mission: () => openMissions(),
  shop:    () => openShop(),
  friends: () => openFriends(),
  clan:    () => openClan(),
};
function closeAllNavModals() {
  try { closeMissions(); } catch (_) {}
  try { closeShop(); } catch (_) {}
  try { closeFriends(); } catch (_) {}
  try { closeClan(); } catch (_) {}
}
function navGo(key) {
  const act = Object.prototype.hasOwnProperty.call(NAV_ACTIONS, key) ? NAV_ACTIONS[key] : null;
  if (!act) return;
  if (key !== 'home') closeAllNavModals();   // 탭끼리 겹쳐 열리지 않게
  act();
  navSync(key);
}
// 어떤 탭이 켜져 있는지 표시. 모달을 ESC·닫기로 끄면 다시 '홈'으로 돌아온다.
function navSync(key) {
  document.querySelectorAll('#navBar .nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === (key || 'home'));
  });
}
function navRefresh() {
  const open = (id) => { const e = document.getElementById(id); return e && e.classList.contains('show'); };
  navSync(open('missionModal') ? 'mission' : open('shopModal') ? 'shop'
        : open('friendsModal') ? 'friends' : open('clanModal') ? 'clan' : 'home');
}
// 모달은 여러 경로(ESC·바깥 클릭·닫기 버튼)로 닫히므로, 상태를 주기적으로 맞춘다.
setInterval(navRefresh, 400);

function paintIcons(root) {
  (root || document).querySelectorAll('[data-ico]').forEach(el => {
    if (el.dataset.done) return;
    const a = (typeof iconArt === 'function') && iconArt(el.dataset.ico);
    if (a) { el.innerHTML = a; el.classList.add('lbl-ico'); el.dataset.done = '1'; }
    else el.textContent = el.dataset.ico;
  });
}
function paintEmoteButtons() {
  document.querySelectorAll('#emotePicker .emo-b').forEach(b => {
    const e = b.dataset.e;
    const art = (typeof emoteArt === 'function') && emoteArt(e);
    b.innerHTML = art || e;
  });
}
function refreshEmotes() {
  const picker = document.getElementById('emotePicker'); if (!picker) return;
  paintEmoteButtons();
  picker.querySelectorAll('.emote-extra').forEach(b => b.remove());
  if (!myAccount || !myAccount.items) return;
  for (const [pack, emojis] of Object.entries(EMOTE_PACKS)) {
    if (!myAccount.items[pack]) continue;
    emojis.forEach(e => {
      // 기본 이모트와 같은 클래스를 준다 — 안 그러면 팩 이모트만 원시 이모지로 뜨고,
      // 정작 보낼 때는 그림이 날아가서 "누르기 전 그림과 실제가 다르다" 가 된다.
      const b = document.createElement('button');
      b.className = 'emo-b emote-extra';
      b.dataset.e = e;
      b.onclick = () => sendEmote(e);
      picker.appendChild(b);
    });
  }
  paintEmoteButtons();   // 새로 붙인 팩 버튼까지 그림으로 채운다
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
    const bot = (typeof AI_AVATAR !== 'undefined') ? AI_AVATAR : '🤖';
    body.innerHTML = `<span class="gp-rank gp-art">${bot}</span><span class="gp-nick">AI</span>`;
    if (stats) stats.innerHTML = `컴퓨터`;
  } else if (p.guest) {
    body.innerHTML = `<span class="gp-rank">👤</span><span class="gp-nick">${esc(p.nick)}</span>`;
    if (stats) stats.innerHTML = `게스트 (기록 없음)`;
  } else {
    body.innerHTML = `<span class="gp-rank gp-art" style="color:${p.rankColor}">${rankIco(p.rankIcon)}</span><span class="gp-nick${ncClass(p.nickColor)}${npClass(p.plate)}">${esc(p.nick)}</span><span class="gp-lv">Lv.${p.level}</span>`;
    if (stats) stats.innerHTML = (p.titleInfo ? titleTag(p.titleInfo) + ' · ' : '') + `<span style="color:${p.rankColor}">${esc(p.rank)}</span> · <b>${p.wins}승 ${p.losses}패</b> · 승률 ${p.winRate}%`;
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
    const item = document.createElement('div'); item.className = 'rl-item' + (r.live ? ' rl-live' : '');
    if (r.live) {
      // 진행 중인 게임 → 관전
      item.innerHTML = `<div class="rl-info"><div class="rl-name">🔴 ${esc(r.name)}</div><div class="rl-host">턴 ${r.turn}${r.specs ? ` · 👁 ${r.specs}` : ''}</div></div>`;
      const b = document.createElement('button'); b.className = 'btn btn-outline rl-join'; b.textContent = '👁 관전';
      b.onclick = () => socket.emit('spectate', { roomId: r.id });
      item.appendChild(b);
    } else {
      const lock = r.secret ? '<span class="rl-lock">🔒</span>' : '';
      item.innerHTML = `<div class="rl-info"><div class="rl-name">${lock}${esc(r.name)}</div><div class="rl-host">👤 ${esc(r.host)}</div></div>`;
      const b = document.createElement('button'); b.className = 'btn btn-gold rl-join'; b.textContent = '참가';
      b.onclick = () => joinRoomById(r.id, r.secret);
      item.appendChild(b);
    }
    el.appendChild(item);
  });
}

// ── 사운드 (Web Audio) ──────────────────────────────────────
const AC = new (window.AudioContext || window.webkitAudioContext)();
// 효과음 마스터 볼륨 (전체적으로 한 단계 낮춤)
const sfxGain = AC.createGain(); sfxGain.gain.value = 0.6; sfxGain.connect(AC.destination);
// mp3 원샷 샘플 (카드 내는 소리 등) — 디코드해서 낮은 지연으로 재생
const samples = {};
function loadSample(key, url) {
  fetch(url).then(r => r.arrayBuffer()).then(b => AC.decodeAudioData(b))
    .then(buf => { samples[key] = buf; }).catch(() => {});
}
loadSample('cardPlace', '/card-place.mp3?v=1');
function playSample(key, vol = 0.9, rate = 1) {
  const buf = samples[key]; if (!buf) return false;
  try {
    const s = AC.createBufferSource(); s.buffer = buf;
    s.playbackRate.value = rate + (Math.random() * 0.06 - 0.03);   // 살짝 랜덤 — 반복 시 기계적이지 않게
    const g = AC.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(sfxGain); s.start();
    return true;
  } catch (_) { return false; }
}
function tone(freq, type, vol, dur, delay = 0) {
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur);
}
// 사운드 설정 — BGM·효과음 개별 (기존 ff_sound=off는 둘 다 끈 것으로 마이그레이션)
const _legacyOff = localStorage.getItem('ff_sound') === 'off';
let bgmOff = localStorage.getItem('ff_bgm') != null ? localStorage.getItem('ff_bgm') === 'off' : _legacyOff;
let sfxOff = localStorage.getItem('ff_sfx') != null ? localStorage.getItem('ff_sfx') === 'off' : _legacyOff;
// 재즈 징글용 헬퍼 (BGM과 독립적으로 AC.destination에 바로 출력)
function jbrass(freq, delay, dur, vol, bendTo) {   // 뮤트 트럼펫 (원하면 끝에 피치 벤드)
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
  if (bendTo) o.frequency.exponentialRampToValueAtTime(bendTo, t + dur);
  lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 1;
  const lfo = AC.createOscillator(), lg = AC.createGain();
  lfo.frequency.value = 5.5; lg.gain.value = freq * 0.012; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.04);
  g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp); lp.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.05);
}
function jcym(delay, freq, dur, vol) {   // 심벌 크래시/히트
  const t = AC.currentTime + delay;
  const n = Math.floor(AC.sampleRate * 0.5), b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = AC.createBufferSource(); s.buffer = b;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.7;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp); bp.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.05);
}
function playSound(n) {
  if (sfxOff) return;
  try { AC.resume(); } catch(_) {}
  switch (n) {
    case 'select': tone(900,'sine',.06,.08); break;
    case 'place':  tone(320,'triangle',.12,.12); tone(240,'triangle',.08,.1,.06); break;   // 원래 카드 놓는 신스음
    case 'flip':   tone(520,'sine',.1,.1); tone(680,'sine',.08,.09,.08); break;
    case 'card':   if (!playSample('cardPlace', .9)) { tone(320,'triangle',.12,.12); } break;   // 실제 카드 mp3 — 경매 방식 선택 시
    case 'reveal': tone(440,'sawtooth',.06,.05); tone(660,'sine',.14,.18,.06); tone(880,'sine',.1,.2,.15); break;
    // 졸개의 배신 — 살금살금 크로매틱 워크 + 날카로운 스탭 ("걸렸어" 느낌)
    case 'special':[110,116.5,123.5,130.8].forEach((f,i)=>tone(f,'triangle',.14,.1,i*.08));
                   jbrass(587.33,.34,.5,.16); jcym(.34,6000,.35,.06); break;
    // 승리 — 블루지 상행 릭 + 밝은 6/9 스탭 (원래 버전)
    case 'victory':[440,523,659,784].forEach((f,i)=>jbrass(f,i*.1,.16,.12));
                   jbrass(880,.4,.7,.16); [440,554,659,740].forEach(f=>tone(f,'sine',.08,.6,.42)); break;
    // 패배 — 뮤트 트럼펫 하강 + 마지막 음 처지는 벤드 (원래 버전)
    case 'defeat': jbrass(392,0,.4,.12); jbrass(349,.28,.4,.12); jbrass(294,.56,.9,.13,220); break;
    case 'deal':   tone(280,'sine',.05,.07); break;
    case 'bell':   [0,0.45].forEach(off => [1568,2093].forEach((f,i)=>tone(f,'sine',.2,1.2, off+i*.02))); break;
    case 'tick':   tone(1400,'square',.06,.05); break;
    // 세트 완성 — 재즈 6th로 마무리하는 밝은 상행
    case 'setwin': [523,659,784,880].forEach((f,i)=>jbrass(f,i*.08,.14,.11));
                   jbrass(1047,.32,.5,.14); [523,659,784,880].forEach(f=>tone(f,'sine',.06,.5,.34)); break;
    case 'ping':   tone(1046,'sine',.16,.16); tone(1568,'sine',.12,.22,.09); break;
    case 'emote':  tone(760,'sine',.1,.12); break;
  }
}

// ── 배경음악 (카지노 재즈 mp3 루프) ──
// Web Audio 그래프로 라우팅 → GainNode로 볼륨 제어 (iOS에서 audio.volume이 안 먹는 문제 해결)
// + 효과음보다 낮게 밸런스
const BGM_VOL = 0.20;
let bgmAudio = null, bgmOn = false, bgmGain = null;
function setBgmVolume(v, ramp = 0.2) {
  if (bgmGain) bgmGain.gain.linearRampToValueAtTime(v, AC.currentTime + ramp);
  else if (bgmAudio) bgmAudio.volume = v;   // Web Audio 연결 실패 시 폴백
}
function startBGM() {
  if (bgmOn) return;
  bgmOn = true;
  // AAC(m4a, 절반 용량) 우선 — 미지원 브라우저만 mp3 폴백. ?v 갱신 = 캐시 우회
  const canM4a = document.createElement('audio').canPlayType('audio/mp4; codecs="mp4a.40.2"');
  bgmAudio = new Audio(canM4a ? '/bgm.m4a?v=3' : '/bgm.mp3?v=2');   // v3 = 80kbps 재인코딩
  bgmAudio.loop = true;
  bgmAudio.crossOrigin = 'anonymous';
  try {
    AC.resume();
    const src = AC.createMediaElementSource(bgmAudio);
    bgmGain = AC.createGain();
    bgmGain.gain.value = bgmOff ? 0 : BGM_VOL;
    src.connect(bgmGain); bgmGain.connect(AC.destination);
  } catch (e) { bgmAudio.volume = bgmOff ? 0 : BGM_VOL; }   // 폴백: 엘리먼트 볼륨
  const tryPlay = () => bgmAudio.play().catch(() => {});
  tryPlay();
  if (bgmAudio.paused) {   // 자동재생 차단 → 첫 상호작용에서 재생
    const kick = () => { try { AC.resume(); } catch (_) {} tryPlay(); document.removeEventListener('pointerdown', kick); };
    document.addEventListener('pointerdown', kick, { once: true });
  }
}
// ── 인게임 설정 패널 (배경음악 / 효과음 / 가이드) ──
let guideOff = localStorage.getItem('ff_guide') === 'off';
function applySettings() {   // 저장된 상태를 화면·오디오에 반영
  setBgmVolume(bgmOff ? 0 : BGM_VOL);
  const sb = document.getElementById('statusBar'); if (sb) sb.style.display = guideOff ? 'none' : '';
  const set = (id, on) => { const t = document.getElementById(id); if (t) t.classList.toggle('on', on); };
  set('togBgm', !bgmOff); set('togSfx', !sfxOff); set('togGuide', !guideOff);
}
function toggleSettings(force) {
  const p = document.getElementById('settingsPanel'); if (!p) return;
  const show = force === undefined ? !p.classList.contains('show') : force;
  p.classList.toggle('show', show);
  if (show) applySettings();
}
function toggleBgm() {
  bgmOff = !bgmOff; localStorage.setItem('ff_bgm', bgmOff ? 'off' : 'on');
  setBgmVolume(bgmOff ? 0 : BGM_VOL); applySettings();
}
function toggleSfx() {
  sfxOff = !sfxOff; localStorage.setItem('ff_sfx', sfxOff ? 'off' : 'on');
  applySettings(); if (!sfxOff) playSound('select');   // 켤 때 미리듣기
}
function toggleGuide() {
  guideOff = !guideOff; localStorage.setItem('ff_guide', guideOff ? 'off' : 'on');
  applySettings();
}
// 패널 바깥 클릭 시 닫기
document.addEventListener('pointerdown', e => {
  const p = document.getElementById('settingsPanel');
  if (p && p.classList.contains('show') && !e.target.closest('#settingsPanel') && !e.target.closest('#settingsBtn')) toggleSettings(false);
});
window.addEventListener('DOMContentLoaded', applySettings);   // 저장된 상태 반영
window.addEventListener('DOMContentLoaded', () => { try { paintEmoteButtons(); paintIcons(); } catch (_) {} });   // 기본 이모트·라벨 아이콘

// ── 게임 설명서 ─────────────────────────────────────────────
function toggleRules(show) {
  document.getElementById('rulesModal').style.display = show ? 'flex' : 'none';
}

// ── ESC 로 닫기 ─────────────────────────────────────────────
// 배경 클릭으로는 닫히는데 ESC 는 어디서도 안 먹어 일관성이 없었다.
// 각 모달의 전용 닫기 함수를 부른다 — 매칭 취소처럼 뒷정리가 필요한 게 있어서
// 단순히 show 클래스만 떼면 서버 상태와 어긋난다.
const ESC_TARGETS = [
  ['rulesModal',   () => toggleRules(false)],
  ['lbModal',      () => closeLb()],
  ['shopModal',    () => closeShop()],
  ['missionModal', () => closeMissions()],
  ['myInfoModal',  () => closeMyInfo()],
  ['friendsModal', () => closeFriends()],
  ['clanModal',    () => closeClan()],
  ['soloModal',    () => closeModePanels()],
  ['multiModal',   () => closeModePanels()],
  ['quadModal',    () => (typeof q4Close === 'function') && q4Close()],
  ['createModal',  () => closeCreate()],
  ['codeModal',    () => closeCode()],
  ['itemUseModal', () => closeItemUse()],
  ['matchModal',   () => cancelMatch()],       // 대기열에서도 빼야 한다
  ['confirmModal', () => confirmClose(false)], // 확인창은 대개 가장 위에 뜬다
  // nickModal 은 일부러 제외 — 닉네임을 정해야 넘어가는 단계라 ESC 로 건너뛰면 안 된다
];
const escIsOpen = (el) => !!el && (el.classList.contains('show') ||
  (el.style.display && el.style.display !== 'none'));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // 4인전 화면이면 그쪽 패널을 먼저 처리
  if (document.body.classList.contains('quad4')) {
    const p = document.getElementById('q-leftPanel');
    if (p && p.classList.contains('show')) { p.classList.remove('show'); e.preventDefault(); return; }
  }
  // 여러 개가 겹쳐 있으면 목록 뒤쪽(=위에 뜨는 것)을 먼저 닫는다
  let close = null;
  for (const [id, fn] of ESC_TARGETS) if (escIsOpen(document.getElementById(id))) close = fn;
  if (close) { close(); e.preventDefault(); }
});

// ── 이모트 ──────────────────────────────────────────────────
function toggleEmotes(force) {
  const p = document.getElementById('emotePicker');
  const show = force === undefined ? !p.classList.contains('show') : force;
  p.classList.toggle('show', show);
}
let emoteMuted = false;              // 상대 이모트 차단
let lastEmoteSent = 0;               // 로컬 쿨타임(서버와 동일 3초)
function toggleEmoteMute() {
  emoteMuted = !emoteMuted;
  const b = document.getElementById('emoteMuteBtn');
  if (b) { b.classList.toggle('muted', emoteMuted); b.textContent = emoteMuted ? '🔇 상대 차단됨' : '🔔 상대 이모트'; }
  toast(emoteMuted ? '🔇 상대 이모트를 차단했어요' : '🔔 상대 이모트를 다시 봐요', 1600);
}
function sendEmote(emoji) {
  const now = Date.now();
  if (now - lastEmoteSent < 3000) { toast('⏳ 이모트는 3초에 한 번만 보낼 수 있어요', 1400); return; }
  lastEmoteSent = now;
  socket.emit('emote', { emoji });
  showEmote(emoji, 'me');
  toggleEmotes(false);
}
socket.on('emote', ({ emoji }) => { if (!emoteMuted) showEmote(emoji, 'opp'); });
socket.on('emote_cooldown', () => { lastEmoteSent = Date.now(); });   // 서버 쿨타임 동기화
function showEmote(emoji, side) {
  playSound('emote');
  const b = document.createElement('div');
  b.className = 'emote-bubble';
  const art = (typeof emoteArt === 'function') && emoteArt(emoji);
  if (art) b.innerHTML = art; else b.textContent = emoji;   // 상점 팩 등 매핑 없는 건 이모지 그대로
  let x = window.innerWidth / 2, y = side === 'me' ? window.innerHeight - 160 : 120;
  // 내 이모티콘은 이모트 버튼 바로 위에서 뜸 (중앙 X). 상대 것은 상대 손패 근처
  const anchor = side === 'me'
    ? document.getElementById('emoteBtn')
    : document.getElementById('oppProfile');   // 상대 것도 프로필 쪽 사이드에 (중앙 X)
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    if (r.width) { x = r.left + r.width / 2; y = side === 'me' ? r.top - 44 : r.bottom + 8; }
  }
  b.style.left = (x - 20) + 'px'; b.style.top = y + 'px';
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 3100);
}

// ── 나가기 / 재대결 ─────────────────────────────────────────
function goLobby() { clearSession(); fastReload(); }
// 예쁜 확인 다이얼로그 (기본 confirm 대체)
let _confirmCb = null;
let _confirmNoCb = null;
function askConfirm({ icon = '❓', title, desc = '', yes = '확인', no = '취소' }, cb, noCb) {
  _confirmNoCb = noCb || null;
  // 대화상자 아이콘도 우리가 그린 그림으로. 예전엔 textContent 라 시스템 이모지가
  // 그대로 떴다 — 나가기 문이 유독 밋밋해 보이던 게 이것 때문이다.
  const cf = document.getElementById('cfIcon');
  const art = (typeof iconArt === 'function') && iconArt(icon);
  if (art) { cf.innerHTML = art; cf.classList.add('cf-art'); }
  else { cf.textContent = icon; cf.classList.remove('cf-art'); }
  document.getElementById('cfTitle').textContent = title;
  document.getElementById('cfDesc').textContent = desc;
  document.getElementById('cfYes').textContent = yes;
  document.getElementById('cfNo').textContent = no;
  _confirmCb = cb;
  document.getElementById('confirmModal').classList.add('show');
}
function confirmClose(ok) {
  document.getElementById('confirmModal').classList.remove('show');
  const cb = _confirmCb, ncb = _confirmNoCb; _confirmCb = null; _confirmNoCb = null;
  if (ok && cb) cb();
  else if (!ok && ncb) ncb();
}
function exitGame() {
  askConfirm({ icon: '🚪', title: '게임에서 나갈까요?', desc: isVsBot ? 'AI 대전은 언제든 다시 시작할 수 있어요.' : '진행 중인 게임은 몰수패로 처리될 수 있어요.', yes: '나가기', no: '계속하기' },
    () => { socket.emit('leave_room'); goLobby(); });
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
  if (!s || isSpec) return false;
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
  // ── 1부: 게임 소개 (대형 안내 — 화면 중앙) ──
  { id: 'intro', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">FLIP FLAP에 온 걸 환영해요! ${ico('🎩', 'tut-ico')}</div>
      <b>경매</b>로 카드를 모아 <b>세트</b>를 먼저 완성하면 승리하는 게임이에요.`,
    cards: `<div class="tut-cards" style="margin-top:14px"><span class="tcard k3"><i>1</i>3</span><span class="tcard k3"><i>2</i>3</span><span class="tcard k3"><i>4</i>3</span><span class="tvs">=</span><span class="twin">3짜리 3장 모으면 승리! ${ico('🏆', 'tut-ico')}</span></div>` },
  { id: 'cards1', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">카드 읽는 법 🃏</div>`,
    cards: `<div class="tut-arrows">
      <span class="ta-card">
        <span class="tcard k6 big"><i>1</i>6</span>
        <span class="ta-note ta-grade"><span class="ta-txt"><b>작은 숫자 = 등급</b><small>1등급이 최강</small></span></span>
        <span class="ta-note ta-kind"><span class="ta-txt"><b>큰 숫자 = 종류</b><small>이만큼 모으면 승리!</small></span></span>
      </span></div>` },
  { id: 'cards2', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">카드는 4종류, 총 24장 🗂</div>
      숫자가 <b>작을수록 강하고 희귀</b>해요. 2짜리는 단 2장만 모으면 이기지만, 세상에 2장뿐!`,
    cards: `<div class="tut-cards" style="margin-top:12px">
        <span class="tcard k2"><i>1</i>2</span><span class="tcard k3"><i>1</i>3</span><span class="tcard k4"><i>1</i>4</span><span class="tcard k6"><i>1</i>6</span></div>
      <div class="tut-cards" style="margin-top:4px;font-size:.72rem;color:#c8a86a"><span>2장</span><span style="margin-left:18px">5장</span><span style="margin-left:18px">7장</span><span style="margin-left:18px">10장</span></div>
      <div class="tut-cards" style="margin-top:8px"><span class="tcard k2"><i>1</i>2</span><span class="tvs">&gt;</span><span class="tcard k6"><i>1</i>6</span><span class="twin">배팅에선 2가 6을 이겨요</span></div>` },
  { id: 'flow', when: s => s.phase === 'pick', big: true,
    text: `<div class="tut-h">게임은 이렇게 흘러가요 🔄</div>
      <div class="tut-steps">
        <div>1️⃣ <b>진행자</b>가 중앙덱에서 카드 1장 공개</div>
        <div>2️⃣ 진행자가 손패 1장을 추가로 출품 → <b>경매품 2장</b></div>
        <div>3️⃣ 두 사람 모두 손패에서 1장씩 <b>배팅</b></div>
        <div>4️⃣ 더 <b>강한 카드</b>를 낸 사람이 경매품을 다 가져감!</div>
        <div>5️⃣ 이렇게 <b>낙찰받은 카드로만</b> 세트 완성 (손패는 세트 불인정!)</div>
      </div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">직접 해보면 금방 알아요. 시작!</div>` },
  // ── 2부: 실전 연계 (액션 안내) ──
  { id: 'pick', when: s => s.phase === 'pick' && s.pick && s.pick.myChoice == null,
    pos: 'bot', target: '#auctionItems',
    text: '먼저 <b>선공 뽑기</b>!',
    act:  '반짝이는 두 장 중 <b>한 장을 탭</b>하세요 — 강한 카드를 뽑으면 선공!' },
  { id: 'pickr', when: s => s.phase === 'pick_reveal',
    pos: 'bot',
    text: '카드 공개! 강한 카드를 뽑은 쪽이 첫 <b>경매 진행자</b>가 돼요. (진행자는 매 턴 교대)' },
  { id: 'draw_me', when: s => s.phase === 'draw' && s.auctioneer === s.myIndex,
    pos: 'bot', target: '#deckStack',
    text: '이번 턴 진행자는 <b>나</b>! 경매품부터 공개해볼까요?',
    act:  '왼쪽 <b>덱을 탭</b>!' },
  { id: 'offer_me', when: s => s.phase === 'offer' && s.auctioneer === s.myIndex,
    pos: 'top', target: '#myHand',
    text: '중앙 카드가 공개됐어요! 이제 <b>내 손패 1장</b>을 추가로 출품 — 이 2장이 경매품이 돼요.',
    act:  '아래 손패에서 <b>내놓을 카드를 탭</b>하세요' },
  { id: 'type_big', when: s => s.phase === 'choose_type' && s.auctioneer === s.myIndex, big: true,
    text: `<div class="tut-h">경매 방식을 골라요 🎭</div>
      <div class="tut-two">
        <div class="tt-p"><b>👁 오픈</b><br>경매품 <b>공개</b><br>배팅 <b>비밀</b><br><small>서로 얼마 낼지 몰라 눈치싸움</small></div>
        <div class="tt-p"><b>🙈 클로즈</b><br>출품카드 <b>비밀</b><br>배팅 <b>공개</b><br><small>뭐가 걸렸는지 몰라 도박</small></div>
      </div>` },
  { id: 'type_me', when: s => s.phase === 'choose_type' && s.auctioneer === s.myIndex,
    pos: 'top', target: '#actionArea',
    act:  '원하는 방식을 <b>탭</b>하세요', text: '' },
  { id: 'bid_me', when: s => s.phase === 'bidding' && s.auction && !s.auction.myBid && (s.auctioneer === s.myIndex || s.auction.oppBidSubmitted),
    pos: 'top', target: '#myHand',
    text: '<b>배팅!</b> 강한 카드를 낸 사람이 경매품 2장을 다 가져가요. ⚠️ 배팅한 카드는 <b>서로 교환</b>돼요.',
    act:  '손패에서 카드 탭 → <b>배팅 확정</b>' },
  { id: 'reveal', when: s => s.phase === 'reveal',
    pos: 'top',
    text: '두구두구… 결과 공개! 이긴 쪽이 경매품을 <b>자기 앞에</b> 깔아요.' },
  { id: 'acquired', when: s => tutSeen.reveal && ((s.myAcq || []).length > 0 || (s.oppAcq || []).length > 0) && s.phase !== 'reveal',
    pos: 'top',
    text: '🎯 방금 딴 카드가 <b>테이블 앞에</b> 깔렸죠? <b>이렇게 깔린 카드로만</b> 세트를 만들 수 있어요 — 손에 든 카드는 세트가 안 돼요!' },
  { id: 'draw_opp', when: s => s.phase === 'draw' && s.auctioneer !== s.myIndex,
    pos: 'bot',
    text: '이번 턴 진행자는 <b>상대</b>예요. 곧 배팅 차례가 오니 잠깐만 ☕' },
  // ── 3부: 비밀 병기 (마지막 규칙) ──
  { id: 'betray_rule', when: s => tutSeen.reveal && s.turn >= 2, big: true,
    text: `<div class="tut-h">마지막 비밀 하나 ⚔️</div>
      가장 약한 <b>6-10</b>이 딱 하나, 가장 강한 <b>2-1</b>만은 이겨요.<br>이름하여 <b>졸개의 배신</b>!`,
    cards: `<div class="tut-cards" style="margin-top:12px"><span class="tcard k6"><i>10</i>6</span><span class="tvs">⚔</span><span class="tcard k2"><i>1</i>2</span><span class="tvs">→</span><span class="twin">6-10 승리!</span></div>
      <div style="margin-top:8px;font-size:.78rem;color:#c8a86a">상대가 에이스를 낼 타이밍에 노려보세요 😏</div>` },
  { id: 'betray',   // 실제로 6-10이나 2-1이 내 손에 들어온 순간 리마인드
    when: s => tutSeen.betray_rule && (s.myHand || []).some(c => (c.kind === 6 && c.grade === 10) || (c.kind === 2 && c.grade === 1)),
    pos: 'top',
    text: (s => (s.myHand || []).some(c => c.kind === 6 && c.grade === 10)
      ? '👀 지금 손에 <b>6-10</b>이 있어요 — 상대가 2-1을 낼 것 같으면 <b>배신</b>을 노려보세요!'
      : '👀 지금 손에 <b>2-1</b>이 있어요 — 최강이지만 <b>6-10</b>한테만 져요. 조심!') },
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
  box.classList.remove('pos-top', 'pos-bot', 'pop', 'big');
  if (st.big) box.classList.add('big');
  else box.classList.add('pos-' + (st.pos || 'top'));
  box.style.display = 'block';
  void box.offsetWidth;           // 애니메이션 재시작
  box.classList.add('pop');
  tutOpen = true;
  tutGlowFor(st);
  // 체크포인트: 확인 누를 때까지 서버 진행 보류 + 게임 입력 차단
  socket.emit('tut_hold');
  tutBlock(true, !!st.big);
}
// 설명 읽는 동안 게임판 클릭 방지 (박스의 버튼은 눌림)
function tutBlock(on, dark) {
  let b = document.getElementById('tutBlocker');
  if (!b) {
    b = document.createElement('div'); b.id = 'tutBlocker';
    b.style.cssText = 'position:fixed;inset:0;z-index:50;cursor:pointer;transition:background .25s';
    b.onclick = () => tutConfirm();   // 아무 곳이나 탭해도 다음으로
    document.body.appendChild(b);
  }
  b.style.background = dark ? 'rgba(5,2,4,.6)' : 'rgba(0,0,0,.15)';   // 대형 안내는 배경 집중
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
  if (!tutOpen) return;                                    // 중복 탭 방지
  tutOpen = false;
  if (tutQueue.length) return tutShow(tutQueue.shift());   // 밀린 설명이 있으면 이어서 (보류 유지)
  document.getElementById('tutBox').style.display = 'none';
  tutBlock(false);
  socket.emit('tut_release');   // 체크포인트 통과 → 게임 진행 재개
  tutTick();                    // 같은 화면에 이어질 다음 설명 (카드 읽기 → 목표 → 뽑기)
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
  // 친구에게 도전장을 보내려던 참이면 방 코드가 나온 지금 전송
  if (_pendingChallenge) {
    socket.emit('challenge_friend', { idl: _pendingChallenge, roomId });
    _pendingChallenge = null;
  }
});

// ── 친구·클랜 실시간 알림 ──
// ※ 이벤트명 주의: 'challenged'/'challenge_*'는 관전자→승자 도전이 이미 사용 중이라 friend_ 접두어로 분리했다.
socket.on('friend_challenge_sent', ({ nick }) => toast(`⚔️ ${esc(nick || '친구')}님에게 도전장을 보냈어요!`));
socket.on('friend_challenge_fail', msg => toast('⚠️ ' + esc(msg || '도전장을 보내지 못했어요.')));
socket.on('friend_challenge', ({ from, roomId, password }) => {
  playSound('ping');
  askConfirm(
    { icon: '⚔️', title: `${from}님의 도전장!`, desc: '친구가 대전을 신청했어요. 지금 바로 대결할까요?', yes: '수락하고 입장', no: '나중에' },
    () => socket.emit('join_room', { roomId, pid: PID, nick: getNick(), password: password || '' }));
});
socket.on('friend_req',   ({ nick }) => { toast(`👥 ${esc(nick || '')}님이 친구 요청을 보냈어요!`); updateSocialBadges(); });
socket.on('friend_added', ({ nick }) => { toast(`🎉 ${esc(nick || '')}님과 친구가 되었어요!`); updateSocialBadges(); });
socket.on('clan_apply',   ({ nick }) => { toast(`🛡️ ${esc(nick || '')}님이 클랜 가입을 신청했어요!`); updateSocialBadges(); });
socket.on('clan_joined',  ({ clan }) => { toast(`🎉 ${esc(clan || '')} 클랜에 가입되었어요!`); updateSocialBadges(); });
socket.on('clan_kicked',  ({ clan }) => { toast(`😢 ${esc(clan || '')} 클랜에서 추방되었어요.`); updateSocialBadges(); });
socket.on('clan_disbanded', () => { toast('클랜이 해체되었어요.'); updateSocialBadges(); });
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
// 로비 친구 초대 — 카톡(우선)/공유 시트로 사이트 링크 보내기 (내 초대 코드 포함 → 둘 다 +100)
function inviteFriend() {
  const refQ = myAccount && !myAccount.guest ? `?ref=${encodeURIComponent(myAccount.id)}` : '';
  const url = `${location.origin}${location.pathname}${refQ}`;
  const text = refQ
    ? '🃏 FLIP FLAP 같이 한 판 하자!\n내 초대 링크로 가입하면 우리 둘 다 🪙100 코인!'
    : '🃏 FLIP FLAP 같이 한 판 하자!\n경매·블러핑 심리전 카드 보드게임 🎴';
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

// ── 관전자 도전 (관전 → 대전 전환) ──
function specChallenge(btn) {
  socket.emit('spec_challenge', { nick: getNick() });
  if (btn) { btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = '⚔️ 도전장 전송 — 수락 대기…'; }
}
socket.on('challenged', ({ nick }) => {
  playSound('ping');
  askConfirm({ icon: '⚔️', title: `${nick}님의 도전장!`, desc: '관전하던 유저가 대전을 신청했어요. 받아들일까요?', yes: '받아들인다!', no: '거절' },
    () => socket.emit('challenge_accept'),
    () => socket.emit('challenge_decline'));
});
socket.on('spec_challenge_fail', () => {
  toast('😢 상대가 도전을 받지 않았어요', 2500);
  const b = document.querySelector('#goStats button'); if (b) { b.disabled = false; b.style.opacity = '1'; b.textContent = '⚔️ 승자에게 도전하기'; }
});

socket.on('error', msg => alert(msg));
socket.on('game_start', ({ vsBot, difficulty: diff, roomId, nicks, profiles, spectate, itemMode }) => {
  isVsBot = vsBot;
  isSpec = !!spectate;
  isItemMode = !!itemMode;
  document.body.classList.toggle('item-mode', isItemMode);   // 아이템전 전용 톤
  gameNicks = nicks || null;
  gameProfiles = profiles || null;
  if (roomId && !isSpec) saveSession(roomId);   // 관전은 재접속 세션 저장 안 함
  // 관전 모드: 이모트 숨김 + 관전 배너
  const ew = document.getElementById('emoteWrap'); if (ew) ew.style.display = isSpec ? 'none' : '';
  // 재대결/매칭/재접속 대비 초기화
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('matchModal').classList.remove('show');
  closeModePanels();   // 열려 있던 솔로/멀티 팝업 닫기 (관전 진입 등)
  hideGrace();
  document.getElementById('rematchNote').textContent = '';
  const gr = document.getElementById('goRewards'); if (gr) { gr.textContent = ''; gr.style.display = 'none'; }
  const rb = document.getElementById('rematchBtn'); if (rb) { rb.disabled = false; rb.style.opacity = '1'; }
  prevPhase = null; selectedBidCard = null; prevMyAction = false; stopTitleBlink();
  seenAcq.myAcq = new Set(); seenAcq.oppAcq = new Set(); boardCelebrated = false; lastSig = {};
  needsDeal = !isSpec;   // 게임 시작 시 손패를 한 장씩 나눠주는 딜 모션 (1회)
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'flex';
  document.body.classList.add('ingame');   // 게임 중 화면 스크롤 잠금
  applyMySkins();   // 내 테이블/카드앞면 스킨 적용
  // AI면 프로필 아래 난이도 배지, 사람이면 숨김
  const de = document.getElementById('cpuDiff');
  if (vsBot) { de.style.display = ''; de.textContent = { easy:'쉬움', normal:'보통', hard:'어려움', expert:'전문가' }[diff] || diff; }
  else de.style.display = 'none';
  playSound('deal');
  startBGM();
});
let drewNow = false;
socket.on('state_update', s => {
  // 관전자 상태 → 플레이어 화면 형태로 변환 (아래=P1, 위=P2)
  if (s.spec) {
    s = {
      ...s, myIndex: 1,
      myHand: [], myAcq: s.p1Acq, oppAcq: s.p2Acq, oppHandLen: s.p2HandLen,
      auction: s.auction ? {
        centerCard: s.auction.centerCard, offeredCard: s.auction.offeredCard, auctionType: s.auction.auctionType,
        myBid: s.auction.p1Bid, oppBid: s.auction.p2Bid,
        myBidSubmitted: s.auction.p1Submitted, oppBidSubmitted: s.auction.p2Submitted,
      } : null,
      pick: s.pick ? { myChoice: s.pick.choices[0], oppChoice: s.pick.choices[1], cards: s.pick.cards } : null,
    };
  }
  const prev = prevPhase;
  const changed = s.phase !== prevPhase;
  drewNow = prev === 'draw' && s.phase === 'offer';
  // 정산 순간(reveal → 다음): 화면에 있는 카드들의 출발 위치를 렌더 전에 기록
  const flight = (prev === 'reveal' && s.phase !== 'reveal' && state && state.auction)
    ? captureSettleFlight(state) : null;
  prevPhase = s.phase; state = s; myIndex = s.myIndex;
  render(changed);
  renderItems(s);
  if (flight) playSettleFlight(flight);
  tutTick();
  if (changed && s.phase === 'reveal') { playSound('reveal'); if (!isSpec && s.auction) screenFx(myBidWins(s.auction.myBid, s.auction.oppBid) ? 'auc-win' : 'reveal'); }
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
let needsDeal = false;   // 게임 시작 딜 모션 1회 플래그
function localSet(acq) {
  if (!acq) return null;
  const c = {}; for (const x of acq) c[x.kind] = (c[x.kind] || 0) + 1;
  for (const k of [2, 3, 4, 6]) if ((c[k] || 0) >= k) return k;
  return null;
}

// ── 정산 카드 비행 — 2단계 연출: ① 낙찰품→승자 더미 ② 배팅 카드 교환 ──
function captureSettleFlight(old) {
  const a = old.auction;
  if (!a || !a.myBid || !a.oppBid) return null;
  const rectOf = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
  const iWin = myBidWins(a.myBid, a.oppBid);
  const legs = [];
  // 1단계 — 경매품 2장 (중앙 매트) → 승자 더미
  const prizeEls = document.querySelectorAll('#auctionItems .card');
  const prizeCards = [a.centerCard, a.offeredCard];
  prizeEls.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.width && prizeCards[i]) legs.push({ kind: 'prize', card: prizeCards[i], from: r, destSel: `#${iWin ? 'myAcq' : 'oppAcq'} .card[data-id="${prizeCards[i].id}"]`, fallback: iWin ? '#myAcq' : '#oppAcq' });
  });
  // 2단계 — 배팅 카드 교환 (상대 배팅→내 손 / 내 배팅→상대 손)
  const oppR = rectOf('#oppBid .card'), myR = rectOf('#myBid .card');
  if (oppR) legs.push({ kind: 'bid', card: a.oppBid, from: oppR, destSel: `#myHand .card[data-id="${a.oppBid.id}"]`, fallback: '#myHand' });
  if (myR) legs.push({ kind: 'bid', card: a.myBid, from: myR, destSel: null, fallback: '#oppHand' });
  return legs.length ? legs : null;
}
let flightUntil = 0;   // 정산 비행이 끝나는 시각 — 세트 축하는 이 뒤에
function playSettleFlight(legs) {
  if (document.hidden) return;                        // 백그라운드 탭 — 연출 스킵 (최적화)
  flightUntil = Date.now() + 850;
  // 모든 고스트를 먼저 만들어 붙이고 (리플로우 1회) transition-delay로 순차 출발
  const active = [];
  let prizeN = 0;
  for (const leg of legs) {
    const destEl = leg.destSel && document.querySelector(leg.destSel);
    const target = destEl || document.querySelector(leg.fallback);
    if (!target) continue;
    const tr = target.getBoundingClientRect();
    if (!tr.width && !tr.height) continue;
    const ghost = makeCard(leg.card);
    ghost.classList.add('fly-card');
    ghost.style.left = leg.from.left + 'px'; ghost.style.top = leg.from.top + 'px';
    ghost.style.width = leg.from.width + 'px'; ghost.style.height = leg.from.height + 'px';
    document.body.appendChild(ghost);
    // 1박자: 낙찰품 2장 나란히(0·80ms, ~530ms 완료) → 완전히 끝난 뒤 2박자: 배팅 교환(620ms~)
    const delay = leg.kind === 'prize' ? (prizeN++) * 80 : 620;
    let dx = (tr.left + tr.width / 2) - (leg.from.left + leg.from.width / 2);
    let dy = (tr.top + tr.height / 2) - (leg.from.top + leg.from.height / 2);
    let scale = destEl ? Math.max(tr.width / leg.from.width, 0.4) : 0.8;
    const fade = !destEl;
    if (fade) { dx *= 0.45; dy *= 0.45; }             // 내 배팅: 상대 손 방향으로 밀려나며 페이드 — 화면 가로지르는 교차 제거
    if (destEl) {
      destEl.style.visibility = 'hidden';             // 도착 카드는 착지까지 숨김 (이중 표시 방지)
      destEl.style.animation = 'none';                // 자체 낙하·바운스(acquireIn) 취소 — 비행이 도착을 대신함
    }
    active.push({ ghost, destEl, delay, dx, dy, scale, fade });
  }
  if (!active.length) return;
  void document.body.offsetWidth;                     // 시작 위치 확정 (리플로우 1회)
  for (const f of active) {
    f.ghost.style.transitionDelay = `${f.delay}ms`;
    f.ghost.style.transform = `translate(${f.dx}px, ${f.dy}px) scale(${f.scale})`;
    if (f.fade) f.ghost.style.opacity = '0';
    // 비행이 끝나는 그 프레임에 실제 카드로 교체 — 멈칫거림 없이 이어짐
    let done = false;
    const finish = () => { if (done) return; done = true;
      if (f.destEl) {
        f.destEl.style.visibility = '';
        f.destEl.classList.remove('anim-acquire');   // 낙하 애니 클래스 제거 후
        f.destEl.style.animation = '';               // 인라인 none 해제 — 이게 남으면 .set-win 클래스 애니가 무시됨(세트 일부만 반짝이던 원인)
      }
      f.ghost.remove(); };
    f.ghost.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, f.delay + 700);                // 안전망 (탭 전환 등으로 이벤트 유실 시)
  }
  playSound('deal');
  setTimeout(() => playSound('deal'), 630);           // 교환 박자에 맞춰 한 번 더
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
socket.on('game_over', ({ winner, setKind, timeout, byProgress, forfeit, myIndex: mi, spec, nicks }) => {
  if (spec) {   // 관전자: 중립 결과 화면
    const title = document.getElementById('goTitle'), desc = document.getElementById('goDesc');
    title.textContent = '게임 종료'; title.style.color = '#c8a000';
    desc.textContent = winner === 0 ? '무승부!' : `🏆 ${(nicks && nicks[winner - 1]) || 'P' + winner} 승리!`;
    document.getElementById('goStats').innerHTML = winner !== 0
      ? `<button class="btn btn-gold" style="width:auto" onclick="specChallenge(this)">⚔️ 승자에게 도전하기</button>` : '';
    const rb = document.getElementById('rematchBtn'); if (rb) rb.style.display = 'none';
    setTimeout(() => document.getElementById('gameOver').style.display = 'flex', 800);
    return;
  }
  clearSession(); stopTitleBlink(); hideGrace(); recordResult(winner, mi);
  if (tutorial) {   // 튜토리얼 마무리 인사 + 완료 보상(코인 100, 최초 1회만)
    tutorial = false; tutQueue = []; tutOpen = false; tutClearGlow();
    const baseTip = '🎓 <b>튜토리얼 완료!</b> 이제 규칙을 다 배웠어요. 💡 덱이 다 떨어지면 <b>세트에 가장 가까운 사람</b>이 이겨요. 실전에서 친구와 붙어보세요!';
    tutShow({ pos: 'top', text: baseTip });   // 아무 곳이나 탭(블로커)·알겠어요 둘 다 tutConfirm으로 닫힘
    const tk = localStorage.getItem('ff_auth');
    if (tk) {
      apiPost('/api/tutorial-done', { token: tk }).then(r => {
        if (r && r.profile) { myAccount = r.profile; renderAccount(); }
        if (r && r.claimed) {   // 실제로 지급된 첫 완료에만 보상 안내 (재플레이 시엔 표시 안 함)
          const box = document.getElementById('tutText');
          if (box && tutOpen) box.innerHTML = baseTip + '<br><span style="color:#ffd94a">🎁 완료 보상 🪙 +' + r.amount + ' 지급!</span>';
          toast(`🎁 튜토리얼 완료 보상 <b style="color:#ffd94a">🪙 +${r.amount}</b>!`, 3500);
        }
      }).catch(() => {});
    }
  }
  const title = document.getElementById('goTitle'), desc = document.getElementById('goDesc');
  let delay = 500;
  if (winner === 0) {
    title.textContent = '무승부'; title.style.color = '#c8a86a'; title.style.textShadow = 'none';
    desc.textContent = '세트 근접도가 완전히 같아요!';
  } else if (winner === mi) {
    title.textContent = '🏆 승리!'; title.style.color = '#ffd94a'; title.style.textShadow = '0 0 24px rgba(255,215,80,.45)';
    desc.textContent = forfeit ? '상대가 게임을 떠났어요 — 몰수승!'
      : timeout ? '상대 시간 초과!'
      : byProgress ? `세트 근접 승리! (${setKind}짜리에 가장 가까웠어요)`
      : `${setKind}짜리 세트 완성!`;
    playSound('victory');
    if (setKind && !byProgress && !forfeit) { celebrateSet('myAcq', setKind); playSound('setwin'); delay = 1400; }
    else animateWinCards();
  } else {
    title.textContent = '패배...'; title.style.color = '#9a8a90'; title.style.textShadow = 'none';
    desc.textContent = forfeit ? '접속이 끊겨 몰수패 처리됐어요.'
      : timeout ? '시간 초과...'
      : byProgress ? '상대가 세트에 더 가까웠어요.'
      : `상대가 ${setKind}짜리 세트를 완성했어요.`;
    playSound('defeat');
    screenFx('lose');
    if (setKind && !byProgress && !forfeit) { celebrateSet('oppAcq', setKind); delay = 1400; }
  }
  renderGameOverStats(winner, byProgress ? null : setKind, mi);
  // 게스트가 이겼으면 회원 전환 유도
  if (!myAccount && winner === mi) {
    const lost = isVsBot ? (difficulty === 'expert' ? 40 : difficulty === 'easy' ? 5 : 15) : 60;
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
  // 세트 카드가 전부 '착지해 보이는' 상태가 된 뒤 전체를 한 번에 반짝
  const need = { 2: 2, 3: 3, 4: 4, 6: 6 }[kind] || kind;
  let tries = 0;
  const poll = () => {
    const cards = [...document.querySelectorAll(`#${containerId} .pile-group[data-kind="${kind}"] .card`)];
    const landed = cards.filter(c => c.style.visibility !== 'hidden');   // 비행 중(숨김)인 카드는 아직
    if (landed.length >= need || tries >= 25) {
      cards.forEach((c, i) => {
        c.style.visibility = '';
        c.classList.remove('anim-acquire');
        c.style.animation = '';                     // 인라인 none 잔재 해제 (클래스 애니 차단 방지)
        if (!c.classList.contains('set-win')) setTimeout(() => c.classList.add('set-win'), i * 70);
      });
      return;
    }
    tries++; setTimeout(poll, 100);
  };
  poll();
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
  // 캐시된 state.time도 동기화 — 카드 클릭 등 로컬 재렌더가 낡은 시간으로 되돌리는 버그 방지
  if (state && state.time) { state.time[1] = t1; state.time[2] = t2; }
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
// 화면 전체 이펙트 — 승리(골드 플래시+반짝), 패배(어두워짐), 경매낙찰(짧은 플래시)
let _fxEl = null;
function screenFx(kind) {
  if (!_fxEl) { _fxEl = document.createElement('div'); _fxEl.id = 'screenFx'; document.body.appendChild(_fxEl); }
  const el = _fxEl;
  el.className = ''; void el.offsetWidth;
  el.className = 'fx-' + kind;
  const g = document.getElementById('game');
  if (g) { g.classList.remove('shake-win', 'shake-lose'); void g.offsetWidth; g.classList.add(kind === 'win' ? 'shake-win' : kind === 'lose' ? 'shake-lose' : 'shake-win'); setTimeout(() => g.classList.remove('shake-win', 'shake-lose'), 700); }
  setTimeout(() => { el.className = ''; }, kind === 'win' ? 1100 : 800);
}

// 내 테이블/카드앞면 스킨을 게임 화면에 적용 (내 시야 기준 코스메틱)
const TABLE_CLS = { tbl_blue: 'tbl-blue', tbl_purple: 'tbl-purple', tbl_gold: 'tbl-gold', tbl_forest: 'tbl-forest', tbl_crystal: 'tbl-crystal', tbl_obsidian: 'tbl-obsidian', tbl_hanji: 'tbl-hanji' };
const FACE_CLS  = { face_neon: 'cf-neon', face_classic: 'cf-classic', face_gold: 'cf-gold', face_crystal: 'cf-crystal', face_obsidian: 'cf-obsidian', face_hanji: 'cf-hanji' };
function applyMySkins() {
  const g = document.getElementById('game'); if (!g) return;
  g.classList.remove('tbl-blue', 'tbl-purple', 'tbl-gold', 'tbl-forest', 'tbl-crystal', 'tbl-obsidian', 'tbl-hanji',
                     'cf-neon', 'cf-classic', 'cf-gold', 'cf-crystal', 'cf-obsidian', 'cf-hanji');
  const p = myAccount;
  if (p && TABLE_CLS[p.table]) g.classList.add(TABLE_CLS[p.table]);
  if (p && FACE_CLS[p.cardFace]) g.classList.add(FACE_CLS[p.cardFace]);
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
  el.dataset.id = card.id;   // 정산 비행 애니메이션의 도착 지점 탐색용
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
    // 최강·최약 표식도 직접 그린 그림으로 (없으면 원래 문자로 되돌아간다)
    const art = is21(card) ? rankIco('👑') : ico('⚔️', 'c-mark-ico');
    if (art && art.indexOf('<') === 0) mk.innerHTML = art; else mk.textContent = is21(card) ? '👑' : '⚔';
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
  document.getElementById('game').classList.toggle('showdown', s.phase === 'showdown');
  if (s.time) updateClocks(s.time[1], s.time[2], s.active);
  // 닉네임 + 프로필 표시
  if (gameNicks) {
    const oppN = gameNicks[s.myIndex === 1 ? 1 : 0], myN = gameNicks[s.myIndex === 1 ? 0 : 1];
    const oel = document.getElementById('oppNickLabel'); if (oel && oppN) oel.textContent = oppN;
    const mel = document.getElementById('myNickLabel'); if (mel && myN) mel.textContent = myN;
  }
  if (gameProfiles) {   // 프로필은 게임 중 안 바뀜 → 1회만 그림
    const psig = s.myIndex + '|' + JSON.stringify(gameProfiles);
    if (lastSig.prof !== psig) {
      lastSig.prof = psig;
      renderGameProfile('oppProfile', gameProfiles[s.myIndex === 1 ? 1 : 0]);
      renderGameProfile('myProfile',  gameProfiles[s.myIndex === 1 ? 0 : 1], true);
    }
  }

  // 배팅 순서: 진행자 먼저 → 내가 배팅할 차례인지
  const myTurnToBid = s.phase === 'bidding' && a && !a.myBid && (mine || a.oppBidSubmitted);

  const think = t => `<span class="thinking-dots">${t}<span>.</span><span>.</span><span>.</span></span>`;
  const biddingMsg = () => {
    if (a?.myBid) return (isVsBot && !a.oppBidSubmitted) ? think('AI 배팅 중') : '배팅 완료 — 대기 중...';
    if (myTurnToBid) return (a && a.auctionType === 'closed' ? '🙈 클로즈(배팅 공개)' : '👁 오픈(배팅 비밀)') + ' — 손패에서 배팅 카드 선택!';
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
    showdown: '⚔️ 배팅 완료 — 곧 공개!', reveal: '결과 공개!', settled: '카드 정산 중…', game_over: '게임 종료',
  };
  const bar = document.getElementById('statusBar');
  let msg = msgs[s.phase] ?? s.phase;
  if (isSpec) {   // 관전 문구 (중립 시점)
    const an = (gameNicks && gameNicks[s.auctioneer - 1]) || '진행자';
    msg = ({ pick: '👁 선공 뽑는 중…', pick_reveal: `⚡ ${an} 선공!`, draw: `👁 ${an} 카드 뽑는 중`,
      offer: `👁 ${an} 출품 중`, choose_type: `👁 ${an} 경매 방식 선택 중`, bidding: '👁 배팅 중…',
      showdown: '⚔️ 배팅 완료 — 곧 공개!', reveal: '결과 공개!', game_over: '게임 종료' })[s.phase] || '👁 관전 중';
  }
  if (lastSig.status !== msg) {   // 같은 문구면 건드리지 않음 (깜빡임·리플로우 방지)
    lastSig.status = msg;
    if (changed) { bar.style.opacity = '0'; setTimeout(() => { bar.innerHTML = msg; bar.style.opacity = '1'; }, 150); }
    else bar.innerHTML = msg;
  }

  renderDeck();
  renderOppHand(s.oppHandLen, s.fx && s.fx.peek);
  renderPile('oppAcq', s.oppAcq);
  renderPile('myAcq', s.myAcq);
  renderAuction(changed);
  renderHand();
}

// 중앙덱 스택
function drawCard() {
  const s = state;
  if (!s || isSpec || s.phase !== 'draw' || s.auctioneer !== s.myIndex) return;
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
  el.classList.toggle('drawable', !isSpec && s.phase === 'draw' && s.auctioneer === s.myIndex);
}

// 상대의 카드백 스킨 (프로필에 장착 정보가 실려옴).
// 표를 따로 두지 않고 상점용(CBP)을 그대로 쓴다 — 예전엔 두 벌이라
// 새 카드백을 상점에만 등록하고 인게임 표를 깜빡해서, 사 놓고도 판에서는
// 기본 뒷면이 나왔다.
const CB_CLASS = CBP;
function oppBackClass() {
  const p = gameProfiles && gameProfiles[myIndex === 1 ? 1 : 0];
  return (p && CB_CLASS[p.cardBack]) || null;
}
function makeOppBack() {
  const c = makeCard(null);
  const cls = oppBackClass(); if (cls) c.classList.add(cls);
  return c;
}
function makeMyBack() {   // 내 비공개 배팅(오픈 경매) — 내 카드백 스킨
  const c = makeCard(null);
  const p = gameProfiles && gameProfiles[myIndex - 1];
  const cls = p && CB_CLASS[p.cardBack]; if (cls) c.classList.add(cls);
  return c;
}

// 상대 손패 = 뒷면 카드 부채꼴 (내 패보다 작게)
// 돋보기로 엿본 카드가 있으면 앞쪽 몇 장을 반투명 앞면으로 바꿔, 뒷면 너머로 비쳐 보이게 한다.
function renderOppHand(n, peek) {
  const sig = n + '|' + (peek ? peek.map(c => c.id).join(',') : '');
  if (lastSig.oppHand === sig) return; lastSig.oppHand = sig;   // 장수·엿본 카드 그대로면 스킵
  const el = document.getElementById('oppHand'); el.innerHTML = '';
  const seen = (peek || []).slice(0, n);
  for (let i = 0; i < n; i++) {
    const slot = document.createElement('div'); slot.className = 'fan-slot';
    if (seen[i]) {
      const c = makeCard(seen[i], { reveal: true });
      c.classList.add('peeked');
      slot.appendChild(c);
    } else {
      slot.appendChild(makeOppBack());
    }
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
  // 상대(위) 손패는 더 촘촘하고 완만한 아치, 내(아래) 손패는 넓고 시원한 부채꼴
  const stepMax = isTop ? 5 : 6.5;
  const spreadCap = isTop ? 26 : 36;
  const liftUnit = isTop ? 3.4 : 5;
  const overlap = isTop ? -9 : -7;
  const spread = Math.min((n - 1) * stepMax, spreadCap);
  const step = n > 1 ? spread / (n - 1) : 0;
  const mid = (n - 1) / 2;
  slots.forEach((slot, i) => {
    const ang = (-spread / 2 + i * step) * (isTop ? -1 : 1);
    const dist = Math.abs(i - mid);
    const lift = (mid - dist) * liftUnit;          // 중앙 카드가 더 솟음
    const y = isTop ? lift : -lift;
    slot.style.transformOrigin = isTop ? 'center top' : 'center bottom';
    slot.style.transform = `rotate(${ang}deg) translateY(${y}px)`;
    slot.style.zIndex = String(i + 1);   // 오른쪽 카드가 항상 왼쪽 카드 위에 (자연스러운 손패 겹침)
    slot.style.margin = '0 ' + overlap + 'px';
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
      if (!isSpec && s.phase === 'pick' && p.myChoice == null && !isOpp) {
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

  if (s.phase === 'choose_type' && mine && !isSpec) {
    const row = document.createElement('div'); row.className = 'btn-row';
    const bo = document.createElement('button'); bo.className = 'btn btn-gold btn-sm'; bo.textContent = '오픈 경매';
    bo.title = '경매품 공개 · 배팅 비공개'; bo.onclick = () => { playSound('card'); socket.emit('choose_auction', { type: 'open' }); };
    const bc = document.createElement('button'); bc.className = 'btn btn-ink btn-sm'; bc.textContent = '클로즈 경매';
    bc.title = '경매품 비공개 · 배팅 공개'; bc.onclick = () => { playSound('card'); socket.emit('choose_auction', { type: 'closed' }); };
    row.appendChild(bo); row.appendChild(bc); action.appendChild(row);
  }

  // 안내 문구는 매트 아래 statusBar가 담당 — 여기엔 확정 버튼만 (중복 제거)
  const myTurnToBid = !isSpec && s.phase === 'bidding' && !a.myBid && (mine || a.oppBidSubmitted);
  if (myTurnToBid && selectedBidCard) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-gold btn-sm'; btn.style.marginTop = '10px';
    btn.textContent = `${selectedBidCard.kind}번 (${selectedBidCard.grade}등급) 배팅 확정`;
    btn.onclick = () => { playSound('place'); socket.emit('submit_bid', { cardId: selectedBidCard.id }); selectedBidCard = null; };
    action.appendChild(btn);
  }

}
// 배팅 카드를 각자 앞에 배치
function bidSlot(label, card, { back = false, reveal = false, mine = false } = {}) {
  const w = document.createElement('div'); w.className = 'bid-slot';
  const l = document.createElement('div'); l.className = 'bid-lbl'; l.textContent = label;
  w.appendChild(l);
  if (card)       w.appendChild(makeCard(card, { reveal }));
  else if (back)  w.appendChild(mine ? makeMyBack() : makeOppBack());   // 비공개 배팅 — 각자 카드백 스킨
  else { const e = document.createElement('div'); e.className = 'bid-empty'; w.appendChild(e); }
  return w;
}
function renderBids() {
  const s = state, a = s.auction;
  const my = document.getElementById('myBid'), opp = document.getElementById('oppBid');
  my.innerHTML = ''; opp.innerHTML = '';
  if (!a || (s.phase !== 'bidding' && s.phase !== 'showdown' && s.phase !== 'reveal')) return;
  const isReveal = s.phase === 'reveal';

  // 라벨: 관전이면 닉네임, 아니면 내/상대
  const myLbl = isSpec ? ((gameNicks && gameNicks[0]) || 'P1') + ' 배팅' : '내 배팅';
  const opLbl = isSpec ? ((gameNicks && gameNicks[1]) || 'P2') + ' 배팅' : '상대 배팅';

  // 내(아래) 배팅 — 오픈 경매는 뒤집어 내는 것: 확정 후엔 내 것도 뒷면, 리빌에서 앞면으로 뒤집힘
  const myTurnBid = !isSpec && s.phase === 'bidding' && !a.myBid && (s.auctioneer === s.myIndex || a.oppBidSubmitted);
  const hideMyBid = a.auctionType === 'open' && !isReveal && !isSpec;
  if (a.myBid && hideMyBid)    my.appendChild(bidSlot(myLbl + ' ✓', null, { back: true, mine: true }));
  else if (a.myBid)            my.appendChild(bidSlot(myLbl, a.myBid, { reveal: isReveal && !!a.myBid }));
  else if (myTurnBid && selectedBidCard) my.appendChild(bidSlot('내 배팅 (선택 중)', selectedBidCard, {}));
  else if (isSpec && a.myBidSubmitted) my.appendChild(bidSlot(myLbl + ' ✓', null, { back: true }));
  else                         my.appendChild(bidSlot(myLbl, null));

  // 상대(위) 배팅 — 서버가 공개 여부 결정 (클로즈=즉시 / 오픈=reveal)
  const ol = `${opLbl}${a.oppBidSubmitted ? ' ✓' : ''}`;
  if (a.oppBid)            opp.appendChild(bidSlot(ol, a.oppBid, { reveal: isReveal }));
  else if (a.oppBidSubmitted) opp.appendChild(bidSlot(ol, null, { back: true }));
  else                    opp.appendChild(bidSlot(opLbl, null));

  // 공개 시 이긴 쪽 배팅 카드에 WIN 스탬프
  if (isReveal && a.myBid && a.oppBid) {
    const iWin = myBidWins(a.myBid, a.oppBid);
    const slot = (iWin ? my : opp).querySelector('.bid-slot');
    if (slot) {
      slot.classList.add('bid-winner');
      const st = document.createElement('span'); st.className = 'win-stamp'; st.textContent = 'WIN';
      slot.appendChild(st);
    }
  }
}

function renderHand() {
  const s = state, a = s.auction, el = document.getElementById('myHand');
  // 관전: 아래(P1) 손패를 뒷면으로만 표시
  if (isSpec) {
    const n = s.p1HandLen || 0;
    if (lastSig.hand === 'spec' + n) return; lastSig.hand = 'spec' + n;
    el.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const slot = document.createElement('div'); slot.className = 'fan-slot';
      slot.appendChild(makeCard(null)); el.appendChild(slot);
    }
    fanRow(el, false);
    return;
  }
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
  const deal = needsDeal && hand.length >= 6;   // 첫 손패 완성 시 딜 모션
  el.innerHTML = '';
  hand.forEach((card, i) => {
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
  if (deal) {
    needsDeal = false;
    // 부채꼴을 잡은 뒤에 딜을 건다 — 그래야 각 카드의 최종 위치를 알 수 있다
    const STAGGER = 85;
    dealFromDeck(document.getElementById('deckStack'), el.querySelectorAll('.card'), { stagger: STAGGER });
    // 사운드도 같은 간격으로 — 예전엔 75ms 라 화면(70ms)과 조금씩 어긋났다
    for (let i = 0; i < hand.length; i++) setTimeout(() => playSound('deal'), 40 + i * STAGGER);
  }
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
const isAndroid = () => /Android/.test(navigator.userAgent);
const isSamsung = () => /SamsungBrowser/.test(navigator.userAgent);
const showInstallBtn = () => { if (!isStandalone()) { const b = document.getElementById('installBtn'); if (b) b.style.display = ''; } };
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  showInstallBtn();
});
(function initInstallBtn() {
  // 설치 안 된 상태면 항상 버튼 노출 — 갤럭시(삼성인터넷)는 beforeinstallprompt가
  // 아예 안 오거나 늦게 와서, 이벤트만 기다리면 버튼이 영영 안 뜸
  if (!isStandalone()) showInstallBtn();
})();
async function installApp() {
  const b = document.getElementById('installBtn');
  if (deferredInstall) {
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    deferredInstall = null;
    if (outcome === 'accepted' && b) b.style.display = 'none';
  } else if (isIOS()) {
    alert('아이폰 설치 방법 📲\n\n1. Safari 아래쪽 공유 버튼(⬆️)을 누르고\n2. "홈 화면에 추가"를 선택하세요!\n\n홈 화면에 FLIP FLAP 앱이 생겨요.');
  } else if (isSamsung()) {
    alert('갤럭시 설치 방법 📲\n\n1. 화면 아래 메뉴(≡) 버튼을 누르고\n2. "현재 페이지 추가" → "홈 화면"을 선택하세요!\n\n(또는 주소창 오른쪽 다운로드 아이콘을 눌러도 돼요)');
  } else if (isAndroid()) {
    alert('안드로이드 설치 방법 📲\n\n브라우저 메뉴(⋮)를 누르고\n"앱 설치" 또는 "홈 화면에 추가"를 선택하세요!');
  } else {
    alert('브라우저 메뉴에서 "앱 설치"를 눌러 설치할 수 있어요!');
  }
}
window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  const b = document.getElementById('installBtn'); if (b) b.style.display = 'none';
});
